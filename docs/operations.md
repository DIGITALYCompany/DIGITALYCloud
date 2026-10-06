# Operations runbook

How to run DIGITALYCloud in production: processes, hosts, providers, backups, key rotation and troubleshooting.
Setup commands for development are in [apps/backend/README.md](../apps/backend/README.md); design background in
[backend-decisions.md](backend-decisions.md).

> Status: the procedures for Docker hosts, Traefik, Stripe, Google, GitHub, Brevo and S3 follow the implemented code but were
> **not exercised against live services** on the build machine (see [backend-coverage.md](backend-coverage.md)). Run each
> once in staging before relying on it.

## 1. Topology

| Process | Command | Scale | Notes |
| ------- | ------- | ----- | ----- |
| API | `node dist/server.js` | 2+ behind a load balancer | Stateless. `PORT` public; `INTERNAL_PORT` private (readiness, Prometheus, proxy feed). SIGTERM: stops accepting, closes SSE so clients reconnect elsewhere, exits within 25 s. |
| Worker | `node dist/worker.js` | 1+ | All queues, outbox dispatcher, periodic job schedulers. `WORKER_ROLES` splits roles, e.g. `deployments,runtime` on build workers, `email,notifications,billing,webhooks,maintenance` elsewhere. SIGTERM drains (max 120 s). |
| Collector | `node dist/worker.js` with `WORKER_ROLES=collector` | 1+ | Each Docker host is leased to exactly one collector (logs, stats, events); leases move when a collector dies. |
| Migrations | `node dist/cli.js migrate up` | once per deploy, before new API/worker versions | Locked; safe to run concurrently or repeatedly. |
| Traefik | static config below | 1+ on the edge | Polls the route feed every few seconds. |

Data stores: MongoDB **replica set** (Atlas or self-managed, ≥3 members in production), Redis with persistence
(`appendonly yes`) and `maxmemory-policy noeviction`, S3-compatible object storage for uploaded archives (build contexts are
streamed to Docker, never stored).

Duplicate-safe by design: API replicas share nothing in memory; jobs are idempotent and fenced by operation generations;
periodic tasks are BullMQ job schedulers (one schedule regardless of worker count); webhook deliveries are stored once.

## 2. Configuration and secrets

