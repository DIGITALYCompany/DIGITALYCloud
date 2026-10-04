import type { Metadata } from 'next';
import { NotFoundView } from '@/components/layout/not-found-view';

export const metadata: Metadata = { title: 'Page not found' };

// Unmatched URLs: rendered without the site header and footer, like the original catch-all route.
export default function NotFound() {
  return <NotFoundView />;
}
