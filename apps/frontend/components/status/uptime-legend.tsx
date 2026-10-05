import type { DayState } from '@digitalycloud/shared';
import { cn } from '@/lib/utils';

const LEGEND: { state: DayState | 'nodata'; label: string; color: string }[] = [
  { state: 'ok', label: 'Operational', color: 'bg-success-500/80' },
  { state: 'maintenance', label: 'Maintenance', color: 'bg-brand-500' },
  { state: 'degraded', label: 'Degraded', color: 'bg-warning-500' },
  { state: 'outage', label: 'Outage', color: 'bg-danger-500' },
  { state: 'nodata', label: 'No data', color: 'bg-white/[0.06]' },
];

export function UptimeLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-400">
      {LEGEND.map((l) => (
        <span key={l.state} className="flex items-center gap-1.5">
          <span className={cn('h-2.5 w-2.5 rounded-[3px]', l.color)} /> {l.label}
        </span>
      ))}
    </div>
  );
}
