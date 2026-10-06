import { existsSync } from 'node:fs';
import { z } from 'zod';
import { PLAN_LEVELS, SERVICE_TYPE_IDS } from '@digitalycloud/shared';

/**
 * Configuration, validated once per process. Core settings (database, Redis, encryption, app secret)
 * are always required. Integrations are optional capabilities: a capability is either fully configured
 * or absent. Partially configured integrations are startup errors, and absent ones make their
 * operations fail with a clear configuration error instead of pretending to succeed.
 */

const bool = (def: boolean) =>
  z
    .enum(['true', 'false', '1', '0', 'yes', 'no', ''])
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : ['true', '1', 'yes'].includes(v)));
const optional = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === '' ? undefined : v.trim()));
const int = (def: number, min = 0, max = Number.MAX_SAFE_INTEGER) => z.coerce.number().int().min(min).max(max).default(def);
const csv = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []));

const CAPABILITIES = ['google', 'github', 'stripe', 'email', 'storage', 'runtime'] as const;
export type Capability = (typeof CAPABILITIES)[number];

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  PORT: int(4000, 1, 65535),
  HOST: z.string().default('0.0.0.0'),
  /** Private listener for the proxy route feed and Prometheus metrics. Disabled when unset. */
  INTERNAL_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  INTERNAL_HOST: z.string().default('127.0.0.1'),
  INTERNAL_API_TOKEN: optional,
  API_PUBLIC_URL: z.url().default('http://localhost:4000'),
  FRONTEND_URL: z.url().default('http://localhost:3000'),
  /** Exact origins allowed for CORS and CSRF checks. Defaults to FRONTEND_URL's origin. */
  CORS_ORIGINS: csv,
  COOKIE_DOMAIN: optional,
  COOKIE_SECURE: bool(false),
  /** Express `trust proxy`: `false`, a hop count, or a comma-separated list of trusted addresses/subnets. */
  TRUST_PROXY: z.string().default('false'),

  MONGODB_URI: z.string({ error: 'MONGODB_URI is required' }),
  REDIS_URL: z.string({ error: 'REDIS_URL is required' }),
  REDIS_PREFIX: z.string().default('dgc'),
  /** `kid:base64(32 bytes)` pairs, comma-separated. The primary id encrypts; all ids decrypt (rotation). */
  ENCRYPTION_KEYS: z.string({ error: 'ENCRYPTION_KEYS is required' }),
  ENCRYPTION_PRIMARY_KEY_ID: z.string({ error: 'ENCRYPTION_PRIMARY_KEY_ID is required' }),
  /** HMAC root secret for CSRF tokens, OAuth bindings and IP hashing. ≥ 32 characters. */
  APP_SECRET: z.string({ error: 'APP_SECRET is required' }).min(32, 'APP_SECRET must be at least 32 characters'),

  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  GOOGLE_REDIRECT_URI: optional,
  GOOGLE_ISSUER: z.url().default('https://accounts.google.com'),

  GITHUB_APP_ID: optional,
  GITHUB_APP_SLUG: optional,
  GITHUB_APP_PRIVATE_KEY: optional,
  GITHUB_WEBHOOK_SECRET: optional,
  /** The App's OAuth client credentials (installation callbacks are verified with the installing user's token). */
  GITHUB_CLIENT_ID: optional,
  GITHUB_CLIENT_SECRET: optional,
  GITHUB_API_URL: z.url().default('https://api.github.com'),

  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,
  /** JSON object mapping `type:plan` (e.g. `discord:starter`) to a Stripe price id for every paid plan. */
  STRIPE_PRICES: optional,
  STRIPE_AUTOMATIC_TAX: bool(false),

  /** Brevo API key (xkeysib-…). Empty = no email is sent. */
  BREVO_API_KEY: optional,
  /** Sender shown on emails; must be a sender or domain verified in Brevo. */
  BREVO_SENDER_EMAIL: z.email({ error: 'BREVO_SENDER_EMAIL must be an email address' }).default('no-reply@digitaly.fr'),
  BREVO_SENDER_NAME: z.string().default('DIGITALYCloud'),
  /** Receives support tickets and contact-form messages. */
  SUPPORT_INBOX: z.email().default('support@digitaly.fr'),

  STORAGE_DRIVER: z.enum(['s3', 'filesystem', '']).optional(),
  STORAGE_DIR: z.string().default('.data/storage'),
  S3_ENDPOINT: optional,
  S3_REGION: z.string().default('eu-west-3'),
  S3_BUCKET: optional,
  S3_ACCESS_KEY_ID: optional,
  S3_SECRET_ACCESS_KEY: optional,
  S3_FORCE_PATH_STYLE: bool(false),

  UPLOAD_MAX_MB: int(100, 1, 10_000),
  UPLOAD_MAX_LARGE_MB: int(500, 1, 10_000),
  UPLOAD_MAX_EXPANDED_MB: int(2048, 1, 100_000),
  UPLOAD_MAX_FILES: int(50_000, 1, 1_000_000),
  UPLOAD_TMP_DIR: z.string().default(''),

  RUNTIME_DRIVER: z.enum(['docker', 'disabled']).default('disabled'),
  PUBLIC_RUNTIME_DOMAIN: z.string().default('digitaly.app'),
  PUBLIC_RUNTIME_SCHEME: z.enum(['https', 'http']).default('https'),
  PUBLIC_RUNTIME_PORT: optional,
  REGISTRY_URL: optional,
  REGISTRY_USERNAME: optional,
  REGISTRY_PASSWORD: optional,
  /** JSON object mapping Node.js majors to pinned base images, e.g. {"24":"node:24-alpine@sha256:…"}. */
  RUNTIME_NODE_IMAGES: optional,
  RUNTIME_PROBE_IMAGE: z.string().default('busybox:1.37'),
  RUNTIME_OCI_RUNTIME: optional,
  RUNTIME_CONTAINER_USER: z.string().default('10001:10001'),
  /** Development only: allow hosts that cannot enforce disk quotas. Refused in production. */
  RUNTIME_ALLOW_UNENFORCED_STORAGE: bool(false),
  HEALTH_CHECK_SECONDS: int(30, 1, 600),
  BUILD_TIMEOUT_SECONDS: int(900, 30, 7200),
  STOP_TIMEOUT_SECONDS: int(10, 1, 120),
  ROUTE_DRAIN_SECONDS: int(15, 0, 600),
  /** How long start/stop/restart requests wait for the worker before answering with the in-progress state. */
  CONTROL_WAIT_MS: int(20_000, 0, 120_000),

  WORKER_DEPLOY_CONCURRENCY: int(2, 1, 64),
  WORKER_ROLES: csv,
  SSE_MAX_PER_USER: int(12, 1, 1000),
  REQUIRED_CAPABILITIES: csv,
});

