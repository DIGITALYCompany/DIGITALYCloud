// Creates apps/backend/.env from .env.example with freshly generated local secrets.
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
  INTERNAL_API_TOKEN: randomBytes(32).toString('base64url'),
  ENCRYPTION_KEYS: `k1:${randomBytes(32).toString('base64')}`,
  APP_SECRET: randomBytes(48).toString('base64url'),
};
const out = readFileSync(`${dir}.env.example`, 'utf8').replace(/^([A-Z0-9_]+)=__generate__$/gm, (_, k) => `${k}=${values[k]}`);
writeFileSync(target, out, { mode: 0o600 });
console.log('Wrote apps/backend/.env with generated INTERNAL_API_TOKEN, ENCRYPTION_KEYS and APP_SECRET.');
