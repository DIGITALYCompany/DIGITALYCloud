'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { ConfirmDialog, Modal } from '@/components/ui/modal';
import { CardSkeleton } from '@/components/ui/skeleton';
import { useToast } from '@/providers/toast-provider';
import { api } from '@/lib/api';
import { copyToClipboard } from '@/lib/browser';
import { formatDate, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ApiKey } from '@/lib/types';

export function ApiKeysPanel() {
  const toast = useToast();
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [error, setError] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<ApiKey['scope']>('read');
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);

  const fetchKeys = useCallback(() => {
    api.apiKeys
      .list()
      .then(setKeys)
      .catch(() => setError(true));
  }, []);

  useEffect(fetchKeys, [fetchKeys]);

  const retry = () => {
    setError(false);
    setKeys(null);
    fetchKeys();
  };

  const create = async () => {
    setCreating(true);
    try {
      const res = await api.apiKeys.create(name.trim(), scope);
      setKeys((k) => [res.key, ...(k ?? [])]);
      setSecret(res.secret);
      setCreateOpen(false);
      setName('');
    } catch {
      toast({ kind: 'error', title: 'Could not create key' });
    } finally {
      setCreating(false);
    }
  };

  const copy = (text: string) => {
    copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
    toast({ kind: 'success', title: 'Copied to clipboard' });
  };

  return (
    <Panel
      title="API keys"
      description="Use these to call the DIGITALYCloud API from CI or scripts."
      bodyClass="p-0"
      action={
        <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
          Create key
        </Button>
      }
    >
      {error ? (
        <div className="p-5">
          <ErrorState message="Could not load your API keys." onRetry={retry} />
        </div>
      ) : !keys ? (
        <div className="p-5">
          <CardSkeleton rows={2} />
        </div>
      ) : keys.length === 0 ? (
        <div className="p-5">
          <EmptyState icon={<KeyRound className="h-6 w-6" />} title="No API keys" description="Create a key to automate deployments." />
        </div>
      ) : (
        <div className="divide-y divide-white/[0.05]">
          {keys.map((k) => (
            <div key={k.id} className="flex flex-col gap-3 px-5 py-4 transition hover:bg-white/[0.02] sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">{k.name}</span>
                  <Badge tone={k.scope === 'full' ? 'accent' : 'neutral'}>{k.scope === 'full' ? 'Full access' : 'Read only'}</Badge>
                </div>
                <p className="mt-1 font-mono text-xs text-ink-400">{k.prefix}••••••••••••</p>
              </div>
              <div className="text-xs text-ink-500 sm:text-right">
                <p>Created {formatDate(k.createdAt)}</p>
                <p>{k.lastUsed ? `Last used ${timeAgo(k.lastUsed)}` : 'Never used'}</p>
              </div>
              <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={() => setRevoking(k)} className="self-start sm:self-center">
                Revoke
              </Button>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create API key"
        description="Give the key a name so you know where it's used."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={create} loading={creating} disabled={name.trim().length < 2}>
              Create key
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label" htmlFor="api-key-name">
              Name
            </label>
            <input id="api-key-name" className="input" placeholder="e.g. GitHub Actions" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <p className="label">Permissions</p>
            <div className="grid grid-cols-2 gap-2">
              {(['read', 'full'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={scope === s}
                  onClick={() => setScope(s)}
                  className={cn('rounded-xl border p-3 text-left transition', scope === s ? 'border-brand-500/60 bg-brand-500/[0.07]' : 'border-white/[0.08] hover:border-white/20')}
                >
                  <p className="text-sm text-white">{s === 'read' ? 'Read only' : 'Full access'}</p>
                  <p className="text-xs text-ink-400">{s === 'read' ? 'View services and metrics' : 'Deploy, restart and edit'}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!secret}
        onClose={() => setSecret(null)}
        title="Save your API key"
        description="This is the only time the full key is shown. Store it somewhere safe."
        footer={<Button onClick={() => setSecret(null)}>Done</Button>}
      >
        <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#05070D] p-3">
          <code className="min-w-0 flex-1 break-all font-mono text-sm text-ink-100">{secret}</code>
          <button onClick={() => secret && copy(secret)} className="rounded-lg p-2 text-ink-300 hover:bg-white/[0.06] hover:text-white" aria-label="Copy key">
            {copied ? <Check className="h-4 w-4 text-success-400" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!revoking}
        onClose={() => setRevoking(null)}
        title={`Revoke "${revoking?.name}"?`}
        description="Anything using this key will immediately lose access."
        confirmLabel="Revoke key"
        onConfirm={async () => {
          if (!revoking) return;
          await api.apiKeys.revoke(revoking.id);
          setKeys((k) => (k ?? []).filter((x) => x.id !== revoking.id));
          toast({ kind: 'success', title: 'API key revoked' });
        }}
      />
    </Panel>
  );
}
