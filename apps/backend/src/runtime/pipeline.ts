import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline as streamPipeline } from 'node:stream/promises';
import { getRegion, isSupportedNodeVersion, parseDockerImage, planLimits, type DeployStage, type PlanId } from '@digitalycloud/shared';
import { ctx } from '../context';
import { withTransaction } from '../db/connection';
import { CapacityReservation, Deployment, Server, Service, Upload, type CapacityReservationDoc, type DeploymentDoc, type ServerDoc, type ServiceDoc, type UploadDoc } from '../db/models';
import { GithubError } from '../integrations/github';
import { addToOutbox, dispatchNow } from '../jobs/outbox';
import { deploymentsFinished } from '../infra/metrics';
import { deploymentDto } from '../serializers/deployment';
import { runtimeEnv } from '../modules/services/env.service';
import { publishService } from '../modules/services/publish';
import { installationFor } from '../modules/services/sources';
import { uploadLimits } from '../modules/uploads/uploads.service';
import { ArchiveError, buildContext } from './archive';
import { DOCKERFILE, dockerfileFor } from './build-plan';
import { planResources, promote, release, reserve } from './capacity';
import { DeployLog } from './deploy-log';
import { driverFor, type ContainerSpec, type RuntimeDriver } from './driver';
import { assertPublicRegistry } from './network-policy';

/** A deployment failure with a reason the user can act on (shown in the UI and notification). */
export class DeployError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DeployError';
  }
}

const PIDS: Record<PlanId, number> = { free: 128, starter: 256, pro: 512, business: 1024 };
const IMAGE_RETENTION_MS = 30 * 24 * 3600_000;
const BUILD_MEMORY_MB = 2048;

export const teamNetwork = (teamId: string) => `dgc-t-${teamId}`;
export const imageTagFor = (serviceId: string, number: number) => `${ctx().config.REGISTRY_URL ? `${ctx().config.REGISTRY_URL}/` : ''}dgc/${serviceId}:${number}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function containerUser(source: ServiceDoc['source']) {
  // Built images run as the image's `node` user; third-party images get a fixed unprivileged uid.
  return source === 'docker' ? ctx().config.RUNTIME_CONTAINER_USER : '1000:1000';
}

/** Container spec from a deployment's build config plus the service's current plan and env. */
export function specFor(opts: { svc: ServiceDoc; dep: Pick<DeploymentDoc, '_id' | 'number' | 'config'>; image: string; env: Record<string, string>; server: ServerDoc; role: 'candidate' | 'active'; storageEnforced: boolean }): ContainerSpec {
  const { svc, dep } = opts;
  const limits = planLimits(svc.type, svc.plan);
  return {
    name: `dgc-${svc._id}-d${dep.number}-${Math.random().toString(36).slice(2, 6)}`,
    image: opts.image,
    cmd: ['/bin/sh', '-c', dep.config.startCommand],
    env: opts.env,
    user: containerUser(svc.source),
    labels: {
      'dgc.managed': 'true',
      'dgc.service': svc._id,
      'dgc.team': svc.teamId,
      'dgc.deployment': dep._id,
      'dgc.role': opts.role,
      'dgc.env-version': String(svc.envVersion),
      'dgc.settings-version': String(dep.config.settingsVersion),
    },
    port: dep.config.port,
    hostIp: opts.server.privateIp,
    memoryMb: limits.ramLimitMb,
    nanoCpus: Math.round(limits.vcpu * 1e9),
    pidsLimit: PIDS[svc.plan],
    storageMb: opts.storageEnforced ? limits.storageLimitMb : null,
    network: teamNetwork(svc.teamId),
    ociRuntime: ctx().config.RUNTIME_OCI_RUNTIME ?? opts.server.capabilities.ociRuntime ?? null,
    stopTimeoutSec: ctx().config.STOP_TIMEOUT_SECONDS,
  };
}

/** Storage quotas must be enforceable on the host; only development may opt out explicitly. */
export function storageEnforced(server: ServerDoc) {
  if (server.capabilities.storageQuota) return true;
  if (ctx().config.RUNTIME_ALLOW_UNENFORCED_STORAGE && !ctx().config.production) return false;
  throw new DeployError('STORAGE_QUOTA_UNSUPPORTED', `${server.name} can’t enforce disk quotas, so it can’t run services. Contact support.`);
}

async function httpProbe(ip: string, port: number) {
  try {
    const res = await fetch(`http://${ip.includes(':') ? `[${ip}]` : ip}:${port}/`, { redirect: 'manual', signal: AbortSignal.timeout(2500) });
    await res.body?.cancel().catch(() => {});
    return res.status < 500;
  } catch {
    return false;
  }
}

