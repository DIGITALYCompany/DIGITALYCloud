import { escapeRegExp } from '../../lib/text';
import { ctx } from '../../context';
import { withTransaction } from '../../db/connection';
import { GithubInstallation, Service, WebhookReceipt, type GithubInstallationDoc, type ServiceDoc, type WebhookReceiptDoc } from '../../db/models';
import { GithubError, type GithubRepoInfo } from '../../integrations/github';
import { addToOutbox, dispatchNow } from '../../jobs/outbox';
import { registerProcessor } from '../../jobs/registry';
import { audit } from '../../lib/audit';
import { isDuplicateKey, notFound } from '../../lib/errors';
import { newId } from '../../lib/ids';
import { deploymentDto } from '../../serializers/deployment';
import { createDeploymentRecord, lockForDeploy } from '../deployments/deployments.service';
import { publishService } from '../services/publish';

export async function teamInstallations(teamId: string) {
  return GithubInstallation.find({ teamId, removedAt: null }).sort({ createdAt: 1 }).lean<GithubInstallationDoc[]>();
}

/** Binds an installation to the team after verifying the installing user can access it. */
export async function bindInstallation(teamId: string, userId: string, installationId: number, code: string | undefined) {
  const gh = ctx().integrations.github;
  if (!code || !(await gh.userCanAccessInstallation(code, installationId))) return 'unverified' as const;
  const info = await gh.getInstallation(installationId);
  const existing = await GithubInstallation.findOne({ installationId }).lean<GithubInstallationDoc>();
  if (existing && existing.teamId !== teamId && !existing.removedAt) return 'other_team' as const;
  const now = new Date();
  if (existing) {
    await GithubInstallation.updateOne(
      { _id: existing._id },
      { $set: { teamId, accountLogin: info.login, accountType: info.accountType, repositorySelection: info.repositorySelection, suspendedAt: info.suspended ? now : null, removedAt: null, createdBy: userId } },
    );
  } else {
    try {
      await GithubInstallation.create({
        _id: newId('githubInstallation'),
        teamId,
        installationId,
        accountLogin: info.login,
        accountType: info.accountType,
        repositorySelection: info.repositorySelection,
        suspendedAt: info.suspended ? now : null,
        removedAt: null,
        createdBy: userId,
      });
    } catch (e) {
      if (isDuplicateKey(e, 'github_installation_unique')) return 'other_team' as const;
      throw e;
    }
  }
  await audit({ action: 'github.installation_bound', actorUserId: userId, teamId, meta: { installationId, account: info.login } });
  return 'connected' as const;
}

export async function listRepos(teamId: string, q: string | undefined): Promise<GithubRepoInfo[]> {
  const installs = await teamInstallations(teamId);
  const gh = ctx().integrations.github;
  const all: GithubRepoInfo[] = [];
  for (const i of installs) {
    if (i.suspendedAt) continue;
    try {
      all.push(...(await gh.listInstallationRepos(i.installationId)));
    } catch (e) {
      if (!(e instanceof GithubError && (e.status === 404 || e.status === 401))) throw e;
    }
  }
  const needle = q?.trim().toLowerCase();
  return all.filter((r) => !needle || r.fullName.toLowerCase().includes(needle)).slice(0, 100);
}

