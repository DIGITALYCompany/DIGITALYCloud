'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Activity, ArrowRight, ArrowUpRight, BookOpen, Boxes, CheckCircle2, Clock, Command, Cpu, KeyRound, LifeBuoy, Loader2, MemoryStick, Plus, Rocket, Search, Users, XCircle } from 'lucide-react';
import { AreaSeriesChart, CHART_COLORS } from '@/components/charts/charts';
import { Dot } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Panel, StatCard } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/empty-state';
import { ProgressBar } from '@/components/ui/progress-bar';
import { CardSkeleton, Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/providers/auth-provider';
import { useCloud } from '@/providers/cloud-provider';
import { formatMb, greeting, timeAgo } from '@/lib/format';
import type { AppHref } from '@/lib/routes';
import { hourLabel, makeSeries } from '@/lib/simulation';
import { cn } from '@/lib/utils';
import type { ServiceStatus } from '@/lib/types';
import { AttentionBanner } from './attention-banner';
import { PlansCard } from './plans-card';
import { ServiceRow } from './service-row';

const QUICK: { href: AppHref; label: string; hint: string; icon: typeof Plus; primary?: boolean }[] = [
  { href: '/services/new', label: 'New service', hint: 'Bot, app, API or game', icon: Plus, primary: true },
  { href: '/settings?tab=api', label: 'API keys', hint: 'Automate deploys', icon: KeyRound },
  { href: '/settings?tab=team', label: 'Invite team', hint: 'Share your projects', icon: Users },
  { href: '/support', label: 'Get help', hint: 'Talk to our team', icon: LifeBuoy },
];

type Filter = 'all' | ServiceStatus;
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'running', label: 'Online' },
  { id: 'stopped', label: 'Stopped' },
  { id: 'failed', label: 'Failed' },
];

const todayLabel = () => new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

