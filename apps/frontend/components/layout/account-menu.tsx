'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, ChevronsUpDown, LogOut, Users } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { useClickOutside } from '@/hooks/use-click-outside';
import { useAuth } from '@/providers/auth-provider';
import { ACCOUNT_ADMIN_LINK, ACCOUNT_APP_LINKS, ACCOUNT_QUICK_ACTIONS, ACCOUNT_SITE_LINKS, type AccountNavItem } from '@/config/navigation';
import { cn } from '@/lib/utils';
import type { User } from '@/lib/types';

type Variant = 'site' | 'app' | 'sidebar';

function linksFor(user: User, variant: Variant) {
  const base = variant === 'site' ? ACCOUNT_SITE_LINKS : ACCOUNT_APP_LINKS;
  return user.role === 'admin' ? [...base, ACCOUNT_ADMIN_LINK] : base;
}

function useLogout() {
  const { logout } = useAuth();
  const router = useRouter();
  return () => {
    router.prefetch('/');
    return logout().then(() => router.push('/'));
  };
}

const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', developer: 'Developer', viewer: 'Viewer' } as const;

/** The tab works in one team at a time; switching reloads that team's data (other tabs keep theirs). */
function TeamSwitcher({ onDone }: { onDone: () => void }) {
  const { teams, team, switchTeam } = useAuth();
  const router = useRouter();
  if (teams.length < 2) return null;
  return (
    <div className="border-b border-white/[0.06] p-1.5">
      <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-500">Teams</p>
      {teams.map((t) => (
        <button
          key={t.id}
          type="button"
          role="menuitemradio"
          aria-checked={t.id === team?.id}
          onClick={async () => {
            onDone();
            if (t.id === team?.id) return;
            await switchTeam(t.id);
            // Pages of the previous team's services don't exist in the new one.
            if (window.location.pathname.startsWith('/services/')) router.push('/services');
          }}
          className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm text-ink-200 transition hover:bg-white/[0.06] hover:text-white"
        >
          <Users className="h-4 w-4 text-ink-400" />
          <span className="min-w-0 flex-1 truncate">{t.personal ? `${t.name} (personal)` : t.name}</span>
          <span className="text-[11px] text-ink-500">{ROLE_LABEL[t.role]}</span>
          {t.id === team?.id && <Check className="h-3.5 w-3.5 text-brand-300" />}
        </button>
      ))}
    </div>
  );
}

function ItemLink({ item, onClick, className }: { item: AccountNavItem; onClick: () => void; className: string }) {
  const content = (
    <>
      <item.icon className="h-4 w-4 text-ink-400 transition group-hover:text-brand-300" />
      {item.label}
    </>
  );
  if (item.external) {
    return (
      <a href={item.href} target="_blank" rel="noopener noreferrer" onClick={onClick} role="menuitem" className={className}>
        {content}
      </a>
    );
  }
  return (
    <Link href={item.href} onClick={onClick} role="menuitem" className={className}>
      {content}
    </Link>
  );
}

function UserIdentity({ user, size }: { user: User; size: number }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar initials={user.avatarInitials} size={size} />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-white">{user.name}</p>
        <p className="truncate text-xs text-ink-400">{user.email}</p>
      </div>
    </div>
  );
}

