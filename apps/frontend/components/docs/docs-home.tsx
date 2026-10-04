'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Clock, Search } from 'lucide-react';
import { SECTION_META, groupBySection, matchesQuery, type DocMeta } from '@/data/docs/catalog';
import { cn } from '@/lib/utils';

export function DocsHome({ docs }: { docs: DocMeta[] }) {
  const [q, setQ] = useState('');
  const featured = docs.filter((d) => d.featured);
  const sections = useMemo(() => groupBySection(docs), [docs]);
  const results = q.trim() ? docs.filter((d) => matchesQuery(d, q)) : [];

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-[120px] sm:px-6 lg:px-8">
      <div className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-ink-900/60 px-6 py-12 text-center sm:px-12 sm:py-16">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-brand-500/20 blur-3xl" />
        <p className="relative text-xs font-medium uppercase tracking-[0.18em] text-brand-300">Documentation</p>
        <h1 className="relative mt-3 text-3xl font-semibold leading-tight tracking-tight text-white sm:text-5xl sm:leading-none">How can we help?</h1>
        <p className="relative mx-auto mt-4 max-w-xl text-ink-300">Guides, best practices and reference for running your projects on DIGITALYCloud.</p>
        <div className="relative mx-auto mt-8 max-w-xl">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            className="input h-12 rounded-2xl pl-11 text-[15px]"
            placeholder="Search articles, e.g. “memory” or “token”"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search the documentation"
          />
          {q.trim() && (
            <div className="absolute inset-x-0 top-full z-20 mt-2 max-h-80 animate-scale-in overflow-y-auto rounded-2xl border border-white/10 bg-ink-850/95 p-1.5 text-left shadow-2xl shadow-black/60 backdrop-blur-xl">
              {results.length === 0 && <p className="px-3 py-4 text-sm text-ink-400">No article matches “{q}”.</p>}
              {results.map((d) => (
                <Link key={d.slug} href={`/docs/${d.slug}`} className="block rounded-xl px-3 py-2.5 transition hover:bg-white/[0.06]">
                  <p className="text-sm font-medium text-white">{d.title}</p>
                  <p className="text-xs text-ink-400">
                    {d.section} · {d.summary}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <h2 className="mt-16 text-lg font-semibold text-white">Popular articles</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {featured.map((d) => {
          const meta = SECTION_META[d.section];
          return (
            <Link key={d.slug} href={`/docs/${d.slug}`} className="card card-hover group flex flex-col p-5">
              <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl ring-1', meta?.tone)}>{meta && <meta.icon className="h-4 w-4" />}</span>
              <p className="mt-4 font-medium text-white">{d.title}</p>
              <p className="mt-1 flex-1 text-sm leading-6 text-ink-400">{d.summary}</p>
              <span className="mt-4 flex items-center justify-between text-xs text-ink-500">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3 w-3" /> {d.minutes} min read
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-ink-400 transition group-hover:translate-x-0.5 group-hover:text-brand-300" />
              </span>
            </Link>
          );
        })}
      </div>

      <h2 className="mt-16 text-lg font-semibold text-white">Browse by topic</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {Object.entries(sections).map(([section, items]) => {
          const meta = SECTION_META[section];
          return (
            <div key={section} className="card p-6">
              <div className="flex items-start gap-3">
                <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1', meta?.tone)}>{meta && <meta.icon className="h-4 w-4" />}</span>
                <div>
                  <p className="font-medium text-white">{section}</p>
                  <p className="text-sm text-ink-400">{meta?.blurb}</p>
                </div>
              </div>
              <ul className="mt-4 space-y-0.5 border-t border-white/[0.06] pt-3">
                {items.map((d) => (
                  <li key={d.slug}>
                    <Link href={`/docs/${d.slug}`} className="group flex items-center justify-between rounded-lg px-2 py-1.5 text-sm text-ink-300 transition hover:bg-white/[0.04] hover:text-white">
                      {d.title}
                      <ArrowRight className="h-3.5 w-3.5 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="mt-16 flex flex-col items-start justify-between gap-4 rounded-3xl border border-white/[0.07] bg-linear-to-br/srgb from-brand-500/[0.08] to-azure-500/[0.04] p-6 sm:flex-row sm:items-center sm:p-8">
        <div>
          <p className="font-medium text-white">Can’t find what you’re looking for?</p>
          <p className="mt-1 text-sm text-ink-300">Our team answers every question, usually within a few hours.</p>
        </div>
        <Link href="/contact" className="inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-4 py-2 text-sm font-medium text-white shadow-lg shadow-brand-500/25 transition hover:brightness-110">
          Contact support <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
