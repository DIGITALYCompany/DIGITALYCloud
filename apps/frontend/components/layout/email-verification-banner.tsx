'use client';

import { useState } from 'react';
import { MailWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/providers/toast-provider';
import { api, errorMessage } from '@/lib/api';

/** Shown until the account's email address is confirmed (alerts and invoices go there). */
export function EmailVerificationBanner() {
  const { user } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  if (!user || user.emailVerified || hidden) return null;

  const resend = async () => {
    setBusy(true);
    try {
      await api.auth.resendVerification();
      toast({ kind: 'success', title: 'Verification email sent', description: `Check ${user.email}.` });
    } catch (e) {
      toast({ kind: 'error', title: 'Could not send the email', description: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-warning-500/25 bg-warning-500/[0.06] px-4 py-3 text-sm sm:flex-row sm:items-center">
      <MailWarning className="h-4 w-4 shrink-0 text-warning-400" />
      <p className="flex-1 text-ink-200">Confirm your email address so we can reach you about deployments, crashes and invoices.</p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" loading={busy} onClick={resend}>
          Resend email
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setHidden(true)}>
          Later
        </Button>
      </div>
    </div>
  );
}
