import type { Metadata } from 'next';
import { Suspense } from 'react';
import { VerifyEmail } from '@/components/auth/verify-email';

export const metadata: Metadata = { title: 'Confirm your email', robots: { index: false } };

export default function VerifyEmailPage() {
  // The link token is read with useSearchParams.
  return (
    <Suspense>
      <VerifyEmail />
    </Suspense>
  );
}
