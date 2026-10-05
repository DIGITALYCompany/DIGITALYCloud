import { createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import { createAppAuth } from '@octokit/auth-app';
import type { AppConfig } from '../config/env';
import { safeEqual } from '../lib/crypto';

export interface GithubRepoInfo {
  id: number;
  fullName: string;
  defaultBranch: string;
  private: boolean;
}

export interface GithubCommitInfo {
  sha: string;
  message: string;
  author: string;
}

export interface GithubInstallationInfo {
  id: number;
  login: string;
  accountType: 'User' | 'Organization';
  repositorySelection: 'all' | 'selected';
  suspended: boolean;
}

export class GithubError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GithubError';
  }
}

/**
 * GitHub access. Public repositories work without the App; private repositories use short-lived
 * installation tokens. Every request goes to the configured API host with path segments validated
 * by the caller; archive downloads only follow redirects to GitHub's codeload host, so a source
 * fetch can never be pointed at an arbitrary or internal address.
 */
export interface GithubApi {
  readonly appConfigured: boolean;
  installUrl(state: string): string;
  getInstallation(installationId: number): Promise<GithubInstallationInfo>;
  listInstallationRepos(installationId: number): Promise<GithubRepoInfo[]>;
  getRepo(installationId: number | null, owner: string, repo: string): Promise<GithubRepoInfo>;
  listBranches(installationId: number | null, owner: string, repo: string): Promise<string[]>;
  getBranchHead(installationId: number | null, owner: string, repo: string, branch: string): Promise<GithubCommitInfo>;
  getCommit(installationId: number | null, owner: string, repo: string, sha: string): Promise<GithubCommitInfo>;
  downloadTarball(installationId: number | null, owner: string, repo: string, sha: string): Promise<Readable>;
  verifyWebhook(rawBody: Buffer, signature: string | undefined): boolean;
  /**
   * Exchanges the installation callback's OAuth `code` for the installing user's token and checks
   * that this user can access `installationId` (GitHub's recommended defence against forged ids).
   */
  userCanAccessInstallation(code: string, installationId: number): Promise<boolean>;
}

const SEGMENT_RE = /^[A-Za-z0-9_.-]{1,100}$/;
const SHA_RE = /^[0-9a-f]{40}$/;
const ALLOWED_ARCHIVE_HOSTS = new Set(['codeload.github.com']);

export class GithubRestClient implements GithubApi {
  readonly appConfigured: boolean;
  private readonly appAuth: ReturnType<typeof createAppAuth> | null;
  private readonly api: string;

  constructor(private readonly config: AppConfig) {
    this.api = config.GITHUB_API_URL.replace(/\/$/, '');
    this.appConfigured = config.capabilities.github;
    this.appAuth = this.appConfigured
      ? createAppAuth({ appId: config.GITHUB_APP_ID!, privateKey: config.GITHUB_APP_PRIVATE_KEY!.replace(/\\n/g, '\n') })
      : null;
  }

  installUrl(state: string) {
    if (!this.config.GITHUB_APP_SLUG) throw new GithubError(503, 'GitHub App is not configured');
    return `https://github.com/apps/${encodeURIComponent(this.config.GITHUB_APP_SLUG)}/installations/new?state=${encodeURIComponent(state)}`;
  }

  private async token(installationId: number | null): Promise<string | null> {
    if (installationId === null) return null;
    if (!this.appAuth) throw new GithubError(503, 'GitHub App is not configured');
    const auth = await this.appAuth({ type: 'installation', installationId });
    return auth.token;
  }

  private async appJwt() {
    if (!this.appAuth) throw new GithubError(503, 'GitHub App is not configured');
    return (await this.appAuth({ type: 'app' })).token;
  }

