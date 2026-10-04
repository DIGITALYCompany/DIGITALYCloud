import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { Globe2, LifeBuoy, RefreshCw, ScrollText, ShieldCheck, Wallet } from 'lucide-react';
import { Faq } from '@/components/marketing/faq';
import { HeroGlow } from '@/components/marketing/hero-glow';
import { PricingExplorer } from '@/components/marketing/pricing-explorer';
import { SectionHeading } from '@/components/marketing/section-heading';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Plans built for each product. Monthly prices, VAT included, no hidden fees.',
};

const INCLUDED = [
  { icon: ShieldCheck, label: 'DDoS protection' },
  { icon: ScrollText, label: 'Live logs & metrics' },
  { icon: RefreshCw, label: 'Automatic restarts' },
  { icon: Globe2, label: 'Your choice of region' },
  { icon: Wallet, label: 'No bandwidth bills' },
  { icon: LifeBuoy, label: 'Support from Lyon' },
];

const FAQ: [string, string][] = [
  ['Why does each product have its own plans?', 'A game server, a Discord bot and a website need very different resources. Dedicated plans mean you only pay for what your project actually uses.'],
  ['Can I combine several products?', 'Yes. Each service is billed on its own plan, and everything is grouped on a single monthly invoice.'],
  ['Can I change plans later?', 'Anytime, from your dashboard. Upgrades apply immediately and are prorated. Downgrades apply at the next billing date.'],
  [
    'Can I choose where my service runs?',
    'Yes. You pick a region when you create a service. Free plans run in France, Starter adds all of Europe, Pro adds North America and Business unlocks every region, including Asia Pacific.',
  ],
  ['What happens to my region if I downgrade?', 'A plan that doesn’t include your service’s current region can’t be selected for it, so your service never moves without you deciding.'],
  ['Are prices VAT included?', 'Yes. All prices are shown in euros, VAT included, billed monthly.'],
  ['Do you charge for bandwidth?', 'No. Fair-use bandwidth is included in every plan, so your bill never surprises you.'],
];

export default async function PricingPage() {
  // Rendered per request so the product selected in `?product=` is in the initial HTML.
  await connection();

  return (
    <div className="relative">
      <HeroGlow />
      <div className="relative mx-auto max-w-7xl px-4 pb-24 pt-36 sm:px-6 lg:px-8">
        <SectionHeading eyebrow="Pricing" title="Plans built for each product" description="Choose what you want to host to see its plans. Monthly prices, VAT included, no hidden fees." />

        <PricingExplorer />

        <div className="mt-20 rounded-3xl border border-white/[0.07] bg-ink-900/50 p-8">
          <p className="text-center text-sm font-medium text-white">Included with every plan</p>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {INCLUDED.map((i) => (
              <div key={i.label} className="flex flex-col items-center gap-2 text-center text-sm text-ink-300">
                <i.icon className="h-5 w-5 text-brand-300" />
                {i.label}
              </div>
            ))}
          </div>
        </div>

        <p className="mt-8 text-center text-sm text-ink-400">
          Need dedicated resources or custom billing?{' '}
          <Link href="/contact" className="text-brand-300 hover:text-brand-200">
            Talk to our team
          </Link>
        </p>

        <div className="mx-auto mt-24 max-w-3xl">
          <h2 className="text-center text-2xl font-semibold text-white">Frequently asked questions</h2>
          <div className="mt-8">
            <Faq items={FAQ} />
          </div>
        </div>
      </div>
    </div>
  );
}
