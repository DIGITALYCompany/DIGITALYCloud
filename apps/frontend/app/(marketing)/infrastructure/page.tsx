import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  Boxes,
  Cpu,
  DatabaseBackup,
  FileLock2,
  Fingerprint,
  HardDrive,
  Leaf,
  Lock,
  MapPin,
  Network,
  RefreshCw,
  Scale,
  ShieldCheck,
  ShieldHalf,
  type LucideIcon,
} from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import { CtaSection } from '@/components/marketing/cta-section';
import { HeroGlow } from '@/components/marketing/hero-glow';
import { RegionAvailability } from '@/components/marketing/region-availability';
import { Eyebrow, SectionHeading } from '@/components/marketing/section-heading';
import { RegionMap } from '@/components/infrastructure/region-map';
import { REGION_AREAS, REGIONS, TIER_COVERAGE } from '@/data/regions';
import { PLAN_LEVELS, getServicePlans } from '@/lib/catalog';

export const metadata: Metadata = {
  title: 'Infrastructure',
  description: `DIGITALYCloud runs in ${REGIONS.length} regions across Europe, North America and Asia Pacific.`,
};

const STATS = [
  [String(REGIONS.length), 'Regions'],
  [String(REGION_AREAS.length), 'Continents'],
  ['99.99%', 'Uptime target'],
  ['24/7', 'Monitoring'],
];

const PLAN_NAMES = getServicePlans('discord').map((p) => p.name);

const HARDWARE = [
  { icon: Cpu, title: 'Modern compute', spec: 'Recent-generation AMD processors', body: 'High single-thread performance for game ticks and bots, plenty of cores for APIs and workers.' },
  { icon: HardDrive, title: 'NVMe storage', spec: 'Local NVMe SSD', body: 'Fast boot, fast installs and fast world loading, with encrypted daily snapshots.' },
  { icon: Network, title: 'Protected network', spec: 'High-bandwidth uplinks', body: 'Always-on DDoS filtering in front of every service.' },
  { icon: Boxes, title: 'Isolated containers', spec: 'One isolated sandbox per service', body: 'Each service gets its own guaranteed CPU and memory, so a noisy neighbour can’t slow you down.' },
];

const SECURITY = [
  { icon: ShieldHalf, title: 'DDoS mitigation', body: 'Volumetric and protocol attacks are filtered at the edge, tuned for game and web traffic.' },
  { icon: Lock, title: 'Encryption everywhere', body: 'HTTPS on every public URL, encrypted disks and encrypted environment variables.' },
  { icon: Fingerprint, title: 'Account protection', body: 'Two-factor authentication, per-member roles and revocable API keys.' },
  { icon: FileLock2, title: 'Restricted access', body: 'Only a small on-call team can reach production servers, and every access is logged.' },
];

const RELIABILITY = [
  { icon: Activity, title: 'Monitored around the clock', body: 'Every server and service is checked continuously, and our on-call team is alerted immediately.' },
  { icon: RefreshCw, title: 'Automatic recovery', body: 'Crashed services restart on their own. If a server fails, services move to healthy capacity.' },
  { icon: DatabaseBackup, title: 'Daily backups', body: 'Encrypted snapshots kept for 7 days, stored separately from the servers they protect.' },
  { icon: MapPin, title: 'Maintenance without downtime', body: 'Services are live-migrated before planned work, and maintenance is announced 48h in advance.' },
];

