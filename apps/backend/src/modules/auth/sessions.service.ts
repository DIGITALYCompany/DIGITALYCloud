import type { ClientSession } from 'mongoose';
import { Session, User, type SessionDoc, type UserDoc } from '../../db/models';
import { REMEMBER_MS, SESSION_ONLY_MS } from '../../http/cookies';
import { randomToken, sha256 } from '../../lib/crypto';
import { newId } from '../../lib/ids';
import { describeUserAgent } from '../../lib/user-agent';

/** How often a remembered session's expiry slides forward (and `lastSeenAt` is written). */
const TOUCH_INTERVAL_MS = 5 * 60_000;

export interface NewSessionInput {
  userId: string;
  remember: boolean;
  method: SessionDoc['method'];
  userAgent: string | null;
  ip: string | null;
  activeTeamId: string | null;
}

/** Creates a session and returns the opaque token for the cookie. Only its SHA-256 hash is stored. */
export async function createSession(input: NewSessionInput, session?: ClientSession) {
  const token = randomToken(32);
  const now = new Date();
  const doc: SessionDoc = {
    _id: newId('session'),
    tokenHash: sha256(token),
    userId: input.userId,
    remember: input.remember,
    activeTeamId: input.activeTeamId,
    authenticatedAt: now,
    method: input.method,
    userAgent: input.userAgent?.slice(0, 512) ?? null,
    device: describeUserAgent(input.userAgent),
    ip: input.ip,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + (input.remember ? REMEMBER_MS : SESSION_ONLY_MS)),
    revokedAt: null,
  };
  await Session.create([doc], session ? { session } : {});
  return { token, session: doc };
}

/**
 * Resolves a cookie token. Expiry and revocation are checked here on every request, independent
 * of the TTL index (which only cleans up eventually).
 */
export async function resolveSession(token: string): Promise<{ session: SessionDoc; user: UserDoc } | null> {
  if (!token || token.length > 128) return null;
  const now = new Date();
  const session = await Session.findOne({ tokenHash: sha256(token), revokedAt: null, expiresAt: { $gt: now } }).lean<SessionDoc>();
  if (!session) return null;
  const user = await User.findOne({ _id: session.userId, status: 'active' }).lean<UserDoc>();
  if (!user) return null;
  return { session, user };
}

/**
 * Remembered sessions slide to 30 days from the last activity; browser-session logins keep their
 * absolute 12-hour expiry. Returns true when the cookie should be re-issued.
 */
export async function touchSession(s: SessionDoc): Promise<boolean> {
  const now = Date.now();
  if (now - s.lastSeenAt.getTime() < TOUCH_INTERVAL_MS) return false;
  const update: Partial<SessionDoc> = { lastSeenAt: new Date(now) };
  if (s.remember) update.expiresAt = new Date(now + REMEMBER_MS);
  await Session.updateOne({ _id: s._id, revokedAt: null }, { $set: update });
  s.lastSeenAt = update.lastSeenAt!;
  if (update.expiresAt) s.expiresAt = update.expiresAt;
  return s.remember;
}

export async function revokeSession(id: string, session?: ClientSession) {
  await Session.updateOne({ _id: id, revokedAt: null }, { $set: { revokedAt: new Date(), expiresAt: new Date() } }, session ? { session } : {});
}

/** Revokes every session of a user, optionally keeping one (password change keeps the current one). */
export async function revokeUserSessions(userId: string, opts: { except?: string; session?: ClientSession } = {}) {
  const filter: Record<string, unknown> = { userId, revokedAt: null };
  if (opts.except) filter._id = { $ne: opts.except };
  const ids = (await Session.find(filter, { _id: 1 }, opts.session ? { session: opts.session } : {}).lean<{ _id: string }[]>()).map((s) => s._id);
  if (ids.length) await Session.updateMany({ _id: { $in: ids } }, { $set: { revokedAt: new Date(), expiresAt: new Date() } }, opts.session ? { session: opts.session } : {});
  return ids;
}

