'use client';

import { useState } from 'react';
import { CheckCircle2, Rocket, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { DeploymentItem } from '@/components/services/deployment-item';
import { useCloud } from '@/providers/cloud-provider';
import { useToast } from '@/providers/toast-provider';
import { useService } from './service-shell';

export function ServiceDeployments() {
  const service = useService();
  const { deployments, deploy } = useCloud();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const list = deployments.filter((d) => d.serviceId === service.id);
  const ok = list.filter((d) => d.status === 'success').length;
  const failed = list.filter((d) => d.status === 'failed').length;

  const run = async () => {
    setBusy(true);
    try {
      await deploy(service.id);
    } catch {
      toast({ kind: 'error', title: 'Could not start deployment' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="card relative overflow-hidden p-6">
        <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-brand-500/15 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-lg font-semibold text-white">Ship a new version</p>
            <p className="mt-1 text-sm text-ink-400">
              Deploys the latest commit from <span className="font-mono text-ink-200">{service.repo}</span>
              {service.branch !== '—' && (
                <>
                  {' '}
                  on <span className="font-mono text-ink-200">{service.branch}</span>
                </>
              )}
              .
            </p>
            <div className="mt-3 flex gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-success-400">
                <CheckCircle2 className="h-3.5 w-3.5" /> {ok} successful
              </span>
              <span className="flex items-center gap-1.5 text-danger-400">
                <XCircle className="h-3.5 w-3.5" /> {failed} failed
              </span>
            </div>
          </div>
          <Button size="lg" onClick={run} loading={busy || service.status === 'deploying'} icon={<Rocket className="h-4 w-4" />}>
            {service.status === 'deploying' ? 'Deploying...' : 'Deploy'}
          </Button>
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState icon={<Rocket className="h-6 w-6" />} title="No deployments yet" description="Your deployment history will appear here." />
      ) : (
        list.map((d, i) => <DeploymentItem key={d.id} d={d} defaultOpen={i === 0 && d.status !== 'success'} />)
      )}
    </div>
  );
}
