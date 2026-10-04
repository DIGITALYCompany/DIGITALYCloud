import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { RequireAuth } from '@/components/layout/require-auth';
import { CloudProvider } from '@/providers/cloud-provider';

export const metadata: Metadata = {
  // Private, per-user pages.
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <CloudProvider>
        <AppShell>{children}</AppShell>
      </CloudProvider>
    </RequireAuth>
  );
}
