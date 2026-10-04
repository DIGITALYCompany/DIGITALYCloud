import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Feature {
  icon: LucideIcon;
  title: string;
  body: string;
}

/** Hairline-separated grid of feature tiles. Column count comes from `className`. */
export function FeatureGrid({ items, className, iconClassName }: { items: Feature[]; className?: string; iconClassName: string }) {
  return (
    <div className={cn('mt-14 grid gap-px overflow-hidden rounded-3xl border border-white/[0.07] bg-white/[0.06]', className)}>
      {items.map((f) => (
        <div key={f.title} className="group bg-ink-950 p-7 transition hover:bg-ink-900">
          <f.icon className={cn(iconClassName, 'transition group-hover:scale-110')} />
          <h3 className="mt-5 font-semibold text-white">{f.title}</h3>
          <p className="mt-2 text-sm text-ink-300">{f.body}</p>
        </div>
      ))}
    </div>
  );
}
