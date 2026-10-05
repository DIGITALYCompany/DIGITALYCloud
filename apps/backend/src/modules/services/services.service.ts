import {
  DEFAULT_NODE_VERSION,
  GIT_BRANCH_RE,
  MESSAGES,
  SERVICE_NAME_RE,
  getRegion,
  getServicePlan,
  isPaidPlan,
  isRegionAllowed,
  isSupportedNodeVersion,
  isValidPort,
  planAllowsAutoRestart,
  slugify,
  typeRequiresPort,
  type CreateServiceInput,
  type EnvVarInput,
  type NodeVersion,
  type PlanId,
  type UpdateServiceInput,
} from '@digitalycloud/shared';
import { ctx } from '../../context';
import { withTransaction } from '../../db/connection';
import { BillingOperation, Deployment, EnvVar, Service, SlugReservation, SubscriptionItem, type ServiceDoc } from '../../db/models';
import { afterCursor, decodeCursor, page } from '../../http/pagination';
import type { Tenant } from '../../http/principal';
import { addToOutbox, dispatchNow } from '../../jobs/outbox';
import { audit } from '../../lib/audit';
import { AppError, badRequest, conflict, isDuplicateIn, isDuplicateKey, notFound, unavailable, validation } from '../../lib/errors';
import { newId, randomString } from '../../lib/ids';
import { hasCapacity, planResources } from '../../runtime/capacity';
import { deploymentDto } from '../../serializers/deployment';
import { assertPaidPlansAvailable } from '../billing/availability';
import { createDeploymentRecord, lockForDeploy, type Actor } from '../deployments/deployments.service';
import { replaceEnv, validateEnvList } from './env.service';
import { publishService } from './publish';
import { claimUpload, resolveGithubSource, validateDockerImage } from './sources';

export const SLUG_RESERVATION_MS = 30 * 24 * 3600_000;
const CONTROL_LEASE_MS = 5 * 60_000;
/** Names that would shadow platform hostnames on the runtime domain. */
const RESERVED_SLUGS = new Set(['www', 'api', 'app', 'admin', 'status', 'mail', 'docs', 'cloud', 'dashboard', 'static', 'cdn', 'assets', 'auth', 'login', 'billing', 'support']);

const nameConflict = () => conflict(MESSAGES.serviceNameTaken, 'CONFLICT', { name: MESSAGES.serviceNameTaken });

export async function getService(teamId: string, id: string) {
  if (typeof id !== 'string' || !/^[a-z0-9-]{1,63}$/.test(id)) throw notFound('Service');
  const s = await Service.findOne({ _id: id, teamId, lifecycle: 'active' }).lean<ServiceDoc>();
  if (!s) throw notFound('Service');
  return s;
}

export async function listServices(teamId: string, opts: { limit: number; cursor?: string }) {
  const rows = await Service.find({ teamId, lifecycle: 'active', ...afterCursor(decodeCursor(opts.cursor)) })
    .sort({ createdAt: -1, _id: -1 })
    .limit(opts.limit + 1)
    .lean<ServiceDoc[]>();
  return page(rows, opts.limit);
}

function checkStartCommand(cmd: string) {
  const c = cmd.trim();
  if (!c) throw validation(MESSAGES.startCommand, 'startCommand');
  // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
  if (c.length > 1000 || /[\u0000-\u001f\u007f]/.test(c)) throw validation('Use a single-line start command (max 1000 characters).', 'startCommand');
  return c;
}

function checkNodeVersion(v: string, source: string): NodeVersion {
  if (source === 'docker') return isSupportedNodeVersion(v) ? v : DEFAULT_NODE_VERSION;
  if (!isSupportedNodeVersion(v)) {
    const major = /^\d+/.exec(v)?.[0];
    throw validation(major && Number(major) < 22 ? `Node.js ${major} reached end-of-life. Choose Node.js 24 LTS or 22 LTS.` : 'Choose Node.js 24 LTS or 22 LTS.', 'nodeVersion');
  }
  return v;
}

