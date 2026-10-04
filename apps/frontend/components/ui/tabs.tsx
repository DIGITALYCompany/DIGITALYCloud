import { cn } from '@/lib/utils';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  count?: number;
}

/** Segmented control used for filters (state lives in the parent). */
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: TabItem<T>[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-white/[0.07] bg-ink-900 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            'flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-medium transition',
            value === t.id ? 'bg-white/[0.08] text-white shadow-inner' : 'text-ink-400 hover:text-ink-100'
          )}
        >
          {t.label}
          {t.count !== undefined && <span className={cn('rounded-md px-1.5 text-xs', value === t.id ? 'bg-brand-500/20 text-brand-200' : 'bg-white/5 text-ink-400')}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
