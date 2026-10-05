import { Router } from 'express';
import { LEGACY_NODE_VERSIONS, NODE_VERSIONS, PLANS, REGIONS, UPLOAD_LIMITS, type CatalogResponse } from '@digitalycloud/shared';
import { ctx } from '../../context';
import { regionAvailability } from '../../runtime/capacity';
import { paidPlansAvailable } from '../billing/availability';

export async function buildCatalog(): Promise<CatalogResponse> {
  const c = ctx();
  const available = await regionAvailability(c.config.capabilities.runtime);
  return {
    plans: PLANS,
    regions: REGIONS.map((r) => ({ ...r, available: available[r.id] === true })),
    nodeVersions: [...NODE_VERSIONS],
    legacyNodeVersions: [...LEGACY_NODE_VERSIONS],
    uploadLimits: { defaultBytes: c.config.UPLOAD_MAX_MB * 1024 * 1024 || UPLOAD_LIMITS.defaultBytes, largeBytes: c.config.UPLOAD_MAX_LARGE_MB * 1024 * 1024 },
    paidPlansAvailable: paidPlansAvailable(),
  };
}

export function catalogRouter() {
  const r = Router();
  r.get('/catalog', async (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=30');
    res.json(await buildCatalog());
  });
  return r;
}
