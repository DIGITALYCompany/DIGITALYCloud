import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function StatCard({
  label,
  value,
  sub,
  icon,
  footer,
  accent,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon: ReactNode;
  footer?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="card card-hover group relative overflow-hidden p-5">
      {accent && <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-brand-500/20 blur-2xl" />}
      <div className="relative flex items-center justify-between">
        <span className="text-sm text-ink-300">{label}</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-ink-300 transition group-hover:text-brand-300 [&>svg]:h-4 [&>svg]:w-4">
          {icon}
        </span>
      </div>
      <div className="relative mt-3 font-mono text-[28px] font-medium tracking-tight text-white">{value}</div>
      {sub && <div className="relative mt-1 text-xs text-ink-400">{sub}</div>}
      {footer && <div className="relative mt-4">{footer}</div>}
    </div>
  );
}

export function Panel({
  title,
  description,
  action,
  children,
  className,
  bodyClass = 'p-5',
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
}) {
  return (
    <section className={cn('card flex flex-col', className)}>
      <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-5 py-4">
        <div>
          <h3 className="text-sm font-medium text-white">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-ink-400">{description}</p>}
        </div>
        {action}
      </div>
      <div className={cn('flex-1', bodyClass)}>{children}</div>
    </section>
  );
}

export function MetricRow({ label, value, children }: { label: string; value: ReactNode; children?: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="text-ink-400">{label}</span>
        <span className="font-mono text-ink-100">{value}</span>
      </div>
      {children}
    </div>
  );
}
