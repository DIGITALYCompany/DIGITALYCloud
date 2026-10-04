import { PLAN_LEVELS } from '@/lib/catalog';
import type { PlanId } from '@/lib/types';

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

export const DEFAULT_REGION = REGIONS[0];

export const TIER_COVERAGE: Record<PlanId, string> = {
  free: 'France',
  starter: 'All of Europe',
  pro: 'Europe & North America',
  business: 'Worldwide',
};

const level = (plan: PlanId) => PLAN_LEVELS.indexOf(plan);

export const regionLabel = (r: Region) => `${r.country} — ${r.city}`;
export const isRegionAllowed = (r: Region, plan: PlanId) => level(plan) >= level(r.minPlan);
export const regionsForPlan = (plan: PlanId) => REGIONS.filter((r) => isRegionAllowed(r, plan));
export const getRegion = (id: string) => REGIONS.find((r) => r.id === id);
export const getRegionByLabel = (label: string) => REGIONS.find((r) => regionLabel(r) === label);
export const serverFor = (r: Region) => `${r.city.normalize('NFD').replace(/[\u0300-\u036f]/g, '')}-01`;
