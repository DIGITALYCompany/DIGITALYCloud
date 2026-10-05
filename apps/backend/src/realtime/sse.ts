import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { ctx } from '../context';
import { rateLimited } from '../lib/errors';
import { sseConnections } from '../infra/metrics';

export const KEEPALIVE_MS = 25_000;
const MAX_BUFFERED_BYTES = 1024 * 1024;

/** Opens an SSE response with proxy-buffering disabled. */
export function openStream(res: Response) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('retry: 5000\n\n');
}

export interface StreamWriter {
  send(event: string, data: unknown, id?: string | null, opts?: { droppable?: boolean }): void;
  comment(text: string): void;
  close(): void;
  readonly closed: boolean;
}

/**
 * Writes SSE frames with backpressure handling: droppable (high-volume) events are skipped while the
 * socket is congested, and the stream is closed if the client stops reading altogether.
 */
export function writer(res: Response): StreamWriter {
  let closed = false;
  const w: StreamWriter = {
    get closed() {
      return closed || res.writableEnded;
    },
    send(event, data, id, opts) {
      if (w.closed) return;
      if (res.writableLength > MAX_BUFFERED_BYTES) return w.close();
      if (opts?.droppable && res.writableNeedDrain) return;
      res.write(`${id ? `id: ${id}\n` : ''}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    comment(text) {
      if (!w.closed) res.write(`: ${text}\n\n`);
    },
    close() {
      if (closed) return;
      closed = true;
      res.end();
    },
  };
  return w;
}

/**
 * Concurrent SSE connections per user (Redis sorted set of heartbeats, so crashed instances'
 * entries expire on their own).
 */
export async function claimStreamSlot(req: Request, userId: string, kind: 'events' | 'logs') {
  const c = ctx();
  const key = `${c.config.REDIS_PREFIX}:sse:${kind}:${userId}`;
  const id = randomUUID();
  const now = Date.now();
  await c.redis.zremrangebyscore(key, 0, now - 3 * KEEPALIVE_MS);
  if ((await c.redis.zcard(key)) >= c.config.SSE_MAX_PER_USER) throw rateLimited(30);
  await c.redis.zadd(key, now, id);
  await c.redis.expire(key, 3600);
  sseConnections.inc({ kind });
  let released = false;
  return {
    heartbeat: () => c.redis.zadd(key, Date.now(), id).catch(() => {}),
    release: () => {
      if (released) return;
      released = true;
      sseConnections.dec({ kind });
      void c.redis.zrem(key, id).catch(() => {});
    },
  };
}
