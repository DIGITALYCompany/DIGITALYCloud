import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { MAX_PASSWORD_LENGTH, MESSAGES, MIN_PASSWORD_LENGTH, isValidEmail, safeRedirectPath } from '@digitalycloud/shared';
import { ctx } from '../../context';
import { jsonSmall } from '../../http/body';
import { OAUTH_COOKIE, apiCookieOptions, clearSessionCookie, setSessionCookie } from '../../http/cookies';
import { body, str } from '../../http/validate';
import { requireSession } from '../../middleware/authenticate';
import { issueCsrfToken } from '../../middleware/csrf';
import { authLimit, clientIp, consume, limit } from '../../middleware/rate-limit';
import { highestPlan, toUserDto } from '../../serializers/user';
import { resolveSessionTenant } from '../../middleware/tenant';
import { audit } from '../../lib/audit';
import { User, type UserDoc } from '../../db/models';
import * as auth from './auth.service';
import { revokeSession } from './sessions.service';

const email = z
  .string({ error: MESSAGES.email })
  .trim()
  .max(254, { error: MESSAGES.email })
  .refine(isValidEmail, { error: MESSAGES.email });
const newPassword = z.string({ error: MESSAGES.password }).min(MIN_PASSWORD_LENGTH, { error: MESSAGES.password }).max(MAX_PASSWORD_LENGTH, { error: MESSAGES.passwordTooLong });

const signupSchema = z.strictObject({
  name: z.string({ error: MESSAGES.name }).trim().min(2, { error: MESSAGES.name }).max(100, { error: MESSAGES.name }),
  email,
  password: newPassword,
});
/** Login only checks credentials (no length rule beyond a sane maximum). */
const loginSchema = z.strictObject({
  email,
  password: str(MESSAGES.credentials, MAX_PASSWORD_LENGTH),
  remember: z.boolean({ error: 'remember must be true or false.' }).optional().default(false),
});
const twoFactorSchema = z.strictObject({ challengeToken: str(MESSAGES.code, 200), code: str(MESSAGES.code, 32).trim().min(6, { error: MESSAGES.code }) });
const forgotSchema = z.strictObject({ email });
const resetSchema = z.strictObject({ token: str(MESSAGES.reset, 200), password: newPassword });
const verifySchema = z.strictObject({ token: str(MESSAGES.verification, 200) });

export const meta = (req: Request): auth.ClientMeta => ({ userAgent: req.get('user-agent')?.slice(0, 512) ?? null, ip: clientIp(req) });

export async function userResponse(user: UserDoc, teamId?: string | null) {
  return toUserDto(user, await highestPlan(teamId ?? user.defaultTeamId));
}

function frontendRedirect(res: Response, path: string) {
  res.redirect(302, `${ctx().config.FRONTEND_URL.replace(/\/$/, '')}${path}`);
}

