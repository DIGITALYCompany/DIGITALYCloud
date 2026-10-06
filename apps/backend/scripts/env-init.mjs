// Creates apps/backend/.env from .env.example and fills the empty secret lines with freshly generated values.
// Refuses to overwrite an existing .env (delete it first if you really want new keys:
// data encrypted with the old ENCRYPTION_KEYS becomes unreadable).
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('..', import.meta.url));
const target = `${dir}.env`;
if (existsSync(target)) {
  console.log('.env already exists; leaving it unchanged.');
  process.exit(0);
}
const values = {
  ENCRYPTION_KEYS: `k1:${randomBytes(32).toString('base64')}`,
  ENCRYPTION_PRIMARY_KEY_ID: 'k1',
  APP_SECRET: randomBytes(48).toString('base64url'),
  INTERNAL_API_TOKEN: randomBytes(32).toString('base64url'),
};
const out = readFileSync(`${dir}.env.example`, 'utf8').replace(/^(ENCRYPTION_KEYS|ENCRYPTION_PRIMARY_KEY_ID|APP_SECRET|INTERNAL_API_TOKEN)=$/gm, (_, k) => `${k}=${values[k]}`);
writeFileSync(target, out, { mode: 0o600 });
console.log('Wrote apps/backend/.env with generated ENCRYPTION_KEYS, ENCRYPTION_PRIMARY_KEY_ID, APP_SECRET and INTERNAL_API_TOKEN.');
console.log('Now fill in MONGODB_URI and REDIS_URL (and BREVO_API_KEY for email).');
