import express, { type NextFunction, type Request, type Response } from 'express';
import type { AppContext } from './context';
import { Outbox } from './db/models';
import { safeEqual } from './lib/crypto';
import { outboxGauge, queueGauge, registry } from './infra/metrics';
import { readiness } from './modules/health/health.routes';
import { traefikConfig } from './runtime/proxy-routes';

/**
 * Private listener (bind it to a private interface): detailed readiness, Prometheus metrics and
 * the dynamic route feed for the reverse proxy. Every request needs `INTERNAL_API_TOKEN`.
 */
export function createInternalApp(c: AppContext) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req: Request, res: Response, next: NextFunction) => {
    const token = (req.get('authorization') ?? '').replace(/^Bearer /, '');
    if (!c.config.INTERNAL_API_TOKEN || !token || !safeEqual(token, c.config.INTERNAL_API_TOKEN)) {
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Not signed in' } });
      return;
    }
    next();
  });

  app.get('/internal/ready', async (_req, res) => {
    const r = await readiness();
    res.status(r.ready ? 200 : 503).json(r);
  });

  app.get('/internal/metrics', async (_req, res) => {
    const counts = await Outbox.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
    for (const s of ['pending', 'dispatched', 'completed', 'dead']) outboxGauge.set({ status: s }, counts.find((x) => x._id === s)?.n ?? 0);
    try {
      for (const [queue, states] of Object.entries(await c.queues.counts())) for (const [state, n] of Object.entries(states)) queueGauge.set({ queue, state }, n);
    } catch {
      // Redis unavailable: queue gauges keep their last values.
    }
    res.setHeader('Content-Type', registry.contentType);
    res.send(await registry.metrics());
  });

  /** Traefik HTTP provider: routes only to containers that passed their health check. */
  app.get('/internal/proxy/traefik', async (_req, res) => {
    res.json(await traefikConfig());
  });

  return app;
}
