'use client';

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, Menu as MenuIcon, X } from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { ButtonLink } from '@/components/ui/button';
import { NavLink } from '@/components/ui/nav-link';
import { AccountMenu, MobileAccountPanel } from './account-menu';
import { PRODUCT_CATEGORIES, ProductLink, ProductsMenu } from './products-menu';
import { useAuth } from '@/providers/auth-provider';
import { PRODUCTS } from '@/data/products';
import { PUBLIC_NAV } from '@/config/navigation';
import { cn } from '@/lib/utils';

function subscribeToScroll(onChange: () => void) {
  window.addEventListener('scroll', onChange, { passive: true });
  return () => window.removeEventListener('scroll', onChange);
}

const isScrolled = () => window.scrollY > 8;

function scrollProgress() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return max > 0 ? Math.min(1, window.scrollY / max) : 0;
}

export function SiteHeader() {
  const scrolled = useSyncExternalStore(subscribeToScroll, isScrolled, () => false);
  const progress = useSyncExternalStore(subscribeToScroll, scrollProgress, () => 0);
  const pathname = usePathname();
  // The mobile menu belongs to the page it was opened on, so it closes on navigation.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const [productsOpen, setProductsOpen] = useState(false);
  const { user } = useAuth();

  const floating = scrolled || open;

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-2 sm:px-4">
      <div
        className={cn(
          'relative mx-auto rounded-2xl border transition-all duration-500 ease-out',
          floating ? 'mt-3 max-w-6xl border-white/10 bg-ink-950/55 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.8)] backdrop-blur-xl' : 'mt-0 max-w-7xl border-transparent bg-transparent'
        )}
      >
        <span
          aria-hidden
          className={cn('pointer-events-none absolute inset-x-6 -bottom-px h-px origin-left bg-brand-gradient-3 transition-opacity duration-500', scrolled ? 'opacity-100' : 'opacity-0')}
          style={{ transform: `scaleX(${progress})` }}
        />
        <div className={cn('flex items-center justify-between px-4 transition-all duration-500 sm:px-6', floating ? 'h-14' : 'h-16 lg:px-8')}>
          <div className="flex items-center gap-8">
            <Logo />
            <nav className="hidden items-center gap-0.5 md:flex">
              <ProductsMenu active={pathname.startsWith('/products')} />
              {PUBLIC_NAV.map((n) => (
                <NavLink key={n.href} href={n.href} className={({ isActive }) => cn('rounded-lg px-3 py-2 text-sm transition', isActive ? 'text-white' : 'text-ink-300 hover:text-white')}>
                  {n.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            {user ? (
              <AccountMenu />
            ) : (
              <>
                <ButtonLink href="/login" variant="ghost" size="sm">
                  Login
                </ButtonLink>
                <ButtonLink href="/signup" variant="secondary" size="sm">
                  Get Started
                </ButtonLink>
              </>
            )}
          </div>
          <button className="rounded-lg p-2 text-ink-200 md:hidden" onClick={() => setOpenOn(open ? null : pathname)} aria-label="Toggle menu">
            {open ? <X className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
        </div>

        {open && (
          <div className="max-h-[calc(100vh-6rem)] animate-fade-in overflow-y-auto border-t border-white/[0.06] px-4 pb-6 pt-2 md:hidden">
            <button
              onClick={() => setProductsOpen((o) => !o)}
              className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-ink-200 hover:bg-white/5"
              aria-expanded={productsOpen}
            >
              Products
              <ChevronDown className={cn('h-4 w-4 transition-transform', productsOpen && 'rotate-180')} />
            </button>
            {productsOpen && (
              <div className="mb-2 ml-3 animate-fade-in space-y-3 border-l border-white/[0.08] pl-2">
                {PRODUCT_CATEGORIES.map((c) => (
                  <div key={c.name}>
                    <p className="px-2.5 pt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-500">{c.name}</p>
                    {PRODUCTS.filter((p) => p.category === c.name).map((p) => (
                      <ProductLink key={p.slug} p={p} />
                    ))}
                  </div>
                ))}
                <Link href="/products" className="block px-2.5 py-2 text-sm text-brand-300">
                  View all products
                </Link>
              </div>
            )}
            {PUBLIC_NAV.map((n) => (
              <Link key={n.href} href={n.href} className="block rounded-lg px-3 py-3 text-ink-200 hover:bg-white/5">
                {n.label}
              </Link>
            ))}
            <div className="mt-4 grid grid-cols-2 gap-2">
              {user ? (
                <MobileAccountPanel />
              ) : (
                <>
                  <ButtonLink href="/login" variant="outline">
                    Login
                  </ButtonLink>
                  <ButtonLink href="/signup">Get Started</ButtonLink>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
