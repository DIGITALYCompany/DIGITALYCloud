import { BEST_PRACTICE_DOCS } from './best-practices';
import type { DocMeta } from './catalog';
import { GUIDE_DOCS } from './guides';
import { PLATFORM_DOCS } from './platform';
import type { DocArticle } from './types';

export type { DocArticle, DocMeta };

export const DOCS: DocArticle[] = [...GUIDE_DOCS, ...BEST_PRACTICE_DOCS, ...PLATFORM_DOCS];

export const DOC_INDEX: DocMeta[] = DOCS.map(({ slug, title, section, summary, minutes, featured }) => ({ slug, title, section, summary, minutes, featured }));

export { SECTION_META } from './sections';
