'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Circle, Loader2, PartyPopper } from 'lucide-react';
import { useCloud } from '@/providers/cloud-provider';
import { useToast } from '@/providers/toast-provider';
import { formatClock } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Deployment, Service } from '@/lib/types';

const STAGES = [
  { label: 'Preparing environment', logs: ['Allocating container on {server}', 'Pulling base image node:22-alpine'] },
  { label: 'Pulling source', logs: ['Fetching {repo}', 'Checked out commit {commit}'] },
  { label: 'Installing dependencies', logs: ['$ npm ci', 'added 214 packages in 6s', 'found 0 vulnerabilities'] },
  { label: 'Starting service', logs: ['$ {cmd}', 'Process started (pid 1)'] },
  { label: 'Health check', logs: ['Waiting for process to become healthy...', 'Health check passed'] },
];

/** Animated first deployment shown after the creation wizard, then redirects to the new service. */
export function DeployProgress({ service, deployment }: { service: Service; deployment: Deployment }) {
  const { completeDeployment } = useCloud();
  const toast = useToast();
  const router = useRouter();
  const [stage, setStage] = useState(0);
  const [logs, setLogs] = useState<{ ts: number; text: string }[]>([]);
  const [done, setDone] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const finish = useEffectEvent(async () => {
    setStage(STAGES.length);
    await completeDeployment(deployment.id, true);
    setDone(true);
    setLogs((x) => [...x, { ts: Date.now(), text: 'Deployment successful' }]);
    toast({ kind: 'success', title: 'Deployment successful', description: `${service.name} is now online.` });
  });

  const openService = useEffectEvent(() => router.replace(`/services/${service.id}`));

  useEffect(() => {
    const fill = (t: string) => t.replace('{server}', service.server).replace('{repo}', service.repo).replace('{commit}', deployment.commit).replace('{cmd}', service.startCommand);
    const timers: ReturnType<typeof setTimeout>[] = [];
    let t = 300;
    STAGES.forEach((s, i) => {
      timers.push(setTimeout(() => setStage(i), t));
      s.logs.forEach((l, j) => timers.push(setTimeout(() => setLogs((x) => [...x, { ts: Date.now(), text: fill(l) }]), t + 250 + j * 380)));
      t += 1300;
    });
    timers.push(setTimeout(() => finish(), t));
    timers.push(setTimeout(() => openService(), t + 1800));
    return () => timers.forEach(clearTimeout);
  }, [service, deployment]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [logs]);

  const pct = Math.round((Math.min(stage, STAGES.length) / STAGES.length) * 100);

  return (
    <div className="mx-auto max-w-3xl animate-fade-up">
      <div className="text-center">
        <div className="relative mx-auto flex h-16 w-16 items-center justify-center">
          <div className={cn('absolute inset-0 rounded-2xl bg-brand-gradient-3 blur-xl transition', done ? 'opacity-70' : 'animate-glow opacity-50')} />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-ink-900">
            {done ? <PartyPopper className="h-7 w-7 text-white" /> : <Loader2 className="h-7 w-7 animate-spin text-white" />}
          </div>
        </div>
        <h1 className="mt-6 text-2xl font-semibold text-white">{done ? 'Deployment successful' : `Deploying ${service.name}`}</h1>
        <p className="mt-1.5 text-sm text-ink-300">{done ? 'Redirecting you to your service...' : 'This usually takes less than a minute.'}</p>
      </div>

      <div className="mt-8 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full bg-brand-gradient transition-all duration-700" style={{ width: `${done ? 100 : pct}%` }} />
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-[240px_1fr]">
        <ol className="card space-y-1 p-3">
          {[...STAGES.map((s) => s.label), 'Deployment successful'].map((label, i) => {
            const state = done || i < stage ? 'done' : i === stage ? 'active' : 'pending';
            return (
              <li
                key={label}
                className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition', state === 'active' ? 'bg-white/[0.05] text-white' : state === 'done' ? 'text-ink-200' : 'text-ink-500')}
              >
                {state === 'done' ? <CheckCircle2 className="h-4 w-4 text-success-400" /> : state === 'active' ? <Loader2 className="h-4 w-4 animate-spin text-brand-300" /> : <Circle className="h-4 w-4" />}
                {label}
              </li>
            );
          })}
        </ol>
        <div ref={logRef} className="h-80 overflow-y-auto rounded-2xl border border-white/[0.07] bg-[#05070D] p-4 font-mono text-[12.5px] leading-6">
          {logs.map((l, i) => (
            <div key={i} className="animate-fade-in">
              <span className="text-ink-500">[{formatClock(l.ts)}]</span>{' '}
              <span className={l.text.includes('successful') || l.text.includes('passed') ? 'text-success-400' : l.text.startsWith('$') ? 'text-brand-300' : 'text-ink-200'}>{l.text}</span>
            </div>
          ))}
          {!done && <span className="inline-block h-4 w-2 animate-pulse bg-ink-300" />}
        </div>
      </div>
    </div>
  );
}