function checkPort(type: ServiceDoc['type'], port: number | null) {
  if (port === null) {
    if (typeRequiresPort(type)) throw validation(MESSAGES.portRequired, 'port');
    return null;
  }
  if (!isValidPort(port)) throw validation(MESSAGES.port, 'port');
  return port;
}

export function regionCheck(regionId: string, plan: PlanId, type: ServiceDoc['type']) {
  const region = getRegion(regionId);
  if (!region) throw validation(MESSAGES.unknownRegion, 'regionId');
  if (!isRegionAllowed(region, plan)) {
    throw new AppError(400, 'REGION_NOT_ALLOWED', `${region.city} isn’t available on the ${getServicePlan(type, plan).name} plan.`, { regionId: `${region.city} isn’t available on this plan.` });
  }
  return region;
}

/** Region eligibility (plan) and real capacity (configured healthy hosts) are separate checks. */
async function capacityCheck(regionId: string, type: ServiceDoc['type'], plan: PlanId) {
  const region = getRegion(regionId)!;
  if (!ctx().config.capabilities.runtime) throw new AppError(400, 'REGION_UNAVAILABLE', `${region.city} is temporarily unavailable. No runtime hosts are configured.`, { regionId: 'Unavailable' });
  const state = await hasCapacity(regionId, planResources(type, plan));
  if (state === 'no_servers') throw new AppError(400, 'REGION_UNAVAILABLE', `${region.city} is temporarily unavailable. Choose another region.`, { regionId: 'Unavailable' });
  if (state === 'full') throw unavailable(`${region.city} is at capacity right now. Choose another region or try again later.`, 'CAPACITY_UNAVAILABLE', 300);
}

function slugCandidates(name: string) {
  let base = slugify(name) || 'svc';
  if (RESERVED_SLUGS.has(base)) base = `${base}-svc`;
  return [base, ...Array.from({ length: 6 }, () => `${base.slice(0, 34)}-${randomString(4)}`)];
}

export interface CreateResult {
  service: ServiceDoc;
  deployment: ReturnType<typeof deploymentDto>;
}

/** Validated, normalised creation input (no writes yet). */
export interface PreparedService {
  teamId: string;
  input: CreateServiceInput;
  name: string;
  nodeVersion: NodeVersion;
  startCommand: string;
  port: number | null;
  repo: string;
  branch: string | null;
  repoNormalized: string | null;
  githubInstallationId: string | null;
  autoRestart: boolean;
  autoDeploy: boolean;
}

/** Links a paid service to the subscription item that was paid for it (see billing.service). */
export interface BillingLink {
  operationId: string;
  subscriptionId: string;
  stripeItemId: string;
  priceId: string;
}

export async function prepareService(teamId: string, input: CreateServiceInput): Promise<PreparedService> {
  const name = input.name.trim();
  if (!SERVICE_NAME_RE.test(name)) throw validation(MESSAGES.serviceName, 'name');
  regionCheck(input.regionId, input.plan, input.type);
  const nodeVersion = checkNodeVersion(input.nodeVersion, input.source);
  const startCommand = checkStartCommand(input.startCommand);
  const port = checkPort(input.type, input.port);
  validateEnvList(input.env, new Map());
  if (await Service.exists({ teamId, nameNormalized: name.toLowerCase(), lifecycle: 'active' })) throw nameConflict();
  // Paid plans need the billing flow; it is unavailable until billing is configured and validated.
  if (isPaidPlan(input.type, input.plan)) assertPaidPlansAvailable();
  await capacityCheck(input.regionId, input.type, input.plan);

  let repo = input.repo.trim();
  let branch: string | null = null;
  let repoNormalized: string | null = null;
  let githubInstallationId: string | null = null;
  if (input.source === 'github') {
    if (input.branch !== null && !GIT_BRANCH_RE.test(input.branch)) throw validation(MESSAGES.branch, 'branch');
    const gh = await resolveGithubSource(teamId, repo, input.branch);
    repo = gh.fullName;
    branch = gh.branch;
    repoNormalized = gh.fullName.toLowerCase();
    githubInstallationId = gh.installation?._id ?? null;
  } else if (input.source === 'docker') {
    repo = validateDockerImage(repo).ref;
  } else if (input.source === 'upload') {
    if (!input.uploadId) throw validation(MESSAGES.upload, 'uploadId');
  }
  return {
    teamId,
    input,
    name,
    nodeVersion,
    startCommand,
    port,
    repo,
    branch,
    repoNormalized,
    githubInstallationId,
    autoRestart: planAllowsAutoRestart(input.plan) ? (input.autoRestart ?? true) : false,
    autoDeploy: input.source === 'github' ? (input.autoDeploy ?? true) : false,
  };
}

