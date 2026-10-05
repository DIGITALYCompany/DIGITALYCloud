import { getRegion, planLimits } from '@digitalycloud/shared';
import { ctx } from '../context';
import { withTransaction } from '../db/connection';
import { CapacityReservation, Deployment, Server, Service, type CapacityReservationDoc, type DeploymentDoc, type ServerDoc, type ServiceDoc } from '../db/models';
import { runtimeEnv } from '../modules/services/env.service';
import { publishService } from '../modules/services/publish';
import { notify } from '../modules/notifications/notifications.service';
import { planResources, reserve } from './capacity';
import { driverFor } from './driver';
import { DeployError, specFor, storageEnforced, teamNetwork } from './pipeline';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Loads the service only if this job still owns its operation (stale jobs do nothing). */
async function owned(serviceId: string, operationId: string, generation: number) {
  return Service.findOne({ _id: serviceId, lifecycle: 'active', opGeneration: generation, 'activeOperation.id': operationId }).lean<ServiceDoc>();
}

async function finish(svc: ServiceDoc, operationId: string, generation: number, set: Record<string, unknown>) {
  await Service.updateOne({ _id: svc._id, opGeneration: generation, 'activeOperation.id': operationId }, { $set: { ...set, activeOperation: null } });
  await publishService(svc._id);
}

async function stopRuntime(svc: ServiceDoc) {
  if (!svc.runtime) return;
  const server = await Server.findById(svc.runtime.serverId).lean<ServerDoc>();
  if (!server) return;
  const d = await driverFor(server);
  // SIGTERM, then SIGKILL after the documented timeout.
  await d.stopContainer(svc.runtime.containerId, ctx().config.STOP_TIMEOUT_SECONDS);
  await d.removeContainer(svc.runtime.containerId);
}

/** The service's active reservation, created if a stopped service lost it. */
async function activeReservation(svc: ServiceDoc): Promise<CapacityReservationDoc> {
  const existing = await CapacityReservation.findOne({ serviceId: svc._id, kind: 'active', status: 'held' }).lean<CapacityReservationDoc>();
  if (existing) return existing;
  const r = await withTransaction((s) => reserve(s, { regionId: svc.regionId, serviceId: svc._id, deploymentId: null, kind: 'active', need: planResources(svc.type, svc.plan), preferServerId: svc.runtime?.serverId ?? null }));
  if (!r) throw new DeployError('CAPACITY_UNAVAILABLE', `No capacity is available in ${getRegion(svc.regionId)?.city ?? svc.regionId} right now.`);
  return r;
}

/**
 * (Re)creates the service container from its last successful build with the *current* env and
 * plan limits. A plain Docker restart would keep the old environment, so start and restart always
 * recreate the container.
 */
export async function launch(svc: ServiceDoc) {
  const dep = svc.lastSuccessfulDeploymentId ? await Deployment.findById(svc.lastSuccessfulDeploymentId).lean<DeploymentDoc>() : null;
  if (!dep?.imageRef) throw new DeployError('NO_BUILD', 'There is no successful build to start. Deploy the service first.');
  const reservation = await activeReservation(svc);
  const server = (await Server.findById(reservation.serverId).lean<ServerDoc>())!;
  const driver = await driverFor(server);
  if (!(await driver.imageExists(dep.imageRef))) {
    if (!ctx().config.REGISTRY_URL) throw new DeployError('NO_BUILD', 'The build is no longer on this host. Deploy again.');
    await driver.pullImage(dep.imageRef, { timeoutMs: 600_000, onLog: () => {} });
  }
  await driver.ensureNetwork(teamNetwork(svc.teamId), { 'dgc.managed': 'true', 'dgc.team': svc.teamId });
  const env = await runtimeEnv(svc._id, { regionId: svc.regionId, deploymentId: dep._id, port: dep.config.port });
  const id = await driver.createContainer(specFor({ svc, dep, image: dep.imageRef, env: env.env, server, role: 'active', storageEnforced: storageEnforced(server) }));
  await driver.startContainer(id);
  await sleep(1500);
  const st = await driver.inspectContainer(id);
  if (!st?.running) {
    await driver.removeContainer(id).catch(() => {});
    throw new DeployError('START_FAILED', `The process exited right after starting${st?.exitCode !== null && st?.exitCode !== undefined ? ` (code ${st.exitCode})` : ''}. Check the logs.`);
  }
  const now = new Date();
  return {
    status: 'running',
    startedAt: st.startedAt ?? now,
    runtime: { serverId: server._id, containerId: id, containerName: st.name, hostPort: st.hostPort, imageRef: dep.imageRef, deploymentId: dep._id, envVersion: svc.envVersion, settingsVersion: dep.config.settingsVersion, plan: svc.plan, startedAt: st.startedAt ?? now },
    route: dep.config.port !== null && st.hostPort ? { upstream: `http://${server.privateIp}:${st.hostPort}`, deploymentId: dep._id, updatedAt: now } : null,
    resourceState: { status: 'applied', error: null, updatedAt: now },
  };
}

