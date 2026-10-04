'use client';

import { useState } from 'react';
import { Bell, CheckCircle2, Info, TriangleAlert, XCircle } from 'lucide-react';
import { useClickOutside } from '@/hooks/use-click-outside';
import { useCloud } from '@/providers/cloud-provider';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';

const ICON = {
  success: <CheckCircle2 className="h-4 w-4 text-success-400" />,
  warning: <TriangleAlert className="h-4 w-4 text-warning-400" />,
  info: <Info className="h-4 w-4 text-brand-300" />,
  error: <XCircle className="h-4 w-4 text-danger-400" />,
};

export function NotificationsMenu() {
  const { notifications, markNotificationsRead } = useCloud();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  const unread = notifications.filter((n) => !n.read).length;
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative rounded-xl p-2 text-ink-300 transition hover:bg-white/[0.06] hover:text-white" aria-label="Notifications" aria-expanded={open}>
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-azure-500 ring-2 ring-ink-950" />}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(360px,calc(100vw-2rem))] origin-top-right animate-scale-in overflow-hidden rounded-2xl border border-white/10 bg-ink-850/95 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
            <p className="text-sm font-medium text-white">Notifications</p>
            {unread > 0 && (
              <button onClick={markNotificationsRead} className="text-xs text-brand-300 hover:text-brand-200">
                Mark all as read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 && <p className="px-4 py-10 text-center text-sm text-ink-400">You&apos;re all caught up.</p>}
            {notifications.slice(0, 8).map((n) => (
              <div key={n.id} className={cn('flex gap-3 border-b border-white/[0.04] px-4 py-3 last:border-0', !n.read && 'bg-brand-500/[0.04]')}>
                <div className="mt-0.5">{ICON[n.kind]}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white">{n.title}</p>
                  <p className="mt-0.5 text-xs text-ink-400">{n.body}</p>
                  <p className="mt-1 text-[11px] text-ink-500">{timeAgo(n.time)}</p>
                </div>
                {!n.read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-azure-500" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
