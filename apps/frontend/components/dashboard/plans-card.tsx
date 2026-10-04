'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Sparkles } from 'lucide-react';
import { ChangePlanModal } from '@/components/services/change-plan-modal';
import { ProgressBar } from '@/components/ui/progress-bar';
import { PLAN_LEVELS, SERVICE_TYPES, getServicePlan, monthlyTotal } from '@/lib/catalog';
import { formatEuro, formatMb } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Service } from '@/lib/types';

const TOP_LEVEL = PLAN_LEVELS[PLAN_LEVELS.length - 1];

/** Monthly total and per-service plans, with quick upgrades. */
export function PlansCard({ services }: { services: Service[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const total = monthlyTotal(services);
  const editing = services.find((s) => s.id === editingId) ?? null;

  return (
    <section className="card relative flex flex-col overflow-hidden">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand-500/20 blur-3xl" />
      <div className="relative p-6 pb-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-ink-300">Your plans</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1 text-xs font-medium text-white">
            <Sparkles className="h-3 w-3 text-azure-400" /> Per service
          </span>
        </div>
        <p className="mt-4 text-3xl font-semibold tracking-tight text-white">
          {formatEuro(total)}
          <span className="text-sm font-normal text-ink-400"> /month</span>
        </p>
        <p className="mt-1 text-xs text-ink-400">
          {services.length} service{services.length === 1 ? '' : 's'}, each with its own plan
        </p>
      </div>

      {services.length === 0 ? (
        <p className="relative px-6 pb-6 text-sm text-ink-400">Create a service to pick its plan.</p>
      ) : (
        <ul className="relative max-h-[320px] flex-1 divide-y divide-white/[0.05] overflow-y-auto border-t border-white/[0.05]">
          {services.map((s) => {
            const plan = getServicePlan(s.type, s.plan);
            const T = SERVICE_TYPES[s.type];
            const ramPct = (s.ramMb / s.ramLimitMb) * 100;
            return (
              <li key={s.id} className="flex items-center gap-3 px-6 py-3">
                <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1', T.color)}>
                  <T.icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/services/${s.id}`} className="truncate text-sm text-white hover:text-brand-200">
                      {s.name}
                    </Link>
                    <span className="shrink-0 font-mono text-xs text-ink-300">{plan.price ? formatEuro(plan.price) : 'Free'}</span>
                  </div>
                  <p className="truncate text-[11px] text-ink-500">
                    {plan.name} · {formatMb(s.ramLimitMb)} RAM
                  </p>
                  <ProgressBar value={ramPct} tone={ramPct > 85 ? 'warning' : 'brand'} className="mt-1.5" />
                </div>
                <button
                  type="button"
                  onClick={() => setEditingId(s.id)}
                  className={cn(
                    'shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium transition',
                    s.plan === TOP_LEVEL ? 'text-ink-400 hover:bg-white/[0.06] hover:text-white' : 'bg-brand-500/10 text-brand-200 ring-1 ring-inset ring-brand-500/25 hover:bg-brand-500/20'
                  )}
                >
                  {s.plan === TOP_LEVEL ? 'Change' : 'Upgrade'}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="relative mt-auto grid grid-cols-2 gap-2 border-t border-white/[0.05] p-4">
        <Link href="/billing" className="inline-flex h-9 items-center justify-center rounded-xl border border-white/10 text-sm font-medium text-ink-100 transition hover:border-white/20 hover:bg-white/[0.04]">
          Billing
        </Link>
        <a
          href="/pricing"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/10 text-sm font-medium text-ink-100 transition hover:border-white/20 hover:bg-white/[0.04]"
        >
          Pricing <ArrowUpRight className="h-3.5 w-3.5" />
        </a>
      </div>

      <ChangePlanModal service={editing} onClose={() => setEditingId(null)} />
    </section>
  );
}
