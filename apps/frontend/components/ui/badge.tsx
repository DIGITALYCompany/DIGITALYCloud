import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { DeploymentStatus, ServiceStatus } from '@/lib/types';

export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'accent';

const tones: Record<Tone, string> = {
  neutral: 'bg-white/[0.06] text-ink-200 ring-white/10',
  brand: 'bg-brand-500/10 text-brand-200 ring-brand-500/25',
  success: 'bg-success-500/10 text-success-400 ring-success-500/25',
  warning: 'bg-warning-500/10 text-warning-400 ring-warning-500/25',
  danger: 'bg-danger-500/10 text-danger-400 ring-danger-500/25',
  accent: 'bg-aqua-500/10 text-aqua-400 ring-aqua-500/25',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', tones[tone], className)}>{children}</span>;
}

const dotColor: Record<Tone, string> = {
  neutral: 'bg-ink-400',
  brand: 'bg-brand-400',
  success: 'bg-success-400',
  warning: 'bg-warning-400',
  danger: 'bg-danger-400',
  accent: 'bg-aqua-400',
};

export function Dot({ tone, pulse }: { tone: Tone; pulse?: boolean }) {
  return (
    <span className="relative inline-flex h-2 w-2">
      {pulse && <span className={cn('absolute inset-0 animate-ping rounded-full opacity-60', dotColor[tone])} />}
      <span className={cn('relative inline-flex h-2 w-2 rounded-full', dotColor[tone])} />
    </span>
  );
}

const SERVICE_STATUS: Record<ServiceStatus, { tone: Tone; label: string }> = {
  running: { tone: 'success', label: 'Online' },
  stopped: { tone: 'neutral', label: 'Stopped' },
  deploying: { tone: 'brand', label: 'Deploying' },
  failed: { tone: 'danger', label: 'Failed' },
};

export function ServiceStatusBadge({ status }: { status: ServiceStatus }) {
  const s = SERVICE_STATUS[status];
  return (
    <Badge tone={s.tone}>
      <Dot tone={s.tone} pulse={status === 'running' || status === 'deploying'} />
      {s.label}
    </Badge>
  );
}

const DEPLOY_STATUS: Record<DeploymentStatus, { tone: Tone; label: string }> = {
  success: { tone: 'success', label: 'Successful' },
  failed: { tone: 'danger', label: 'Failed' },
  building: { tone: 'brand', label: 'Building' },
};

export function DeploymentStatusBadge({ status }: { status: DeploymentStatus }) {
  const s = DEPLOY_STATUS[status];
  return (
    <Badge tone={s.tone}>
      <Dot tone={s.tone} pulse={status === 'building'} />
      {s.label}
    </Badge>
  );
}
