'use client';

import { useMemo, useState } from 'react';
import { Boxes, Plus, Search, SearchX } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { CardSkeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { useAuth } from '@/providers/auth-provider';
import { useCloud } from '@/providers/cloud-provider';
import type { Service, ServiceStatus } from '@/lib/types';
import { ServiceCard } from './service-card';

type Filter = 'all' | ServiceStatus;
type Sort = 'name' | 'recent' | 'cpu' | 'ram';

const SORTERS: Record<Sort, (a: Service, b: Service) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  recent: (a, b) => b.lastDeployAt - a.lastDeployAt,
  cpu: (a, b) => b.cpu - a.cpu,
  ram: (a, b) => b.ramMb - a.ramMb,
};

export function ServicesList() {
  const { services, loading, error, reload } = useCloud();
  const { can } = useAuth();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('recent');

  const count = (s: ServiceStatus) => services.filter((x) => x.status === s).length;
  const list = useMemo(() => {
    const filtered = services.filter((s) => (filter === 'all' || s.status === filter) && s.name.toLowerCase().includes(q.toLowerCase()));
    return [...filtered].sort(SORTERS[sort]);
  }, [services, filter, q, sort]);

  return (
    <>
      <PageHeader
        title="Services"
        description="Everything you're hosting on DIGITALYCloud."
        actions={
          can('services.create') ? (
            <ButtonLink href="/services/new" icon={<Plus className="h-4 w-4" />}>
              New Service
            </ButtonLink>
          ) : undefined
        }
      />

      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs<Filter>
          value={filter}
          onChange={setFilter}
          tabs={[
            { id: 'all', label: 'All', count: services.length },
            { id: 'running', label: 'Running', count: count('running') },
            { id: 'stopped', label: 'Stopped', count: count('stopped') },
            { id: 'deploying', label: 'Deploying', count: count('deploying') },
          ]}
        />
        <div className="flex gap-2">
          <div className="relative flex-1 lg:w-64 lg:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input className="input h-10 py-0 pl-9" placeholder="Search services" aria-label="Search services" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="input h-10 w-auto py-0" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort services">
            <option value="recent">Recently deployed</option>
            <option value="name">Name A–Z</option>
            <option value="cpu">CPU usage</option>
            <option value="ram">Memory usage</option>
          </select>
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <CardSkeleton key={i} rows={5} />
          ))}
        </div>
      ) : services.length === 0 ? (
        <EmptyState
          icon={<Boxes className="h-6 w-6" />}
          title="No services yet"
          description="Deploy your first Discord bot or Node.js app. It only takes a minute."
          action={
            <ButtonLink href="/services/new" icon={<Plus className="h-4 w-4" />}>
              Create your first service
            </ButtonLink>
          }
        />
      ) : list.length === 0 ? (
        <EmptyState icon={<SearchX className="h-6 w-6" />} title="No matching services" description="Try another search term or switch the status filter." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((s) => (
            <ServiceCard key={s.id} service={s} />
          ))}
        </div>
      )}
    </>
  );
}
