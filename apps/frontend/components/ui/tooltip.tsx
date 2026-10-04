import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** CSS-only hover tooltip (no delay, no portal) used for icon buttons. */
export function Tooltip({ label, children, side = 'top' }: { label: string; children: ReactNode; side?: 'top' | 'bottom' }) {
  return (
    <span className="group/tt relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-ink-800 px-2.5 py-1 text-xs text-ink-100 opacity-0 shadow-xl transition-all duration-150 group-hover/tt:opacity-100',
          side === 'top' ? 'bottom-full mb-2 translate-y-1 group-hover/tt:translate-y-0' : 'top-full mt-2 -translate-y-1 group-hover/tt:translate-y-0'
        )}
      >
        {label}
      </span>
    </span>
  );
}
