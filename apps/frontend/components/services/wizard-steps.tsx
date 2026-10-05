'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Box, Check, FileArchive, GitBranch, Github, Info, Loader2, Lock, Plus, RefreshCw, Trash2, UploadCloud, XCircle } from 'lucide-react';
import { SERVICE_DEFAULTS, UPLOAD_LIMITS, type CatalogResponse, type GithubConnectionDto } from '@digitalycloud/shared';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { DEFAULT_REGION, TIER_COVERAGE, getRegion, isRegionAllowed } from '@/data/regions';
import { useApi } from '@/hooks/use-api';
import { api, errorMessage } from '@/lib/api';
import { NODE_VERSIONS, SERVICE_TYPES, getServicePlans } from '@/lib/catalog';
import { formatMb, uid } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { EnvVar, PlanId, ServiceType, SourceType } from '@/lib/types';
import { RegionPicker } from './region-picker';

export interface WizardState {
  type: ServiceType | null;
  source: SourceType | null;
  repo: string;
  branch: string;
  dockerImage: string;
  fileName: string;
  /** Set once the archive finished uploading and passed validation. */
  uploadId: string | null;
  name: string;
  nodeVersion: string;
  startCommand: string;
  port: string;
  region: string;
  env: EnvVar[];
  plan: PlanId;
}

export type Patch = (p: Partial<WizardState>) => void;

function OptionCard({
  selected,
  onClick,
  icon,
  title,
  description,
  children,
  disabled,
}: {
  selected: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  description: string;
  children?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      disabled={disabled}
      className={cn(
        'group relative flex flex-col rounded-2xl border p-5 text-left transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50',
        selected ? 'border-brand-500/70 bg-brand-500/[0.07] shadow-[0_0_0_4px_rgba(37,99,255,0.12)]' : 'border-white/[0.08] bg-ink-900 hover:border-white/20 hover:bg-ink-850'
      )}
    >
      <span className={cn('absolute right-4 top-4 flex h-5 w-5 items-center justify-center rounded-full border transition', selected ? 'border-transparent bg-brand-gradient' : 'border-white/15')}>
        {selected && <Check className="h-3 w-3 text-white" />}
      </span>
      <span
        className={cn(
          'flex h-11 w-11 items-center justify-center rounded-xl transition [&>svg]:h-5 [&>svg]:w-5',
          selected ? 'bg-brand-500/15 text-brand-200' : 'bg-white/[0.04] text-ink-300 group-hover:text-white'
        )}
      >
        {icon}
      </span>
      <span className="mt-4 font-medium text-white">{title}</span>
      <span className="mt-1 text-sm text-ink-400">{description}</span>
      {children}
    </button>
  );
}

const TYPE_ORDER: { id: ServiceType; title: string }[] = [
  { id: 'discord', title: 'Discord Bot' },
  { id: 'node', title: 'Node.js Application' },
  { id: 'api', title: 'API' },
  { id: 'worker', title: 'Worker' },
];

export function StepType({ s, patch }: { s: WizardState; patch: Patch }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {TYPE_ORDER.map((t) => {
        const T = SERVICE_TYPES[t.id];
        return (
          <OptionCard
            key={t.id}
            selected={s.type === t.id}
            onClick={() => patch({ type: t.id, port: SERVICE_DEFAULTS[t.id].port ? String(SERVICE_DEFAULTS[t.id].port) : '', startCommand: SERVICE_DEFAULTS[t.id].startCommand })}
            icon={<T.icon />}
            title={t.title}
            description={T.description}
          />
        );
      })}
    </div>
  );
}

