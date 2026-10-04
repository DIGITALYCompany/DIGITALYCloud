'use client';

import { useRouter } from 'next/navigation';
import { ArrowUpRight, ShieldHalf } from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { NavLink } from '@/components/ui/nav-link';
import { AccountMenu } from './account-menu';
import { SidebarPlanCard } from './sidebar-plan-card';
import { useAuth } from '@/providers/auth-provider';
import { useCloud } from '@/providers/cloud-provider';
import { APP_NAV, APP_RESOURCES } from '@/config/navigation';
import { cn } from '@/lib/utils';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn('group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition', isActive ? 'bg-white/[0.07] text-white' : 'text-ink-300 hover:bg-white/[0.04] hover:text-white');

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth();
  const { services } = useCloud();
  const router = useRouter();
  if (!user) return null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Logo href="/dashboard" />
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {APP_NAV.map((n) => (
          <NavLink key={n.href} href={n.href} className={linkClass} onClick={onNavigate}>
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-brand-gradient" />}
                <n.icon className={cn('h-4 w-4', isActive ? 'text-brand-300' : 'text-ink-400 group-hover:text-ink-200')} />
                {n.label}
              </>
            )}
          </NavLink>
        ))}
        <p className="px-3 pb-1 pt-6 text-[11px] font-medium uppercase tracking-wider text-ink-500">Resources</p>
        {APP_RESOURCES.map((r) => (
          <a
            key={r.href}
            href={r.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink-300 transition hover:bg-white/[0.04] hover:text-white"
          >
            <r.icon className="h-4 w-4 text-ink-400 group-hover:text-ink-200" />
            {r.label}
            <ArrowUpRight className="ml-auto h-3.5 w-3.5 text-ink-500 opacity-0 transition group-hover:opacity-100" />
          </a>
        ))}
        {user.role === 'admin' && (
          <>
            <p className="px-3 pb-1 pt-6 text-[11px] font-medium uppercase tracking-wider text-ink-500">Internal</p>
            <NavLink href="/admin" className={linkClass} onClick={onNavigate}>
              {({ isActive }) => (
                <>
                  <ShieldHalf className={cn('h-4 w-4', isActive ? 'text-aqua-400' : 'text-ink-400')} />
                  Control Center
                  <span className="ml-auto rounded-md bg-aqua-500/10 px-1.5 py-0.5 text-[10px] font-medium text-aqua-400">ADMIN</span>
                </>
              )}
            </NavLink>
          </>
        )}
      </nav>

      <div className="space-y-3 p-3">
        <SidebarPlanCard
          services={services}
          onManage={() => {
            router.push('/billing');
            onNavigate?.();
          }}
        />
        <AccountMenu variant="sidebar" onNavigate={onNavigate} />
      </div>
    </div>
  );
}
