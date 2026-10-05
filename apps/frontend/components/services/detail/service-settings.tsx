'use client';

import { useState, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useServiceActions } from '@/components/services/use-service-actions';
import { useCloud } from '@/providers/cloud-provider';
import { useToast } from '@/providers/toast-provider';
import { usePlanChange } from '@/components/services/change-plan-modal';
import { errorMessage, type UpdateServiceInput } from '@/lib/api';
import { NODE_VERSIONS, getServicePlans } from '@/lib/catalog';
import { formatMb } from '@/lib/format';
import { cn } from '@/lib/utils';
import { isSupportedNodeVersion, planAllowsAutoRestart, typeRequiresPort, type NodeVersion } from '@digitalycloud/shared';
import type { PlanId, Service } from '@/lib/types';
import { useService } from './service-shell';

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="card grid gap-6 p-6 lg:grid-cols-[280px_1fr]">
      <div>
        <h3 className="font-medium text-white">{title}</h3>
        <p className="mt-1 text-sm text-ink-400">{description}</p>
      </div>
      <div>{children}</div>
    </div>
  );
}

const formFrom = (s: Service) => ({ name: s.name, startCommand: s.startCommand, nodeVersion: s.nodeVersion as string, port: s.port ? String(s.port) : '', branch: s.branch ?? '' });

