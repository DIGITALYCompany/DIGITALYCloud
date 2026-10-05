import type { NextFunction, Request, Response } from 'express';
import { ApiKey, Team, type ApiKeyDoc } from '../db/models';
import { ctx } from '../context';
import { SESSION_COOKIE, clearSessionCookie, setSessionCookie } from '../http/cookies';
import { forbidden, unauthenticated } from '../lib/errors';
import { sha256 } from '../lib/crypto';
import { resolveSession, touchSession } from '../modules/auth/sessions.service';

export const API_KEY_RE = /^dgc_live_[A-Za-z0-9]{24,64}$/;

/**
 * Resolves the principal. `Authorization: Bearer dgc_live_…` selects API-key auth and cookies are
 * then ignored entirely. Otherwise the `dgc_session` cookie is looked up (hash, expiry, revocation,
 * user status) on every request. No principal is not an error here; routes decide.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const authz = req.get('authorization');
  if (authz !== undefined) {
    const m = /^Bearer (\S+)$/.exec(authz);
    if (!m || !API_KEY_RE.test(m[1]!)) throw unauthenticated('Invalid API key.');
    const key = await ApiKey.findOne({ secretHash: sha256(m[1]!), revokedAt: null }).lean<ApiKeyDoc>();
    if (!key) throw unauthenticated('Invalid API key.');
    const team = await Team.exists({ _id: key.teamId, status: 'active' });
    if (!team) throw unauthenticated('Invalid API key.');
    req.auth = { kind: 'apiKey', key, teamId: key.teamId, scope: key.scope };
    void touchApiKey(key._id);
    return next();
  }

  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (token) {
    const found = await resolveSession(token);
    if (found) {
      req.auth = { kind: 'session', user: found.user, session: found.session };
      if (await touchSession(found.session)) setSessionCookie(res, ctx().config, token, true);
    } else {
      clearSessionCookie(res, ctx().config);
    }
  }
  next();
}

/** `lastUsed` is written at most once a minute per key; revocation checks never wait for it. */
async function touchApiKey(id: string) {
  try {
    const c = ctx();
    const ok = await c.redis.set(`${c.config.REDIS_PREFIX}:apikey:used:${id}`, '1', 'EX', 60, 'NX');
    if (ok) await ApiKey.updateOne({ _id: id }, { $set: { lastUsedAt: new Date() } });
  } catch {
    // Usage timestamps are best-effort.
  }
}

/** Requires a signed-in browser session (API keys are refused). */
export function requireSession(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) throw unauthenticated();
  if (req.auth.kind !== 'session') throw forbidden('API keys can’t use this endpoint.', 'API_KEY_NOT_ALLOWED');
  next();
}

export function sessionUser(req: Request) {
  if (req.auth?.kind !== 'session') throw unauthenticated();
  return { user: req.auth.user, session: req.auth.session };
}

/** Platform staff (`User.role === 'admin'`), checked on the server; unrelated to team roles. */
export function requireStaff(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) throw unauthenticated();
  if (req.auth.kind !== 'session' || req.auth.user.role !== 'admin') throw forbidden('The Control Center is only available to DIGITALY staff.');
  next();
}
