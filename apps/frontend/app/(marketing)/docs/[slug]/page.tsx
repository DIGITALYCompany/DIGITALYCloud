import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, ChevronRight, Clock } from 'lucide-react';
import { ArticleFeedback } from '@/components/docs/article-feedback';
import { DocsHome } from '@/components/docs/docs-home';
import { DocsSelect, DocsSidebar } from '@/components/docs/docs-sidebar';
import { TableOfContents } from '@/components/docs/table-of-contents';
import { DOCS, DOC_INDEX, SECTION_META } from '@/data/docs';
import { collectHeadings } from '@/data/docs/headings';
import { cn } from '@/lib/utils';

export function generateStaticParams() {
  return DOCS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: PageProps<'/docs/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const article = DOCS.find((d) => d.slug === slug);
  return article ? { title: article.title, description: article.summary } : { title: 'Documentation' };
}

export default async function DocArticlePage({ params }: PageProps<'/docs/[slug]'>) {
  const { slug } = await params;
  const idx = DOCS.findIndex((d) => d.slug === slug);
  // Unknown articles fall back to the docs home, like the original app.
  if (idx === -1) return <DocsHome docs={DOC_INDEX} />;

  const article = DOCS[idx];
  const prev = DOCS[idx - 1];
  const next = DOCS[idx + 1];
  const meta = SECTION_META[article.section];

  return (
    <div className="mx-auto flex max-w-7xl gap-10 px-4 pb-24 pt-[104px] sm:px-6 lg:px-8">
      <DocsSidebar docs={DOC_INDEX} currentSlug={article.slug} />

      <article className="min-w-0 max-w-3xl flex-1 animate-fade-up">
        <DocsSelect docs={DOC_INDEX} currentSlug={article.slug} />
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-400">
          <Link href="/docs" className="transition hover:text-white">
            Docs
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-ink-600" />
          <span>{article.section}</span>
        </div>
        <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl sm:leading-10">{article.title}</h1>
        <p className="mt-3 text-lg leading-relaxed text-ink-300">{article.summary}</p>
        <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
          {meta && (
            <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ring-1', meta.tone)}>
              <meta.icon className="h-3 w-3" /> {article.section}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-2.5 py-1 text-ink-300 ring-1 ring-white/[0.08]">
            <Clock className="h-3 w-3" /> {article.minutes} min read
          </span>
        </div>
        <div className="mt-8 border-t border-white/[0.06] pt-2">{article.body}</div>

        <div className="mt-14 rounded-2xl border border-white/[0.07] bg-ink-900/60 p-5">
          <ArticleFeedback slug={slug} />
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {prev ? (
            <Link href={`/docs/${prev.slug}`} className="card card-hover group p-4">
              <span className="flex items-center gap-1 text-xs text-ink-400">
                <ArrowLeft className="h-3 w-3 transition group-hover:-translate-x-0.5" /> Previous
              </span>
              <span className="mt-1 block font-medium text-white">{prev.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link href={`/docs/${next.slug}`} className="card card-hover group p-4 text-right">
              <span className="flex items-center justify-end gap-1 text-xs text-ink-400">
                Next <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
              </span>
              <span className="mt-1 block font-medium text-white">{next.title}</span>
            </Link>
          )}
        </div>
      </article>

      <aside className="sticky top-28 hidden h-fit w-52 shrink-0 xl:block">
        <TableOfContents headings={collectHeadings(article.body)} />
      </aside>
    </div>
  );
}
