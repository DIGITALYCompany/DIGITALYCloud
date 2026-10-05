import { ctx } from '../context';
import { Deployment, Server, Service, type DeploymentDoc, type ServerDoc, type ServiceDoc } from '../db/models';
import { registerProcessor } from '../jobs/registry';
import { notify } from '../modules/notifications/notifications.service';
import { cleanupExpiredUploads } from '../modules/uploads/uploads.service';
import { driverFor } from './driver';
import { applyLimits, restartOp, startOp, stopOp } from './operations';
import { runDeployment } from './pipeline';
import { purgeService } from './purge';
import { reconcile } from './reconcile';

const str = (v: unknown) => String(v ?? '');
const num = (v: unknown) => Number(v ?? 0);

/** Retained builds past their retention (and not the active one) are removed from their host. */
async function cleanupImages() {
  const due = await Deployment.find({ imageRetainedUntil: { $lt: new Date() }, imageRef: { $ne: null } }).limit(200).lean<DeploymentDoc[]>();
  for (const d of due) {
    const svc = await Service.findById(d.serviceId, { runtime: 1 }).lean<ServiceDoc>();
    if (svc?.runtime?.imageRef === d.imageRef) continue;
    const server = d.serverId ? await Server.findById(d.serverId).lean<ServerDoc>() : null;
    if (server) await (await driverFor(server)).removeImage(d.imageRef!).catch(() => {});
    await Deployment.updateOne({ _id: d._id }, { $set: { imageRetainedUntil: null } });
  }
}

export function registerRuntimeProcessors() {
  registerProcessor('deploy.run', (data, job) => runDeployment(str(data.deploymentId), num(data.generation), job.attemptsMade + 1, job.opts.attempts ?? 1));
  registerProcessor('runtime.start', (d) => startOp(str(d.serviceId), str(d.operationId), num(d.generation)));
  registerProcessor('runtime.stop', (d) => stopOp(str(d.serviceId), str(d.operationId), num(d.generation)));
  registerProcessor('runtime.restart', (d) => restartOp(str(d.serviceId), str(d.operationId), num(d.generation), d.reason === 'crash' ? 'crash' : 'user'));
  registerProcessor('runtime.apply_limits', async (d) => {
    await applyLimits(str(d.serviceId));
  });
  registerProcessor('service.purge', (d) => purgeService(str(d.serviceId)));

  registerProcessor('notify.deployment', async (d) => {
    const dep = await Deployment.findById(str(d.deploymentId)).lean<DeploymentDoc>();
    if (!dep) return;
    const svc = await Service.findById(dep.serviceId).lean<ServiceDoc>();
    if (!svc || svc.lifecycle !== 'active') return;
    const ok = d.outcome === 'success';
    await notify({
      teamId: svc.teamId,
      serviceId: svc._id,
      kind: ok ? 'success' : 'error',
      category: ok ? 'deploySuccess' : 'deployFail',
      title: `Deployment #${dep.number} ${ok ? 'succeeded' : 'failed'}`,
      body: ok ? `${svc.name} is live.` : `${svc.name}: ${dep.failureReason ?? 'the deployment failed.'} Check the logs.`,
      dedupeKey: `deploy:${dep._id}:${ok ? 'success' : 'failed'}`,
      link: `/services/${svc._id}/deployments`,
    });
  });

  registerProcessor('periodic.reconcile', async () => {
    const r = await reconcile();
    if (Object.values(r).some((n) => n > 0)) ctx().log.info({ reconcile: r }, 'reconciliation changed state');
  });

  registerProcessor('periodic.cleanup', async () => {
    await cleanupExpiredUploads();
    await cleanupImages();
  });
}