/**
 * Creates the service and deployment #1 in one transaction. For paid plans it runs only after the
 * payment was confirmed, and completes the billing operation and its item mapping in the same
 * transaction — so a service exists if and only if its operation completed (exactly once).
 */
export async function finalizeService(p: PreparedService, actor: Actor, billing?: BillingLink): Promise<CreateResult> {
  const { teamId, input } = p;
  const opId = newId('deployment');
  for (const slug of slugCandidates(p.name)) {
    if (await SlugReservation.exists({ _id: slug })) continue;
    let outbox: string[] = [];
    try {
      const result = await withTransaction(async (session) => {
        const now = new Date();
        let repo = p.repo;
        await SlugReservation.create([{ _id: slug, serviceId: slug, teamId, state: 'active', createdAt: now, expiresAt: null }], { session });
        if (billing) {
          const done = await BillingOperation.updateOne({ _id: billing.operationId, status: 'processing' }, { $set: { status: 'completed', serviceId: slug, completedAt: now, message: null } }, { session });
          if (done.modifiedCount !== 1) throw new OperationAlreadyFinished();
          await SubscriptionItem.create(
            [{ _id: newId('subscriptionItem'), teamId, serviceId: slug, type: input.type, plan: input.plan, priceId: billing.priceId, stripeSubscriptionId: billing.subscriptionId, stripeSubscriptionItemId: billing.stripeItemId, status: 'active' }],
            { session },
          );
        }
        let uploadId: string | null = null;
        if (input.source === 'upload') {
          const up = await claimUpload(session, teamId, input.uploadId, slug);
          uploadId = up._id;
          repo = up.fileName;
        }
        const doc: ServiceDoc = {
          _id: slug,
          teamId,
          name: p.name,
          nameNormalized: p.name.toLowerCase(),
          type: input.type,
          plan: input.plan,
          regionId: input.regionId,
          source: input.source,
          repo,
          repoNormalized: p.repoNormalized,
          branch: p.branch,
          uploadId,
          githubInstallationId: p.githubInstallationId,
          nodeVersion: p.nodeVersion,
          startCommand: p.startCommand,
          port: p.port,
          autoDeploy: p.autoDeploy,
          autoRestart: p.autoRestart,
          status: 'deploying',
          desiredState: 'running',
          lifecycle: 'active',
          deploymentSeq: 0,
          lastDeployAt: now,
          activeDeploymentId: null,
          lastSuccessfulDeploymentId: null,
          startedAt: null,
          storageMb: 0,
          envVersion: 1,
          settingsVersion: 1,
          runtime: null,
          route: null,
          activeOperation: null,
          opGeneration: 0,
          pendingPush: null,
          resourceState: { status: 'applied', error: null, updatedAt: now },
          crash: { count: 0, windowStart: null, lastAt: null, backoffUntil: null },
          createdBy: actor.userId,
          createdAt: now,
          updatedAt: now,
          deletingAt: null,
        };
        try {
          await Service.create([doc], { session });
        } catch (e) {
          if (isDuplicateKey(e, 'service_team_name_unique')) throw nameConflict();
          throw e;
        }
        await replaceEnv(session, slug, teamId, input.env as EnvVarInput[]);
        const locked = await lockForDeploy(session, teamId, slug, opId);
        const created = await createDeploymentRecord(session, locked, { trigger: 'initial', actor, commitMessage: 'Initial deployment' });
        outbox = created.outbox;
        await audit({ action: 'service.created', actorUserId: actor.userId, teamId, targetType: 'service', targetId: slug, meta: { type: input.type, plan: input.plan, source: input.source, regionId: input.regionId, billingOperation: billing?.operationId ?? null } }, session);
        return { service: { ...locked, uploadId, repo }, deployment: deploymentDto(created.deployment) };
      });
      await dispatchNow(ctx().queues, outbox);
      await ctx().hub.publish({ kind: 'team', id: teamId }, 'deployment.created', result.deployment);
      const fresh = (await publishService(slug)) ?? result.service;
      return { service: fresh, deployment: result.deployment };
    } catch (e) {
      // Another request took this slug between the check and the insert: try the next candidate.
      if (isDuplicateIn(e, 'slug_reservations', '_id_') || isDuplicateIn(e, 'services', '_id_')) continue;
      throw e;
    }
  }
  throw conflict('Could not allocate a unique service URL. Try a different name.');
}