  private async request<T>(path: string, token: string | null): Promise<T> {
    const res = await fetch(`${this.api}${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'DIGITALYCloud',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new GithubError(res.status, res.status === 404 ? 'Not found' : `GitHub API error ${res.status}`);
    return (await res.json()) as T;
  }

  async getInstallation(installationId: number): Promise<GithubInstallationInfo> {
    const jwt = await this.appJwt();
    const i = await this.request<{ id: number; account: { login: string; type: string }; repository_selection: string; suspended_at: string | null }>(`/app/installations/${installationId}`, jwt);
    return {
      id: i.id,
      login: i.account.login,
      accountType: i.account.type === 'Organization' ? 'Organization' : 'User',
      repositorySelection: i.repository_selection === 'selected' ? 'selected' : 'all',
      suspended: Boolean(i.suspended_at),
    };
  }

  async listInstallationRepos(installationId: number): Promise<GithubRepoInfo[]> {
    const token = await this.token(installationId);
    const out: GithubRepoInfo[] = [];
    for (let page = 1; page <= 10; page++) {
      const r = await this.request<{ repositories: RawRepo[] }>(`/installation/repositories?per_page=100&page=${page}`, token);
      out.push(...r.repositories.map(toRepo));
      if (r.repositories.length < 100) break;
    }
    return out;
  }

  async getRepo(installationId: number | null, owner: string, repo: string) {
    assertSegments(owner, repo);
    return toRepo(await this.request<RawRepo>(`/repos/${owner}/${repo}`, await this.token(installationId)));
  }

  async listBranches(installationId: number | null, owner: string, repo: string) {
    assertSegments(owner, repo);
    const token = await this.token(installationId);
    const out: string[] = [];
    for (let page = 1; page <= 5; page++) {
      const r = await this.request<{ name: string }[]>(`/repos/${owner}/${repo}/branches?per_page=100&page=${page}`, token);
      out.push(...r.map((b) => b.name));
      if (r.length < 100) break;
    }
    return out;
  }

  async getBranchHead(installationId: number | null, owner: string, repo: string, branch: string) {
    assertSegments(owner, repo);
    const b = await this.request<{ commit: RawCommit }>(`/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`, await this.token(installationId));
    return toCommit(b.commit);
  }

  async getCommit(installationId: number | null, owner: string, repo: string, sha: string) {
    assertSegments(owner, repo);
    if (!SHA_RE.test(sha)) throw new GithubError(400, 'Invalid commit');
    return toCommit(await this.request<RawCommit>(`/repos/${owner}/${repo}/commits/${sha}`, await this.token(installationId)));
  }

  async downloadTarball(installationId: number | null, owner: string, repo: string, sha: string): Promise<Readable> {
    assertSegments(owner, repo);
    if (!SHA_RE.test(sha)) throw new GithubError(400, 'Invalid commit');
    const token = await this.token(installationId);
    const first = await fetch(`${this.api}/repos/${owner}/${repo}/tarball/${sha}`, {
      headers: { 'User-Agent': 'DIGITALYCloud', 'X-GitHub-Api-Version': '2022-11-28', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000),
    });
    let res = first;
    if (first.status >= 300 && first.status < 400) {
      const location = first.headers.get('location');
      const target = location ? new URL(location) : null;
      if (!target || target.protocol !== 'https:' || !ALLOWED_ARCHIVE_HOSTS.has(target.hostname)) throw new GithubError(502, 'Unexpected archive location');
      // The codeload URL is pre-signed; credentials are not forwarded.
      res = await fetch(target, { headers: { 'User-Agent': 'DIGITALYCloud' }, redirect: 'error', signal: AbortSignal.timeout(120_000) });
    }
    if (!res.ok || !res.body) throw new GithubError(res.status, 'Could not download the repository archive');
    return Readable.fromWeb(res.body as never);
  }

  async userCanAccessInstallation(code: string, installationId: number) {
    if (!this.config.GITHUB_CLIENT_ID || !this.config.GITHUB_CLIENT_SECRET) return false;
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'DIGITALYCloud' },
      body: JSON.stringify({ client_id: this.config.GITHUB_CLIENT_ID, client_secret: this.config.GITHUB_CLIENT_SECRET, code }),
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    const token = ((await tokenRes.json().catch(() => ({}))) as { access_token?: string }).access_token;
    if (!token) return false;
    for (let page = 1; page <= 10; page++) {
      const r = await this.request<{ installations: { id: number }[] }>(`/user/installations?per_page=100&page=${page}`, token);
      if (r.installations.some((i) => i.id === installationId)) return true;
      if (r.installations.length < 100) break;
    }
    return false;
  }

  verifyWebhook(rawBody: Buffer, signature: string | undefined) {
    if (!this.config.GITHUB_WEBHOOK_SECRET || !signature?.startsWith('sha256=')) return false;
    const expected = `sha256=${createHmac('sha256', this.config.GITHUB_WEBHOOK_SECRET).update(rawBody).digest('hex')}`;
    return safeEqual(expected, signature);
  }
}

interface RawRepo {
  id: number;
  full_name: string;
  default_branch: string;
  private: boolean;
}
interface RawCommit {
  sha: string;
  commit: { message: string; author?: { name?: string } | null };
  author?: { login?: string } | null;
}

const toRepo = (r: RawRepo): GithubRepoInfo => ({ id: r.id, fullName: r.full_name, defaultBranch: r.default_branch, private: r.private });
const toCommit = (c: RawCommit): GithubCommitInfo => ({
  sha: c.sha,
  message: (c.commit.message ?? '').split('\n')[0]!.slice(0, 200) || '(no message)',
  author: c.commit.author?.name ?? c.author?.login ?? 'unknown',
});

function assertSegments(owner: string, repo: string) {
  if (!SEGMENT_RE.test(owner) || !SEGMENT_RE.test(repo) || owner === '..' || repo === '..' || owner === '.' || repo === '.') throw new GithubError(400, 'Invalid repository');
}
