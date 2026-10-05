'use client';

import { useState, type ReactNode } from 'react';
import { Copy, Download, Laptop, Smartphone } from 'lucide-react';
import { MIN_PASSWORD_LENGTH, type TwoFactorSetupResponse } from '@digitalycloud/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useApi } from '@/hooks/use-api';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/providers/toast-provider';
import { api, errorMessage } from '@/lib/api';
import { copyToClipboard, downloadTextFile } from '@/lib/browser';
import { timeAgo } from '@/lib/format';

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}

function PasswordPanel() {
  const { user, refreshUser } = useAuth();
  const toast = useToast();
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;
  // Google-only accounts set their first password without a current one (recent sign-in required).
  const setting = !user.hasPassword;
  const hint = pw.next && pw.next.length < MIN_PASSWORD_LENGTH ? `At least ${MIN_PASSWORD_LENGTH} characters.` : pw.confirm && pw.confirm !== pw.next ? "Passwords don't match." : null;

  const change = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.account.changePassword({ ...(setting ? {} : { currentPassword: pw.current }), newPassword: pw.next });
      setPw({ current: '', next: '', confirm: '' });
      await refreshUser();
      toast({ kind: 'success', title: setting ? 'Password set' : 'Password updated', description: 'Other sessions were signed out.' });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Password" description={setting ? 'You sign in with Google. Set a password to sign in with your email too.' : 'Use a long, unique password.'}>
      <div className="grid gap-4 sm:grid-cols-3">
        {!setting && (
          <Field label="Current password" htmlFor="pw-current">
            <input id="pw-current" className="input" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          </Field>
        )}
        <Field label="New password" htmlFor="pw-next">
          <input id="pw-next" className="input" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
        </Field>
        <Field label="Confirm new password" htmlFor="pw-confirm">
          <input id="pw-confirm" className="input" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
        </Field>
      </div>
      <div className="mt-5 flex items-center justify-between gap-4">
        <p className="text-xs text-danger-400">{error ?? hint}</p>
        <Button onClick={change} loading={busy} disabled={(!setting && !pw.current) || !pw.next || pw.next !== pw.confirm || !!hint}>
          {setting ? 'Set password' : 'Update password'}
        </Button>
      </div>
    </Panel>
  );
}

