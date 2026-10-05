/**
 * Docker-free local infrastructure: a persistent single-node MongoDB replica set on 127.0.0.1:27017
 * and Redis on 127.0.0.1:6379, using the same binaries as the test suite (downloaded on first run).
 * Development only. Data lives in apps/backend/.data/. Prefer `docker compose up -d` when Docker
 * is available; this exists for machines without it.
 *
 *   npm run dev:infra        (Ctrl+C stops both)
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { RedisMemoryServer } from 'redis-memory-server';

const dataDir = path.resolve(process.env.DEV_DATA_DIR ?? '.data');
const mongoDir = path.join(dataDir, 'mongo');
const redisDir = path.join(dataDir, 'redis');
mkdirSync(mongoDir, { recursive: true });
mkdirSync(redisDir, { recursive: true });

const mongo = await MongoMemoryReplSet.create({
  replSet: { name: 'rs0', count: 1, storageEngine: 'wiredTiger' },
  instanceOpts: [{ port: Number(process.env.DEV_MONGO_PORT ?? 27017), dbPath: mongoDir }],
});
const redis = await RedisMemoryServer.create({
  instance: { port: Number(process.env.DEV_REDIS_PORT ?? 6379), ip: '127.0.0.1', args: ['--dir', redisDir, '--appendonly', 'yes', '--maxmemory-policy', 'noeviction'] },
}).catch(async (err: unknown) => {
  await mongo.stop({ doCleanup: false });
  throw err;
});

console.log(`MongoDB replica set: ${mongo.getUri('digitalycloud')}`);
console.log(`Redis:               redis://${await redis.getHost()}:${await redis.getPort()}`);
console.log('Matches the defaults in .env.example. Ctrl+C to stop.');

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await mongo.stop({ doCleanup: false });
  await redis.stop();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
