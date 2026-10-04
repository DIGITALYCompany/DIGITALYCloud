'use client';

import type { ReactNode } from 'react';
import type { AppHref } from '@/lib/routes';
import { cn } from '@/lib/utils';
import { NavLink } from './nav-link';

/** Underlined tab bar whose items are routes. */
export function LinkTabs({ tabs }: { tabs: { href: AppHref; label: string; end?: boolean; icon?: ReactNode }[] }) {
  return (
    <div className="-mx-4 overflow-x-auto border-b border-white/[0.07] px-4 sm:mx-0 sm:px-0">
      <nav className="flex gap-1">
        {tabs.map((t) => (
          <NavLink
            key={t.href}
            href={t.href}
            end={t.end}
            className={({ isActive }) =>
              cn(
                'relative flex items-center gap-2 whitespace-nowrap px-3 py-3 text-sm font-medium transition',
                isActive ? 'text-white after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-brand-gradient' : 'text-ink-400 hover:text-ink-100'
              )
            }
          >
            {t.icon}
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