export function authRouter() {
  const r = Router();

  /** CSRF bootstrap: sets the HttpOnly `dgc_csrf` cookie and returns the header token. */
  r.get('/auth/csrf', (req, res) => {
    res.json({ csrfToken: issueCsrfToken(req, res) });
  });

  r.get('/auth/session', async (req, res) => {
    if (req.auth?.kind !== 'session') return res.json({ user: null });
    const teamId = await resolveSessionTenant(req).then((t) => t.team._id, () => req.auth?.kind === 'session' ? req.auth.session.activeTeamId : null);
    res.json({ user: await userResponse(req.auth.user, teamId) });
  });

  r.post('/auth/signup', jsonSmall, authLimit, async (req, res) => {
    const input = body(req, signupSchema);
    const { user, team, token } = await auth.signup(input, meta(req));
    setSessionCookie(res, ctx().config, token, true);
    res.status(201).json(await userResponse(user, team._id));
  });

  r.post('/auth/login', jsonSmall, authLimit, async (req, res) => {
    const input = body(req, loginSchema);
    const result = await auth.login(input, meta(req));
    if (result.kind === 'challenge') return res.json({ twoFactorRequired: true, challengeToken: result.challengeToken });
    setSessionCookie(res, ctx().config, result.token, result.remember);
    res.json(await userResponse(result.user));
  });

  r.post('/auth/2fa/verify', jsonSmall, limit('twoFactorIp'), async (req, res) => {
    const input = body(req, twoFactorSchema);
    const result = await auth.verifyTwoFactorLogin(input, meta(req));
    setSessionCookie(res, ctx().config, result.token, result.remember);
    res.json(await userResponse(result.user));
  });

  r.post('/auth/password/forgot', jsonSmall, authLimit, async (req, res) => {
    const input = body(req, forgotSchema);
    await auth.requestPasswordReset(input.email);
    res.status(204).end();
  });

  r.post('/auth/password/reset', jsonSmall, authLimit, async (req, res) => {
    const input = body(req, resetSchema);
    await auth.resetPassword(input);
    // The reset revoked every session, including this browser's.
    clearSessionCookie(res, ctx().config);
    res.status(204).end();
  });

  /** Email verification (contract extension): public, so the link works on any device. */
  r.post('/auth/email/verify', jsonSmall, authLimit, async (req, res) => {
    const input = body(req, verifySchema);
    await auth.verifyEmail(input.token);
    res.status(204).end();
  });

  r.post('/auth/email/resend', jsonSmall, requireSession, async (req, res) => {
    if (req.auth?.kind !== 'session') return;
    await consume('emailResend', req.auth.user._id);
    const fresh = await User.findById(req.auth.user._id).lean<UserDoc>();
    if (fresh) await auth.resendVerification(fresh);
    res.status(204).end();
  });

  r.post('/auth/logout', jsonSmall, async (req, res) => {
    if (req.auth?.kind === 'session') {
      await revokeSession(req.auth.session._id);
      await audit({ action: 'auth.logout', actorUserId: req.auth.user._id, ip: clientIp(req) });
    }
    clearSessionCookie(res, ctx().config);
    res.status(204).end();
  });

  // Google OAuth: browser navigations, so failures redirect to the login page with an error code.
  r.get('/auth/google', async (req, res) => {
    const from = safeRedirectPath(typeof req.query.from === 'string' ? req.query.from : null, '/dashboard');
    try {
      await consume('authIp', clientIp(req));
      const { url, binding } = await auth.startGoogle(from);
      res.cookie(OAUTH_COOKIE, binding, apiCookieOptions(ctx().config, 10 * 60_000));
      res.redirect(302, url);
    } catch (err) {
      req.log.warn({ err }, 'google sign-in unavailable');
      frontendRedirect(res, `/login?error=${(err as { code?: string }).code === 'GOOGLE_NOT_CONFIGURED' ? 'google_unavailable' : 'google'}&from=${encodeURIComponent(from)}`);
    }
  });

  r.get('/auth/google/callback', async (req, res) => {
    const binding = req.cookies?.[OAUTH_COOKIE] as string | undefined;
    res.clearCookie(OAUTH_COOKIE, { ...apiCookieOptions(ctx().config, 0), maxAge: undefined });
    const url = new URL(req.originalUrl, ctx().config.API_PUBLIC_URL);
    if (url.searchParams.has('error')) return frontendRedirect(res, '/login?error=google');
    const result = await auth.finishGoogle(url, binding, meta(req));
    if (result.kind === 'error') return frontendRedirect(res, `/login?error=${result.code}&from=${encodeURIComponent(result.from)}`);
    if (result.kind === 'challenge') {
      // The challenge token travels in the fragment, which browsers never send to servers.
      return frontendRedirect(res, `/login?from=${encodeURIComponent(result.from)}#challenge=${encodeURIComponent(result.challengeToken)}`);
    }
    setSessionCookie(res, ctx().config, result.token, true);
    frontendRedirect(res, result.from);
  });

  return r;
}
