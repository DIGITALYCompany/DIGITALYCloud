'use client';

import { Activity, Bot, CheckCircle2, Code2, GitCommit, Server } from 'lucide-react';
import { CHART_COLORS, Sparkline } from '@/components/charts/charts';
import { Dot } from '@/components/ui/badge';
import { WindowDots } from '@/components/marketing/window-dots';
import { usePreviewSeries } from './use-preview-series';

const services = [
  { name: 'SyncBot', type: 'Discord Bot', icon: Bot, cpu: '2.4%', ram: '186 MB', status: 'Online' },
  { name: 'CommunityAPI', type: 'Node.js', icon: Code2, cpu: '8.1%', ram: '412 MB', status: 'Online' },
  { name: 'DiscordNotifier', type: 'Worker', icon: Server, cpu: '1.2%', ram: '94 MB', status: 'Online' },
];

const activity = [
  { label: 'Deployment #42 · SyncBot', time: '2m ago', ok: true },
  { label: 'Deployment #18 · CommunityAPI', time: '3h ago', ok: true },
  { label: 'Auto-restart · DiscordNotifier', time: '1d ago', ok: true },
];

export function DashboardPreview() {
  const live = usePreviewSeries('landing-preview', (random) => ({ cpu: 18 + random() * 14, ram: 44 + random() * 6 }), 28, 1500);
  const cpuNow = Number(live[live.length - 1].cpu).toFixed(1);
  const ramNow = Number(live[live.length - 1].ram).toFixed(0);

  return (
    <figure className="relative mx-auto w-full max-w-5xl" aria-label="Illustration of the DIGITALYCloud dashboard with example data">
      <div className="absolute -inset-6 animate-glow rounded-[40px] bg-brand-gradient-3 opacity-60 blur-3xl" />
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-ink-900/90 shadow-2xl shadow-black/60 backdrop-blur-xl">
        <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
          <WindowDots />
          <div className="mx-auto hidden rounded-md bg-white/[0.04] px-3 py-1 font-mono text-[11px] text-ink-400 sm:block">cloud.digitaly.fr/dashboard</div>
        </div>
        <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-3">
          <div className="grid grid-cols-2 gap-3 lg:col-span-3 lg:grid-cols-4">
            {[
              { label: 'Status', value: 'Online', sub: '3 of 3 running', icon: <Dot tone="success" pulse /> },
              { label: 'CPU', value: `${cpuNow}%`, sub: '0.25 / 1 vCPU' },
              { label: 'RAM', value: `${ramNow}%`, sub: '3.8 GB / 8 GB' },
              { label: 'Uptime', value: '99.98%', sub: 'Last 30 days' },
            ].map((k) => (
              <div key={k.label} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 text-left">
                <div className="flex items-center gap-2 text-xs text-ink-400">
                  {k.icon}
                  {k.label}
                </div>
                <div className="mt-2 font-mono text-xl font-medium text-white sm:text-2xl">{k.value}</div>
                <div className="mt-0.5 text-[11px] text-ink-400">{k.sub}</div>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 text-left lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-white">
                <Activity className="h-4 w-4 text-brand-300" /> Resource usage
              </div>
              <div className="flex gap-3 text-[11px] text-ink-400">
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                  CPU
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-azure-500" />
                  RAM
                </span>
              </div>
            </div>
            <div className="relative">
              <Sparkline data={live} dataKey="ram" color={CHART_COLORS.secondary} height={130} />
              <div className="absolute inset-0">
                <Sparkline data={live} dataKey="cpu" color={CHART_COLORS.primary} height={130} />
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 text-left">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-white">
              <GitCommit className="h-4 w-4 text-aqua-400" /> Deployment activity
            </div>
            <ul className="space-y-3">
              {activity.map((a) => (
                <li key={a.label} className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-400" />
                  <div className="min-w-0">
                    <p className="truncate text-xs text-ink-100">{a.label}</p>
                    <p className="text-[11px] text-ink-400">{a.time}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="hidden overflow-hidden rounded-2xl border border-white/[0.06] sm:block lg:col-span-3">
            {services.map((s) => (
              <div key={s.name} className="flex items-center gap-4 border-b border-white/[0.04] px-4 py-3 text-left last:border-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.05] text-brand-300">
                  <s.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">{s.name}</p>
                  <p className="text-[11px] text-ink-400">{s.type}</p>
                </div>
                <span className="w-20 font-mono text-xs text-ink-300">{s.cpu}</span>
                <span className="w-20 font-mono text-xs text-ink-300">{s.ram}</span>
                <span className="flex items-center gap-1.5 text-xs text-success-400">
                  <Dot tone="success" /> {s.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <figcaption className="relative mt-3 text-center text-[11px] text-ink-500">Illustration with example data</figcaption>
    </figure>
  );
}
