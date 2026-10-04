'use client';

import { useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Bell, KeyRound, Laptop, RotateCcw, Shield, Smartphone, Trash2, User, Users } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/providers/auth-provider';
import { useCloud } from '@/providers/cloud-provider';
import { useToast } from '@/providers/toast-provider';
import { cn } from '@/lib/utils';
import { isValidEmail } from '@/lib/validation';
import { ApiKeysPanel } from './api-keys-panel';
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

function ProfileTab() {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const dirty = name !== user.name || email !== user.email;
  const valid = name.trim().length >= 2 && isValidEmail(email);

  const save = async () => {
    setBusy(true);
    try {
      await updateProfile({ name: name.trim(), email: email.trim() });
      toast({ kind: 'success', title: 'Profile updated' });
    } catch {
      toast({ kind: 'error', title: 'Could not update profile' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Profile" description="How you appear across DIGITALY products.">
      <div className="mb-6 flex items-center gap-4">
        <Avatar initials={user.avatarInitials} size={56} />
        <div>
          <p className="font-medium text-white">{user.name}</p>
          <p className="text-sm text-ink-400">One DIGITALY account for Cloud and every other DIGITALY service.</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="profile-name">
          <input id="profile-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email" htmlFor="profile-email" hint="Used for sign-in, invoices and alerts.">
          <input id="profile-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Language" htmlFor="profile-language">
          <select id="profile-language" className="input" defaultValue="en">
            <option value="en">English</option>
            <option value="fr">Français</option>
          </select>
        </Field>
        <Field label="Timezone" htmlFor="profile-timezone">
          <select id="profile-timezone" className="input" defaultValue="paris">
            <option value="paris">Europe/Paris (UTC+2)</option>
            <option value="london">Europe/London (UTC+1)</option>
          </select>
        </Field>
      </div>
      <div className="mt-6 flex justify-end">
        <Button onClick={save} loading={busy} disabled={!dirty || !valid}>
          Save changes
        </Button>
      </div>
    </Panel>
  );
}

const SESSIONS = [
  { id: 's1', device: 'MacBook Pro · Chrome', place: 'Lyon, France', current: true, icon: Laptop },
  { id: 's2', device: 'iPhone 15 · Safari', place: 'Lyon, France', current: false, icon: Smartphone },
  { id: 's3', device: 'Windows · Firefox', place: 'Paris, France', current: false, icon: Laptop },
];

function SecurityTab() {
  const toast = useToast();
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [twoFa, setTwoFa] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState(SESSIONS);
  const err = pw.next && pw.next.length < 8 ? 'At least 8 characters.' : pw.confirm && pw.confirm !== pw.next ? "Passwords don't match." : null;

  const change = async () => {
    setBusy(true);
    // No backend yet: simulate the request round-trip.
    await new Promise((r) => setTimeout(r, 700));
    setBusy(false);
    setPw({ current: '', next: '', confirm: '' });
    toast({ kind: 'success', title: 'Password updated', description: 'Other sessions will need to sign in again.' });
  };

  return (
    <div className="space-y-4">
      <Panel title="Password" description="Use a long, unique password.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Current password" htmlFor="pw-current">
            <input id="pw-current" className="input" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          </Field>
          <Field label="New password" htmlFor="pw-next">
            <input id="pw-next" className="input" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          </Field>
          <Field label="Confirm new password" htmlFor="pw-confirm">
            <input id="pw-confirm" className="input" type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
          </Field>
        </div>
        <div className="mt-5 flex items-center justify-between gap-4">
          <p className="text-xs text-danger-400">{err}</p>
          <Button onClick={change} loading={busy} disabled={!pw.current || !pw.next || pw.next !== pw.confirm || !!err}>
            Update password
          </Button>
        </div>
      </Panel>

      <Panel title="Two-factor authentication" description="Require a code from your authenticator app at sign-in.">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Badge tone={twoFa ? 'success' : 'warning'}>{twoFa ? 'Enabled' : 'Disabled'}</Badge>
            <span className="text-sm text-ink-300">Authenticator app</span>
          </div>
          <Switch
            checked={twoFa}
            onChange={(v) => {
              setTwoFa(v);
              toast({ kind: v ? 'success' : 'warning', title: v ? 'Two-factor enabled' : 'Two-factor disabled' });
            }}
            label="Two-factor authentication"
          />
        </div>
      </Panel>

      <Panel title="Active sessions" description="Devices currently signed in to your account." bodyClass="p-0">
        <div className="divide-y divide-white/[0.05]">
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-5 py-3.5">
              <s.icon className="h-5 w-5 text-ink-400" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white">{s.device}</p>
                <p className="text-xs text-ink-500">{s.place}</p>
              </div>
              {s.current ? (
                <Badge tone="success">This device</Badge>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSessions((l) => l.filter((x) => x.id !== s.id));
                    toast({ kind: 'success', title: 'Session signed out' });
                  }}
                >
                  Sign out
                </Button>
              )}
            </div>
          ))}
        </div>
      </Panel>
    </div>
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
  const [prefs, setPrefs] = useState({ deploySuccess: false, deployFail: true, crash: true, usage: true, billing: true, product: false });
  return (
    <Panel title="Email notifications" description="Choose what we email you about." bodyClass="p-0">
      <div className="divide-y divide-white/[0.05]">
        {NOTIFICATION_ROWS.map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-4 px-5 py-4">
            <div>
              <p className="text-sm text-white">{r.label}</p>
              <p className="text-xs text-ink-400">{r.desc}</p>
            </div>
            <Switch
              checked={prefs[r.key]}
              onChange={(v) => {
                setPrefs((p) => ({ ...p, [r.key]: v }));
                toast({ kind: 'success', title: 'Preferences saved' });
              }}
              label={r.label}
            />
          </div>
        ))}
      </div>
    </Panel>
  );
}

