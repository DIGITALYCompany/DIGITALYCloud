import mongoose from 'mongoose';
import { getRegion, type DayState, type StatusComponentDto, type StatusResponse } from '@digitalycloud/shared';
import { ctx } from '../../context';
import { AvailabilitySample, Incident, Maintenance, Server, type AvailabilitySampleDoc, type IncidentDoc, type MaintenanceDoc, type ServerDoc } from '../../db/models';
import { HEARTBEAT_STALE_MS } from '../../runtime/capacity';

const DAY = 86400_000;
const BUCKET_MS = 5 * 60_000;

export const PLATFORM_COMPONENTS = [
  { name: 'Dashboard', desc: 'cloud.digitaly.fr' },
  { name: 'REST API', desc: 'api.cloud.digitaly.fr' },
  { name: 'Deployments', desc: 'Build & release pipeline' },
  { name: 'Authentication', desc: 'Sign-in & sessions' },
];

/** Records one observation into its 5-minute bucket. */
export async function recordObservation(component: string, up: boolean, latencyMs: number) {
  const ts = new Date(Math.floor(Date.now() / BUCKET_MS) * BUCKET_MS);
  await AvailabilitySample.updateOne({ component, ts }, { $inc: { up: up ? 1 : 0, checks: 1, latencyMsTotal: Math.max(0, Math.round(latencyMs)) } }, { upsert: true });
}

async function timed(fn: () => Promise<boolean>) {
  const t0 = Date.now();
  try {
    return { up: await fn(), ms: Date.now() - t0 };
  } catch {
    return { up: false, ms: Date.now() - t0 };
  }
}

const ok = async (url: string) => (await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5000) })).status < 500;

/** Status prober (worker, every minute): real checks only; components it cannot check have no samples. */
export async function probeStatus() {
  const c = ctx().config;
  const api = c.API_PUBLIC_URL.replace(/\/$/, '');
  const rest = await timed(() => ok(`${api}/v1/health`));
  await recordObservation('REST API', rest.up, rest.ms);
  const auth = await timed(async () => (await fetch(`${api}/v1/auth/session`, { signal: AbortSignal.timeout(5000) })).status === 200);
  await recordObservation('Authentication', auth.up, auth.ms);
  const dash = await timed(() => ok(c.FRONTEND_URL));
  await recordObservation('Dashboard', dash.up, dash.ms);
  const db = await timed(async () => Boolean(await mongoose.connection.db?.admin().command({ ping: 1 })));
  await recordObservation('Database', db.up, db.ms);
  const dep = await timed(async () => {
    const counts = await ctx().queues.get('deployments').getJobCounts('waiting');
    return (counts.waiting ?? 0) < 100;
  });
  await recordObservation('Deployments', dep.up, dep.ms);
  const servers = await Server.find({ demo: false }).lean<ServerDoc[]>();
  for (const regionId of new Set(servers.map((s) => s.regionId))) {
    const inRegion = servers.filter((s) => s.regionId === regionId);
    const healthy = inRegion.some((s) => s.status === 'healthy' && s.lastHeartbeatAt && Date.now() - s.lastHeartbeatAt.getTime() < HEARTBEAT_STALE_MS);
    await recordObservation(`Compute — ${getRegion(regionId)?.city ?? regionId}`, healthy, 0);
  }
}

function stateOf(ratio: number): DayState {
  return ratio >= 0.999 ? 'ok' : ratio >= 0.95 ? 'degraded' : 'outage';
}

async function component(name: string, desc: string, incidents: IncidentDoc[]): Promise<StatusComponentDto> {
  const since = new Date(Date.now() - 90 * DAY);
  const rows = await AvailabilitySample.find({ component: name, ts: { $gte: since } }).sort({ ts: 1 }).lean<AvailabilitySampleDoc[]>();
  if (!rows.length) return { name, desc, uptime: null, state: 'unknown', events: [] };
  const up = rows.reduce((a, r) => a + r.up, 0);
  const checks = rows.reduce((a, r) => a + r.checks, 0);
  const byDay = new Map<number, { up: number; checks: number }>();
  for (const r of rows) {
    const d = Math.floor((Date.now() - r.ts.getTime()) / DAY);
    const cur = byDay.get(d) ?? { up: 0, checks: 0 };
    cur.up += r.up;
    cur.checks += r.checks;
    byDay.set(d, cur);
  }
  const events: StatusComponentDto['events'] = [];
  for (const [daysAgo, v] of byDay) {
    const st = stateOf(v.up / v.checks);
    if (st !== 'ok') events.push({ daysAgo, state: st, note: `${Math.round(((v.checks - v.up) / v.checks) * 100)}% of checks failed` });
  }
  for (const i of incidents.filter((x) => x.components.includes(name) && x.impact === 'maintenance')) {
    events.push({ daysAgo: Math.floor((Date.now() - i.startedAt.getTime()) / DAY), state: 'maintenance', note: i.title });
  }
  const last = rows[rows.length - 1]!;
  return { name, desc, uptime: Math.round((up / checks) * 10000) / 100, state: Date.now() - last.ts.getTime() < 15 * 60_000 ? stateOf(last.up / last.checks) : 'unknown', events };
}

