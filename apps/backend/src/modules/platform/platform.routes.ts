import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../http/validate';
import { requireStaff } from '../../middleware/authenticate';
import { registerProcessor } from '../../jobs/registry';
import { deploymentsDaily, overview, revenueSeries, takeSnapshot, topServices } from './admin.service';
import { probeStatus, statusPage } from './status.service';
import { notifyUpcomingMaintenance } from './maintenance.service';

const revenueSchema = z.strictObject({ range: z.enum(['30d', '90d']).default('30d') });
const dailySchema = z.strictObject({ range: z.enum(['14d', '30d']).default('14d') });
const servicesSchema = z.strictObject({ q: z.string().max(100).optional(), sort: z.enum(['cpu', 'ram', 'created']).default('cpu'), limit: z.coerce.number().int().min(1).max(100).default(20) });

export function platformRouter() {
  const r = Router();

  r.get('/status', async (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json(await statusPage());
  });

  // Control Center: platform staff only (User.role === 'admin'), checked on the server.
  r.get('/admin/overview', requireStaff, async (_req, res) => {
    res.json(await overview());
  });
  r.get('/admin/revenue', requireStaff, async (req, res) => {
    const { range } = query(req, revenueSchema);
    res.json({ data: await revenueSeries(range === '30d' ? 30 : 90), nextCursor: null });
  });
  r.get('/admin/deployments/daily', requireStaff, async (req, res) => {
    const { range } = query(req, dailySchema);
    res.json({ data: await deploymentsDaily(range === '14d' ? 14 : 30), nextCursor: null });
  });
  r.get('/admin/services', requireStaff, async (req, res) => {
    res.json({ data: await topServices(query(req, servicesSchema)), nextCursor: null });
  });
  return r;
}

export function registerPlatformProcessors() {
  registerProcessor('periodic.status_probe', () => probeStatus());
  registerProcessor('periodic.snapshot', () => takeSnapshot());
  registerProcessor('periodic.maintenance_notify', () => notifyUpcomingMaintenance());
}
