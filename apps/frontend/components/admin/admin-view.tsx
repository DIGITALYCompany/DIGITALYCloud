'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Activity, AlertOctagon, Boxes, Cpu, Euro, Lock, MemoryStick, Rocket, Search, Server as ServerIcon, Users } from 'lucide-react';
import { AreaSeriesChart, BarSeriesChart, CHART_COLORS } from '@/components/charts/charts';
import { Badge, ServiceStatusBadge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Panel, StatCard } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { CardSkeleton, Skeleton } from '@/components/ui/skeleton';
import { LogoMark } from '@/components/ui/logo';
import { PageHeader } from '@/components/ui/page-header';
import { useAuth } from '@/providers/auth-provider';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { SERVICE_TYPES, getServicePlan } from '@/lib/catalog';
import { dayLabelOf, formatEuro, formatMb } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Static directory of sister products (no live data is claimed for them). */
const ECOSYSTEM = [
  { name: 'DIGITALY Cloud', desc: 'Hosting' },
  { name: 'DIGITALY ID', desc: 'Accounts & SSO' },
  { name: 'DIGITALY Studio', desc: 'Web agency' },
  { name: 'DIGITALY Pay', desc: 'Billing engine' },
];

const pctOrDash = (v: number | null, digits = 0) => (v === null ? '—' : `${v.toFixed(digits)}%`);

const COLUMNS = ['Service', 'Owner', 'Type', 'Server', 'CPU', 'RAM', 'Plan', 'Status'];

