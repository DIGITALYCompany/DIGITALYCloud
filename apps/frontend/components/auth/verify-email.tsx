'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import { useAuth } from '@/providers/auth-provider';
import { api, errorMessage, isApiError } from '@/lib/api';
import { useLinkToken } from './use-link-token';

/** Confirms the address from the email link. Works signed in or not, on any device. */
export function VerifyEmail() {
  const token = useLinkToken();
  const { user, refreshUser } = useAuth();
  const [result, setResult] = useState<{ kind: 'pending' | 'done' | 'error'; message?: string; retry?: boolean }>({ kind: 'pending' });
  const state = token ? result : { kind: 'error' as const, message: 'This verification link is incomplete.' };

  useEffect(() => {
    if (!token) return;
    let alive = true;
    api.auth
      .verifyEmail(token)
      .then(() => alive && setResult({ kind: 'done' }))
      .catch((e: unknown) => alive && setResult({ kind: 'error', message: errorMessage(e), retry: !isApiError(e) || e.status === 429 || e.status >= 500 }));
    return () => {
      alive = false;
    };
  }, [token]);

  // Refresh the signed-in user (if any) so banners disappear.
  useEffect(() => {
    if (state.kind === 'done' && user) refreshUser().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per successful verification
  }, [state.kind]);

  return (
    <div className="text-center">
      <div
        className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${state.kind === 'done' ? 'bg-success-500/10 text-success-400' : state.kind === 'error' ? 'bg-danger-500/10 text-danger-400' : 'bg-brand-500/10 text-brand-300'}`}
      >
        {state.kind === 'done' ? <CheckCircle2 className="h-7 w-7" /> : state.kind === 'error' ? <XCircle className="h-7 w-7" /> : <Loader2 className="h-7 w-7 animate-spin" />}
      </div>
      <h1 className="mt-6 text-2xl font-semibold text-white">{state.kind === 'done' ? 'Email confirmed' : state.kind === 'error' ? ('retry' in state && state.retry ? 'Couldn’t confirm right now' : 'Link not valid') : 'Confirming your email…'}</h1>
      <p className="mt-2 text-sm text-ink-300">
        {state.kind === 'done' ? 'Thanks! Alerts and invoices will reach you at this address.' : state.kind === 'error' ? ('retry' in state && state.retry ? `${state.message} Open the link again in a moment.` : `${state.message} You can request a new link from your profile settings.`) : 'One moment.'}
      </p>
      {state.kind !== 'pending' && (
        <ButtonLink href={user ? '/dashboard' : '/login'} className="mt-8">
          {user ? 'Go to dashboard' : 'Log in'}
        </ButtonLink>
      )}
    </div>
  );
}
