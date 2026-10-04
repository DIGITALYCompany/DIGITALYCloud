import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Eyebrow } from '@/components/marketing/section-heading';
import { LEGAL_DOCS } from '@/data/legal';
import { cn } from '@/lib/utils';

export function generateStaticParams() {
  return Object.keys(LEGAL_DOCS).map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: PageProps<'/legal/[doc]'>): Promise<Metadata> {
  const page = LEGAL_DOCS[(await params).doc];
  return page ? { title: page.title } : {};
}

export default async function LegalPage({ params }: PageProps<'/legal/[doc]'>) {
  const { doc } = await params;
  const page = LEGAL_DOCS[doc];
  if (!page) notFound();

  return (
    <div className="mx-auto grid max-w-6xl gap-12 px-4 pb-24 pt-36 sm:px-6 lg:grid-cols-[200px_1fr] lg:px-8">
      <nav className="flex gap-1 overflow-x-auto lg:flex-col">
        {Object.entries(LEGAL_DOCS).map(([slug, d]) => (
          <Link
            key={slug}
            href={`/legal/${slug}`}
            aria-current={slug === doc ? 'page' : undefined}
            className={cn('shrink-0 rounded-lg px-3 py-2 text-sm transition', slug === doc ? 'bg-white/[0.06] text-white' : 'text-ink-400 hover:text-white')}
          >
            {d.title}
          </Link>
        ))}
      </nav>
      <article className="max-w-3xl">
        <Eyebrow>Legal</Eyebrow>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.03em] text-white">{page.title}</h1>
        <p className="mt-3 text-sm text-ink-400">Last updated {page.updated}</p>
        <div className="mt-12 space-y-10">
          {page.sections.map(([h, body]) => (
            <section key={h}>
              <h2 className="text-lg font-semibold text-white">{h}</h2>
              <p className="mt-3 leading-relaxed text-ink-300">{body}</p>
            </section>
          ))}
        </div>
      </article>
    </div>
  );
}