/** Internal platform dashboard, restricted to admins. */
export function AdminView() {
  const { user } = useAuth();
  const staff = user?.role === 'admin';
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const overview = useApi(() => api.admin.overview(), [], { enabled: staff });
  const revenue = useApi(() => api.admin.revenue('30d'), [], { enabled: staff });
  const daily = useApi(() => api.admin.deploymentsDaily('14d'), [], { enabled: staff });
  const top = useApi(() => api.admin.services(search || undefined), [search], { enabled: staff });
  const growth = useMemo(() => (revenue.data ?? []).map((p) => ({ t: dayLabelOf(p.ts), mrr: p.mrr, users: p.users })), [revenue.data]);
  const deploys = useMemo(() => (daily.data ?? []).map((p) => ({ t: dayLabelOf(p.ts), success: p.success, failed: p.failed })), [daily.data]);
  const rows = top.data ?? [];

  if (!staff) {
    return (
      <EmptyState
        icon={<Lock className="h-6 w-6" />}
        title="Restricted area"
        description="The Control Center is only available to DIGITALY staff."
        action={<ButtonLink href="/dashboard">Back to dashboard</ButtonLink>}
      />
    );
  }
  if (overview.error && !overview.data) return <ErrorState message={overview.error} onRetry={overview.reload} />;
  const o = overview.data;

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-1.5">
            <Badge tone="accent">Internal</Badge> DIGITALY staff only
          </span>
        }
        title={
          <>
            DIGITALYCloud <span className="text-gradient">Control Center</span>
          </>
        }
        description="Platform-wide health, revenue and activity."
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {!o ? (
          Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} rows={2} />)
        ) : (
          <>
            <StatCard label="Total users" value={o.totalUsers.toLocaleString('en-US')} icon={<Users />} sub={`+${o.newUsersThisMonth.toLocaleString('en-US')} this month`} accent />
            <StatCard label="Active services" value={o.activeServices.toLocaleString('en-US')} icon={<Boxes />} sub={o.runningPct === null ? 'No services yet' : `${o.runningPct.toFixed(1)}% running`} />
            <StatCard
              label="Servers online"
              value={`${o.serversOnline}/${o.serversTotal}`}
              icon={<ServerIcon />}
              sub={o.serversInMaintenance.length ? `${o.serversInMaintenance.join(', ')} in maintenance` : 'None in maintenance'}
            />
            <StatCard label="MRR" value={formatEuro(o.mrr)} icon={<Euro />} sub={o.mrrChangePct === null ? 'No previous month to compare' : `${o.mrrChangePct >= 0 ? '+' : ''}${o.mrrChangePct.toFixed(1)}% vs last month`} accent />
            <StatCard label="CPU utilization" value={pctOrDash(o.cpuAvg)} icon={<Cpu />} sub="Fleet average" />
            <StatCard label="RAM utilization" value={pctOrDash(o.ramAvg)} icon={<MemoryStick />} sub="Fleet average" />
            <StatCard label="New deployments" value={o.deployments14d.toLocaleString('en-US')} icon={<Rocket />} sub="Last 14 days" />
            <StatCard
              label="Failed deployments"
              value={o.failedDeployments14d.toLocaleString('en-US')}
              icon={<AlertOctagon />}
              sub={`${pctOrDash(o.failureRatePct, 1)} failure rate${o.deadLetterTasks ? ` · ${o.deadLetterTasks} dead-letter tasks` : ''}${o.overdueAccountDeletions ? ` · ${o.overdueAccountDeletions} overdue deletions` : ''}`}
            />
          </>
        )}
      </div>

      <div className="mb-6 grid gap-4 xl:grid-cols-3">
        <Panel title="Monthly recurring revenue" description="Last 30 days" className="xl:col-span-2" action={<Activity className="h-4 w-4 text-ink-400" />}>
          {revenue.loading && !revenue.data ? (
            <Skeleton className="h-[240px] w-full" />
          ) : growth.length === 0 ? (
            <div className="flex h-[240px] items-center justify-center text-sm text-ink-400">No revenue snapshots yet. The worker records one per day.</div>
          ) : (
            <AreaSeriesChart data={growth} series={[{ key: 'mrr', name: 'MRR', color: CHART_COLORS.primary, unit: ' €' }]} />
          )}
        </Panel>
        <Panel title="Deployments" description="Last 14 days">
          {daily.loading && !daily.data ? (
            <Skeleton className="h-[220px] w-full" />
          ) : (
          <BarSeriesChart
            data={deploys}
            stacked
            series={[
              { key: 'success', name: 'Succeeded', color: CHART_COLORS.primary },
              { key: 'failed', name: 'Failed', color: CHART_COLORS.accent },
            ]}
          />
          )}
        </Panel>
      </div>

      <Panel
        title="Active services"
        description="Highest resource consumers across the platform"
        bodyClass="p-0"
        className="mb-6"
        action={
          <div className="relative w-40 sm:w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input className="input h-8 py-0 pl-9 text-xs" placeholder="Search" aria-label="Search services" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        }
      >
        {top.loading && !top.data ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : top.error ? (
          <p className="px-5 py-10 text-center text-sm text-danger-400">{top.error}</p>
        ) : rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-ink-400">{search ? <>No services match &quot;{search}&quot;.</> : 'No services yet.'}</p>
        ) : (
          <>
            <table className="hidden w-full text-sm md:table">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-xs text-ink-500">
                  {COLUMNS.map((h) => (
                    <th key={h} className="px-5 py-3 font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {rows.map((s) => (
                  <tr key={s.id} className="transition hover:bg-white/[0.02]">
                    <td className="px-5 py-3.5 font-medium text-white">{s.name}</td>
                    <td className="px-5 py-3.5 text-ink-300">{s.owner}</td>
                    <td className="px-5 py-3.5 text-ink-300">{SERVICE_TYPES[s.type].label}</td>
                    <td className="px-5 py-3.5 font-mono text-ink-300">{s.server}</td>
                    <td className="px-5 py-3.5 font-mono text-white">{s.cpu.toFixed(1)}%</td>
                    <td className="px-5 py-3.5 font-mono text-white">{formatMb(s.ramMb)}</td>
                    <td className="px-5 py-3.5">
                      <Badge>{getServicePlan(s.type, s.plan).name}</Badge>
                    </td>
                    <td className="px-5 py-3.5">
                      <ServiceStatusBadge status={s.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="divide-y divide-white/[0.05] md:hidden">
              {rows.map((s) => (
                <div key={s.id} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-white">{s.name}</span>
                    <ServiceStatusBadge status={s.status} />
                  </div>
                  <p className="mt-1 text-xs text-ink-400">
                    {s.owner} · {SERVICE_TYPES[s.type].label} · {getServicePlan(s.type, s.plan).name}
                  </p>
                  <p className="mt-2 font-mono text-xs text-ink-300">
                    {s.server} · CPU {s.cpu.toFixed(1)}% · {formatMb(s.ramMb)}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </Panel>

      <Panel title="DIGITALY ecosystem" description="Sister platforms sharing accounts and infrastructure">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {ECOSYSTEM.map((e, i) => (
            <div key={e.name} className={cn('rounded-xl border p-4 transition hover:border-white/20', i === 0 ? 'border-brand-500/40 bg-brand-500/[0.05]' : 'border-white/[0.07]')}>
              <div className="flex items-center gap-2.5">
                <LogoMark size={28} />
                <div>
                  <p className="text-sm font-medium text-white">{e.name}</p>
                  <p className="text-xs text-ink-500">{e.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-ink-500">
          Public status for customers is on the{' '}
          <Link href="/status" className="text-brand-300 hover:text-brand-200">
            status page
          </Link>
          .
        </p>
      </Panel>
    </>
  );
}
