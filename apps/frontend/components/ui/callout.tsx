import type { ReactNode } from 'react';
import { AlertTriangle, Info, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';

const CALLOUT = {
  info: { icon: Info, cls: 'border-brand-500/25 bg-brand-500/[0.06] text-brand-200' },
  warning: { icon: AlertTriangle, cls: 'border-warning-500/25 bg-warning-500/[0.06] text-warning-400' },
  tip: { icon: Lightbulb, cls: 'border-success-500/25 bg-success-500/[0.06] text-success-400' },
};

export function Callout({ kind = 'info', children }: { kind?: keyof typeof CALLOUT; children: ReactNode }) {
  const c = CALLOUT[kind];
  return (
    <div className={cn('my-5 flex gap-3 rounded-2xl border p-4', c.cls)}>
      <c.icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="text-sm text-ink-200">{children}</div>
    </div>
  );
}