const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric', timeZone: 'Europe/Paris' });
const fmtTime = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
function duration(ms: number) {
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)}h ${m % 60}min` : `${Math.floor(m / 60)}h`;
}

/** `GET /status`: built only from observations and published incidents — never invented history. */
export async function statusPage(): Promise<StatusResponse> {
  const incidents = await Incident.find({ startedAt: { $gte: new Date(Date.now() - 90 * DAY) } }).sort({ startedAt: -1 }).lean<IncidentDoc[]>();
  const servers = await Server.find({ demo: false }).lean<ServerDoc[]>();
  const regions = [...new Set(servers.map((s) => s.regionId))];
  const platform = await Promise.all(PLATFORM_COMPONENTS.map((p) => component(p.name, p.desc, incidents)));
  const infra = await Promise.all([
    ...regions.map((r) => component(`Compute — ${getRegion(r)?.city ?? r}`, 'Bots, apps & workers', incidents)),
    component('Database', 'Managed metadata store', incidents),
  ]);
  const all = [...platform, ...infra].filter((x) => x.uptime !== null);
  const now = new Date();
  const maint = await Maintenance.findOne({ endsAt: { $gte: now } }).sort({ startsAt: 1 }).lean<MaintenanceDoc>();
  const historyStart = Math.floor(Date.now() / DAY) * DAY - 29 * DAY;
  const api = await AvailabilitySample.find({ component: 'REST API', ts: { $gte: new Date(historyStart) } }).lean<AvailabilitySampleDoc[]>();
  const history = Array.from({ length: 30 }, (_, i) => {
    const from = historyStart + i * DAY;
    const day = api.filter((r) => r.ts.getTime() >= from && r.ts.getTime() < from + DAY);
    const checks = day.reduce((a, r) => a + r.checks, 0);
    return { ts: from, uptime: checks ? Math.round((day.reduce((a, r) => a + r.up, 0) / checks) * 10000) / 100 : null, latency: checks ? Math.round(day.reduce((a, r) => a + r.latencyMsTotal, 0) / checks) : null };
  });
  const first = await AvailabilitySample.findOne().sort({ ts: 1 }).lean<AvailabilitySampleDoc>();
  const states = [...platform, ...infra].map((x) => x.state);
  return {
    overallUptime: all.length ? Math.round((all.reduce((a, x) => a + x.uptime!, 0) / all.length) * 1000) / 1000 : null,
    current: states.includes('outage') ? 'outage' : states.includes('degraded') ? 'degraded' : states.every((s) => s === 'unknown') ? 'unknown' : 'ok',
    groups: [
      { name: 'Platform', components: platform },
      { name: 'Infrastructure', components: infra },
    ],
    maintenance: maint ? { title: maint.title, window: `${fmtDate(maint.startsAt)} · ${fmtTime(maint.startsAt)} – ${fmtTime(maint.endsAt)} CET`, body: maint.body, affected: maint.affected } : null,
    incidents: incidents.map((i) => ({
      date: fmtDate(i.startedAt),
      title: i.title,
      impact: i.impact,
      duration: i.resolvedAt ? duration(i.resolvedAt.getTime() - i.startedAt.getTime()) : 'Ongoing',
      affected: i.components,
      updates: [...i.updates].sort((a, b) => b.at.getTime() - a.at.getTime()).map((u) => ({ time: fmtTime(u.at), stage: u.stage, text: u.text })),
    })),
    history,
    observedSince: first?.ts.getTime() ?? null,
  };
}