/**
 * The process must stay up for the whole window (no exit, no restart). Services with a port must
 * also answer HTTP (any status below 500) before they receive traffic, with bounded retries.
 */
export async function healthCheck(driver: RuntimeDriver, containerId: string, port: number | null, server: ServerDoc, log: DeployLog) {
  const seconds = ctx().config.HEALTH_CHECK_SECONDS;
  const deadline = Date.now() + seconds * 1000;
  let httpOk = port === null;
  let hostPort: number | null = null;
  while (Date.now() < deadline) {
    const st = await driver.inspectContainer(containerId);
    if (!st || !st.running) throw new DeployError('HEALTH_CHECK_FAILED', `The process exited${st?.exitCode !== null && st?.exitCode !== undefined ? ` with code ${st.exitCode}` : ''}${st?.oomKilled ? ' because it ran out of memory' : ''} during the health check.`);
    if (st.restartCount > 0) throw new DeployError('HEALTH_CHECK_FAILED', 'The process restarted during the health check.');
    hostPort = st.hostPort;
    if (!httpOk && hostPort) {
      httpOk = await httpProbe(server.privateIp, hostPort);
      if (httpOk) log.step(`HTTP check passed on port ${port}`);
    }
    await sleep(Math.min(1000, Math.max(50, deadline - Date.now())));
  }
  for (let i = 0; !httpOk && i < 5; i++) {
    if (hostPort) httpOk = await httpProbe(server.privateIp, hostPort);
    if (!httpOk) await sleep(2000);
  }
  if (!httpOk) throw new DeployError('HEALTH_CHECK_FAILED', `Your service didn’t answer HTTP on port ${port}. Make sure it listens on the PORT environment variable.`);
  const final = await driver.inspectContainer(containerId);
  if (!final?.running) throw new DeployError('HEALTH_CHECK_FAILED', 'The process exited during the health check.');
  return { hostPort: final.hostPort, startedAt: final.startedAt ?? new Date() };
}

async function setStage(dep: DeploymentDoc, stage: DeployStage, extra: Partial<DeploymentDoc> = {}) {
  const updated = await Deployment.findOneAndUpdate({ _id: dep._id, status: 'building' }, { $set: { stage, ...extra } }).lean<DeploymentDoc>();
  if (updated) await ctx().hub.publish({ kind: 'team', id: dep.teamId }, 'deployment.updated', deploymentDto(updated));
  return updated;
}

async function assertCurrent(serviceId: string, generation: number) {
  const s = await Service.findOne({ _id: serviceId, lifecycle: 'active', opGeneration: generation }).lean<ServiceDoc>();
  if (!s) throw new DeployError('SUPERSEDED', 'A newer action on this service replaced this deployment.');
  return s;
}

interface RunState {
  server?: ServerDoc;
  driver?: RuntimeDriver;
  reservation?: CapacityReservationDoc;
  candidateId?: string;
  /** Previous container stopped for a singleton handoff (bots/workers), restored on failure. */
  handedOff?: { id: string; server: ServerDoc };
  image?: string;
  digest?: string | null;
}

/**
 * Runs one deployment. Safe to retry: leftovers of an interrupted attempt (candidate containers,
 * candidate reservation) are reused or removed, log numbering continues, and every commit is fenced
 * by the service's operation generation so a stale worker can never overwrite a newer result.
 */
