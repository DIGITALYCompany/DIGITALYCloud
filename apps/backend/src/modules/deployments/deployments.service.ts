import type { ClientSession } from 'mongoose';
import type { DeployTrigger } from '@digitalycloud/shared';
import { ctx } from '../../context';
import { withTransaction } from '../../db/connection';
import { Deployment, DeploymentLog, Service, type DeploymentDoc, type DeploymentLogDoc, type ServiceDoc } from '../../db/models';
import { afterCursor, decodeCursor, page } from '../../http/pagination';
import { addToOutbox, dispatchNow } from '../../jobs/outbox';
import { audit } from '../../lib/audit';
import { conflict, isDuplicateKey, notFound, validation } from '../../lib/errors';
import { isId, newId } from '../../lib/ids';
import { deploymentDto } from '../../serializers/deployment';
import { claimUpload } from '../services/sources';
import { publishService } from '../services/publish';

export interface Actor {
  userId: string | null;
  apiKeyId: string | null;
  name: string;
}

/** Deploys are long operations; reconciliation clears the lock if a worker dies mid-build. */
export const deployLeaseMs = () => (ctx().config.BUILD_TIMEOUT_SECONDS + 15 * 60) * 1000;
const MAX_LOG_LINES = 5000;

/**
 * Acquires the per-service operation lock and the next deployment number in one atomic update
 * (inside the caller's transaction). Fails with 409 if any operation is in progress.
 */
export async function lockForDeploy(session: ClientSession, teamId: string, serviceId: string, opId: string) {
  const now = new Date();
  const svc = await Service.findOneAndUpdate(
    { _id: serviceId, teamId, lifecycle: 'active', $or: [{ activeOperation: null }, { 'activeOperation.leaseUntil': { $lt: now } }] },
    {
      $inc: { deploymentSeq: 1, opGeneration: 1 },
      $set: { status: 'deploying', lastDeployAt: now, desiredState: 'running' },
    },
    { session },
  ).lean<ServiceDoc>();
  if (!svc) {
    const current = await Service.findOne({ _id: serviceId, teamId, lifecycle: 'active' }, null, { session }).lean<ServiceDoc>();
    if (!current) throw notFound('Service');
    throw conflict(current.activeOperation?.kind === 'deploy' ? 'A deployment is already in progress.' : 'Another action is in progress for this service. Try again in a moment.');
  }
  await Service.updateOne(
    { _id: serviceId },
    { $set: { activeOperation: { id: opId, kind: 'deploy', generation: svc.opGeneration, startedAt: now, leaseUntil: new Date(now.getTime() + deployLeaseMs()) } } },
    { session },
  );
  return svc;
}

export interface NewDeploymentInput {
  trigger: DeployTrigger;
  actor: Actor;
  commitMessage: string;
  rollbackOf?: DeploymentDoc | null;
  uploadId?: string | null;
  sha?: string | null;
  author?: string;
}

/** Creates deployment #(n) for a locked service and its `deploy.run` outbox entry. */
export async function createDeploymentRecord(session: ClientSession, svc: ServiceDoc, input: NewDeploymentInput) {
  const now = new Date();
  const dep: DeploymentDoc = {
    _id: newId('deployment'),
    serviceId: svc._id,
    teamId: svc.teamId,
    number: svc.deploymentSeq,
    environment: 'Production',
    status: 'building',
    stage: 'preparing',
    trigger: input.trigger,
    // Filled in from the actual source while pulling (commit SHA, archive hash or image digest).
    commit: input.rollbackOf?.commit ?? (input.sha ? input.sha.slice(0, 7) : ''),
    commitMessage: input.commitMessage.slice(0, 500),
    author: (input.author ?? input.actor.name).slice(0, 200),
    actor: { userId: input.actor.userId, apiKeyId: input.actor.apiKeyId },
    source: {
      type: svc.source,
      repo: svc.repo,
      branch: svc.source === 'github' ? svc.branch : null,
      sha: input.rollbackOf?.source.sha ?? input.sha ?? null,
      uploadId: svc.source === 'upload' ? (input.uploadId ?? svc.uploadId) : null,
      imageRef: svc.source === 'docker' ? svc.repo : null,
      archiveSha256: input.rollbackOf?.source.archiveSha256 ?? null,
    },
    config: input.rollbackOf
      ? { ...input.rollbackOf.config }
      : { startCommand: svc.startCommand, nodeVersion: svc.nodeVersion, port: svc.port, settingsVersion: svc.settingsVersion },
    imageRef: input.rollbackOf?.imageRef ?? null,
    imageDigest: input.rollbackOf?.imageDigest ?? null,
    rollbackOf: input.rollbackOf?._id ?? null,
    serverId: null,
    generation: svc.opGeneration,
    createdAt: now,
    startedAt: null,
    finishedAt: null,
    durationSec: 0,
    failureCode: null,
    failureReason: null,
    logLines: 0,
    imageRetainedUntil: null,
  };
  try {
    await Deployment.create([dep], { session });
  } catch (e) {
    if (isDuplicateKey(e, 'deployment_one_building') || isDuplicateKey(e, 'deployment_service_number_unique')) throw conflict('A deployment is already in progress.');
    throw e;
  }
  const outbox = await addToOutbox(session, [{ topic: 'deploy.run', payload: { deploymentId: dep._id, serviceId: svc._id, generation: svc.opGeneration }, dedupeKey: `deploy:${dep._id}` }]);
  return { deployment: dep, outbox };
}

