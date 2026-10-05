'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ExternalLink, MoreHorizontal, Play, RotateCw, Rocket, ScrollText, Settings, Square, Trash2 } from 'lucide-react';
import { ActionMenu } from '@/components/ui/action-menu';
import { ServiceStatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Tooltip } from '@/components/ui/tooltip';
import { SERVICE_TYPES, getServicePlan } from '@/lib/catalog';
import { formatMb, formatUptime, timeAgo } from '@/lib/format';
import type { Service } from '@/lib/types';
import { ServiceIcon } from './service-icon';
import { useServiceActions } from './use-service-actions';

export function ServiceCard({ service }: { service: Service }) {
  const router = useRouter();
  const a = useServiceActions(service);
  const T = SERVICE_TYPES[service.type];
  const running = service.status === 'running';
  const measured = running && service.metricsAt !== null;
  const ramPct = measured && service.ramLimitMb ? (service.ramMb / service.ramLimitMb) * 100 : 0;

  return (
    <div className="card card-hover group flex flex-col p-5">
      <div className="flex items-start gap-3">
        <ServiceIcon service={service} />
        <div className="min-w-0 flex-1">
          <Link href={`/services/${service.id}`} className="block truncate font-semibold text-white hover:underline">
            {service.name}
          </Link>
          <p className="text-xs text-ink-400">
            {T.label} · {getServicePlan(service.type, service.plan).name}
          </p>
        </div>
        <ServiceStatusBadge status={service.status} />
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] p-3">
        <div>
          <p className="text-[11px] text-ink-500">CPU</p>
          <p className="font-mono text-sm text-white">{measured ? `${service.cpu.toFixed(1)}%` : '—'}</p>
        </div>
        <div>
          <p className="text-[11px] text-ink-500">RAM</p>
          <p className="font-mono text-sm text-white">{measured ? formatMb(service.ramMb) : '—'}</p>
        </div>
        <div>
          <p className="text-[11px] text-ink-500">Uptime</p>
          <p className="font-mono text-sm text-white">{formatUptime(service.startedAt)}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-500">
        <span className="shrink-0">Memory</span>
        <ProgressBar value={ramPct} />
        <span className="shrink-0 font-mono">{formatMb(service.ramLimitMb)}</span>
      </div>
      <p className="mt-3 text-xs text-ink-500">
        {service.region} · {service.lastDeployAt ? `Deployed ${timeAgo(service.lastDeployAt)}` : 'Not deployed yet'}
      </p>

      <div className="mt-5 flex items-center gap-2 border-t border-white/[0.05] pt-4">
        <Button size="sm" variant="outline" className="flex-1" icon={<ExternalLink className="h-3.5 w-3.5" />} onClick={() => router.push(`/services/${service.id}`)}>
          Open
        </Button>
        {running || service.status === 'deploying' ? (
          <>
            <Tooltip label="Restart service">
              <Button
                size="sm"
                variant="outline"
                aria-label="Restart"
                loading={a.busy === 'restart'}
                disabled={service.status === 'deploying'}
                onClick={a.restart}
                icon={a.busy === 'restart' ? undefined : <RotateCw className="h-3.5 w-3.5" />}
              >
                <span className="hidden sm:inline">Restart</span>
              </Button>
            </Tooltip>
            <Tooltip label="Stop service">
              <Button size="sm" variant="outline" aria-label="Stop" disabled={service.status === 'deploying'} onClick={a.askStop} icon={<Square className="h-3.5 w-3.5" />}>
                <span className="hidden sm:inline">Stop</span>
              </Button>
            </Tooltip>
          </>
        ) : (
          <Button size="sm" variant="outline" className="flex-1" loading={a.busy === 'start'} onClick={a.start} icon={a.busy === 'start' ? undefined : <Play className="h-3.5 w-3.5" />}>
            Start
          </Button>
        )}
        <ActionMenu
          trigger={
            <Button size="sm" variant="ghost" aria-label="More actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          }
          up
          items={[
            { label: 'Deploy latest', icon: <Rocket />, onClick: a.deploy, disabled: service.status === 'deploying' },
            { label: 'View logs', icon: <ScrollText />, onClick: () => router.push(`/services/${service.id}/logs`) },
            { label: 'Settings', icon: <Settings />, onClick: () => router.push(`/services/${service.id}/settings`) },
            { label: 'Delete service', icon: <Trash2 />, danger: true, onClick: a.askDelete },
          ]}
        />
      </div>
      {a.dialogs}
    </div>
  );
}
