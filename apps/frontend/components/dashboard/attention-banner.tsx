'use client';

import Link from 'next/link';
import { ArrowRight, Loader2, Play, Rocket, TriangleAlert } from 'lucide-react';
import { useServiceActions } from '@/components/services/use-service-actions';
import { cn } from '@/lib/utils';
import type { Service } from '@/lib/types';

function AttentionItem({ service: s }: { service: Service }) {
  const { start, deploy, busy } = useServiceActions(s);
  const failed = s.status === 'failed';
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-ink-950/40 px-4 py-3 sm:flex-row sm:items-center">
      <span className={cn('h-2 w-2 shrink-0 rounded-full', failed ? 'bg-danger-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]' : 'bg-warning-500')} />
      <div className="min-w-0 flex-1">
        <Link href={`/services/${s.id}`} className="text-sm font-medium text-white hover:text-brand-200">
          {s.name}
        </Link>
        <p className="text-xs text-ink-400">{failed ? 'Last deployment failed. Your users may be affected.' : 'Stopped. The service is offline.'}</p>
      </div>
      <div className="flex gap-2">
        <Link href={`/services/${s.id}/logs`} className="inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium text-ink-300 transition hover:bg-white/[0.06] hover:text-white">
          View logs
        </Link>
        <button
          type="button"
          onClick={failed ? deploy : start}
          disabled={busy !== null}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-medium text-ink-950 transition hover:bg-ink-100 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : failed ? <Rocket className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {failed ? 'Redeploy' : 'Start'}
        </button>
      </div>
    </li>
  );
}

/** Stopped or failed services, with one-click fixes. */
export function AttentionBanner({ services }: { services: Service[] }) {
  if (services.length === 0) return null;
  const shown = services.slice(0, 3);
  return (
    <section className="mb-6 animate-fade-up overflow-hidden rounded-2xl border border-warning-500/25 bg-linear-to-br/srgb from-warning-500/[0.08] via-ink-900/80 to-ink-900/80 p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning-500/15 text-warning-400">
          <TriangleAlert className="h-4 w-4" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-medium text-white">
            {services.length} service{services.length > 1 ? 's' : ''} need{services.length > 1 ? '' : 's'} your attention
          </p>
          <p className="text-xs text-ink-400">Fix them in one click, or open the logs to see what happened.</p>
        </div>
        {services.length > shown.length && (
          <Link href="/services" className="hidden items-center gap-1 text-xs font-medium text-ink-300 hover:text-white sm:flex">
            See all <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      <ul className="space-y-2">
        {shown.map((s) => (
          <AttentionItem key={s.id} service={s} />
        ))}
      </ul>
    </section>
  );
}
