import type { Metadata } from 'next';
import { Cpu, HardDrive, Leaf, MapPin, Network, ShieldCheck, Users, Zap } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import { CtaSection } from '@/components/marketing/cta-section';
import { HeroGlow } from '@/components/marketing/hero-glow';
import { Eyebrow, SectionHeading } from '@/components/marketing/section-heading';

export const metadata: Metadata = {
  title: 'About',
  description: 'DIGITALY is a French software company founded in Lyon in 2024. DIGITALYCloud is our hosting platform.',
};

const VALUES = [
  { icon: Zap, title: 'Simple first', body: 'Hosting should take minutes, not a certification. Every feature we ship has to stay easy to use.' },
  { icon: ShieldCheck, title: 'You choose where data lives', body: 'Every plan includes French regions, and you decide if a service runs elsewhere. No hidden transfers.' },
  { icon: Users, title: 'Built with our community', body: 'Our roadmap is shaped by the developers and communities who host with us.' },
  { icon: Leaf, title: 'Efficient by design', body: 'Well-utilized infrastructure running on low-carbon French energy.' },
];

const INFRA = [
  { icon: Cpu, title: 'Modern compute', body: 'Recent-generation AMD processors tuned for always-on workloads.' },
  { icon: HardDrive, title: 'NVMe storage', body: 'Fast local storage with encrypted daily snapshots.' },
  { icon: Network, title: 'Protected network', body: 'High-bandwidth uplinks with always-on DDoS filtering.' },
  { icon: MapPin, title: '11 regions, 3 continents', body: 'Deploy close to your users, from Lyon to Tokyo.' },
];

const FACTS = [
  ['Company', 'DIGITALY SAS'],
  ['Founded', 'October 2024'],
  ['Headquarters', '254 Rue Vendôme, 69003 Lyon'],
  ['Activity', 'Software development'],
  ['SIREN', '933 877 508'],
];

export default function AboutPage() {
  return (
    <>
      <section className="relative overflow-hidden">
        <HeroGlow className="h-[420px] w-[820px]" />
        <div className="relative mx-auto max-w-4xl px-4 pb-20 pt-40 text-center sm:px-6">
          <Eyebrow>About DIGITALY</Eyebrow>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.035em] text-white sm:text-6xl">
            An independent cloud, <span className="text-gradient">born in Lyon.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-ink-300">
            DIGITALY is a French software company founded in Lyon in 2024. DIGITALYCloud is our hosting platform: reliable infrastructure from France to the rest of the world, with a
            dashboard anyone can use.
          </p>
        </div>
      </section>

      <section className="border-y border-white/[0.06] bg-ink-900/40">
        <dl className="mx-auto grid max-w-7xl grid-cols-2 gap-px px-4 sm:px-6 md:grid-cols-5 lg:px-8">
          {FACTS.map(([k, v]) => (
            <div key={k} className="px-4 py-8 text-center">
              <dt className="text-xs uppercase tracking-[0.14em] text-ink-500">{k}</dt>
              <dd className="mt-2 text-sm font-medium text-white">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <SectionHeading eyebrow="What we believe" title="Values that shape the product" />
        <div className="mt-14 grid gap-4 sm:grid-cols-2">
          {VALUES.map((v) => (
            <div key={v.title} className="card card-hover flex gap-5 p-7">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-brand-300">
                <v.icon className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-semibold text-white">{v.title}</h3>
                <p className="mt-2 text-sm text-ink-300">{v.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-white/[0.06] bg-ink-900/40">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="Infrastructure"
            title="Built for always-on workloads"
            description="DIGITALYCloud runs in 11 regions across Europe, North America and Asia Pacific, monitored around the clock."
          />
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {INFRA.map((i) => (
              <div key={i.title} className="card card-hover p-6">
                <i.icon className="h-5 w-5 text-brand-300" />
                <h3 className="mt-4 font-semibold text-white">{i.title}</h3>
                <p className="mt-2 text-sm text-ink-300">{i.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <ButtonLink href="/infrastructure" variant="outline">
              Explore our infrastructure
            </ButtonLink>
          </div>
        </div>
      </section>

      <CtaSection title="Host your next project with us" description="Start for free, or talk to our team about larger projects." />
    </>
  );
}