const triggerMessage: Record<DeployTrigger, string> = {
  initial: 'Initial deployment',
  manual: 'Redeploy from dashboard',
  api: 'Deployed via API',
  git_push: 'Push to branch',
  rollback: 'Rollback',
};

export type DeployRequestBody = { deploymentId?: string; uploadId?: string };

/**
 * `POST /services/:id/deploy`: `{}` redeploys the latest source, `{ deploymentId }` rolls back to a
 * successful deployment's retained image, `{ uploadId }` replaces an upload service's archive.
 */
export async function triggerDeploy(teamId: string, serviceId: string, actor: Actor, req: DeployRequestBody, viaApiKey: boolean) {
  if (req.deploymentId && req.uploadId) throw validation('Choose either a deployment to roll back to or a new upload, not both.');
  const opId = newId('deployment');
  let outbox: string[] = [];
  const result = await withTransaction(async (session) => {
    const current = await Service.findOne({ _id: serviceId, teamId, lifecycle: 'active' }, null, { session }).lean<ServiceDoc>();
    if (!current) throw notFound('Service');
    let rollbackOf: DeploymentDoc | null = null;
    if (req.deploymentId) {
      if (!isId('deployment', req.deploymentId)) throw notFound('Deployment');
      rollbackOf = await Deployment.findOne({ _id: req.deploymentId, serviceId, teamId, status: 'success' }, null, { session }).lean<DeploymentDoc>();
      if (!rollbackOf) throw notFound('Deployment');
      if (!rollbackOf.imageRef || !rollbackOf.imageRetainedUntil || rollbackOf.imageRetainedUntil.getTime() < Date.now()) {
        throw conflict('This deployment’s build is no longer retained. Redeploy from source instead.', 'ROLLBACK_UNAVAILABLE');
      }
    }
    if (req.uploadId && current.source !== 'upload') throw validation('Only upload services can deploy a new archive.', 'uploadId');

    const svc = await lockForDeploy(session, teamId, serviceId, opId);
    if (req.uploadId) {
      const up = await claimUpload(session, teamId, req.uploadId, serviceId);
      await Service.updateOne({ _id: serviceId }, { $set: { uploadId: up._id, repo: up.fileName } }, { session });
      svc.uploadId = up._id;
      svc.repo = up.fileName;
    }
    const trigger: DeployTrigger = rollbackOf ? 'rollback' : viaApiKey ? 'api' : 'manual';
    const created = await createDeploymentRecord(session, svc, {
      trigger,
      actor,
      rollbackOf,
      uploadId: req.uploadId ?? null,
      commitMessage: rollbackOf ? `Rollback to #${rollbackOf.number}` : req.uploadId ? 'New archive uploaded' : triggerMessage[trigger],
    });
    outbox = created.outbox;
    await audit({ action: 'service.deploy', actorUserId: actor.userId, actorApiKeyId: actor.apiKeyId, teamId, targetType: 'service', targetId: serviceId, meta: { deploymentId: created.deployment._id, trigger } }, session);
    return created.deployment;
  });
  await dispatchNow(ctx().queues, outbox);
  await ctx().hub.publish({ kind: 'team', id: teamId }, 'deployment.created', deploymentDto(result));
  const service = await publishService(serviceId);
  return { deployment: result, service };
}

export async function listDeployments(teamId: string, opts: { serviceId?: string; limit: number; cursor?: string }) {
  const filter: Record<string, unknown> = { teamId, ...afterCursor(decodeCursor(opts.cursor)) };
  if (opts.serviceId) {
    if (!(await Service.exists({ _id: opts.serviceId, teamId }))) throw notFound('Service');
    filter.serviceId = opts.serviceId;
  }
  const rows = await Deployment.find(filter).sort({ createdAt: -1, _id: -1 }).limit(opts.limit + 1).lean<DeploymentDoc[]>();
  const p = page(rows, opts.limit);
  return { data: p.items.map((d) => deploymentDto(d)), nextCursor: p.nextCursor };
}

export async function getDeployment(teamId: string, id: string) {
  if (!isId('deployment', id)) throw notFound('Deployment');
  const d = await Deployment.findOne({ _id: id, teamId }).lean<DeploymentDoc>();
  if (!d) throw notFound('Deployment');
  const logs = await DeploymentLog.find({ deploymentId: id }).sort({ lineNo: 1 }).limit(MAX_LOG_LINES).lean<DeploymentLogDoc[]>();
  return deploymentDto(d, logs.map((l) => l.text));
}

