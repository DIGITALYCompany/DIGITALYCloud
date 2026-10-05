import { DEFAULT_NOTIFICATION_PREFERENCES, MESSAGES, normalizeEmail, type NotificationPreferences, type UpdateProfileInput } from '@digitalycloud/shared';
import { ctx } from '../../context';
import { withTransaction } from '../../db/connection';
import { Session, User, type SessionDoc, type UserDoc } from '../../db/models';
import { dispatchNow } from '../../jobs/outbox';
import { audit } from '../../lib/audit';
import { AppError, badRequest, conflict, forbidden, invalidCredentials, notFound } from '../../lib/errors';
import { queueEmail } from '../email/email.service';
import { hashPassword, verifyPassword } from '../auth/passwords';
import { revokeSession, revokeUserSessions } from '../auth/sessions.service';
import { queueEmailVerification } from '../auth/tokens.service';
import { consumeRecoveryCode, consumeTotp, generateRecoveryCodes, hashRecoveryCode, matchTotp, newTotpSecret, totpAad } from '../auth/totp';

/** Sensitive changes without a password (Google-only accounts) need a sign-in within this window. */
export const REAUTH_WINDOW_MS = 15 * 60_000;
const PENDING_TOTP_TTL_MS = 15 * 60_000;

const flush = (ids: string[]) => dispatchNow(ctx().queues, ids);

export function isValidTimezone(tz: string) {
  if (tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/.test(tz) || tz === 'UTC';
  } catch {
    return false;
  }
}

/**
 * Reauthentication for sensitive changes: the current password when the account has one,
 * otherwise a recent sign-in (Google-only accounts).
 */
export async function requireReauth(user: UserDoc, session: SessionDoc, currentPassword: string | undefined) {
  if (user.passwordHash) {
    if (!currentPassword) throw new AppError(401, 'INVALID_CREDENTIALS', 'Enter your current password to confirm this change.', { currentPassword: 'Enter your current password.' });
    if (!(await verifyPassword(user.passwordHash, currentPassword))) throw invalidCredentials('Your current password is incorrect.');
    return;
  }
  if (Date.now() - session.authenticatedAt.getTime() > REAUTH_WINDOW_MS) {
    throw forbidden('For your security, sign in again before making this change.', 'REAUTH_REQUIRED');
  }
}

export async function updateProfile(user: UserDoc, session: SessionDoc, input: UpdateProfileInput) {
  const set: Partial<UserDoc> = {};
  if (input.name !== undefined) set.name = input.name.trim();
  if (input.language !== undefined) set.language = input.language;
  if (input.timezone !== undefined) set.timezone = input.timezone;
  let outbox: string[] = [];

  const wantsEmail = input.email !== undefined && normalizeEmail(input.email) !== user.emailNormalized;
  if (wantsEmail) {
    await requireReauth(user, session, input.currentPassword);
    const target = normalizeEmail(input.email!);
    if (await User.exists({ emailNormalized: target })) throw conflict(MESSAGES.emailTaken, 'CONFLICT', { email: MESSAGES.emailTaken });
    // The address only changes once the new owner clicks the link sent to it.
    set.pendingEmail = input.email!.trim();
    set.pendingEmailNormalized = target;
  } else if (input.email !== undefined && user.pendingEmail) {
    // Re-entering the current address cancels a pending change.
    set.pendingEmail = null;
    set.pendingEmailNormalized = null;
  }

  const updated = await withTransaction(async (s) => {
    const u = await User.findOneAndUpdate({ _id: user._id, status: 'active' }, { $set: set }, { session: s }).lean<UserDoc>();
    if (!u) throw notFound('User');
    if (wantsEmail) {
      outbox = [
        ...(await queueEmailVerification(s, u, u.pendingEmail!, true)),
        ...(await queueEmail(s, { key: `emailchange:${u._id}:${Date.now()}`, to: user.email, template: 'email_change_notice', data: { name: u.name, newEmail: u.pendingEmail! } })),
      ];
      await audit({ action: 'account.email_change_requested', actorUserId: u._id }, s);
    }
    return u;
  });
  await flush(outbox);
  return updated;
}

export async function changePassword(user: UserDoc, session: SessionDoc, input: { currentPassword?: string; newPassword: string }) {
  if (user.passwordHash) {
    if (!input.currentPassword || !(await verifyPassword(user.passwordHash, input.currentPassword))) throw invalidCredentials('Your current password is incorrect.');
  } else if (Date.now() - session.authenticatedAt.getTime() > REAUTH_WINDOW_MS) {
    // Google-only accounts set their first password right after signing in.
    throw forbidden('For your security, sign in again before setting a password.', 'REAUTH_REQUIRED');
  }
  const passwordHash = await hashPassword(input.newPassword);
  let outbox: string[] = [];
  await withTransaction(async (s) => {
    await User.updateOne({ _id: user._id }, { $set: { passwordHash, passwordChangedAt: new Date() } }, { session: s });
    await revokeUserSessions(user._id, { except: session._id, session: s });
    outbox = await queueEmail(s, { key: `pwchanged:${user._id}:${Date.now()}`, to: user.email, template: 'password_changed', data: { name: user.name } });
    await audit({ action: user.passwordHash ? 'account.password_changed' : 'account.password_set', actorUserId: user._id }, s);
  });
  await ctx().hub.control(user._id, { type: 'session_revoked', sessionId: null });
  await flush(outbox);
}

