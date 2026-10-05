import mongoose, { type ClientSession } from 'mongoose';

/** Global Mongoose behaviour: explicit index management, validated updates, post-update documents. */
export function configureMongoose() {
  mongoose.set('strictQuery', true);
  mongoose.set('runValidators', true);
  mongoose.set('returnDocument', 'after');
  mongoose.set('autoIndex', false);
  mongoose.set('autoCreate', false);
  mongoose.set('bufferCommands', false);
}

export async function connectMongo(uri: string, opts: { appName?: string; maxPoolSize?: number } = {}) {
  configureMongoose();
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000, appName: opts.appName ?? 'digitalycloud', maxPoolSize: opts.maxPoolSize ?? 20 });
  await assertTransactionCapable();
  return mongoose.connection;
}

/** Multi-document transactions need a replica set (or a sharded cluster); a standalone server is refused. */
export async function assertTransactionCapable() {
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB is not connected');
  const hello = await db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') {
    throw new Error('MongoDB must run as a replica set (or Atlas) because DIGITALYCloud uses multi-document transactions. See apps/backend/README.md.');
  }
}

export async function disconnectMongo() {
  await mongoose.disconnect();
}

export async function pingMongo(): Promise<boolean> {
  try {
    await mongoose.connection.db?.admin().command({ ping: 1 });
    return mongoose.connection.readyState === 1;
  } catch {
    return false;
  }
}

/**
 * Runs `fn` in a short transaction. The driver retries the callback on transient errors, so the
 * callback must only touch MongoDB (with the given session), sequentially, and never call
 * Docker, Stripe, email or queues — those happen after commit through the outbox.
 */
export async function withTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  // The driver's helper (not Mongoose's `connection.transaction`, whose document-state reset after an
  // abort conflicts with `versionKey: false` + `strict: 'throw'` and hides the original error).
  const session = await mongoose.startSession();
  try {
    let result: T;
    await session.withTransaction(
      async () => {
        result = await fn(session);
      },
      { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } },
    );
    return result!;
  } finally {
    await session.endSession();
  }
}
