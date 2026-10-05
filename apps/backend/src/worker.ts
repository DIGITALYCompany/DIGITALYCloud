import { bootstrap, shutdown } from './bootstrap';
import { QUEUE_NAMES, type QueueName } from './jobs/queues';
import { startRunner } from './jobs/runner';
import { registerAllProcessors } from './jobs/processors';
import { startCollectors } from './runtime/collectors';

/**
 * Worker process: queue consumers (deployments, runtime operations, email, notifications,
 * billing, webhooks, maintenance), the outbox dispatcher, reconcilers and — with the `collector`
 * role — log/metric collectors for the runtime hosts. `WORKER_ROLES` restricts what one process
 * runs (e.g. `deployments,runtime` on build workers, `collector` on dedicated collectors).
 */
async function main() {
  const c = await bootstrap('worker');
  const roles = c.config.WORKER_ROLES.length ? c.config.WORKER_ROLES : [...QUEUE_NAMES, 'collector'];
  registerAllProcessors();
  const runner = await startRunner(c, { queues: roles.filter((r): r is QueueName => (QUEUE_NAMES as readonly string[]).includes(r)) });
  const collectors = roles.includes('collector') ? await startCollectors(c) : null;
  c.log.info({ roles }, 'worker started');

  let stopping = false;
  const stop = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    c.log.info({ signal }, 'worker draining');
    const force = setTimeout(() => process.exit(1), 120_000).unref();
    await collectors?.close();
    await runner.close();
    await shutdown(c).catch(() => {});
    clearTimeout(force);
    process.exit(0);
  };
  process.on('SIGTERM', () => void stop('SIGTERM'));
  process.on('SIGINT', () => void stop('SIGINT'));
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
