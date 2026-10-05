import { PLAN_LEVELS, type PlanId, type ServiceType } from './enums';

/**
 * The plan and region catalog. Both the backend (validation, limits, billing) and the frontend
 * (wizard, plan pickers) read these values, so they cannot drift apart. Prices are VAT-inclusive EUR.
 */

export interface Plan {
  id: PlanId;
  name: string;
  /** Euros, for display. Always equal to `priceCents / 100`. */
  price: number;
  /** Integer cents; the only value billing uses. */
  priceCents: number;
  ramMb: number;
  vcpu: number;
  storageGb: number;
  features: string[];
  popular?: boolean;
}

const plan = (id: PlanId, name: string, priceCents: number, ramMb: number, vcpu: number, storageGb: number, features: string[], popular?: boolean): Plan => ({
  id,
  name,
  price: priceCents / 100,
  priceCents,
  ramMb,
  vcpu,
  storageGb,
  features,
  ...(popular ? { popular } : {}),
});

/** Values match `apps/frontend/data/products.ts` (marketing copy) and docs/01-project-overview.md. */
export const PLANS: Record<ServiceType, Plan[]> = {
  discord: [
    plan('free', 'Bot Free', 0, 256, 0.25, 1, ['1 bot', '256 MB RAM', '0.25 vCPU', 'Community support']),
    plan('starter', 'Bot Starter', 199, 512, 0.5, 5, ['2 bots', '512 MB RAM', '0.5 vCPU', 'Automatic restarts']),
    plan('pro', 'Bot Pro', 399, 1024, 1, 15, ['5 bots', '1 GB RAM', '1 vCPU', 'Git deploys & Lavalink-ready'], true),
    plan('business', 'Bot Ultra', 799, 2048, 2, 30, ['Unlimited bots', '2 GB RAM', '2 vCPU', 'Priority support']),
  ],
  node: [
    plan('free', 'Hobby', 0, 512, 0.25, 1, ['1 app', '512 MB RAM', '0.25 vCPU', '1 GB storage']),
    plan('starter', 'Starter', 299, 1024, 0.5, 5, ['3 apps', '1 GB RAM', '0.5 vCPU', '5 GB storage']),
    plan('pro', 'Pro', 699, 2048, 1, 15, ['10 apps', '2 GB RAM', '1 vCPU', '15 GB storage & custom domains'], true),
    plan('business', 'Scale', 1499, 4096, 2, 30, ['Unlimited apps', '4 GB RAM', '2 vCPU', '30 GB storage']),
  ],
  api: [
    plan('free', 'Hobby', 0, 512, 0.25, 1, ['1 API', '512 MB RAM', 'Shared HTTPS URL', '100k requests/month']),
    plan('starter', 'Launch', 399, 1024, 0.5, 5, ['3 APIs', '1 GB RAM', 'Custom domain', 'Unlimited requests']),
    plan('pro', 'Growth', 899, 2048, 1, 15, ['10 APIs', '2 GB RAM', '2 instances with load balancing', 'Health checks & alerts'], true),
    plan('business', 'Scale', 1999, 4096, 2, 30, ['Unlimited APIs', '4 GB RAM', 'Up to 4 instances', 'Priority support']),
  ],
  worker: [
    plan('free', 'Free', 0, 256, 0.25, 1, ['1 worker', '256 MB RAM', 'Up to 3 cron jobs', 'Community support']),
    plan('starter', 'Worker', 249, 512, 0.5, 5, ['3 workers', '512 MB RAM', 'Unlimited cron jobs', 'Automatic restarts']),
    plan('pro', 'Worker Pro', 599, 1536, 1, 15, ['10 workers', '1.5 GB RAM', '1 vCPU', 'Failure alerts'], true),
    plan('business', 'Worker Max', 1299, 4096, 2, 30, ['Unlimited workers', '4 GB RAM', '2 vCPU', 'Priority support']),
  ],
};