function GeneralSection({ service }: { service: Service }) {
  const { update } = useCloud();
  const toast = useToast();
  const [form, setForm] = useState(() => formFrom(service));
  const [saving, setSaving] = useState(false);
  const current = formFrom(service);
  const dirty = (Object.keys(form) as (keyof typeof form)[]).some((k) => form[k] !== current[k]);

  const save = async () => {
    if (form.name.trim().length < 2) return toast({ kind: 'error', title: 'Name is too short' });
    // Only changed fields are sent; the server validates each against the service type and source.
    const patch: UpdateServiceInput = {};
    if (form.name.trim() !== current.name) patch.name = form.name.trim();
    if (form.startCommand !== current.startCommand) patch.startCommand = form.startCommand;
    if (form.nodeVersion !== current.nodeVersion) patch.nodeVersion = form.nodeVersion as NodeVersion;
    if (form.port !== current.port) patch.port = form.port ? +form.port : null;
    if (form.branch !== current.branch) patch.branch = form.branch;
    setSaving(true);
    try {
      const updated = await update(service.id, patch);
      setForm(formFrom(updated));
      toast({ kind: 'success', title: 'Settings saved', description: updated.pendingChanges.settings ? 'Changes apply on the next deployment.' : undefined });
    } catch (e) {
      toast({ kind: 'error', title: 'Settings not saved', description: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title="General" description="Basic configuration for this service.">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="svc-name">
            Service name
          </label>
          <input id="svc-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="svc-branch">
            Branch
          </label>
          <input
            id="svc-branch"
            className="input font-mono"
            value={form.branch}
            placeholder={service.source === 'github' ? 'main' : 'Not used for this source'}
            onChange={(e) => setForm({ ...form, branch: e.target.value })}
            disabled={service.source !== 'github'}
          />
        </div>
        <div>
          <label className="label" htmlFor="svc-command">
            Start command
          </label>
          <input id="svc-command" className="input font-mono" value={form.startCommand} onChange={(e) => setForm({ ...form, startCommand: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="svc-port">
            Port
          </label>
          <input
            id="svc-port"
            className="input font-mono"
            value={form.port}
            placeholder={typeRequiresPort(service.type) ? '3000' : 'None'}
            onChange={(e) => setForm({ ...form, port: e.target.value.replace(/\D/g, '') })}
          />
        </div>
        <div>
          <label className="label" htmlFor="svc-node">
            Node.js version
          </label>
          <select id="svc-node" className="input" value={form.nodeVersion} onChange={(e) => setForm({ ...form, nodeVersion: e.target.value })} disabled={service.source === 'docker'}>
            {!isSupportedNodeVersion(current.nodeVersion) && (
              <option value={current.nodeVersion} disabled>
                {current.nodeVersion} (end of life)
              </option>
            )}
            {NODE_VERSIONS.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          {service.source === 'docker' && <p className="mt-1.5 text-xs text-ink-500">Docker images bring their own runtime.</p>}
          {service.source !== 'docker' && !isSupportedNodeVersion(current.nodeVersion) && <p className="mt-1.5 text-xs text-warning-400">Node.js {current.nodeVersion} is end of life. Pick a supported version before the next deployment.</p>}
        </div>
      </div>
      <div className="mt-5 flex justify-end">
        <Button onClick={save} disabled={!dirty} loading={saving}>
          Save changes
        </Button>
      </div>
    </Section>
  );
}

// Keyed by the current plan in the parent, so the selection resets when the plan changes.
function ResourcesSection({ service }: { service: Service }) {
  const { catalog } = useCloud();
  const apply = usePlanChange();
  const [plan, setPlan] = useState<PlanId>(service.plan);
  const [saving, setSaving] = useState(false);
  const paidAvailable = catalog?.paidPlansAvailable ?? false;
  const { resources, resourceError } = service.pendingChanges;

  const save = async () => {
    setSaving(true);
    try {
      await apply(service, plan);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section title="Resources" description="Pick the plan for this service. Each service is billed on its own, prorated.">
      <div className="grid gap-2 sm:grid-cols-2">
        {getServicePlans(service.type).map((p) => (
          <button
            key={p.id}
            onClick={() => setPlan(p.id)}
            aria-pressed={plan === p.id}
            disabled={p.id !== service.plan && p.priceCents > 0 && !paidAvailable}
            title={p.id !== service.plan && p.priceCents > 0 && !paidAvailable ? 'Paid plans can’t be purchased on this platform yet' : undefined}
            className={cn(
              'flex items-center justify-between rounded-xl border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50',
              plan === p.id ? 'border-brand-500/60 bg-brand-500/[0.07]' : 'border-white/[0.08] hover:border-white/20'
            )}
          >
            <div>
              <p className="text-sm font-medium text-white">{p.name}</p>
              <p className="font-mono text-xs text-ink-400">
                {formatMb(p.ramMb)} · {p.vcpu} vCPU · {p.storageGb} GB
              </p>
            </div>
            <span className="text-sm text-ink-200">{p.price ? `€${p.price}` : 'Free'}</span>
          </button>
        ))}
      </div>
      {resources && (
        <p className={cn('mt-4 rounded-xl border px-4 py-3 text-xs', resourceError ? 'border-danger-500/25 bg-danger-500/[0.06] text-danger-400' : 'border-white/[0.07] text-ink-300')}>
          {resourceError ? `The new limits couldn’t be applied yet: ${resourceError} We retry automatically.` : 'Applying the plan’s limits to the running service…'}
        </p>
      )}
      <div className="mt-5 flex justify-end">
        <Button onClick={save} disabled={plan === service.plan} loading={saving}>
          Change plan
        </Button>
      </div>
    </Section>
  );
}

function BehaviorSection({ service }: { service: Service }) {
  const { update } = useCloud();
  const toast = useToast();
  const [saving, setSaving] = useState<'autoDeploy' | 'autoRestart' | null>(null);
  const options = [
    { key: 'autoDeploy' as const, label: 'Automatic deploys', desc: 'Deploy every push to the configured branch.', value: service.autoDeploy, disabled: service.source !== 'github' },
    { key: 'autoRestart' as const, label: 'Automatic restart', desc: 'Restart the process if it crashes. Available on paid plans.', value: service.autoRestart, disabled: !planAllowsAutoRestart(service.plan) },
  ];
  const set = async (key: 'autoDeploy' | 'autoRestart', label: string, v: boolean) => {
    setSaving(key);
    try {
      await update(service.id, { [key]: v });
      toast({ kind: 'success', title: `${label} ${v ? 'enabled' : 'disabled'}` });
    } catch (e) {
      toast({ kind: 'error', title: `${label} not changed`, description: errorMessage(e) });
    } finally {
      setSaving(null);
    }
  };

  return (
    <Section title="Behavior" description="Automations for deployments and crashes.">
      <div className="space-y-3">
        {options.map((o) => (
          <div key={o.label} className={cn('flex items-center justify-between gap-4 rounded-xl border border-white/[0.07] p-4', o.disabled && 'opacity-50')}>
            <div>
              <p className="text-sm text-white">{o.label}</p>
              <p className="text-xs text-ink-400">{o.desc}</p>
            </div>
            <Switch
              checked={o.value && !o.disabled}
              onChange={(v) => {
                if (o.disabled || saving) return;
                void set(o.key, o.label, v);
              }}
              label={o.label}
            />
          </div>
        ))}
      </div>
    </Section>
  );
}

export function ServiceSettings() {
  const service = useService();
  const actions = useServiceActions(service);

  return (
    <div className="space-y-4">
      <GeneralSection service={service} />
      <ResourcesSection key={service.plan} service={service} />
      <BehaviorSection service={service} />

      <div className="card grid gap-6 border-danger-500/20 p-6 lg:grid-cols-[280px_1fr]">
        <div>
          <h3 className="font-medium text-danger-400">Danger zone</h3>
          <p className="mt-1 text-sm text-ink-400">Irreversible actions for this service.</p>
        </div>
        <div className="flex flex-col items-start justify-between gap-4 rounded-xl border border-danger-500/20 bg-danger-500/[0.04] p-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-medium text-white">Delete this service</p>
            <p className="text-xs text-ink-400">Removes all deployments, logs and variables.</p>
          </div>
          <Button variant="danger" onClick={actions.askDelete} icon={<Trash2 className="h-4 w-4" />}>
            Delete service
          </Button>
        </div>
      </div>
      {actions.dialogs}
    </div>
  );
}
