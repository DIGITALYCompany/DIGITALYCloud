'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import { PRODUCTS } from '@/data/products';
import { cn } from '@/lib/utils';
import { ProductVisual } from './product-card';
import { ProductIcon } from './product-icon';
import { formatStartingPrice } from './pricing';

export function ProductExplorer() {
  const [slug, setSlug] = useState(PRODUCTS[0].slug);
  const p = PRODUCTS.find((x) => x.slug === slug) ?? PRODUCTS[0];

  return (
    <div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:justify-center sm:px-0" role="tablist">
        {PRODUCTS.map((x) => {
          const active = x.slug === slug;
          return (
            <button
              key={x.slug}
              role="tab"
              aria-selected={active}
              onClick={() => setSlug(x.slug)}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm transition',
                active ? 'border-white/20 bg-white/[0.08] text-white' : 'border-white/[0.07] text-ink-400 hover:border-white/15 hover:text-ink-100'
              )}
            >
              <x.icon className={cn('h-4 w-4', active && x.accent.text)} />
              {x.name.replace(' Hosting', '')}
              {x.badge && <span className="rounded-full bg-aqua-500/15 px-1.5 text-[10px] text-aqua-300">{x.badge}</span>}
            </button>
          );
        })}
      </div>

      <div key={p.slug} className="mt-10 grid animate-fade-up items-center gap-12 rounded-3xl border border-white/[0.07] bg-ink-900/50 p-6 sm:p-10 lg:grid-cols-2">
        <div>
          <ProductIcon product={p} className="inline-flex h-11 w-11 rounded-xl" />
          <h3 className="mt-5 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {p.headline[0]} <span className="text-gradient">{p.headline[1]}</span>
          </h3>
          <p className="mt-4 text-ink-300">{p.description}</p>
          <ul className="mt-6 space-y-3">
            {p.highlights.slice(0, 3).map((h) => (
              <li key={h.title} className="flex gap-3">
                <h.icon className={cn('mt-0.5 h-4 w-4 shrink-0', p.accent.text)} />
                <span className="text-sm">
                  <span className="font-medium text-white">{h.title}.</span> <span className="text-ink-300">{h.body}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <ButtonLink href={`/products/${p.slug}`} icon={<ArrowRight className="h-4 w-4" />}>
              Explore {p.name}
            </ButtonLink>
            <span className="text-sm text-ink-400">
              From <span className="font-mono text-white">{formatStartingPrice(p)}</span>/month
            </span>
          </div>
        </div>
        <div className="pb-8 lg:pb-0">
          <ProductVisual p={p} />
        </div>
      </div>
      <p className="mt-6 text-center">
        <Link href="/products" className="inline-flex items-center gap-1 text-sm text-ink-300 transition hover:text-white">
          Compare all products <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </p>
    </div>
  );
}
