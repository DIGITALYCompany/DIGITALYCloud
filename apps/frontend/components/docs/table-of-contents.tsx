'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import type { DocHeading } from '@/data/docs/headings';

/** "On this page" navigation that highlights the heading currently in view. */
export function TableOfContents({ headings }: { headings: DocHeading[] }) {
  const [active, setActive] = useState(headings[0]?.id ?? '');

  useEffect(() => {
    const nodes = headings.map((h) => document.getElementById(h.id)).filter((n): n is HTMLElement => n !== null);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-96px 0px -65% 0px' }
    );
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [headings]);

  if (headings.length < 2) return null;

  return (
    <nav aria-label="On this page">
      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-ink-500">On this page</p>
      <ul className="space-y-1 border-l border-white/[0.06]">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                setActive(h.id);
              }}
              className={cn(
                '-ml-px block border-l py-1 pl-4 text-[13px] leading-5 transition',
                active === h.id ? 'border-brand-400 text-white' : 'border-transparent text-ink-400 hover:border-white/20 hover:text-ink-200'
              )}
            >
              {h.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