export async function runDeployment(deploymentId: string, generation: number, attempt = 1, maxAttempts = 1) {
  const dep = await Deployment.findById(deploymentId).lean<DeploymentDoc>();
  if (!dep || dep.status !== 'building') return;
  const log = new DeployLog(dep);
  const started = Date.now();
  const state: RunState = {};
  try {
    let svc = await assertCurrent(dep.serviceId, generation);
    if (attempt > 1) log.step(`Retrying after an interruption (attempt ${attempt} of ${maxAttempts})`);
    await removeCandidates(dep);

    // 1. preparing ------------------------------------------------------------------------------
    await setStage(dep, 'preparing', { startedAt: dep.startedAt ?? new Date() });
    if (!ctx().config.capabilities.runtime) throw new DeployError('RUNTIME_NOT_CONFIGURED', 'No runtime hosts are configured on this platform yet.');
    if (svc.source !== 'docker' && !isSupportedNodeVersion(dep.config.nodeVersion)) {
      throw new DeployError('RUNTIME_UNSUPPORTED', `Node.js ${dep.config.nodeVersion} reached end-of-life. Choose Node.js 24 LTS or 22 LTS in Settings, then deploy again.`);
    }
    log.step('Preparing build environment');
    state.reservation = await reserveCandidate(svc, dep);
    state.server = (await Server.findById(state.reservation.serverId).lean<ServerDoc>())!;
    const enforced = storageEnforced(state.server);
    if (!enforced) log.step('Warning: disk quota is not enforced on this development host');
    state.driver = await driverFor(state.server);
    await state.driver.ping().catch(() => {
      throw new Error(`Runtime host ${state.server!.name} is unreachable`);
    });
    log.step(`Allocated ${state.server.name} (${getRegion(svc.regionId)?.city ?? svc.regionId})`);
    await state.driver.ensureNetwork(teamNetwork(svc.teamId), { 'dgc.managed': 'true', 'dgc.team': svc.teamId });

    // 2. pulling & 3. installing -----------------------------------------------------------------
    await assertCurrent(svc._id, generation);
    await setStage(dep, 'pulling');
    if (dep.rollbackOf && dep.imageRef) {
      log.step(`Using the retained build of deployment ${dep.rollbackOf}`);
      if (!(await state.driver.imageExists(dep.imageRef))) {
        if (!ctx().config.REGISTRY_URL) throw new DeployError('ROLLBACK_UNAVAILABLE', 'The build for this deployment is no longer available on this host.');
        await state.driver.pullImage(dep.imageRef, { timeoutMs: 600_000, onLog: (l) => log.line(l) });
      }
      state.image = dep.imageRef;
      state.digest = dep.imageDigest;
      await setStage(dep, 'installing');
      log.step('Skipping install: rolling back to an existing build');
    } else if (svc.source === 'docker') {
      const parsed = parseDockerImage(svc.repo);
      if (!parsed) throw new DeployError('SOURCE_INVALID', 'The image reference is invalid.');
      try {
        await assertPublicRegistry(parsed.registry);
      } catch {
        throw new DeployError('SOURCE_INVALID', 'Images must come from a public registry.');
      }
      log.step(`Pulling ${svc.repo}`);
      const pulled = await state.driver.pullImage(svc.repo, { timeoutMs: 900_000, onLog: (l) => log.line(l) }).catch((e: Error) => {
        throw new DeployError('PULL_FAILED', `Could not pull ${svc.repo}: ${/not found|manifest unknown|denied/i.test(e.message) ? 'image not found or not public' : 'registry error'}.`);
      });
      state.image = svc.repo;
      state.digest = pulled.digest;
      await setStage(dep, 'installing', { commit: (pulled.digest ?? pulled.imageId).replace(/^sha256:/, '').slice(0, 7), imageDigest: pulled.digest });
      log.step('Prebuilt image: no install step needed');
    } else {
      const tag = imageTagFor(svc._id, dep.number);
      const source = await openSource(svc, dep, log);
      await setStage(dep, 'installing', source.meta);
      log.step('Installing dependencies and building the image');
      let pm = 'npm';
      const context = buildContext(source.src, uploadLimits().archive, {
        stripPrefix: source.strip,
        extras: (rootFiles, read) => {
          const df = dockerfileFor({ nodeVersion: dep.config.nodeVersion as never, baseImages: ctx().config.nodeImages, rootFiles, packageJson: read('package.json') });
          pm = df.packageManager;
          return [{ path: DOCKERFILE, content: df.content }];
        },
      });
      try {
        await Promise.all([
          state.driver.buildImage(context.stream, tag, {
            dockerfile: DOCKERFILE,
            labels: { 'dgc.managed': 'true', 'dgc.service': svc._id, 'dgc.deployment': dep._id },
            memoryMb: BUILD_MEMORY_MB,
            timeoutMs: ctx().config.BUILD_TIMEOUT_SECONDS * 1000,
            onLog: (l) => log.line(l),
          }),
          context.done,
        ]);
      } catch (e) {
        if (e instanceof ArchiveError) throw new DeployError('SOURCE_INVALID', e.message);
        const err = await context.done.then(() => null, (x: unknown) => x);
        if (err instanceof ArchiveError) throw new DeployError('SOURCE_INVALID', err.message);
        if (/took too long/.test((e as Error).message)) throw new DeployError('BUILD_TIMEOUT', (e as Error).message);
        if (isInfraError(e)) throw e;
        throw new DeployError('BUILD_FAILED', 'The build failed. Check the build logs above.');
      } finally {
        await source.cleanup();
      }
      log.step(`Image built with ${pm}`);
      if (ctx().config.REGISTRY_URL) {
        log.step('Pushing the image to the registry');
        await state.driver.pushImage(tag, { onLog: (l) => log.line(l) });
      }
      state.image = tag;
      state.digest = null;
    }

    // 4. starting -------------------------------------------------------------------------------
    svc = await assertCurrent(svc._id, generation);
    await setStage(dep, 'starting');
    const env = await runtimeEnv(svc._id, { regionId: svc.regionId, deploymentId: dep._id, port: dep.config.port });
    log.setSecrets(env.secrets);
    const singleton = dep.config.port === null;
    if (singleton && svc.runtime) {
      const oldServer = await Server.findById(svc.runtime.serverId).lean<ServerDoc>();
      const oldState = oldServer ? await (await driverFor(oldServer)).inspectContainer(svc.runtime.containerId) : null;
      if (oldServer && oldState?.running) {
        log.step('Stopping the previous version (bots and workers run as a single instance)');
        await (await driverFor(oldServer)).stopContainer(svc.runtime.containerId, ctx().config.STOP_TIMEOUT_SECONDS);
        state.handedOff = { id: svc.runtime.containerId, server: oldServer };
      }
    }
    const spec = specFor({ svc, dep, image: state.image!, env: env.env, server: state.server, role: 'candidate', storageEnforced: enforced });
    state.candidateId = await state.driver.createContainer(spec);
    await state.driver.startContainer(state.candidateId);
    log.step(`Started: ${dep.config.startCommand}`);

    // 5. health_check ---------------------------------------------------------------------------
    await setStage(dep, 'health_check');
    log.step(`Waiting ${ctx().config.HEALTH_CHECK_SECONDS}s for the process to stay healthy`);
    const health = await healthCheck(state.driver, state.candidateId, dep.config.port, state.server, log);
    log.step('Health check passed');

    // Commit (fenced by generation) -------------------------------------------------------------
    const previous = svc.runtime;
    let outbox: string[] = [];
    const committed = await withTransaction(async (s) => {
      const cur = await Service.findOne({ _id: svc._id, lifecycle: 'active', opGeneration: generation }, null, { session: s }).lean<ServiceDoc>();
      if (!cur) throw new DeployError('SUPERSEDED', 'A newer action on this service replaced this deployment.');
      const now = new Date();
      await Service.updateOne(
        { _id: svc._id },
        {
          $set: {
            status: 'running',
            desiredState: 'running',
            startedAt: health.startedAt,
            runtime: {
              serverId: state.server!._id,
              containerId: state.candidateId!,
              containerName: spec.name,
              hostPort: health.hostPort,
              imageRef: state.image!,
              deploymentId: dep._id,
              envVersion: cur.envVersion,
              settingsVersion: dep.config.settingsVersion,
              plan: cur.plan,
              startedAt: health.startedAt,
            },
            route: dep.config.port !== null && health.hostPort ? { upstream: `http://${state.server!.privateIp}:${health.hostPort}`, deploymentId: dep._id, updatedAt: now } : null,
            activeDeploymentId: dep._id,
            lastSuccessfulDeploymentId: dep._id,
            activeOperation: null,
            resourceState: { status: 'applied', error: null, updatedAt: now },
            crash: { count: 0, windowStart: null, lastAt: null, backoffUntil: null },
          },
        },
        { session: s },
      );
      const finished = await Deployment.findOneAndUpdate(
        { _id: dep._id, status: 'building' },
        { $set: { status: 'success', stage: null, finishedAt: now, durationSec: Math.round((now.getTime() - started) / 1000), imageRef: state.image!, imageDigest: state.digest ?? null, serverId: state.server!._id, imageRetainedUntil: new Date(now.getTime() + IMAGE_RETENTION_MS) } },
        { session: s },
      ).lean<DeploymentDoc>();
      await promote(s, svc._id, state.reservation!._id);
      outbox = await addToOutbox(s, [{ topic: 'notify.deployment', payload: { deploymentId: dep._id, outcome: 'success' }, dedupeKey: `notify-deploy:${dep._id}:success` }]);
      return finished;
    });
    state.reservation = undefined;
    const candidate = state.candidateId;
    state.candidateId = undefined;
    deploymentsFinished.inc({ result: 'success' });
    log.step('Deployment successful');
    await log.close();
    await dispatchNow(ctx().queues, outbox);
    if (committed) await ctx().hub.publish({ kind: 'team', id: dep.teamId }, 'deployment.updated', deploymentDto(committed));
    await publishService(svc._id);

    // Retire the previous container: HTTP services drain after the route switch.
    if (previous && previous.containerId !== candidate) {
      if (!singleton) await sleep(ctx().config.ROUTE_DRAIN_SECONDS * 1000);
      const oldServer = await Server.findById(previous.serverId).lean<ServerDoc>();
      if (oldServer) {
        const d = await driverFor(oldServer);
        await d.stopContainer(previous.containerId, ctx().config.STOP_TIMEOUT_SECONDS).catch(() => {});
        await d.removeContainer(previous.containerId).catch(() => {});
      }
    }
    await deployPendingPush(svc._id);
  } catch (err) {
    const deployErr = err instanceof DeployError ? err : null;
    if (!deployErr && attempt < maxAttempts) {
      // Infrastructure problem: clean up this attempt and let the queue retry.
      ctx().log.warn({ err, deploymentId }, 'deployment attempt failed; retrying');
      log.line(`Platform error: ${(err as Error).message.slice(0, 200)}`);
      await cleanupAttempt(state, log);
      await log.close();
      throw err;
    }
    if (!deployErr) ctx().log.error({ err, deploymentId }, 'deployment failed with a platform error');
    const reason = deployErr?.message ?? 'The deployment failed because of a platform error. Please try again.';
    log.line(`Error: ${reason}`);
    await cleanupAttempt(state, log);
    await failDeployment(dep, generation, deployErr?.code ?? 'INTERNAL', reason, started, state.handedOff ? 'restored' : 'untouched', log);
  }
}

