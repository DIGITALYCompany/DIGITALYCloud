'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { ServiceStatusBadge } from '@/components/ui/badge';
import { useClickOutside } from '@/hooks/use-click-outside';
import { useCloud } from '@/providers/cloud-provider';
import { SERVICE_TYPES } from '@/lib/catalog';
import type { AppHref } from '@/lib/routes';

const PAGES: { label: string; href: AppHref }[] = [
  { label: 'Create a new service', href: '/services/new' },
  { label: 'Billing & invoices', href: '/billing' },
  { label: 'API keys', href: '/settings?tab=api' },
  { label: 'Infrastructure servers', href: '/servers' },
];

/** Header search across services and common pages. Focus with ⌘K / Ctrl+K. */
export function GlobalSearch() {
  const { services } = useCloud();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    return {
      services: services.filter((x) => x.name.toLowerCase().includes(s)).slice(0, 5),
      pages: PAGES.filter((p) => p.label.toLowerCase().includes(s)),
    };
  }, [q, services]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        document.getElementById('global-search')?.focus();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const go = (href: AppHref) => {
    setOpen(false);
    setQ('');
    router.push(href as Route);
  };

  return (
    <div ref={ref} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
      <input
        id="global-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="Search services, pages..."
        aria-label="Search services and pages"
        className="h-9 w-full rounded-xl border border-white/[0.07] bg-white/[0.03] pl-9 pr-14 text-sm text-ink-100 outline-hidden transition placeholder:text-ink-400 focus:border-brand-500/50 focus:bg-ink-900"
      />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-md border border-white/10 px-1.5 font-mono text-[10px] text-ink-400 sm:block">⌘K</kbd>
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 animate-scale-in overflow-hidden rounded-2xl border border-white/10 bg-ink-850/95 p-2 shadow-2xl backdrop-blur-xl">
          {results.services.length > 0 && <p className="px-2 py-1.5 text-[11px] uppercase tracking-wider text-ink-500">Services</p>}
          {results.services.map((s) => {
            const T = SERVICE_TYPES[s.type];
            return (
              <button key={s.id} onClick={() => go(`/services/${s.id}`)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-white/[0.06]">
                <T.icon className="h-4 w-4 text-ink-400" />
                <span className="flex-1 text-white">{s.name}</span>
                <ServiceStatusBadge status={s.status} />
              </button>
            );
          })}
          {results.pages.length > 0 && <p className="px-2 py-1.5 text-[11px] uppercase tracking-wider text-ink-500">Go to</p>}
          {results.pages.map((p) => (
            <button key={p.href} onClick={() => go(p.href)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm text-ink-200 hover:bg-white/[0.06]">
              {p.label}
            </button>
          ))}
          {results.services.length + results.pages.length === 0 && <p className="px-2 py-6 text-center text-sm text-ink-400">No results for &quot;{q}&quot;</p>}
        </div>
      )}
    </div>
  );
}
