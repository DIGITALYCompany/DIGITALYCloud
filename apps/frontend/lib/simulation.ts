import { formatClock } from './format';
import type { LogLine, Service } from './types';

export interface Point {
  t: string;
  [k: string]: number | string;
}

export type RandomSource = () => number;

export function seeded(seed: number): RandomSource {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function hashStr(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h) + 1;
}

/** Deterministic historical series, e.g. last 24h with hourly points. */
export function makeSeries(
  seed: string,
  points: number,
  keys: Record<string, { base: number; spread: number; min?: number; max?: number }>,
  label: (i: number) => string
): Point[] {
  const rnd = seeded(hashStr(seed));
  const state: Record<string, number> = {};
  Object.entries(keys).forEach(([k, v]) => (state[k] = v.base));
  return Array.from({ length: points }, (_, i) => {
    const p: Point = { t: label(i) };
    Object.entries(keys).forEach(([k, v]) => {
      const wave = Math.sin((i / points) * Math.PI * 2) * v.spread * 0.4;
      state[k] = state[k] + (rnd() - 0.5) * v.spread * 0.5;
      state[k] = state[k] * 0.8 + v.base * 0.2;
      p[k] = +Math.max(v.min ?? 0, Math.min(v.max ?? Infinity, state[k] + wave)).toFixed(2);
    });
    return p;
  });
}

export const hourLabel = (points: number) => (i: number) => {
  const d = new Date(Date.now() - (points - 1 - i) * 3600_000);
  return `${String(d.getHours()).padStart(2, '0')}:00`;
};

export const dayLabel = (points: number) => (i: number) => {
  const d = new Date(Date.now() - (points - 1 - i) * 86400_000);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/** "Sep 24"-style label for a day relative to today. */
export function daysAgoLabel(daysAgo: number) {
  return new Date(Date.now() - daysAgo * 86400_000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Backfilled history for a live series. Values come from a seeded random source so
 * server-rendered markup matches the first client render; new samples are random.
 */
export function liveSeriesHistory(seed: string, sample: (random: RandomSource) => Record<string, number>, length: number, intervalMs: number): Point[] {
  const random = seeded(hashStr(seed));
  const now = Date.now();
  return Array.from({ length }, (_, i) => ({ t: formatClock(now - (length - 1 - i) * intervalMs), ...sample(random) }));
}

export function liveSample(sample: (random: RandomSource) => Record<string, number>): Point {
  return { t: formatClock(Date.now()), ...sample(Math.random) };
}

const DISCORD_LINES: [LogLine['level'], string][] = [
  ['info', 'Received INTERACTION_CREATE /sync from guild 1102938475610293'],
  ['info', 'Synced 42 roles for guild "DIGITALY Community"'],
  ['debug', 'Heartbeat ACK received (latency 38ms)'],
  ['info', 'Command /ping executed by @lea.m in 12ms'],
  ['warn', 'Rate limit bucket close to limit on /channels/:id/messages'],
  ['info', 'Cached 1,284 members for guild "Nordwind"'],
  ['success', 'Scheduled task "daily-sync" completed in 1.2s'],
];
const API_LINES: [LogLine['level'], string][] = [
  ['info', 'GET /v1/members 200 in 18ms'],
  ['info', 'POST /v1/events 201 in 42ms'],
  ['info', 'GET /v1/health 200 in 2ms'],
  ['warn', 'Slow query detected on members.find (312ms)'],
  ['info', 'GET /v1/guilds/1102938475610293 200 in 24ms'],
  ['error', 'POST /v1/auth/refresh 401 in 6ms — token expired'],
  ['debug', 'Connection pool: 4 active / 10 idle'],
];

export const logPoolFor = (service: Service) => (service.type === 'discord' ? DISCORD_LINES : API_LINES);

export function bootLogs(service: Service, start: number): LogLine[] {
  const isBot = service.type === 'discord';
  const lines: [LogLine['level'], string][] = [
    ['info', `Starting ${service.name}...`],
    ['info', 'Loading environment variables...'],
    ['debug', `Runtime: Node.js ${service.nodeVersion} — ${service.region}`],
    ...(isBot
      ? ([
          ['info', 'Connecting to Discord...'],
          ['success', 'Logged in successfully'],
          ['success', 'Bot is now online'],
        ] as [LogLine['level'], string][])
      : ([
          ['info', 'Connecting to database...'],
          ['success', `Server listening on port ${service.port ?? 3000}`],
          ['success', 'Service is ready to accept requests'],
        ] as [LogLine['level'], string][])),
  ];
  return lines.map(([level, text], i) => ({ id: i, ts: start + i * 900, level, text }));
}

/** Log buffer shown when the logs view opens (boot output, recent history, shutdown tail). */
export function initialServiceLogs(service: Service): LogLine[] {
  const start = service.startedAt ?? service.lastDeployAt;
  const base = bootLogs(service, start);
  const pool = logPoolFor(service);
  const history: LogLine[] = Array.from({ length: 24 }, (_, i) => {
    const [level, text] = pool[(i * 3) % pool.length];
    return { id: 1000 + i, ts: Date.now() - (24 - i) * 47_000, level, text };
  });
  const tail: LogLine[] =
    service.status === 'stopped'
      ? [
          { id: 5000, ts: Date.now() - 60_000, level: 'warn', text: 'Received SIGTERM, shutting down gracefully' },
          { id: 5001, ts: Date.now() - 59_000, level: 'info', text: 'Process exited with code 0' },
        ]
      : [];
  return [...base, ...(service.status === 'running' ? history : []), ...tail];
}

export function randomLogLine(service: Service, id: number): LogLine {
  const pool = logPoolFor(service);
  const [level, text] = pool[Math.floor(Math.random() * pool.length)];
  return { id, ts: Date.now(), level, text };
}
