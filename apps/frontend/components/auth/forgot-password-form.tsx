'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';
import { FormError } from './auth-form-parts';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.auth.requestReset(email);
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-success-500/10 text-success-400">
          <MailCheck className="h-7 w-7" />
        </div>
        <h1 className="mt-6 text-2xl font-semibold text-white">Check your inbox</h1>
        <p className="mt-2 text-sm text-ink-300">
          If an account exists for <span className="text-white">{email}</span>, you&apos;ll receive a reset link within a few minutes.
        </p>
        <Link href="/login" className="mt-8 inline-flex items-center gap-2 text-sm text-brand-300 hover:text-brand-200">
          <ArrowLeft className="h-4 w-4" /> Back to login
        </Link>
      </div>
    );
  }

  return (
    <>
      <Link href="/login" className="mb-8 inline-flex items-center gap-2 text-sm text-ink-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back to login
      </Link>
      <h1 className="text-2xl font-semibold text-white">Reset your password</h1>
      <p className="mt-2 text-sm text-ink-300">Enter the email linked to your account and we&apos;ll send you a reset link.</p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <FormError message={error} />
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required />
        </div>
        <Button type="submit" className="w-full" size="lg" loading={busy}>
          Send reset link
        </Button>
      </form>
    </>
  );
}
