import { ctx } from '../context';
import { withTransaction } from '../db/connection';
import { CapacityReservation, Deployment, Server, Service, type CapacityReservationDoc, type DeploymentDoc, type ServerDoc, type ServiceDoc } from '../db/models';
import { publishService } from '../modules/services/publish';
import { release } from './capacity';
import { driverFor } from './driver';
import { failDeployment } from './pipeline';
import { handleUnexpectedExit } from './crash';

const ORPHAN_GRACE_MS = 10 * 60_000;

/**
 * Brings stored state back in line with reality after crashes or restarts:
 * - operations whose lease expired (worker died) are cleared; interrupted deployments fail honestly;
 * - building deployments with no live operation are failed;
 * - expired candidate reservations are released;
 * - containers no service owns any more are removed;
 * - services that should be running but whose container is gone are treated as crashed.
 */
export async function reconcile() {
  const now = new Date();
  const report = { leases: 0, deployments: 0, reservations: 0, orphans: 0, drift: 0 };

  for (const svc of await Service.find({ lifecycle: 'active', 'activeOperation.leaseUntil': { $lt: now } }).limit(200).lean<ServiceDoc[]>()) {
    const op = svc.activeOperation!;
    if (op.kind === 'deploy') {
      const dep = await Deployment.findOne({ serviceId: svc._id, status: 'building' }).lean<DeploymentDoc>();
      if (dep) await failDeployment(dep, svc.opGeneration, 'INTERRUPTED', 'The deployment was interrupted by a platform restart. Please deploy again.', dep.createdAt.getTime(), 'untouched');
    }
    await Service.updateOne({ _id: svc._id, 'activeOperation.id': op.id }, { $set: { activeOperation: null, ...(svc.status === 'deploying' ? { status: svc.runtime ? 'running' : 'failed' } : {}) } });
    await publishService(svc._id);
    report.leases++;
  }

  const stale = new Date(now.getTime() - (ctx().config.BUILD_TIMEOUT_SECONDS + 1800) * 1000);
  for (const dep of await Deployment.find({ status: 'building', createdAt: { $lt: stale } }).limit(200).lean<DeploymentDoc[]>()) {
    const svc = await Service.findById(dep.serviceId).lean<ServiceDoc>();
    if (svc?.activeOperation?.kind === 'deploy' && svc.activeOperation.leaseUntil > now) continue;
    await failDeployment(dep, svc?.opGeneration ?? dep.generation, 'INTERRUPTED', 'The deployment did not finish in time.', dep.createdAt.getTime(), 'untouched');
    report.deployments++;
  }

  for (const r of await CapacityReservation.find({ status: 'held', kind: 'candidate', expiresAt: { $lt: now } }).limit(500).lean<CapacityReservationDoc[]>()) {
    await withTransaction((s) => release(s, r._id));
    report.reservations++;
  }

  if (ctx().config.capabilities.runtime) {
    for (const server of await Server.find({ demo: false, status: { $ne: 'offline' } }).lean<ServerDoc[]>()) {
      let containers;
      try {
        containers = await (await driverFor(server)).listManaged();
      } catch {
        continue; // Host unreachable: the collector reports it.
      }
      const d = await driverFor(server);
      const ids = [...new Set(containers.map((c) => c.labels['dgc.service']).filter((x): x is string => Boolean(x)))];
      const services = new Map((await Service.find({ _id: { $in: ids } }).lean<ServiceDoc[]>()).map((s) => [s._id, s]));
      for (const c of containers) {
        if (now.getTime() - c.createdAt.getTime() < ORPHAN_GRACE_MS) continue;
        const svc = services.get(c.labels['dgc.service'] ?? '');
        const isActive = svc?.runtime?.containerId === c.id;
        const isBuilding = svc?.activeOperation?.kind === 'deploy';
        if (!svc || svc.lifecycle === 'deleting' || (!isActive && !isBuilding)) {
          await d.stopContainer(c.id, ctx().config.STOP_TIMEOUT_SECONDS).catch(() => {});
          await d.removeContainer(c.id).catch(() => {});
          report.orphans++;
        }
      }
      for (const svc of await Service.find({ lifecycle: 'active', 'runtime.serverId': server._id, status: 'running', activeOperation: null }).lean<ServiceDoc[]>()) {
        const st = await d.inspectContainer(svc.runtime!.containerId).catch(() => undefined);
        if (st === undefined) continue;
        if (!st?.running) {
          await handleUnexpectedExit(svc, st?.exitCode ?? null, st?.oomKilled ?? false);
          report.drift++;
        }
      }
    }
  }
  return report;
}
