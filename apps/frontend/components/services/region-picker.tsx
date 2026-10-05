'use client';

import { Check, Lock, MapPin } from 'lucide-react';
import { REGION_AREAS, REGIONS, isRegionAllowed, type Region } from '@/data/regions';
import type { Plan } from '@/lib/catalog';
import { cn } from '@/lib/utils';
import type { PlanId } from '@/lib/types';

interface Props {
  plan: PlanId;
  plans: Plan[];
  value: string;
  /** Regions with free capacity right now; null while unknown (nothing is disabled). */
  available?: Set<string> | null;
  onSelect: (region: Region) => void;
  /** Called for regions locked on the current plan. */
  onUpgrade: (region: Region) => void;
}

export function RegionPicker({ plan, plans, value, available = null, onSelect, onUpgrade }: Props) {
  return (
    <div className="space-y-6">
      {REGION_AREAS.map((area) => {
        const regions = REGIONS.filter((r) => r.area === area);
        const open = regions.filter((r) => isRegionAllowed(r, plan)).length;
        return (
          <div key={area}>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink-400">{area}</p>
              <p className="text-xs text-ink-500">
                {open}/{regions.length} on your plan
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {regions.map((r) => {
                const allowed = isRegionAllowed(r, plan);
                const hasCapacity = !available || available.has(r.id);
                const selected = value === r.id;
                const required = plans.find((p) => p.id === r.minPlan);
                return (
                  <button
                    key={r.id}
                    type="button"
                    disabled={!hasCapacity}
                    title={hasCapacity ? undefined : 'No capacity in this region right now'}
                    onClick={() => (allowed ? onSelect(r) : onUpgrade(r))}
                    className={cn(
                      'group relative flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-45',
                      selected
                        ? 'border-brand-500/70 bg-brand-500/[0.07] shadow-[0_0_0_3px_rgba(37,99,255,0.12)]'
                        : allowed
                          ? 'border-white/[0.08] bg-ink-900 hover:border-white/20 hover:bg-ink-850'
                          : 'border-dashed border-white/[0.08] bg-transparent hover:border-warning-500/40'
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-mono text-[11px] font-medium ring-1',
                        allowed ? 'bg-white/[0.04] text-ink-200 ring-white/[0.08]' : 'bg-transparent text-ink-500 ring-white/[0.05]'
                      )}
                    >
                      {r.countryCode}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate text-sm font-medium', allowed ? 'text-white' : 'text-ink-400')}>{r.city}</span>
                      {!hasCapacity ? (
                        <span className="block truncate text-[11px] text-ink-500">Temporarily unavailable</span>
                      ) : allowed ? (
                        <span className="block truncate font-mono text-[11px] text-ink-500">
                          {r.code} · ~{r.latencyMs} ms from Paris
                        </span>
                      ) : (
                        <span className="block truncate text-[11px] text-warning-400 opacity-80 transition group-hover:opacity-100">Switch to {required?.name ?? r.minPlan} to unlock</span>
                      )}
                    </span>
                    {selected ? (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-gradient">
                        <Check className="h-3 w-3 text-white" />
                      </span>
                    ) : !allowed ? (
                      <Lock className="h-4 w-4 shrink-0 text-ink-500 transition group-hover:text-warning-400" />
                    ) : (
                      <MapPin className="h-4 w-4 shrink-0 text-ink-500 transition group-hover:text-ink-300" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