/** Setup: QR code → first code → recovery codes (shown once). */
function EnableTwoFactor({ onClose }: { onClose: () => void }) {
  const { refreshUser } = useAuth();
  const toast = useToast();
  const setup = useApi<TwoFactorSetupResponse>(() => api.account.setupTwoFactor(), []);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);

  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.account.enableTwoFactor(code.replace(/\s/g, ''));
      setCodes(res.recoveryCodes);
      await refreshUser();
      toast({ kind: 'success', title: 'Two-factor enabled' });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (codes) {
    return (
      <Modal
        open
        onClose={onClose}
        title="Save your recovery codes"
        description="Each code signs you in once if you lose your authenticator. They won’t be shown again."
        footer={
          <>
            <Button variant="outline" icon={<Download className="h-4 w-4" />} onClick={() => downloadTextFile('digitalycloud-recovery-codes.txt', codes.join('\n'))}>
              Download
            </Button>
            <Button onClick={onClose}>I saved them</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/[0.07] bg-[#05070D] p-4 font-mono text-sm text-white">
          {codes.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <button type="button" onClick={() => copyToClipboard(codes.join('\n'))} className="mt-3 flex items-center gap-1.5 text-xs text-brand-300 hover:text-brand-200">
          <Copy className="h-3.5 w-3.5" /> Copy all
        </button>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title="Set up two-factor authentication"
      description="Scan the QR code with an authenticator app (1Password, Google Authenticator, Authy…), then enter the 6-digit code."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={enable} loading={busy} disabled={code.replace(/\s/g, '').length < 6 || !setup.data}>
            Enable
          </Button>
        </>
      }
    >
      {setup.error ? (
        <p className="text-sm text-danger-400">{setup.error}</p>
      ) : !setup.data ? (
        <Skeleton className="mx-auto h-44 w-44" />
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          {/* eslint-disable-next-line @next/next/no-img-element -- data: URL generated by the API */}
          <img src={setup.data.qrCodeDataUrl} alt="Authenticator QR code" width={176} height={176} className="rounded-xl bg-white p-2" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-ink-400">Can’t scan? Enter this key manually:</p>
            <p className="mt-1 break-all font-mono text-sm text-white">{setup.data.secret}</p>
            <label className="label mt-4" htmlFor="totp-code">
              6-digit code
            </label>
            <input
              id="totp-code"
              className="input font-mono tracking-[0.3em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, '').slice(0, 8))}
              autoFocus
            />
            {error && <p className="mt-2 text-xs text-danger-400">{error}</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}

function DisableTwoFactor({ onClose }: { onClose: () => void }) {
  const { user, refreshUser } = useAuth();
  const toast = useToast();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const withPassword = user?.hasPassword ?? false;

  const disable = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.account.disableTwoFactor(withPassword ? { password: value } : { code: value.replace(/\s/g, '') });
      await refreshUser();
      toast({ kind: 'warning', title: 'Two-factor disabled' });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      size="sm"
      title="Turn off two-factor?"
      description={withPassword ? 'Confirm with your password.' : 'Confirm with a code from your authenticator or a recovery code.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={disable} loading={busy} disabled={!value}>
            Turn off
          </Button>
        </>
      }
    >
      <input
        className="input font-mono"
        type={withPassword ? 'password' : 'text'}
        autoComplete={withPassword ? 'current-password' : 'one-time-code'}
        aria-label={withPassword ? 'Password' : 'Code'}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus
      />
      {error && <p className="mt-2 text-xs text-danger-400">{error}</p>}
    </Modal>
  );
}

function TwoFactorPanel() {
  const { user } = useAuth();
  const [dialog, setDialog] = useState<'enable' | 'disable' | null>(null);
  if (!user) return null;
  const on = user.twoFactorEnabled;
  return (
    <Panel title="Two-factor authentication" description="Require a code from your authenticator app at sign-in.">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Badge tone={on ? 'success' : 'warning'}>{on ? 'Enabled' : 'Disabled'}</Badge>
          <span className="text-sm text-ink-300">Authenticator app</span>
        </div>
        <Switch checked={on} onChange={(v) => setDialog(v ? 'enable' : 'disable')} label="Two-factor authentication" />
      </div>
      {dialog === 'enable' && <EnableTwoFactor onClose={() => setDialog(null)} />}
      {dialog === 'disable' && <DisableTwoFactor onClose={() => setDialog(null)} />}
    </Panel>
  );
}

const isMobile = (device: string) => /iphone|android|ipad|mobile/i.test(device);

function SessionsPanel() {
  const toast = useToast();
  const sessions = useApi(() => api.account.sessions(), []);
  const [busy, setBusy] = useState<string | null>(null);

  const revoke = async (id: string) => {
    setBusy(id);
    try {
      await api.account.revokeSession(id);
      sessions.setData((list) => (list ?? []).filter((x) => x.id !== id));
      toast({ kind: 'success', title: 'Session signed out' });
    } catch (e) {
      toast({ kind: 'error', title: 'Could not sign out that session', description: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel title="Active sessions" description="Devices currently signed in to your account." bodyClass="p-0">
      {sessions.loading && !sessions.data ? (
        <div className="space-y-3 p-5">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : sessions.error ? (
        <p className="px-5 py-8 text-center text-sm text-danger-400">{sessions.error}</p>
      ) : (
        <div className="divide-y divide-white/[0.05]">
          {(sessions.data ?? []).map((s) => {
            const Icon = isMobile(s.device) ? Smartphone : Laptop;
            return (
              <div key={s.id} className="flex items-center gap-3 px-5 py-3.5">
                <Icon className="h-5 w-5 text-ink-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white">{s.device}</p>
                  <p className="text-xs text-ink-500">
                    {s.location ? `${s.location} · ` : ''}Active {timeAgo(s.lastActiveAt)} · signed in {timeAgo(s.createdAt)}
                  </p>
                </div>
                {s.current ? (
                  <Badge tone="success">This device</Badge>
                ) : (
                  <Button variant="ghost" size="sm" loading={busy === s.id} onClick={() => revoke(s.id)}>
                    Sign out
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

export function SecurityTab() {
  return (
    <div className="space-y-4">
      <PasswordPanel />
      <TwoFactorPanel />
      <SessionsPanel />
    </div>
  );
}
