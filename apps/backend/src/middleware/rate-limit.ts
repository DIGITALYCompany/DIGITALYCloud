import type { NextFunction, Request, Response } from 'express';
import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';
import { normalizeEmail } from '@digitalycloud/shared';
import { ctx } from '../context';
import { rateLimited, unavailable } from '../lib/errors';

/**
 * Redis-backed limits from the API reference (documented in docs/backend-decisions.md):
 * auth 10/15 min per IP and per normalized email · public forms 5/h per IP · uploads 20/h per team ·
 * sessions 600/min per user · API keys 120/min per key. Plus targeted limits for 2FA codes and
 * verification emails. Responses carry `Retry-After`.
 */
const GROUPS = {
  authIp: { points: 10, duration: 900 },
  authEmail: { points: 10, duration: 900 },
  twoFactorIp: { points: 20, duration: 900 },
  publicForm: { points: 5, duration: 3600 },
  uploads: { points: 20, duration: 3600 },
  session: { points: 600, duration: 60 },
  anonymous: { points: 600, duration: 60 },
  apiKey: { points: 120, duration: 60 },
  emailResend: { points: 3, duration: 3600 },
  invitations: { points: 30, duration: 3600 },
} as const;

export type LimitGroup = keyof typeof GROUPS;

const limiters = new Map<LimitGroup, RateLimiterRedis>();

function limiter(group: LimitGroup) {
  let l = limiters.get(group);
  if (!l) {
    const { config, redis } = ctx();
    l = new RateLimiterRedis({
      storeClient: redis,
      keyPrefix: `${config.REDIS_PREFIX}:rl:${group}`,
      points: GROUPS[group].points,
      duration: GROUPS[group].duration,
    });
    limiters.set(group, l);
  }
  return l;
}

/**
 * Consumes one point. `failClosed` limiters (auth, forms, uploads) refuse the request when Redis is
 * unavailable; the general limiter lets traffic through and logs instead.
 */
export async function consume(group: LimitGroup, key: string, opts: { failClosed?: boolean } = {}) {
  try {
    await limiter(group).consume(key, 1);
  } catch (e) {
    if (e instanceof RateLimiterRes) throw rateLimited(Math.max(1, Math.ceil(e.msBeforeNext / 1000)));
    ctx().log.warn({ err: e, group }, 'rate limiter unavailable');
    if (opts.failClosed ?? true) throw unavailable('Please try again in a moment.');
  }
}

export const clientIp = (req: Request) => req.ip ?? req.socket.remoteAddress ?? 'unknown';

export function limit(group: LimitGroup, keyOf: (req: Request) => string = clientIp) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    await consume(group, keyOf(req));
    next();
  };
}

/** Auth endpoints: per IP and, when an email is present in the body, per normalized email. */
export async function authLimit(req: Request, _res: Response, next: NextFunction) {
  await consume('authIp', clientIp(req));
  const email = (req.body as { email?: unknown } | undefined)?.email;
  if (typeof email === 'string' && email.length <= 254) await consume('authEmail', normalizeEmail(email));
  next();
}

/** General limiter after authentication: per user, per API key, or per IP. */
export async function generalLimit(req: Request, _res: Response, next: NextFunction) {
  const a = req.auth;
  if (a?.kind === 'apiKey') await consume('apiKey', a.key._id, { failClosed: false });
  else if (a?.kind === 'session') await consume('session', a.user._id, { failClosed: false });
  else await consume('anonymous', clientIp(req), { failClosed: false });
  next();
}
