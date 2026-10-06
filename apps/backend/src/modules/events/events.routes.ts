import { Router, type Request } from 'express';
import { CONTROL_EVENTS } from '@digitalycloud/shared';
import { ctx } from '../../context';
import { Membership, Session, User } from '../../db/models';
import { requireSession, sessionUser } from '../../middleware/authenticate';
import { authorize, tenantOf } from '../../middleware/tenant';
import { compareIds, isStreamId, type HubMessage } from '../../realtime/hub';
import { KEEPALIVE_MS, claimStreamSlot, openStream, writer } from '../../realtime/sse';

const RECHECK_MS = 30_000;

/** Event ids combine both streams' positions: `<teamPosition>_<userPosition>`. */
function parseLastEventId(req: Request) {
  const raw = req.get('last-event-id');
  if (!raw) return null;
  const [t, u] = raw.split('_');
  return t && u && isStreamId(t) && isStreamId(u) ? { team: t, user: u } : null;
}

/**
 * `GET /events?team=<id>`: one stream per tab, scoped to the tab's team (EventSource cannot send
 * headers, so the team is a query parameter validated against membership). Team events
 * (services/deployments) and the user's notifications share one ordered connection.
 */
export function eventsRouter() {
  const r = Router();
  r.get('/events', requireSession, authorize('events.stream'), async (req, res) => {
    const { user, session } = sessionUser(req);
    const team = tenantOf(req).team;
    const slot = await claimStreamSlot(user._id, 'events');
    const hub = ctx().hub;
    const teamScope = { kind: 'team' as const, id: team._id };
    const userScope = { kind: 'user' as const, id: user._id };
    openStream(res);
    const out = writer(res);

    const pos = { team: '0-0', user: '0-0' };
    let live = false;
    const buffered: HubMessage[] = [];
    const deliver = (m: HubMessage) => {
      if (m.event === '__control') return void recheck();
      if (m.id) {
        const key = m.scope === 'team' ? 'team' : 'user';
        if (compareIds(m.id, pos[key]) <= 0) return; // Duplicate (replay/live overlap).
        pos[key] = m.id;
      }
      let data = m.data;
      if (m.event === 'service.updated' && data && typeof data === 'object' && 'env' in data) {
        const { env: _env, ...rest } = data as Record<string, unknown>;
        data = rest;
      }
      out.send(m.event, data, m.id ? `${pos.team}_${pos.user}` : null, { droppable: m.event === 'service.metrics' });
    };
    const onMessage = (m: HubMessage) => (live ? deliver(m) : buffered.push(m));

    const unsubTeam = await hub.subscribe(teamScope, onMessage);
    const unsubUser = await hub.subscribe(userScope, onMessage);

    const last = parseLastEventId(req);
    if (last) {
      const [t, u] = await Promise.all([hub.replay(teamScope, last.team), hub.replay(userScope, last.user)]);
      if (!t.complete || !u.complete) {
        pos.team = await hub.head(teamScope);
        pos.user = await hub.head(userScope);
        out.send(CONTROL_EVENTS.resync, { reason: 'history_trimmed' }, `${pos.team}_${pos.user}`);
      } else {
        pos.team = last.team;
        pos.user = last.user;
        const merged = [...t.messages, ...u.messages].sort((a, b) => compareIds(a.id!, b.id!));
        live = true;
        merged.forEach(deliver);
      }
    } else {
      pos.team = await hub.head(teamScope);
      pos.user = await hub.head(userScope);
      out.comment('connected');
    }
    live = true;
    buffered.splice(0).forEach(deliver);

    /** Access is revalidated periodically and whenever a control message arrives for this user. */
    let checking = false;
    async function recheck() {
      if (checking || out.closed) return;
      checking = true;
      try {
        const [s, u, m] = await Promise.all([
          Session.exists({ _id: session._id, revokedAt: null, expiresAt: { $gt: new Date() } }),
          User.exists({ _id: user._id, status: 'active' }),
          Membership.exists({ teamId: team._id, userId: user._id }),
        ]);
        if (!s || !u || !m) {
          out.send(CONTROL_EVENTS.revoked, { reason: !s || !u ? 'signed_out' : 'team_access_lost', teamId: team._id });
          cleanup();
        }
      } catch {
        // Transient database errors: try again at the next interval.
      } finally {
        checking = false;
      }
    }

    const keepalive = setInterval(() => {
      out.comment('keep-alive');
      void slot.heartbeat();
    }, KEEPALIVE_MS);
    const revalidate = setInterval(() => void recheck(), RECHECK_MS);
    let cleaned = false;
    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      clearInterval(keepalive);
      clearInterval(revalidate);
      void unsubTeam();
      void unsubUser();
      slot.release();
      out.close();
    }
    req.on('close', cleanup);
    res.on('error', cleanup);
  });
  return r;
}
