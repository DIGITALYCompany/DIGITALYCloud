'use client';

import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/providers/toast-provider';
import { errorMessage } from '@/lib/api';
import { safeRedirectPath } from '@/lib/validation';
import { Divider, FormError, GoogleButton } from './auth-form-parts';

/** Where to go after signing in: the protected page that redirected here, or the dashboard. */
const redirectTarget = () => safeRedirectPath(new URLSearchParams(window.location.search).get('from'), '/dashboard') as Route;

/** Messages for `?error=` codes the API's Google callback redirects with. */
const GOOGLE_ERRORS: Record<string, string> = {
  google: 'Google sign-in didn’t complete. Please try again.',
  google_unavailable: 'Google sign-in isn’t available right now. Use your email and password.',
  google_unverified: 'Your Google account email isn’t verified, so it can’t be used to sign in.',
  google_link_unverified: 'An account with this email exists but isn’t verified yet. Sign in with your password and verify your email first, then you can use Google.',
  account_unavailable: 'This account can’t be signed in to.',
};

function TwoFactorStep({ challengeToken, onBack }: { challengeToken: string; onBack: () => void }) {
  const { verifyTwoFactor } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await verifyTwoFactor(challengeToken, code.replace(/\s/g, ''));
      toast({ kind: 'success', title: 'Welcome back', description: 'You are signed in to DIGITALYCloud.' });
      router.replace(redirectTarget());
    } catch (err) {
      setError(errorMessage(err, 'That code is not valid.'));
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" onClick={onBack} className="mb-8 inline-flex items-center gap-2 text-sm text-ink-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-300">
        <ShieldCheck className="h-6 w-6" />
      </div>
      <h1 className="mt-5 text-2xl font-semibold text-white">Two-factor authentication</h1>
      <p className="mt-2 text-sm text-ink-300">{recovery ? 'Enter one of your recovery codes.' : 'Enter the 6-digit code from your authenticator app.'}</p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <FormError message={error} />
        <div>
          <label className="label" htmlFor="code">
            {recovery ? 'Recovery code' : 'Authentication code'}
          </label>
          <input
            id="code"
            className="input font-mono tracking-[0.25em]"
            inputMode={recovery ? 'text' : 'numeric'}
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(recovery ? e.target.value : e.target.value.replace(/[^\d\s]/g, '').slice(0, 8))}
            autoFocus
            required
          />
        </div>
        <Button type="submit" className="w-full" size="lg" loading={busy} disabled={code.replace(/\s/g, '').length < 6}>
          Verify
        </Button>
      </form>
      <button
        type="button"
        onClick={() => {
          setRecovery((r) => !r);
          setCode('');
          setError(null);
        }}
        className="mt-4 text-xs text-ink-400 hover:text-white"
      >
        {recovery ? 'Use your authenticator app instead' : 'Lost your device? Use a recovery code'}
      </button>
    </>
  );
}

// The 2FA challenge after Google sign-in arrives in the URL fragment (never sent to servers).
const subscribeHash = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};
const readHashChallenge = () => new URLSearchParams(window.location.hash.slice(1)).get('challenge');

export function LoginForm() {
  const { login, loginWithGoogle } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<'email' | 'google' | null>(null);
  const [formError, setError] = useState<string | null>(null);
  const [typedChallenge, setChallenge] = useState<string | null>(null);
  const [urlConsumed, setUrlConsumed] = useState(false);
  // Google sign-in comes back with `?error=` or, when 2FA is on, `#challenge=`.
  const googleError = useSearchParams().get('error');
  const hashChallenge = useSyncExternalStore(subscribeHash, readHashChallenge, () => null);
  const error = formError ?? (!urlConsumed && googleError ? (GOOGLE_ERRORS[googleError] ?? GOOGLE_ERRORS.google) : null);
  const challenge = typedChallenge ?? (urlConsumed ? null : hashChallenge);

  // Drop the codes from the address bar (the fragment holds a sign-in token).
  useEffect(() => {
    if (!googleError && !hashChallenge) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('error');
    window.history.replaceState(null, '', url.pathname + url.search);
  }, [googleError, hashChallenge]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setUrlConsumed(true);
    setBusy('email');
    try {
      const needs = await login(email, password, remember);
      if (needs) {
        setChallenge(needs.challengeToken);
        setPassword('');
        return;
      }
      toast({ kind: 'success', title: 'Welcome back', description: 'You are signed in to DIGITALYCloud.' });
      router.replace(redirectTarget());
    } catch (err) {
      setError(errorMessage(err, 'Sign in failed.'));
    } finally {
      setBusy(null);
    }
  };

  const google = () => {
    setBusy('google');
    loginWithGoogle(redirectTarget());
  };

  if (challenge)
    return (
      <TwoFactorStep
        challengeToken={challenge}
        onBack={() => {
          setChallenge(null);
          setUrlConsumed(true);
        }}
      />
    );

  return (
    <>
      <h1 className="text-2xl font-semibold text-white">Log in to DIGITALYCloud</h1>
      <p className="mt-2 text-sm text-ink-300">
        New here?{' '}
        <Link href="/signup" className="font-medium text-brand-300 hover:text-brand-200">
          Create an account
        </Link>
      </p>
      <div className="mt-8">
        <GoogleButton onClick={google} loading={busy === 'google'} />
      </div>
      <Divider>or continue with email</Divider>
      <form onSubmit={submit} className="space-y-4">
        <FormError message={error} />
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="label" htmlFor="password">
              Password
            </label>
            <Link href="/forgot-password" className="mb-1.5 text-xs text-ink-400 hover:text-white">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              id="password"
              type={show ? 'text' : 'password'}
              className="input pr-10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-white" aria-label="Toggle password visibility">
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-300">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 rounded border-white/20 bg-ink-900 accent-brand-500" />
          Remember me
        </label>
        <Button type="submit" className="w-full" size="lg" loading={busy === 'email'}>
          Log in
        </Button>
      </form>
      <p className="mt-6 text-center text-xs text-ink-500">
        By continuing you agree to our{' '}
        <Link href="/legal/terms" className="underline hover:text-ink-300">
          Terms
        </Link>{' '}
        and{' '}
        <Link href="/legal/privacy" className="underline hover:text-ink-300">
          Privacy Policy
        </Link>
        .
      </p>
    </>
  );
}
