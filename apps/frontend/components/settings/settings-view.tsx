'use client';

import { useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Bell, KeyRound, Shield, Trash2, User, Users } from 'lucide-react';
import { DEFAULT_NOTIFICATION_PREFERENCES, type Language, type NotificationPreferences, type UpdateProfileInput } from '@digitalycloud/shared';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useApi } from '@/hooks/use-api';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/providers/toast-provider';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { isValidEmail } from '@/lib/validation';
import { ApiKeysPanel } from './api-keys-panel';
import { SecurityTab } from './security-tab';
import { TeamPanel } from './team-panel';

const TABS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'api', label: 'API Keys', icon: KeyRound },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'danger', label: 'Danger Zone', icon: AlertTriangle },
] as const;

type TabId = (typeof TABS)[number]['id'];

const isTab = (v: string | null): v is TabId => TABS.some((t) => t.id === v);

function Field({ label, htmlFor, children, hint }: { label: string; htmlFor?: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

/** Common IANA zones; the user's current zone is always listed. Legacy UI values map to IANA names. */
const COMMON_TIMEZONES = ['Europe/Paris', 'Europe/London', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Amsterdam', 'Europe/Brussels', 'Europe/Zurich', 'America/Montreal', 'America/New_York', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'UTC'];
const LEGACY_TIMEZONES: Record<string, string> = { paris: 'Europe/Paris', london: 'Europe/London' };
const toIana = (tz: string) => LEGACY_TIMEZONES[tz] ?? tz;

function offsetLabel(tz: string) {
  try {
    const part = new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName');
    return part ? `${tz} (${part.value.replace('GMT', 'UTC')})` : tz;
  } catch {
    return tz;
  }
}

function ProfileTab() {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [language, setLanguage] = useState<Language>(user?.language ?? 'en');
  const [timezone, setTimezone] = useState(toIana(user?.timezone ?? 'Europe/Paris'));
  const [currentPassword, setCurrentPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;
  const emailChanged = email.trim().toLowerCase() !== user.email.toLowerCase();
  const dirty = name !== user.name || emailChanged || language !== user.language || timezone !== user.timezone;
  const valid = name.trim().length >= 2 && isValidEmail(email.trim()) && (!emailChanged || !user.hasPassword || currentPassword.length > 0);
  const zones = COMMON_TIMEZONES.includes(timezone) ? COMMON_TIMEZONES : [timezone, ...COMMON_TIMEZONES];

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const patch: UpdateProfileInput = {};
      if (name.trim() !== user.name) patch.name = name.trim();
      if (language !== user.language) patch.language = language;
      if (timezone !== user.timezone) patch.timezone = timezone;
      if (emailChanged) {
        patch.email = email.trim();
        if (user.hasPassword) patch.currentPassword = currentPassword;
      }
      const updated = await updateProfile(patch);
      setCurrentPassword('');
      setEmail(updated.email);
      toast(
        emailChanged
          ? { kind: 'info', title: 'Confirm your new email', description: `We sent a link to ${updated.pendingEmail ?? email.trim()}. Your sign-in email changes once you open it.` }
          : { kind: 'success', title: 'Profile updated' }
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setResending(true);
    try {
      await api.auth.resendVerification();
      toast({ kind: 'success', title: 'Verification email sent' });
    } catch (e) {
      toast({ kind: 'error', title: 'Could not send the email', description: errorMessage(e) });
    } finally {
      setResending(false);
    }
  };

  return (
    <Panel title="Profile" description="How you appear across DIGITALY products.">
      <div className="mb-6 flex items-center gap-4">
        <Avatar initials={user.avatarInitials} size={56} />
        <div>
          <p className="flex items-center gap-2 font-medium text-white">
            {user.name}
            {user.emailVerified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Email not verified</Badge>}
          </p>
          <p className="text-sm text-ink-400">One DIGITALY account for Cloud and every other DIGITALY service.</p>
        </div>
      </div>
      {(user.pendingEmail || !user.emailVerified) && (
        <div className="mb-5 flex flex-col gap-3 rounded-xl border border-warning-500/25 bg-warning-500/[0.06] px-4 py-3 text-sm text-ink-200 sm:flex-row sm:items-center">
          <span className="flex-1">
            {user.pendingEmail ? (
              <>
                Waiting for you to confirm <span className="text-white">{user.pendingEmail}</span>. Until then you sign in with {user.email}.
              </>
            ) : (
              'Confirm your email address to receive alerts and invoices.'
            )}
          </span>
          <Button size="sm" variant="outline" loading={resending} onClick={resend}>
            Resend link
          </Button>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="profile-name">
          <input id="profile-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email" htmlFor="profile-email" hint="Used for sign-in, invoices and alerts.">
          <input id="profile-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {emailChanged && user.hasPassword && (
          <Field label="Current password" htmlFor="profile-password" hint="Required to change your sign-in email.">
            <input id="profile-password" className="input" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </Field>
        )}
        <Field label="Language" htmlFor="profile-language">
          <select id="profile-language" className="input" value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
            <option value="en">English</option>
            <option value="fr">Français</option>
          </select>
        </Field>
        <Field label="Timezone" htmlFor="profile-timezone">
          <select id="profile-timezone" className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {offsetLabel(z)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="mt-6 flex items-center justify-between gap-4">
        <p className="text-xs text-danger-400">{error}</p>
        <Button onClick={save} loading={busy} disabled={!dirty || !valid}>
          Save changes
        </Button>
      </div>
    </Panel>
  );
}

const NOTIFICATION_ROWS = [
  { key: 'deployFail', label: 'Failed deployments', desc: 'When a build or health check fails.' },
  { key: 'deploySuccess', label: 'Successful deployments', desc: 'Every time a new version goes live.' },
  { key: 'crash', label: 'Service crashes', desc: 'When a service exits unexpectedly.' },
  { key: 'usage', label: 'Usage alerts', desc: 'When a service passes 80% of its RAM or storage.' },
  { key: 'billing', label: 'Billing', desc: 'Invoices and payment issues.' },
  { key: 'product', label: 'Product updates', desc: 'New features from DIGITALY.' },
] as const;

function NotificationsTab() {
  const toast = useToast();
  const prefs = useApi(() => api.account.preferences(), []);

  const set = async (key: keyof NotificationPreferences, v: boolean) => {
    const before = prefs.data;
    prefs.setData((p) => ({ ...(p ?? DEFAULT_NOTIFICATION_PREFERENCES), [key]: v }));
    try {
      prefs.setData(await api.account.updatePreferences({ [key]: v }));
      toast({ kind: 'success', title: 'Preferences saved' });
    } catch (e) {
      if (before) prefs.setData(before);
      toast({ kind: 'error', title: 'Preferences not saved', description: errorMessage(e) });
    }
  };

  return (
    <Panel title="Email notifications" description="Choose what we email you about." bodyClass="p-0">
      {prefs.error && !prefs.data ? (
        <p className="px-5 py-8 text-center text-sm text-danger-400">{prefs.error}</p>
      ) : (
        <div className="divide-y divide-white/[0.05]">
          {NOTIFICATION_ROWS.map((r) => (
            <div key={r.key} className="flex items-center justify-between gap-4 px-5 py-4">
              <div>
                <p className="text-sm text-white">{r.label}</p>
                <p className="text-xs text-ink-400">{r.desc}</p>
              </div>
              {prefs.data ? <Switch checked={prefs.data[r.key]} onChange={(v) => set(r.key, v)} label={r.label} /> : <Skeleton className="h-6 w-11" />}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const { user, logout } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [typed, setTyped] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.account.deleteAccount({ confirmEmail: typed.trim(), ...(user.hasPassword ? { currentPassword: password } : {}) });
      router.prefetch('/');
      await logout().catch(() => {});
      toast({ kind: 'info', title: 'Account scheduled for deletion', description: 'Your services are being stopped and your data removed. We’ll email you when it’s done.' });
      router.push('/');
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      size="sm"
      title="Delete your account?"
      description="All services in teams you own are stopped and deleted, subscriptions are canceled and your data is removed. Teams owned by others keep their data."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={remove} loading={busy} disabled={typed.trim().toLowerCase() !== user.email.toLowerCase() || (user.hasPassword && !password)}>
            Delete account
          </Button>
        </>
      }
    >
      <label className="label" htmlFor="delete-email">
        Type <span className="font-mono text-ink-100">{user.email}</span> to confirm
      </label>
      <input id="delete-email" className="input font-mono" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
      {user.hasPassword && (
        <>
          <label className="label mt-4" htmlFor="delete-password">
            Current password
          </label>
          <input id="delete-password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </>
      )}
      {error && <p className="mt-3 text-sm text-danger-400">{error}</p>}
    </Modal>
  );
}

function DangerTab() {
  const [confirm, setConfirm] = useState(false);

  return (
    <div className="card border-danger-500/20">
      <div className="border-b border-danger-500/15 px-5 py-4">
        <h3 className="text-sm font-medium text-danger-400">Danger Zone</h3>
        <p className="mt-0.5 text-xs text-ink-400">These actions cannot be undone.</p>
      </div>
      <div className="divide-y divide-white/[0.05]">
        <div className="flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-medium text-white">Delete account</p>
            <p className="text-xs text-ink-400">Permanently stops all services you own and deletes your data.</p>
          </div>
          <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirm(true)}>
            Delete account
          </Button>
        </div>
      </div>
      {confirm && <DeleteAccountDialog onClose={() => setConfirm(false)} />}
    </div>
  );
}

const TAB_CONTENT: Record<TabId, () => ReactNode> = {
  profile: () => <ProfileTab />,
  security: () => <SecurityTab />,
  notifications: () => <NotificationsTab />,
  api: () => <ApiKeysPanel />,
  team: () => <TeamPanel />,
  danger: () => <DangerTab />,
};

export function SettingsView() {
  const params = useSearchParams();
  const raw = params.get('tab');
  const tab: TabId = isTab(raw) ? raw : 'profile';
  const setTab = (id: TabId) => window.history.replaceState(null, '', id === 'profile' ? '/settings' : `/settings?tab=${id}`);

  return (
    <>
      <PageHeader title="Settings" description="Manage your account, security and team." />
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:px-0" aria-label="Settings sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
              className={cn(
                'flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition',
                tab === t.id
                  ? 'bg-white/[0.07] text-white'
                  : t.id === 'danger'
                    ? 'text-danger-400/80 hover:bg-danger-500/[0.06] hover:text-danger-400'
                    : 'text-ink-400 hover:bg-white/[0.04] hover:text-ink-100'
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </nav>
        <div key={tab} className="min-w-0 animate-fade-up">
          {TAB_CONTENT[tab]()}
        </div>
      </div>
    </>
  );
}