export const planLevel = (id: PlanId) => PLAN_LEVELS.indexOf(id);
export const getServicePlans = (type: ServiceType): Plan[] => PLANS[type];
export function getServicePlan(type: ServiceType, id: PlanId): Plan {
  const found = PLANS[type].find((p) => p.id === id);
  if (!found) throw new Error(`Unknown plan ${type}/${id}`);
  return found;
}
export const isPaidPlan = (type: ServiceType, id: PlanId) => getServicePlan(type, id).priceCents > 0;

/** Resource limits a service gets. Always derived from the plan, never from client input. */
export function planLimits(type: ServiceType, id: PlanId) {
  const p = getServicePlan(type, id);
  return { ramLimitMb: p.ramMb, storageLimitMb: p.storageGb * 1024, vcpu: p.vcpu, cpuMillis: Math.round(p.vcpu * 1000) };
}

/** Automatic restart is a paid feature. */
export const planAllowsAutoRestart = (id: PlanId) => id !== 'free';

// ---------------------------------------------------------------------------------------------
// Regions

export type RegionArea = 'Europe' | 'North America' | 'Asia Pacific';

export interface Region {
  id: string;
  city: string;
  country: string;
  countryCode: string;
  area: RegionArea;
  code: string;
  minPlan: PlanId;
  latencyMs: number;
  lat: number;
  lon: number;
  desc: string;
}

export const REGIONS: Region[] = [
  { id: 'lyon', city: 'Lyon', country: 'France', countryCode: 'FR', area: 'Europe', code: 'FR-LYS-1', minPlan: 'free', latencyMs: 11, lat: 45.76, lon: 4.84, desc: 'Our home region and the default for new services.' },
  { id: 'paris', city: 'Paris', country: 'France', countryCode: 'FR', area: 'Europe', code: 'FR-PAR-1', minPlan: 'free', latencyMs: 7, lat: 48.86, lon: 2.35, desc: 'Closest to the main French internet exchanges.' },
  { id: 'frankfurt', city: 'Frankfurt', country: 'Germany', countryCode: 'DE', area: 'Europe', code: 'DE-FRA-1', minPlan: 'starter', latencyMs: 14, lat: 50.11, lon: 8.68, desc: 'Central Europe’s largest exchange point.' },
  { id: 'amsterdam', city: 'Amsterdam', country: 'Netherlands', countryCode: 'NL', area: 'Europe', code: 'NL-AMS-1', minPlan: 'starter', latencyMs: 12, lat: 52.37, lon: 4.9, desc: 'Great for Benelux and Northern Europe.' },
  { id: 'london', city: 'London', country: 'United Kingdom', countryCode: 'GB', area: 'Europe', code: 'UK-LON-1', minPlan: 'starter', latencyMs: 10, lat: 51.51, lon: -0.13, desc: 'Low latency to the UK and Ireland.' },
  { id: 'madrid', city: 'Madrid', country: 'Spain', countryCode: 'ES', area: 'Europe', code: 'ES-MAD-1', minPlan: 'starter', latencyMs: 18, lat: 40.42, lon: -3.7, desc: 'Covers Spain and Portugal.' },
  { id: 'montreal', city: 'Montréal', country: 'Canada', countryCode: 'CA', area: 'North America', code: 'CA-MTL-1', minPlan: 'pro', latencyMs: 82, lat: 45.5, lon: -73.57, desc: 'French-speaking North America and the US East Coast.' },
  { id: 'virginia', city: 'Virginia', country: 'United States', countryCode: 'US', area: 'North America', code: 'US-ASH-1', minPlan: 'pro', latencyMs: 88, lat: 39.04, lon: -77.49, desc: 'The busiest network hub in the United States.' },
  { id: 'singapore', city: 'Singapore', country: 'Singapore', countryCode: 'SG', area: 'Asia Pacific', code: 'SG-SIN-1', minPlan: 'business', latencyMs: 158, lat: 1.35, lon: 103.82, desc: 'Gateway to Southeast Asia.' },
  { id: 'tokyo', city: 'Tokyo', country: 'Japan', countryCode: 'JP', area: 'Asia Pacific', code: 'JP-TYO-1', minPlan: 'business', latencyMs: 214, lat: 35.68, lon: 139.69, desc: 'Japan, Korea and East Asia.' },
  { id: 'sydney', city: 'Sydney', country: 'Australia', countryCode: 'AU', area: 'Asia Pacific', code: 'AU-SYD-1', minPlan: 'business', latencyMs: 246, lat: -33.87, lon: 151.21, desc: 'Australia and New Zealand.' },
];

