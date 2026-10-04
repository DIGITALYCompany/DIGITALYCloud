'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Activity, AlertOctagon, Boxes, Cpu, Euro, Lock, MemoryStick, Rocket, Search, Server as ServerIcon, Users } from 'lucide-react';
import { AreaSeriesChart, BarSeriesChart, CHART_COLORS } from '@/components/charts/charts';
import { Badge, ServiceStatusBadge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Panel, StatCard } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LogoMark } from '@/components/ui/logo';
import { PageHeader } from '@/components/ui/page-header';
import { useAuth } from '@/providers/auth-provider';
import { ADMIN_TOP_SERVICES, SERVERS } from '@/data/seed';
import { formatEuro, formatMb } from '@/lib/format';
import { dayLabel, makeSeries } from '@/lib/simulation';
import { cn } from '@/lib/utils';
import type { ServiceStatus } from '@/lib/types';

const ECOSYSTEM = [
  { name: 'DIGITALY Cloud', desc: 'Hosting', status: 'Operational', users: '2,481' },
  { name: 'DIGITALY ID', desc: 'Accounts & SSO', status: 'Operational', users: '9,120' },
  { name: 'DIGITALY Studio', desc: 'Web agency', status: 'Operational', users: '312' },
  { name: 'DIGITALY Pay', desc: 'Billing engine', status: 'Operational', users: '—' },
];

const COLUMNS = ['Service', 'Owner', 'Type', 'Server', 'CPU', 'RAM', 'Plan', 'Status'];

/** Internal platform dashboard, restricted to admins. */
export function AdminView() {
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const growth = useMemo(
    () =>
      makeSeries('admin-mrr', 30, { mrr: { base: 11200, spread: 900 }, users: { base: 2400, spread: 120 } }, dayLabel(30)).map((p, i) => ({
        ...p,
        mrr: Math.round(9800 + i * 92 + (p.mrr as number) * 0.05),
        users: Math.round(2150 + i * 11),
      })),
    []
  );
  const deploys = useMemo(
    () =>
      makeSeries('admin-deploys', 14, { success: { base: 310, spread: 90 }, failed: { base: 14, spread: 8 } }, dayLabel(14)).map((p) => ({
        ...p,
        success: Math.round(p.success as number),
        failed: Math.round(p.failed as number),
      })),
    []
  );
  const rows = ADMIN_TOP_SERVICES.filter((s) => `${s.name} ${s.owner} ${s.server}`.toLowerCase().includes(q.toLowerCase()));

  if (user?.role !== 'admin') {
    return (
      <EmptyState
        icon={<Lock className="h-6 w-6" />}
        title="Restricted area"
        description="The Control Center is only available to DIGITALY staff."
        action={<ButtonLink href="/dashboard">Back to dashboard</ButtonLink>}
      />
    );
  }

  const online = SERVERS.filter((s) => s.status === 'healthy');
  const cpu = Math.round(online.reduce((a, s) => a + s.cpu, 0) / online.length);
  const ram = Math.round(online.reduce((a, s) => a + s.ram, 0) / online.length);

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
        <StatCard label="Total users" value="2,481" icon={<Users />} sub="+148 this month" accent />
        <StatCard label="Active services" value="3,926" icon={<Boxes />} sub="94.2% running" />
        <StatCard label="Servers online" value={`${online.length}/${SERVERS.length}`} icon={<ServerIcon />} sub="Lyon-02 in maintenance" />
        <StatCard label="MRR" value={formatEuro(12_684)} icon={<Euro />} sub="+8.4% vs August" accent />
        <StatCard label="CPU utilization" value={`${cpu}%`} icon={<Cpu />} sub="Fleet average" />
        <StatCard label="RAM utilization" value={`${ram}%`} icon={<MemoryStick />} sub="Fleet average" />
        <StatCard label="New deployments" value="4,312" icon={<Rocket />} sub="Last 14 days" />
        <StatCard label="Failed deployments" value="187" icon={<AlertOctagon />} sub="4.3% failure rate" />
      </div>

      <div className="mb-6 grid gap-4 xl:grid-cols-3">
        <Panel title="Monthly recurring revenue" description="Last 30 days" className="xl:col-span-2" action={<Activity className="h-4 w-4 text-ink-400" />}>
          <AreaSeriesChart data={growth} series={[{ key: 'mrr', name: 'MRR', color: CHART_COLORS.primary, unit: ' €' }]} />
        </Panel>
        <Panel title="Deployments" description="Last 14 days">
          <BarSeriesChart
            data={deploys}
            stacked
            series={[
              { key: 'success', name: 'Succeeded', color: CHART_COLORS.primary },
              { key: 'failed', name: 'Failed', color: CHART_COLORS.accent },
            ]}
          />
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
        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-ink-400">No services match &quot;{q}&quot;.</p>
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
                  <tr key={s.name} className="transition hover:bg-white/[0.02]">
                    <td className="px-5 py-3.5 font-medium text-white">{s.name}</td>
                    <td className="px-5 py-3.5 text-ink-300">{s.owner}</td>
                    <td className="px-5 py-3.5 text-ink-300">{s.type}</td>
                    <td className="px-5 py-3.5 font-mono text-ink-300">{s.server}</td>
                    <td className="px-5 py-3.5 font-mono text-white">{s.cpu}%</td>
                    <td className="px-5 py-3.5 font-mono text-white">{formatMb(s.ram)}</td>
                    <td className="px-5 py-3.5">
                      <Badge>{s.plan}</Badge>
                    </td>
                    <td className="px-5 py-3.5">
                      <ServiceStatusBadge status={s.status as ServiceStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="divide-y divide-white/[0.05] md:hidden">
              {rows.map((s) => (
                <div key={s.name} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-white">{s.name}</span>
                    <ServiceStatusBadge status={s.status as ServiceStatus} />
                  </div>
                  <p className="mt-1 text-xs text-ink-400">
                    {s.owner} · {s.type} · {s.plan}
                  </p>
                  <p className="mt-2 font-mono text-xs text-ink-300">
                    {s.server} · CPU {s.cpu}% · {formatMb(s.ram)}
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
              <div className="mt-4 flex items-center justify-between text-xs">
                <span className="text-success-400">{e.status}</span>
                <span className="font-mono text-ink-400">{e.users} users</span>
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
