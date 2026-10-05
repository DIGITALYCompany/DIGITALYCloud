'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Clock, GitCommit, Loader2, RotateCcw, Timer, User } from 'lucide-react';
import { Badge, DeploymentStatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useDeploymentLogs } from '@/hooks/use-deployment-logs';
import { useAuth } from '@/providers/auth-provider';
import { useCloud } from '@/providers/cloud-provider';
import { useToast } from '@/providers/toast-provider';
import { errorMessage } from '@/lib/api';
import { formatDuration, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Deployment } from '@/lib/types';

const STAGE_LABEL: Record<NonNullable<Deployment['stage']>, string> = {
  preparing: 'Preparing environment',
  pulling: 'Pulling source',
  installing: 'Installing dependencies',
  starting: 'Starting service',
  health_check: 'Health check',
};
const TRIGGER_LABEL: Record<Deployment['trigger'], string> = { initial: 'Initial', manual: 'Manual', git_push: 'Git push', api: 'API', rollback: 'Rollback' };

function BuildLog({ d }: { d: Deployment }) {
  const { lines, loading, error } = useDeploymentLogs(d);
  if (error) return <span className="text-danger-400">{error}</span>;
  if (loading && lines.length === 0) {
    return (
      <span className="flex items-center gap-2 text-ink-300">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading build log…
      </span>
    );
  }
  return (
    <>
      {lines.length === 0 && <span className="text-ink-500">No build output was recorded.</span>}
      {lines.map((l, i) => (
        <div key={i} className={logLineClass(l)}>
          {l}
        </div>
      ))}
      {d.status === 'building' && (
        <span className="mt-1 flex items-center gap-2 text-ink-300">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {d.stage ? STAGE_LABEL[d.stage] : 'Building'}…
        </span>
      )}
    </>
  );
}

/** Redeploys the image of an earlier successful deployment (images are kept for 30 days). */
function RollbackButton({ d }: { d: Deployment }) {
  const { deploy } = useCloud();
  const { can } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (d.status !== 'success' || !can('services.control')) return null;
  return (
    <Button
      size="sm"
      variant="outline"
      loading={busy}
      icon={<RotateCcw className="h-3.5 w-3.5" />}
      onClick={async () => {
        setBusy(true);
        try {
          await deploy(d.serviceId, { deploymentId: d.id });
        } catch (e) {
          toast({ kind: 'error', title: 'Rollback not started', description: errorMessage(e) });
        } finally {
          setBusy(false);
        }
      }}
    >
      Redeploy this version
    </Button>
  );
}

const logLineClass = (l: string) => (/error|failed/i.test(l) ? 'text-danger-400' : /successful|passed/i.test(l) ? 'text-success-400' : l.startsWith('==>') ? 'text-brand-200' : 'text-ink-300');

/** Expandable deployment row with metadata and build logs. */
export function DeploymentItem({ d, serviceName, defaultOpen = false }: { d: Deployment; serviceName?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const failed = d.status === 'failed';
  return (
    <div className={cn('card overflow-hidden transition', failed && open && 'border-danger-500/30')}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-white/[0.02]" aria-expanded={open}>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-white">Deployment #{d.number}</span>
            {serviceName && (
              <Link href={`/services/${d.serviceId}`} onClick={(e) => e.stopPropagation()} className="text-sm text-brand-300 hover:text-brand-200">
                {serviceName}
              </Link>
            )}
            <Badge>{d.environment}</Badge>
          </div>
          <p className="mt-1 truncate text-sm text-ink-400">
            {d.commit && <span className="font-mono text-ink-300">{d.commit.slice(0, 7)} · </span>}
            {d.commitMessage || TRIGGER_LABEL[d.trigger]}
          </p>
        </div>
        <span className="hidden text-xs text-ink-500 sm:block">{timeAgo(d.createdAt)}</span>
        <DeploymentStatusBadge status={d.status} />
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-ink-400 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="animate-fade-in border-t border-white/[0.06] px-5 py-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { icon: GitCommit, label: 'Commit', value: d.commit ? d.commit.slice(0, 12) : TRIGGER_LABEL[d.trigger] },
              { icon: User, label: 'Author', value: d.author },
              { icon: Timer, label: 'Duration', value: d.status === 'building' ? 'In progress' : formatDuration(d.durationSec) },
              { icon: Clock, label: 'Started', value: new Date(d.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) },
            ].map((f) => (
              <div key={f.label}>
                <p className="flex items-center gap-1.5 text-xs text-ink-500">
                  <f.icon className="h-3.5 w-3.5" /> {f.label}
                </p>
                <p className="mt-1 font-mono text-sm text-white">{f.value}</p>
              </div>
            ))}
          </div>
          {failed && (
            <div className="mt-4 rounded-xl border border-danger-500/25 bg-danger-500/[0.07] px-4 py-3 text-sm text-danger-400">
              {d.failureReason ?? 'This deployment failed.'} A version that was already running keeps running.
            </div>
          )}
          <div className="mt-4 max-h-64 overflow-y-auto rounded-xl border border-white/[0.06] bg-[#05070D] p-4 font-mono text-[12px] leading-6">
            <BuildLog d={d} />
          </div>
          <div className="mt-3 flex justify-end empty:hidden">
            <RollbackButton d={d} />
          </div>
        </div>
      )}
    </div>
  );
}
