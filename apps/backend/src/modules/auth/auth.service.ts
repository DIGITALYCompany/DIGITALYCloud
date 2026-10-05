import { MESSAGES, normalizeEmail, safeRedirectPath } from '@digitalycloud/shared';
import { ctx } from '../../context';
import { withTransaction } from '../../db/connection';
import { AuthChallenge, OAuthIdentity, OAuthState, User, type AuthChallengeDoc, type OAuthIdentityDoc, type OAuthStateDoc, type UserDoc } from '../../db/models';
import { dispatchNow } from '../../jobs/outbox';
import { audit } from '../../lib/audit';
import { randomToken, sha256 } from '../../lib/crypto';
import { AppError, conflict, invalidCredentials, notConfigured, validation } from '../../lib/errors';
import { newId } from '../../lib/ids';
import { pkce } from '../../integrations/google';
import { frontendLink, queueEmail } from '../email/email.service';
import { hashPassword, needsRehash, verifyPassword } from './passwords';
import { createSession, revokeUserSessions } from './sessions.service';
import { RESET_TTL_MS, consumeToken, invalidateTokens, issueToken, queueEmailVerification } from './tokens.service';
import { verifySecondFactor } from './totp';
import { createUserWithTeam, findActiveUserByEmail } from './users.service';

export interface ClientMeta {
  userAgent: string | null;
  ip: string | null;
}

const CHALLENGE_TTL_MS = 5 * 60_000;
const MAX_CHALLENGE_ATTEMPTS = 5;
const OAUTH_STATE_TTL_MS = 10 * 60_000;

const flush = (ids: string[]) => dispatchNow(ctx().queues, ids);

// ---------------------------------------------------------------------------------------------
// Signup and password login

export async function signup(input: { name: string; email: string; password: string }, meta: ClientMeta) {
  const passwordHash = await hashPassword(input.password);
  let outbox: string[] = [];
  const result = await withTransaction(async (session) => {
    const created = await createUserWithTeam(session, { name: input.name.trim(), email: input.email, passwordHash, emailVerified: false });
    outbox = await queueEmailVerification(session, created.user, created.user.email, false);
    const s = await createSession({ userId: created.user._id, remember: true, method: 'signup', userAgent: meta.userAgent, ip: meta.ip, activeTeamId: created.team._id }, session);
    await audit({ action: 'auth.signup', actorUserId: created.user._id, teamId: created.team._id, ip: meta.ip }, session);
    return { ...created, token: s.token };
  });
  await flush(outbox);
  return result;
}

export type LoginResult = { kind: 'session'; user: UserDoc; token: string; remember: boolean } | { kind: 'challenge'; challengeToken: string };

export async function login(input: { email: string; password: string; remember: boolean }, meta: ClientMeta): Promise<LoginResult> {
  const user = await findActiveUserByEmail(input.email);
  const ok = await verifyPassword(user?.passwordHash, input.password);
  if (!user || !ok) {
    await audit({ action: 'auth.login_failed', actorUserId: user?._id ?? null, ip: meta.ip, meta: { emailHash: sha256(normalizeEmail(input.email)).slice(0, 16) } });
    throw invalidCredentials();
  }
  if (user.passwordHash && needsRehash(user.passwordHash)) await User.updateOne({ _id: user._id }, { $set: { passwordHash: await hashPassword(input.password) } });
  if (user.twoFactor.enabled) return { kind: 'challenge', challengeToken: await createChallenge(user._id, input.remember, 'password') };
  return { kind: 'session', user, remember: input.remember, token: await startSession(user, input.remember, 'password', meta) };
}

async function startSession(user: UserDoc, remember: boolean, method: 'password' | 'google', meta: ClientMeta) {
  const s = await createSession({ userId: user._id, remember, method, userAgent: meta.userAgent, ip: meta.ip, activeTeamId: user.defaultTeamId });
  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
  await audit({ action: 'auth.login', actorUserId: user._id, ip: meta.ip, meta: { method } });
  return s.token;
}

