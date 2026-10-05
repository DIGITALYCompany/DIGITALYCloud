import { Secret, TOTP } from 'otpauth';
import QRCode from 'qrcode';
import { User, type UserDoc } from '../../db/models';
import { ctx } from '../../context';
import { randomString } from '../../lib/ids';

const PERIOD = 30;
const ISSUER = 'DIGITALYCloud';
const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export const totpAad = (userId: string, slot: 'active' | 'pending') => `totp:${userId}:${slot}`;

function totpFor(secretBase32: string, label: string) {
  return new TOTP({ issuer: ISSUER, label, algorithm: 'SHA1', digits: 6, period: PERIOD, secret: Secret.fromBase32(secretBase32) });
}

export async function newTotpSecret(label: string) {
  const secret = new Secret({ size: 20 });
  const totp = new TOTP({ issuer: ISSUER, label, algorithm: 'SHA1', digits: 6, period: PERIOD, secret });
  const otpauthUrl = totp.toString();
  return { secret: secret.base32, otpauthUrl, qrCodeDataUrl: await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 240 }) };
}

/** Returns the matched time step (±1 step tolerance), or null. */
export function matchTotp(secretBase32: string, code: string, label = 'user'): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const delta = totpFor(secretBase32, label).validate({ token: code, window: 1 });
  if (delta === null) return null;
  return Math.floor(Date.now() / 1000 / PERIOD) + delta;
}

/**
 * Verifies a TOTP code for an enabled account and atomically records its time step, so the same
 * code (or an older one) can never be accepted twice.
 */
export async function consumeTotp(user: UserDoc, code: string): Promise<boolean> {
  if (!user.twoFactor.enabled || !user.twoFactor.secretEnc) return false;
  const secret = ctx().cipher.decrypt(user.twoFactor.secretEnc, totpAad(user._id, 'active'));
  const step = matchTotp(secret, code);
  if (step === null) return false;
  const res = await User.updateOne(
    { _id: user._id, 'twoFactor.enabled': true, $or: [{ 'twoFactor.lastUsedStep': null }, { 'twoFactor.lastUsedStep': { $lt: step } }] },
    { $set: { 'twoFactor.lastUsedStep': step } },
  );
  return res.modifiedCount === 1;
}

export const normalizeRecoveryCode = (code: string) => code.trim().toLowerCase().replace(/\s+/g, '');
const RECOVERY_RE = /^[a-z0-9]{4}-[a-z0-9]{4}$/;

/** Recovery codes are stored as keyed HMACs, so a database leak does not allow offline guessing. */
export const hashRecoveryCode = (userId: string, code: string) => ctx().secrets.hmac('recovery-code', `${userId}:${normalizeRecoveryCode(code)}`);

export function generateRecoveryCodes(n = 10) {
  return Array.from({ length: n }, () => `${randomString(4, RECOVERY_ALPHABET)}-${randomString(4, RECOVERY_ALPHABET)}`);
}

/** Atomically marks one unused recovery code as used. */
export async function consumeRecoveryCode(user: UserDoc, code: string): Promise<boolean> {
  const normalized = normalizeRecoveryCode(code);
  if (!RECOVERY_RE.test(normalized)) return false;
  const hash = hashRecoveryCode(user._id, normalized);
  const res = await User.updateOne(
    { _id: user._id, 'twoFactor.enabled': true, 'twoFactor.recoveryCodes': { $elemMatch: { hash, usedAt: null } } },
    { $set: { 'twoFactor.recoveryCodes.$[c].usedAt': new Date() } },
    { arrayFilters: [{ 'c.hash': hash, 'c.usedAt': null }] },
  );
  return res.modifiedCount === 1;
}

/** Accepts a 6-digit TOTP code or a recovery code. */
export async function verifySecondFactor(user: UserDoc, code: string) {
  return /^\d{6}$/.test(code.trim()) ? consumeTotp(user, code.trim()) : consumeRecoveryCode(user, code);
}
