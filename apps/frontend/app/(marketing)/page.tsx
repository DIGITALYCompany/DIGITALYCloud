import Link from 'next/link';
import { Activity, ArrowRight, HardDrive, LayoutDashboard, Lock, Rocket, ShieldCheck, Terminal, UploadCloud, Wrench } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import { DashboardPreview } from '@/components/marketing/dashboard-preview';
import { Faq } from '@/components/marketing/faq';
import { FeatureBento } from '@/components/marketing/feature-bento';
import { FeatureGrid } from '@/components/marketing/feature-grid';
import { PixelField } from '@/components/marketing/pixel-field';
import { ProductExplorer } from '@/components/marketing/product-explorer';
import { ProductIcon } from '@/components/marketing/product-icon';
import { SectionHeading } from '@/components/marketing/section-heading';
import { formatPrice } from '@/components/marketing/pricing';
import { PRODUCTS } from '@/data/products';

const STATS = [
  ['99.98%', 'Uptime in 2026'],
  ['< 45s', 'Average deploy'],
  ['24/7', 'Monitoring'],
  ['11', 'Regions worldwide'],
];

const STEPS = [
  { icon: Wrench, title: 'Create a service', body: 'Pick a Discord bot, game server, Node.js app, API or worker.' },
  { icon: UploadCloud, title: 'Deploy your code', body: 'Connect GitHub, upload a zip or use a Docker image. We build and start it.' },
  { icon: LayoutDashboard, title: 'Run and scale', body: 'Live logs, metrics, restarts and upgrades from one dashboard.' },
];

const TRUST = [
  { icon: ShieldCheck, title: 'DDoS protection', body: 'Always-on network filtering on every service and game server.' },
  { icon: Lock, title: 'GDPR by default', body: 'European regions keep your data in the EU. You always choose where a service runs.' },
  { icon: HardDrive, title: 'Encrypted backups', body: 'Daily encrypted snapshots you can restore in one click.' },
  { icon: Activity, title: '24/7 monitoring', body: 'Infrastructure watched around the clock, with a public status page.' },
];

const FAQ: [string, string][] = [
  ['Is there really a free plan?', 'Yes. Most products include a free plan, without a credit card.'],
  [
    'Where are my services hosted?',
    'You choose. Free plans run in France (Lyon or Paris). Starter adds Frankfurt, Amsterdam, London and Madrid, Pro adds Montréal and Virginia, and Business unlocks Singapore, Tokyo and Sydney.',
  ],
  ['Can I host game servers?', 'Yes. Minecraft, FiveM, Rust, Palworld and more, with dedicated game plans from €3.99/month.'],
  ['Can I upgrade or cancel at any time?', 'Yes. Upgrades are instant and prorated, and you can cancel from Billing at any moment.'],
];

const STACK = ['discord.js', 'Node.js', 'Minecraft', 'Express', 'Docker', 'GitHub', 'FiveM', 'Bun'];

