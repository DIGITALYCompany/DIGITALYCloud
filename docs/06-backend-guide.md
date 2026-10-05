# 06 — Backend guide

How to build `apps/backend` so it serves the contract in [05-api-reference.md](05-api-reference.md).
Everything here is **Proposed**. The folder currently holds only `package.json` with `express@^5.2.1`.

## 1. Stack and why

| Choice | Why |
| ------ | --- |
| **Node.js 22 + TypeScript** | Same language as the frontend. Types from `apps/frontend/lib/types.ts` can be shared. |
| **Express 5** | Already declared. Express 5 forwards rejected promises from `async` handlers to the error middleware, so no `try/catch` wrappers are needed. |
| **Zod** | One schema validates the request and gives the TS type. Mirrors the frontend rules. |
| **PostgreSQL 16 + Prisma (or Drizzle)** | Relational data (teams, services, deployments, billing). Migrations in git. |
| **Redis + BullMQ** | Deploy jobs, emails, usage alerts. Pub/sub to fan out SSE events across API instances. Latest-metrics cache. |
| **Docker Engine API** (`dockerode`) | Build and run service containers on each server (`Lyon-01`, `Paris-01`…). |
| **Server-Sent Events** | One-way, server→browser updates (deploy progress, logs, metrics, notifications). Works with cookies (`EventSource(url, { withCredentials: true })`), reconnects on its own, and is simpler than WebSockets for this traffic. |
| **argon2id** | Password hashing. |
| **Stripe** | Per-service subscription items with proration, Billing Portal for cards, hosted invoice PDFs. |
| **pino** | Structured JSON logs with request ids. Redact `authorization`, `cookie`, `password`, env values. |

## 2. Getting started

```bash
cd apps/backend
npm install express@^5 zod cookie-parser cors helmet pino pino-http argon2 bullmq ioredis dockerode stripe
npm install -D typescript tsx @types/node @types/express @types/cookie-parser @types/cors vitest supertest @types/supertest
npm install prisma @prisma/client && npx prisma init
```

`package.json` scripts:

```json
{
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "worker": "node dist/jobs/index.js",
    "test": "vitest run",
    "db:migrate": "prisma migrate dev",
    "db:seed": "tsx src/db/seed.ts"
  }
}
```

(Change `"type": "commonjs"` to `"module"`, or keep CommonJS and compile to it.)

Local services (`apps/backend/docker-compose.yml`):

```yaml
services:
  postgres:
    image: postgres:16
    environment: { POSTGRES_USER: dgc, POSTGRES_PASSWORD: dgc, POSTGRES_DB: digitalycloud }
    ports: ["5432:5432"]
  redis:
    image: redis:7
    ports: ["6379:6379"]
```

Run: `docker compose up -d && npm run db:migrate && npm run db:seed && npm run dev` → `http://localhost:4000/v1/health`.

## 3. Environment variables (`apps/backend/.env.example`)

```bash
# Server
PORT=4000
NODE_ENV=development
API_BASE_URL=http://localhost:4000          # https://api.cloud.digitaly.fr in prod
FRONTEND_URL=http://localhost:3000          # https://cloud.digitaly.fr in prod (CORS origin + redirects)
COOKIE_DOMAIN=                              # empty in dev, "cloud.digitaly.fr" in prod
SESSION_SECRET=change-me-32-bytes-min

# Data
DATABASE_URL=postgresql://dgc:dgc@localhost:5432/digitalycloud
REDIS_URL=redis://localhost:6379
ENV_ENCRYPTION_KEY=base64-32-bytes          # AES-256-GCM key for env vars + TOTP secrets

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:4000/v1/auth/google/callback

# GitHub App
GITHUB_APP_ID=
GITHUB_APP_SLUG=
GITHUB_APP_PRIVATE_KEY=                     # PEM, newlines as \n
GITHUB_WEBHOOK_SECRET=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Email
SMTP_URL=                                   # or provider API key
MAIL_FROM="DIGITALYCloud <no-reply@digitaly.fr>"
SUPPORT_INBOX=support@digitaly.fr

# Uploads (S3-compatible object storage)
S3_ENDPOINT=
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
UPLOAD_MAX_MB=100
```

