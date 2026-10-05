import argon2 from 'argon2';

/** OWASP-recommended Argon2id parameters (19 MiB memory, 2 iterations, 1 lane). */
const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

let dummyHash: Promise<string> | null = null;

export const hashPassword = (password: string) => argon2.hash(password, OPTIONS);

/**
 * Verifies a password. When the account does not exist or has no password, a dummy hash is
 * verified instead so response timing does not reveal whether the email is registered.
 */
export async function verifyPassword(hash: string | null | undefined, password: string): Promise<boolean> {
  if (!hash) {
    dummyHash ??= argon2.hash('dummy-password-for-timing', OPTIONS);
    await argon2.verify(await dummyHash, password).catch(() => false);
    return false;
  }
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export const needsRehash = (hash: string) => argon2.needsRehash(hash, OPTIONS);
