import { Router } from 'express';
import { z } from 'zod';
import { cursorParam, limitParam, query } from '../../http/validate';
import { authorize, tenantOf } from '../../middleware/tenant';
import { getDeployment, listDeployments } from './deployments.service';

const listSchema = z.strictObject({ serviceId: z.string().max(63).optional(), limit: limitParam(50, 100), cursor: cursorParam, team: z.string().max(64).optional() });

export function deploymentsRouter() {
  const r = Router();
  r.get('/deployments', authorize('deployments.read'), async (req, res) => {
    res.json(await listDeployments(tenantOf(req).team._id, query(req, listSchema)));
  });
  r.get('/deployments/:id', authorize('deployments.read'), async (req, res) => {
    res.json(await getDeployment(tenantOf(req).team._id, String(req.params.id)));
  });
  return r;
}
