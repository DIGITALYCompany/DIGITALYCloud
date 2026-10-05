'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Play, RefreshCw, Rocket, ScrollText, Square } from 'lucide-react';
import { ServiceStatusBadge } from '@/components/ui/badge';
import { Tooltip } from '@/components/ui/tooltip';
import { useServiceActions } from '@/components/services/use-service-actions';
import { SERVICE_TYPES } from '@/lib/catalog';
import { formatMb, formatUptime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Service } from '@/lib/types';

function MiniBar({ value, tone }: { value: number; tone: string }) {
  const pct = Math.max(2, Math.min(100, value));
  return (
    <span className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
      <span className={cn('block h-full rounded-full transition-[width] duration-700 ease-out', pct > 85 ? 'bg-danger-500' : pct > 65 ? 'bg-warning-500' : tone)} style={{ width: `${pct}%` }} />
    </span>
  );
}

const ICON_ACTION_BASE = 'flex h-8 w-8 items-center justify-center rounded-lg border transition';
const ICON_ACTION_DEFAULT = 'border-white/[0.08] bg-white/[0.02] text-ink-300 hover:border-white/20 hover:bg-white/[0.06] hover:text-white';

function IconAction({ label, onClick, busy, children, tone = 'default' }: { label: string; onClick: () => void; busy?: boolean; children: ReactNode; tone?: 'default' | 'primary' }) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClick();
        }}
        disabled={busy}
        aria-label={label}
        className={cn(
          ICON_ACTION_BASE,
          'disabled:opacity-60 [&>svg]:h-3.5 [&>svg]:w-3.5',
          tone === 'primary' ? 'border-brand-500/30 bg-brand-500/10 text-brand-200 hover:border-brand-400/60 hover:bg-brand-500/20' : ICON_ACTION_DEFAULT
        )}
      >
        {busy ? <Loader2 className="animate-spin" /> : children}
      </button>
    </Tooltip>
  );
}

/** Clickable service row on the overview, with hover actions on desktop. */
export function ServiceRow({ service: s }: { service: Service }) {
  const T = SERVICE_TYPES[s.type];
  const router = useRouter();
  const { restart, start, deploy, askStop, busy, dialogs } = useServiceActions(s);
  const online = s.status === 'running';
  // No sample yet (or the collector is behind): show a dash, not a measured zero.
  const measured = online && s.metricsAt !== null;
  const ramPct = (s.ramMb / s.ramLimitMb) * 100;

  return (
    <>
      <div
        onClick={() => router.push(`/services/${s.id}`)}
        className="group grid cursor-pointer grid-cols-[1fr_auto] items-center gap-4 px-5 py-4 transition hover:bg-white/[0.025] md:grid-cols-[minmax(0,1fr)_96px_120px_88px_auto]"
      >
        <span className="flex min-w-0 items-center gap-3.5">
          <span className={cn('relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1', T.color)}>
            <T.icon className="h-4 w-4" />
            <span
              className={cn(
                'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-ink-900',
                online ? 'bg-success-400' : s.status === 'failed' ? 'bg-danger-500' : s.status === 'deploying' ? 'animate-pulse bg-brand-400' : 'bg-ink-400'
              )}
            />
          </span>
          <span className="min-w-0">
            <Link
              href={`/services/${s.id}`}
              onClick={(e) => e.stopPropagation()}
              className="block truncate text-sm font-medium text-white outline-hidden group-hover:text-brand-200 focus-visible:underline"
            >
              {s.name}
            </Link>
            <span className="block truncate text-xs text-ink-400">
              {T.label} · {s.region} · {online ? `up ${formatUptime(s.startedAt)}` : 'offline'}
            </span>
          </span>
        </span>

        <span className="hidden md:block">
          <span className="flex justify-between font-mono text-xs text-ink-200">
            <span className="text-ink-500">CPU</span>
            {measured ? `${s.cpu.toFixed(1)}%` : '—'}
          </span>
          <MiniBar value={measured ? s.cpu : 0} tone="bg-brand-500" />
        </span>
        <span className="hidden md:block">
          <span className="flex justify-between font-mono text-xs text-ink-200">
            <span className="text-ink-500">RAM</span>
            {measured ? formatMb(s.ramMb) : '—'}
          </span>
          <MiniBar value={measured ? ramPct : 0} tone="bg-azure-500" />
        </span>
        <span className="hidden justify-end md:flex">
          <ServiceStatusBadge status={s.status} />
        </span>

        <span className="flex items-center justify-end gap-1.5">
          <span className="md:hidden">
            <ServiceStatusBadge status={s.status} />
          </span>
          <span className="hidden items-center gap-1.5 opacity-70 transition group-hover:opacity-100 sm:flex">
            {s.status === 'deploying' ? (
              <span className="flex h-8 items-center gap-1.5 px-2 text-xs text-brand-200">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Deploying
              </span>
            ) : online ? (
              <>
                <IconAction label="Restart" onClick={restart} busy={busy === 'restart'}>
                  <RefreshCw />
                </IconAction>
                <IconAction label="Stop" onClick={askStop}>
                  <Square />
                </IconAction>
              </>
            ) : (
              <IconAction label="Start" onClick={start} busy={busy === 'start'} tone="primary">
                <Play />
              </IconAction>
            )}
            {s.status !== 'deploying' && (
              <IconAction label="Redeploy" onClick={deploy} busy={busy === 'deploy'}>
                <Rocket />
              </IconAction>
            )}
            <Tooltip label="Logs">
              <Link
                href={`/services/${s.id}/logs`}
                onClick={(e) => e.stopPropagation()}
                aria-label="Logs"
                className={cn(ICON_ACTION_BASE, ICON_ACTION_DEFAULT)}
              >
                <ScrollText className="h-3.5 w-3.5" />
              </Link>
            </Tooltip>
          </span>
        </span>
      </div>
      {dialogs}
    </>
  );
}