[apps/backend/.env.example](../apps/backend/.env.example) lists the main variables with empty values; an empty value means
the default applies. The full list is the
[configuration reference](#configuration-reference) below. In production:

- Provide them from the orchestrator's secret store; `.env` files are ignored when `NODE_ENV=production`.
- Generate secrets with `openssl rand -base64 32` (encryption keys, as `kid:base64`) and `openssl rand -base64 48` (`APP_SECRET`,
  `INTERNAL_API_TOKEN`). Never reuse development values.
- Required at startup: `MONGODB_URI`, `REDIS_URL`, `ENCRYPTION_KEYS`, `ENCRYPTION_PRIMARY_KEY_ID`, `APP_SECRET`, `COOKIE_SECURE=true`,
  and the capabilities in `REQUIRED_CAPABILITIES` (default `email,storage,runtime`). A partially configured integration is a
  startup error; an absent optional one (Google, GitHub, Stripe) makes its endpoints answer "not configured".
- `TRUST_PROXY` must name the load balancer hop count or addresses; client IPs drive rate limits.
- `COOKIE_DOMAIN`: when the dashboard (`cloud.digitaly.fr`) and API (`api.cloud.digitaly.fr`) share a parent, set it to
  `cloud.digitaly.fr` so the dashboard's `proxy.ts` guard sees the session cookie. It must not cover `PUBLIC_RUNTIME_DOMAIN`
  (customer workloads must never receive dashboard cookies); the API refuses such a configuration. If the frontend can't see
  the cookie, set `AUTH_PROXY_GUARD=off` on the frontend.
- Frontend: only `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_API_URL` (+ optional server-only `API_INTERNAL_URL`, `AUTH_PROXY_GUARD`).
  `NEXT_PUBLIC_*` values are compiled into the build, so build per environment.

### Configuration reference

Groups marked *all or none* must be filled completely or left empty (a partial group stops startup).

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `NODE_ENV` | `development` | `production` enables the strict checks below and ignores `.env` files. |
| `LOG_LEVEL` | `info` | Pino level. |
| `PORT`, `HOST` | `4000`, `0.0.0.0` | Public listener. |
| `INTERNAL_PORT`, `INTERNAL_HOST`, `INTERNAL_API_TOKEN` | off, `127.0.0.1`, – | Private listener (readiness, Prometheus, Traefik feed); token ≥ 32 chars. |
| `API_PUBLIC_URL`, `FRONTEND_URL` | `http://localhost:4000`, `http://localhost:3000` | Links in emails, OAuth/Checkout return URLs. |
| `CORS_ORIGINS` | `FRONTEND_URL` origin | Exact allowed origins (comma-separated), also used by the CSRF Origin check. |
| `COOKIE_DOMAIN`, `COOKIE_SECURE` | host-only, `false` | Session cookie scope; `COOKIE_SECURE=true` required in production. |
| `TRUST_PROXY` | `false` | Load balancer hop count or addresses (client IPs for rate limits). |
| `MONGODB_URI` | **required** | Replica set connection string. |
| `REDIS_URL`, `REDIS_PREFIX` | **required**, `dgc` | Redis (`noeviction`, AOF on). |
| `ENCRYPTION_KEYS`, `ENCRYPTION_PRIMARY_KEY_ID` | **required** | `kid:base64(32 bytes)` list and the key that encrypts new values (§9). |
| `APP_SECRET` | **required** | ≥ 32 chars; HMAC root (CSRF, OAuth state, recovery codes). |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | – (*all or none*) | Google sign-in. `GOOGLE_REDIRECT_URI` defaults to `${API_PUBLIC_URL}/v1/auth/google/callback`. |
| `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | – (*all or none*) | GitHub App (§5). `GITHUB_API_URL` for GitHub Enterprise. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICES` | – (*all or none*) | Billing (§5). Without it paid plans answer `503 BILLING_UNAVAILABLE`. `STRIPE_AUTOMATIC_TAX` (`false`). |
| `BREVO_API_KEY` | – | Email via Brevo's API (§5); empty = no email is sent. |
| `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME` | `no-reply@digitaly.fr`, `DIGITALYCloud` | Sender; the address must be verified in Brevo. |
| `SUPPORT_INBOX` | `support@digitaly.fr` | Receives support tickets and contact-form messages. |
| `STORAGE_DRIVER`, `STORAGE_DIR` | `filesystem` in development, `.data/storage` | Uploads; production needs `s3`. |
| `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | – (*all or none*) | Plus `S3_ENDPOINT`, `S3_REGION` (`eu-west-3`), `S3_FORCE_PATH_STYLE` (`false`; `true` for MinIO). |
| `UPLOAD_MAX_MB`, `UPLOAD_MAX_LARGE_MB`, `UPLOAD_MAX_EXPANDED_MB`, `UPLOAD_MAX_FILES`, `UPLOAD_TMP_DIR` | 100, 500, 2048, 50000, OS temp | Archive limits. |
| `RUNTIME_DRIVER` | `disabled` | `docker` to run workloads on registered hosts. |
| `PUBLIC_RUNTIME_DOMAIN`, `PUBLIC_RUNTIME_SCHEME`, `PUBLIC_RUNTIME_PORT` | `digitaly.app`, `https`, – | Public service URLs `{id}.{domain}`. |
| `REGISTRY_URL`, `REGISTRY_USERNAME`, `REGISTRY_PASSWORD` | – | Image registry for multi-host setups. |
| `RUNTIME_NODE_IMAGES` | `node:24-alpine`, `node:22-alpine` | JSON map of Node majors to (digest-pinned) base images. |
| `RUNTIME_PROBE_IMAGE`, `RUNTIME_OCI_RUNTIME`, `RUNTIME_CONTAINER_USER` | `busybox:1.37`, –, `10001:10001` | Quota probe image, optional `runsc`, container user. |
| `RUNTIME_ALLOW_UNENFORCED_STORAGE` | `false` | Development only (refused in production). |
| `HEALTH_CHECK_SECONDS`, `BUILD_TIMEOUT_SECONDS`, `STOP_TIMEOUT_SECONDS`, `ROUTE_DRAIN_SECONDS`, `CONTROL_WAIT_MS` | 30, 900, 10, 15, 20000 | Deployment and control timing. |
| `WORKER_ROLES`, `WORKER_DEPLOY_CONCURRENCY` | all roles, 2 | Worker split (§1). |
| `SSE_MAX_PER_USER` | 12 | Concurrent streams per user. |
| `REQUIRED_CAPABILITIES` | production: `email,storage,runtime` | Capabilities whose absence fails startup. |

## 3. Onboarding a Docker host

1. **OS and storage.** Linux with Docker Engine 27+, `overlay2` on **XFS mounted with `pquota`** (or another driver that
   supports `--storage-opt size`). Without quota support the host is registered but deployments fail; the development-only
   override `RUNTIME_ALLOW_UNENFORCED_STORAGE` is refused in production.
2. **Optional sandboxing.** Install gVisor (`runsc`) and set `RUNTIME_OCI_RUNTIME=runsc`.
3. **Docker API over mutual TLS** on the private network only (port 2376): CA, server cert for the host's private name,
   client cert/key for the platform. Firewall: 2376 from workers/collectors only; published container ports (bound to the
   host's private IP) from Traefik only.
4. **Register and probe** (from a machine with the client certs):

   ```bash
   node dist/cli.js server add --id lyon-2 --name Lyon-02 --region lyon \
     --private-ip 10.0.1.12 --docker-host 10.0.1.12 --tls-ca ca.pem --tls-cert client.pem --tls-key client-key.pem \
     [--public-ip 203.0.113.12] [--disk-tb 2] [--headroom-pct 15]
   node dist/cli.js server list
   ```

   The probe reads CPU/RAM from Docker, keeps the headroom for the OS, and tests the disk quota with `RUNTIME_PROBE_IMAGE`.
   `--public-ip` is shown to customers on the Servers page; private addresses never are.
5. **Maintenance**: `node dist/cli.js server set-status lyon-2 maintenance` stops new placements; `healthy` resumes.
   `server probe <id>` refreshes capacity after hardware changes.
6. Base images: pin `RUNTIME_NODE_IMAGES` by digest (e.g. `{"24":"node:24-alpine@sha256:…","22":"node:22-alpine@sha256:…"}`).
   With several hosts, configure `REGISTRY_URL`/credentials so images built on one host can run on another.

Smoke test a new host by deploying a small HTTP app (health check, public route), a worker without a port (crash handling,
log redaction of a secret env value), an uploaded archive and a public Docker image.

## 4. Routing, DNS and TLS

- DNS: `cloud.digitaly.fr` → frontend, `api.cloud.digitaly.fr` → API load balancer, `*.digitaly.app` (the
  `PUBLIC_RUNTIME_DOMAIN`) → Traefik.
- Traefik static configuration (sketch):

  ```yaml
  entryPoints:
    web: { address: ':80', http: { redirections: { entryPoint: { to: websecure, scheme: https } } } }
    websecure: { address: ':443' }
  providers:
    http:
      endpoint: http://api-internal:4001/internal/proxy/traefik
      pollInterval: 5s
      headers: { Authorization: 'Bearer <INTERNAL_API_TOKEN>' }
  certificatesResolvers:
    wildcard:
      acme:
        email: ops@digitaly.fr
        storage: /data/acme.json
        dnsChallenge: { provider: <your DNS provider> }
  ```

  The feed's routers reference the `wildcard` resolver with `main: digitaly.app, sans: ['*.digitaly.app']`. Routes appear only
  after a candidate container passes its health check and switch atomically on deploys (old version drained for
  `ROUTE_DRAIN_SECONDS`).

## 5. Provider registration

**Google** (Cloud Console → OAuth client, type Web): authorised redirect URI `${API_PUBLIC_URL}/v1/auth/google/callback`
(or `GOOGLE_REDIRECT_URI`). Scopes `openid email profile`. Set `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`.

**GitHub App**: permissions *Contents: read*, *Metadata: read*; events *Push*, *Installation*; webhook URL
`${API_PUBLIC_URL}/v1/webhooks/github` with a secret (`GITHUB_WEBHOOK_SECRET`); setup URL
`${API_PUBLIC_URL}/v1/integrations/github/callback` with **"Request user authorization (OAuth) during installation"** enabled
(the callback verifies the installing user can access the installation). Set the six `GITHUB_*` variables (private key PEM,
newlines may be written as `\n`).

**Stripe**: create one product per service type and plan with a **monthly EUR, tax-inclusive** price equal to the catalog
(`packages/shared/src/catalog.ts`); put the price ids in `STRIPE_PRICES` (`{"discord:starter":"price_…", …}` — all 12 paid plans;
startup validates amount, currency and interval). Webhook endpoint `${API_PUBLIC_URL}/v1/webhooks/stripe` with events
`checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`,
`checkout.session.async_payment_failed`, `invoice.*`, `customer.subscription.*`, `payment_method.*`, `customer.updated`.
Configure the Customer Portal (update payment methods, view invoices). Decide on Stripe Tax (`STRIPE_AUTOMATIC_TAX`).
Verify end to end in test mode: paid create without a card (Checkout), with a card, upgrade, downgrade, move to Free,
deletion, a declined card (`4000 0000 0000 0002`), and repeated webhook delivery from the dashboard.

**Email (Brevo)**: at app.brevo.com → **SMTP & API → API Keys**, generate an API key (`xkeysib-…`) and set
`BREVO_API_KEY` (server-side only; never in frontend or `VITE_`/`NEXT_PUBLIC_` variables). Under **Senders, domains &
dedicated IPs**, authenticate `digitaly.fr` (DKIM, DMARC records) so `BREVO_SENDER_EMAIL` (`no-reply@digitaly.fr`) is
accepted. Check the daily sending limit of the Brevo plan against expected signups and alerts.

**S3**: private bucket with versioning; objects live under `uploads/<teamId>/` and are deleted by the platform (unused
uploads after 24 h, others with their service). A lifecycle rule expiring noncurrent versions after 30 days keeps versioning
from growing forever. Credentials need `s3:GetObject`, `PutObject`, `DeleteObject`, `ListBucket` on that bucket only.

## 6. Deploying a new version

1. Build images (CI builds and checks the backend image: `.github/workflows/ci.yml`).
2. `node dist/cli.js migrate up` (one-off job). Migrations only add; destructive index changes need `indexes sync --confirm`.
3. Roll API replicas (readiness `GET /v1/health/ready` gates traffic), then workers and collectors. In-flight jobs either
   finish during the drain or are retried by another worker; the outbox redispatches anything lost.

## 7. Backups and restore checks

- **MongoDB** is the source of truth. Use continuous backups with point-in-time recovery (Atlas) or `mongodump --oplog` from a
  secondary plus oplog archiving. Keep ≥ 30 days. **Monthly restore drill**: restore into a scratch cluster, run
  `node dist/cli.js migrate status` and `indexes verify` against it, sign in with a test account, check a service's env decrypts
  (requires the same `ENCRYPTION_KEYS` — back keys up separately in the secret manager).
- **Object storage**: versioned bucket; restore drill = fetch a recent upload and validate it with the archive inspector
  (a deploy from that upload).
- **Redis** holds queues, rate limits, live metrics and event streams; losing it loses no committed state (the outbox
  re-enqueues pending work; SSE clients resync). Keep AOF on to avoid re-running work after restarts.
- Images on Docker hosts are rebuildable caches; rollbacks within 30 days need them or a registry.

## 8. Index rollout

Declare the index on the Mongoose schema, add a migration that calls `ensureCollectionsAndIndexes` (or a targeted
`createIndex`), deploy, run `migrate up`. On large collections create big indexes ahead of the deploy (MongoDB builds
online). `node dist/cli.js indexes verify` lists missing and undeclared indexes; readiness reports missing ones.
Removing an index: delete it from the schema, deploy, then `indexes sync --confirm`.

## 9. Encryption key rotation

1. Generate a new key and **append** it: `ENCRYPTION_KEYS=k1:…,k2:…`; set `ENCRYPTION_PRIMARY_KEY_ID=k2`; deploy (new writes
   use k2, old values still decrypt).
2. `node dist/cli.js keys rotate` re-encrypts env vars, TOTP secrets and pending billing payloads; OAuth states encrypted with
   old keys are dropped (those sign-ins simply restart).
3. Wait 7 days (queued email payloads expire), then remove `k1` and deploy.

`APP_SECRET` rotation invalidates CSRF tokens (users reload), recovery codes (users regenerate by re-enabling 2FA) and
OAuth state bindings; do it only after a suspected leak.

## 10. Cleanup

Automatic: TTL indexes (sessions, tokens, logs, metrics, notifications, receipts, audit), `periodic.cleanup` every 10 min
(unused uploads after 24 h, built images past their 30-day rollback window), `periodic.reconcile` every minute (desired vs
actual containers, orphaned containers, interrupted deployments and operations), `periodic.billing_reconcile` every 15 min
(Stripe state vs services), and a `service.purge` job per deleted service (containers, images, uploads, data). On hosts, `docker image prune`
for dangling layers is safe at any time; don't prune tagged `dgc/*` images younger than 30 days (rollbacks).

## 11. Monitoring

- `GET /v1/health` (liveness), `GET /v1/health/ready` (MongoDB, Redis, migrations, indexes, capabilities; detailed on
  `/internal/ready`).
- Prometheus `/internal/metrics` (bearer `INTERNAL_API_TOKEN`): HTTP rates/latency, SSE connections, jobs by outcome, outbox
  records by status, queue depths, Node process metrics. Alert on: dead outbox records or `job dead-lettered` logs, queue
  wait > 5 min, readiness failures, collector heartbeats older than 3 min (servers drop out of placement), webhook
  failures, overdue account deletions (staff overview).
- Status page probes run every minute from the worker; publish incidents and maintenance with
  `node dist/cli.js incident create --title … --impact minor|major|maintenance --components "REST API" --text …`,
  `incident update <id> [--stage Identified|Monitoring] [--resolve] --text …` and
  `maintenance add --title … --body … --starts <ISO> --ends <ISO> --affected "Compute — Paris"` (users with affected
  services are notified 48 h ahead).
- Staff access: `node dist/cli.js staff grant <email>` / `staff revoke <email>`.

## 12. Troubleshooting

| Symptom | Check |
| ------- | ----- |
| API exits at startup with "Invalid configuration" | The message lists every missing/partial variable. |
| "MongoDB must be a replica set" | Point `MONGODB_URI` at a replica set (`?replicaSet=` or Atlas). Locally: compose or `npm run dev:infra`. |
| Readiness 503 `pendingMigrations` / `missingIndexes` | Run `migrate up`; `indexes verify`. |
| Requests slow or `503 Please try again` during auth | Redis unreachable (commands time out after 1.5 s; auth limits fail closed). |
| Regions show as unavailable | No healthy server with heartbeat in the region: `server list` (heartbeat, quota), collector running? |
| Deployments fail at "starting" with a storage error | Host can't enforce disk quotas (`server probe` → `quota: NO`). |
| Health check failed | The service must listen on `$PORT` (HTTP types) and answer < 500 within `HEALTH_CHECK_SECONDS`. |
| Paid plans greyed out | Stripe not configured or prices invalid (startup log), `catalog.paidPlansAvailable`. |
| Checkout paid but nothing happened | Webhook endpoint/secret; receipts in `webhook_receipts`; `billing_operations` status; reconciliation runs every 15 min. |
| GitHub "connect" returns `github=unverified` | The App must request user authorization during installation. |
| No emails | `BREVO_API_KEY` (an API key `xkeysib-…`, not an SMTP key); sender verified in Brevo; `email_deliveries` status and error (`Brevo 401` = wrong key, `400` = sender or address problem); Brevo → Transactional → Logs. |
| Dashboard redirects to login although signed in | Session cookie not visible to the frontend host: set `COOKIE_DOMAIN` or `AUTH_PROXY_GUARD=off`. |
| SSE disconnects every few minutes | Proxy idle timeouts must exceed the 25 s keep-alive; disable response buffering for `/v1/events` and `/logs/stream`. |
