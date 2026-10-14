import { Router, type Request } from 'express';
import { z } from 'zod';
import { MESSAGES } from '@digitalycloud/shared';
import { jsonSmall } from '../../http/body';
import { body } from '../../http/validate';
import { authorize, tenantOf } from '../../middleware/tenant';
import { actorOf } from '../services/services.routes';
import * as domains from './domains.service';

const addSchema = z.strictObject({ hostname: z.string({ error: MESSAGES.domain }).max(300, { error: MESSAGES.domain }) });

const id = (req: Request) => String(req.params.id);
const domainId = (req: Request) => String(req.params.domainId);

/** Custom domains of a service: add (with the DNS records to create), verify now, remove. */
export function domainsRouter() {
  const r = Router();

  r.get('/services/:id/domains', authorize('services.read'), async (req, res) => {
    const rows = await domains.listDomains(tenantOf(req).team._id, id(req));
    res.json({ data: rows.map(domains.domainDto) });
  });

  r.post('/services/:id/domains', jsonSmall, authorize('services.update'), async (req, res) => {
    const d = await domains.addDomain(tenantOf(req), actorOf(req), id(req), body(req, addSchema).hostname);
    res.status(201).json(domains.domainDto(d));
  });

  r.post('/services/:id/domains/:domainId/verify', jsonSmall, authorize('services.update'), async (req, res) => {
    res.json(domains.domainDto(await domains.verifyDomain(tenantOf(req).team._id, id(req), domainId(req))));
  });

  r.delete('/services/:id/domains/:domainId', authorize('services.update'), async (req, res) => {
    await domains.removeDomain(tenantOf(req), actorOf(req), id(req), domainId(req));
    res.status(204).end();
  });

  return r;
}
