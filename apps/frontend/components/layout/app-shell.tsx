'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu as MenuIcon, X } from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { AccountMenu } from './account-menu';
import { GlobalSearch } from './global-search';
import { NotificationsMenu } from './notifications-menu';
import { Sidebar } from './sidebar';
import { useAuth } from '@/providers/auth-provider';
import { STATUS_COPY, useSystemStatus } from '@/hooks/use-system-status';
import { EmailVerificationBanner } from './email-verification-banner';
import { BOTTOM_NAV } from '@/config/navigation';
import { cn } from '@/lib/utils';

/** Dashboard chrome: sidebar (drawer on mobile), top bar, bottom tab bar on mobile. */
export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const status = useSystemStatus();
  const statusCopy = STATUS_COPY[status?.current ?? 'unknown'];
  // The drawer belongs to the page it was opened on, so it closes on navigation.
  const [drawerOn, setDrawerOn] = useState<string | null>(null);
  const drawer = drawerOn === pathname;
  const closeDrawer = () => setDrawerOn(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  if (!user) return null;

  // Re-run the entrance animation when switching sections, but not between tabs of one service.
  const sectionKey = pathname.split('/').slice(0, 3).join('/');

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-white/[0.06] bg-ink-950 lg:block">
        <Sidebar />
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-black/70 backdrop-blur-sm" onClick={closeDrawer} />
          <aside className="absolute inset-y-0 left-0 w-72 animate-slide-in-right border-r border-white/[0.06] bg-ink-950">
            <button onClick={closeDrawer} className="absolute right-3 top-4 rounded-lg p-2 text-ink-400 hover:text-white" aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            <Sidebar onNavigate={closeDrawer} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-white/[0.06] bg-ink-950/80 px-4 backdrop-blur-xl sm:px-6">
          <button onClick={() => setDrawerOn(pathname)} className="rounded-lg p-2 text-ink-300 lg:hidden" aria-label="Open menu">
            <MenuIcon className="h-5 w-5" />
          </button>
          <div className="lg:hidden">
            <Logo href="/dashboard" compact />
          </div>
          <div className="hidden flex-1 sm:block">
            <GlobalSearch />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <a
              href="/status"
              target="_blank"
              rel="noopener noreferrer"
              className="mr-2 hidden items-center gap-2 rounded-full border border-white/[0.07] px-3 py-1 text-xs text-ink-300 transition hover:border-white/20 hover:text-white md:flex"
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  statusCopy.tone === 'success' ? 'bg-success-400' : statusCopy.tone === 'danger' ? 'bg-danger-500' : statusCopy.tone === 'warning' ? 'bg-warning-500' : 'bg-ink-400'
                )}
              />{' '}
              {statusCopy.label}
            </a>
            <NotificationsMenu />
            <AccountMenu variant="app" />
          </div>
        </header>

        <main key={sectionKey} className="mx-auto max-w-[1400px] animate-fade-up px-4 pb-28 pt-6 sm:px-6 sm:pt-8 lg:px-10 lg:pb-16">
          <EmailVerificationBanner />
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.07] bg-ink-950/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <div className="grid grid-cols-5">
          {BOTTOM_NAV.map((n) => {
            const active = n.href === '/services' ? pathname.startsWith('/services') && pathname !== '/services/new' : pathname === n.href;
            return (
              <Link key={n.href} href={n.href} className={cn('flex flex-col items-center gap-1 py-2.5 text-[10px]', active ? 'text-white' : 'text-ink-400')}>
                {n.primary ? (
                  <span className="-mt-1 flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-lg shadow-brand-500/30">
                    <n.icon className="h-5 w-5" />
                  </span>
                ) : (
                  <n.icon className={cn('h-5 w-5', active && 'text-brand-300')} />
                )}
                {!n.primary && n.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
