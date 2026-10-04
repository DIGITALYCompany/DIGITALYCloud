'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Logo } from '@/components/ui/logo';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/providers/auth-provider';

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Logo compact />
        <Skeleton className="h-1.5 w-32" />
      </div>
    </div>
  );
}

/**
 * Client-side guard for the dashboard. Visitors without a session are sent to the login page
 * with `?from=` so they come back afterwards. Signing out from inside the dashboard is not
 * treated as a missing session: the sign-out action navigates away itself.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const hadSession = useRef(false);

  useEffect(() => {
    if (user) hadSession.current = true;
  }, [user]);

  useEffect(() => {
    if (!loading && !user && !hadSession.current) router.replace(`/login?from=${encodeURIComponent(pathname)}`);
  }, [loading, user, pathname, router]);

  if (loading || !user) return <Splash />;
  return children;
}
