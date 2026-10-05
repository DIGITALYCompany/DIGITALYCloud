import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginForm } from '@/components/auth/login-form';

export const metadata: Metadata = { title: 'Log in' };

export default function LoginPage() {
  // Google sign-in errors arrive as `?error=`, read with useSearchParams.
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
