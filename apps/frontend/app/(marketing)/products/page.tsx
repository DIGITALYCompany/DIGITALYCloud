import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { HeroGlow } from '@/components/marketing/hero-glow';
import { ProductCard } from '@/components/marketing/product-card';
import { SectionHeading } from '@/components/marketing/section-heading';
import { PRODUCTS, getProduct, type ProductSlug } from '@/data/products';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Products',
  description: 'Bots, game servers, apps and websites, all on DIGITALY infrastructure in France and managed from one dashboard.',
};

const CHOOSER: [string, ProductSlug][] = [
  ['I want my Discord bot online all the time', 'discord-bots'],
  ['I want a Minecraft or FiveM server for my community', 'game-servers'],
  ['I have a Next.js or Express app', 'nodejs'],
  ['I need a public endpoint for webhooks', 'apis'],
  ['I run a script every few minutes', 'workers'],
  ['I want to publish a portfolio or landing page', 'websites'],
];

const CATEGORIES = ['Bots & Apps', 'Gaming', 'Web'] as const;

export default function ProductsPage() {
  return (
    <div className="relative">
      <HeroGlow />
      <div className="relative mx-auto max-w-7xl px-4 pb-24 pt-36 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Products"
          title="One cloud for everything you build"
          description="Bots, game servers, apps and websites, all on DIGITALY infrastructure in France and managed from one dashboard."
        />

        {CATEGORIES.map((cat) => (
          <div key={cat} className="mt-16">
            <p className="mb-5 text-xs font-medium uppercase tracking-[0.18em] text-ink-500">{cat}</p>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {PRODUCTS.filter((p) => p.category === cat).map((p, i) => (
                <div key={p.slug} className="animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
                  <ProductCard p={p} large />
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="mt-24 grid gap-10 rounded-3xl border border-white/[0.07] bg-ink-900/60 p-8 lg:grid-cols-[1fr_1.3fr] lg:p-12">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Not sure which one you need?</h2>
            <p className="mt-3 text-ink-300">Pick the sentence that sounds like you. Everything runs on the same platform, so you can combine products later.</p>
          </div>
          <div className="divide-y divide-white/[0.06]">
            {CHOOSER.map(([q, slug]) => {
              const p = getProduct(slug);
              if (!p) return null;
              return (
                <Link key={slug} href={`/products/${slug}`} className="group flex items-center gap-4 py-4">
                  <p.icon className={cn('h-4 w-4 shrink-0', p.accent.text)} />
                  <span className="flex-1 text-sm text-ink-200 transition group-hover:text-white">{q}</span>
                  <span className="hidden text-xs text-ink-500 sm:block">{p.name}</span>
                  <ArrowRight className="h-4 w-4 text-ink-500 transition group-hover:translate-x-0.5 group-hover:text-white" />
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