function DangerTab() {
  const { user, logout } = useAuth();
  const { resetDemo } = useCloud();
  const toast = useToast();
  const router = useRouter();
  const [confirm, setConfirm] = useState<'reset' | 'delete' | null>(null);

  return (
    <div className="card border-danger-500/20">
      <div className="border-b border-danger-500/15 px-5 py-4">
        <h3 className="text-sm font-medium text-danger-400">Danger Zone</h3>
        <p className="mt-0.5 text-xs text-ink-400">These actions cannot be undone.</p>
      </div>
      <div className="divide-y divide-white/[0.05]">
        <div className="flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-medium text-white">Reset demo data</p>
            <p className="text-xs text-ink-400">Restore SyncBot, CommunityAPI and DiscordNotifier to their original state.</p>
          </div>
          <Button variant="outline" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setConfirm('reset')}>
            Reset data
          </Button>
        </div>
        <div className="flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-medium text-white">Delete account</p>
            <p className="text-xs text-ink-400">Permanently stops all services and deletes your data.</p>
          </div>
          <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirm('delete')}>
            Delete account
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirm === 'reset'}
        onClose={() => setConfirm(null)}
        tone="primary"
        title="Reset demo data?"
        description="All services, deployments and keys will return to their initial state."
        confirmLabel="Reset"
        onConfirm={async () => {
          await resetDemo();
          toast({ kind: 'success', title: 'Demo data restored' });
        }}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onClose={() => setConfirm(null)}
        title="Delete your account?"
        description="Every service will be stopped and all data removed within 24 hours."
        confirmLabel="Delete account"
        confirmText={user?.email ?? 'delete'}
        onConfirm={async () => {
          router.prefetch('/');
          await resetDemo();
          await logout();
          toast({ kind: 'info', title: 'Account deleted', description: 'Sorry to see you go.' });
          router.push('/');
        }}
      />
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
