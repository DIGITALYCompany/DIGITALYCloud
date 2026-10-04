'use client';

import { useState, type FormEvent } from 'react';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/providers/toast-provider';
import { safeRedirectPath } from '@/lib/validation';
import { Divider, FormError, GoogleButton } from './auth-form-parts';

/** Where to go after signing in: the protected page that redirected here, or the dashboard. */
const redirectTarget = () => safeRedirectPath(new URLSearchParams(window.location.search).get('from'), '/dashboard') as Route;

export function LoginForm() {
  const { login, loginWithGoogle } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [email, setEmail] = useState('mehdi@digitaly.fr');
  const [password, setPassword] = useState('demo-password');
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<'email' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy('email');
    try {
      await login(email, password, remember);
      toast({ kind: 'success', title: 'Welcome back', description: 'You are signed in to DIGITALYCloud.' });
      router.replace(redirectTarget());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setBusy(null);
    }
  };

  const google = async () => {
    setBusy('google');
    await loginWithGoogle();
    router.replace(redirectTarget());
  };

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
      <p className="mt-6 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-xs text-ink-400">Demo mode: any email and a password of 6+ characters will sign you in.</p>
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