export const REGION_AREAS: RegionArea[] = ['Europe', 'North America', 'Asia Pacific'];
export const DEFAULT_REGION: Region = REGIONS[0]!;

export const TIER_COVERAGE: Record<PlanId, string> = {
  free: 'France',
  starter: 'All of Europe',
  pro: 'Europe & North America',
  business: 'Worldwide',
};

export const regionLabel = (r: Pick<Region, 'country' | 'city'>) => `${r.country} — ${r.city}`;
export const isRegionAllowed = (r: Pick<Region, 'minPlan'>, id: PlanId) => planLevel(id) >= planLevel(r.minPlan);
export const regionsForPlan = (id: PlanId) => REGIONS.filter((r) => isRegionAllowed(r, id));
export const getRegion = (id: string) => REGIONS.find((r) => r.id === id);
export const getRegionByLabel = (label: string) => REGIONS.find((r) => regionLabel(r) === label);

// ---------------------------------------------------------------------------------------------
// Runtimes

/**
 * Node.js versions offered for new deployments (official lifecycle checked 2026-10-05:
 * 24 is Active LTS until 2028-04-30, 22 is Maintenance LTS until 2027-04-30).
 */
export const NODE_VERSIONS = ['24 LTS', '22 LTS'] as const;
/** End-of-life versions still recognised on stored services (18 ended 2025-04-30, 20 ended 2026-04-30). They cannot be deployed. */
export const LEGACY_NODE_VERSIONS = ['20 LTS', '18'] as const;
export type SupportedNodeVersion = (typeof NODE_VERSIONS)[number];
export type NodeVersion = SupportedNodeVersion | (typeof LEGACY_NODE_VERSIONS)[number];
export const DEFAULT_NODE_VERSION: SupportedNodeVersion = '24 LTS';

export const isSupportedNodeVersion = (v: string): v is SupportedNodeVersion => (NODE_VERSIONS as readonly string[]).includes(v);
/** Major version number, e.g. `'24 LTS'` → `24`. */
export const nodeMajor = (v: NodeVersion) => Number.parseInt(v, 10);

export const SERVICE_DEFAULTS: Record<ServiceType, { startCommand: string; port: number | null }> = {
  discord: { startCommand: 'node index.js', port: null },
  node: { startCommand: 'npm run start', port: 3000 },
  api: { startCommand: 'npm run start', port: 3000 },
  worker: { startCommand: 'node worker.js', port: null },
};
/** Node and API services serve HTTP and must declare a port. */
export const typeRequiresPort = (t: ServiceType) => t === 'node' || t === 'api';

// ---------------------------------------------------------------------------------------------
// Limits

export const MB = 1024 * 1024;
export const UPLOAD_LIMITS = {
  /** Archives for new services and for free/starter services. */
  defaultBytes: 100 * MB,
  /** Archives replacing the source of a server-verified Pro or Business service. */
  largeBytes: 500 * MB,
  largePlans: ['pro', 'business'] as PlanId[],
  /** Uploads not attached to a service are deleted after this many hours. */
  unusedTtlHours: 24,
};

export const ENV_LIMITS = { maxVars: 100, maxKeyLength: 128, maxValueBytes: 32 * 1024 };

/** Runtime-log retention per plan, in hours. Free keeps only the current deployment, at most 24 h. */
export const LOG_RETENTION_HOURS: Record<PlanId, number> = { free: 24, starter: 7 * 24, pro: 14 * 24, business: 30 * 24 };