export function DashboardOverview() {
  const { user } = useAuth();
  const { services, deployments, loading, error, reload } = useCloud();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [today] = useState(todayLabel);

  const usage = useMemo(() => makeSeries('dash-usage', 24, { cpu: { base: 24, spread: 14, min: 4, max: 90 }, ram: { base: 47, spread: 8, min: 20, max: 95 } }, hourLabel(24)), []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return services.filter((s) => (filter === 'all' || s.status === filter) && (!q || s.name.toLowerCase().includes(q)));
  }, [services, filter, query]);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!user) return null;

  const online = services.filter((s) => s.status === 'running');
  const attention = services.filter((s) => s.status === 'failed' || s.status === 'stopped');
  const avgCpu = online.length ? online.reduce((sum, s) => sum + s.cpu, 0) / online.length : 0;
  const usedRam = online.reduce((sum, s) => sum + s.ramMb, 0);
  const ramLimit = services.reduce((sum, s) => sum + s.ramLimitMb, 0) || 1;
  const health = services.length ? Math.round((online.length / services.length) * 100) : 100;
  const lastDeploy = deployments[0];
  const counts: Record<Filter, number> = {
    all: services.length,
    running: online.length,
    stopped: services.filter((s) => s.status === 'stopped').length,
    failed: services.filter((s) => s.status === 'failed').length,
    deploying: 0,
  };

  return (
    <>
      <header className="relative mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink-500">{today}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {greeting()}, <span className="text-gradient">{user.firstName}</span>
          </h1>
          <p className="mt-1.5 flex items-center gap-2 text-sm text-ink-300">
            {loading ? (
              'Loading your infrastructure...'
            ) : attention.length > 0 ? (
              <>
                <Dot tone="warning" pulse /> {attention.length} service{attention.length > 1 ? 's' : ''} offline · {online.length} running fine
              </>
            ) : (
              <>
                <Dot tone="success" pulse /> All {services.length} services are running smoothly
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href="/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 px-4 text-sm font-medium text-ink-100 transition hover:border-white/20 hover:bg-white/[0.04]"
          >
            <BookOpen className="h-4 w-4" /> Docs <ArrowUpRight className="h-3.5 w-3.5 text-ink-400" />
          </a>
          <ButtonLink href="/services/new" icon={<Plus className="h-4 w-4" />}>
            New service
          </ButtonLink>
        </div>
      </header>

      {!loading && <AttentionBanner services={attention} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} rows={2} />)
        ) : (
          <>
            <StatCard
              label="Services online"
              icon={<Boxes />}
              accent
              value={
                <>
                  {online.length}
                  <span className="text-base text-ink-400"> / {services.length}</span>
                </>
              }
              sub={`${health}% healthy`}
              footer={<ProgressBar value={health} tone={health === 100 ? 'success' : health >= 70 ? 'warning' : 'danger'} />}
            />
            <StatCard label="Average CPU" icon={<Cpu />} value={`${avgCpu.toFixed(1)}%`} sub="Live, across running services" footer={<ProgressBar value={avgCpu} />} />
            <StatCard
              label="Memory in use"
              icon={<MemoryStick />}
              value={formatMb(usedRam)}
              sub={`of ${formatMb(ramLimit)} allocated`}
              footer={<ProgressBar value={(usedRam / ramLimit) * 100} />}
            />
            <StatCard
              label="Last deployment"
              icon={<Clock />}
              value={lastDeploy ? timeAgo(lastDeploy.createdAt) : '—'}
              sub={
                lastDeploy ? (
                  <span className="flex items-center gap-1.5">
                    <Dot tone={lastDeploy.status === 'success' ? 'success' : lastDeploy.status === 'failed' ? 'danger' : 'brand'} />
                    {services.find((s) => s.id === lastDeploy.serviceId)?.name ?? 'Deleted service'} · #{lastDeploy.number}
                  </span>
                ) : (
                  'No deployments yet'
                )
              }
            />
          </>
        )}
      </div>

      <nav aria-label="Quick actions" className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {QUICK.map((q) => (
          <Link
            key={q.href}
            href={q.href}
            className={cn(
              'group flex items-center gap-3 rounded-2xl border p-3.5 transition duration-200 hover:-translate-y-0.5',
              q.primary ? 'border-brand-500/30 bg-brand-500/[0.08] hover:border-brand-400/50 hover:bg-brand-500/[0.12]' : 'border-white/[0.07] bg-ink-900/60 hover:border-white/[0.14] hover:bg-ink-850'
            )}
          >
            <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', q.primary ? 'bg-brand-gradient text-white shadow-lg shadow-brand-500/30' : 'bg-white/[0.04] text-ink-200 group-hover:text-brand-300')}>
              <q.icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-white">{q.label}</span>
              <span className="block truncate text-xs text-ink-400">{q.hint}</span>
            </span>
            <ArrowRight className="ml-auto hidden h-3.5 w-3.5 shrink-0 text-ink-500 transition group-hover:translate-x-0.5 group-hover:text-white sm:block" />
          </Link>
        ))}
      </nav>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <section className="card overflow-hidden xl:col-span-2">
          <div className="flex flex-col gap-3 border-b border-white/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-medium text-white">Your services</h2>
              <p className="mt-0.5 text-xs text-ink-400">Hover a service for quick actions</p>
            </div>
            <div className="relative sm:w-56">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-500" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by name" aria-label="Filter services by name" className="input h-9 py-0 pl-8 text-xs" />
            </div>
          </div>
          <div className="flex gap-1 overflow-x-auto border-b border-white/[0.05] px-3 py-2">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition',
                  filter === f.id ? 'bg-white/[0.08] text-white' : 'text-ink-400 hover:bg-white/[0.04] hover:text-ink-100'
                )}
              >
                {f.label}
                <span className={cn('rounded-md px-1.5 font-mono text-[10px]', filter === f.id ? 'bg-brand-500/20 text-brand-200' : 'bg-white/[0.05] text-ink-400')}>{counts[f.id]}</span>
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-3 p-5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : services.length === 0 ? (
            <div className="flex flex-col items-center p-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-300">
                <Boxes className="h-5 w-5" />
              </span>
              <p className="mt-4 font-medium text-white">No services yet</p>
              <p className="mt-1 text-sm text-ink-400">Deploy a bot, an app or a game server in a few clicks.</p>
              <ButtonLink href="/services/new" size="sm" className="mt-5" icon={<Plus className="h-4 w-4" />}>
                Create your first service
              </ButtonLink>
            </div>
          ) : visible.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm text-ink-300">No services match this filter.</p>
              <button
                type="button"
                onClick={() => {
                  setFilter('all');
                  setQuery('');
                }}
                className="mt-2 text-xs font-medium text-brand-300 hover:text-brand-200"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.05]">
              {visible.slice(0, 8).map((s) => (
                <ServiceRow key={s.id} service={s} />
              ))}
            </div>
          )}

          {!loading && services.length > 0 && (
            <div className="flex items-center justify-between border-t border-white/[0.05] px-5 py-3 text-xs text-ink-400">
              <span className="hidden items-center gap-1.5 sm:flex">
                <Command className="h-3 w-3" /> Press <kbd className="rounded border border-white/10 px-1 font-mono text-[10px]">Ctrl K</kbd> to search anywhere
              </span>
              <Link href="/services" className="flex items-center gap-1 font-medium text-ink-300 hover:text-white">
                Manage all services <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          )}
        </section>

        <PlansCard services={services} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title="Resource usage"
          description="CPU and memory over the last 24 hours"
          action={
            <div className="flex gap-3 text-xs text-ink-400">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-brand-500" /> CPU
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-azure-500" /> Memory
              </span>
            </div>
          }
        >
          {loading ? (
            <Skeleton className="h-[260px] w-full" />
          ) : (
            <AreaSeriesChart
              data={usage}
              height={260}
              yUnit="%"
              yDomain={[0, 100]}
              series={[
                { key: 'cpu', name: 'CPU', color: CHART_COLORS.primary, unit: '%' },
                { key: 'ram', name: 'Memory', color: CHART_COLORS.secondary, unit: '%' },
              ]}
            />
          )}
        </Panel>

        <Panel
          title="Recent deployments"
          bodyClass="p-0"
          action={
            <Link href="/deployments" className="flex items-center gap-1 text-xs font-medium text-ink-300 hover:text-white">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          }
        >
          {loading ? (
            <div className="space-y-3 p-5">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : deployments.length === 0 ? (
            <div className="flex flex-col items-center p-10 text-center">
              <Rocket className="h-5 w-5 text-ink-500" />
              <p className="mt-3 text-sm text-ink-400">No deployments yet.</p>
            </div>
          ) : (
            <ol className="relative px-5 py-4">
              <span className="absolute bottom-6 left-[27px] top-6 w-px bg-white/[0.06]" />
              {deployments.slice(0, 5).map((d) => {
                const s = services.find((x) => x.id === d.serviceId);
                return (
                  <li key={d.id} className="relative">
                    <Link href={`/services/${d.serviceId}/deployments`} className="-mx-2 flex items-start gap-3 rounded-xl px-2 py-2.5 transition hover:bg-white/[0.03]">
                      <span className="relative z-10 mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-ink-900">
                        {d.status === 'success' ? (
                          <CheckCircle2 className="h-4 w-4 text-success-400" />
                        ) : d.status === 'failed' ? (
                          <XCircle className="h-4 w-4 text-danger-400" />
                        ) : (
                          <Loader2 className="h-4 w-4 animate-spin text-brand-300" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm text-white">{s?.name ?? 'Deleted service'}</span>
                          <span className="shrink-0 text-[11px] text-ink-500">{timeAgo(d.createdAt)}</span>
                        </span>
                        <span className="block truncate text-xs text-ink-400">
                          <span className="font-mono text-ink-500">#{d.number}</span> {d.commitMessage}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
          <a
            href="/status"
            target="_blank"
            rel="noopener noreferrer"
            className="mx-4 mb-4 flex items-center gap-3 rounded-xl border border-success-500/20 bg-success-500/[0.06] px-4 py-3 text-sm text-white transition hover:border-success-500/40"
          >
            <Activity className="h-4 w-4 text-success-400" />
            All systems operational
            <ArrowUpRight className="ml-auto h-3.5 w-3.5 text-ink-400" />
          </a>
        </Panel>
      </div>
    </>
  );
}
