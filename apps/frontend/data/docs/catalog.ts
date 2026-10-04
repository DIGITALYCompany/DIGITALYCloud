import type { DocArticle } from './types';

export { SECTION_META } from './sections';

/** Article metadata without the body, safe to pass to Client Components. */
export type DocMeta = Omit<DocArticle, 'body'>;

export function matchesQuery(doc: DocMeta, query: string) {
  return `${doc.title} ${doc.summary} ${doc.section}`.toLowerCase().includes(query.trim().toLowerCase());
}

export function groupBySection<T extends { section: string }>(docs: T[]) {
  return docs.reduce<Record<string, T[]>>((acc, d) => {
    (acc[d.section] ??= []).push(d);
    return acc;
  }, {});
}