export async function listSessions(userId: string) {
  return Session.find({ userId, revokedAt: null, expiresAt: { $gt: new Date() } })
    .sort({ lastSeenAt: -1 })
    .limit(100)
    .lean<SessionDoc[]>();
}

export async function deleteSession(userId: string, currentSessionId: string, id: string) {
  if (id === currentSessionId) throw badRequest('VALIDATION_ERROR', 'You can’t sign out the current session here. Use Log out instead.');
  const found = await Session.findOne({ _id: id, userId, revokedAt: null }).lean<SessionDoc>();
  if (!found) throw notFound('Session');
  await revokeSession(id);
  await ctx().hub.control(userId, { type: 'session_revoked', sessionId: id });
  await audit({ action: 'account.session_revoked', actorUserId: userId, targetType: 'session', targetId: id });
}

// ---------------------------------------------------------------------------------------------
// Two-factor authentication: pending setup is separate from confirmed enablement.

export async function setupTwoFactor(user: UserDoc) {
  if (user.twoFactor.enabled) throw conflict('Two-factor authentication is already on.');
  const s = await newTotpSecret(user.email);
  await User.updateOne(
    { _id: user._id },
    { $set: { 'twoFactor.pendingSecretEnc': ctx().cipher.encrypt(s.secret, totpAad(user._id, 'pending')), 'twoFactor.pendingCreatedAt': new Date() } },
  );
  return s;
}

export async function enableTwoFactor(user: UserDoc, code: string) {
  if (user.twoFactor.enabled) throw conflict('Two-factor authentication is already on.');
  const pending = user.twoFactor.pendingSecretEnc;
  if (!pending || !user.twoFactor.pendingCreatedAt || Date.now() - user.twoFactor.pendingCreatedAt.getTime() > PENDING_TOTP_TTL_MS) {
    throw badRequest('VALIDATION_ERROR', 'Start the setup again: the QR code expired.');
  }
  const secret = ctx().cipher.decrypt(pending, totpAad(user._id, 'pending'));
  const step = matchTotp(secret, code.trim());
  if (step === null) throw badRequest('VALIDATION_ERROR', MESSAGES.code, { fields: { code: MESSAGES.code } });
  const codes = generateRecoveryCodes();
  const res = await User.updateOne(
    { _id: user._id, 'twoFactor.enabled': false },
    {
      $set: {
        'twoFactor.enabled': true,
        'twoFactor.secretEnc': ctx().cipher.encrypt(secret, totpAad(user._id, 'active')),
        'twoFactor.pendingSecretEnc': null,
        'twoFactor.pendingCreatedAt': null,
        'twoFactor.enabledAt': new Date(),
        'twoFactor.lastUsedStep': step,
        'twoFactor.recoveryCodes': codes.map((c) => ({ hash: hashRecoveryCode(user._id, c), usedAt: null })),
      },
    },
  );
  if (res.modifiedCount !== 1) throw conflict('Two-factor authentication is already on.');
  await audit({ action: 'account.2fa_enabled', actorUserId: user._id });
  return codes;
}

export async function disableTwoFactor(user: UserDoc, input: { password?: string; code?: string }) {
  if (!user.twoFactor.enabled) throw conflict('Two-factor authentication is already off.');
  let ok = false;
  if (input.password !== undefined) ok = Boolean(user.passwordHash) && (await verifyPassword(user.passwordHash, input.password));
  else if (input.code !== undefined) ok = /^\d{6}$/.test(input.code.trim()) ? await consumeTotp(user, input.code.trim()) : await consumeRecoveryCode(user, input.code);
  if (!ok) throw invalidCredentials(input.password !== undefined ? 'Your current password is incorrect.' : MESSAGES.code);
  let outbox: string[] = [];
  await withTransaction(async (s) => {
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          'twoFactor.enabled': false,
          'twoFactor.secretEnc': null,
          'twoFactor.pendingSecretEnc': null,
          'twoFactor.pendingCreatedAt': null,
          'twoFactor.enabledAt': null,
          'twoFactor.lastUsedStep': null,
          'twoFactor.recoveryCodes': [],
        },
      },
      { session: s },
    );
    outbox = await queueEmail(s, { key: `2fa-off:${user._id}:${Date.now()}`, to: user.email, template: 'two_factor_disabled', data: { name: user.name } });
    await audit({ action: 'account.2fa_disabled', actorUserId: user._id }, s);
  });
  await flush(outbox);
}

// ---------------------------------------------------------------------------------------------

export function preferencesOf(user: UserDoc): NotificationPreferences {
  return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...(user.notificationPreferences ?? {}) };
}

export async function updatePreferences(userId: string, patch: Partial<NotificationPreferences>) {
  const set = Object.fromEntries(Object.entries(patch).map(([k, v]) => [`notificationPreferences.${k}`, v]));
  const u = await User.findOneAndUpdate({ _id: userId }, { $set: set }).lean<UserDoc>();
  if (!u) throw notFound('User');
  return preferencesOf(u);
}