/** Raised inside finalize when another worker already completed the billing operation. */
export class OperationAlreadyFinished extends Error {
  constructor() {
    super('Billing operation already finished');
  }
}

export async function createService(tenant: Tenant, actor: Actor, input: CreateServiceInput): Promise<CreateResult> {
  const prepared = await prepareService(tenant.team._id, input);
  if (isPaidPlan(input.type, input.plan)) {
    const { purchaseService } = await import('../billing/billing.service');
    return purchaseService(tenant, actor, prepared);
  }
  return finalizeService(prepared, actor);
}

const LEGACY_IGNORED = ['ramLimitMb', 'storageLimitMb'] as const;
export const SETTINGS_FIELDS = ['name', 'startCommand', 'nodeVersion', 'port', 'branch', 'autoDeploy', 'autoRestart'] as const;

/** `PATCH /services/:id`: settings only. Changes apply on the next deployment. */
export async function updateService(tenant: Tenant, actor: Actor, id: string, patch: UpdateServiceInput & Record<string, unknown>) {
  const svc = await getService(tenant.team._id, id);
  for (const k of LEGACY_IGNORED) delete patch[k];
  if ('plan' in patch) throw badRequest('VALIDATION_ERROR', 'Change plans with POST /services/:id/plan.');
  const unknown = Object.keys(patch).filter((k) => !(SETTINGS_FIELDS as readonly string[]).includes(k));
  if (unknown.length) throw validation(`Unexpected field: ${unknown.join(', ')}.`, unknown[0]);

  const set: Partial<ServiceDoc> = {};
  let settingsChanged = false;
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!SERVICE_NAME_RE.test(name)) throw validation(name.length < 2 ? 'Name is too short' : MESSAGES.serviceName, 'name');
    set.name = name;
    set.nameNormalized = name.toLowerCase();
  }
  if (patch.startCommand !== undefined && patch.startCommand !== svc.startCommand) {
    set.startCommand = checkStartCommand(patch.startCommand);
    settingsChanged = true;
  }
  if (patch.nodeVersion !== undefined && patch.nodeVersion !== svc.nodeVersion) {
    set.nodeVersion = checkNodeVersion(patch.nodeVersion, svc.source);
    settingsChanged = svc.source !== 'docker';
  }
  if (patch.port !== undefined && patch.port !== svc.port) {
    set.port = checkPort(svc.type, patch.port);
    settingsChanged = true;
  }
  if (patch.branch !== undefined && patch.branch !== svc.branch) {
    if (svc.source !== 'github') throw validation('The branch only applies to GitHub services.', 'branch');
    const gh = await resolveGithubSource(tenant.team._id, svc.repo, patch.branch);
    set.branch = gh.branch;
    settingsChanged = true;
  }
  if (patch.autoDeploy !== undefined) {
    if (svc.source !== 'github' && patch.autoDeploy) throw validation('Automatic deploys need a GitHub source.', 'autoDeploy');
    set.autoDeploy = patch.autoDeploy && svc.source === 'github';
  }
  if (patch.autoRestart !== undefined) {
    if (patch.autoRestart && !planAllowsAutoRestart(svc.plan)) throw validation('Automatic restart is available on paid plans.', 'autoRestart');
    set.autoRestart = patch.autoRestart;
  }
  if (Object.keys(set).length === 0) return svc;
  try {
    const updated = await Service.findOneAndUpdate(
      { _id: svc._id, teamId: tenant.team._id, lifecycle: 'active' },
      { $set: set, ...(settingsChanged ? { $inc: { settingsVersion: 1 } } : {}) },
    ).lean<ServiceDoc>();
    if (!updated) throw notFound('Service');
    await audit({ action: 'service.settings_updated', actorUserId: actor.userId, actorApiKeyId: actor.apiKeyId, teamId: tenant.team._id, targetType: 'service', targetId: svc._id, meta: { fields: Object.keys(set) } });
    await publishService(svc._id);
    return updated;
  } catch (e) {
    if (isDuplicateKey(e, 'service_team_name_unique')) throw nameConflict();
    throw e;
  }
}