export default function LandingPage() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="grid-bg pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)]" />
        <div className="pointer-events-none absolute left-1/2 top-[-220px] h-[520px] w-[960px] -translate-x-1/2 rounded-full bg-brand-500/20 blur-[120px]" />
        <div className="pointer-events-none absolute right-[-120px] top-[180px] h-[320px] w-[320px] rounded-full bg-azure-500/10 blur-[100px]" />
        <PixelField />
        <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-32 text-center sm:px-6 sm:pt-40 lg:px-8">
          <Link
            href="/products/game-servers"
            className="group mx-auto inline-flex animate-fade-up items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] py-1 pl-1 pr-3 text-xs text-ink-200 backdrop-blur transition hover:border-white/20"
          >
            <span className="rounded-full bg-brand-gradient px-2 py-0.5 font-medium text-white">New</span>
            Game servers are now available in Lyon
            <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
          </Link>
          <h1 className="mx-auto mt-8 max-w-4xl animate-fade-up text-5xl font-semibold leading-[1.05] tracking-[-0.045em] text-white [animation-delay:60ms] sm:text-7xl sm:leading-none">
            Deploy. Run. <span className="text-gradient">Scale.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl animate-fade-up text-lg text-ink-300 [animation-delay:120ms] sm:text-xl">
            The French cloud for Discord bots, game servers, Node.js apps and APIs. Push your code, we keep it online.
          </p>
          <div className="mt-10 flex animate-fade-up flex-col items-center justify-center gap-3 [animation-delay:180ms] sm:flex-row">
            <ButtonLink href="/signup" size="lg" icon={<Rocket className="h-4 w-4" />}>
              Start for free
            </ButtonLink>
            <ButtonLink href="/products" size="lg" variant="outline">
              Explore products
            </ButtonLink>
          </div>
          <p className="mt-4 animate-fade-up text-xs text-ink-400 [animation-delay:220ms]">Free plan · No credit card required · 11 regions worldwide</p>
          <div className="mt-16 animate-fade-up [animation-delay:280ms] sm:mt-20">
            <DashboardPreview />
          </div>
        </div>
      </section>

      <section className="border-y border-white/[0.06] bg-ink-900/40">
        <div className="mx-auto grid max-w-7xl grid-cols-2 px-4 sm:px-6 lg:grid-cols-4 lg:px-8">
          {STATS.map(([v, l]) => (
            <div key={l} className="px-4 py-10 text-center">
              <p className="font-mono text-3xl font-medium tracking-tight text-white sm:text-4xl">{v}</p>
              <p className="mt-1 text-sm text-ink-400">{l}</p>
            </div>
          ))}
        </div>
        <div className="relative overflow-hidden border-t border-white/[0.06] py-6 [mask-image:linear-gradient(90deg,transparent,black_15%,black_85%,transparent)]">
          <div className="flex w-max animate-marquee gap-14">
            {[...STACK, ...STACK].map((l, i) => (
              <span key={i} className="font-mono text-sm text-ink-400">
                {l}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section id="products" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-24 sm:px-6 lg:px-8">
        <SectionHeading eyebrow="Products" title="One platform, everything you host" description="Pick a product to see how it works. Every service gets logs, metrics and automatic restarts." />
        <div className="mt-12">
          <ProductExplorer />
        </div>
      </section>

      <section className="border-y border-white/[0.06] bg-ink-900/40">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="Platform" title="Everything you need to stay online" description="The tools of a big cloud, in a dashboard you'll understand in five minutes." />
          <div className="mt-14">
            <FeatureBento />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <div>
            <SectionHeading center={false} eyebrow="How it works" title="From code to online in three steps" />
            <ol className="mt-10 space-y-6">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-5">
                  <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-ink-900">
                    <s.icon className="h-5 w-5 text-white" />
                    <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-gradient text-[10px] font-semibold text-white">{i + 1}</span>
                  </span>
                  <div>
                    <h3 className="font-semibold text-white">{s.title}</h3>
                    <p className="mt-1 text-sm text-ink-300">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <Link href="/docs/getting-started" className="mt-10 inline-flex items-center gap-1 text-sm text-brand-300 transition hover:text-brand-200">
              Read the quickstart guide <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-ink-900 text-left shadow-2xl shadow-brand-500/10">
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5 text-xs text-ink-400">
              <Terminal className="h-3.5 w-3.5" /> deployment · syncbot
            </div>
            <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed text-ink-300">
              <span className="text-ink-500">$</span> git push origin main{'\n'}
              <span className="text-ink-500">[21:14:01]</span> Build started (#42){'\n'}
              <span className="text-ink-500">[21:14:02]</span> Installing dependencies... cached{'\n'}
              <span className="text-ink-500">[21:14:03]</span> Loading environment variables{'\n'}
              <span className="text-ink-500">[21:14:04]</span> Connecting to Discord...{'\n'}
              <span className="text-ink-500">[21:14:05]</span> <span className="text-success-400">Logged in successfully</span>
              {'\n'}
              <span className="text-ink-500">[21:14:05]</span> <span className="text-success-400">Deployment live in 4.2s</span>
            </pre>
          </div>
        </div>
      </section>

      <section className="border-y border-white/[0.06] bg-ink-900/40">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="Trust & security" title="Infrastructure you can rely on" description="Security and reliability are built into every plan, not sold as extras." />
          <FeatureGrid items={TRUST} className="sm:grid-cols-2 lg:grid-cols-4" iconClassName="h-6 w-6 text-brand-300" />
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-24 sm:px-6 lg:px-8">
        <SectionHeading eyebrow="Pricing" title="A plan for every product" description="Each product has its own plans, sized for what it actually needs. VAT included, no surprise bandwidth bills." />
        <div className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PRODUCTS.map((p) => (
            <Link key={p.slug} href={`/pricing?product=${p.slug}`} className="group card card-hover flex items-center gap-4 p-5">
              <ProductIcon product={p} className="h-11 w-11 shrink-0 rounded-xl" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-white">{p.name}</span>
                <span className="block text-sm text-ink-400">
                  From <span className="font-mono text-white">{formatPrice(Math.min(...p.plans.map((x) => x.price)))}</span>/month
                </span>
              </span>
              <ArrowRight className="h-4 w-4 text-ink-500 transition group-hover:translate-x-0.5 group-hover:text-white" />
            </Link>
          ))}
        </div>
        <p className="mt-8 text-center">
          <ButtonLink href="/pricing" variant="outline">
            See all plans
          </ButtonLink>
        </p>
      </section>

      <section className="border-t border-white/[0.06] bg-ink-900/40">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[1fr_1.4fr] lg:px-8">
          <div>
            <SectionHeading center={false} eyebrow="FAQ" title="Questions, answered" description="Can't find what you're looking for?" />
            <ButtonLink href="/contact" variant="outline" className="mt-6">
              Contact our team
            </ButtonLink>
          </div>
          <Faq items={FAQ} />
        </div>
      </section>

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 bottom-[-300px] mx-auto h-[500px] w-[800px] rounded-full bg-azure-500/20 blur-[120px]" />
        <div className="relative mx-auto max-w-4xl px-4 py-28 text-center sm:px-6">
          <h2 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">Your infrastructure starts here.</h2>
          <p className="mx-auto mt-5 max-w-lg text-lg text-ink-300">Deploy your first service in minutes. It&apos;s free.</p>
          <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink href="/signup" size="lg" icon={<ArrowRight className="h-4 w-4" />}>
              Create your account
            </ButtonLink>
            <ButtonLink href="/contact" size="lg" variant="outline">
              Talk to sales
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
