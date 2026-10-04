import { makeSeries } from '@/lib/simulation';

export type DayState = 'ok' | 'maintenance' | 'degraded' | 'outage';

export interface StatusComponent {
  name: string;
  desc: string;
  uptime: number;
  events?: { daysAgo: number; state: Exclude<DayState, 'ok'>; note: string }[];
}

export const STATUS_GROUPS: { name: string; components: StatusComponent[] }[] = [
  {
    name: 'Platform',
    components: [
      { name: 'Dashboard', desc: 'cloud.digitaly.fr', uptime: 100 },
      { name: 'REST API', desc: 'api.cloud.digitaly.fr', uptime: 99.98, events: [{ daysAgo: 54, state: 'outage', note: 'Partial outage · 22 min' }] },
      { name: 'Deployments', desc: 'Build & release pipeline', uptime: 99.95, events: [{ daysAgo: 10, state: 'degraded', note: 'Delayed builds · 38 min' }] },
      { name: 'Authentication', desc: 'Sign-in & sessions', uptime: 100 },
    ],
  },
  {
    name: 'Infrastructure',
    components: [
      { name: 'Compute — Lyon', desc: 'Bots, apps & workers', uptime: 99.99, events: [{ daysAgo: 10, state: 'degraded', note: 'Build runner saturation' }] },
      { name: 'Compute — Paris', desc: 'Bots, apps & workers', uptime: 100, events: [{ daysAgo: 32, state: 'maintenance', note: 'Kernel upgrade · no downtime' }] },
      { name: 'Database', desc: 'Managed metadata store', uptime: 99.99 },
      { name: 'DNS & routing', desc: 'Service domains & HTTPS', uptime: 100 },
    ],
  },
];

export const MAINTENANCE = {
  title: 'Network upgrade — Paris region',
  window: 'Oct 14, 2026 · 02:00 – 04:00 CET',
  body: 'We are upgrading core switches in Paris. Services will be live-migrated; no downtime is expected. Deployments may queue for up to 5 minutes.',
  affected: ['Compute — Paris', 'Deployments'],
};

export interface Incident {
  date: string;
  title: string;
  impact: 'minor' | 'major' | 'maintenance';
  duration: string;
  affected: string[];
  updates: { time: string; stage: 'Investigating' | 'Identified' | 'Monitoring' | 'Resolved' | 'Scheduled' | 'Completed'; text: string }[];
}

export const INCIDENTS: Incident[] = [
  {
    date: 'Sep 24, 2026',
    title: 'Delayed deployments in Lyon',
    impact: 'minor',
    duration: '38 min',
    affected: ['Deployments', 'Compute — Lyon'],
    updates: [
      { time: '14:52', stage: 'Resolved', text: 'Build queue is back to normal. All pending deployments have completed.' },
      { time: '14:31', stage: 'Monitoring', text: 'Two additional build runners are online. Queue time is dropping.' },
      { time: '14:20', stage: 'Identified', text: 'A saturated build runner is causing queue latency of around 4 minutes.' },
      { time: '14:14', stage: 'Investigating', text: 'We are looking into slower than usual deployments in Lyon.' },
    ],
  },
  {
    date: 'Sep 02, 2026',
    title: 'Scheduled maintenance — Paris kernel upgrade',
    impact: 'maintenance',
    duration: '1h 10min',
    affected: ['Compute — Paris'],
    updates: [
      { time: '03:10', stage: 'Completed', text: 'Maintenance completed. No downtime was observed.' },
      { time: '02:00', stage: 'Scheduled', text: 'Services are being live-migrated to spare capacity while hosts are upgraded.' },
    ],
  },
  {
    date: 'Aug 11, 2026',
    title: 'Elevated API error rate',
    impact: 'major',
    duration: '22 min',
    affected: ['REST API'],
    updates: [
      { time: '10:41', stage: 'Resolved', text: 'Error rates are back to normal. A faulty configuration change was rolled back.' },
      { time: '10:27', stage: 'Identified', text: 'A configuration change caused around 12% of API requests to fail.' },
      { time: '10:19', stage: 'Investigating', text: 'We are seeing increased 5xx responses on the REST API.' },
    ],
  },
];

const ALL_COMPONENTS = STATUS_GROUPS.flatMap((g) => g.components);

/** Average uptime over the last 90 days, across all components. */
export const OVERALL_UPTIME = ALL_COMPONENTS.reduce((s, c) => s + c.uptime, 0) / ALL_COMPONENTS.length;

/** Daily platform uptime and API latency for the last 30 days (deterministic). */
export const statusHistory = (label: (i: number) => string) =>
  makeSeries('status-history', 30, { uptime: { base: 99.97, spread: 0.06, max: 100, min: 99.8 }, latency: { base: 42, spread: 18, min: 20 } }, label);