function isInfraError(e: unknown) {
  const msg = (e as Error)?.message ?? '';
  return /ECONNREFUSED|ECONNRESET|ETIMEDOUT|socket hang up|EPIPE|unreachable/i.test(msg);
}

async function reserveCandidate(svc: ServiceDoc, dep: DeploymentDoc) {
  const existing = await CapacityReservation.findOne({ deploymentId: dep._id, status: 'held', kind: 'candidate' }).lean<CapacityReservationDoc>();
  if (existing) return existing;
  const r = await withTransaction((s) =>
    reserve(s, {
      regionId: svc.regionId,
      serviceId: svc._id,
      deploymentId: dep._id,
      kind: 'candidate',
      need: planResources(svc.type, svc.plan),
      preferServerId: svc.runtime?.serverId ?? null,
      ttlMs: (ctx().config.BUILD_TIMEOUT_SECONDS + 3600) * 1000,
    }),
  );
  if (!r) throw new DeployError('CAPACITY_UNAVAILABLE', `No capacity is available in ${getRegion(svc.regionId)?.city ?? svc.regionId} right now. Try again later.`);
  return r;
}

async function removeCandidates(dep: DeploymentDoc) {
  const r = await CapacityReservation.findOne({ deploymentId: dep._id, status: 'held' }).lean<CapacityReservationDoc>();
  const servers = r ? await Server.find({ _id: r.serverId }).lean<ServerDoc[]>() : [];
  for (const s of servers) {
    const d = await driverFor(s);
    for (const c of await d.listManaged({ 'dgc.deployment': dep._id })) await d.removeContainer(c.id);
  }
}

