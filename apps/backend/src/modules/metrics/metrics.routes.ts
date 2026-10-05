import { Router } from 'express';
import { z } from 'zod';
import { METRIC_RANGES } from '@digitalycloud/shared';
import { query } from '../../http/validate';
import { requireSession } from '../../middleware/authenticate';
import { authorize, tenantOf } from '../../middleware/tenant';
import { getService } from '../services/services.service';
import { serviceMetrics, teamUsage } from './metrics.service';

const rangeSchema = z.strictObject({ range: z.enum(METRIC_RANGES, { error: 'range must be live, 24h, 7d or 30d.' }).default('live'), team: z.string().max(64).optional() });
const usageSchema = z.strictObject({ range: z.enum(['24h'], { error: 'range must be 24h.' }).default('24h'), team: z.string().max(64).optional() });

export function metricsRouter() {
  const r = Router();
  r.get('/services/:id/metrics', authorize('metrics.read'), async (req, res) => {
    const { range } = query(req, rangeSchema);
    res.json(await serviceMetrics(await getService(tenantOf(req).team._id, String(req.params.id)), range));
  });
  r.get('/metrics/usage', requireSession, authorize('metrics.usage'), async (req, res) => {
    query(req, usageSchema);
    res.json({ range: '24h', intervalSec: 3600, data: await teamUsage(tenantOf(req).team._id) });
  });
  return r;
}
