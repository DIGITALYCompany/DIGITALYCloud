import { Router } from 'express';
import { ctx } from '../../context';
import { pingMongo } from '../../db/connection';
import { verifyIndexes } from '../../db/indexes';
import { pendingMigrations } from '../../db/migrations';
import { pingRedis } from '../../infra/redis';
import { VERSION } from '../../version';

/** Liveness and readiness. Detailed readiness (capabilities, indexes) is only on the internal listener. */
export async function readiness() {
  const c = ctx();
  const [mongo, redis] = await Promise.all([pingMongo(), pingRedis(c.redis)]);
  const pending = mongo ? await pendingMigrations() : [];
  const indexes = mongo ? await verifyIndexes() : [];
  const missingCapabilities = c.config.requiredCapabilities.filter((cap) => !c.config.capabilities[cap]);
  const ready = mongo && redis && pending.length === 0 && indexes.every((i) => i.missing.length === 0) && missingCapabilities.length === 0;
  return {
    ready,
    checks: {
      mongo,
      redis,
      pendingMigrations: pending,
      missingIndexes: indexes.filter((i) => i.missing.length).map((i) => ({ collection: i.collection, missing: i.missing })),
      capabilities: c.config.capabilities,
      missingCapabilities,
    },
  };
}

export function healthRouter() {
  const r = Router();
  r.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: VERSION, time: Date.now() });
  });
  r.get('/health/ready', async (_req, res) => {
    const { ready } = await readiness();
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready' });
  });
  return r;
}
