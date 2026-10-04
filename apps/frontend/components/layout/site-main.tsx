'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

/** Public page container: fades in on every route change and resets scroll (or scrolls to the URL hash). */
export function SiteMain({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    const { hash } = window.location;
    if (hash) {
      const t = setTimeout(() => document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth' }), 60);
      return () => clearTimeout(t);
    }
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <main key={pathname} className="animate-fade-in">
      {children}
    </main>
  );
}