Validate them all at boot in `src/config/env.ts` (Zod) and exit if any required value is missing.

## 4. App skeleton

```ts
// src/app.ts
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { authenticate } from './middleware/authenticate.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { webhookRoutes } from './modules/webhooks/webhooks.routes.js';
import { v1 } from './routes.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(pinoHttp({ redact: ['req.headers.authorization', 'req.headers.cookie'] }));
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));

  // Webhooks need the raw body for signature checks → before express.json()
  app.use('/v1/webhooks', express.raw({ type: '*/*' }), webhookRoutes);

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(authenticate);            // sets req.auth (or leaves it undefined)
  app.use('/v1', v1);               // all module routers
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
```

```ts
// src/routes.ts: mount one router per module
export const v1 = Router();
v1.get('/health', (_req, res) => res.json({ status: 'ok', version: pkg.version, time: Date.now() }));
v1.use('/auth', authRoutes);
v1.use('/me', requireAuth({ sessionOnly: true }), accountRoutes);
v1.use('/catalog', catalogRoutes);
v1.use('/services', requireAuth(), serviceRoutes);        // includes /:id/env, /:id/deploy, /:id/logs, /:id/metrics
v1.use('/deployments', requireAuth(), deploymentRoutes);
v1.use('/metrics', requireAuth({ sessionOnly: true }), metricsRoutes);
v1.use('/events', requireAuth({ sessionOnly: true }), eventsRoutes);
v1.use('/api-keys', requireAuth({ sessionOnly: true }), apiKeyRoutes);
v1.use('/notifications', requireAuth({ sessionOnly: true }), notificationRoutes);
v1.use('/team', requireAuth({ sessionOnly: true }), teamRoutes);
v1.use('/billing', requireAuth({ sessionOnly: true }), requireTeamRole('owner'), billingRoutes);
v1.use('/uploads', requireAuth({ sessionOnly: true }), uploadRoutes);
v1.use('/integrations/github', githubRoutes);
v1.use('/support', requireAuth({ sessionOnly: true }), supportRoutes);
v1.use('/contact', rateLimit('contact'), contactRoutes);
v1.use('/docs', rateLimit('contact'), docsFeedbackRoutes);
v1.use('/servers', requireAuth({ sessionOnly: true }), serverRoutes);
v1.use('/status', statusRoutes);
v1.use('/admin', requireAuth({ sessionOnly: true }), requirePlatformAdmin, adminRoutes);
```

### Module layout

Each `src/modules/<name>/` contains:

| File | Responsibility |
| ---- | -------------- |
| `<name>.routes.ts` | Express router: path → `validate(schema)` → permission middleware → controller |
| `<name>.schemas.ts` | Zod schemas for body/query/params |
| `<name>.controller.ts` | Reads `req`, calls the service, sends the serialised response |
| `<name>.service.ts` | Business rules + DB access. No Express types here, so it's easy to test. |

Example:

```ts
// src/modules/services/services.routes.ts
router.get('/', requireScope('read'), ctrl.list);
router.post('/', sessionOnly, requireTeamRole('owner', 'admin'), validate({ body: createServiceSchema }), ctrl.create);
router.get('/:id', requireScope('read'), ctrl.get);
router.patch('/:id', requireScope('full'), requireTeamRole('owner', 'admin'), validate({ body: updateServiceSchema }), ctrl.update);
router.post('/:id/restart', requireScope('full'), requireTeamRole('owner', 'admin', 'developer'), ctrl.restart);
router.post('/:id/plan', sessionOnly, requireTeamRole('owner', 'admin'), validate({ body: changePlanSchema }), ctrl.changePlan);
router.put('/:id/env', requireScope('full'), requireTeamRole('owner', 'admin'), validate({ body: setEnvSchema }), ctrl.setEnv);
```

