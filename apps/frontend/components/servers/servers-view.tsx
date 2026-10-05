'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Box, Cpu, Globe2, MemoryStick, Server as ServerIcon, ShieldCheck, Wrench } from 'lucide-react';
import { AreaSeriesChart, CHART_COLORS, Sparkline, type Point } from '@/components/charts/charts';
import { Badge, Dot } from '@/components/ui/badge';
import { MetricRow, Panel, StatCard } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { ProgressBar } from '@/components/ui/progress-bar';
import { CardSkeleton, Skeleton } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { getRegion } from '@/data/regions';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { formatClock, hourLabelOf, timeAgo } from '@/lib/format';
import type { Server } from '@/lib/types';

const tone = (v: number) => (v > 85 ? 'danger' : v > 70 ? 'warning' : 'brand');
const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v)}%`);
const POLL_MS = 15_000;
const REGION_COLORS = [CHART_COLORS.primary, CHART_COLORS.secondary, CHART_COLORS.accent, CHART_COLORS.green, CHART_COLORS.sky];

const STATUS_BADGE: Record<Server['status'], { tone: 'success' | 'warning' | 'danger'; label: string }> = {
  healthy: { tone: 'success', label: 'Healthy' },
  degraded: { tone: 'warning', label: 'Degraded' },
  maintenance: { tone: 'warning', label: 'Maintenance' },
  offline: { tone: 'danger', label: 'Offline' },
};

/** `samples` are the CPU values this page has polled (real readings only, nothing interpolated). */
function ServerCard({ s, samples }: { s: Server; samples: Point[] }) {
  const badge = STATUS_BADGE[s.status];
  const measured = s.cpu !== null;
  return (
    <div className="card card-hover relative overflow-hidden p-6">
      {s.status === 'healthy' && <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-brand-500/10 blur-3xl" />}
      <div className="relative flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03]">
            <ServerIcon className="h-5 w-5 text-brand-300" />
          </div>
          <div>
            <h3 className="font-mono text-lg font-medium text-white">{s.name}</h3>
            <p className="flex items-center gap-1.5 text-xs text-ink-400">
              <Globe2 className="h-3.5 w-3.5" /> {s.region}
            </p>
          </div>
        </div>
        <Badge tone={badge.tone}>
          {s.status === 'maintenance' ? <Wrench className="h-3 w-3" /> : <Dot tone={badge.tone} pulse={s.status === 'healthy'} />} {badge.label}
        </Badge>
      </div>

      <div className="relative mt-5">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-xs text-ink-400">Live CPU</span>
          <span className="font-mono text-sm text-white">{measured ? `${s.cpu!.toFixed(1)}%` : 'No recent sample'}</span>
        </div>
        {samples.length > 1 ? <Sparkline data={samples} dataKey="cpu" height={44} /> : <div className="flex h-11 items-center text-xs text-ink-500">Collecting samples…</div>}
      </div>

      <div className="relative mt-5 space-y-4">
        <MetricRow label="CPU" value={pct(s.cpu)}>
          <ProgressBar value={s.cpu ?? 0} tone={tone(s.cpu ?? 0)} />
        </MetricRow>
        <MetricRow label="RAM" value={s.ram === null ? `— of ${s.memoryGb} GB` : `${Math.round(s.ram)}% of ${s.memoryGb} GB`}>
          <ProgressBar value={s.ram ?? 0} tone={tone(s.ram ?? 0)} />
        </MetricRow>
        <MetricRow label="Storage" value={s.storage === null ? `— of ${s.diskTb} TB` : `${Math.round(s.storage)}% of ${s.diskTb} TB`}>
          <ProgressBar value={s.storage ?? 0} tone={tone(s.storage ?? 0)} />
        </MetricRow>
      </div>

      <div className="relative mt-6 grid grid-cols-3 gap-3 border-t border-white/[0.06] pt-5 text-center">
        <div>
          <p className="font-mono text-lg text-white">{s.containers ?? '—'}</p>
          <p className="text-xs text-ink-500">Containers</p>
        </div>
        <div>
          <p className="font-mono text-lg text-white">{s.cores}</p>
          <p className="text-xs text-ink-500">vCores</p>
        </div>
        <div>
          <p className="font-mono text-lg text-white">{s.uptimeDays === null ? '—' : `${s.uptimeDays}d`}</p>
          <p className="text-xs text-ink-500">Uptime</p>
        </div>
      </div>
      <p className="relative mt-4 font-mono text-[11px] text-ink-500">
        {[s.ip, s.sampledAt ? `sampled ${timeAgo(s.sampledAt)}` : 'no samples yet'].filter(Boolean).join(' · ')}
      </p>
    </div>
  );
}

export function ServersView() {
  const [history, setHistory] = useState<Record<string, Point[]>>({});
  // Each poll appends the readings it saw; cards chart only those real samples.
  const servers = useApi(
    () =>
      api.servers.list().then((list) => {
        setHistory((h) => {
          const next = { ...h };
          for (const s of list) {
            if (s.cpu === null || s.sampledAt === null) continue;
            const seen = next[s.id] ?? [];
            if (seen.at(-1)?.ts === s.sampledAt) continue;
            next[s.id] = [...seen.slice(-23), { t: formatClock(s.sampledAt), ts: s.sampledAt, cpu: s.cpu }];
          }
          return next;
        });
        return list;
      }),
    []
  );
  const load = useApi(() => api.servers.load(), []);
  const reloadServers = useRef(servers.reload);
  useEffect(() => {
    reloadServers.current = servers.reload;
  });

  // Poll for fresh readings; each card keeps the samples seen while the page is open.
  useEffect(() => {
    const t = setInterval(() => void reloadServers.current(), POLL_MS);
    return () => clearInterval(t);
  }, []);

  const list = useMemo(() => servers.data ?? [], [servers.data]);
  const regionIds = useMemo(() => [...new Set(list.map((s) => s.regionId))], [list]);
  const chart = useMemo(() => (load.data ?? []).map((p) => ({ ...p, t: hourLabelOf(p.ts) })) as Point[], [load.data]);
  const hasLoad = chart.some((p) => regionIds.some((r) => typeof p[r] === 'number'));

  if (servers.error && !servers.data) return <ErrorState message={servers.error} onRetry={servers.reload} />;

  const online = list.filter((s) => s.status === 'healthy');
  const inMaintenance = list.filter((s) => s.status === 'maintenance').length;
  const measured = online.filter((s) => s.cpu !== null && s.ram !== null);
  const containers = list.reduce((a, s) => a + (s.containers ?? 0), 0);
  const avgCpu = measured.length ? Math.round(measured.reduce((a, s) => a + s.cpu!, 0) / measured.length) : null;
  const avgRam = measured.length ? Math.round(measured.reduce((a, s) => a + s.ram!, 0) / measured.length) : null;

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Operated by DIGITALY
          </span>
        }
        title="Infrastructure"
        description="DIGITALY-owned servers. Your services run on dedicated hardware we operate ourselves."
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {servers.loading && !servers.data ? (
          Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} rows={2} />)
        ) : (
          <>
            <StatCard
              label="Servers online"
              value={`${online.length}/${list.length}`}
              icon={<ServerIcon />}
              sub={inMaintenance ? `${inMaintenance} in planned maintenance` : 'No maintenance scheduled'}
              accent
            />
            <StatCard label="Containers" value={containers} icon={<Box />} sub="Across all regions" />
            <StatCard label="Avg. CPU" value={avgCpu === null ? '—' : `${avgCpu}%`} icon={<Cpu />} sub="Healthy below 70%" />
            <StatCard label="Avg. RAM" value={avgRam === null ? '—' : `${avgRam}%`} icon={<MemoryStick />} sub="Healthy below 80%" />
          </>
        )}
      </div>

      {!servers.loading && list.length === 0 ? (
        <EmptyState icon={<ServerIcon />} title="No servers yet" description="Servers appear here once the platform team registers them." />
      ) : (
        <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((s, i) => (
            <div key={s.id} className="animate-fade-up" style={{ animationDelay: `${i * 70}ms` }}>
              <ServerCard s={s} samples={history[s.id] ?? []} />
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="CPU load by region" description="Hourly average, last 24 hours" className="xl:col-span-2" action={<Activity className="h-4 w-4 text-ink-400" />}>
          {load.loading && !load.data ? (
            <Skeleton className="h-[240px] w-full" />
          ) : load.error ? (
            <ErrorState message={load.error} onRetry={load.reload} />
          ) : !hasLoad ? (
            <div className="flex h-[240px] items-center justify-center text-sm text-ink-400">No load samples in the last 24 hours.</div>
          ) : (
            <AreaSeriesChart
              data={chart}
              yUnit="%"
              yDomain={[0, 100]}
              series={regionIds.map((r, i) => ({ key: r, name: getRegion(r)?.city ?? r, color: REGION_COLORS[i % REGION_COLORS.length], unit: '%' }))}
            />
          )}
        </Panel>
        <Panel title="Regions" description="Where your code runs">
          <div className="space-y-3">
            {regionIds.length === 0 && <p className="text-sm text-ink-400">No regions online yet.</p>}
            {regionIds.map((r) => {
              const region = getRegion(r);
              const inRegion = list.filter((s) => s.regionId === r);
              return (
                <div key={r} className="flex items-center justify-between rounded-xl border border-white/[0.07] p-4 transition hover:border-white/15">
                  <div>
                    <p className="text-sm font-medium text-white">{region ? `${region.country} — ${region.city}` : r}</p>
                    <p className="font-mono text-xs text-ink-500">{region?.code ?? r}</p>
                  </div>
                  <div className="text-right">
                    {region && (
                      <Tooltip label="Typical latency from France">
                        <p className="font-mono text-sm text-success-400">{region.latencyMs} ms</p>
                      </Tooltip>
                    )}
                    <p className="text-xs text-ink-500">
                      {inRegion.length} server{inRegion.length === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </>
  );
}
