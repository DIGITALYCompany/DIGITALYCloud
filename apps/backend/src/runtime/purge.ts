import { ctx } from '../context';
import { withTransaction } from '../db/connection';
import {
  CapacityReservation,
  Counter,
  Deployment,
  DeploymentLog,
  EnvVar,
  MetricSample,
  RuntimeLog,
  Server,
  Service,
  SubscriptionItem,
  Upload,
  UsageAlertState,
  type CapacityReservationDoc,
  type DeploymentDoc,
  type ServerDoc,
  type ServiceDoc,
  type UploadDoc,
} from '../db/models';
import { addToOutbox, dispatchNow } from '../jobs/outbox';
import { release } from './capacity';
import { driverFor } from './driver';

/**
 * Durable deletion of a service marked `deleting`: containers stopped (SIGTERM → SIGKILL) and
 * removed on every host that may hold them, images removed, capacity released, the billing item
 * scheduled for removal, uploads deleted from object storage, then every record removed. Each step
 * is idempotent, so the job can be retried until it completes.
 */
export async function purgeService(serviceId: string) {
  const svc = await Service.findOne({ _id: serviceId, lifecycle: 'deleting' }).lean<ServiceDoc>();
  if (!svc) return;
  const reservations = await CapacityReservation.find({ serviceId }).lean<CapacityReservationDoc[]>();
  const deployments = await Deployment.find({ serviceId }, { imageRef: 1, serverId: 1 }).lean<Pick<DeploymentDoc, '_id' | 'imageRef' | 'serverId'>[]>();
  const serverIds = new Set([svc.runtime?.serverId, ...reservations.map((r) => r.serverId), ...deployments.map((d) => d.serverId)].filter((x): x is string => Boolean(x)));
  for (const server of await Server.find({ _id: { $in: [...serverIds] } }).lean<ServerDoc[]>()) {
    const d = await driverFor(server);
    for (const c of await d.listManaged({ 'dgc.service': serviceId })) {
      await d.stopContainer(c.id, ctx().config.STOP_TIMEOUT_SECONDS);
      await d.removeContainer(c.id);
    }
    for (const dep of deployments) if (dep.imageRef && dep.serverId === server._id) await d.removeImage(dep.imageRef).catch(() => {});
  }
  for (const r of reservations.filter((x) => x.status === 'held')) await withTransaction((s) => release(s, r._id));

  const items = await SubscriptionItem.find({ serviceId, status: 'active' }).lean();
  if (items.length) {
    const ids = await addToOutbox(null, items.map((i) => ({ topic: 'billing.remove_item' as const, payload: { subscriptionItemId: i._id }, dedupeKey: `remove-item:${i._id}` })));
    await dispatchNow(ctx().queues, ids);
  }

  const storage = ctx().integrations.storage;
  for (const u of await Upload.find({ serviceId }).lean<UploadDoc[]>()) {
    if (storage) await storage.delete(u.storageKey);
    await Upload.deleteOne({ _id: u._id });
  }
  await EnvVar.deleteMany({ serviceId });
  await DeploymentLog.deleteMany({ serviceId });
  await RuntimeLog.deleteMany({ serviceId });
  await MetricSample.deleteMany({ serviceId });
  await UsageAlertState.deleteMany({ serviceId });
  await Deployment.deleteMany({ serviceId });
  await Counter.deleteOne({ _id: `logseq:${serviceId}` });
  await ctx().redis.del(`${ctx().config.REDIS_PREFIX}:svc:${serviceId}:live`, `${ctx().config.REDIS_PREFIX}:svc:${serviceId}:series`).catch(() => 0);
  // The slug reservation stays (30 days); the service record goes last.
  await Service.deleteOne({ _id: serviceId, lifecycle: 'deleting' });
}
