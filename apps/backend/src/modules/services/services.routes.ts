import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  DEFAULT_NODE_VERSION,
  ENV_LIMITS,
  MESSAGES,
  PLAN_LEVELS,
  SERVICE_TYPE_IDS,
  SOURCE_TYPES,
  type CreateServiceInput,
  type EnvVarInput,
  type NodeVersion,
} from '@digitalycloud/shared';
import { jsonEnv, jsonSmall } from '../../http/body';
import { envVisibility } from '../../http/principal';
import { body, cursorParam, limitParam, query } from '../../http/validate';
import { idempotent } from '../../middleware/idempotency';
import { authorize, tenantOf } from '../../middleware/tenant';
import { deploymentDto } from '../../serializers/deployment';
import { serializeOne, serializeServices } from '../../serializers/service';
import { triggerDeploy, type Actor } from '../deployments/deployments.service';
import { envDto, loadEnv, redactAll } from './env.service';
import * as services from './services.service';

const envItem = z.strictObject({
  id: z.string().max(64).optional(),
  key: z.string({ error: MESSAGES.envKey }).max(ENV_LIMITS.maxKeyLength, { error: MESSAGES.envKey }),
  value: z.string({ error: 'Values must be text.' }).max(ENV_LIMITS.maxValueBytes, { error: 'Values can be at most 32 KB.' }).optional(),
  secret: z.boolean({ error: 'secret must be true or false.' }),
});
const envList = z.array(envItem, { error: 'env must be a list.' }).max(ENV_LIMITS.maxVars, { error: `A service can have at most ${ENV_LIMITS.maxVars} environment variables.` });
const port = z.number({ error: MESSAGES.port }).int({ error: MESSAGES.port }).nullable();

const createSchema = z.strictObject({
  name: z.string({ error: MESSAGES.serviceName }).max(64, { error: MESSAGES.serviceName }),
  type: z.enum(SERVICE_TYPE_IDS, { error: 'Choose what you want to deploy.' }),
  source: z.enum(SOURCE_TYPES, { error: 'Choose where your code comes from.' }),
  repo: z.string().max(300).default(''),
  branch: z.string().max(255).nullable().default(null),
  uploadId: z.string().max(64).nullable().default(null),
  nodeVersion: z.string().max(16).default(DEFAULT_NODE_VERSION),
  startCommand: z.string({ error: MESSAGES.startCommand }).max(2000, { error: 'Use a single-line start command (max 1000 characters).' }),
  port,
  plan: z.enum(PLAN_LEVELS, { error: 'Choose a plan.' }),
  regionId: z.string({ error: MESSAGES.unknownRegion }).max(32, { error: MESSAGES.unknownRegion }),
  env: envList.default([]),
  autoDeploy: z.boolean().optional(),
  autoRestart: z.boolean().optional(),
});

/** Known settings are type-checked; the service rejects other fields and drops legacy limit fields. */
const updateSchema = z.looseObject({
  name: z.string().max(64).optional(),
  startCommand: z.string().max(2000).optional(),
  nodeVersion: z.string().max(16).optional(),
  port: port.optional(),
  branch: z.string().max(255).optional(),
  autoDeploy: z.boolean().optional(),
  autoRestart: z.boolean().optional(),
});
const planSchema = z.strictObject({ plan: z.enum(PLAN_LEVELS, { error: 'Choose a plan.' }) });
const envSchema = z.strictObject({ env: envList });
const deploySchema = z.strictObject({ deploymentId: z.string().max(64).optional(), uploadId: z.string().max(64).optional() });
const listSchema = z.strictObject({ limit: limitParam(50, 100), cursor: cursorParam, team: z.string().max(64).optional() });

export function actorOf(req: Request): Actor {
  const a = req.auth!;
  return a.kind === 'session' ? { userId: a.user._id, apiKeyId: null, name: a.user.name } : { userId: null, apiKeyId: a.key._id, name: `API key “${a.key.name}”` };
}

const modeOf = (req: Request) => envVisibility(req.auth!, tenantOf(req).role);
const id = (req: Request) => String(req.params.id);

export function servicesRouter() {
  const r = Router();

  r.get('/services', authorize('services.read'), async (req, res) => {
    const q = query(req, listSchema);
    const p = await services.listServices(tenantOf(req).team._id, q);
    res.json({ data: await serializeServices(p.items, modeOf(req)), nextCursor: p.nextCursor });
  });

  r.post('/services', jsonEnv, authorize('services.create'), idempotent('services.create'), async (req, res) => {
    const input = body(req, createSchema) as CreateServiceInput & { nodeVersion: NodeVersion };
    const { service, deployment } = await services.createService(tenantOf(req), actorOf(req), input);
    res.status(201).json({ service: await serializeOne(service, modeOf(req)), deployment });
  });

  r.get('/services/:id', authorize('services.read'), async (req, res) => {
    res.json(await serializeOne(await services.getService(tenantOf(req).team._id, id(req)), modeOf(req)));
  });

  r.patch('/services/:id', jsonSmall, authorize('services.update'), async (req, res) => {
    const patch = body(req, updateSchema);
    const updated = await services.updateService(tenantOf(req), actorOf(req), id(req), patch as Record<string, unknown>);
    res.json(await serializeOne(updated, modeOf(req)));
  });

  r.delete('/services/:id', authorize('services.delete'), async (req, res) => {
    await services.deleteService(tenantOf(req), actorOf(req), id(req));
    res.status(204).end();
  });

  for (const kind of ['start', 'stop', 'restart'] as const) {
    r.post(`/services/:id/${kind}`, jsonSmall, authorize('services.control'), async (req, res) => {
      const s = await services.controlService(tenantOf(req), actorOf(req), id(req), kind);
      res.json(await serializeOne(s, modeOf(req)));
    });
  }

  r.post('/services/:id/plan', jsonSmall, authorize('services.plan'), async (req, res) => {
    const s = await services.changePlan(tenantOf(req), actorOf(req), id(req), body(req, planSchema).plan);
    res.json(await serializeOne(s, modeOf(req)));
  });

  r.put('/services/:id/env', jsonEnv, authorize('services.env.write'), async (req, res) => {
    const { env } = body(req, envSchema);
    await services.setEnv(tenantOf(req), actorOf(req), id(req), env as EnvVarInput[]);
    const rows = await loadEnv(id(req));
    const mode = modeOf(req);
    // API keys may write variables but never read values back.
    res.json({ data: mode === 'omit' ? redactAll(rows) : envDto(rows, mode) });
  });

  r.post('/services/:id/deploy', jsonSmall, authorize('services.control'), idempotent('services.deploy'), async (req, res) => {
    const input = body(req, deploySchema);
    const { deployment, service } = await triggerDeploy(tenantOf(req).team._id, id(req), actorOf(req), input, req.auth!.kind === 'apiKey');
    res.status(202).json({ service: service ? await serializeOne(service, modeOf(req)) : null, deployment: deploymentDto(deployment) });
  });

  return r;
}