```ts
// src/modules/services/services.schemas.ts: mirrors the wizard validation
export const createServiceSchema = z.object({
  name: z.string().trim().regex(/^[A-Za-z][\w-]{1,31}$/, 'Use 2–32 letters, numbers, dashes or underscores, starting with a letter.'),
  type: z.enum(['discord', 'node', 'api', 'worker']),
  source: z.enum(['github', 'upload', 'docker']),
  repo: z.string().trim().default(''),
  branch: z.string().trim().nullable().default(null),
  uploadId: z.string().nullable().default(null),
  nodeVersion: z.enum(['22 LTS', '20 LTS', '18']).default('22 LTS'),
  startCommand: z.string().trim().min(1, 'A start command is required.'),
  port: z.number().int().min(1).max(65535, 'Port must be between 1 and 65535.').nullable(),
  plan: z.enum(['free', 'starter', 'pro', 'business']),
  regionId: z.string(),
  env: z.array(z.object({ key: z.string().regex(/^[A-Z_][A-Z0-9_]*$/), value: z.string().max(32_768), secret: z.boolean() })).max(100),
}).superRefine((s, ctx) => {
  if ((s.type === 'api' || s.type === 'node') && !s.port) ctx.addIssue({ code: 'custom', path: ['port'], message: 'Web services need a port.' });
  if (s.source === 'github' && !/^[\w.-]+\/[\w.-]+$/.test(s.repo)) ctx.addIssue({ code: 'custom', path: ['repo'], message: 'Enter a repository like username/repo.' });
  if (s.source === 'docker' && s.repo.length < 3) ctx.addIssue({ code: 'custom', path: ['repo'], message: 'Enter a Docker image name.' });
  if (s.source === 'upload' && !s.uploadId) ctx.addIssue({ code: 'custom', path: ['uploadId'], message: 'Upload a .zip of your project.' });
});
```

## 5. Errors

```ts
// src/lib/errors.ts
export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Record<string, string>, public extra?: object) {
    super(message);
  }
}
export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const forbidden = () => new AppError(403, 'FORBIDDEN', 'You don’t have permission to do that.');
export const conflict = (msg: string) => new AppError(409, 'CONFLICT', msg);

// src/middleware/error-handler.ts
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    const fields = Object.fromEntries(err.issues.map((i) => [i.path.join('.'), i.message]));
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.issues[0].message, fields } });
  }
  if (err instanceof AppError) return res.status(err.status).json({ error: { code: err.code, message: err.message, fields: err.fields, ...err.extra } });
  req.log.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } });
};
```

`message` is shown to the user as-is by the frontend. Never put stack traces, SQL or internal ids in it.

## 6. Authentication

### Sessions (dashboard)

- On login/signup/OAuth: create a 32-byte random token, store `sha256(token)` in `sessions`, and set the cookie:
  `dgc_session=<token>; HttpOnly; Secure; SameSite=Lax; Path=/; Domain=${COOKIE_DOMAIN}` plus `Max-Age=30 days` when `remember` is true. Without `remember`, set no `Max-Age` (browser session) and a server-side `expires_at` of 12 h.
- `COOKIE_DOMAIN=cloud.digitaly.fr` lets both `cloud.digitaly.fr` (Next.js `proxy.ts` can see the cookie for redirects) and `api.cloud.digitaly.fr` share it. In dev, leave it empty (`localhost:3000` → `localhost:4000` is same-site, so cookies flow with `credentials: 'include'`).
- `authenticate` middleware: read the cookie → look up the hash → check `expires_at` → load the user and active team → `req.auth = { kind: 'session', user, team, role, sessionId }`.
- Password change/reset revokes other sessions. Logout deletes the row.

### API keys (public API)

- `Authorization: Bearer dgc_live_…` → `sha256(secret)` lookup in `api_keys` (unique index) → `req.auth = { kind: 'apiKey', team, scope, keyId }`.
- `requireScope('read')` allows GET. `requireScope('full')` is needed for writes. `sessionOnly` rejects keys with `403`.
- Update `last_used_at` at most once a minute (Redis throttle).

### Google OAuth

Standard authorization-code flow with a signed `state` carrying `from`. Link accounts by verified email. Google-only users have `password_hash = null` (Settings → Security should offer "Set a password").

