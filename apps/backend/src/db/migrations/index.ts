import { createHash, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { ensureCollectionsAndIndexes } from '../indexes';
import { MigrationLedger } from '../models';

export interface Migration {
  /** Zero-padded, ordered, never reused. */
  version: string;
  name: string;
  up: (ctx: { log: (msg: string) => void; db: mongoose.mongo.Db }) => Promise<void>;
}

/**
 * Versioned, repeatable migrations. Each must be safe to re-run after a partial failure
 * (idempotent operations only). Add new migrations at the end; never edit an applied one.
 */
export const MIGRATIONS: Migration[] = [
  {
    version: '0001',
    name: 'collections-and-indexes',
    up: async ({ log }) => ensureCollectionsAndIndexes(log),
  },
  {
    version: '0002',
    name: 'support-ticket-counter',
    // Ticket numbers start at 1000 so they look like the existing UI ("Ticket #4821" style).
    up: async ({ db }) => {
      await db.collection('counters').updateOne({ _id: 'support_ticket' as never }, { $setOnInsert: { seq: 1000 } }, { upsert: true });
    },
  },
];

const checksum = (m: Migration) => createHash('sha256').update(`${m.version}:${m.name}:${m.up.toString()}`).digest('hex').slice(0, 16);

const LOCK_ID = 'migrations';
const LOCK_TTL_MS = 10 * 60_000;

async function acquireLock(owner: string) {
  const col = mongoose.connection.db!.collection<{ _id: string; owner: string; until: Date }>('migration_lock');
  const now = new Date();
  try {
    const res = await col.findOneAndUpdate(
      { _id: LOCK_ID, $or: [{ until: { $lt: now } }, { owner }] },
      { $set: { owner, until: new Date(now.getTime() + LOCK_TTL_MS) } },
      { upsert: true, returnDocument: 'after' },
    );
    return res?.owner === owner;
  } catch (e) {
    if ((e as { code?: number }).code === 11000) return false;
    throw e;
  }
}

async function releaseLock(owner: string) {
  await mongoose.connection.db!.collection<{ _id: string; owner: string }>('migration_lock').deleteOne({ _id: LOCK_ID, owner });
}

export async function migrationStatus() {
  const applied = await MigrationLedger.find().lean<{ _id: string; checksum: string; appliedAt: Date }[]>();
  return MIGRATIONS.map((m) => {
    const a = applied.find((x) => x._id === m.version);
    return { version: m.version, name: m.name, applied: Boolean(a), appliedAt: a?.appliedAt ?? null, changed: a ? a.checksum !== checksum(m) : false };
  });
}

export async function pendingMigrations() {
  try {
    return (await migrationStatus()).filter((m) => !m.applied).map((m) => m.version);
  } catch {
    return MIGRATIONS.map((m) => m.version);
  }
}

export async function runMigrations(log: (msg: string) => void = () => {}) {
  const owner = randomUUID();
  if (!(await acquireLock(owner))) throw new Error('Another migration run holds the lock; try again shortly.');
  try {
    const db = mongoose.connection.db!;
    // The ledger itself must exist before anything else.
    if ((await db.listCollections({ name: 'migration_ledger' }, { nameOnly: true }).toArray()).length === 0) await MigrationLedger.createCollection();
    for (const m of MIGRATIONS) {
      if (await MigrationLedger.exists({ _id: m.version })) continue;
      const started = Date.now();
      log(`applying ${m.version} ${m.name}`);
      await m.up({ log, db });
      await MigrationLedger.create({ _id: m.version, name: m.name, checksum: checksum(m), appliedAt: new Date(), durationMs: Date.now() - started });
    }
  } finally {
    await releaseLock(owner);
  }
}
