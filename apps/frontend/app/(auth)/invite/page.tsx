import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AcceptInvitation } from '@/components/auth/accept-invitation';

export const metadata: Metadata = { title: 'Join a team', robots: { index: false } };

export default function InvitePage() {
  // The link token is read with useSearchParams.
  return (
    <Suspense>
      <AcceptInvitation />
    </Suspense>
  );
}