### 2FA (TOTP)

Store the TOTP secret encrypted with `ENV_ENCRYPTION_KEY`. On login, if it's enabled, return `{ twoFactorRequired, challengeToken }` (a 5-minute signed token) instead of a session. Store hashed one-time recovery codes.

### Teams

Resolve the active team per request. Start simple: **the user's personal team**. When users can belong to several teams, add an `X-Team-Id` header (or a `team` field in the session) and a team switcher in the UI. Every query on services, keys, invoices and so on must filter by `team_id`, and return `404` (not `403`) for other teams' resources.

## 7. Serialisation

DB rows are snake_case `timestamptz`. The API is camelCase epoch ms. Do the conversion in one place (`src/lib/serializers.ts`):

```ts
export function serializeService(s: ServiceRow, live: LiveStats | null, opts: { env?: EnvVar[] }): Service {
  const plan = getServicePlan(s.type, s.plan);
  const region = getRegion(s.region_id)!;
  return {
    id: s.id, name: s.name, type: s.type, status: s.status,
    cpu: live?.cpu ?? 0, ramMb: live?.ramMb ?? 0, storageMb: s.storage_mb,
    ramLimitMb: plan.ramMb, storageLimitMb: plan.storageGb * 1024,
    startedAt: s.started_at?.getTime() ?? null, createdAt: s.created_at.getTime(), lastDeployAt: s.last_deploy_at?.getTime() ?? s.created_at.getTime(),
    region: `${region.country} — ${region.city}`, regionId: region.id, server: s.server_name ?? '',
    runtime: s.source === 'docker' ? 'Docker' : 'Node.js', nodeVersion: s.node_version, startCommand: s.start_command,
    port: s.port, url: s.port ? `https://${s.id}.digitaly.app` : null, plan: s.plan, source: s.source, repo: s.repo,
    branch: s.branch, autoDeploy: s.auto_deploy, autoRestart: s.auto_restart,
    ...(opts.env ? { env: opts.env } : {}),
  };
}
```

## 8. Deployment pipeline

```
POST /services or /services/:id/deploy  (API)
   │  insert deployment (status=building, stage=preparing), service.status=deploying
   │  publish deployment.created + service.updated
   │  enqueue BullMQ job "deploy" { deploymentId }
   ▼
deploy.worker.ts  (separate process, concurrency per server)
   1. preparing     pick/confirm server in region, create build context
   2. pulling       github: fetch tarball at branch HEAD via installation token (record SHA, message, author)
                    upload: download archive from S3 · docker: docker pull <image>
   3. installing    build image FROM node:<version>-alpine, detect npm/pnpm/yarn/bun lockfile, cache layers
   4. starting      run container with: CPU/RAM limits from plan, env vars (decrypted) + PORT,
                    DIGITALY_REGION, DIGITALY_DEPLOYMENT_ID; restart policy = autoRestart ? on-failure : no
   5. health_check  process stays up 30 s; if port → HTTP GET on the port must answer (any < 500)
   ├─ success → swap: stop old container, keep new; service running, startedAt=now; notification + email
   └─ failure → remove new container, old one keeps running (service stays running, else failed); notification + email
   Each line of output → deployment_logs + publish deployment.log
   Each stage change → publish deployment.updated
```

- Only one active deployment per service (`409` on the API side, plus a BullMQ job id = service id to deduplicate).
- Keep built image tags (`registry/dgc/<serviceId>:<deploymentNumber>`) so a rollback (`{ deploymentId }`) skips straight to **starting**.
- Redact secret env values from build logs before storing or publishing them.
- Routing: services with a port get `https://{id}.digitaly.app` through a reverse proxy (Traefik/Caddy) with wildcard TLS, pointing at the container on its server.

## 9. Real-time (SSE hub)

