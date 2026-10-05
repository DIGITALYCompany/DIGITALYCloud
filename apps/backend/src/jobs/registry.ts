import type { Job } from 'bullmq';
import type { Topic } from './queues';

/** Periodic maintenance tasks, scheduled once across all worker replicas by BullMQ job schedulers. */
export const PERIODIC = {
  'periodic.reconcile': { everyMs: 60_000 },
  'periodic.cleanup': { everyMs: 10 * 60_000 },
  'periodic.billing_reconcile': { everyMs: 15 * 60_000 },
  'periodic.snapshot': { everyMs: 60 * 60_000 },
  'periodic.status_probe': { everyMs: 60_000 },
  'periodic.maintenance_notify': { everyMs: 10 * 60_000 },
} as const;
export type PeriodicName = keyof typeof PERIODIC;

export type JobName = Topic | PeriodicName;
export type Processor = (data: Record<string, unknown>, job: Job) => Promise<void>;

const processors = new Map<JobName, Processor>();

export function registerProcessor(name: JobName, fn: Processor) {
  processors.set(name, fn);
}

export function processorFor(name: string): Processor | undefined {
  return processors.get(name as JobName);
}

/** Thrown by processors when retrying cannot help (bad input, deleted target). */
export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentJobError';
  }
}
