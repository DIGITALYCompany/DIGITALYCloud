'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, Lock, Rocket } from 'lucide-react';
import { DEFAULT_NODE_VERSION, ENV_KEY_RE, GITHUB_REPO_RE, MESSAGES, RESERVED_ENV_PREFIX, SERVICE_NAME_RE, isSupportedNodeVersion, type CreateServiceInput, type NodeVersion } from '@digitalycloud/shared';
import { CheckoutReturn, useCheckoutReturn } from '@/components/billing/checkout-return';
import { Button, ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useApi } from '@/hooks/use-api';
import { useAuth } from '@/providers/auth-provider';
import { useCloud } from '@/providers/cloud-provider';
import { useToast } from '@/providers/toast-provider';
import { DEFAULT_REGION, getRegion, regionLabel } from '@/data/regions';
import { api, errorMessage, isApiError } from '@/lib/api';
import { SERVICE_TYPES, getServicePlan } from '@/lib/catalog';
import { formatMb } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { BillingOperation, Deployment, Service } from '@/lib/types';
import { DeployProgress } from './deploy-progress';
import { StepConfigure, StepResources, StepSource, StepType, type WizardState } from './wizard-steps';

const STEPS = [
  { title: 'What do you want to deploy?', short: 'Type' },
  { title: 'Choose your source', short: 'Source' },
  { title: 'Configure your service', short: 'Configure' },
  { title: 'Choose a plan and region', short: 'Plan & region' },
  { title: 'Review & Deploy', short: 'Review' },
];

const INITIAL: WizardState = {
  type: null,
  source: null,
  repo: '',
  branch: 'main',
  dockerImage: '',
  fileName: '',
  uploadId: null,
  name: '',
  nodeVersion: DEFAULT_NODE_VERSION,
  startCommand: 'node index.js',
  port: '',
  region: DEFAULT_REGION.id,
  env: [{ id: 'init-1', key: 'NODE_ENV', value: 'production', secret: false }],
  plan: 'free',
};

// Wizard drafts survive the GitHub installation redirect. Secret values are never stored in the browser.
const DRAFT_KEY = 'dgc-wizard-draft';
function saveDraft(s: WizardState, step: number) {
  const env = s.env.map((e) => (e.secret ? { ...e, value: '' } : e));
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ s: { ...s, env }, step, at: Date.now() }));
  } catch {
    /* storage unavailable: the user re-enters the fields */
  }
}
// Dashboard pages render only in the browser (after the session check), so reading storage while
// initialising state is safe. The draft is removed in an effect, keeping the initialiser pure.
function readDraft(): { s: WizardState; step: number; hadSecrets: boolean } | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as { s: WizardState; step: number; at: number };
    if (Date.now() - d.at > 60 * 60_000) return null;
    return { s: { ...INITIAL, ...d.s }, step: d.step, hadSecrets: d.s.env.some((e) => e.secret) };
  } catch {
    return null;
  }
}

const GITHUB_RESULT: Record<string, { kind: 'success' | 'error' | 'warning'; title: string; description?: string }> = {
  connected: { kind: 'success', title: 'GitHub connected', description: 'Pick a repository to deploy.' },
  unverified: { kind: 'error', title: 'GitHub not connected', description: 'We couldn’t confirm you have access to that installation. Try again.' },
  other_team: { kind: 'warning', title: 'Already connected elsewhere', description: 'This GitHub installation belongs to another team.' },
  unavailable: { kind: 'warning', title: 'GitHub isn’t available', description: 'The GitHub integration isn’t configured on this platform.' },
  error: { kind: 'error', title: 'GitHub connection failed', description: 'Please try again.' },
};

/** Which wizard step owns a field the server rejected. */
const FIELD_STEP: Record<string, number> = { type: 0, source: 1, repo: 1, branch: 1, uploadId: 1, github: 1, name: 2, startCommand: 2, nodeVersion: 2, port: 2, env: 2, plan: 3, regionId: 3 };

function validate(step: number, s: WizardState, existing: string[]) {
  const e: Record<string, string> = {};
  if (step === 0 && !s.type) e.type = 'Choose what you want to deploy.';
  if (step === 1) {
    if (!s.source) e.source = 'Choose where your code comes from.';
    else if (s.source === 'github' && !GITHUB_REPO_RE.test(s.repo.trim())) e.source = MESSAGES.repo;
    else if (s.source === 'github' && !s.branch.trim()) e.source = MESSAGES.branch;
    else if (s.source === 'upload' && !s.uploadId) e.source = s.fileName ? 'Wait for the upload to finish.' : MESSAGES.upload;
    else if (s.source === 'docker' && s.dockerImage.trim().length < 3) e.source = MESSAGES.dockerImage;
  }
  if (step === 2) {
    if (!SERVICE_NAME_RE.test(s.name.trim())) e.name = MESSAGES.serviceName;
    else if (existing.includes(s.name.trim().toLowerCase())) e.name = MESSAGES.serviceNameTaken;
    if (!s.startCommand.trim()) e.startCommand = MESSAGES.startCommand;
    if (s.port && (+s.port < 1 || +s.port > 65535)) e.port = MESSAGES.port;
    if ((s.type === 'api' || s.type === 'node') && !s.port) e.port = MESSAGES.portRequired;
    const keys = s.env.map((v) => v.key);
    if (keys.some((k) => !k)) e.env = 'Every environment variable needs a key.';
    else if (keys.some((k) => !ENV_KEY_RE.test(k))) e.env = MESSAGES.envKey;
    else if (keys.some((k) => k.startsWith(RESERVED_ENV_PREFIX))) e.env = MESSAGES.envReserved;
    else if (new Set(keys).size !== keys.length) e.env = 'Each key can only be used once.';
  }
  return e;
}

