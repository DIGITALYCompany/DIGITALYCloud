'use client';

import type { ReactNode } from 'react';
import { AuthProvider } from './auth-provider';
import { ToastProvider } from './toast-provider';

/** Global client providers mounted once by the root layout. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>{children}</AuthProvider>
    </ToastProvider>
  );
}
