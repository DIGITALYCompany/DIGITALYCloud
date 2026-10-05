import { randomBytes } from 'node:crypto';

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const ALPHABET_62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** Unbiased random string over an alphabet (rejection sampling). */
export function randomString(length: number, alphabet = ALPHABET): string {
  const max = 256 - (256 % alphabet.length);
  let out = '';
  while (out.length < length) {
    for (const b of randomBytes(length * 2)) {
      if (b < max) out += alphabet[b % alphabet.length];
      if (out.length === length) break;
    }
  }
  return out;
}

export const randomBase62 = (length: number) => randomString(length, ALPHABET_62);

/**
 * Public ids are string `_id` values with a type prefix (`usr_…`, `dep_…`), 16 base-36 chars (~82 bits).
 * Services are the exception: their `_id` is the immutable public slug.
 */
export const PREFIXES = {
  user: 'usr',
  team: 'team',
  membership: 'mem',
  invitation: 'ivt',
  session: 'ses',
  oauthIdentity: 'oid',
  token: 'tok',
  challenge: 'chl',
  deployment: 'dep',
  env: 'env',
  apiKey: 'key',
  notification: 'ntf',
  ticket: 'tkt',
  upload: 'upl',
  invoice: 'inv',
  billingOp: 'bop',
  outbox: 'obx',
  audit: 'aud',
  contact: 'cnt',
  feedback: 'fbk',
  githubInstallation: 'ghi',
  reservation: 'rsv',
  incident: 'inc',
  maintenance: 'mnt',
  deletion: 'del',
  subscriptionItem: 'sitm',
} as const;

export type IdKind = keyof typeof PREFIXES;

export const newId = (kind: IdKind) => `${PREFIXES[kind]}_${randomString(16)}`;

/** Checks a client-supplied id before it reaches a query (wrong prefix → simply not found). */
export const isId = (kind: IdKind, v: unknown): v is string => typeof v === 'string' && new RegExp(`^${PREFIXES[kind]}_[a-z0-9]{6,32}$`).test(v);
