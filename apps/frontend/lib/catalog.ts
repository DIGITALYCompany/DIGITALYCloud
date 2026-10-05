import { Bot, Code2, Cpu, Server as ServerIcon, type LucideIcon } from 'lucide-react';
import { getServicePlan } from '@digitalycloud/shared';
import type { Service, ServiceType } from './types';

export type { Plan } from '@digitalycloud/shared';
export { PLAN_LEVELS, NODE_VERSIONS, DEFAULT_NODE_VERSION, getServicePlan, getServicePlans, isPaidPlan, planLevel } from '@digitalycloud/shared';

export const monthlyTotal = (services: Service[]) => services.reduce((sum, s) => sum + getServicePlan(s.type, s.plan).price, 0);

export const SERVICE_TYPES: Record<ServiceType, { label: string; icon: LucideIcon; description: string; color: string }> = {
  discord: { label: 'Discord Bot', icon: Bot, description: 'Keep your bot online around the clock with auto-restart.', color: 'text-brand-300 bg-brand-500/10 ring-brand-500/20' },
  node: { label: 'Node.js', icon: Code2, description: 'Run any Node.js application with your own start command.', color: 'text-success-400 bg-success-500/10 ring-success-500/20' },
  api: { label: 'API', icon: ServerIcon, description: 'Expose an HTTP API with a public URL and health checks.', color: 'text-aqua-400 bg-aqua-500/10 ring-aqua-500/20' },
  worker: { label: 'Worker', icon: Cpu, description: 'Background jobs, schedulers and queue consumers.', color: 'text-azure-400 bg-azure-500/10 ring-azure-500/20' },
};
