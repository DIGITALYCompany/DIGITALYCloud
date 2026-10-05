import type { ClientSession } from 'mongoose';
import { Outbox, type OutboxDoc } from '../db/models';
import { newId } from '../lib/ids';
import { TOPICS, type Queues, type Topic } from './queues';

const COMPLETED_TTL_MS = 7 * 24 * 3600_000;
/** A dispatched record not completed after this long is assumed lost and dispatched again. */
const REDISPATCH_AFTER_MS = 15 * 60_000;
const LEASE_MS = 30_000;

export interface OutboxEntry {
  topic: Topic;
  payload: Record<string, unknown>;
  dedupeKey?: string;
  delayMs?: number;
}

/**
 * Writes outbox records inside the caller's transaction. Returns their ids so the caller can
 * dispatch them right after commit (the background dispatcher picks up anything missed).
 */
export async function addToOutbox(session: ClientSession | null, entries: OutboxEntry[]): Promise<string[]> {
  if (entries.length === 0) return [];
  const now = Date.now();
  const docs: OutboxDoc[] = entries.map((e) => ({
    _id: newId('outbox'),
    topic: e.topic,
    payload: e.payload,
    dedupeKey: e.dedupeKey ?? null,
    status: 'pending',
    attempts: 0,
    availableAt: new Date(now + (e.delayMs ?? 0)),
    lockedUntil: null,
    lastError: null,
    createdAt: new Date(now),
    dispatchedAt: null,
    completedAt: null,
    expiresAt: null,
  }));
  await Outbox.insertMany(docs, { session: session ?? undefined, ordered: true });
  return docs.map((d) => d._id);
}

/** Claims one record with a short lease so concurrent dispatchers never enqueue it twice at once. */
async function claim(filter: Record<string, unknown>): Promise<OutboxDoc | null> {
  const now = new Date();
  return Outbox.findOneAndUpdate(
    { ...filter, $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }] },
    { $set: { lockedUntil: new Date(now.getTime() + LEASE_MS) } },
    { sort: { availableAt: 1 } },
  ).lean<OutboxDoc>();
}

async function enqueue(queues: Queues, doc: OutboxDoc) {
  const jobId = doc.attempts === 0 ? doc._id : `${doc._id}-r${doc.attempts}`;
  const delay = Math.max(0, doc.availableAt.getTime() - Date.now());
  await queues.add(doc.topic as Topic, { outboxId: doc._id, ...doc.payload }, jobId, delay ? { delay } : {});
  await Outbox.updateOne(
    { _id: doc._id, status: { $in: ['pending', 'dispatched'] } },
    { $set: { status: 'dispatched', dispatchedAt: new Date(), lockedUntil: null }, $inc: { attempts: 1 } },
  );
}

/** Best-effort immediate dispatch after commit. Failures are fine: the dispatcher retries. */
export async function dispatchNow(queues: Queues, ids: string[]) {
  for (const id of ids) {
    try {
      const doc = await claim({ _id: id, status: 'pending' });
      if (doc) await enqueue(queues, doc);
    } catch {
      // Left pending; the background dispatcher will pick it up.
    }
  }
}

/** One dispatcher pass: pending records that are due, then dispatched records that look lost. */
export async function dispatchPending(queues: Queues, limit = 200): Promise<number> {
  let n = 0;
  for (; n < limit; n++) {
    const doc = await claim({ status: 'pending', availableAt: { $lte: new Date() } });
    if (!doc) break;
    await enqueue(queues, doc);
  }
  for (let i = 0; i < 50; i++) {
    const stale = await claim({ status: 'dispatched', dispatchedAt: { $lt: new Date(Date.now() - REDISPATCH_AFTER_MS) } });
    if (!stale) break;
    const spec = TOPICS[stale.topic as Topic];
    if (!spec || stale.attempts >= spec.attempts * 3) {
      await markDead(stale._id, 'Dispatched repeatedly without completing');
      continue;
    }
    // Only re-enqueue if the queue no longer has a live job for it.
    const queue = queues.get(spec.queue);
    const jobId = stale.attempts <= 1 ? stale._id : `${stale._id}-r${stale.attempts - 1}`;
    const job = await queue.getJob(jobId);
    const state = job ? await job.getState() : 'missing';
    if (state === 'waiting' || state === 'active' || state === 'delayed' || state === 'prioritized' || state === 'waiting-children') {
      await Outbox.updateOne({ _id: stale._id }, { $set: { dispatchedAt: new Date(), lockedUntil: null } });
      continue;
    }
    await enqueue(queues, stale);
    n++;
  }
  return n;
}

export async function completeOutbox(id: string | undefined) {
  if (!id) return;
  await Outbox.updateOne(
    { _id: id, status: { $ne: 'completed' } },
    { $set: { status: 'completed', completedAt: new Date(), lockedUntil: null, expiresAt: new Date(Date.now() + COMPLETED_TTL_MS) } },
  );
}

export async function recordOutboxError(id: string | undefined, error: string) {
  if (!id) return;
  await Outbox.updateOne({ _id: id }, { $set: { lastError: error.slice(0, 1000) } });
}

export async function markDead(id: string | undefined, error: string) {
  if (!id) return;
  await Outbox.updateOne({ _id: id, status: { $ne: 'completed' } }, { $set: { status: 'dead', lastError: error.slice(0, 1000), lockedUntil: null } });
}
