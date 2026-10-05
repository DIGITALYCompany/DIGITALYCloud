'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { PRODUCTS, getProduct } from '@/data/products';
import { REGIONS } from '@/data/regions';
import { cn } from '@/lib/utils';
import { PlanCards } from './plan-cards';
import { RegionAvailability } from './region-availability';

/** Product tabs, plans and region matrix. The selected product is kept in `?product=`. */
export function PricingExplorer() {
  const params = useSearchParams();
  const product = getProduct(params.get('product') ?? '') ?? PRODUCTS[0];

  const select = (slug: string) => window.history.replaceState(null, '', `?product=${slug}`);

  return (
    <>
      <div className="mt-12 flex justify-center">
        <div role="tablist" className="-mx-4 flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-white/[0.07] bg-ink-900/60 p-1.5 px-4 sm:mx-0 sm:px-1.5">
          {PRODUCTS.map((p) => {
            const active = p.slug === product.slug;
            return (
              <button
                key={p.slug}
                role="tab"
                aria-selected={active}
                onClick={() => select(p.slug)}
                className={cn('flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm transition', active ? 'bg-white/[0.08] text-white shadow-inner' : 'text-ink-400 hover:text-white')}
              >
                <p.icon className={cn('h-4 w-4', active && p.accent.text)} />
                {p.name.replace(' Hosting', '')}
              </button>
            );
          })}
        </div>
      </div>

      <div key={product.slug} className="mt-10">
        <div className="mb-8 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-semibold text-white">{product.name}</h2>
            <p className="mt-1 text-sm text-ink-400">{product.short}</p>
          </div>
          <Link href={`/products/${product.slug}`} className="inline-flex items-center gap-1 text-sm text-brand-300 hover:text-brand-200">
            Learn more about {product.name} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <PlanCards plans={product.plans} deployable={product.deployable} />
      </div>

      <div className="mt-20">
        <div className="mb-8 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-xl font-semibold text-white">Regions included in each plan</h2>
            <p className="mt-1 text-sm text-ink-400">{REGIONS.length} regions on 3 continents. Pick yours when you create a service.</p>
          </div>
          <Link href="/infrastructure" className="inline-flex items-center gap-1 text-sm text-brand-300 hover:text-brand-200">
            About our infrastructure <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <RegionAvailability planNames={product.plans.map((p) => p.name)} />
      </div>
    </>
  );
}
