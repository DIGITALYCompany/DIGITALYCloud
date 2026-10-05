import express, { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { safeRedirectPath } from '@digitalycloud/shared';
import { ctx } from '../../context';
import { OAuthState } from '../../db/models';
import { OAUTH_COOKIE, apiCookieOptions } from '../../http/cookies';
import { query } from '../../http/validate';
import { randomToken, sha256 } from '../../lib/crypto';
import { newId } from '../../lib/ids';
import { requireSession, sessionUser } from '../../middleware/authenticate';
import { authorize, tenantOf } from '../../middleware/tenant';
import { consumeOAuthState } from '../auth/auth.service';
import { acceptGithubDelivery, bindInstallation, listBranches, listRepos, teamInstallations } from './github.service';

const reposSchema = z.strictObject({ q: z.string().max(100).optional(), team: z.string().max(64).optional() });
const SEGMENT = /^[A-Za-z0-9_.-]{1,100}$/;

const back = (res: Response, from: string, status: string) => {
  const url = new URL(from, ctx().config.FRONTEND_URL);
  url.searchParams.set('github', status);
  res.redirect(302, `${ctx().config.FRONTEND_URL.replace(/\/$/, '')}${url.pathname}${url.search}`);
};

export function githubRouter() {
  const r = Router();

  r.get('/integrations/github', requireSession, authorize('github.manage'), async (req, res) => {
    const installs = await teamInstallations(tenantOf(req).team._id);
    res.json({ connected: installs.some((i) => !i.suspendedAt), configured: ctx().integrations.github.appConfigured, accounts: installs.map((i) => ({ login: i.accountLogin, installationId: i.installationId })) });
  });

  /** Browser navigation (`?team=` scopes it). The state is bound to this browser, session and team. */
  r.get('/integrations/github/install', requireSession, authorize('github.manage'), async (req: Request, res) => {
    const from = safeRedirectPath(typeof req.query.from === 'string' ? req.query.from : null, '/services/new');
    const gh = ctx().integrations.github;
    if (!gh.appConfigured) return back(res, from, 'unavailable');
    const { user, session } = sessionUser(req);
    const state = randomToken(32);
    const binding = randomToken(32);
    const now = new Date();
    await OAuthState.create({
      _id: newId('challenge'),
      stateHash: sha256(state),
      purpose: 'github_install',
      bindingHash: sha256(binding),
      nonce: null,
      codeVerifierEnc: null,
      from,
      userId: user._id,
      sessionId: session._id,
      teamId: tenantOf(req).team._id,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 15 * 60_000),
      consumedAt: null,
    });
    res.cookie(OAUTH_COOKIE, binding, apiCookieOptions(ctx().config, 15 * 60_000));
    res.redirect(302, gh.installUrl(state));
  });

  /** GitHub redirects here after installation (“Request user authorization during installation” must be on). */
  r.get('/integrations/github/callback', async (req, res) => {
    const binding = req.cookies?.[OAUTH_COOKIE] as string | undefined;
    res.clearCookie(OAUTH_COOKIE, { ...apiCookieOptions(ctx().config, 0), maxAge: undefined });
    const st = await consumeOAuthState(typeof req.query.state === 'string' ? req.query.state : undefined, binding, 'github_install');
    if (!st) return back(res, '/services/new', 'error');
    // The callback must come back to the same signed-in session that started it.
    if (req.auth?.kind !== 'session' || req.auth.session._id !== st.sessionId) return back(res, st.from, 'error');
    const installationId = Number(req.query.installation_id);
    if (!Number.isSafeInteger(installationId) || installationId <= 0) return back(res, st.from, 'error');
    const result = await bindInstallation(st.teamId!, st.userId!, installationId, typeof req.query.code === 'string' ? req.query.code : undefined).catch((err: unknown) => {
      req.log.warn({ err }, 'github installation binding failed');
      return 'error' as const;
    });
    back(res, st.from, result);
  });

  r.get('/integrations/github/repos', requireSession, authorize('github.manage'), async (req, res) => {
    const repos = await listRepos(tenantOf(req).team._id, query(req, reposSchema).q);
    res.json({ data: repos.map((x) => ({ fullName: x.fullName, defaultBranch: x.defaultBranch, private: x.private })), nextCursor: null });
  });

  r.get('/integrations/github/repos/:owner/:repo/branches', requireSession, authorize('github.manage'), async (req, res) => {
    const owner = String(req.params.owner);
    const repo = String(req.params.repo);
    if (!SEGMENT.test(owner) || !SEGMENT.test(repo)) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Repository not found' } });
    res.json({ data: (await listBranches(tenantOf(req).team._id, owner, repo)).map((name) => ({ name })), nextCursor: null });
  });

  return r;
}

/** `POST /webhooks/github`: signature-verified raw body, durable receipt, then asynchronous processing. */
export function githubWebhookRouter() {
  const r = Router();
  r.post('/github', express.raw({ type: 'application/json', limit: '5mb' }), async (req, res) => {
    const raw = req.body as Buffer;
    if (!Buffer.isBuffer(raw) || !ctx().integrations.github.verifyWebhook(raw, req.get('x-hub-signature-256'))) {
      res.status(401).json({ error: { code: 'INVALID_SIGNATURE', message: 'Invalid signature' } });
      return;
    }
    const delivery = req.get('x-github-delivery');
    const event = req.get('x-github-event') ?? 'unknown';
    if (!delivery || delivery.length > 100) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Missing delivery id' } });
      return;
    }
    if (event === 'ping') return void res.status(204).end();
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
    } catch {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body.' } });
      return;
    }
    const result = await acceptGithubDelivery(delivery, event, payload);
    res.status(result === 'duplicate' ? 200 : 202).json({ received: true });
  });
  return r;
}