async function createChallenge(userId: string, remember: boolean, method: 'password' | 'google') {
  const token = randomToken(32);
  const now = new Date();
  const doc: AuthChallengeDoc = {
    _id: newId('challenge'),
    kind: '2fa_login',
    tokenHash: sha256(token),
    userId,
    remember,
    method,
    attempts: 0,
    createdAt: now,
    expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS),
    consumedAt: null,
  };
  await AuthChallenge.create(doc);
  return token;
}

/**
 * Second step of a 2FA login. Each attempt is counted before the code is checked (5 per challenge),
 * codes are single-use (TOTP step tracking, recovery codes marked used), and the challenge itself is
 * consumed atomically, so one challenge can produce at most one session.
 */
export async function verifyTwoFactorLogin(input: { challengeToken: string; code: string }, meta: ClientMeta) {
  const invalid = () => invalidCredentials(MESSAGES.code);
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(input.challengeToken)) throw invalid();
  const challenge = await AuthChallenge.findOneAndUpdate(
    { tokenHash: sha256(input.challengeToken), consumedAt: null, expiresAt: { $gt: new Date() }, attempts: { $lt: MAX_CHALLENGE_ATTEMPTS } },
    { $inc: { attempts: 1 } },
  ).lean<AuthChallengeDoc>();
  if (!challenge) throw new AppError(401, 'INVALID_CREDENTIALS', 'This sign-in attempt expired. Please sign in again.');
  const user = await User.findOne({ _id: challenge.userId, status: 'active' }).lean<UserDoc>();
  if (!user || !(await verifySecondFactor(user, input.code))) {
    await audit({ action: 'auth.2fa_failed', actorUserId: challenge.userId, ip: meta.ip });
    throw invalid();
  }
  const consumed = await AuthChallenge.findOneAndUpdate({ _id: challenge._id, consumedAt: null }, { $set: { consumedAt: new Date() } }).lean<AuthChallengeDoc>();
  if (!consumed) throw invalid();
  return { user, remember: challenge.remember, token: await startSession(user, challenge.remember, challenge.method, meta) };
}

// ---------------------------------------------------------------------------------------------
// Password reset

/** Always succeeds from the caller's point of view, whether or not the email is registered. */
export async function requestPasswordReset(email: string) {
  const user = await findActiveUserByEmail(email);
  if (!user) return;
  let outbox: string[] = [];
  await withTransaction(async (session) => {
    await invalidateTokens(user._id, 'password_reset', session);
    const { token, doc } = await issueToken(session, 'password_reset', user._id, user.email, RESET_TTL_MS);
    outbox = await queueEmail(session, {
      key: `reset:${doc._id}`,
      to: user.email,
      template: 'password_reset',
      data: { name: user.name, url: frontendLink(`/reset-password?token=${encodeURIComponent(token)}`) },
    });
  });
  await flush(outbox);
}

/** Single use, one-hour links. Sets the password, revokes every session, and confirms the email (the link proved ownership). */
export async function resetPassword(input: { token: string; password: string }) {
  const passwordHash = await hashPassword(input.password);
  let outbox: string[] = [];
  const userId = await withTransaction(async (session) => {
    const t = await consumeToken('password_reset', input.token, session);
    if (!t) throw validation(MESSAGES.reset, 'token');
    const user = await User.findOneAndUpdate({ _id: t.userId, status: 'active' }, { $set: { passwordHash, passwordChangedAt: new Date() } }, { session }).lean<UserDoc>();
    if (!user) throw validation(MESSAGES.reset, 'token');
    if (!user.emailVerifiedAt && t.email && normalizeEmail(t.email) === user.emailNormalized) await User.updateOne({ _id: user._id }, { $set: { emailVerifiedAt: new Date() } }, { session });
    await revokeUserSessions(user._id, { session });
    outbox = await queueEmail(session, { key: `pwchanged:${t._id}`, to: user.email, template: 'password_changed', data: { name: user.name } });
    await audit({ action: 'auth.password_reset', actorUserId: user._id }, session);
    return user._id;
  });
  // Open event streams of the revoked sessions close themselves.
  await ctx().hub.control(userId, { type: 'session_revoked', sessionId: null });
  await flush(outbox);
}

