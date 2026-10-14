'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Circle, Copy, Globe2, RefreshCw, Trash2, XCircle } from 'lucide-react';
import { MAX_CUSTOM_DOMAINS, planAllowsCustomDomains, type CustomDomainDto, type DnsRecordDto } from '@digitalycloud/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/modal';
import { useApi } from '@/hooks/use-api';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { useCloud } from '@/providers/cloud-provider';
import { useToast } from '@/providers/toast-provider';
import type { Service } from '@/lib/types';

const STATUS = {
  pending: { tone: 'warning', label: 'Waiting for DNS' },
  active: { tone: 'success', label: 'Live' },
  failed: { tone: 'danger', label: 'Not verified' },
} as const;

/** Pending domains are re-read while the page is open (the API checks DNS in the background). */
const POLL_MS = 15_000;

function RecordRow({ r }: { r: DnsRecordDto }) {
  const toast = useToast();
  const copy = (v: string) => {
    void navigator.clipboard.writeText(v).then(
      () => toast({ kind: 'success', title: 'Copied to clipboard' }),
      () => toast({ kind: 'error', title: 'Could not copy' })
    );
  };
  return (
    <tr className="border-t border-white/[0.06] align-top">
      <td className="py-2.5 pr-3">
        {r.ok === true ? <CheckCircle2 className="h-4 w-4 text-success-400" aria-label="Found" /> : r.ok === false ? <XCircle className="h-4 w-4 text-danger-400" aria-label="Missing" /> : <Circle className="h-4 w-4 text-ink-500" aria-label="Not checked yet" />}
      </td>
      <td className="py-2.5 pr-3 font-mono text-xs text-white">{r.type}</td>
      {[r.name, r.value].map((v, i) => (
        <td key={i} className="py-2.5 pr-3">
          <button type="button" onClick={() => copy(v)} className="group flex max-w-full items-start gap-1.5 text-left font-mono text-xs text-ink-200 hover:text-white" title="Copy">
            <span className="break-all">{v}</span>
            <Copy className="mt-0.5 h-3 w-3 shrink-0 opacity-0 transition group-hover:opacity-100" />
          </button>
        </td>
      ))}
    </tr>
  );
}

function DomainCard({ d, writable, onChange, onRemove }: { d: CustomDomainDto; writable: boolean; onChange: (d: CustomDomainDto) => void; onRemove: () => void }) {
  const toast = useToast();
  const [checking, setChecking] = useState(false);
  const status = STATUS[d.status];
  const verify = async () => {
    setChecking(true);
    try {
      const next = await api.services.domains.verify(d.serviceId, d.id);
      onChange(next);
      if (next.status === 'active') toast({ kind: 'success', title: `${next.hostname} is connected` });
    } catch (e) {
      toast({ kind: 'error', title: 'Check failed', description: errorMessage(e) });
    } finally {
      setChecking(false);
    }
  };
  return (
    <div className="rounded-xl border border-white/[0.07] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Globe2 className="h-4 w-4 text-ink-400" />
        {d.status === 'active' ? (
          <a href={`https://${d.hostname}`} target="_blank" rel="noopener noreferrer" className="font-mono text-sm text-white hover:text-brand-200">
            {d.hostname}
          </a>
        ) : (
          <span className="font-mono text-sm text-white">{d.hostname}</span>
        )}
        <Badge tone={status.tone}>{status.label}</Badge>
        <div className="ml-auto flex gap-2">
          {writable && d.status !== 'active' && (
            <Button size="sm" variant="outline" loading={checking} icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={verify}>
              Verify
            </Button>
          )}
          {writable && (
            <Button size="sm" variant="outline" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={onRemove} aria-label={`Remove ${d.hostname}`}>
              Remove
            </Button>
          )}
        </div>
      </div>
      {d.message && <p className={cn('mt-3 text-xs', d.status === 'active' ? 'text-ink-300' : 'text-warning-400')}>{d.message}</p>}
      {d.status !== 'active' && (
        <>
          <p className="mt-3 text-xs text-ink-400">Create these records at your domain provider (some providers want only the part before your domain in the Name field):</p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-ink-500">
                  <th className="w-6 pb-1.5" />
                  <th className="pb-1.5 pr-3 font-medium">Type</th>
                  <th className="pb-1.5 pr-3 font-medium">Name</th>
                  <th className="pb-1.5 pr-3 font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {d.records.map((r) => (
                  <RecordRow key={r.purpose} r={r} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-ink-500">DNS changes can take a few minutes to an hour. We keep checking automatically.</p>
        </>
      )}
    </div>
  );
}

/** Custom domains for services that serve HTTP (paid plans). */
export function DomainsSection({ service }: { service: Service }) {
  const { can } = useAuth();
  const { refreshService } = useCloud();
  const toast = useToast();
  const writable = can('services.update');
  const allowed = planAllowsCustomDomains(service.plan);
  const list = useApi(() => api.services.domains.list(service.id), [service.id]);
  const domains = list.data ?? [];
  const [hostname, setHostname] = useState('');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<CustomDomainDto | null>(null);

  const pending = domains.some((d) => d.status === 'pending');
  const { reload } = list;
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => void reload(), POLL_MS);
    return () => clearInterval(t);
  }, [pending, reload]);

  const replace = (d: CustomDomainDto) => {
    list.setData((prev) => (prev ?? []).map((x) => (x.id === d.id ? d : x)));
    if (d.status === 'active') void refreshService(service.id).catch(() => {});
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!hostname.trim()) return;
    setAdding(true);
    try {
      const d = await api.services.domains.add(service.id, hostname.trim());
      list.setData((prev) => [...(prev ?? []), d]);
      setHostname('');
      if (d.status === 'active') void refreshService(service.id).catch(() => {});
    } catch (err) {
      toast({ kind: 'error', title: 'Domain not added', description: errorMessage(err) });
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="card grid gap-6 p-6 lg:grid-cols-[280px_1fr]">
      <div>
        <h3 className="font-medium text-white">Custom domains</h3>
        <p className="mt-1 text-sm text-ink-400">Serve this service on your own domain. HTTPS certificates are issued and renewed automatically.</p>
      </div>
      <div className="space-y-3">
        {!allowed && (
          <p className="rounded-xl border border-white/[0.08] px-4 py-3 text-sm text-ink-300">
            Custom domains are available on paid plans. {domains.length > 0 && 'Your saved domains receive traffic again after an upgrade.'}
          </p>
        )}
        {list.error && <p className="text-sm text-danger-400">{list.error}</p>}
        {domains.map((d) => (
          <DomainCard key={d.id} d={d} writable={writable} onChange={replace} onRemove={() => setRemoving(d)} />
        ))}
        {writable && allowed && domains.length < MAX_CUSTOM_DOMAINS && (
          <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
            <input className="input flex-1 font-mono" placeholder="www.example.com" value={hostname} onChange={(e) => setHostname(e.target.value)} aria-label="Domain" />
            <Button type="submit" loading={adding} disabled={!hostname.trim()}>
              Add domain
            </Button>
          </form>
        )}
      </div>
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Remove this domain?"
        description={removing ? `${removing.hostname} stops serving this service right away. You can add it again later.` : ''}
        confirmLabel="Remove domain"
        onConfirm={async () => {
          if (!removing) return;
          await api.services.domains.remove(service.id, removing.id);
          list.setData((prev) => (prev ?? []).filter((x) => x.id !== removing.id));
          if (removing.status === 'active') await refreshService(service.id).catch(() => {});
        }}
      />
    </div>
  );
}
