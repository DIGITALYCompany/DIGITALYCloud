import { planAllowsAutoRestart } from '@digitalycloud/shared';
import { ctx } from '../context';
import { withTransaction } from '../db/connection';
import { Server, Service, type ServerDoc, type ServiceDoc } from '../db/models';
import { addToOutbox, dispatchNow } from '../jobs/outbox';
import { newId } from '../lib/ids';
import { notify } from '../modules/notifications/notifications.service';
import { publishService } from '../modules/services/publish';
import { driverFor } from './driver';

/** Crash-loop policy: at most 5 automatic restarts per 10 minutes, with exponential backoff. */
export const CRASH_WINDOW_MS = 10 * 60_000;
export const MAX_RESTARTS = 5;
export const backoffMs = (n: number) => Math.min(5 * 60_000, 5000 * 2 ** Math.max(0, n - 1));

/**
 * Called when the active container exits while it should be running and no operation is in
 * progress (intentional stops set `desiredState: stopped` or hold the operation lock first, so they
 * never reach here). Paid plans with auto-restart are restarted with backoff; free plans are not.
 */
export async function handleUnexpectedExit(svc: ServiceDoc, exitCode: number | null, oom: boolean) {
  if (svc.desiredState !== 'running' || svc.activeOperation || !svc.runtime || svc.lifecycle !== 'active') return;
  const now = new Date();
  const reason = `The process exited${exitCode !== null ? ` with code ${exitCode}` : ''}${oom ? ' after running out of memory' : ''}.`;
  const inWindow = svc.crash.windowStart && now.getTime() - svc.crash.windowStart.getTime() < CRASH_WINDOW_MS;
  const count = inWindow ? svc.crash.count + 1 : 1;
  const auto = svc.autoRestart && planAllowsAutoRestart(svc.plan);
  const loop = auto && count > MAX_RESTARTS;
  const crashKey = `crash:${svc._id}:${svc.runtime.containerId}`;

  if (auto && !loop) {
    const delay = backoffMs(count);
    const opId = newId('deployment');
    let outbox: string[] = [];
    const locked = await withTransaction(async (s) => {
      const res = await Service.findOneAndUpdate(
        { _id: svc._id, opGeneration: svc.opGeneration, activeOperation: null, 'runtime.containerId': svc.runtime!.containerId },
        { $inc: { opGeneration: 1 }, $set: { crash: { count, windowStart: inWindow ? svc.crash.windowStart : now, lastAt: now, backoffUntil: new Date(now.getTime() + delay) } } },
        { session: s },
      ).lean<ServiceDoc>();
      if (!res) return false;
      await Service.updateOne({ _id: svc._id }, { $set: { activeOperation: { id: opId, kind: 'restart', generation: res.opGeneration, startedAt: now, leaseUntil: new Date(now.getTime() + delay + 5 * 60_000) } } }, { session: s });
      outbox = await addToOutbox(s, [{ topic: 'runtime.restart', payload: { serviceId: svc._id, operationId: opId, generation: res.opGeneration, reason: 'crash' }, dedupeKey: `crash-restart:${opId}`, delayMs: delay }]);
      return true;
    });
    if (!locked) return;
    await dispatchNow(ctx().queues, outbox);
    await notify({ teamId: svc.teamId, serviceId: svc._id, kind: 'warning', category: 'crash', title: `${svc.name} crashed`, body: `${reason} Restarting automatically in ${Math.round(delay / 1000)}s.`, dedupeKey: crashKey });
    await publishService(svc._id);
    return;
  }

  // No automatic restart (free plan, auto-restart off, or crash loop): the service is failed.
  const res = await Service.updateOne(
    { _id: svc._id, opGeneration: svc.opGeneration, activeOperation: null, 'runtime.containerId': svc.runtime.containerId },
    { $set: { status: 'failed', startedAt: null, runtime: null, route: null, crash: { count, windowStart: inWindow ? svc.crash.windowStart : now, lastAt: now, backoffUntil: null } } },
  );
  if (res.modifiedCount !== 1) return;
  const server = await Server.findById(svc.runtime.serverId).lean<ServerDoc>();
  if (server) await (await driverFor(server)).removeContainer(svc.runtime.containerId).catch(() => {});
  await notify({
    teamId: svc.teamId,
    serviceId: svc._id,
    kind: 'error',
    category: 'crash',
    title: loop ? `${svc.name} keeps crashing` : `${svc.name} crashed`,
    body: loop ? `${reason} It crashed ${count} times in 10 minutes, so automatic restarts were paused. Check the logs, then start it again.` : `${reason} Start it again from the dashboard.`,
    dedupeKey: crashKey,
  });
  await publishService(svc._id);
}
