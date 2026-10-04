'use client';

import { useMemo, useState } from 'react';
import { Rocket, SearchX } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { CardSkeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { DeploymentItem } from '@/components/services/deployment-item';
import { useCloud } from '@/providers/cloud-provider';
import type { DeploymentStatus } from '@/lib/types';

type Filter = 'all' | DeploymentStatus;

export function DeploymentsView() {
  const { deployments, services, loading, error, reload } = useCloud();
  const [filter, setFilter] = useState<Filter>('all');
  const [serviceId, setServiceId] = useState('all');

  const names = useMemo(() => Object.fromEntries(services.map((s) => [s.id, s.name])), [services]);
  const list = useMemo(
    () => deployments.filter((d) => (filter === 'all' || d.status === filter) && (serviceId === 'all' || d.serviceId === serviceId)).sort((a, b) => b.createdAt - a.createdAt),
    [deployments, filter, serviceId]
  );
  const count = (s: DeploymentStatus) => deployments.filter((d) => d.status === s).length;

  return (
    <>
      <PageHeader title="Deployments" description="Every build across all of your services." />
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs<Filter>
          value={filter}
          onChange={setFilter}
          tabs={[
            { id: 'all', label: 'All', count: deployments.length },
            { id: 'success', label: 'Succeeded', count: count('success') },
            { id: 'failed', label: 'Failed', count: count('failed') },
            { id: 'building', label: 'Building', count: count('building') },
          ]}
        />
        <select className="input h-10 w-full py-0 lg:w-56" value={serviceId} onChange={(e) => setServiceId(e.target.value)} aria-label="Filter by service">
          <option value="all">All services</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading ? (
        <CardSkeleton rows={4} />
      ) : deployments.length === 0 ? (
        <EmptyState
          icon={<Rocket className="h-6 w-6" />}
          title="No deployments yet"
          description="Create a service to trigger your first deployment."
          action={<ButtonLink href="/services/new">New Service</ButtonLink>}
        />
      ) : list.length === 0 ? (
        <EmptyState icon={<SearchX className="h-6 w-6" />} title="No matching deployments" description="Try a different filter." />
      ) : (
        <div className="space-y-3">
          {list.map((d, i) => (
            <div key={d.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
              <DeploymentItem d={d} serviceName={names[d.serviceId]} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
