'use client';

import type { ComponentProps, ReactNode } from 'react';
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Same matching rules as React Router's NavLink: a link is active on its own path and,
 * unless `end` is set, on any nested path (`/services` is active on `/services/new`).
 */
export function isActivePath(pathname: string, href: string, end = false) {
  const path = pathname.toLowerCase();
  const to = href.split(/[?#]/)[0].toLowerCase();
  if (path === to) return true;
  if (end) return false;
  const boundary = to !== '/' && to.endsWith('/') ? to.length - 1 : to.length;
  return path.startsWith(to) && path.charAt(boundary) === '/';
}

type State = { isActive: boolean };

interface NavLinkProps<T extends string> extends Omit<ComponentProps<typeof Link>, 'href' | 'className' | 'children'> {
  href: Route<T>;
  end?: boolean;
  className?: string | ((state: State) => string);
  children?: ReactNode | ((state: State) => ReactNode);
}

export function NavLink<T extends string>({ href, end, className, children, ...props }: NavLinkProps<T>) {
  const isActive = isActivePath(usePathname(), href, end);
  const state = { isActive };
  return (
    <Link href={href} aria-current={isActive ? 'page' : undefined} className={typeof className === 'function' ? className(state) : className} {...props}>
      {typeof children === 'function' ? children(state) : children}
    </Link>
  );
}