function PointList({ items, iconClassName }: { items: { icon: LucideIcon; title: string; body: string }[]; iconClassName: string }) {
  return (
    <div className="mt-10 space-y-3">
      {items.map((s) => (
        <div key={s.title} className="flex gap-4 rounded-2xl border border-white/[0.06] p-5 transition hover:border-white/[0.12] hover:bg-white/[0.02]">
          <s.icon className={`mt-0.5 h-5 w-5 shrink-0 ${iconClassName}`} />
          <div>
            <p className="font-medium text-white">{s.title}</p>
            <p className="mt-1 text-sm leading-6 text-ink-300">{s.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="relative mt-5 space-y-2 text-sm text-ink-200">
      {items.map((t) => (
        <li key={t} className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-success-400" /> {t}
        </li>
      ))}
    </ul>
  );
}

export default function InfrastructurePage() {
  return (
    <>
      <section className="relative overflow-hidden">
        <HeroGlow className="h-[420px] w-[820px]" />
        <div className="relative mx-auto max-w-7xl px-4 pb-20 pt-36 sm:px-6 lg:px-8">
          <div className="max-w-3xl animate-fade-up">
            <Eyebrow>Infrastructure</Eyebrow>
            <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-[-0.035em] text-white sm:text-6xl sm:leading-none">
              Born in France, <span className="text-gradient">close to your users.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-300">
              DIGITALYCloud runs in {REGIONS.length} regions across Europe, North America and Asia Pacific. Start in France for free and expand as your plan grows. Here is exactly
              what powers your bots, apps and game servers.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href="/signup" size="lg">
                Start hosting
              </ButtonLink>
              <ButtonLink href="/status" size="lg" variant="outline">
                <span className="h-1.5 w-1.5 rounded-full bg-success-400" /> Live status
              </ButtonLink>
            </div>
          </div>
          <div className="mt-14 animate-fade-up" style={{ animationDelay: '120ms' }}>
            <RegionMap />
          </div>
        </div>
      </section>

      <section className="border-y border-white/[0.06] bg-ink-900/40">
        <dl className="mx-auto grid max-w-7xl grid-cols-2 px-4 sm:px-6 md:grid-cols-4 lg:px-8">
          {STATS.map(([v, k]) => (
            <div key={k} className="px-4 py-8 text-center">
              <dd className="font-mono text-2xl font-medium text-white sm:text-3xl">{v}</dd>
              <dt className="mt-1 text-xs uppercase tracking-[0.14em] text-ink-500">{k}</dt>
            </div>
          ))}
        </dl>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <SectionHeading eyebrow="Regions" title="Choose where your code runs" description="Pick a region when you create a service. Every plan includes France, and higher plans unlock more of the world." />
        <div className="mt-14 space-y-12">
          {REGION_AREAS.map((area) => (
            <div key={area}>
              <p className="mb-4 text-xs font-medium uppercase tracking-[0.16em] text-ink-400">{area}</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {REGIONS.filter((r) => r.area === area).map((r) => {
                  const planName = PLAN_NAMES[PLAN_LEVELS.indexOf(r.minPlan)];
                  return (
                    <div key={r.id} className="card card-hover relative overflow-hidden p-6">
                      <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-aqua-500/10 blur-3xl" />
                      <div className="relative flex items-start justify-between gap-4">
                        <div>
                          <p className="flex items-center gap-2 text-lg font-semibold text-white">
                            <span className="h-2 w-2 rounded-full bg-success-400" /> {r.city}
                          </p>
                          <p className="mt-0.5 text-sm text-ink-400">{r.country}</p>
                        </div>
                        <span className="rounded-lg bg-white/[0.04] px-2 py-1 font-mono text-xs text-ink-300 ring-1 ring-white/[0.08]">{r.code}</span>
                      </div>
                      <p className="relative mt-4 text-sm leading-6 text-ink-300">{r.desc}</p>
                      <div className="relative mt-4 flex flex-wrap gap-1.5">
                        <span className="rounded-md bg-brand-500/10 px-2 py-1 text-[11px] text-brand-200 ring-1 ring-brand-500/20">{r.minPlan === 'free' ? 'All plans' : `From ${planName}`}</span>
                        <span className="rounded-md bg-white/[0.04] px-2 py-1 text-[11px] text-ink-300 ring-1 ring-white/[0.06]">~{r.latencyMs} ms from Paris</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-16">
          <h3 className="text-lg font-semibold text-white">What each plan includes</h3>
          <p className="mt-1 text-sm text-ink-400">
            {PLAN_LEVELS.map((t, i) => `${PLAN_NAMES[i]}: ${TIER_COVERAGE[t]}`).join(' · ')}. Example shown for Discord bot plans; every product follows the same four tiers.
          </p>
          <div className="mt-6">
            <RegionAvailability planNames={PLAN_NAMES} />
          </div>
        </div>
      </section>

      <section className="border-y border-white/[0.06] bg-ink-900/40">
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <SectionHeading eyebrow="Hardware" title="What your code runs on" description="No oversold shared hosting. Every plan comes with guaranteed resources on modern hardware." />
          <div className="mt-14 grid gap-4 sm:grid-cols-2">
            {HARDWARE.map((h) => (
              <div key={h.title} className="card card-hover flex gap-5 p-7">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-brand-300">
                  <h.icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-semibold text-white">{h.title}</h3>
                  <p className="mt-1 font-mono text-xs text-aqua-400">{h.spec}</p>
                  <p className="mt-3 text-sm leading-6 text-ink-300">{h.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <SectionHeading center={false} eyebrow="Security" title="Protected by default" description="Security isn’t an add-on. Every layer below is included in every plan, including Free." />
            <PointList items={SECURITY} iconClassName="text-brand-300" />
          </div>
          <div>
            <SectionHeading center={false} eyebrow="Reliability" title="Designed to recover" description="Things break in every datacenter. What matters is how fast and how quietly they get fixed." />
            <PointList items={RELIABILITY} iconClassName="text-success-400" />
            <Link href="/status" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-300 hover:text-brand-200">
              See our uptime history <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="border-y border-white/[0.06] bg-ink-900/40">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 py-24 sm:px-6 md:grid-cols-2 lg:px-8">
          <div className="card relative overflow-hidden p-8">
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand-500/15 blur-3xl" />
            <Scale className="relative h-6 w-6 text-brand-300" />
            <h3 className="relative mt-5 text-xl font-semibold text-white">GDPR & data residency</h3>
            <p className="relative mt-3 text-sm leading-6 text-ink-300">
              Services in our European regions, along with their backups and logs, are stored in the EU and stay there. You decide if a service runs outside Europe, and its data stays in
              the region you picked. DIGITALY is a French company, subject to EU law.
            </p>
            <CheckList items={['Free plans hosted exclusively in France', 'Data stays in the region you choose', 'Data processing agreement on request']} />
          </div>
          <div className="card relative overflow-hidden p-8">
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-success-500/15 blur-3xl" />
            <Leaf className="relative h-6 w-6 text-success-400" />
            <h3 className="relative mt-5 text-xl font-semibold text-white">Efficient by design</h3>
            <p className="relative mt-3 text-sm leading-6 text-ink-300">
              Our home regions in France run on a low-carbon electricity grid. Packing services efficiently onto modern hardware means fewer machines doing the same work, in every region.
            </p>
            <CheckList items={['Low-carbon French energy mix', 'High server utilization', 'Hardware chosen for performance per watt']} />
          </div>
        </div>
      </section>

      <CtaSection
        title="Run your project close to your users"
        description="Start for free, or talk to our team about larger or regulated projects."
        headingClassName="leading-tight sm:leading-10"
      />
    </>
  );
}
