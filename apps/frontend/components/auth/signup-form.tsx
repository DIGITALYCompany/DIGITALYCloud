'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/providers/toast-provider';
import { cn } from '@/lib/utils';
import { Divider, FormError, GoogleButton } from './auth-form-parts';

/** 0–4: length, mixed case, digit, symbol. */
function strength(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

const PERKS = ['Free plan, no credit card required', '1 service with 512 MB RAM included', 'Hosted in France'];

export function SignupForm() {
  const { signup, loginWithGoogle } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const score = strength(password);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!terms) return setError('Please accept the Terms of Service and Privacy Policy.');
    setBusy(true);
    try {
      await signup(name, email, password);
      toast({ kind: 'success', title: 'Account created', description: 'Welcome to DIGITALYCloud.' });
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1 className="text-2xl font-semibold text-white">Create your account</h1>
      <p className="mt-2 text-sm text-ink-300">
        Already have one?{' '}
        <Link href="/login" className="font-medium text-brand-300 hover:text-brand-200">
          Log in
        </Link>
      </p>
      <div className="mt-8">
        <GoogleButton
          onClick={async () => {
            await loginWithGoogle();
            router.push('/dashboard');
          }}
        />
      </div>
      <Divider>or sign up with email</Divider>
      <form onSubmit={submit} className="space-y-4">
        <FormError message={error} />
        <div>
          <label className="label" htmlFor="name">
            Full name
          </label>
          <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mehdi Forhrani" autoComplete="name" required />
        </div>
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" required />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            required
          />
          <div className="mt-2 grid grid-cols-4 gap-1">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={cn('h-1 rounded-full transition', i < score ? (score <= 1 ? 'bg-danger-500' : score <= 2 ? 'bg-warning-500' : 'bg-success-500') : 'bg-white/[0.08]')} />
            ))}
          </div>
        </div>
        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-300">
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-500" />
          <span>
            I agree to the{' '}
            <Link href="/legal/terms" className="text-ink-100 underline">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link href="/legal/privacy" className="text-ink-100 underline">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
        <Button type="submit" className="w-full" size="lg" loading={busy}>
          Create account
        </Button>
      </form>
      <ul className="mt-8 space-y-2 text-sm text-ink-400">
        {PERKS.map((t) => (
          <li key={t} className="flex items-center gap-2">
            <Check className="h-4 w-4 text-success-400" /> {t}
          </li>
        ))}
      </ul>
    </>
  );
}
