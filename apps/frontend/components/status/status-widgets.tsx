'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, HelpCircle, RefreshCw, XCircle } from 'lucide-react';
import type { StatusResponse } from '@digitalycloud/shared';
import { AreaSeriesChart, CHART_COLORS, type Point } from '@/components/charts/charts';
import type { Region } from '@/data/regions';
import { dayLabelOf } from '@/lib/format';
import { cn } from '@/lib/utils';

const BANNER: Record<StatusResponse['current'], { title: string; body: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  ok: { title: 'All systems operational', body: 'Every monitored service and region is running normally.', tone: 'success' },
  maintenance: { title: 'Scheduled maintenance in progress', body: 'Some components are under planned maintenance.', tone: 'warning' },
  degraded: { title: 'Degraded performance', body: 'Some components are slower or partly unavailable. We are on it.', tone: 'warning' },
  outage: { title: 'Service disruption', body: 'Some components are unavailable. Updates are posted below.', tone: 'danger' },
  unknown: { title: 'Monitoring is starting', body: 'There aren’t enough checks yet to report a status.', tone: 'neutral' },
};

/** Current status with a refresh that re-renders the page from the latest `/status` data. */
export function StatusBanner({ status, renderedAt }: { status: StatusResponse | null; renderedAt: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [now, setNow] = useState(renderedAt);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const seconds = Math.max(0, Math.floor((now - renderedAt) / 1000));
  const b = status ? BANNER[status.current] : { title: 'Status unavailable', body: 'We couldn’t load the latest status. Please try again in a moment.', tone: 'neutral' as const };
  const Icon = b.tone === 'success' ? CheckCircle2 : b.tone === 'danger' ? XCircle : b.tone === 'neutral' ? HelpCircle : AlertTriangle;
  const tone = {
    success: ['border-success-500/25 from-success-500/[0.10] via-success-500/[0.04]', 'bg-success-500/15 ring-success-500/30', 'text-success-400', 'bg-success-500/20'],
    warning: ['border-warning-500/25 from-warning-500/[0.10] via-warning-500/[0.04]', 'bg-warning-500/15 ring-warning-500/30', 'text-warning-400', 'bg-warning-500/20'],
    danger: ['border-danger-500/25 from-danger-500/[0.10] via-danger-500/[0.04]', 'bg-danger-500/15 ring-danger-500/30', 'text-danger-400', 'bg-danger-500/20'],
    neutral: ['border-white/[0.08] from-white/[0.04] via-white/[0.02]', 'bg-white/[0.05] ring-white/10', 'text-ink-300', 'bg-white/[0.04]'],
  }[b.tone];

  return (
    <div className={cn('relative mt-10 overflow-hidden rounded-3xl border bg-linear-to-br/srgb to-transparent p-6 sm:p-8', tone[0])}>
      <div className={cn('pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full blur-3xl', tone[3])} />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className={cn('relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ring-1', tone[1])}>
            <Icon className={cn('relative h-7 w-7', tone[2])} />
          </div>
          <div>
            <h2 className="text-xl font-semibold leading-tight text-white sm:text-2xl sm:leading-8">{b.title}</h2>
            <p className="mt-1 text-sm text-ink-300">{b.body}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => start(() => router.refresh())}
          className="group inline-flex items-center gap-2 self-start rounded-full border border-white/10 bg-ink-950/40 px-3 py-1.5 text-xs text-ink-300 transition hover:border-white/20 hover:text-white sm:self-auto"
        >
          <RefreshCw className={cn('h-3.5 w-3.5 transition-transform duration-500 group-hover:rotate-180', pending && 'animate-spin')} />
          Updated {seconds < 5 ? 'just now' : seconds < 120 ? `${seconds}s ago` : `${Math.floor(seconds / 60)} min ago`}
        </button>
      </div>
    </div>
  );
}

const REGION_STATE = {
  ok: { dot: 'bg-success-400', label: 'Operational' },
  maintenance: { dot: 'bg-brand-400', label: 'Maintenance' },
  degraded: { dot: 'bg-warning-400', label: 'Degraded' },
  outage: { dot: 'bg-danger-500', label: 'Outage' },
  unknown: { dot: 'bg-ink-400', label: 'No data yet' },
  none: { dot: 'bg-white/20', label: 'Not available yet' },
} as const;

/** A region's compute status (from monitoring); regions without servers say so. */
export function RegionCard({ region, state }: { region: Region; state: keyof typeof REGION_STATE }) {
  const s = REGION_STATE[state];
  return (
    <div className={cn('card p-5', state === 'none' && 'opacity-60')}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-medium text-white">
            <span className="relative flex h-2 w-2">
              {state === 'ok' && <span className="absolute inset-0 animate-ping rounded-full bg-success-400 opacity-60" />}
              <span className={cn('relative h-2 w-2 rounded-full', s.dot)} />
            </span>
            {region.city}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-ink-400">
            {region.code} · {region.country}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium text-ink-200">{s.label}</p>
          <p className="mt-1 text-[11px] text-ink-500">~{region.latencyMs} ms from Paris</p>
        </div>
      </div>
    </div>
  );
}

export function StatusCharts({ history }: { history: StatusResponse['history'] }) {
  const data = useMemo<Point[]>(() => history.map((p) => ({ t: dayLabelOf(p.ts), uptime: p.uptime, latency: p.latency })), [history]);
  const hasUptime = data.some((p) => typeof p.uptime === 'number');
  const hasLatency = data.some((p) => typeof p.latency === 'number');
  const empty = <div className="flex h-[200px] items-center justify-center text-sm text-ink-400">No measurements yet.</div>;
  return (
    <div className="mt-14 grid gap-4 lg:grid-cols-2">
      <div className="card p-6">
        <h3 className="font-medium text-white">Platform uptime</h3>
        <p className="text-xs text-ink-400">REST API checks, last 30 days</p>
        <div className="mt-4">{hasUptime ? <AreaSeriesChart data={data} series={[{ key: 'uptime', name: 'Uptime', color: CHART_COLORS.green, unit: '%' }]} yDomain={[95, 100]} height={200} /> : empty}</div>
      </div>
      <div className="card p-6">
        <h3 className="font-medium text-white">API response time</h3>
        <p className="text-xs text-ink-400">Daily average, last 30 days</p>
        <div className="mt-4">{hasLatency ? <AreaSeriesChart data={data} series={[{ key: 'latency', name: 'Latency', color: CHART_COLORS.primary, unit: 'ms' }]} height={200} /> : empty}</div>
      </div>
    </div>
  );
}
