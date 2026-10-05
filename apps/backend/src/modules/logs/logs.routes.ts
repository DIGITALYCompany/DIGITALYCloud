import { Router } from 'express';
import { z } from 'zod';
import type { LogLineDto } from '@digitalycloud/shared';
import { ctx } from '../../context';
import { Membership, Service, Session, type ServiceDoc } from '../../db/models';
import { query } from '../../http/validate';
import { validation } from '../../lib/errors';
import { requireSession, sessionUser } from '../../middleware/authenticate';
import { authorize, tenantOf } from '../../middleware/tenant';
import { KEEPALIVE_MS, claimStreamSlot, openStream, writer } from '../../realtime/sse';
import { logsScope } from '../../runtime/collectors';
import { getService } from '../services/services.service';
import { history, lastLines, linesAfter, oldestSeq, parseLevels, toLine } from './logs.service';

const historySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(1000).default(200),
  before: z.coerce.number().int().min(1).optional(),
  level: z.string().max(60).optional(),
  q: z.string().max(200).optional(),
  team: z.string().max(64).optional(),
});
const streamSchema = z.strictObject({ since: z.coerce.number().int().min(0).optional(), team: z.string().max(64).optional() });

const BACKLOG = 200;
const MAX_REPLAY = 1000;

export function logsRouter() {
  const r = Router();

  r.get('/services/:id/logs', authorize('logs.read'), async (req, res) => {
    const q = query(req, historySchema);
    const levels = parseLevels(q.level);
    if (q.level && !levels) throw validation('Unknown log level.', 'level');
    const svc = await getService(tenantOf(req).team._id, String(req.params.id));
    res.json(await history(svc, { limit: q.limit, before: q.before, levels, q: q.q }));
  });

  /**
   * SSE tail. Without `since`: the last 200 lines, then live. With `since=<id>`: only lines after
   * that id (no duplicates on reconnect). If `since` is older than the retained history, a
   * `logs.reset` event is sent and the stream restarts from the last 200 lines.
   */
  r.get('/services/:id/logs/stream', requireSession, authorize('logs.stream'), async (req, res) => {
    const { since } = query(req, streamSchema);
    const team = tenantOf(req).team;
    let svc: ServiceDoc = await getService(team._id, String(req.params.id));
    const { user, session } = sessionUser(req);
    const slot = await claimStreamSlot(req, user._id, 'logs');
    openStream(res);
    const out = writer(res);
    let last = since ?? 0;
    let live = false;
    const buffered: LogLineDto[] = [];
    const send = (l: LogLineDto) => {
      if (l.id <= last) return;
      last = l.id;
      out.send('log', l, String(l.id));
    };
    const unsubscribe = await ctx().hub.subscribe(logsScope(svc._id), (m) => {
      const lines = (m.data as LogLineDto[]) ?? [];
      if (live) lines.forEach(send);
      else buffered.push(...lines);
    });

    if (since !== undefined) {
      const oldest = await oldestSeq(svc);
      if (oldest !== null && since < oldest - 1) {
        out.send('logs.reset', { reason: 'cursor_expired' });
        last = 0;
        (await lastLines(svc, BACKLOG)).map(toLine).forEach(send);
      } else {
        const rows = await linesAfter(svc, since, MAX_REPLAY);
        if (rows.length > MAX_REPLAY) {
          out.send('logs.reset', { reason: 'too_many_missed' });
          (await lastLines(svc, BACKLOG)).map(toLine).forEach(send);
        } else rows.map(toLine).forEach(send);
      }
    } else (await lastLines(svc, BACKLOG)).map(toLine).forEach(send);
    live = true;
    buffered.splice(0).forEach(send);

    const keepalive = setInterval(() => {
      out.comment('keep-alive');
      void slot.heartbeat();
    }, KEEPALIVE_MS);
    const revalidate = setInterval(async () => {
      const [s, m, fresh] = await Promise.all([
        Session.exists({ _id: session._id, revokedAt: null, expiresAt: { $gt: new Date() } }),
        Membership.exists({ teamId: team._id, userId: user._id }),
        Service.findOne({ _id: svc._id, teamId: team._id, lifecycle: 'active' }).lean<ServiceDoc>(),
      ]).catch(() => [true, true, svc] as const);
      if (!s || !m || !fresh) {
        out.send('stream.revoked', { reason: !fresh ? 'service_deleted' : 'access_lost' });
        cleanup();
      } else svc = fresh as ServiceDoc;
    }, 30_000);
    let done = false;
    function cleanup() {
      if (done) return;
      done = true;
      clearInterval(keepalive);
      clearInterval(revalidate);
      void unsubscribe();
      slot.release();
      out.close();
    }
    req.on('close', cleanup);
  });

  return r;
}
