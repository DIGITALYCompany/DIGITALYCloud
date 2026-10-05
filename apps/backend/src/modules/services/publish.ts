import { ctx } from '../../context';
import { Service, type ServiceDoc } from '../../db/models';
import { serializeOne } from '../../serializers/service';

/**
 * Publishes `service.updated` (never with env) to the service's team stream and returns the
 * fresh document. Used by the API after control actions and by workers after runtime changes.
 */
export async function publishService(serviceId: string): Promise<ServiceDoc | null> {
  const svc = await Service.findById(serviceId).lean<ServiceDoc>();
  if (!svc) return null;
  if (svc.lifecycle === 'deleting') {
    await ctx().hub.publish({ kind: 'team', id: svc.teamId }, 'service.deleted', { id: svc._id });
    return svc;
  }
  const { env: _omit, ...dto } = await serializeOne(svc, 'omit');
  await ctx().hub.publish({ kind: 'team', id: svc.teamId }, 'service.updated', dto);
  return svc;
}