async function failed(svc: ServiceDoc, operationId: string, generation: number, err: unknown, what: string) {
  const message = err instanceof DeployError ? err.message : `Could not ${what} the service. Please try again.`;
  if (!(err instanceof DeployError)) ctx().log.error({ err, serviceId: svc._id }, `${what} failed`);
  const current = await Service.findById(svc._id).lean<ServiceDoc>();
  await finish(svc, operationId, generation, current?.runtime ? {} : { status: 'stopped', startedAt: null, runtime: null, route: null });
  await notify({ teamId: svc.teamId, serviceId: svc._id, kind: 'error', category: 'crash', title: `${svc.name} couldn’t ${what}`, body: message, dedupeKey: `op:${operationId}:failed` });
}

/** User-initiated starts reset the crash counter; automatic crash restarts keep counting (crash-loop policy). */
export async function startOp(serviceId: string, operationId: string, generation: number, reason: 'user' | 'crash' = 'user') {
  const svc = await owned(serviceId, operationId, generation);
  if (!svc) return;
  try {
    await stopRuntime(svc);
    await finish(svc, operationId, generation, {
      ...(await launch(svc)),
      desiredState: 'running',
      ...(reason === 'user' ? { crash: { count: 0, windowStart: null, lastAt: null, backoffUntil: null } } : { 'crash.backoffUntil': null }),
    });
  } catch (err) {
    await failed(svc, operationId, generation, err, 'start');
  }
}

export async function stopOp(serviceId: string, operationId: string, generation: number) {
  const svc = await owned(serviceId, operationId, generation);
  if (!svc) return;
  await stopRuntime(svc);
  await finish(svc, operationId, generation, { status: 'stopped', startedAt: null, runtime: null, route: null, desiredState: 'stopped' });
}

export async function restartOp(serviceId: string, operationId: string, generation: number, reason: 'user' | 'crash' = 'user') {
  return startOp(serviceId, operationId, generation, reason);
}

/**
 * Applies new plan limits to a running container (memory/CPU live). A different storage quota
 * needs a new container, so it is reported as pending until the next restart or deployment.
 * Failures are surfaced on the service instead of being reported as success.
 */
export async function applyLimits(serviceId: string) {
  const svc = await Service.findOne({ _id: serviceId, lifecycle: 'active' }).lean<ServiceDoc>();
  if (!svc) return;
  const now = new Date();
  if (!svc.runtime) {
    await Service.updateOne({ _id: svc._id }, { $set: { resourceState: { status: 'applied', error: null, updatedAt: now } } });
    return publishService(svc._id);
  }
  try {
    const server = (await Server.findById(svc.runtime.serverId).lean<ServerDoc>())!;
    const limits = planLimits(svc.type, svc.plan);
    await (await driverFor(server)).updateResources(svc.runtime.containerId, { memoryMb: limits.ramLimitMb, nanoCpus: Math.round(limits.vcpu * 1e9) });
    const storageChanged = planLimits(svc.type, svc.runtime.plan).storageLimitMb !== limits.storageLimitMb;
    await Service.updateOne(
      { _id: svc._id },
      {
        $set: {
          'runtime.plan': storageChanged ? svc.runtime.plan : svc.plan,
          resourceState: storageChanged ? { status: 'pending', error: 'The new disk quota applies after the next restart or deployment.', updatedAt: now } : { status: 'applied', error: null, updatedAt: now },
        },
      },
    );
  } catch (err) {
    ctx().log.warn({ err, serviceId }, 'applying resource limits failed');
    await Service.updateOne({ _id: svc._id }, { $set: { resourceState: { status: 'failed', error: 'The new resource limits could not be applied yet. Restart the service to apply them.', updatedAt: now } } });
  }
  await publishService(svc._id);
}
