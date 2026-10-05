import type { Metadata } from 'next';
import Link from 'next/link';
import { Activity, ArrowRight, CalendarClock, Gauge, Globe2, ShieldCheck } from 'lucide-react';
import { ComponentGroup, IncidentCard } from '@/components/status/status-sections';
import { RegionCard, StatusBanner, StatusCharts } from '@/components/status/status-widgets';
import { UptimeLegend } from '@/components/status/uptime-legend';
import { Eyebrow } from '@/components/marketing/section-heading';
import { REGION_AREAS, REGIONS } from '@/data/regions';
import { fetchStatus } from '@/lib/api/server';

export const metadata: Metadata = {
  title: 'Status',
  description: 'Real-time and historical availability of the DIGITALYCloud platform.',
};

// Rebuilt at most once a minute from real checks and published incidents.
export const revalidate = 60;

const DAY = 86_400_000;

export default async function StatusPage() {
  const status = await fetchStatus();
  // eslint-disable-next-line react-hooks/purity -- rendered on the server once per revalidation
  const renderedAt = Date.now();
  const latencies = (status?.history ?? []).map((p) => p.latency).filter((v): v is number => v !== null);
  const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;
  const compute = new Map(
    (status?.groups.find((g) => g.name === 'Infrastructure')?.components ?? []).filter((c) => c.name.startsWith('Compute — ')).map((c) => [c.name.slice('Compute — '.length), c.state])
  );
  const regionsOnline = [...compute.values()].filter((s) => s === 'ok' || s === 'degraded').length;
  const observedDays = status?.observedSince ? Math.max(1, Math.ceil((renderedAt - status.observedSince) / DAY)) : 0;
  const incidents = status?.incidents ?? [];
  const STATS = [
    { icon: ShieldCheck, label: 'Uptime · 90 days', value: status?.overallUptime != null ? `${status.overallUptime.toFixed(3)}%` : '—' },
    { icon: Gauge, label: 'Avg. API response', value: avgLatency === null ? '—' : `${avgLatency} ms` },
    { icon: Activity, label: 'Incidents · 90 days', value: status ? String(incidents.filter((i) => i.impact !== 'maintenance').length) : '—' },
    { icon: Globe2, label: 'Regions online', value: status ? `${regionsOnline} / ${compute.size}` : '—' },
  ];
  const maintenance = status?.maintenance ?? null;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-32 sm:px-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <Eyebrow>System status</Eyebrow>
          <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl sm:leading-10">DIGITALYCloud Status</h1>
          <p className="mt-2 text-ink-300">Real-time and historical availability of the platform.</p>
        </div>
      </div>

      <StatusBanner status={status} renderedAt={renderedAt} />

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {STATS.map((s) => (
          <div key={s.label} className="card p-4">
            <s.icon className="h-4 w-4 text-ink-400" />
            <p className="mt-3 font-mono text-xl font-medium text-white">{s.value}</p>
            <p className="mt-0.5 text-xs text-ink-400">{s.label}</p>
          </div>
        ))}
      </div>

      {maintenance && (
      <div className="mt-6 flex gap-4 rounded-3xl border border-brand-500/25 bg-brand-500/[0.06] p-5 sm:p-6">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 ring-1 ring-brand-500/30">
          <CalendarClock className="h-5 w-5 text-brand-300" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-brand-300">Upcoming maintenance</p>
          <p className="mt-1 font-medium text-white">{maintenance.title}</p>
          <p className="mt-0.5 text-sm text-ink-300">{maintenance.window}</p>
          <p className="mt-2 text-sm leading-6 text-ink-300">{maintenance.body}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {maintenance.affected.map((a) => (
              <span key={a} className="rounded-md bg-white/[0.04] px-2 py-0.5 text-[11px] text-ink-300 ring-1 ring-white/[0.06]">
                {a}
              </span>
            ))}
          </div>
        </div>
      </div>
      )}

      <h3 className="mt-14 text-lg font-semibold text-white">Regions</h3>
      <div className="mt-4 space-y-8">
        {REGION_AREAS.map((area) => (
          <div key={area}>
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-ink-400">{area}</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {REGIONS.filter((r) => r.area === area).map((r) => (
                <RegionCard key={r.id} region={r} state={compute.get(r.city) ?? 'none'} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-14 flex flex-wrap items-end justify-between gap-3">
        <h3 className="text-lg font-semibold text-white">Components</h3>
        <UptimeLegend />
      </div>
      <div className="mt-4 space-y-4">
        {(status?.groups ?? []).map((g) => (
          <ComponentGroup key={g.name} name={g.name} components={g.components} observedDays={observedDays} />
        ))}
        {!status && <p className="text-sm text-ink-400">Component status is temporarily unavailable.</p>}
      </div>

      <StatusCharts history={status?.history ?? []} />

      <h3 className="mt-14 text-lg font-semibold text-white">Past incidents</h3>
      <div className="mt-4 space-y-3">
        {incidents.length === 0 && <p className="text-sm text-ink-400">{status ? 'No incidents in the last 90 days.' : '—'}</p>}
        {incidents.map((i) => (
          <IncidentCard key={`${i.date}-${i.title}`} incident={i} />
        ))}
      </div>

      <div className="mt-14 flex flex-col items-start justify-between gap-4 rounded-3xl border border-white/[0.07] bg-ink-900/60 p-6 sm:flex-row sm:items-center">
        <div>
          <p className="font-medium text-white">Having trouble that isn’t listed here?</p>
          <p className="mt-1 text-sm text-ink-300">Check the troubleshooting guide or reach out to our team.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/docs/troubleshooting" className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-ink-100 transition hover:border-white/20 hover:bg-white/[0.04]">
            Troubleshooting
          </Link>
          <Link href="/contact" className="inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-4 py-2 text-sm font-medium text-white shadow-lg shadow-brand-500/25 transition hover:brightness-110">
            Contact support <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
