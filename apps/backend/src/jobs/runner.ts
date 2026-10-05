import { UnrecoverableError, Worker, type Job } from 'bullmq';
import type { AppContext } from '../context';
import { createBlockingRedis } from '../infra/redis';
import { jobsProcessed } from '../infra/metrics';
import { completeOutbox, dispatchPending, markDead, recordOutboxError } from './outbox';
import { QUEUE_NAMES, type QueueName } from './queues';
import { PERIODIC, PermanentJobError, processorFor } from './registry';

export interface RunnerOptions {
  queues?: QueueName[];
  concurrency?: Partial<Record<QueueName, number>>;
}

/**
 * Starts BullMQ workers, the outbox dispatcher and the periodic schedulers. Several worker
 * processes can run at once: queue jobs are delivered to one worker, outbox claims are leased,
 * and periodic tasks are created by job schedulers (one job per tick cluster-wide).
 */
export async function startRunner(c: AppContext, opts: RunnerOptions = {}) {
  const workers: Worker[] = [];
  const names = opts.queues ?? [...QUEUE_NAMES];
  const prefix = `${c.config.REDIS_PREFIX}:bull`;

  for (const name of names) {
    const connection = createBlockingRedis(c.config.REDIS_URL, `dgc-worker-${name}`);
    const worker = new Worker(
      name,
      async (job: Job) => {
        const fn = processorFor(job.name);
        if (!fn) throw new UnrecoverableError(`No processor for ${job.name}`);
        const data = (job.data ?? {}) as Record<string, unknown>;
        try {
          await fn(data, job);
          await completeOutbox(data.outboxId as string | undefined);
          jobsProcessed.inc({ topic: job.name, result: 'ok' });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await recordOutboxError(data.outboxId as string | undefined, message).catch(() => {});
          jobsProcessed.inc({ topic: job.name, result: 'error' });
          if (err instanceof PermanentJobError) throw new UnrecoverableError(message);
          throw err;
        }
      },
      { connection, prefix, concurrency: opts.concurrency?.[name] ?? (name === 'deployments' ? c.config.WORKER_DEPLOY_CONCURRENCY : 4), lockDuration: name === 'deployments' ? 120_000 : 60_000 },
    );
    worker.on('failed', (job, err) => {
      if (!job) return;
      const exhausted = err instanceof UnrecoverableError || job.attemptsMade >= (job.opts.attempts ?? 1);
      c.log[exhausted ? 'error' : 'warn']({ err, job: job.name, jobId: job.id, attempts: job.attemptsMade }, exhausted ? 'job dead-lettered' : 'job failed, will retry');
      if (exhausted) void markDead((job.data as { outboxId?: string })?.outboxId, err.message);
    });
    worker.on('error', (err) => c.log.error({ err, queue: name }, 'worker error'));
    workers.push(worker);
  }

  // Periodic tasks on the maintenance queue.
  if (names.includes('maintenance')) {
    const q = c.queues.get('maintenance');
    for (const [name, spec] of Object.entries(PERIODIC)) {
      await q.upsertJobScheduler(name, { every: spec.everyMs }, { name, data: {}, opts: { removeOnComplete: { count: 50 }, removeOnFail: { count: 200 }, attempts: 1 } });
    }
  }

  // Outbox dispatcher loop (leased claims; safe with several replicas).
  let running = true;
  const loop = (async () => {
    while (running) {
      try {
        const n = await dispatchPending(c.queues);
        await sleep(n > 0 ? 100 : 1000);
      } catch (err) {
        c.log.error({ err }, 'outbox dispatch failed');
        await sleep(5000);
      }
    }
  })();

  return {
    async close() {
      running = false;
      await loop;
      // `close()` waits for active jobs to finish (graceful drain); interrupted ones are retried elsewhere.
      await Promise.all(workers.map((w) => w.close()));
    },
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
