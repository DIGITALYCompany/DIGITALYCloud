import { Queue, type JobsOptions } from 'bullmq';
import type { Redis } from 'ioredis';

export const QUEUE_NAMES = ['deployments', 'runtime', 'email', 'notifications', 'billing', 'webhooks', 'maintenance'] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

interface TopicSpec {
  queue: QueueName;
  attempts: number;
  backoffMs: number;
}

/**
 * Every side-effect topic, its queue and retry policy. Jobs that exhaust their attempts are
 * dead-lettered (outbox status `dead`), counted in metrics and shown in the Control Center.
 */
export const TOPICS = {
  'deploy.run': { queue: 'deployments', attempts: 3, backoffMs: 10_000 },
  'runtime.start': { queue: 'runtime', attempts: 5, backoffMs: 5_000 },
  'runtime.stop': { queue: 'runtime', attempts: 8, backoffMs: 5_000 },
  'runtime.restart': { queue: 'runtime', attempts: 5, backoffMs: 5_000 },
  'runtime.apply_limits': { queue: 'runtime', attempts: 8, backoffMs: 15_000 },
  'service.purge': { queue: 'runtime', attempts: 20, backoffMs: 30_000 },
  'email.send': { queue: 'email', attempts: 8, backoffMs: 30_000 },
  'notify.deployment': { queue: 'notifications', attempts: 5, backoffMs: 5_000 },
  'notify.event': { queue: 'notifications', attempts: 5, backoffMs: 5_000 },
  'billing.remove_item': { queue: 'billing', attempts: 20, backoffMs: 60_000 },
  'billing.cancel_subscription': { queue: 'billing', attempts: 20, backoffMs: 60_000 },
  'billing.resume_operation': { queue: 'billing', attempts: 10, backoffMs: 30_000 },
  'billing.sync_team': { queue: 'billing', attempts: 10, backoffMs: 30_000 },
  'webhook.stripe': { queue: 'webhooks', attempts: 10, backoffMs: 30_000 },
  'webhook.github': { queue: 'webhooks', attempts: 6, backoffMs: 15_000 },
  'account.delete': { queue: 'maintenance', attempts: 30, backoffMs: 60_000 },
  'upload.delete': { queue: 'maintenance', attempts: 20, backoffMs: 60_000 },
  'github.installation_removed': { queue: 'maintenance', attempts: 10, backoffMs: 30_000 },
  'apikeys.revoke_member': { queue: 'maintenance', attempts: 10, backoffMs: 10_000 },
} as const satisfies Record<string, TopicSpec>;

export type Topic = keyof typeof TOPICS;
export class Queues {
  private readonly queues = new Map<QueueName, Queue>();
  constructor(
    private readonly connection: Redis,
    private readonly prefix: string,
  ) {}

  get(name: QueueName): Queue {
    let q = this.queues.get(name);
    if (!q) {
      q = new Queue(name, { connection: this.connection, prefix: `${this.prefix}:bull` });
      this.queues.set(name, q);
    }
    return q;
  }

  async add(topic: Topic, data: Record<string, unknown>, jobId: string, extra: JobsOptions = {}) {
    const spec = TOPICS[topic];
    await this.get(spec.queue).add(topic, data, {
      jobId,
      attempts: spec.attempts,
      backoff: { type: 'exponential', delay: spec.backoffMs },
      removeOnComplete: { age: 24 * 3600, count: 5000 },
      removeOnFail: { age: 7 * 24 * 3600 },
      ...extra,
    });
  }

  async counts() {
    const out: Record<string, Record<string, number>> = {};
    for (const name of QUEUE_NAMES) out[name] = await this.get(name).getJobCounts('waiting', 'active', 'delayed', 'failed');
    return out;
  }

  async close() {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    this.queues.clear();
  }
}
