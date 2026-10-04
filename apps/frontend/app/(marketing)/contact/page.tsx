import type { Metadata } from 'next';
import { LifeBuoy, Mail, MapPin, MessageCircle } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import { ContactForm } from '@/components/marketing/contact-form';
import { HeroGlow } from '@/components/marketing/hero-glow';
import { Eyebrow } from '@/components/marketing/section-heading';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Questions about a project, dedicated resources or a partnership? Our team in Lyon reads every message.',
};

const CHANNELS = [
  { icon: Mail, title: 'Email', body: 'hello@digitaly.fr' },
  { icon: LifeBuoy, title: 'Customer support', body: 'Signed in? Open a ticket from your dashboard for the fastest answer.' },
  { icon: MapPin, title: 'Office', body: 'DIGITALY SAS, 254 Rue Vendôme, 69003 Lyon, France' },
];

export default function ContactPage() {
  return (
    <div className="relative">
      <HeroGlow />
      <div className="relative mx-auto grid max-w-7xl gap-12 px-4 pb-24 pt-36 sm:px-6 lg:grid-cols-[1fr_1.2fr] lg:px-8">
        <div>
          <Eyebrow>Contact</Eyebrow>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.03em] text-white sm:text-5xl">Let&apos;s talk.</h1>
          <p className="mt-4 max-w-md text-lg text-ink-300">Questions about a project, dedicated resources or a partnership? Our team in Lyon reads every message.</p>
          <div className="mt-10 space-y-3">
            {CHANNELS.map((c) => (
              <div key={c.title} className="card flex gap-4 p-5">
                <c.icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-300" />
                <div>
                  <p className="text-sm font-medium text-white">{c.title}</p>
                  <p className="mt-0.5 text-sm text-ink-300">{c.body}</p>
                </div>
              </div>
            ))}
            <div id="community" className="card flex scroll-mt-24 gap-4 border-brand-500/25 bg-brand-500/[0.05] p-5">
              <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-brand-300" />
              <div>
                <p className="text-sm font-medium text-white">Community</p>
                <p className="mt-0.5 text-sm text-ink-300">Join the DIGITALY community to share projects, follow updates and get help.</p>
                <ButtonLink href="/docs/getting-started" variant="outline" size="sm" className="mt-3">
                  Getting started guide
                </ButtonLink>
              </div>
            </div>
          </div>
        </div>

        <ContactForm />
      </div>
    </div>
  );
}