/**
 * Deletes a service. It disappears from the team immediately (and can be recreated with the same
 * name), its slug stays reserved for 30 days, and a durable purge task stops containers, releases
 * capacity, removes the billing item and deletes deployments, logs, metrics and env vars.
 * Any running operation is fenced out by the generation bump.
 */
export async function deleteService(tenant: Tenant, actor: Actor, id: string) {
  await getService(tenant.team._id, id);
  let outbox: string[] = [];
  await withTransaction(async (session) => {
    const now = new Date();
    const svc = await Service.findOneAndUpdate(
      { _id: id, teamId: tenant.team._id, lifecycle: 'active' },
      {
        $set: { lifecycle: 'deleting', deletingAt: now, desiredState: 'stopped' },
        $inc: { opGeneration: 1 },
      },
      { session },
    ).lean<ServiceDoc>();
    if (!svc) throw notFound('Service');
    await Service.updateOne(
      { _id: id },
      { $set: { activeOperation: { id: newId('deployment'), kind: 'delete', generation: svc.opGeneration, startedAt: now, leaseUntil: new Date(now.getTime() + 24 * 3600_000) } } },
      { session },
    );
    await SlugReservation.updateOne({ _id: id }, { $set: { state: 'reserved', expiresAt: new Date(now.getTime() + SLUG_RESERVATION_MS) } }, { session });
    await Deployment.updateMany(
      { serviceId: id, status: 'building' },
      { $set: { status: 'failed', stage: null, finishedAt: now, failureCode: 'SERVICE_DELETED', failureReason: 'The service was deleted.' } },
      { session },
    );
    outbox = await addToOutbox(session, [{ topic: 'service.purge', payload: { serviceId: id, teamId: tenant.team._id, generation: svc.opGeneration }, dedupeKey: `purge:${id}:${svc.opGeneration}` }]);
    await audit({ action: 'service.deleted', actorUserId: actor.userId, teamId: tenant.team._id, targetType: 'service', targetId: id }, session);
  });
  await dispatchNow(ctx().queues, outbox);
  await ctx().hub.publish({ kind: 'team', id: tenant.team._id }, 'service.deleted', { id });
}

export type ControlKind = 'start' | 'stop' | 'restart';

/**
 * Start/stop/restart. Runtime work happens in a worker (the API never talks to Docker). The request
 * takes the per-service operation lock, records the desired state, and waits briefly for the worker.
 */
