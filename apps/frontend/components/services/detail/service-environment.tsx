'use client';

import { useState } from 'react';
import { Copy, Eye, EyeOff, KeyRound, Lock, Pencil, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog, Modal } from '@/components/ui/modal';
import { Switch } from '@/components/ui/switch';
import { Tooltip } from '@/components/ui/tooltip';
import { useCloud } from '@/providers/cloud-provider';
import { useToast } from '@/providers/toast-provider';
import { copyToClipboard } from '@/lib/browser';
import { uid } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { EnvVar } from '@/lib/types';
import { useService } from './service-shell';

const MASK = '••••••••••••';
const ROW_ACTION = 'rounded-lg p-2 text-ink-400 transition hover:bg-white/[0.06] hover:text-white';

export function ServiceEnvironment() {
  const service = useService();
  const { setEnv } = useCloud();
  const toast = useToast();
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<EnvVar | null>(null);
  const [deleting, setDeleting] = useState<EnvVar | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setRevealed((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const startEditing = (v: EnvVar) => {
    setError(null);
    setEditing(v);
  };

  const save = async () => {
    if (!editing) return;
    const key = editing.key.trim();
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) return setError('Keys must use uppercase letters, numbers and underscores.');
    if (service.env.some((v) => v.key === key && v.id !== editing.id)) return setError(`${key} already exists.`);
    setSaving(true);
    const exists = service.env.some((v) => v.id === editing.id);
    const next = exists ? service.env.map((v) => (v.id === editing.id ? { ...editing, key } : v)) : [...service.env, { ...editing, key }];
    try {
      await setEnv(service.id, next);
      toast({ kind: 'success', title: exists ? `${key} updated` : `${key} added`, description: 'Restart the service to apply changes.' });
      setEditing(null);
    } catch {
      setError('Could not save the variable. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl border border-warning-500/25 bg-warning-500/[0.06] p-4">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning-400" />
        <div>
          <p className="text-sm font-medium text-white">Never expose secret credentials in your source code.</p>
          <p className="mt-0.5 text-sm text-ink-300">Variables are encrypted at rest and only injected into your service at runtime.</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-400">{service.env.length} variables</p>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => startEditing({ id: uid('e'), key: '', value: '', secret: true })}>
          Add variable
        </Button>
      </div>

      {service.env.length === 0 ? (
        <EmptyState icon={<KeyRound className="h-6 w-6" />} title="No environment variables" description="Add tokens, database URLs and configuration values your app needs." />
      ) : (
        <div className="card divide-y divide-white/[0.05] overflow-hidden">
          {service.env.map((v) => {
            const show = !v.secret || revealed.has(v.id);
            return (
              <div key={v.id} className="flex flex-col gap-2 px-5 py-3.5 transition hover:bg-white/[0.02] sm:flex-row sm:items-center sm:gap-4">
                <div className="flex items-center gap-2 sm:w-64">
                  {v.secret && <Lock className="h-3.5 w-3.5 shrink-0 text-brand-300" />}
                  <span className="truncate font-mono text-sm text-white">{v.key}</span>
                </div>
                <span className={cn('min-w-0 flex-1 truncate font-mono text-sm', show ? 'text-ink-200' : 'tracking-widest text-ink-500')}>{show ? v.value : MASK}</span>
                <div className="flex gap-1">
                  {v.secret && (
                    <Tooltip label={show ? 'Hide' : 'Reveal'}>
                      <button onClick={() => toggle(v.id)} className={ROW_ACTION} aria-label={show ? `Hide ${v.key}` : `Reveal ${v.key}`}>
                        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </Tooltip>
                  )}
                  <Tooltip label="Copy value">
                    <button
                      onClick={() => {
                        copyToClipboard(v.value);
                        toast({ kind: 'info', title: `${v.key} copied` });
                      }}
                      className={ROW_ACTION}
                      aria-label={`Copy ${v.key}`}
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </Tooltip>
                  <Tooltip label="Edit">
                    <button onClick={() => startEditing({ ...v })} className={ROW_ACTION} aria-label={`Edit ${v.key}`}>
                      <Pencil className="h-4 w-4" />
                    </button>
                  </Tooltip>
                  <Tooltip label="Delete">
                    <button onClick={() => setDeleting(v)} className="rounded-lg p-2 text-ink-400 transition hover:bg-danger-500/10 hover:text-danger-400" aria-label={`Delete ${v.key}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </Tooltip>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing && service.env.some((v) => v.id === editing.id) ? 'Edit variable' : 'Add variable'}
        description={`Applies to ${service.name} in production.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving} disabled={!editing?.key}>
              Save variable
            </Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            {error && <p className="rounded-xl border border-danger-500/25 bg-danger-500/[0.08] px-3 py-2 text-sm text-danger-400">{error}</p>}
            <div>
              <label className="label" htmlFor="env-key">
                Key
              </label>
              <input
                id="env-key"
                className="input font-mono"
                placeholder="DISCORD_TOKEN"
                value={editing.key}
                onChange={(e) => setEditing({ ...editing, key: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })}
                autoFocus
              />
            </div>
            <div>
              <label className="label" htmlFor="env-value">
                Value
              </label>
              <textarea id="env-value" className="input min-h-[96px] resize-y font-mono" value={editing.value} onChange={(e) => setEditing({ ...editing, value: e.target.value })} />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/[0.07] p-3">
              <div>
                <p className="text-sm text-white">Secret</p>
                <p className="text-xs text-ink-400">Hide the value in the dashboard and logs.</p>
              </div>
              <Switch checked={editing.secret} onChange={(secret) => setEditing({ ...editing, secret })} label="Secret" />
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.key}?`}
        description="Your service may stop working if it depends on this variable."
        confirmLabel="Delete variable"
        onConfirm={async () => {
          if (!deleting) return;
          await setEnv(
            service.id,
            service.env.filter((v) => v.id !== deleting.id)
          );
          toast({ kind: 'success', title: `${deleting.key} deleted` });
        }}
      />
    </div>
  );
}
