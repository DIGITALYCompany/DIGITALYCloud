import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import type { KeyRing } from '../config/env';

/** Ciphertext stored in MongoDB. `aad` is never stored: callers re-derive it from the record identity. */
export interface Encrypted {
  kid: string;
  iv: Buffer;
  tag: Buffer;
  ct: Buffer;
}

/**
 * AES-256-GCM with a fresh 96-bit nonce per value and authenticated metadata (AAD), e.g.
 * `env:<serviceId>:<envId>:<KEY>`. A ciphertext moved to another record fails to decrypt.
 */
export class Cipher {
  constructor(private readonly ring: KeyRing) {}

  encrypt(plaintext: string | Buffer, aad: string): Encrypted {
    const kid = this.ring.primaryId;
    const key = this.ring.keys.get(kid)!;
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', key, iv);
    c.setAAD(Buffer.from(aad, 'utf8'));
    const ct = Buffer.concat([c.update(typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext), c.final()]);
    return { kid, iv, tag: c.getAuthTag(), ct };
  }

  decryptBuffer(e: Encrypted, aad: string): Buffer {
    const key = this.ring.keys.get(e.kid);
    if (!key) throw new Error(`Unknown encryption key id ${e.kid}`);
    const d = createDecipheriv('aes-256-gcm', key, toBuffer(e.iv));
    d.setAAD(Buffer.from(aad, 'utf8'));
    d.setAuthTag(toBuffer(e.tag));
    return Buffer.concat([d.update(toBuffer(e.ct)), d.final()]);
  }

  decrypt(e: Encrypted, aad: string): string {
    return this.decryptBuffer(e, aad).toString('utf8');
  }

  /** True when the value was encrypted with an older key and should be rewritten. */
  needsRotation(e: Encrypted) {
    return e.kid !== this.ring.primaryId;
  }
}

/** MongoDB returns BSON Binary for Buffer fields in lean queries. */
function toBuffer(v: unknown): Buffer {
  if (Buffer.isBuffer(v)) return v;
  const b = v as { buffer?: ArrayBuffer | Buffer; value?: () => Buffer };
  if (b && typeof b.value === 'function') return Buffer.from(b.value());
  if (b?.buffer) return Buffer.from(b.buffer as ArrayBuffer);
  return Buffer.from(v as Uint8Array);
}

export const sha256 = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');

/** 32 random bytes, URL-safe. Used for session, reset, verification and invitation tokens. */
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export function safeEqual(a: string | Buffer, b: string | Buffer) {
  const x = Buffer.isBuffer(a) ? a : Buffer.from(a);
  const y = Buffer.isBuffer(b) ? b : Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Purpose-separated keys derived from APP_SECRET (HKDF-SHA256). */
export class SecretBox {
  private readonly cache = new Map<string, Buffer>();
  constructor(private readonly appSecret: string) {}

  key(purpose: string): Buffer {
    let k = this.cache.get(purpose);
    if (!k) {
      k = Buffer.from(hkdfSync('sha256', Buffer.from(this.appSecret, 'utf8'), Buffer.alloc(0), Buffer.from(`digitalycloud:${purpose}`), 32));
      this.cache.set(purpose, k);
    }
    return k;
  }

  hmac(purpose: string, value: string) {
    return createHmac('sha256', this.key(purpose)).update(value).digest('base64url');
  }
}
