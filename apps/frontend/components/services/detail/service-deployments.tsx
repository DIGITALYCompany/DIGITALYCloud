'use client';

import { useRef, useState } from 'react';
import { CheckCircle2, Rocket, Upload, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ProgressBar } from '@/components/ui/progress-bar';
import { DeploymentItem } from '@/components/services/deployment-item';
import { useAuth } from '@/providers/auth-provider';
import { useCloud } from '@/providers/cloud-provider';
import { useToast } from '@/providers/toast-provider';
import { api, errorMessage } from '@/lib/api';
import type { Service } from '@/lib/types';
import { useService } from './service-shell';

function sourceLine(service: Service) {
  if (service.source === 'github')
    return (
      <>
        Deploys the latest commit from <span className="font-mono text-ink-200">{service.repo}</span>
        {service.branch && (
          <>
            {' '}
            on <span className="font-mono text-ink-200">{service.branch}</span>
          </>
        )}
        .
      </>
    );
  if (service.source === 'docker')
    return (
      <>
        Pulls <span className="font-mono text-ink-200">{service.repo}</span> again and restarts on the new image.
      </>
    );
  return <>Rebuilds the uploaded archive, or upload a new one to replace the source.</>;
}

export function ServiceDeployments() {
  const service = useService();
  const { deployments, deploy } = useCloud();
  const { can } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const allowed = can('services.control');
  const list = deployments.filter((d) => d.serviceId === service.id);
  const ok = list.filter((d) => d.status === 'success').length;
  const failed = list.filter((d) => d.status === 'failed').length;

  const run = async () => {
    setBusy(true);
    try {
      await deploy(service.id);
    } catch (e) {
      toast({ kind: 'error', title: 'Could not start deployment', description: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  // Replacing an upload service's source: upload the archive for this service, then deploy it.
  const replace = async (f: File) => {
    setBusy(true);
    setProgress(0);
    try {
      const upload = await api.uploads.create(f, { serviceId: service.id, onProgress: setProgress });
      setProgress(null);
      await deploy(service.id, { uploadId: upload.id });
    } catch (e) {
      toast({ kind: 'error', title: 'Upload failed', description: errorMessage(e) });
    } finally {
      setBusy(false);
      setProgress(null);
      if (file.current) file.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <div className="card relative overflow-hidden p-6">
        <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-brand-500/15 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-lg font-semibold text-white">Ship a new version</p>
            <p className="mt-1 text-sm text-ink-400">{sourceLine(service)}</p>
            <div className="mt-3 flex gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-success-400">
                <CheckCircle2 className="h-3.5 w-3.5" /> {ok} successful
              </span>
              <span className="flex items-center gap-1.5 text-danger-400">
                <XCircle className="h-3.5 w-3.5" /> {failed} failed
              </span>
            </div>
          </div>
          {allowed && (
            <div className="flex flex-col gap-2 sm:items-end">
              <div className="flex gap-2">
                {service.source === 'upload' && (
                  <>
                    <input ref={file} type="file" accept=".zip,.tar,.tar.gz,.tgz" className="hidden" onChange={(e) => e.target.files?.[0] && replace(e.target.files[0])} />
                    <Button size="lg" variant="outline" disabled={busy || service.status === 'deploying'} onClick={() => file.current?.click()} icon={<Upload className="h-4 w-4" />}>
                      Upload new archive
                    </Button>
                  </>
                )}
                <Button size="lg" onClick={run} loading={busy || service.status === 'deploying'} icon={<Rocket className="h-4 w-4" />}>
                  {service.status === 'deploying' ? 'Deploying...' : 'Deploy'}
                </Button>
              </div>
              {progress !== null && (
                <div className="w-full sm:w-64">
                  <ProgressBar value={progress * 100} />
                  <p className="mt-1 text-xs text-ink-400">Uploading… {Math.round(progress * 100)}%</p>
                </div>
              )}
            </div>
          )}
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
