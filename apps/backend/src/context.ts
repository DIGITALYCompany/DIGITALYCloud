import type { Logger } from 'pino';
import type { Redis } from 'ioredis';
import type { AppConfig } from './config/env';
import { Cipher, SecretBox } from './lib/crypto';
import { createRedis } from './infra/redis';
import { Queues } from './jobs/queues';
import { EventHub } from './realtime/hub';
import type { Integrations } from './integrations';

/**
 * Process-wide dependencies. Domain services read them through `ctx()` so they stay free of
 * Express objects.
 */
export interface AppContext {
  config: AppConfig;
  log: Logger;
  cipher: Cipher;
  secrets: SecretBox;
  redis: Redis;
  hub: EventHub;
  queues: Queues;
  integrations: Integrations;
  /** Closes connections opened by this context (Redis, queues, subscriber). */
  close(): Promise<void>;
}

let current: AppContext | null = null;

export function ctx(): AppContext {
  if (!current) throw new Error('Application context is not initialised');
  return current;
}

export function setContext(c: AppContext | null) {
  current = c;
}

export function createContext(config: AppConfig, log: Logger, integrations: Integrations): AppContext {
  const redis = createRedis(config.REDIS_URL, 'dgc-commands');
  const subscribers: Redis[] = [];
  const hub = new EventHub(
    redis,
    () => {
      const s = createRedis(config.REDIS_URL, 'dgc-subscriber', { maxRetriesPerRequest: null, commandTimeout: undefined });
      subscribers.push(s);
      return s;
    },
    config.REDIS_PREFIX,
  );
  const queues = new Queues(redis, config.REDIS_PREFIX);
  return {
    config,
    log,
    cipher: new Cipher(config.keyRing),
    secrets: new SecretBox(config.APP_SECRET),
    redis,
    hub,
    queues,
    integrations,
    async close() {
      await hub.close();
      await queues.close();
      for (const s of subscribers) s.disconnect();
      redis.disconnect();
    },
  };
}
