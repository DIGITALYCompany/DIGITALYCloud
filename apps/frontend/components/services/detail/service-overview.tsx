'use client';

import Link from 'next/link';
import { ArrowRight, Calendar, Container, Cpu, GitBranch, Globe2, HardDrive, MapPin, MemoryStick, Network, Rocket, Server, Timer, Upload } from 'lucide-react';
import { DeploymentStatusBadge, Dot } from '@/components/ui/badge';
import { MetricRow } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { LiveCpuRamCharts, useLiveServiceMetrics } from '@/components/services/live-charts';
import { useCloud } from '@/providers/cloud-provider';
import { getServicePlan } from '@/lib/catalog';
import { formatDate, formatMb, formatUptime, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useService } from './service-shell';

const STATUS_LABEL = { running: 'Online', stopped: 'Stopped', deploying: 'Deploying', failed: 'Failed' } as const;
const OPERATION_LABEL = { deploy: 'Deploying a new version…', start: 'Starting…', stop: 'Stopping…', restart: 'Restarting…', apply_limits: 'Applying new plan limits…', delete: 'Deleting…' } as const;
const SOURCE_ICON = { github: GitBranch, upload: Upload, docker: Container } as const;

export function ServiceOverview() {
  const service = useService();
  const { deployments } = useCloud();
  const latest = deployments.filter((d) => d.serviceId === service.id).slice(0, 3);
  const plan = getServicePlan(service.type, service.plan);
  const online = service.status === 'running';
  const tone = online ? 'success' : service.status === 'deploying' ? 'brand' : service.status === 'failed' ? 'danger' : 'neutral';

  const facts = [
    { icon: Timer, label: 'Uptime', value: formatUptime(service.startedAt) },
    { icon: MapPin, label: 'Region', value: service.region },
    { icon: Server, label: 'Runtime', value: `${service.runtime} ${service.runtime === 'Node.js' ? service.nodeVersion : ''}` },
    { icon: Rocket, label: 'Last deployment', value: service.lastDeployAt ? timeAgo(service.lastDeployAt) : '—' },
  ];

  // Measured values only: before the first sample (or while stopped) the meters show a dash.
  const measured = online && service.metricsAt !== null;
  const live = useLiveServiceMetrics(service.id).latest;
  const netIn = measured && typeof live?.netIn === 'number' ? live.netIn : null;

  const meters = [
    { icon: Cpu, label: 'CPU', value: measured ? `${service.cpu.toFixed(1)}%` : '—', sub: `of ${plan.vcpu} vCPU`, pct: measured ? service.cpu : 0 },
    { icon: MemoryStick, label: 'RAM', value: measured ? formatMb(service.ramMb) : '—', sub: `of ${formatMb(service.ramLimitMb)}`, pct: measured ? (service.ramMb / service.ramLimitMb) * 100 : 0 },
    { icon: Network, label: 'Network', value: netIn === null ? '—' : `${netIn.toFixed(1)} KB/s`, sub: 'Inbound, live', pct: 0 },
    { icon: HardDrive, label: 'Storage', value: formatMb(service.storageMb), sub: `of ${formatMb(service.storageLimitMb)}`, pct: (service.storageMb / service.storageLimitMb) * 100 },
  ];

  const SourceIcon = SOURCE_ICON[service.source];
  const pending = service.pendingChanges;

  return (
    <div className="space-y-4">
      {(pending.settings || pending.env) && (
        <div className="rounded-2xl border border-brand-500/25 bg-brand-500/[0.06] px-4 py-3 text-sm text-ink-200">
          {pending.settings ? 'Settings changed since the running deployment. Deploy to apply them.' : 'Environment variables changed since the service started. Restart or deploy to apply them.'}
        </div>
      )}
      <div className="card relative overflow-hidden">
        <div className={cn('pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full blur-3xl', online ? 'bg-success-500/15' : 'bg-white/[0.03]')} />
        <div className="relative grid gap-6 p-6 lg:grid-cols-[1.1fr_2fr] lg:items-center">
          <div className="flex items-center gap-4">
            <div className={cn('flex h-14 w-14 items-center justify-center rounded-2xl', online ? 'bg-success-500/10' : 'bg-white/[0.04]')}>
              <Dot tone={tone} pulse={online || service.status === 'deploying'} />
            </div>
            <div>
              <p className="text-2xl font-semibold text-white">{STATUS_LABEL[service.status]}</p>
              <p className="text-sm text-ink-400">
                {service.operation
                  ? OPERATION_LABEL[service.operation.kind]
                  : online
                    ? `Healthy on ${service.server}`
                    : service.status === 'deploying'
                      ? 'A new version is being deployed'
                      : service.status === 'failed'
                        ? 'The last deployment or process failed. Check the logs.'
                        : 'Not running'}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {facts.map((f) => (
              <div key={f.label}>
                <p className="flex items-center gap-1.5 text-xs text-ink-400">
                  <f.icon className="h-3.5 w-3.5" /> {f.label}
                </p>
                <p className="mt-1 truncate text-sm font-medium text-white">{f.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {meters.map((m) => (
          <div key={m.label} className="card p-5">
            <p className="flex items-center gap-1.5 text-xs text-ink-400">
              <m.icon className="h-3.5 w-3.5" /> {m.label}
            </p>
            <p className="mt-2 font-mono text-xl text-white">{m.value}</p>
            <p className="mb-3 text-xs text-ink-500">{m.sub}</p>
            <ProgressBar value={m.pct} />
          </div>
        ))}
      </div>

      <LiveCpuRamCharts service={service} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-medium text-white">Recent deployments</p>
            <Link href={`/services/${service.id}/deployments`} className="flex items-center gap-1 text-xs text-ink-300 hover:text-white">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {latest.length === 0 && <p className="py-6 text-center text-sm text-ink-400">No deployments yet.</p>}
            {latest.map((d) => (
              <div key={d.id} className="flex items-center gap-3 rounded-xl border border-white/[0.05] px-4 py-3">
                <span className="font-mono text-sm text-white">#{d.number}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink-300">{d.commitMessage || d.failureReason || d.trigger}</span>
                <span className="hidden text-xs text-ink-500 sm:inline">{timeAgo(d.createdAt)}</span>
                <DeploymentStatusBadge status={d.status} />
              </div>
            ))}
          </div>
        </div>
        <div className="card space-y-4 p-5">
          <p className="text-sm font-medium text-white">Configuration</p>
          <MetricRow label="Plan" value={plan.name} />
          <MetricRow
            label="Source"
            value={
              <span className="flex items-center gap-1">
                <SourceIcon className="h-3 w-3" />
                {service.source === 'upload' ? 'Uploaded archive' : service.repo}
              </span>
            }
          />
          <MetricRow label="Start command" value={service.startCommand} />
          <MetricRow label="Port" value={service.port ?? '—'} />
          <MetricRow
            label="Domain"
            value={
              service.url ? (
                <a href={service.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-brand-200">
                  <Globe2 className="h-3 w-3" />
                  {service.url.replace(/^https?:\/\//, '')}
                </a>
              ) : (
                '—'
              )
            }
          />
          <MetricRow
            label="Created"
            value={
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDate(service.createdAt)}
              </span>
            }
          />
        </div>
      </div>
    </div>
  );
}
