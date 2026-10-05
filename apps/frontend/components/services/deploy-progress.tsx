'use client';

import { useEffect, useEffectEvent, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Circle, Loader2, PartyPopper, XCircle } from 'lucide-react';
import { DEPLOY_STAGES } from '@digitalycloud/shared';
import { useDeploymentLogs } from '@/hooks/use-deployment-logs';
import { useCloud } from '@/providers/cloud-provider';
import { cn } from '@/lib/utils';
import type { Deployment, Service } from '@/lib/types';

const STAGES: { id: (typeof DEPLOY_STAGES)[number]; label: string }[] = [
  { id: 'preparing', label: 'Preparing environment' },
  { id: 'pulling', label: 'Pulling source' },
  { id: 'installing', label: 'Installing dependencies' },
  { id: 'starting', label: 'Starting service' },
  { id: 'health_check', label: 'Health check' },
];

const lineClass = (l: string) => (/error|failed/i.test(l) ? 'text-danger-400' : /successful|passed/i.test(l) ? 'text-success-400' : l.startsWith('$') || l.startsWith('==>') ? 'text-brand-300' : 'text-ink-200');

/** The first deployment after the creation wizard, followed live; redirects to the service on success. */
export function DeployProgress({ service: initialService, deployment: initial }: { service: Service; deployment: Deployment }) {
  const { deployments, services } = useCloud();
  const router = useRouter();
  const deployment = deployments.find((d) => d.id === initial.id) ?? initial;
  const service = services.find((s) => s.id === initialService.id) ?? initialService;
  const { lines } = useDeploymentLogs(deployment);
  const logRef = useRef<HTMLDivElement>(null);
  const done = deployment.status === 'success';
  const failed = deployment.status === 'failed';
  const stage = done ? STAGES.length : Math.max(0, STAGES.findIndex((s) => s.id === deployment.stage));

  const openService = useEffectEvent(() => router.replace(`/services/${service.id}`));
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => openService(), 1800);
    return () => clearTimeout(t);
  }, [done]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [lines.length]);

  const pct = Math.round((Math.min(stage, STAGES.length) / STAGES.length) * 100);

  return (
    <div className="mx-auto max-w-3xl animate-fade-up">
      <div className="text-center">
        <div className="relative mx-auto flex h-16 w-16 items-center justify-center">
          <div className={cn('absolute inset-0 rounded-2xl blur-xl transition', failed ? 'bg-danger-500/40 opacity-60' : done ? 'bg-brand-gradient-3 opacity-70' : 'animate-glow bg-brand-gradient-3 opacity-50')} />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-ink-900">
            {done ? <PartyPopper className="h-7 w-7 text-white" /> : failed ? <XCircle className="h-7 w-7 text-danger-400" /> : <Loader2 className="h-7 w-7 animate-spin text-white" />}
          </div>
        </div>
        <h1 className="mt-6 text-2xl font-semibold text-white">{done ? 'Deployment successful' : failed ? 'Deployment failed' : `Deploying ${service.name}`}</h1>
        <p className="mt-1.5 text-sm text-ink-300">
          {done ? 'Redirecting you to your service...' : failed ? (deployment.failureReason ?? 'The build or health check did not pass.') : 'This usually takes a minute or two.'}
        </p>
        {failed && (
          <div className="mt-5 flex justify-center gap-3">
            <Link href={`/services/${service.id}/deployments`} className="inline-flex h-10 items-center rounded-xl bg-white px-4 text-sm font-medium text-ink-950 transition hover:bg-ink-100">
              View deployment logs
            </Link>
            <Link href={`/services/${service.id}/settings`} className="inline-flex h-10 items-center rounded-xl border border-white/10 px-4 text-sm font-medium text-ink-100 transition hover:border-white/20">
              Fix settings
            </Link>
          </div>
        )}
      </div>

      <div className="mt-8 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div className={cn('h-full rounded-full transition-all duration-700', failed ? 'bg-danger-500' : 'bg-brand-gradient')} style={{ width: `${done ? 100 : pct}%` }} />
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-[240px_1fr]">
        <ol className="card space-y-1 p-3">
          {[...STAGES.map((s) => s.label), 'Deployment successful'].map((label, i) => {
            const state = done || i < stage ? 'done' : i === stage ? (failed ? 'failed' : 'active') : 'pending';
            return (
              <li
                key={label}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition',
                  state === 'active' || state === 'failed' ? 'bg-white/[0.05] text-white' : state === 'done' ? 'text-ink-200' : 'text-ink-500'
                )}
              >
                {state === 'done' ? (
                  <CheckCircle2 className="h-4 w-4 text-success-400" />
                ) : state === 'failed' ? (
                  <XCircle className="h-4 w-4 text-danger-400" />
                ) : state === 'active' ? (
                  <Loader2 className="h-4 w-4 animate-spin text-brand-300" />
                ) : (
                  <Circle className="h-4 w-4" />
                )}
                {label}
              </li>
            );
          })}
        </ol>
        <div ref={logRef} className="h-80 overflow-y-auto rounded-2xl border border-white/[0.07] bg-[#05070D] p-4 font-mono text-[12.5px] leading-6">
          {lines.length === 0 && !failed && <div className="text-ink-500">Waiting for a build worker…</div>}
          {lines.map((l, i) => (
            <div key={i} className={cn('animate-fade-in whitespace-pre-wrap break-words', lineClass(l))}>
              {l}
            </div>
          ))}
          {!done && !failed && <span className="inline-block h-4 w-2 animate-pulse bg-ink-300" />}
        </div>
      </div>
    </div>
  );
}
