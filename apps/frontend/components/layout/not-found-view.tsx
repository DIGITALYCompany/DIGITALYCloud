import { ArrowLeft, Compass } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import { Logo } from '@/components/ui/logo';

export function NotFoundView() {
  return (
    <div className="grid-bg relative flex min-h-screen flex-col items-center justify-center bg-ink-950 px-6 text-center">
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-brand-500/20 blur-3xl" />
      <div className="relative animate-fade-up">
        <div className="mb-10 flex justify-center">
          <Logo />
        </div>
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
          <Compass className="h-6 w-6 text-brand-300" />
        </div>
        <p className="font-mono text-sm text-ink-500">404</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">This page isn&apos;t deployed</h1>
        <p className="mx-auto mt-3 max-w-md text-ink-300">The address may be mistyped, or the page has moved.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/" icon={<ArrowLeft className="h-4 w-4" />}>
            Back home
          </ButtonLink>
          <ButtonLink href="/dashboard" variant="outline">
            Open dashboard
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
