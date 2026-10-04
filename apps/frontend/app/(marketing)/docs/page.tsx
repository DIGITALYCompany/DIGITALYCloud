import type { Metadata } from 'next';
import { DocsHome } from '@/components/docs/docs-home';
import { DOC_INDEX } from '@/data/docs';

export const metadata: Metadata = {
  title: 'Documentation',
  description: 'Guides, best practices and reference for running your projects on DIGITALYCloud.',
};

export default function DocsPage() {
  return <DocsHome docs={DOC_INDEX} />;
}
