'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { MESSAGES, MIN_PASSWORD_LENGTH } from '@digitalycloud/shared';
import { Button, ButtonLink } from '@/components/ui/button';
import { useHydrated } from '@/hooks/use-hydrated';
import { api, errorMessage } from '@/lib/api';
import { FormError } from './auth-form-parts';
import { useLinkToken } from './use-link-token';

export function ResetPasswordForm() {
  const hydrated = useHydrated();
  const token = useLinkToken();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) return setError(MESSAGES.password);
    if (password !== confirm) return setError("Passwords don't match.");
    setBusy(true);
    try {
      await api.auth.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!hydrated) return null;

  if (done) {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-success-500/10 text-success-400">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h1 className="mt-6 text-2xl font-semibold text-white">Password updated</h1>
        <p className="mt-2 text-sm text-ink-300">For your security, every device was signed out. Log in with your new password.</p>
        <ButtonLink href="/login" className="mt-8">
          Log in
        </ButtonLink>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-white">This link is incomplete</h1>
        <p className="mt-2 text-sm text-ink-300">{MESSAGES.reset} Request a new one below.</p>
        <ButtonLink href="/forgot-password" className="mt-8">
          Send a new link
        </ButtonLink>
      </div>
    );
  }

  return (
    <>
      <Link href="/login" className="mb-8 inline-flex items-center gap-2 text-sm text-ink-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back to login
      </Link>
      <h1 className="text-2xl font-semibold text-white">Choose a new password</h1>
      <p className="mt-2 text-sm text-ink-300">Use at least {MIN_PASSWORD_LENGTH} characters. All your sessions will be signed out.</p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <FormError message={error} />
        <div>
          <label className="label" htmlFor="password">
            New password
          </label>
          <input id="password" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required autoFocus />
        </div>
        <div>
          <label className="label" htmlFor="confirm">
            Confirm new password
          </label>
          <input id="confirm" type="password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
        </div>
        <Button type="submit" className="w-full" size="lg" loading={busy}>
          Update password
        </Button>
      </form>
      {error === MESSAGES.reset && (
        <p className="mt-4 text-center text-sm">
          <Link href="/forgot-password" className="text-brand-300 hover:text-brand-200">
            Send a new reset link
          </Link>
        </p>
      )}
    </>
  );
}