// ---------------------------------------------------------------------------------------------
// Email verification

export async function verifyEmail(token: string) {
  const userId = await withTransaction(async (session) => {
    const t = await consumeToken('email_verify', token, session);
    if (!t?.email) throw validation(MESSAGES.verification, 'token');
    const user = await User.findOne({ _id: t.userId, status: 'active' }, null, { session }).lean<UserDoc>();
    if (!user) throw validation(MESSAGES.verification, 'token');
    const target = normalizeEmail(t.email);
    if (target === user.emailNormalized) {
      await User.updateOne({ _id: user._id }, { $set: { emailVerifiedAt: user.emailVerifiedAt ?? new Date() } }, { session });
    } else if (target === user.pendingEmailNormalized) {
      const taken = await User.exists({ emailNormalized: target, _id: { $ne: user._id } }).session(session);
      if (taken) throw conflict(MESSAGES.emailTaken);
      try {
        await User.updateOne(
          { _id: user._id },
          { $set: { email: user.pendingEmail!, emailNormalized: target, emailVerifiedAt: new Date(), pendingEmail: null, pendingEmailNormalized: null } },
          { session },
        );
      } catch (e) {
        throw conflict(MESSAGES.emailTaken);
      }
      await audit({ action: 'account.email_changed', actorUserId: user._id }, session);
    } else {
      throw validation(MESSAGES.verification, 'token');
    }
    return user._id;
  });
  return userId;
}

export async function resendVerification(user: UserDoc) {
  const target = user.pendingEmail ?? (user.emailVerifiedAt ? null : user.email);
  if (!target) return;
  let outbox: string[] = [];
  await withTransaction(async (session) => {
    outbox = await queueEmailVerification(session, user, target, Boolean(user.pendingEmail));
  });
  await flush(outbox);
}

// ---------------------------------------------------------------------------------------------
// Google sign-in (OIDC authorization code + PKCE, state + nonce, browser-bound)

export async function startGoogle(from: string) {
  const google = ctx().integrations.google;
  if (!google) throw notConfigured('Google sign-in', 'GOOGLE_NOT_CONFIGURED');
  const state = randomToken(32);
  const binding = randomToken(32);
  const nonce = pkce.nonce();
  const verifier = pkce.verifier();
  const now = new Date();
  const id = newId('challenge');
  const doc: OAuthStateDoc = {
    _id: id,
    stateHash: sha256(state),
    purpose: 'google_login',
    bindingHash: sha256(binding),
    nonce,
    codeVerifierEnc: ctx().cipher.encrypt(verifier, `oauth:${id}`),
    from: safeRedirectPath(from, '/dashboard'),
    userId: null,
    sessionId: null,
    teamId: null,
    createdAt: now,
    expiresAt: new Date(now.getTime() + OAUTH_STATE_TTL_MS),
    consumedAt: null,
  };
  await OAuthState.create(doc);
  const url = await google.authorizationUrl({ state, nonce, codeChallenge: await pkce.challenge(verifier) });
  return { url, binding };
}

/** Consumes an OAuth state bound to this browser (cookie) and purpose. */
export async function consumeOAuthState(state: string | undefined, binding: string | undefined, purpose: OAuthStateDoc['purpose']) {
  if (!state || !binding || state.length > 128 || binding.length > 128) return null;
  return OAuthState.findOneAndUpdate(
    { stateHash: sha256(state), bindingHash: sha256(binding), purpose, consumedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { consumedAt: new Date() } },
  ).lean<OAuthStateDoc>();
}

