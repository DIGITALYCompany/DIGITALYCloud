import type { ClientSession } from 'mongoose';
import { AuthToken, type AuthTokenDoc, type UserDoc } from '../../db/models';
import { randomToken, sha256 } from '../../lib/crypto';
import { newId } from '../../lib/ids';
import { frontendLink, queueEmail } from '../email/email.service';

export const RESET_TTL_MS = 3600_000;
export const VERIFY_TTL_MS = 24 * 3600_000;

/** Creates a single-use token (only its hash is stored) and returns the raw value for the link. */
export async function issueToken(session: ClientSession | null, kind: AuthTokenDoc['kind'], userId: string, email: string | null, ttlMs: number) {
  const token = randomToken(32);
  const now = new Date();
  const doc: AuthTokenDoc = { _id: newId('token'), kind, tokenHash: sha256(token), userId, email, createdAt: now, expiresAt: new Date(now.getTime() + ttlMs), usedAt: null };
  await AuthToken.create([doc], session ? { session } : {});
  return { token, doc };
}

/**
 * Atomically consumes a token. Expiry is checked in the query itself (the TTL index only cleans up
 * eventually), and `usedAt` makes replays fail.
 */
export async function consumeToken(kind: AuthTokenDoc['kind'], token: string, session?: ClientSession): Promise<AuthTokenDoc | null> {
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(token)) return null;
  return AuthToken.findOneAndUpdate(
    { tokenHash: sha256(token), kind, usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
    session ? { session } : {},
  ).lean<AuthTokenDoc>();
}

/** Invalidates outstanding tokens of a kind (e.g. older reset links when a new one is requested). */
export async function invalidateTokens(userId: string, kind: AuthTokenDoc['kind'], session?: ClientSession) {
  await AuthToken.updateMany({ userId, kind, usedAt: null }, { $set: { usedAt: new Date() } }, session ? { session } : {});
}

/** Sends a verification link for the account's address or a pending new address. */
export async function queueEmailVerification(session: ClientSession | null, user: Pick<UserDoc, '_id' | 'name'>, email: string, change: boolean) {
  if (session) await invalidateTokens(user._id, 'email_verify', session);
  const { token, doc } = await issueToken(session, 'email_verify', user._id, email, VERIFY_TTL_MS);
  return queueEmail(session, {
    key: `verify:${doc._id}`,
    to: email,
    template: change ? 'verify_new_email' : 'verify_email',
    data: { name: user.name, url: frontendLink(`/verify-email?token=${encodeURIComponent(token)}`) },
  });
}