export async function listBranches(teamId: string, owner: string, repo: string) {
  const install = await GithubInstallation.findOne({ teamId, removedAt: null, suspendedAt: null, accountLogin: new RegExp(`^${escapeRegExp(owner)}$`, 'i') }).lean<GithubInstallationDoc>();
  try {
    return await ctx().integrations.github.listBranches(install?.installationId ?? null, owner, repo);
  } catch (e) {
    if (e instanceof GithubError && (e.status === 404 || e.status === 400)) throw notFound('Repository');
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------
// Webhooks

export interface PushPayload {
  repository: { full_name: string };
  ref: string;
  after: string;
  deleted?: boolean;
  head_commit?: { id: string; message: string; author?: { name?: string } } | null;
  installation?: { id: number };
}

/**
 * Accepts a verified GitHub delivery: the receipt (unique per delivery id) and the processing job
 * are written together, so a redelivery is acknowledged without processing twice.
 */
export async function acceptGithubDelivery(deliveryId: string, event: string, payload: Record<string, unknown>) {
  const subset =
    event === 'push'
      ? {
          repository: { full_name: (payload.repository as { full_name?: string })?.full_name },
          ref: payload.ref,
          after: payload.after,
          deleted: payload.deleted,
          head_commit: payload.head_commit ? { id: (payload.head_commit as { id: string }).id, message: (payload.head_commit as { message: string }).message?.slice(0, 500), author: { name: (payload.head_commit as { author?: { name?: string } }).author?.name } } : null,
          installation: payload.installation ? { id: (payload.installation as { id: number }).id } : undefined,
        }
      : { action: payload.action, installation: payload.installation ? { id: (payload.installation as { id: number }).id } : undefined };
  let outbox: string[] = [];
  try {
    await withTransaction(async (s) => {
      const now = new Date();
      const receiptId = newId('outbox');
      await WebhookReceipt.create(
        [{ _id: receiptId, provider: 'github', eventId: deliveryId, type: event, status: 'received', attempts: 0, error: null, payload: subset, receivedAt: now, processedAt: null, expiresAt: new Date(now.getTime() + 30 * 86400_000) }],
        { session: s },
      );
      outbox = await addToOutbox(s, [{ topic: 'webhook.github', payload: { receiptId }, dedupeKey: `github:${deliveryId}` }]);
    });
  } catch (e) {
    if (isDuplicateKey(e, 'webhook_provider_event_unique')) return 'duplicate' as const;
    throw e;
  }
  await dispatchNow(ctx().queues, outbox);
  return 'accepted' as const;
}

/**
 * A push to a watched branch deploys every matching service whose team installation delivered it.
 * If a deployment is already running, the push is coalesced: the latest pending push is kept and
 * deployed when the current deployment finishes (never silently dropped).
 */
export async function handlePush(p: PushPayload) {
  if (p.deleted || !p.ref.startsWith('refs/heads/') || !/^[0-9a-f]{40}$/.test(p.after)) return 0;
  const branch = p.ref.slice('refs/heads/'.length);
  const fullName = p.repository.full_name.toLowerCase();
  const installationId = p.installation?.id;
  if (!installationId) return 0;
  const installs = await GithubInstallation.find({ installationId, removedAt: null }).lean<GithubInstallationDoc[]>();
  if (!installs.length) return 0;
  const services = await Service.find({ source: 'github', repoNormalized: fullName, branch, autoDeploy: true, lifecycle: 'active', teamId: { $in: installs.map((i) => i.teamId) } }).lean<ServiceDoc[]>();
  const commit = { sha: p.after, message: (p.head_commit?.message ?? '').split('\n')[0]!.slice(0, 200) || 'Push to branch', author: p.head_commit?.author?.name ?? 'GitHub' };
  let started = 0;
  for (const svc of services) {
    try {
      await deployPush(svc, commit);
      started++;
    } catch (e) {
      if ((e as { status?: number }).status !== 409) throw e;
      await Service.updateOne({ _id: svc._id }, { $set: { pendingPush: { ...commit, receivedAt: new Date() } } });
    }
  }
  return started;
}

export async function deployPush(svc: ServiceDoc, commit: { sha: string; message: string; author: string }) {
  let outbox: string[] = [];
  const dep = await withTransaction(async (s) => {
    const locked = await lockForDeploy(s, svc.teamId, svc._id, newId('deployment'));
    await Service.updateOne({ _id: svc._id }, { $set: { pendingPush: null } }, { session: s });
    const created = await createDeploymentRecord(s, locked, { trigger: 'git_push', actor: { userId: null, apiKeyId: null, name: commit.author }, commitMessage: commit.message, sha: commit.sha, author: commit.author });
    outbox = created.outbox;
    return created.deployment;
  });
  await dispatchNow(ctx().queues, outbox);
  await ctx().hub.publish({ kind: 'team', id: svc.teamId }, 'deployment.created', deploymentDto(dep));
  await publishService(svc._id);
  return dep;
}

/** Installation removed or suspended: access is revoked for the bound team. */
async function handleInstallation(action: string, installationId: number) {
  const now = new Date();
  if (action === 'deleted') await GithubInstallation.updateOne({ installationId }, { $set: { removedAt: now } });
  else if (action === 'suspend') await GithubInstallation.updateOne({ installationId }, { $set: { suspendedAt: now } });
  else if (action === 'unsuspend') await GithubInstallation.updateOne({ installationId }, { $set: { suspendedAt: null } });
}

export function registerGithubProcessors() {
  registerProcessor('webhook.github', async (data) => {
    const receipt = await WebhookReceipt.findOneAndUpdate({ _id: String(data.receiptId), status: { $in: ['received', 'failed'] } }, { $inc: { attempts: 1 } }).lean<WebhookReceiptDoc>();
    if (!receipt) return;
    try {
      const payload = receipt.payload as Record<string, unknown>;
      if (receipt.type === 'push') await handlePush(payload as unknown as PushPayload);
      else if (receipt.type === 'installation' && payload.installation) await handleInstallation(String(payload.action), (payload.installation as { id: number }).id);
      await WebhookReceipt.updateOne({ _id: receipt._id }, { $set: { status: receipt.type === 'push' || receipt.type === 'installation' ? 'processed' : 'ignored', processedAt: new Date(), error: null } });
    } catch (e) {
      await WebhookReceipt.updateOne({ _id: receipt._id }, { $set: { status: 'failed', error: (e as Error).message.slice(0, 500) } });
      throw e;
    }
  });
}

