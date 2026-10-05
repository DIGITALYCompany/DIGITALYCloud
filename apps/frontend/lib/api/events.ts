import { CONTROL_EVENTS, EVENT_NAMES, type EventName, type EventPayloads } from '@digitalycloud/shared';
import { apiUrl } from './http-client';

type Handler<E extends EventName> = (data: EventPayloads[E]) => void;
type ControlHandler = (kind: 'resync' | 'revoked' | 'closed') => void;

/**
 * One `GET /events?team=` stream per tab, shared by every subscriber. The browser reconnects by
 * itself after network errors and sends `Last-Event-ID`, so the server replays what was missed.
 * When replay is impossible the server sends `stream.resync` and subscribers reload their state.
 * A refused connection (signed out, removed from the team, too many streams) closes the
 * EventSource; we report `closed` and retry with backoff, after which state is reloaded too.
 */
class EventStream {
  private source: EventSource | null = null;
  private team: string | null = null;
  private handlers = new Map<EventName, Set<(data: unknown) => void>>();
  private control = new Set<ControlHandler>();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private stopped = true;

  connect(team: string) {
    if (this.team === team && this.source && this.source.readyState !== EventSource.CLOSED && !this.stopped) return;
    this.disconnect();
    this.team = team;
    this.stopped = false;
    this.open(false);
  }

  disconnect() {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.source?.close();
    this.source = null;
    this.team = null;
  }

  on<E extends EventName>(name: E, handler: Handler<E>) {
    let set = this.handlers.get(name);
    if (!set) this.handlers.set(name, (set = new Set()));
    set.add(handler as (data: unknown) => void);
    return () => void set.delete(handler as (data: unknown) => void);
  }

  onControl(handler: ControlHandler) {
    this.control.add(handler);
    return () => void this.control.delete(handler);
  }

  private emitControl(kind: 'resync' | 'revoked' | 'closed') {
    this.control.forEach((h) => h(kind));
  }

  private open(isRetry: boolean) {
    if (this.stopped || !this.team) return;
    const source = new EventSource(apiUrl('/events', { team: this.team }, false), { withCredentials: true });
    this.source = source;
    source.addEventListener('open', () => {
      this.attempts = 0;
      // A fresh EventSource cannot resume from the old cursor: subscribers reload instead.
      if (isRetry) this.emitControl('resync');
      isRetry = false;
    });
    for (const name of EVENT_NAMES) {
      source.addEventListener(name, (e) => {
        let data: unknown;
        try {
          data = JSON.parse((e as MessageEvent<string>).data);
        } catch {
          return;
        }
        this.handlers.get(name)?.forEach((h) => h(data));
      });
    }
    source.addEventListener(CONTROL_EVENTS.resync, () => this.emitControl('resync'));
    source.addEventListener(CONTROL_EVENTS.revoked, () => {
      source.close();
      this.emitControl('revoked');
    });
    source.addEventListener('error', () => {
      // CONNECTING: the browser is already retrying with Last-Event-ID. CLOSED: it gave up.
      if (source.readyState !== EventSource.CLOSED || this.stopped || this.source !== source) return;
      this.emitControl('closed');
      const delay = Math.min(30_000, 1000 * 2 ** this.attempts++) + Math.random() * 500;
      this.retryTimer = setTimeout(() => this.open(true), delay);
    });
  }
}

export const events = new EventStream();