async function cleanupAttempt(state: RunState, log: DeployLog) {
  if (state.candidateId && state.driver) await state.driver.removeContainer(state.candidateId).catch(() => {});
  if (state.reservation) await withTransaction((s) => release(s, state.reservation!._id)).catch(() => {});
  if (state.handedOff) {
    try {
      await (await driverFor(state.handedOff.server)).startContainer(state.handedOff.id);
      log.step('The previous version was restarted');
    } catch {
      log.step('The previous version could not be restarted');
      state.handedOff = undefined;
    }
  }
}

/** Marks a deployment failed. The service stays running if its previous version still runs. */
export async function failDeployment(dep: DeploymentDoc, generation: number, code: string, reason: string, startedMs: number, previous: 'restored' | 'untouched', log?: DeployLog) {
  // Observe the runtime before the transaction: no Docker calls inside transaction callbacks.
  const before = await Service.findById(dep.serviceId).lean<ServiceDoc>();
  let running = false;
  if (before?.runtime) {
    const server = await Server.findById(before.runtime.serverId).lean<ServerDoc>();
    running = server ? Boolean((await (await driverFor(server)).inspectContainer(before.runtime.containerId).catch(() => null))?.running) : false;
  }
  let outbox: string[] = [];
  await withTransaction(async (s) => {
    const svc = await Service.findOne({ _id: dep.serviceId }, null, { session: s }).lean<ServiceDoc>();
    const now = new Date();
    const fin = await Deployment.updateOne(
      { _id: dep._id, status: 'building' },
      { $set: { status: 'failed', stage: null, finishedAt: now, durationSec: Math.round((now.getTime() - startedMs) / 1000), failureCode: code, failureReason: reason.slice(0, 500) } },
      { session: s },
    );
    if (fin.modifiedCount === 0) return;
    if (svc && svc.lifecycle === 'active' && svc.opGeneration === generation) {
      const status = running ? 'running' : svc.lastSuccessfulDeploymentId ? 'stopped' : 'failed';
      await Service.updateOne(
        { _id: svc._id, opGeneration: generation },
        {
          $set: {
            status,
            activeOperation: null,
            ...(running && previous === 'restored' ? { startedAt: now, 'runtime.startedAt': now } : {}),
            ...(!running ? { startedAt: null, runtime: null, route: null, desiredState: status === 'failed' ? 'running' : 'stopped' } : {}),
          },
        },
        { session: s },
      );
    }
    outbox = await addToOutbox(s, [{ topic: 'notify.deployment', payload: { deploymentId: dep._id, outcome: 'failed' }, dedupeKey: `notify-deploy:${dep._id}:failed` }]);
  });
  deploymentsFinished.inc({ result: 'failed' });
  await log?.close();
  await dispatchNow(ctx().queues, outbox);
  const updated = await Deployment.findById(dep._id).lean<DeploymentDoc>();
  if (updated) await ctx().hub.publish({ kind: 'team', id: dep.teamId }, 'deployment.updated', deploymentDto(updated));
  await publishService(dep.serviceId);
  await deployPendingPush(dep.serviceId);
}

