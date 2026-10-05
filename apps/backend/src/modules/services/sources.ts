import { isIP } from 'node:net';
import type { ClientSession } from 'mongoose';
import { GIT_BRANCH_RE, GITHUB_REPO_RE, MESSAGES, parseDockerImage } from '@digitalycloud/shared';
import { ctx } from '../../context';
import { GithubInstallation, Upload, type GithubInstallationDoc, type UploadDoc } from '../../db/models';
import { GithubError } from '../../integrations/github';
import { AppError, unavailable, validation } from '../../lib/errors';
import { isId } from '../../lib/ids';
import { escapeRegExp } from '../../lib/text';

export interface ResolvedGithub {
  owner: string;
  name: string;
  fullName: string;
  branch: string;
  installation: GithubInstallationDoc | null;
}

/** The team's active installation covering `owner`, if any (private repositories need one). */
export async function installationFor(teamId: string, owner: string) {
  return GithubInstallation.findOne({ teamId, removedAt: null, suspendedAt: null, accountLogin: new RegExp(`^${escapeRegExp(owner)}$`, 'i') }).lean<GithubInstallationDoc>();
}

function githubFailure(e: unknown, connected: boolean): AppError {
  if (e instanceof GithubError) {
    if (e.status === 404 || e.status === 403)
      return validation(connected ? 'DIGITALYCloud can’t access this repository. Check the GitHub App’s repository access.' : 'We couldn’t find this public repository. Connect GitHub to deploy private repositories.', 'repo');
    if (e.status === 503) return unavailable('GitHub isn’t configured on this server. Use a public repository, an upload or a Docker image.', 'GITHUB_NOT_CONFIGURED');
  }
  return unavailable('GitHub isn’t reachable right now. Please try again in a moment.', 'GITHUB_UNAVAILABLE');
}

/** Verifies the repository is public or reachable through the team's installation, and that the branch exists. */
export async function resolveGithubSource(teamId: string, repo: string, branch: string | null): Promise<ResolvedGithub> {
  if (!GITHUB_REPO_RE.test(repo)) throw validation(MESSAGES.repo, 'repo');
  if (branch !== null && !GIT_BRANCH_RE.test(branch)) throw validation(MESSAGES.branch, 'branch');
  const [owner, name] = repo.split('/') as [string, string];
  const installation = await installationFor(teamId, owner);
  const gh = ctx().integrations.github;
  let info;
  try {
    info = await gh.getRepo(installation?.installationId ?? null, owner, name);
  } catch (e) {
    throw githubFailure(e, Boolean(installation));
  }
  const target = branch ?? info.defaultBranch;
  try {
    await gh.getBranchHead(installation?.installationId ?? null, owner, name, target);
  } catch (e) {
    if (e instanceof GithubError && e.status === 404) throw validation(`Branch “${target}” wasn’t found in ${info.fullName}.`, 'branch');
    throw githubFailure(e, Boolean(installation));
  }
  return { owner, name, fullName: info.fullName, branch: target, installation };
}

const PRIVATE_HOST_RE = /(^localhost$)|(\.local$)|(\.internal$)|(\.lan$)|(\.home$)|(\.localdomain$)|(^metadata(\.google)?\.internal$)/i;

/**
 * Docker image references from users. Registries given as IP literals, localhost or internal
 * names are refused so a pull can't reach the control-plane network. (Hostnames are also checked
 * against private address ranges when the worker resolves them before pulling.)
 */
export function validateDockerImage(ref: string) {
  const trimmed = ref.trim();
  if (trimmed.length < 3 || trimmed.length > 255) throw validation(MESSAGES.dockerImage, 'repo');
  const parsed = parseDockerImage(trimmed);
  if (!parsed) throw validation('Enter a valid image reference, like ghcr.io/user/app:1.2.', 'repo');
  const host = parsed.registry.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  if (isIP(host) || PRIVATE_HOST_RE.test(host) || !host.includes('.')) {
    if (parsed.registry !== 'docker.io') throw validation('Images must come from a public registry.', 'repo');
  }
  return { ref: trimmed, ...parsed };
}

/** An upload the team owns, not attached to another service yet, and not expired. */
export async function claimUpload(session: ClientSession, teamId: string, uploadId: string | null, serviceId: string): Promise<UploadDoc> {
  if (!uploadId || !isId('upload', uploadId)) throw validation(MESSAGES.upload, 'uploadId');
  const up = await Upload.findOneAndUpdate(
    { _id: uploadId, teamId, status: 'ready', $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
    { $set: { status: 'attached', serviceId, expiresAt: null } },
    { session },
  ).lean<UploadDoc>();
  if (!up) throw validation('This upload isn’t available. Upload your archive again.', 'uploadId');
  return up;
}
