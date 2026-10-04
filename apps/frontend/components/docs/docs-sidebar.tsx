'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpen, Search } from 'lucide-react';
import { SECTION_META, groupBySection, matchesQuery, type DocMeta } from '@/data/docs/catalog';
import { cn } from '@/lib/utils';

/** Desktop article navigation with a live filter. */
export function DocsSidebar({ docs, currentSlug }: { docs: DocMeta[]; currentSlug: string }) {
  const [q, setQ] = useState('');
  const sections = useMemo(() => groupBySection(docs.filter((d) => matchesQuery(d, q))), [docs, q]);

  return (
    <aside className="sticky top-24 hidden h-[calc(100vh-8rem)] w-60 shrink-0 overflow-y-auto pb-8 lg:block">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input className="input pl-9" placeholder="Search docs" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Link href="/docs" className="mt-4 flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-ink-300 transition hover:bg-white/[0.04] hover:text-white">
        <BookOpen className="h-4 w-4" /> Docs home
      </Link>
      <nav className="mt-4 space-y-6">
        {Object.entries(sections).map(([section, items]) => {
          const m = SECTION_META[section];
          return (
            <div key={section}>
              <p className="mb-2 flex items-center gap-2 px-3 text-xs font-medium uppercase tracking-wider text-ink-500">
                {m && <m.icon className="h-3.5 w-3.5" />} {section}
              </p>
              {items.map((d) => (
                <Link
                  key={d.slug}
                  href={`/docs/${d.slug}`}
                  aria-current={d.slug === currentSlug ? 'page' : undefined}
                  className={cn('block rounded-lg px-3 py-1.5 text-sm transition', d.slug === currentSlug ? 'bg-brand-500/10 font-medium text-brand-200' : 'text-ink-300 hover:bg-white/[0.04] hover:text-white')}
                >
                  {d.title}
                </Link>
              ))}
            </div>
          );
        })}
        {Object.keys(sections).length === 0 && <p className="px-3 text-sm text-ink-400">No results for “{q}”</p>}
      </nav>
    </aside>
  );
}

/** Mobile replacement for the sidebar. */
export function DocsSelect({ docs, currentSlug }: { docs: DocMeta[]; currentSlug: string }) {
  const router = useRouter();
  return (
    <div className="mb-6 lg:hidden">
      <select className="input" value={currentSlug} onChange={(e) => router.push(`/docs/${e.target.value}`)} aria-label="Choose an article">
        {docs.map((d) => (
          <option key={d.slug} value={d.slug}>
            {d.section} — {d.title}
          </option>
        ))}
      </select>
    </div>
  );
}