export type GoogleResult =
  | { kind: 'session'; token: string; from: string }
  | { kind: 'challenge'; challengeToken: string; from: string }
  | { kind: 'error'; code: 'google' | 'google_unverified' | 'google_link_unverified' | 'account_unavailable'; from: string };

/**
 * Linking policy (takeover-resistant):
 * 1. A known Google identity (`sub`) signs into its linked user.
 * 2. Otherwise, a Google-verified email matching a local account links only if that local email
 *    was itself verified; an unverified local account is never linked (pre-registration hijack).
 * 3. Otherwise a new verified account (with personal team) is created.
 * Accounts with 2FA still need their second factor; no session is issued before it.
 */
export async function finishGoogle(callbackUrl: URL, binding: string | undefined, meta: ClientMeta): Promise<GoogleResult> {
  const google = ctx().integrations.google;
  const st = await consumeOAuthState(callbackUrl.searchParams.get('state') ?? undefined, binding, 'google_login');
  const from = st?.from ?? '/dashboard';
  if (!google || !st || !st.nonce || !st.codeVerifierEnc) return { kind: 'error', code: 'google', from };
  let identity;
  try {
    identity = await google.exchange(callbackUrl, {
      state: callbackUrl.searchParams.get('state')!,
      nonce: st.nonce,
      codeVerifier: ctx().cipher.decrypt(st.codeVerifierEnc, `oauth:${st._id}`),
    });
  } catch (err) {
    ctx().log.warn({ err }, 'google code exchange failed');
    return { kind: 'error', code: 'google', from };
  }

  let user: UserDoc | null = null;
  const linked = await OAuthIdentity.findOne({ provider: 'google', providerUserId: identity.sub }).lean<OAuthIdentityDoc>();
  if (linked) {
    user = await User.findOne({ _id: linked.userId }).lean<UserDoc>();
    if (!user || user.status !== 'active') return { kind: 'error', code: 'account_unavailable', from };
    await OAuthIdentity.updateOne({ _id: linked._id }, { $set: { lastUsedAt: new Date(), email: identity.email, emailVerified: identity.emailVerified } });
  } else {
    if (!identity.emailVerified || !identity.email) return { kind: 'error', code: 'google_unverified', from };
    const existing = await User.findOne({ emailNormalized: normalizeEmail(identity.email) }).lean<UserDoc>();
    if (existing) {
      if (existing.status !== 'active') return { kind: 'error', code: 'account_unavailable', from };
      if (!existing.emailVerifiedAt) return { kind: 'error', code: 'google_link_unverified', from };
      await OAuthIdentity.create({ _id: newId('oauthIdentity'), provider: 'google', providerUserId: identity.sub, userId: existing._id, email: identity.email, emailVerified: true, createdAt: new Date(), lastUsedAt: new Date() });
      await audit({ action: 'auth.google_linked', actorUserId: existing._id, ip: meta.ip });
      user = existing;
    } else {
      try {
        user = await withTransaction(async (session) => {
          const created = await createUserWithTeam(session, { name: identity.name, email: identity.email, passwordHash: null, emailVerified: true });
          await OAuthIdentity.create(
            [{ _id: newId('oauthIdentity'), provider: 'google', providerUserId: identity.sub, userId: created.user._id, email: identity.email, emailVerified: true, createdAt: new Date(), lastUsedAt: new Date() }],
            { session },
          );
          await audit({ action: 'auth.signup', actorUserId: created.user._id, teamId: created.team._id, ip: meta.ip, meta: { method: 'google' } }, session);
          return created.user;
        });
      } catch (e) {
        if (e instanceof AppError && e.status === 409) return { kind: 'error', code: 'google', from };
        throw e;
      }
    }
  }

  if (user.twoFactor.enabled) return { kind: 'challenge', challengeToken: await createChallenge(user._id, true, 'google'), from };
  return { kind: 'session', token: await startSession(user, true, 'google', meta), from };
}
