'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Single-open accordion; the first question starts expanded. */
export function Faq({ items }: { items: [string, string][] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="divide-y divide-white/[0.06] rounded-2xl border border-white/[0.07] bg-ink-900/60">
      {items.map(([q, a], i) => (
        <div key={q}>
          <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left" aria-expanded={open === i}>
            <span className="font-medium text-white">{q}</span>
            <ChevronDown className={cn('h-4 w-4 shrink-0 text-ink-400 transition', open === i && 'rotate-180')} />
          </button>
          {open === i && <p className="animate-fade-in px-6 pb-5 text-sm text-ink-300">{a}</p>}
        </div>
      ))}
    </div>
  );
}