function Trigger({ user, variant, open, onClick }: { user: User; variant: Variant; open: boolean; onClick: () => void }) {
  const aria = { 'aria-haspopup': 'menu' as const, 'aria-expanded': open };
  if (variant === 'sidebar') {
    return (
      <button type="button" onClick={onClick} {...aria} className={cn('flex w-full items-center gap-3 rounded-xl p-2 text-left transition', open ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]')}>
        <div className="min-w-0 flex-1">
          <UserIdentity user={user} size={32} />
        </div>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-ink-400" />
      </button>
    );
  }
  if (variant === 'app') {
    return (
      <button type="button" onClick={onClick} {...aria} aria-label="Account" className={cn('ml-1 rounded-full ring-2 transition', open ? 'ring-brand-400/60' : 'ring-transparent hover:ring-white/15')}>
        <Avatar initials={user.avatarInitials} />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      {...aria}
      className={cn(
        'flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition',
        open ? 'border-white/20 bg-white/[0.07] text-white' : 'border-white/[0.08] bg-white/[0.03] text-ink-100 hover:border-white/15 hover:bg-white/[0.06]'
      )}
    >
      <Avatar initials={user.avatarInitials} size={28} />
      <span className="max-w-[120px] truncate font-medium">{user.firstName}</span>
      <ChevronDown className={cn('h-3.5 w-3.5 text-ink-400 transition-transform duration-200', open && 'rotate-180')} />
    </button>
  );
}

export function AccountMenu({ variant = 'site', onNavigate }: { variant?: Variant; onNavigate?: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  const logout = useLogout();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!user) return null;
  const close = () => {
    setOpen(false);
    onNavigate?.();
  };
  const [primary, secondary] = ACCOUNT_QUICK_ACTIONS[variant === 'site' ? 'site' : 'app'];
  const position = variant === 'sidebar' ? 'bottom-full left-0 right-0 mb-2 origin-bottom' : 'right-0 mt-2 w-72 origin-top-right';

  return (
    <div ref={ref} className="relative">
      <Trigger user={user} variant={variant} open={open} onClick={() => setOpen((o) => !o)} />

      {open && (
        <div role="menu" className={cn('absolute z-50 animate-scale-in overflow-hidden rounded-2xl border border-white/10 bg-ink-850/95 shadow-2xl shadow-black/60 backdrop-blur-xl', position)}>
          <div className="relative overflow-hidden border-b border-white/[0.06] p-4">
            <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-brand-500/25 blur-2xl" />
            {variant !== 'sidebar' && (
              <div className="relative mb-3">
                <UserIdentity user={user} size={40} />
              </div>
            )}
            <div className="relative grid grid-cols-2 gap-2">
              <Link
                href={primary.href}
                onClick={close}
                className="flex h-8 items-center justify-center gap-1.5 rounded-lg bg-brand-gradient text-xs font-medium text-white shadow-lg shadow-brand-500/25 transition hover:brightness-110"
              >
                <primary.icon className="h-3.5 w-3.5" /> {primary.label}
              </Link>
              <Link
                href={secondary.href}
                onClick={close}
                className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] text-xs font-medium text-white transition hover:border-white/20 hover:bg-white/[0.08]"
              >
                <secondary.icon className="h-3.5 w-3.5" /> {secondary.label}
              </Link>
            </div>
          </div>

          {variant !== 'site' && <TeamSwitcher onDone={close} />}

          <nav className="p-1.5">
            {linksFor(user, variant).map((l) => (
              <ItemLink key={l.href} item={l} onClick={close} className="group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-ink-200 transition hover:bg-white/[0.06] hover:text-white" />
            ))}
          </nav>

          <div className="border-t border-white/[0.06] p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                close();
                logout();
              }}
              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm text-danger-400 transition hover:bg-danger-500/10"
            >
              <LogOut className="h-4 w-4" /> Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function MobileAccountPanel() {
  const { user } = useAuth();
  const logout = useLogout();
  if (!user) return null;
  const links = [ACCOUNT_QUICK_ACTIONS.site[0], ...linksFor(user, 'site')];
  return (
    <div className="col-span-2 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02]">
      <div className="border-b border-white/[0.06] p-4">
        <UserIdentity user={user} size={36} />
      </div>
      <div className="grid grid-cols-2 gap-1 p-2">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-ink-200 hover:bg-white/[0.05] hover:text-white">
            <l.icon className="h-4 w-4 text-ink-400" />
            <span className="truncate">{l.label}</span>
          </Link>
        ))}
        <button type="button" onClick={logout} className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm text-danger-400 hover:bg-danger-500/10">
          <LogOut className="h-4 w-4" /> Log out
        </button>
      </div>
    </div>
  );
}
