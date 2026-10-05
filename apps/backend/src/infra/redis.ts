import { Redis, type RedisOptions } from 'ioredis';
import { logger } from '../lib/logger';

/**
 * Connection errors are logged (at most once per 30 s per connection) instead of surfacing as
 * unhandled `error` events; ioredis keeps reconnecting and readiness reports the outage.
 */
function withErrorLog(r: Redis, name: string) {
  let last = 0;
  r.on('error', (err: Error) => {
    if (Date.now() - last < 30_000) return;
    last = Date.now();
    logger().warn({ err: { message: err.message, code: (err as { code?: string }).code }, connection: name }, 'redis connection error');
  });
  return r;
}

/**
 * Command connection (API requests, rate limits, caches, publishing). During a Redis outage,
 * commands fail after `commandTimeout` (queued ones included) so requests degrade quickly
 * instead of hanging; rate limits then fail open or closed per group.
 */
export function createRedis(url: string, name: string, extra: RedisOptions = {}) {
  return withErrorLog(new Redis(url, { connectionName: name, maxRetriesPerRequest: 3, enableReadyCheck: true, commandTimeout: 1500, ...extra }), name);
}

/** BullMQ workers need blocking connections that never give up retrying. */
export function createBlockingRedis(url: string, name: string) {
  return withErrorLog(new Redis(url, { connectionName: name, maxRetriesPerRequest: null, enableReadyCheck: false }), name);
}

export async function pingRedis(r: Redis): Promise<boolean> {
  try {
    return (await r.ping()) === 'PONG';
  } catch {
    return false;
  }
}

export type { Redis };
