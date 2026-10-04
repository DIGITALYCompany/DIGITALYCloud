'use client';

import { createContext, useContext, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, BarChart3, Boxes, Copy, Gauge, KeyRound, Play, RotateCw, Rocket, ScrollText, Settings, Square } from 'lucide-react';
import { ServiceStatusBadge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LinkTabs } from '@/components/ui/link-tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { ServiceIcon } from '@/components/services/service-icon';
import { useServiceActions } from '@/components/services/use-service-actions';
import { useCloud } from '@/providers/cloud-provider';
import { useToast } from '@/providers/toast-provider';
import { copyToClipboard } from '@/lib/browser';
import { SERVICE_TYPES } from '@/lib/catalog';
import type { Service } from '@/lib/types';

const ServiceContext = createContext<Service | null>(null);

/** The service whose detail pages are being rendered. */
export function useService() {
  const service = useContext(ServiceContext);
  if (!service) throw new Error('useService must be used inside ServiceShell');
  return service;
}

/** Header, actions and tab bar shared by every page under /services/[id]. */
export function ServiceShell({ id, children }: { id: string; children: ReactNode }) {
  const { services, loading } = useCloud();
  const toast = useToast();
  const service = services.find((s) => s.id === id);
  const a = useServiceActions(service);

  if (loading)
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );

  if (!service)
    return (
      <EmptyState
        icon={<Boxes className="h-6 w-6" />}
        title="Service not found"
        description="This service doesn't exist or was deleted."
        action={<ButtonLink href="/services">Back to services</ButtonLink>}
      />
    );

  const base = `/services/${service.id}` as const;
  const url = service.port ? `${service.id}.digitaly.app` : null;
  const busyDeploying = service.status === 'deploying';

  return (
    <>
      <Link href="/services" className="mb-5 inline-flex items-center gap-1.5 text-sm text-ink-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Services
      </Link>
      <div className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <ServiceIcon service={service} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-[28px]">{service.name}</h1>
              <ServiceStatusBadge status={service.status} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-400">
              <span>{SERVICE_TYPES[service.type].label}</span>
              <span className="text-ink-600">·</span>
              <span>{service.region}</span>
              {url && (
                <>
                  <span className="text-ink-600">·</span>
                  <button
                    onClick={() => {
                      copyToClipboard(`https://${url}`);
                      toast({ kind: 'info', title: 'URL copied to clipboard' });
                    }}
                    className="inline-flex items-center gap-1 font-mono text-xs text-brand-300 hover:text-brand-200"
                  >
                    {url} <Copy className="h-3 w-3" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={a.deploy} loading={a.busy === 'deploy' || busyDeploying} icon={<Rocket className="h-4 w-4" />}>
            {busyDeploying ? 'Deploying...' : 'Deploy'}
          </Button>
          {service.status === 'stopped' || service.status === 'failed' ? (
            <Button variant="outline" onClick={a.start} loading={a.busy === 'start'} icon={<Play className="h-4 w-4" />}>
              Start
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={a.restart} disabled={busyDeploying} loading={a.busy === 'restart'} icon={<RotateCw className="h-4 w-4" />}>
                Restart
              </Button>
              <Button variant="outline" onClick={a.askStop} disabled={busyDeploying} icon={<Square className="h-4 w-4" />}>
                Stop
              </Button>
            </>
          )}
          <ButtonLink href={`${base}/settings`} variant="ghost" icon={<Settings className="h-4 w-4" />}>
            <span className="sm:inline">Settings</span>
          </ButtonLink>
        </div>
      </div>

      <LinkTabs
        tabs={[
          { href: base, label: 'Overview', end: true, icon: <Gauge className="h-4 w-4" /> },
          { href: `${base}/logs`, label: 'Logs', icon: <ScrollText className="h-4 w-4" /> },
          { href: `${base}/deployments`, label: 'Deployments', icon: <Rocket className="h-4 w-4" /> },
          { href: `${base}/metrics`, label: 'Metrics', icon: <BarChart3 className="h-4 w-4" /> },
          { href: `${base}/environment`, label: 'Environment', icon: <KeyRound className="h-4 w-4" /> },
          { href: `${base}/settings`, label: 'Settings', icon: <Settings className="h-4 w-4" /> },
        ]}
      />
      <div className="pt-6">
        <ServiceContext.Provider value={service}>{children}</ServiceContext.Provider>
      </div>
      {a.dialogs}
    </>
  );
}