/** Opens the source archive for GitHub or upload services and records the actual revision. */
async function openSource(svc: ServiceDoc, dep: DeploymentDoc, log: DeployLog) {
  const noop = async () => {};
  if (svc.source === 'github') {
    const [owner, name] = svc.repo.split('/') as [string, string];
    const install = await installationFor(svc.teamId, owner);
    const gh = ctx().integrations.github;
    try {
      let sha = dep.source.sha;
      let message = dep.commitMessage;
      let author = dep.author;
      if (!sha) {
        const head = await gh.getBranchHead(install?.installationId ?? null, owner, name, svc.branch!);
        sha = head.sha;
        message = head.message;
        if (dep.trigger === 'initial') author = head.author;
      }
      log.step(`Fetching ${svc.repo}@${sha.slice(0, 7)}`);
      const stream = await gh.downloadTarball(install?.installationId ?? null, owner, name, sha);
      return { src: { format: 'tar.gz' as const, stream }, strip: '*' as const, cleanup: noop, meta: { commit: sha.slice(0, 7), commitMessage: message, author, source: { ...dep.source, sha } } };
    } catch (e) {
      if (e instanceof GithubError) throw new DeployError('SOURCE_UNAVAILABLE', e.status === 404 ? 'The repository or branch is no longer accessible.' : 'GitHub couldn’t provide the source right now.');
      throw e;
    }
  }
  // upload
  const storage = ctx().integrations.storage;
  if (!storage) throw new DeployError('STORAGE_NOT_CONFIGURED', 'Archive storage isn’t configured on this platform.');
  const upload = await Upload.findOne({ _id: dep.source.uploadId ?? svc.uploadId, teamId: svc.teamId, status: 'attached' }).lean<UploadDoc>();
  if (!upload) throw new DeployError('SOURCE_UNAVAILABLE', 'The uploaded archive is no longer available. Upload it again.');
  log.step(`Using ${upload.fileName} (${Math.round(upload.sizeBytes / 1024)} KB)`);
  const meta = { commit: upload.sha256.slice(0, 7), source: { ...dep.source, uploadId: upload._id, archiveSha256: upload.sha256 } };
  if (upload.format === 'zip') {
    // Zip needs random access: the archive is copied (never extracted) to a private temp file.
    const dir = await mkdtemp(path.join(tmpdir(), 'dgc-build-'));
    const file = path.join(dir, 'source.zip');
    await streamPipeline(await storage.get(upload.storageKey), createWriteStream(file, { mode: 0o600 }));
    return { src: { format: 'zip' as const, filePath: file }, strip: upload.rootPrefix, cleanup: () => rm(dir, { recursive: true, force: true }), meta };
  }
  return { src: { format: upload.format, stream: await storage.get(upload.storageKey) }, strip: upload.rootPrefix, cleanup: noop, meta };
}

/** A push that arrived during a deployment is deployed once the current one finishes. */
async function deployPendingPush(serviceId: string) {
  const svc = await Service.findOne({ _id: serviceId, lifecycle: 'active', activeOperation: null, pendingPush: { $ne: null } }).lean<ServiceDoc>();
  if (!svc?.pendingPush) return;
  const { deployPush } = await import('../modules/github/github.service');
  await deployPush(svc, svc.pendingPush).catch(() => {});
}