function sourceSummary(s: WizardState) {
  if (s.source === 'github') return `GitHub · ${s.repo} @ ${s.branch}`;
  if (s.source === 'docker') return `Docker · ${s.dockerImage}`;
  return `Upload · ${s.fileName}`;
}

function toInput(s: WizardState): CreateServiceInput {
  return {
    name: s.name.trim(),
    type: s.type!,
    source: s.source!,
    repo: s.source === 'github' ? s.repo.trim() : s.source === 'docker' ? s.dockerImage.trim() : '',
    branch: s.source === 'github' ? s.branch.trim() : null,
    uploadId: s.source === 'upload' ? s.uploadId : null,
    nodeVersion: (isSupportedNodeVersion(s.nodeVersion) ? s.nodeVersion : DEFAULT_NODE_VERSION) as NodeVersion,
    startCommand: s.startCommand.trim(),
    port: s.port ? +s.port : null,
    plan: s.plan,
    regionId: s.region,
    env: s.env.filter((v) => v.key).map(({ key, value, secret }) => ({ key, value, secret })),
  };
}

/** Five-step service creation wizard, followed by the first deployment. */
export function NewServiceWizard() {
  const { services, createService, catalog, refreshService } = useCloud();
  const { can } = useAuth();
  const toast = useToast();
  const [draft] = useState(readDraft);
  const [githubResult] = useState(() => new URLSearchParams(window.location.search).get('github'));
  const [step, setStep] = useState(draft?.step ?? 0);
  const [s, setS] = useState<WizardState>(draft?.s ?? INITIAL);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [deploying, setDeploying] = useState<{ service: Service; deployment: Deployment } | null>(null);
  const checkout = useCheckoutReturn();
  // One key per attempt: retrying the same request never creates (or charges) twice.
  const attempt = useRef<string | null>(null);
  const github = useApi(() => api.github.connection(), []);

  // Back from the GitHub App installation: the draft was restored above; report the result once.
  useEffect(() => {
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      /* storage unavailable */
    }
    if (draft?.hadSecrets) toast({ kind: 'info', title: 'Re-enter secret values', description: 'Secret environment values aren’t kept while you are away from this page.' });
    if (githubResult) {
      const r = GITHUB_RESULT[githubResult] ?? GITHUB_RESULT.error;
      toast({ kind: r.kind, title: r.title, description: r.description });
      const params = new URLSearchParams(window.location.search);
      params.delete('github');
      window.history.replaceState(null, '', `${window.location.pathname}${params.size ? `?${params}` : ''}`);
    }
  }, [draft, githubResult, toast]);

  const patch = (p: Partial<WizardState>) => {
    attempt.current = null;
    setS((x) => ({ ...x, ...p }));
    setErrors({});
  };

  const next = () => {
    const e = validate(
      step,
      s,
      services.map((x) => x.name.toLowerCase())
    );
    setErrors(e);
    if (Object.keys(e).length === 0) setStep((x) => x + 1);
  };

  const connectGithub = () => {
    saveDraft(s, step);
    window.location.assign(api.github.installUrl('/services/new'));
  };

  const deploy = async () => {
    if (!s.type || !s.source) return;
    setSubmitting(true);
    attempt.current ??= `create-${crypto.randomUUID()}`;
    try {
      setDeploying(await createService(toInput(s), attempt.current));
    } catch (e) {
      if (isApiError(e) && e.status === 402 && typeof e.details.checkoutUrl === 'string') {
        // The pending service (including its environment) is held encrypted by the API until payment completes.
        window.location.assign(e.details.checkoutUrl);
        return;
      }
      attempt.current = null;
      if (isApiError(e) && Object.keys(e.fields).length) {
        const first = Object.keys(e.fields).map((f) => f.split('.')[0]!)[0]!;
        setErrors(Object.fromEntries(Object.entries(e.fields).map(([k, v]) => [k.split('.')[0]!, v])));
        if (FIELD_STEP[first] !== undefined) setStep(FIELD_STEP[first]);
        if (FIELD_STEP[first] === 1 || FIELD_STEP[first] === 3) setErrors({ source: e.message });
      } else if (isApiError(e, 'CONFLICT') || (isApiError(e) && e.status === 409)) {
        setErrors({ name: e.message });
        setStep(2);
      } else {
        toast({ kind: isApiError(e) && e.status === 402 ? 'warning' : 'error', title: 'Could not create service', description: errorMessage(e) });
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Paid creation finished after Stripe Checkout: follow the first deployment.
  const onCheckoutCompleted = async (op: BillingOperation) => {
    if (!op.serviceId) return;
    try {
      const service = await refreshService(op.serviceId);
      const [deployment] = await api.deployments.list(op.serviceId);
      if (deployment) setDeploying({ service, deployment });
    } catch {
      /* the banner already reports success; the service shows up in the list */
    }
  };

  if (!can('services.create')) {
    return (
      <EmptyState
        icon={<Lock className="h-6 w-6" />}
        title="You can’t create services in this team"
        description="Ask a team owner or admin to create the service, or to change your role."
        action={<ButtonLink href="/services">Back to services</ButtonLink>}
      />
    );
  }

  if (deploying) return <DeployProgress service={deploying.service} deployment={deploying.deployment} />;

  const plan = getServicePlan(s.type ?? 'node', s.plan);
  const region = getRegion(s.region) ?? DEFAULT_REGION;
  const firstError = errors.type || errors.source || (step !== 2 ? errors.env : undefined);

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/services" className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Services
      </Link>

      {checkout && <CheckoutReturn operationId={checkout.operation} returned={checkout.checkout} onCompleted={onCheckoutCompleted} />}

      <ol className="mb-10 flex items-center gap-2">
        {STEPS.map((st, i) => (
          <li key={st.short} className="flex flex-1 items-center gap-2">
            <button
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium transition',
                i < step ? 'bg-brand-gradient text-white' : i === step ? 'bg-white text-ink-950' : 'border border-white/10 text-ink-500'
              )}
              aria-label={`Step ${i + 1}: ${st.short}`}
              aria-current={i === step ? 'step' : undefined}
            >
              {i < step ? <Check className="h-4 w-4" /> : i + 1}
            </button>
            <span className={cn('hidden text-xs md:block', i === step ? 'text-white' : 'text-ink-500')}>{st.short}</span>
            {i < STEPS.length - 1 && <span className={cn('h-px flex-1', i < step ? 'bg-brand-500/60' : 'bg-white/[0.08]')} />}
          </li>
        ))}
      </ol>

      <div key={step} className="animate-fade-up">
        <p className="font-mono text-xs text-brand-300">
          Step {step + 1} of {STEPS.length}
        </p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{STEPS[step].title}</h1>
        <div className="mt-8">
          {step === 0 && <StepType s={s} patch={patch} />}
          {step === 1 && <StepSource s={s} patch={patch} connection={github.data} onConnectGithub={connectGithub} onRetryGithub={github.error ? github.reload : undefined} />}
          {step === 2 && <StepConfigure s={s} patch={patch} errors={errors} />}
          {step === 3 && <StepResources s={s} patch={patch} catalog={catalog} />}
          {step === 4 && s.type && (
            <div className="card divide-y divide-white/[0.06]">
              {[
                ['Service', s.name],
                ['Type', SERVICE_TYPES[s.type].label],
                ['Source', sourceSummary(s)],
                ['Runtime', s.source === 'docker' ? 'Docker' : `Node.js ${s.nodeVersion}`],
                ['Start command', s.startCommand],
                ['Port', s.port || 'None (background process)'],
                ['Region', `${regionLabel(region)} · ${region.code}`],
                ['Environment', `${s.env.filter((v) => v.key).length} variable(s)`],
                ['Plan', `${plan.name} · ${formatMb(plan.ramMb)} RAM · ${plan.vcpu} vCPU · ${plan.storageGb} GB`],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-center">
                  <span className="w-40 shrink-0 text-sm text-ink-400">{k}</span>
                  <span className="break-all font-mono text-sm text-white">{v}</span>
                </div>
              ))}
              <div className="flex items-center justify-between bg-white/[0.02] px-5 py-4">
                <span className="text-sm text-ink-300">Monthly cost</span>
                <span className="text-xl font-semibold text-white">{plan.price === 0 ? 'Free' : `€${plan.price}/month`}</span>
              </div>
              {plan.price > 0 && (
                <p className="px-5 py-3 text-xs text-ink-400">The prorated amount for this month is charged to the team’s card. Without a card on file you’ll be taken to a secure checkout first.</p>
              )}
            </div>
          )}
        </div>
        {firstError && <p className="mt-4 animate-fade-in text-sm text-danger-400">{firstError}</p>}
      </div>

      <div className="mt-10 flex items-center justify-between border-t border-white/[0.06] pt-6">
        <Button variant="ghost" onClick={() => setStep((x) => x - 1)} disabled={step === 0 || submitting} icon={<ArrowLeft className="h-4 w-4" />}>
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={next}>
            Continue <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="lg" onClick={deploy} loading={submitting} icon={<Rocket className="h-4 w-4" />}>
            Deploy Service
          </Button>
        )}
      </div>
    </div>
  );
}
