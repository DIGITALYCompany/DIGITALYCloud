'use client';

import { useState } from 'react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { Users } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/button';
import { useHydrated } from '@/hooks/use-hydrated';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/providers/toast-provider';
import { api, errorMessage } from '@/lib/api';
import { FormError } from './auth-form-parts';
import { useLinkToken } from './use-link-token';


/** Accepting needs a signed-in account whose verified email matches the invitation. */
export function AcceptInvitation() {
  const hydrated = useHydrated();
  const { user, loading, refreshTeams, switchTeam } = useAuth();
  const toast = useToast();
  const router = useRouter();
  // Kept in the URL: the visitor may first need to sign in or sign up and come back here.
  const token = useLinkToken({ strip: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!hydrated || loading) return null;

  if (!token) {
    return (
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-white">This invitation link is incomplete</h1>
        <p className="mt-2 text-sm text-ink-300">Open the link from the invitation email again, or ask for a new invitation.</p>
      </div>
    );
  }

  const back = encodeURIComponent(`/invite?token=${token}`);
  if (!user) {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-300">
          <Users className="h-7 w-7" />
        </div>
        <h1 className="mt-6 text-2xl font-semibold text-white">You’ve been invited to a team</h1>
        <p className="mt-2 text-sm text-ink-300">Log in or create an account with the email address the invitation was sent to.</p>
        <div className="mt-8 flex justify-center gap-3">
          <ButtonLink href={`/login?from=${back}` as Route}>Log in</ButtonLink>
          <ButtonLink href={`/signup?from=${back}` as Route} variant="outline">
            Create account
          </ButtonLink>
        </div>
      </div>
    );
  }

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.teams.accept(token);
      await switchTeam(res.team.id).catch(() => refreshTeams());
      toast({ kind: 'success', title: `You joined ${res.team.name}`, description: `Your role: ${res.role}.` });
      router.replace('/dashboard');
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <div className="text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-300">
        <Users className="h-7 w-7" />
      </div>
      <h1 className="mt-6 text-2xl font-semibold text-white">Join the team?</h1>
      <p className="mt-2 text-sm text-ink-300">
        You’re signed in as <span className="text-white">{user.email}</span>. The invitation must have been sent to this address
        {user.emailVerified ? '' : ', and the address must be verified first'}.
      </p>
      <div className="mt-6 text-left">
        <FormError message={error} />
      </div>
      <Button className="mt-6" size="lg" onClick={accept} loading={busy}>
        Accept invitation
      </Button>
    </div>
  );
}
