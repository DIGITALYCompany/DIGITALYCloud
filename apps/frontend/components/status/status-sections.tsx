'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, HelpCircle, Wrench, XCircle } from 'lucide-react';
import type { StatusComponentDto, StatusResponse } from '@digitalycloud/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { UptimeBars } from './uptime-bars';

type Incident = StatusResponse['incidents'][number];

const STATE: Record<StatusComponentDto['state'], { tone: 'success' | 'warning' | 'danger' | 'brand' | 'neutral'; label: string; text: string }> = {
  ok: { tone: 'success', label: 'Operational', text: 'text-success-400' },
  maintenance: { tone: 'brand', label: 'Maintenance', text: 'text-brand-300' },
  degraded: { tone: 'warning', label: 'Degraded', text: 'text-warning-400' },
  outage: { tone: 'danger', label: 'Outage', text: 'text-danger-400' },
  unknown: { tone: 'neutral', label: 'No data yet', text: 'text-ink-400' },
};

function worst(components: StatusComponentDto[]): StatusComponentDto['state'] {
  const order: StatusComponentDto['state'][] = ['outage', 'degraded', 'maintenance', 'ok', 'unknown'];
  return order.find((s) => components.some((c) => c.state === s)) ?? 'unknown';
}

export function ComponentGroup({ name, components, observedDays }: { name: string; components: StatusComponentDto[]; observedDays: number }) {
  const groupState = STATE[worst(components)];
  const GroupIcon = groupState.tone === 'success' ? CheckCircle2 : groupState.tone === 'danger' ? XCircle : groupState.tone === 'neutral' ? HelpCircle : AlertTriangle;
  const [open, setOpen] = useState(true);
  return (
    <div className="overflow-hidden rounded-3xl border border-white/[0.07] bg-ink-900/60">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-white/[0.02] sm:px-6">
        <span className="flex items-center gap-3">
          <ChevronDown className={cn('h-4 w-4 text-ink-400 transition-transform duration-200', !open && '-rotate-90')} />
          <span className="font-medium text-white">{name}</span>
          <span className="text-xs text-ink-500">{components.length} components</span>
        </span>
        <span className={cn('flex items-center gap-1.5 text-sm', groupState.text)}>
          <GroupIcon className="h-4 w-4" /> <span className="hidden sm:inline">{groupState.label}</span>
        </span>
      </button>
      {open && (
        <div className="animate-fade-in divide-y divide-white/[0.06] border-t border-white/[0.06]">
          {components.map((c) => (
            <div key={c.name} className="px-5 py-5 sm:px-6">
              <div className="mb-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{c.name}</p>
                  <p className="truncate text-xs text-ink-400">{c.desc}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-mono text-xs text-ink-300">{c.uptime === null ? '—' : `${c.uptime.toFixed(2)}%`}</span>
                  <Badge tone={STATE[c.state].tone}>{STATE[c.state].label}</Badge>
                </div>
              </div>
              <UptimeBars component={c} observedDays={observedDays} />
              <div className="mt-2 flex justify-between text-[11px] text-ink-500">
                <span>
                  <span className="sm:hidden">45</span>
                  <span className="hidden sm:inline">90</span> days ago
                </span>
                <span>Today</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const IMPACT: Record<Incident['impact'], { tone: 'warning' | 'danger' | 'brand'; label: string }> = {
  minor: { tone: 'warning', label: 'Minor' },
  major: { tone: 'danger', label: 'Major' },
  maintenance: { tone: 'brand', label: 'Maintenance' },
};

export function IncidentCard({ incident }: { incident: Incident }) {
  const [open, setOpen] = useState(false);
  const impact = IMPACT[incident.impact];
  const [latest, ...rest] = incident.updates;
  return (
    <div className="card overflow-hidden">
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-ink-400">{incident.date}</span>
          <Badge tone={impact.tone}>{impact.label}</Badge>
          {latest && <Badge tone={latest.stage === 'Resolved' || latest.stage === 'Completed' ? 'success' : 'warning'}>{latest.stage}</Badge>}
          <span className="text-ink-500">· {incident.duration}</span>
        </div>
        <p className="mt-3 flex items-center gap-2 font-medium text-white">
          {incident.impact === 'maintenance' && <Wrench className="h-4 w-4 text-brand-300" />}
          {incident.title}
        </p>
        {latest && <p className="mt-1 text-sm leading-6 text-ink-300">{latest.text}</p>}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {incident.affected.map((a) => (
            <span key={a} className="rounded-md bg-white/[0.04] px-2 py-0.5 text-[11px] text-ink-300 ring-1 ring-white/[0.06]">
              {a}
            </span>
          ))}
        </div>
      </div>
      {rest.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex w-full items-center justify-between border-t border-white/[0.06] px-5 py-3 text-xs text-ink-400 transition hover:bg-white/[0.02] hover:text-white sm:px-6"
          >
            {open ? 'Hide timeline' : `Show full timeline (${incident.updates.length} updates)`}
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
          </button>
          {open && (
            <ol className="animate-fade-in space-y-4 border-t border-white/[0.06] bg-white/[0.01] px-5 py-5 sm:px-6">
              {incident.updates.map((u, i) => (
                <li key={u.time + u.stage} className="relative flex gap-4">
                  <div className="flex flex-col items-center">
                    <span className={cn('mt-1.5 h-2 w-2 rounded-full', i === 0 ? 'bg-success-400' : 'bg-ink-500')} />
                    {i < incident.updates.length - 1 && <span className="mt-1 w-px flex-1 bg-white/[0.08]" />}
                  </div>
                  <div className="pb-1">
                    <p className="text-xs text-ink-400">
                      <span className="font-medium text-ink-100">{u.stage}</span> · {u.time} CET
                    </p>
                    <p className="mt-0.5 text-sm leading-6 text-ink-300">{u.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