/** Repository and branch pickers backed by the team's GitHub App installation. */
function GithubSource({ s, patch, connection, onConnect }: { s: WizardState; patch: Patch; connection: GithubConnectionDto | null; onConnect: () => void }) {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const connected = connection?.connected ?? false;
  const repos = useApi(() => api.github.repos(search || undefined), [search], { enabled: connected });
  const repo = s.repo.trim();
  const branches = useApi(() => api.github.branches(repo), [repo], { enabled: connected && /^[\w.-]+\/[\w.-]+$/.test(repo) });

  return (
    <div className="animate-fade-up space-y-4">
      {connection && !connection.configured && (
        <p className="flex items-start gap-2 rounded-xl border border-white/[0.08] px-3.5 py-2.5 text-sm text-ink-300">
          <Info className="mt-0.5 h-4 w-4 shrink-0" /> GitHub integration isn’t configured on this platform yet. Public repositories can still be deployed by name.
        </p>
      )}
      {connection?.configured && !connected && (
        <div className="flex flex-col gap-3 rounded-xl border border-white/[0.08] p-4 sm:flex-row sm:items-center">
          <Github className="h-5 w-5 shrink-0 text-ink-300" />
          <p className="flex-1 text-sm text-ink-300">Connect GitHub to pick a repository, deploy private code and redeploy on every push. Public repositories also work by name.</p>
          <Button size="sm" onClick={onConnect} icon={<Github className="h-4 w-4" />}>
            Connect GitHub
          </Button>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="wizard-repo">
            Repository
          </label>
          <div className="relative">
            <Github className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              id="wizard-repo"
              className="input pl-9"
              placeholder="username/my-discord-bot"
              list={connected ? 'wizard-repo-list' : undefined}
              value={s.repo}
              onChange={(e) => {
                patch({ repo: e.target.value });
                setQ(e.target.value);
              }}
            />
            {connected && (
              <datalist id="wizard-repo-list">
                {(repos.data ?? []).map((r) => (
                  <option key={r.fullName} value={r.fullName}>
                    {r.private ? 'Private' : 'Public'} · default {r.defaultBranch}
                  </option>
                ))}
              </datalist>
            )}
          </div>
          {connected && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {repos.loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-400" />}
              {repos.error && <span className="text-xs text-danger-400">{repos.error}</span>}
              {(repos.data ?? []).slice(0, 4).map((r) => (
                <button
                  key={r.fullName}
                  type="button"
                  onClick={() => patch({ repo: r.fullName, branch: r.defaultBranch })}
                  className="rounded-lg border border-white/[0.07] px-2 py-1 font-mono text-[11px] text-ink-300 transition hover:border-white/20 hover:text-white"
                >
                  {r.fullName}
                </button>
              ))}
              {connection && connection.accounts.length > 0 && <span className="self-center text-[11px] text-ink-500">via {connection.accounts.map((a) => a.login).join(', ')}</span>}
            </div>
          )}
        </div>
        <div>
          <label className="label" htmlFor="wizard-branch">
            Branch
          </label>
          <div className="relative">
            <GitBranch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input id="wizard-branch" className="input pl-9" list={branches.data ? 'wizard-branch-list' : undefined} value={s.branch} onChange={(e) => patch({ branch: e.target.value })} />
            {branches.data && (
              <datalist id="wizard-branch-list">
                {branches.data.map((b) => (
                  <option key={b.name} value={b.name} />
                ))}
              </datalist>
            )}
          </div>
          {branches.error && <p className="mt-1.5 text-xs text-danger-400">{branches.error}</p>}
        </div>
      </div>
    </div>
  );
}

/** Uploads the archive as soon as it is picked; the wizard keeps the resulting `uploadId`. */
function UploadSource({ s, patch }: { s: WizardState; patch: Patch }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const upload = async (f: File) => {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setError(null);
    patch({ fileName: f.name, uploadId: null });
    if (f.size > UPLOAD_LIMITS.defaultBytes) {
      setError(`Archives can be at most ${Math.round(UPLOAD_LIMITS.defaultBytes / 1024 / 1024)} MB.`);
      return;
    }
    setProgress(0);
    try {
      const up = await api.uploads.create(f, { onProgress: setProgress, signal: ctl.signal });
      patch({ fileName: up.fileName, uploadId: up.id });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError(errorMessage(e, 'The upload failed. Please try again.'));
    } finally {
      if (abort.current === ctl) setProgress(null);
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files[0];
        if (f) void upload(f);
      }}
      onClick={() => progress === null && fileRef.current?.click()}
      className={cn(
        'flex animate-fade-up cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed p-10 text-center transition',
        drag ? 'border-brand-500 bg-brand-500/[0.06]' : error ? 'border-danger-500/40' : 'border-white/10 hover:border-white/20'
      )}
    >
      <input ref={fileRef} type="file" accept=".zip,.tar,.tar.gz,.tgz" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      {progress !== null ? (
        <div className="w-full max-w-xs">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-300" />
          <p className="mt-3 font-mono text-sm text-white">{s.fileName}</p>
          <ProgressBar value={progress * 100} className="mt-3" />
          <p className="mt-1.5 text-xs text-ink-400">{progress < 1 ? `Uploading… ${Math.round(progress * 100)}%` : 'Checking the archive…'}</p>
        </div>
      ) : error ? (
        <>
          <XCircle className="h-8 w-8 text-danger-400" />
          <p className="mt-3 text-sm text-danger-400">{error}</p>
          <p className="mt-1 text-xs text-ink-400">Click to choose another file</p>
        </>
      ) : s.uploadId ? (
        <>
          <FileArchive className="h-8 w-8 text-brand-300" />
          <p className="mt-3 font-mono text-sm text-white">{s.fileName}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-success-400">
            <Check className="h-3.5 w-3.5" /> Uploaded · click to replace
          </p>
        </>
      ) : (
        <>
          <UploadCloud className="h-8 w-8 text-ink-400" />
          <p className="mt-3 text-sm text-white">Drop your .zip or .tar.gz here or click to browse</p>
          <p className="mt-1 text-xs text-ink-400">Max {Math.round(UPLOAD_LIMITS.defaultBytes / 1024 / 1024)} MB · leave node_modules out</p>
        </>
      )}
    </div>
  );
}

export function StepSource({ s, patch, connection, onConnectGithub, onRetryGithub }: { s: WizardState; patch: Patch; connection: GithubConnectionDto | null; onConnectGithub: () => void; onRetryGithub?: () => void }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <OptionCard selected={s.source === 'github'} onClick={() => patch({ source: 'github' })} icon={<Github />} title="GitHub" description="Deploy from a repository. Auto-deploy on every push." />
        <OptionCard selected={s.source === 'upload'} onClick={() => patch({ source: 'upload' })} icon={<UploadCloud />} title="Upload files" description="Upload a .zip or .tar.gz of your project folder." />
        <OptionCard selected={s.source === 'docker'} onClick={() => patch({ source: 'docker' })} icon={<Box />} title="Docker Image" description="Run any public image from a registry." />
      </div>

      {s.source === 'github' && (
        <>
          <GithubSource s={s} patch={patch} connection={connection} onConnect={onConnectGithub} />
          {!connection && onRetryGithub && (
            <button type="button" onClick={onRetryGithub} className="flex items-center gap-1.5 text-xs text-ink-400 hover:text-white">
              <RefreshCw className="h-3.5 w-3.5" /> Check the GitHub connection again
            </button>
          )}
        </>
      )}

      {s.source === 'upload' && <UploadSource s={s} patch={patch} />}

      {s.source === 'docker' && (
        <div className="animate-fade-up">
          <label className="label" htmlFor="wizard-image">
            Image
          </label>
          <input id="wizard-image" className="input font-mono" placeholder="ghcr.io/username/app:latest" value={s.dockerImage} onChange={(e) => patch({ dockerImage: e.target.value })} />
          <p className="mt-1.5 text-xs text-ink-500">Public images only. Pin a tag or digest for reproducible deployments.</p>
        </div>
      )}
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1.5 text-xs text-danger-400">{message}</p> : null;
}

export function StepConfigure({ s, patch, errors }: { s: WizardState; patch: Patch; errors: Record<string, string> }) {
  const setEnv = (id: string, p: Partial<EnvVar>) => patch({ env: s.env.map((e) => (e.id === id ? { ...e, ...p } : e)) });
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="wizard-name">
            Service name
          </label>
          <input
            id="wizard-name"
            className={cn('input', errors.name && 'border-danger-500/60')}
            placeholder="my-awesome-bot"
            value={s.name}
            onChange={(e) => patch({ name: e.target.value })}
            autoFocus
          />
          <FieldError message={errors.name} />
        </div>
        <div>
          <label className="label" htmlFor="wizard-runtime">
            Runtime
          </label>
          <input id="wizard-runtime" className="input text-ink-300" value={s.source === 'docker' ? 'Docker' : 'Node.js'} readOnly />
        </div>
        <div>
          <label className="label" htmlFor="wizard-node">
            Node.js version
          </label>
          <select id="wizard-node" className="input" value={s.nodeVersion} onChange={(e) => patch({ nodeVersion: e.target.value })} disabled={s.source === 'docker'}>
            {NODE_VERSIONS.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          <FieldError message={errors.nodeVersion} />
        </div>
        <div>
          <label className="label" htmlFor="wizard-command">
            Start command
          </label>
          <input id="wizard-command" className={cn('input font-mono', errors.startCommand && 'border-danger-500/60')} value={s.startCommand} onChange={(e) => patch({ startCommand: e.target.value })} />
          <FieldError message={errors.startCommand} />
        </div>
        <div>
          <label className="label" htmlFor="wizard-port">
            Port {s.type === 'discord' || s.type === 'worker' ? <span className="text-ink-500">(optional)</span> : null}
          </label>
          <input
            id="wizard-port"
            className={cn('input font-mono', errors.port && 'border-danger-500/60')}
            placeholder="3000"
            value={s.port}
            onChange={(e) => patch({ port: e.target.value.replace(/\D/g, '') })}
          />
          <FieldError message={errors.port} />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="label mb-0">Environment variables</label>
          <button
            type="button"
            onClick={() => patch({ env: [...s.env, { id: uid('e'), key: '', value: '', secret: true }] })}
            className="flex items-center gap-1 text-xs font-medium text-brand-300 hover:text-brand-200"
          >
            <Plus className="h-3.5 w-3.5" /> Add variable
          </button>
        </div>
        <div className="space-y-2">
          {s.env.length === 0 && <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-xs text-ink-400">No variables yet. Add DISCORD_TOKEN or DATABASE_URL here.</p>}
          {s.env.map((e) => (
            <div key={e.id} className="flex gap-2">
              <input
                className="input w-2/5 font-mono uppercase"
                placeholder="KEY"
                aria-label="Variable name"
                value={e.key}
                onChange={(ev) => setEnv(e.id, { key: ev.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })}
              />
              <div className="relative flex-1">
                <input
                  className="input pr-9 font-mono"
                  type={e.secret ? 'password' : 'text'}
                  placeholder="value"
                  aria-label="Variable value"
                  autoComplete="off"
                  value={e.value}
                  onChange={(ev) => setEnv(e.id, { value: ev.target.value })}
                />
                <button
                  type="button"
                  onClick={() => setEnv(e.id, { secret: !e.secret })}
                  className={cn('absolute right-2.5 top-1/2 -translate-y-1/2', e.secret ? 'text-brand-300' : 'text-ink-500')}
                  aria-label="Toggle secret"
                >
                  <Lock className="h-4 w-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => patch({ env: s.env.filter((x) => x.id !== e.id) })}
                className="rounded-xl px-3 text-ink-400 transition hover:bg-danger-500/10 hover:text-danger-400"
                aria-label="Remove variable"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <FieldError message={errors.env} />
      </div>
    </div>
  );
}

export function StepResources({ s, patch, catalog }: { s: WizardState; patch: Patch; catalog: CatalogResponse | null }) {
  const plans = getServicePlans(s.type ?? 'node');
  const [notice, setNotice] = useState('');
  const paidAvailable = catalog?.paidPlansAvailable ?? false;
  // Regions with a healthy server and free capacity right now (from the API catalog).
  const available = new Set((catalog?.regions ?? []).filter((r) => r.available).map((r) => r.id));
  const firstAvailable = (plan: PlanId) => (catalog?.regions ?? []).find((r) => r.available && isRegionAllowed(r, plan))?.id ?? DEFAULT_REGION.id;

  const choosePlan = (plan: PlanId) => {
    const current = getRegion(s.region) ?? DEFAULT_REGION;
    if (isRegionAllowed(current, plan)) {
      patch({ plan });
      setNotice('');
    } else {
      const fallback = getRegion(firstAvailable(plan)) ?? DEFAULT_REGION;
      patch({ plan, region: fallback.id });
      setNotice(`${current.city} isn’t included in this plan, so your service will run in ${fallback.city} instead.`);
    }
  };

  return (
    <div className="space-y-10">
      {!paidAvailable && (
        <p className="flex items-start gap-2 rounded-xl border border-white/[0.08] px-3.5 py-2.5 text-sm text-ink-300">
          <Info className="mt-0.5 h-4 w-4 shrink-0" /> Paid plans can’t be purchased on this platform yet. You can start on Free and upgrade later.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {plans.map((p) => (
          <OptionCard
            key={p.id}
            selected={s.plan === p.id}
            onClick={() => choosePlan(p.id)}
            disabled={p.priceCents > 0 && !paidAvailable}
            icon={<span className="text-sm font-semibold">{p.name[0]}</span>}
            title={p.name}
            description={p.price === 0 ? 'Free' : `€${p.price}/month`}
          >
            {p.popular && <span className="absolute right-11 top-4 rounded-full bg-brand-gradient px-2 py-0.5 text-[10px] font-medium text-white">Popular</span>}
            <div className="mt-4 space-y-1.5 border-t border-white/[0.06] pt-4 font-mono text-xs text-ink-300">
              <p>{formatMb(p.ramMb)} RAM</p>
              <p>{p.vcpu} vCPU</p>
              <p>{p.storageGb} GB storage</p>
              <p className="text-aqua-400">{TIER_COVERAGE[p.id]}</p>
            </div>
          </OptionCard>
        ))}
      </div>

      <div>
        <h2 className="text-lg font-semibold text-white">Region</h2>
        <p className="mt-1 text-sm text-ink-400">Pick the location closest to your users. Higher plans unlock more regions.</p>
        {notice && (
          <p className="mt-4 flex animate-fade-in items-start gap-2 rounded-xl border border-warning-500/25 bg-warning-500/[0.06] px-3.5 py-2.5 text-sm text-warning-400">
            <Info className="mt-0.5 h-4 w-4 shrink-0" /> {notice}
          </p>
        )}
        <div className="mt-6">
          <RegionPicker
            plan={s.plan}
            plans={plans}
            value={s.region}
            available={catalog ? available : null}
            onSelect={(r) => {
              patch({ region: r.id });
              setNotice('');
            }}
            onUpgrade={(r) => {
              const required = plans.find((p) => p.id === r.minPlan);
              if (required && required.priceCents > 0 && !paidAvailable) {
                setNotice(`${r.city} needs the ${required.name} plan, which can’t be purchased yet.`);
                return;
              }
              patch({ plan: r.minPlan, region: r.id });
              const name = required?.name ?? r.minPlan;
              setNotice(`${r.city} needs the ${name} plan, so we switched you to ${name}. You can still pick another plan above.`);
            }}
          />
        </div>
      </div>
    </div>
  );
}
