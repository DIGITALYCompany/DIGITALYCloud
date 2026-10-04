'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight, BookOpen, Bot, ChevronDown, Gamepad2, Globe, LayoutGrid, MapPin, ShieldCheck, type LucideIcon } from 'lucide-react';
import { PRODUCTS, type Product } from '@/data/products';
import { REGIONS } from '@/data/regions';
import { formatEuro } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ProductIcon } from '@/components/marketing/product-icon';

export const PRODUCT_CATEGORIES: { name: Product['category']; icon: LucideIcon; blurb: string }[] = [
  { name: 'Bots & Apps', icon: Bot, blurb: 'Always-on bots, apps and background jobs.' },
  { name: 'Gaming', icon: Gamepad2, blurb: 'Low-latency servers for your community.' },
  { name: 'Web', icon: Globe, blurb: 'APIs, websites and public endpoints.' },
];

const LOWEST_PAID = Math.min(...PRODUCTS.flatMap((p) => p.plans.map((pl) => pl.price)).filter((v) => v > 0));

export function ProductLink({ p, onClick }: { p: Product; onClick?: () => void }) {
  return (
    <Link href={`/products/${p.slug}`} onClick={onClick} className="group flex items-start gap-3 rounded-xl p-2.5 transition hover:bg-white/[0.04]">
      <ProductIcon product={p} className="h-9 w-9 shrink-0 rounded-lg transition group-hover:scale-105" iconClassName="h-4 w-4" />
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-sm font-medium text-white">
          {p.name}
          {p.badge && <span className="rounded-full bg-aqua-500/15 px-1.5 py-px text-[10px] font-medium text-aqua-300">{p.badge}</span>}
        </span>
        <span className="block text-xs leading-5 text-ink-400">{p.short}</span>
      </span>
    </Link>
  );
}

function CategoryColumn({ cat, className }: { cat: (typeof PRODUCT_CATEGORIES)[number]; className?: string }) {
  const items = PRODUCTS.filter((p) => p.category === cat.name);
  const solo = items.length === 1 ? items[0] : null;
  return (
    <div className={cn('flex flex-col p-3', className)}>
      <div className="px-2.5 pb-3 pt-2">
        <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-400">
          <cat.icon className="h-3.5 w-3.5 text-ink-500" /> {cat.name}
        </p>
        <p className="mt-1 text-xs leading-5 text-ink-500">{cat.blurb}</p>
      </div>
      <div className="space-y-0.5">
        {items.map((p) => (
          <ProductLink key={p.slug} p={p} />
        ))}
      </div>
      {solo && (
        <div className="mt-3 px-2.5">
          <p className="text-[11px] text-ink-500">Popular</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {solo.stack.slice(0, 6).map((s) => (
              <Link
                key={s}
                href={`/products/${solo.slug}`}
                className="rounded-md bg-white/[0.04] px-2 py-1 text-[11px] text-ink-300 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] hover:text-white"
              >
                {s}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Desktop mega menu: opens on hover or click, closes on Escape, mouse leave or navigation. */
export function ProductsMenu({ active }: { active: boolean }) {
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenOn(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const enter = () => {
    window.clearTimeout(timer.current);
    setOpenOn(pathname);
  };
  const leave = () => {
    timer.current = window.setTimeout(() => setOpenOn(null), 120);
  };

  return (
    <div onMouseEnter={enter} onMouseLeave={leave}>
      <button
        onClick={() => setOpenOn(open ? null : pathname)}
        aria-expanded={open}
        className={cn('flex items-center gap-1 rounded-lg px-3 py-2 text-sm transition', open || active ? 'text-white' : 'text-ink-300 hover:text-white')}
      >
        Products
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute inset-x-0 top-full z-50 pt-2">
          <div className="origin-top animate-scale-in overflow-hidden rounded-2xl border border-white/10 bg-ink-900 shadow-2xl shadow-black/70">
            <div className="grid grid-cols-3 lg:grid-cols-[1fr_1fr_1fr_280px]">
              {PRODUCT_CATEGORIES.map((c, i) => (
                <CategoryColumn key={c.name} cat={c} className={i > 0 ? 'border-l border-white/[0.05]' : undefined} />
              ))}
              <div className="relative hidden flex-col justify-between overflow-hidden border-l border-white/[0.05] bg-white/[0.02] p-5 lg:flex">
                <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-brand-500/25 blur-3xl" />
                <div className="relative">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-ink-300">
                    <BookOpen className="h-3 w-3" /> Guide
                  </span>
                  <p className="mt-3 font-medium text-white">Deploy your first Discord bot</p>
                  <p className="mt-1 text-xs leading-5 text-ink-400">From an empty folder to an online bot in under 5 minutes.</p>
                  <Link href="/docs/discord-bots" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-300 hover:text-brand-200">
                    Read the guide <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
                <div className="relative mt-6 rounded-xl border border-white/[0.08] bg-ink-950/40 p-3">
                  <p className="text-[11px] text-ink-500">Starting at</p>
                  <p className="mt-0.5 font-mono text-lg font-medium text-white">
                    Free<span className="ml-1 font-sans text-xs font-normal text-ink-400">then from {formatEuro(LOWEST_PAID)}/mo</span>
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] bg-white/[0.015] px-5 py-3">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-ink-400">
                <Link href="/infrastructure" className="flex items-center gap-1.5 transition hover:text-white">
                  <MapPin className="h-3.5 w-3.5" /> {REGIONS.length} regions on 3 continents
                </Link>
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5" /> DDoS protection included
                </span>
                <Link href="/status" className="flex items-center gap-1.5 transition hover:text-white">
                  <span className="h-1.5 w-1.5 rounded-full bg-success-400" /> All systems operational
                </Link>
              </div>
              <div className="flex items-center gap-1">
                <Link href="/pricing" className="rounded-lg px-3 py-1.5 text-xs text-ink-300 transition hover:bg-white/[0.05] hover:text-white">
                  Compare plans
                </Link>
                <Link href="/products" className="group flex items-center gap-1.5 rounded-lg bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/[0.09]">
                  <LayoutGrid className="h-3.5 w-3.5" /> All products
                  <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
