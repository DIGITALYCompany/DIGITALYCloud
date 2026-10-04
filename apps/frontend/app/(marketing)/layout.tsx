import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteMain } from '@/components/layout/site-main';

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <SiteMain>{children}</SiteMain>
      <SiteFooter />
    </div>
  );
}
