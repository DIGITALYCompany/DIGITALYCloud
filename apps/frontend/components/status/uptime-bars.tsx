'use client';

import { useMemo } from 'react';
import type { DayState, StatusComponent } from '@/data/status';
import { useHydrated } from '@/hooks/use-hydrated';
import { daysAgoLabel } from '@/lib/simulation';
import { cn } from '@/lib/utils';

const DAYS = 90;

export const UPTIME_COLOR: Record<DayState, string> = {
  ok: 'bg-success-500/80 hover:bg-success-400',
  maintenance: 'bg-brand-500 hover:bg-brand-400',
  degraded: 'bg-warning-500 hover:bg-warning-400',
  outage: 'bg-danger-500 hover:bg-danger-400',
};

/** One bar per day for the last 90 days (45 on mobile), with a tooltip per day. */
export function UptimeBars({ component }: { component: StatusComponent }) {
  // Dates depend on "today" in the visitor's timezone, so they are only rendered on the client.
  const hydrated = useHydrated();
  const days = useMemo(
    () =>
      Array.from({ length: DAYS }, (_, i) => {
        const daysAgo = DAYS - 1 - i;
        const event = component.events?.find((e) => e.daysAgo === daysAgo);
        return { daysAgo, state: event?.state ?? ('ok' as DayState), note: event?.note ?? 'No incidents' };
      }),
    [component]
  );

  return (
    <div className="flex h-9 items-stretch gap-[2px]">
      {days.map((d) => (
        <span key={d.daysAgo} className={cn('group/bar relative flex-1', d.daysAgo >= 45 && 'hidden sm:block')}>
          <span className={cn('block h-full w-full rounded-[3px] transition-colors', UPTIME_COLOR[d.state])} />
          <span
            role="tooltip"
            className={cn(
              'pointer-events-none absolute bottom-full z-30 mb-2 whitespace-nowrap rounded-lg border border-white/10 bg-ink-800 px-2.5 py-1 text-xs text-ink-100 opacity-0 shadow-xl transition-opacity group-hover/bar:opacity-100',
              d.daysAgo > DAYS - 12 ? 'left-0' : d.daysAgo < 12 ? 'right-0' : 'left-1/2 -translate-x-1/2'
            )}
          >
            {hydrated ? `${daysAgoLabel(d.daysAgo)} · ${d.note}` : d.note}
          </span>
        </span>
      ))}
    </div>
  );
}
