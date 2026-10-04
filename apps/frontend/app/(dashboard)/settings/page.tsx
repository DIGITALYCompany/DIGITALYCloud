import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SettingsView } from '@/components/settings/settings-view';

export const metadata: Metadata = { title: 'Settings' };

export default function SettingsPage() {
  // The active tab comes from `?tab=`, read with useSearchParams.
  return (
    <Suspense>
      <SettingsView />
    </Suspense>
  );
}