export type RawEnv = z.infer<typeof schema>;

export interface KeyRing {
  primaryId: string;
  keys: Map<string, Buffer>;
}

function parseKeyRing(spec: string, primaryId: string): KeyRing {
  const keys = new Map<string, Buffer>();
  for (const part of spec.split(',').map((s) => s.trim()).filter(Boolean)) {
    const idx = part.indexOf(':');
    if (idx < 1) throw new Error('ENCRYPTION_KEYS entries must look like kid:base64key');
    const kid = part.slice(0, idx);
    const key = Buffer.from(part.slice(idx + 1), 'base64');
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(kid)) throw new Error(`Invalid encryption key id "${kid}"`);
    if (key.length !== 32) throw new Error(`Encryption key "${kid}" must decode to exactly 32 bytes`);
    if (keys.has(kid)) throw new Error(`Duplicate encryption key id "${kid}"`);
    keys.set(kid, key);
  }
  if (!keys.has(primaryId)) throw new Error(`ENCRYPTION_PRIMARY_KEY_ID "${primaryId}" is not in ENCRYPTION_KEYS`);
  return { primaryId, keys };
}

function parseTrustProxy(v: string): boolean | number | string[] {
  if (v === 'false' || v === '') return false;
  if (v === 'true') throw new Error('TRUST_PROXY=true trusts every proxy; set a hop count or the proxy addresses instead');
  if (/^\d+$/.test(v)) return Number(v);
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * An optional integration is on only when every variable of its group is set. A partly filled group
 * doesn't stop the server: the integration stays off (its features answer "not configured") and a
 * warning names the missing variables.
 */
function group(raw: RawEnv, keys: (keyof RawEnv)[], name: string, warnings: string[]) {
  const set = keys.filter((k) => raw[k] !== undefined && raw[k] !== '');
  if (set.length === 0) return false;
  if (set.length !== keys.length) {
    warnings.push(`${name} is disabled until these are set: ${keys.filter((k) => !set.includes(k)).join(', ')}`);
    return false;
  }
  return true;
}

function parseJsonObject(value: string | undefined, name: string, errors: string[]): Record<string, string> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.values(parsed).some((v) => typeof v !== 'string')) throw new Error();
    return parsed as Record<string, string>;
  } catch {
    errors.push(`${name} must be a JSON object of strings`);
    return {};
  }
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env) {
  // An empty value means "not set", so `PORT=` in .env behaves like no line at all and the default applies.
  const present = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v.trim() !== ''));
  const parsed = schema.safeParse(present);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
    throw new Error(`Invalid configuration:\n  ${msg}`);
  }
  const raw = parsed.data;
  const errors: string[] = [];
  const warnings: string[] = [];
  const production = raw.NODE_ENV === 'production';

  const keyRing = (() => {
    try {
      return parseKeyRing(raw.ENCRYPTION_KEYS, raw.ENCRYPTION_PRIMARY_KEY_ID);
    } catch (e) {
      errors.push((e as Error).message);
      return { primaryId: raw.ENCRYPTION_PRIMARY_KEY_ID, keys: new Map<string, Buffer>() };
    }
  })();

  const frontendOrigin = new URL(raw.FRONTEND_URL).origin;
  const corsOrigins = raw.CORS_ORIGINS.length ? raw.CORS_ORIGINS.map((o) => new URL(o).origin) : [frontendOrigin];

  if (raw.COOKIE_DOMAIN) {
    const d = raw.COOKIE_DOMAIN.replace(/^\./, '').toLowerCase();
    const runtime = raw.PUBLIC_RUNTIME_DOMAIN.toLowerCase();
    if (d === runtime || d.endsWith(`.${runtime}`) || runtime.endsWith(`.${d}`)) errors.push('COOKIE_DOMAIN must not cover the customer runtime domain');
    if (!d.includes('.')) errors.push('COOKIE_DOMAIN must be a registrable host such as cloud.digitaly.fr');
  }
  if (production && !raw.COOKIE_SECURE) errors.push('COOKIE_SECURE must be true in production');
  if (production && raw.RUNTIME_ALLOW_UNENFORCED_STORAGE) errors.push('RUNTIME_ALLOW_UNENFORCED_STORAGE is a development option and is refused in production');
  if (production && raw.STORAGE_DRIVER === 'filesystem') errors.push('STORAGE_DRIVER=filesystem is for development only');
  if (raw.INTERNAL_PORT && (!raw.INTERNAL_API_TOKEN || raw.INTERNAL_API_TOKEN.length < 32)) errors.push('INTERNAL_PORT requires INTERNAL_API_TOKEN (≥ 32 characters)');

  let trustProxy: boolean | number | string[] = false;
  try {
    trustProxy = parseTrustProxy(raw.TRUST_PROXY);
  } catch (e) {
    errors.push((e as Error).message);
  }

  const google = group(raw, ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'], 'Google OAuth', warnings);
  const github = group(raw, ['GITHUB_APP_ID', 'GITHUB_APP_SLUG', 'GITHUB_APP_PRIVATE_KEY', 'GITHUB_WEBHOOK_SECRET', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'], 'GitHub App', warnings);
  let stripe = group(raw, ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICES'], 'Stripe', warnings);
  const email = Boolean(raw.BREVO_API_KEY);
  if (raw.BREVO_API_KEY && !raw.BREVO_API_KEY.startsWith('xkeysib-')) {
    errors.push('BREVO_API_KEY must be a Brevo API key (xkeysib-…). SMTP keys (xsmtpsib-…) do not work with the API');
  }
  const storageDriver = raw.STORAGE_DRIVER || (raw.S3_BUCKET ? 's3' : production ? undefined : 'filesystem');
  const storage =
    storageDriver === 'filesystem' ? true : storageDriver === 's3' ? group(raw, ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'], 'S3 storage', warnings) : false;
  const runtime = raw.RUNTIME_DRIVER === 'docker';

  const priceProblems: string[] = [];
  const stripePrices = parseJsonObject(raw.STRIPE_PRICES, 'STRIPE_PRICES', priceProblems);
  if (stripe) {
    for (const t of SERVICE_TYPE_IDS) for (const p of PLAN_LEVELS.slice(1)) if (!stripePrices[`${t}:${p}`]) priceProblems.push(`missing ${t}:${p}`);
    if (priceProblems.length) {
      warnings.push(`Stripe is disabled until STRIPE_PRICES is complete: ${priceProblems.join(', ')}`);
      stripe = false;
    }
  }
  const nodeImages = { '24': 'node:24-alpine', '22': 'node:22-alpine', ...parseJsonObject(raw.RUNTIME_NODE_IMAGES, 'RUNTIME_NODE_IMAGES', errors) };

  const capabilities: Record<Capability, boolean> = { google, github, stripe, email, storage, runtime };
  const required = raw.REQUIRED_CAPABILITIES.length ? raw.REQUIRED_CAPABILITIES : production ? ['email', 'storage', 'runtime'] : [];
  for (const c of required) {
    if (!(CAPABILITIES as readonly string[]).includes(c)) errors.push(`REQUIRED_CAPABILITIES has unknown capability "${c}"`);
    else if (!capabilities[c as Capability]) errors.push(`Required capability "${c}" is not configured`);
  }

  if (errors.length) throw new Error(`Invalid configuration:\n  ${[...errors, ...warnings].join('\n  ')}`);

  return {
    ...raw,
    production,
    keyRing,
    frontendOrigin,
    corsOrigins,
    trustProxy,
    capabilities,
    requiredCapabilities: required as Capability[],
    /** Partly configured optional integrations (logged at startup; those integrations stay off). */
    warnings,
    storageDriver: storageDriver as 's3' | 'filesystem' | undefined,
    stripePrices,
    nodeImages: nodeImages as Record<string, string>,
    googleRedirectUri: raw.GOOGLE_REDIRECT_URI ?? `${raw.API_PUBLIC_URL.replace(/\/$/, '')}/v1/auth/google/callback`,
  };
}

export type AppConfig = ReturnType<typeof loadConfig>;

let current: AppConfig | null = null;

/** Loads `.env` outside production (production receives its environment from the orchestrator). */
export function loadDotEnv() {
  if (process.env.NODE_ENV !== 'production' && existsSync('.env')) process.loadEnvFile('.env');
}

export function config(): AppConfig {
  current ??= loadConfig();
  return current;
}

