import type { Metadata } from 'next';
import { Badge } from '@/components/ui/badge';
import { Eyebrow } from '@/components/marketing/section-heading';
import { RELEASES } from '@/data/changelog';

export const metadata: Metadata = {
  title: 'Changelog',
  description: 'New features, improvements and fixes shipped to DIGITALYCloud.',
};

const TONE = { New: 'brand', Improved: 'success', Fixed: 'accent' } as const;

export default function ChangelogPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-36 sm:px-6">
      <Eyebrow>Changelog</Eyebrow>
      <h1 className="mt-4 text-4xl font-semibold tracking-[-0.03em] text-white sm:text-5xl">What&apos;s new</h1>
      <p className="mt-4 text-lg text-ink-300">New features, improvements and fixes shipped to DIGITALYCloud.</p>
      <div className="mt-16 space-y-14">
        {RELEASES.map((r) => (
          <article key={r.version} className="grid gap-4 sm:grid-cols-[160px_1fr]">
            <div>
              <p className="text-sm text-ink-400">{r.date}</p>
              <p className="mt-1 font-mono text-xs text-ink-500">v{r.version}</p>
            </div>
            <div className="card p-6">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-white">{r.title}</h2>
                <Badge tone={TONE[r.tag]}>{r.tag}</Badge>
              </div>
              <ul className="mt-4 space-y-2">
                {r.items.map((i) => (
                  <li key={i} className="flex gap-3 text-sm text-ink-300">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-400" />
                    {i}
                  </li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
