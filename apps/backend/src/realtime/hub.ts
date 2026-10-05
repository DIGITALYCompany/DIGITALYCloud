import type { Redis } from 'ioredis';
import type { EventName, EventPayloads } from '@digitalycloud/shared';

/**
 * Real-time event distribution.
 *
 * - Replayable events (service/deployment/notification) are appended to a capped Redis Stream per
 *   team or user (`XADD … MAXLEN ~ 2000`); the stream id becomes the SSE event id, so a
 *   reconnecting browser sends `Last-Event-ID` and receives what it missed.
 * - The same message is published on a Pub/Sub channel for live delivery to every API instance.
 * - High-volume `service.metrics` events are live-only (clients backfill from `/metrics?range=live`).
 *
 * Streams are bounded, not a durable history: if the cursor is older than the oldest entry the
 * stream answers `stream.resync` and the client reloads from the JSON endpoints.
 */

export type Scope = { kind: 'team'; id: string } | { kind: 'user'; id: string } | { kind: 'logs'; id: string };

export interface HubMessage {
  /** Stream entry id, or null for live-only messages. */
  id: string | null;
  scope: 'team' | 'user' | 'logs';
  event: string;
  data: unknown;
}

export type ControlMessage =
  | { type: 'session_revoked'; sessionId: string | null }
  | { type: 'membership_changed'; teamId: string }
  | { type: 'user_disabled' };

const STREAM_MAXLEN = 2000;

export class EventHub {
  private readonly listeners = new Map<string, Set<(m: HubMessage) => void>>();
  private subscriberReady: Promise<void> | null = null;

  constructor(
    private readonly redis: Redis,
    private readonly makeSubscriber: () => Redis,
    private readonly prefix: string,
  ) {}

  private sub: Redis | null = null;

  streamKey(scope: Scope) {
    return `${this.prefix}:ev:${scope.kind}:${scope.id}`;
  }

  channel(scope: Scope) {
    return `${this.prefix}:ch:${scope.kind}:${scope.id}`;
  }

  async publish<E extends EventName>(scope: Scope, event: E, data: EventPayloads[E], opts: { replay?: boolean } = {}) {
    const replay = opts.replay ?? event !== 'service.metrics';
    let id: string | null = null;
    const body = JSON.stringify(data);
    if (replay && scope.kind !== 'logs') {
      id = await this.redis.xadd(this.streamKey(scope), 'MAXLEN', '~', String(STREAM_MAXLEN), '*', 'e', event, 'd', body);
    }
    await this.redis.publish(this.channel(scope), JSON.stringify({ id, scope: scope.kind, event, data }));
    return id;
  }

  /** Live-only payload on an arbitrary scope (e.g. a service's log tail). */
  async publishRaw(scope: Scope, event: string, data: unknown) {
    await this.redis.publish(this.channel(scope), JSON.stringify({ id: null, scope: scope.kind, event, data }));
  }

  /** Control messages tell open streams of a user to re-check access immediately. */
  async control(userId: string, msg: ControlMessage) {
    await this.redis.publish(this.channel({ kind: 'user', id: userId }), JSON.stringify({ id: null, scope: 'user', event: '__control', data: msg }));
  }

  private async ensureSubscriber() {
    if (this.sub) return this.subscriberReady!;
    const sub = this.makeSubscriber();
    this.sub = sub;
    sub.on('message', (channel: string, raw: string) => {
      const set = this.listeners.get(channel);
      if (!set?.size) return;
      let msg: HubMessage;
      try {
        msg = JSON.parse(raw) as HubMessage;
      } catch {
        return;
      }
      for (const fn of [...set]) {
        try {
          fn(msg);
        } catch {
          // A broken listener must not affect others.
        }
      }
    });
    this.subscriberReady = Promise.resolve();
    return this.subscriberReady;
  }

  async subscribe(scope: Scope, fn: (m: HubMessage) => void): Promise<() => Promise<void>> {
    await this.ensureSubscriber();
    const ch = this.channel(scope);
    let set = this.listeners.get(ch);
    if (!set) {
      set = new Set();
      this.listeners.set(ch, set);
      await this.sub!.subscribe(ch);
    }
    set.add(fn);
    return async () => {
      const s = this.listeners.get(ch);
      if (!s) return;
      s.delete(fn);
      if (s.size === 0) {
        this.listeners.delete(ch);
        await this.sub?.unsubscribe(ch).catch(() => {});
      }
    };
  }

  /**
   * Entries strictly after `afterId`. `complete` is false when entries were trimmed in between
   * (the cursor is older than the stream's first entry), meaning the client must resync.
   */
  async replay(scope: Scope, afterId: string, max = 1000): Promise<{ complete: boolean; messages: HubMessage[] }> {
    const key = this.streamKey(scope);
    // Redis ≥ 7 records the highest id ever removed by trimming: if it is after the cursor, entries were lost.
    const maxDeleted = await this.maxDeletedId(key);
    if (maxDeleted && compareIds(maxDeleted, afterId) > 0) return { complete: false, messages: [] };
    const rows = await this.redis.xrange(key, `(${afterId}`, '+', 'COUNT', max + 1);
    const complete = rows.length <= max;
    return {
      complete,
      messages: rows.slice(0, max).map(([id, fields]) => ({ id, scope: scope.kind as 'team' | 'user', event: field(fields, 'e'), data: JSON.parse(field(fields, 'd')) })),
    };
  }

  /** Latest entry id of a stream (used as the starting cursor of a fresh connection). */
  async head(scope: Scope): Promise<string> {
    const last = (await this.redis.xrevrange(this.streamKey(scope), '+', '-', 'COUNT', 1))[0];
    return last?.[0] ?? '0-0';
  }

  private async maxDeletedId(key: string): Promise<string | null> {
    try {
      const info = (await this.redis.call('XINFO', 'STREAM', key)) as unknown[];
      const i = info.indexOf('max-deleted-entry-id');
      return i >= 0 ? String(info[i + 1]) : null;
    } catch {
      return null; // No such stream yet: nothing was ever trimmed.
    }
  }

  async close() {
    this.listeners.clear();
    if (this.sub) {
      this.sub.disconnect();
      this.sub = null;
      this.subscriberReady = null;
    }
  }
}

function field(fields: string[], name: string) {
  const i = fields.indexOf(name);
  return i >= 0 ? (fields[i + 1] ?? '') : '';
}

/** Compares Redis stream ids (`ms-seq`). */
export function compareIds(a: string, b: string) {
  const [am = '0', as = '0'] = a.split('-');
  const [bm = '0', bs = '0'] = b.split('-');
  const d = BigInt(am) - BigInt(bm);
  if (d !== 0n) return d > 0n ? 1 : -1;
  const s = BigInt(as) - BigInt(bs);
  return s === 0n ? 0 : s > 0n ? 1 : -1;
}

export const isStreamId = (v: string) => /^\d{1,20}-\d{1,20}$/.test(v);
