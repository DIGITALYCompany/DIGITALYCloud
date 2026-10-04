'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Clock, GitCommit, Loader2, Timer, User } from 'lucide-react';
import { Badge, DeploymentStatusBadge } from '@/components/ui/badge';
import { formatDuration, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Deployment } from '@/lib/types';

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
            <span className="font-mono text-ink-300">{d.commit}</span> · {d.commitMessage}
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
              { icon: GitCommit, label: 'Commit', value: d.commit },
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
              This deployment failed its health check. Your previous version kept running, so there was no downtime.
            </div>
          )}
          <div className="mt-4 max-h-64 overflow-y-auto rounded-xl border border-white/[0.06] bg-[#05070D] p-4 font-mono text-[12px] leading-6">
            {d.status === 'building' ? (
              <span className="flex items-center gap-2 text-ink-300">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Building...
              </span>
            ) : (
              d.logs.map((l, i) => (
                <div key={i} className={logLineClass(l)}>
                  {l}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
