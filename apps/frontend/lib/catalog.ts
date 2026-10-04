import { Bot, Boxes, Code2, Cpu, Server as ServerIcon, type LucideIcon } from 'lucide-react';
import { getProduct, type ProductSlug } from '@/data/products';
import type { PlanId, Service, ServiceType } from './types';

export interface Plan {
  id: PlanId;
  name: string;
  price: number;
  ramMb: number;
  vcpu: number;
  storageGb: number;
  features: string[];
  popular?: boolean;
}

export const PLAN_LEVELS: PlanId[] = ['free', 'starter', 'pro', 'business'];

const LEVEL_DEFAULTS = [
  { ramMb: 512, vcpu: 0.25, storageGb: 1 },
  { ramMb: 1024, vcpu: 0.5, storageGb: 5 },
  { ramMb: 2048, vcpu: 1, storageGb: 15 },
  { ramMb: 4096, vcpu: 2, storageGb: 30 },
];

const PRODUCT_FOR: Record<ServiceType, ProductSlug> = { discord: 'discord-bots', node: 'nodejs', api: 'apis', worker: 'workers' };

function specNumber(specs: string[], re: RegExp) {
  for (const s of specs) {
    const m = s.match(re);
    if (m) return { value: parseFloat(m[1]), unit: m[2] };
  }
  return null;
}

const PLANS_BY_TYPE = Object.fromEntries(
  (Object.keys(PRODUCT_FOR) as ServiceType[]).map((type) => {
    const product = getProduct(PRODUCT_FOR[type]);
    const plans: Plan[] = (product?.plans ?? []).slice(0, PLAN_LEVELS.length).map((p, i) => {
      const ram = specNumber(p.specs, /([\d.]+)\s*(MB|GB) RAM/i);
      const cpu = specNumber(p.specs, /([\d.]+)()\s*vCPU/i);
      const disk = specNumber(p.specs, /([\d.]+)\s*(GB) storage/i);
      return {
        id: PLAN_LEVELS[i],
        name: p.name,
        price: p.price,
        ramMb: ram ? Math.round(ram.unit.toUpperCase() === 'GB' ? ram.value * 1024 : ram.value) : LEVEL_DEFAULTS[i].ramMb,
        vcpu: cpu ? cpu.value : LEVEL_DEFAULTS[i].vcpu,
        storageGb: disk ? disk.value : LEVEL_DEFAULTS[i].storageGb,
        features: p.specs,
        popular: p.popular,
      };
    });
    return [type, plans];
  })
) as Record<ServiceType, Plan[]>;

export const getServicePlans = (type: ServiceType) => PLANS_BY_TYPE[type];
export const getServicePlan = (type: ServiceType, id: PlanId) => PLANS_BY_TYPE[type].find((p) => p.id === id) ?? PLANS_BY_TYPE[type][0];
export const productSlugFor = (type: ServiceType) => PRODUCT_FOR[type];
export const monthlyTotal = (services: Service[]) => services.reduce((sum, s) => sum + getServicePlan(s.type, s.plan).price, 0);

export const SERVICE_TYPES: Record<ServiceType, { label: string; icon: LucideIcon; description: string; color: string }> = {
  discord: { label: 'Discord Bot', icon: Bot, description: 'Keep your bot online around the clock with auto-restart.', color: 'text-brand-300 bg-brand-500/10 ring-brand-500/20' },
  node: { label: 'Node.js', icon: Code2, description: 'Run any Node.js application with your own start command.', color: 'text-success-400 bg-success-500/10 ring-success-500/20' },
  api: { label: 'API', icon: ServerIcon, description: 'Expose an HTTP API with a public URL and health checks.', color: 'text-aqua-400 bg-aqua-500/10 ring-aqua-500/20' },
  worker: { label: 'Worker', icon: Cpu, description: 'Background jobs, schedulers and queue consumers.', color: 'text-azure-400 bg-azure-500/10 ring-azure-500/20' },
};

export const GenericServiceIcon = Boxes;

export const NODE_VERSIONS = ['22 LTS', '20 LTS', '18'];
