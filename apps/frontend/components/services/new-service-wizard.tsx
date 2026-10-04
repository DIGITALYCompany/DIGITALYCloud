'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCloud } from '@/providers/cloud-provider';
import { useToast } from '@/providers/toast-provider';
import { DEFAULT_REGION, getRegion, regionLabel } from '@/data/regions';
import { SERVICE_TYPES, getServicePlan } from '@/lib/catalog';
import { formatMb } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Deployment, Service } from '@/lib/types';
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
  name: '',
  nodeVersion: '22 LTS',
  startCommand: 'node index.js',
  port: '',
  region: DEFAULT_REGION.id,
  env: [{ id: 'init-1', key: 'NODE_ENV', value: 'production', secret: false }],
  plan: 'starter',
};

function validate(step: number, s: WizardState, existing: string[]) {
  const e: Record<string, string> = {};
  if (step === 0 && !s.type) e.type = 'Choose what you want to deploy.';
  if (step === 1) {
    if (!s.source) e.source = 'Choose where your code comes from.';
    else if (s.source === 'github' && !/^[\w.-]+\/[\w.-]+$/.test(s.repo.trim())) e.source = 'Enter a repository like username/repo.';
    else if (s.source === 'upload' && !s.fileName) e.source = 'Upload a .zip of your project.';
    else if (s.source === 'docker' && s.dockerImage.trim().length < 3) e.source = 'Enter a Docker image name.';
  }
  if (step === 2) {
    if (!/^[A-Za-z][\w-]{1,31}$/.test(s.name.trim())) e.name = 'Use 2–32 letters, numbers, dashes or underscores, starting with a letter.';
    else if (existing.includes(s.name.trim().toLowerCase())) e.name = 'You already have a service with this name.';
    if (!s.startCommand.trim()) e.startCommand = 'A start command is required.';
    if (s.port && (+s.port < 1 || +s.port > 65535)) e.port = 'Port must be between 1 and 65535.';
    if ((s.type === 'api' || s.type === 'node') && !s.port) e.port = 'Web services need a port.';
    if (s.env.some((v) => !v.key)) e.env = 'Every environment variable needs a key.';
  }
  return e;
}

function sourceSummary(s: WizardState) {
  if (s.source === 'github') return `GitHub · ${s.repo} @ ${s.branch}`;
  if (s.source === 'docker') return `Docker · ${s.dockerImage}`;
  return `Upload · ${s.fileName}`;
}

/** Five-step service creation wizard, followed by the first deployment. */
export function NewServiceWizard() {
  const { services, createService } = useCloud();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [s, setS] = useState<WizardState>(INITIAL);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [deploying, setDeploying] = useState<{ service: Service; deployment: Deployment } | null>(null);

  const patch = (p: Partial<WizardState>) => {
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

  const deploy = async () => {
    if (!s.type || !s.source) return;
    setSubmitting(true);
    try {
      const res = await createService({
        name: s.name.trim(),
        type: s.type,
        source: s.source,
        repo: s.source === 'github' ? s.repo.trim() : s.source === 'docker' ? s.dockerImage.trim() : s.fileName,
        branch: s.source === 'github' ? s.branch : '—',
        nodeVersion: s.nodeVersion,
        startCommand: s.startCommand.trim(),
        port: s.port ? +s.port : null,
        plan: s.plan,
        region: regionLabel(getRegion(s.region) ?? DEFAULT_REGION),
        env: s.env.filter((v) => v.key),
      });
      setDeploying(res);
    } catch (e) {
      toast({ kind: 'error', title: 'Could not create service', description: e instanceof Error ? e.message : 'Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (deploying) return <DeployProgress service={deploying.service} deployment={deploying.deployment} />;

  const plan = getServicePlan(s.type ?? 'node', s.plan);
  const region = getRegion(s.region) ?? DEFAULT_REGION;
  const firstError = errors.type || errors.source || errors.env;

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/services" className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Services
      </Link>

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
          {step === 1 && <StepSource s={s} patch={patch} />}
          {step === 2 && <StepConfigure s={s} patch={patch} errors={errors} />}
          {step === 3 && <StepResources s={s} patch={patch} />}
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