export async function controlService(tenant: Tenant, actor: Actor, id: string, requested: ControlKind) {
  const svc = await getService(tenant.team._id, id);
  // Restarting a stopped service behaves like start.
  const kind: ControlKind = requested === 'restart' && (svc.status === 'stopped' || svc.status === 'failed' || !svc.runtime) ? 'start' : requested;
  if (kind === 'start' && !svc.lastSuccessfulDeploymentId) throw conflict('Deploy the service before starting it.');
  const opId = newId('deployment');
  const now = new Date();
  let outbox: string[] = [];
  await withTransaction(async (session) => {
    const locked = await Service.findOneAndUpdate(
      { _id: id, teamId: tenant.team._id, lifecycle: 'active', $or: [{ activeOperation: null }, { 'activeOperation.leaseUntil': { $lt: now } }] },
      { $inc: { opGeneration: 1 }, $set: { desiredState: kind === 'stop' ? 'stopped' : 'running' } },
      { session },
    ).lean<ServiceDoc>();
    if (!locked) {
      const cur = await Service.findOne({ _id: id }, { activeOperation: 1, status: 1 }, { session }).lean<ServiceDoc>();
      throw conflict(cur?.activeOperation?.kind === 'deploy' || cur?.status === 'deploying' ? 'Wait for the deployment to finish, then try again.' : 'Another action is in progress for this service. Try again in a moment.');
    }
    await Service.updateOne(
      { _id: id },
      { $set: { activeOperation: { id: opId, kind, generation: locked.opGeneration, startedAt: now, leaseUntil: new Date(now.getTime() + CONTROL_LEASE_MS) } } },
      { session },
    );
    outbox = await addToOutbox(session, [{ topic: `runtime.${kind}`, payload: { serviceId: id, operationId: opId, generation: locked.opGeneration }, dedupeKey: `op:${opId}` }]);
    await audit({ action: `service.${kind}`, actorUserId: actor.userId, actorApiKeyId: actor.apiKeyId, teamId: tenant.team._id, targetType: 'service', targetId: id }, session);
  });
  await dispatchNow(ctx().queues, outbox);
  await publishService(id);
  return waitForOperation(id, opId);
}

/** Polls until the worker clears the operation (or the configured wait elapses). */
export async function waitForOperation(id: string, opId: string) {
  const deadline = Date.now() + ctx().config.CONTROL_WAIT_MS;
  for (;;) {
    const s = await Service.findById(id).lean<ServiceDoc>();
    if (!s) throw notFound('Service');
    if (s.activeOperation?.id !== opId || Date.now() >= deadline) return s;
    await new Promise((r) => setTimeout(r, 300));
  }
}

/** `PUT /services/:id/env`: atomic full-list replacement. Applies on the next start/restart/deploy. */
export async function setEnv(tenant: Tenant, actor: Actor, id: string, list: EnvVarInput[]) {
  await getService(tenant.team._id, id);
  await withTransaction(async (session) => {
    const res = await Service.updateOne({ _id: id, teamId: tenant.team._id, lifecycle: 'active' }, { $inc: { envVersion: 1 } }, { session });
    if (res.matchedCount !== 1) throw notFound('Service');
    await replaceEnv(session, id, tenant.team._id, list);
    // Keys only: values never enter the audit trail.
    await audit({ action: 'service.env_replaced', actorUserId: actor.userId, actorApiKeyId: actor.apiKeyId, teamId: tenant.team._id, targetType: 'service', targetId: id, meta: { keys: list.map((v) => v.key) } }, session);
  });
  await publishService(id);
  return EnvVar.find({ serviceId: id }).sort({ position: 1 }).lean();
}

/** Plan changes have billing effects and go through the billing flow (`POST /services/:id/plan`). */
export async function changePlan(tenant: Tenant, actor: Actor, id: string, plan: PlanId) {
  const svc = await getService(tenant.team._id, id);
  if (plan === svc.plan) return svc;
  const region = getRegion(svc.regionId);
  if (region && !isRegionAllowed(region, plan)) throw new AppError(400, 'REGION_NOT_ALLOWED', `${region.city} isn’t available on this plan.`);
  // Every change between levels involves a paid plan (there is one free level).
  assertPaidPlansAvailable();
  const { changeServicePlan } = await import('../billing/billing.service');
  return changeServicePlan(tenant, actor, svc, plan);
}
