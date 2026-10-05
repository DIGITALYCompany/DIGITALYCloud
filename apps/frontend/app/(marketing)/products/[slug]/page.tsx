import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, BookOpen, ChevronRight, Code2, Rocket, Settings2 } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import { Faq } from '@/components/marketing/faq';
import { FeatureGrid } from '@/components/marketing/feature-grid';
import { PlanCards } from '@/components/marketing/plan-cards';
import { ProductCard, ProductVisual } from '@/components/marketing/product-card';
import { ProductIcon } from '@/components/marketing/product-icon';
import { SectionHeading } from '@/components/marketing/section-heading';
import { PRODUCTS, getProduct } from '@/data/products';

const STEPS = [
  { icon: Code2, title: 'Connect your code', body: 'Link a GitHub repository, upload a zip or pick a template.' },
  { icon: Settings2, title: 'Configure in seconds', body: 'Choose a region, a plan and add your environment variables.' },
  { icon: Rocket, title: 'Go live', body: 'We build, start and monitor it. You get logs and metrics instantly.' },
];

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<'/products/[slug]'>): Promise<Metadata> {
  const p = getProduct((await params).slug);
  return p ? { title: p.name, description: p.description } : {};
}

export default async function ProductPage({ params }: PageProps<'/products/[slug]'>) {
  const p = getProduct((await params).slug);
  if (!p) notFound();
  const others = PRODUCTS.filter((x) => x.slug !== p.slug).slice(0, 3);

  return (
    <>
      <section className="relative overflow-hidden border-b border-white/[0.06]">
        <div className="grid-bg pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top_left,black_20%,transparent_65%)]" />
        <div className="pointer-events-none absolute -left-40 -top-40 h-[480px] w-[640px] rounded-full opacity-20 blur-[120px]" style={{ background: p.accent.hex }} />
        <div className="relative mx-auto grid max-w-7xl items-center gap-16 px-4 pb-24 pt-28 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:px-8 lg:pt-36">
          <div className="animate-fade-up">
            <nav className="flex items-center gap-1.5 text-xs text-ink-400">
              <Link href="/products" className="transition hover:text-white">
                Products
              </Link>
              <ChevronRight className="h-3 w-3" />
              <span className="text-ink-200">{p.name}</span>
            </nav>
            <div className="mt-6 flex items-center gap-3">
              <ProductIcon product={p} className="h-10 w-10 rounded-xl" />
              <span className="text-sm font-medium text-ink-200">{p.name}</span>
              {p.badge && <span className="rounded-full bg-aqua-500/15 px-2 py-0.5 text-[11px] font-medium text-aqua-300">{p.badge}</span>}
            </div>
            <h1 className="mt-6 text-4xl font-semibold tracking-[-0.035em] text-white sm:text-6xl">
              {p.headline[0]}
              <br />
              <span className="text-gradient">{p.headline[1]}</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-ink-300">{p.description}</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              {p.deployable ? (
                <ButtonLink href="/signup" size="lg" icon={<Rocket className="h-4 w-4" />}>
                  Deploy now
                </ButtonLink>
              ) : (
                <ButtonLink href="/contact" size="lg" icon={<Rocket className="h-4 w-4" />}>
                  Coming soon · get notified
                </ButtonLink>
              )}
              <ButtonLink href={`/docs/${p.docs}`} size="lg" variant="outline" icon={<BookOpen className="h-4 w-4" />}>
                Read the docs
              </ButtonLink>
            </div>
            <div className="mt-10 flex flex-wrap gap-2">
              {p.stack.map((s) => (
                <span key={s} className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 font-mono text-xs text-ink-300 transition hover:border-white/20 hover:text-white">
                  {s}
                </span>
              ))}
            </div>
          </div>
          <div className="animate-fade-up pb-8 [animation-delay:120ms]">
            <ProductVisual p={p} />
          </div>
        </div>
      </section>

      <section className="border-b border-white/[0.06] bg-ink-900/40">
        <div className="mx-auto grid max-w-7xl divide-y divide-white/[0.06] px-4 sm:grid-cols-3 sm:divide-y-0 sm:px-6 lg:px-8 sm:[&>*+*]:border-l sm:[&>*+*]:border-white/[0.06]">
          {p.stats.map((s) => (
            <div key={s.label} className="px-6 py-10 text-center">
              <p className="font-mono text-3xl font-medium tracking-tight text-white">{s.value}</p>
              <p className="mt-1.5 text-sm text-ink-400">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <SectionHeading eyebrow="Features" title={`Everything ${p.name.toLowerCase()} needs`} description="Production features are included from day one, on every plan." />
        <FeatureGrid items={p.highlights} className="sm:grid-cols-2 lg:grid-cols-3" iconClassName={`h-5 w-5 ${p.accent.text}`} />
      </section>

      <section className="border-y border-white/[0.06] bg-ink-900/40">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="How it works" title="Online in three steps" />
          <div className="mt-14 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.title} className="card relative p-7">
                <span className="font-mono text-xs text-ink-500">0{i + 1}</span>
                <s.icon className="mt-4 h-6 w-6 text-white" />
                <h3 className="mt-4 font-semibold text-white">{s.title}</h3>
                <p className="mt-2 text-sm text-ink-300">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <SectionHeading eyebrow="Pricing" title={`${p.name} plans`} description="Fixed monthly prices, VAT included. Upgrade or downgrade any time." />
        <div className="mt-14">
          <PlanCards plans={p.plans} deployable={p.deployable} />
        </div>
        <p className="mt-8 text-center text-sm text-ink-400">
          Need more?{' '}
          <Link href="/contact" className="text-brand-300 hover:text-brand-200">
            Talk to our team
          </Link>{' '}
          about dedicated resources.
        </p>
      </section>

      <section className="border-t border-white/[0.06] bg-ink-900/40">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[1fr_1.4fr] lg:px-8">
          <SectionHeading center={false} eyebrow="FAQ" title="Questions, answered" description="Can't find what you need? Our team in Lyon is here to help." />
          <Faq items={p.faq} />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-2xl font-semibold text-white">Explore other products</h2>
          <Link href="/products" className="hidden items-center gap-1 text-sm text-ink-300 transition hover:text-white sm:flex">
            All products <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {others.map((o) => (
            <ProductCard key={o.slug} p={o} />
          ))}
        </div>
      </section>
    </>
  );
}
