'use client';

import { useMemo } from 'react';
import { Activity, Box, Cpu, Globe2, HardDrive, MemoryStick, Server as ServerIcon, ShieldCheck, Wrench, Zap } from 'lucide-react';
import { AreaSeriesChart, BarSeriesChart, CHART_COLORS, Sparkline } from '@/components/charts/charts';
import { Badge, Dot } from '@/components/ui/badge';
import { MetricRow, Panel, StatCard } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Tooltip } from '@/components/ui/tooltip';
import { useLiveSeries } from '@/hooks/use-live-series';
import { SERVERS } from '@/data/seed';
import { hourLabel, makeSeries } from '@/lib/simulation';
import type { Server } from '@/lib/types';

const tone = (v: number) => (v > 85 ? 'danger' : v > 70 ? 'warning' : 'brand');

const REGIONS = [
  { city: 'Lyon', dc: 'DIGITALY LYS-1', servers: 2, latency: 4 },
  { city: 'Paris', dc: 'DIGITALY PAR-1', servers: 1, latency: 6 },
];

function ServerCard({ s }: { s: Server }) {
  const live = useLiveSeries(`server-${s.id}`, (random) => ({ cpu: Math.max(0, s.cpu + (random() - 0.5) * 10) }), 24, 2500);
  const current = live[live.length - 1].cpu as number;
  const maintenance = s.status === 'maintenance';
  return (
    <div className="card card-hover relative overflow-hidden p-6">
      {!maintenance && <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-brand-500/10 blur-3xl" />}
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
        {maintenance ? (
          <Badge tone="warning">
            <Wrench className="h-3 w-3" /> Maintenance
          </Badge>
        ) : (
          <Badge tone="success">
            <Dot tone="success" pulse /> Healthy
          </Badge>
        )}
      </div>

      {!maintenance && (
        <div className="relative mt-5">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-xs text-ink-400">Live CPU</span>
            <span className="font-mono text-sm text-white">{current.toFixed(1)}%</span>
          </div>
          <Sparkline data={live} dataKey="cpu" height={44} />
        </div>
      )}

      <div className="relative mt-5 space-y-4">
        <MetricRow label="CPU" value={`${s.cpu}%`}>
          <ProgressBar value={s.cpu} tone={tone(s.cpu)} />
        </MetricRow>
        <MetricRow label="RAM" value={`${s.ram}% of ${s.memoryGb} GB`}>
          <ProgressBar value={s.ram} tone={tone(s.ram)} />
        </MetricRow>
        <MetricRow label="Storage" value={`${s.storage}% of ${s.diskTb} TB`}>
          <ProgressBar value={s.storage} tone={tone(s.storage)} />
        </MetricRow>
      </div>

      <div className="relative mt-6 grid grid-cols-3 gap-3 border-t border-white/[0.06] pt-5 text-center">
        <div>
          <p className="font-mono text-lg text-white">{s.containers}</p>
          <p className="text-xs text-ink-500">Containers</p>
        </div>
        <div>
          <p className="font-mono text-lg text-white">{s.cores}</p>
          <p className="text-xs text-ink-500">vCores</p>
        </div>
        <div>
          <p className="font-mono text-lg text-white">{s.uptimeDays}d</p>
          <p className="text-xs text-ink-500">Uptime</p>
        </div>
      </div>
      <p className="relative mt-4 font-mono text-[11px] text-ink-500">{s.ip} · NVMe · 10 Gbps</p>
    </div>
  );
}

export function ServersView() {
  const online = SERVERS.filter((s) => s.status === 'healthy');
  const containers = SERVERS.reduce((a, s) => a + s.containers, 0);
  const avgCpu = Math.round(online.reduce((a, s) => a + s.cpu, 0) / online.length);
  const avgRam = Math.round(online.reduce((a, s) => a + s.ram, 0) / online.length);

  const load = useMemo(() => makeSeries('infra-load', 24, { lyon: { base: 34, spread: 14, max: 100 }, paris: { base: 21, spread: 10, max: 100 } }, hourLabel(24)), []);
  const network = useMemo(() => makeSeries('infra-net', 24, { inbound: { base: 420, spread: 160 }, outbound: { base: 310, spread: 120 } }, hourLabel(24)), []);
  const scheduled = useMemo(
    () =>
      makeSeries('infra-containers', 12, { lyon: { base: 6, spread: 4 }, paris: { base: 4, spread: 3 } }, hourLabel(12)).map((p) => ({
        ...p,
        lyon: Math.round(p.lyon as number),
        paris: Math.round(p.paris as number),
      })),
    []
  );

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Operated by DIGITALY
          </span>
        }
        title="Infrastructure"
        description="DIGITALY-owned servers in France. Your services run on dedicated hardware we operate ourselves."
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Servers online" value={`${online.length}/${SERVERS.length}`} icon={<ServerIcon />} sub="1 in planned maintenance" accent />
        <StatCard label="Containers" value={containers} icon={<Box />} sub="Across all regions" />
        <StatCard label="Avg. CPU" value={`${avgCpu}%`} icon={<Cpu />} sub="Healthy below 70%" />
        <StatCard label="Avg. RAM" value={`${avgRam}%`} icon={<MemoryStick />} sub="Healthy below 80%" />
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {SERVERS.map((s, i) => (
          <div key={s.id} className="animate-fade-up" style={{ animationDelay: `${i * 70}ms` }}>
            <ServerCard s={s} />
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="CPU load by server" description="Last 24 hours" className="xl:col-span-2" action={<Activity className="h-4 w-4 text-ink-400" />}>
          <AreaSeriesChart
            data={load}
            yUnit="%"
            yDomain={[0, 100]}
            series={[
              { key: 'lyon', name: 'Lyon-01', color: CHART_COLORS.primary, unit: '%' },
              { key: 'paris', name: 'Paris-01', color: CHART_COLORS.secondary, unit: '%' },
            ]}
          />
        </Panel>
        <Panel title="Containers scheduled" description="Last 12 hours">
          <BarSeriesChart
            data={scheduled}
            stacked
            series={[
              { key: 'lyon', name: 'Lyon-01', color: CHART_COLORS.primary },
              { key: 'paris', name: 'Paris-01', color: CHART_COLORS.accent },
            ]}
          />
        </Panel>
        <Panel title="Network throughput" description="Mbps, last 24 hours" className="xl:col-span-2" action={<Zap className="h-4 w-4 text-ink-400" />}>
          <AreaSeriesChart
            data={network}
            yUnit=""
            series={[
              { key: 'inbound', name: 'Inbound', color: CHART_COLORS.sky, unit: ' Mbps' },
              { key: 'outbound', name: 'Outbound', color: CHART_COLORS.accent, unit: ' Mbps' },
            ]}
          />
        </Panel>
        <Panel title="Regions" description="Where your code runs">
          <div className="space-y-3">
            {REGIONS.map((r) => (
              <div key={r.city} className="flex items-center justify-between rounded-xl border border-white/[0.07] p-4 transition hover:border-white/15">
                <div>
                  <p className="text-sm font-medium text-white">France — {r.city}</p>
                  <p className="font-mono text-xs text-ink-500">{r.dc}</p>
                </div>
                <div className="text-right">
                  <Tooltip label="Median latency from France">
                    <p className="font-mono text-sm text-success-400">{r.latency} ms</p>
                  </Tooltip>
                  <p className="text-xs text-ink-500">{r.servers} servers</p>
                </div>
              </div>
            ))}
            <div className="flex items-center gap-2 rounded-xl border border-dashed border-white/10 p-4 text-sm text-ink-400">
              <HardDrive className="h-4 w-4" /> Marseille region coming in 2027
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}