```ts
// src/modules/events/events.routes.ts
router.get('/', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  const teamId = req.auth!.team.id;
  const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const unsubscribe = hub.subscribe(`team:${teamId}`, send);          // Redis pub/sub under the hood
  const unsubUser = hub.subscribe(`user:${req.auth!.user.id}`, send); // notifications
  const ping = setInterval(() => res.write(': keep-alive\n\n'), 25_000);
  req.on('close', () => { clearInterval(ping); unsubscribe(); unsubUser(); });
});
```

Anything that changes state calls `hub.publish('team:<id>', 'service.updated', serializeService(...))`. API instances, the deploy worker and the metrics collector all publish through Redis, so every connected tab gets the event whichever instance it's on.
Proxies (Nginx, Cloudflare) must not buffer `text/event-stream`.

## 10. Metrics and logs

- **metrics.collector.ts**: every 2–5 s, read `docker stats` for running containers on each server. It then:
  - writes the latest sample to Redis (`svc:<id>:live`), which `GET /services` reads;
  - publishes `service.metrics` to the team channel;
  - keeps one sample per minute in `service_metrics` (aggregated for 24h / 7d / 30d), with 30-day retention.
- **Usage alerts**: above 80% of the RAM or storage limit → notification "High memory usage" + email (preference `usage`). Debounce to one alert per service per 6 h.
- **Runtime logs**: attach to container stdout/stderr. Each line becomes `{ id: incr, ts, level, text }`, where stderr or a line starting with `ERROR` → `error` and `WARN` → `warn`. Lines go to a Redis stream (live tail for SSE) and to `service_logs`.
  Retention: free = current deployment only; paid = longer (to be decided, e.g. 7/14/30 days by plan).
- **Crash detection**: container exits without a stop request → notification "Service crashed" (preference `crash`). With `autoRestart` the restart policy handles it, otherwise `status=failed`.

## 11. Security checklist

- [ ] Every team-scoped query filters by `team_id`. Cross-team access returns `404`.
- [ ] `/admin/*` checks `User.role === 'admin'` on the server (the UI check is cosmetic).
- [ ] Env values and TOTP secrets are encrypted with AES-256-GCM. The key comes from the environment, never from the DB.
- [ ] API key secrets, session tokens and reset/invite tokens are stored only as SHA-256 hashes.
- [ ] Passwords use argon2id. Login errors don't reveal whether an email exists.
- [ ] Rate limits on auth, contact, uploads and API keys.
- [ ] CORS allows only `FRONTEND_URL`, with credentials. Cookies are `HttpOnly; Secure; SameSite=Lax`.
- [ ] Webhooks verify signatures on the raw body.
- [ ] Uploads: type/size checks, scanned or extracted in the build sandbox only, never executed on the API host.
- [ ] Containers: run as non-root, no privileged mode, CPU/RAM/PID limits from the plan, isolated network per team.
- [ ] Logs (ours and the user's) redact `authorization`, `cookie`, passwords and secret env values.
- [ ] `PATCH /services/:id` whitelists fields. Never `Object.assign(service, req.body)` (the mock does exactly this).
- [ ] `safeRedirectPath`-style validation for every `from` / return URL.

## 12. Testing

- **Unit**: services (business rules) with an in-memory or test DB.
- **Integration**: `supertest` against `createApp()` with a real Postgres (Testcontainers or the compose DB). For each endpoint, cover: happy path, validation error, 401, 403 (role/scope), 404 (other team).
- **Contract**: run the frontend against the backend in the deploy preview and click through the dashboard. A short checklist is in [07-frontend-integration.md](07-frontend-integration.md#verification-checklist).
- **Seed**: `src/db/seed.ts` recreates the demo data from `apps/frontend/data/seed.ts` (user Mehdi, SyncBot, CommunityAPI, DiscordNotifier, deployments, API keys, notifications, servers, invoices), so the UI looks the same as with the mock.

## Shared types

Until `packages/shared` exists, copy `apps/frontend/lib/types.ts` into `apps/backend/src/types/api.ts` and keep them in sync in the same PR.
Better: create `packages/shared` (types + plans + regions + `isRegionAllowed`), add npm workspaces at the root, and import from both apps. This also removes the risk of the frontend and backend disagreeing on which region a plan allows.
