# DIGITALYCloud backend

API, deployment workers and collectors for DIGITALYCloud: Express 5 on Node.js 24, MongoDB 8 (replica set, Mongoose 9),
Redis (BullMQ queues, rate limits, event streams), Docker hosts for customer workloads, Stripe billing.

- Architecture and design choices: [docs/backend-decisions.md](../../docs/backend-decisions.md)
- Endpoint and screen status: [docs/backend-coverage.md](../../docs/backend-coverage.md)
- HTTP contract: [docs/openapi.json](../../docs/openapi.json) (and [docs/05-api-reference.md](../../docs/05-api-reference.md))
- Operating it (servers, backups, keys, webhooks, troubleshooting): [docs/operations.md](../../docs/operations.md)

Commands were run on 2026-10-05 (macOS, Node 24.20, npm 11.19) unless marked *not verified here*.

## Requirements

- Node.js ≥ 22.12 (24 LTS recommended), npm ≥ 10.
- MongoDB 7+ **as a replica set** (transactions) and Redis 7+ with `maxmemory-policy noeviction`.
  Either `docker compose up -d` (repository root) or, without Docker, `npm run dev:infra`.
- For running customer workloads: Docker Engine hosts (see docs/operations.md). Without them the platform works
  except that regions show as unavailable and nothing runs.

## First run (development)

```bash
# repository root: one lockfile for all workspaces
npm install

cd apps/backend
npm run env:init          # copies .env.example to .env and generates ENCRYPTION_KEYS, APP_SECRET and the internal token
# then fill in .env: MONGODB_URI=mongodb://127.0.0.1:27017/digitalycloud?replicaSet=rs0&directConnection=true
#                    REDIS_URL=redis://127.0.0.1:6379   (empty values use the defaults written in .env.example)

# infrastructure, one of:
docker compose -f ../../compose.yaml up -d     # MongoDB rs0 + Redis (not verified here: no Docker on this machine)
npm run dev:infra                              # Docker-free MongoDB replica set + Redis on 27017/6379 (keep it running)

npm run db:migrate        # collections, indexes, counters (idempotent)
npm run db:seed -- --confirm-dev               # optional: a staff account and three stopped Free demo services
npm run dev               # API on http://localhost:4000 (tsx watch)
npm run dev:worker        # queues, outbox dispatcher, reconcilers, collectors (second terminal)
```

Then the dashboard, from the repository root: `npm run dev:web` (http://localhost:3000, reads `apps/frontend/.env.local`,
see `apps/frontend/.env.example`).

`db:seed` prints the generated password unless `--password` or `SEED_PASSWORD` is given, refuses production
(`NODE_ENV=production`) and refuses to run twice. Demo services are stopped records with labelled demo deployments;
they never look like running containers, real servers or subscriptions.

Email is sent through Brevo's API: put your Brevo API key (`xkeysib-…`) in `BREVO_API_KEY` and use a
`BREVO_SENDER_EMAIL` verified in Brevo. Emails are real, so sign up with addresses you can read. With `BREVO_API_KEY`
empty, development logs each email's link (`email not sent (Brevo not configured)`) and records the delivery as failed —
nothing pretends to be sent.

## Running real workloads locally

```bash
# in apps/backend/.env
RUNTIME_DRIVER=docker
RUNTIME_ALLOW_UNENFORCED_STORAGE=true   # laptops/Docker Desktop can't enforce disk quotas (refused in production)
PUBLIC_RUNTIME_DOMAIN=localtest.me      # local app addresses http://<id>.localtest.me:8080
PUBLIC_RUNTIME_SCHEME=http
PUBLIC_RUNTIME_PORT=8080
INTERNAL_PORT=4001                      # Traefik reads the route list from this private port

npm run cli -- server add-local --region lyon   # probes the local Docker socket and registers capacity
npm run cli -- server list
```

Then create a service from the dashboard. HTTP services get `http://<id>.localtest.me:8080` routes when Traefik runs
(`docker compose --profile proxy up -d`). *Not verified yet against a real Docker host.*

## Commands

| Command | What it does |
| ------- | ------------ |
| `npm run dev` / `npm run dev:worker` | API / worker with reload (tsx). |
| `npm run build` | Bundles `dist/server.js`, `dist/worker.js`, `dist/cli.js` (tsup; npm dependencies stay external). |
| `npm start` / `npm run worker` | Production API / worker from `dist/`. |
| `npm run cli -- <command>` | Operator CLI (production: `node dist/cli.js <command>`). Run without arguments for the list. |
| `npm run db:migrate`, `npm run db:migrate:status` | Apply / list migrations. Safe to run on every deploy; uses a lock. |
| `npm run typecheck`, `npm run lint` | `tsc --noEmit`, ESLint. |
| `npm run env:init`, `npm run dev:infra` | Local `.env` with generated secrets; Docker-free MongoDB + Redis. |
| `npm run openapi` | Regenerates `docs/openapi.json` from `src/openapi.ts` (run it after changing endpoints). |

CLI commands: `migrate up|status`, `indexes verify`, `indexes sync --confirm` (drops undeclared indexes), `seed --confirm-dev`,
`server add-local|add|list|probe|set-status`, `staff grant|revoke <email>`, `incident create|update`, `maintenance add`,
`keys rotate`, `team show <id>`.

## Production

```bash
docker build -f apps/backend/Dockerfile -t digitalycloud-backend .      # from the repository root (not verified here)
docker run --env-file prod.env digitalycloud-backend node dist/cli.js migrate up
docker run --env-file prod.env -p 4000:4000 digitalycloud-backend                       # API (default command)
docker run --env-file prod.env digitalycloud-backend node dist/worker.js                # worker(s)
```

Without Docker: `npm ci && npm run build --workspace backend`, then `node dist/cli.js migrate up`, `node dist/server.js`,
`node dist/worker.js` (verified with production-only dependencies against a local replica set).

Production refuses to start without `COOKIE_SECURE=true`, with the filesystem storage driver, with
`RUNTIME_ALLOW_UNENFORCED_STORAGE`, or without the required capabilities
(`email,storage,runtime` by default; `REQUIRED_CAPABILITIES` overrides). Readiness (`GET /v1/health/ready`, detailed at
`/internal/ready`) reports MongoDB, Redis, pending migrations, missing indexes and missing capabilities.
[.env.example](.env.example) lists the main variables (empty value = default); every variable is in the
[configuration reference](../../docs/operations.md#configuration-reference).

## Layout

```
src/
  server.ts, worker.ts, cli.ts     process entry points (API, worker/collector, operator CLI)
  app.ts, routes.ts, internal.ts   Express app, route table, private listener (metrics, readiness, proxy feed)
  config/env.ts                    validated configuration and capabilities
  db/                              connection, Mongoose models, index sync, migrations
  http/, middleware/               cookies, validation, principals/permissions, auth, CSRF, tenant, rate limits, idempotency
  modules/<area>/                  routes + services per feature (auth, account, teams, services, deployments, logs, metrics,
                                   uploads, github, billing, support, platform, notifications, events, api-keys, email, catalog)
  runtime/                         Docker driver, build/deploy pipeline, operations, capacity, collectors, crash policy, reconcile
  jobs/                            outbox, BullMQ queues/runner, processor registry
  realtime/                        Redis Streams + Pub/Sub event hub, SSE writer
  integrations/                    mail, storage (S3/filesystem), Google OIDC, GitHub App, Stripe
  serializers/                     DTO mapping (never exposes _id, hashes, encrypted values, container ids)
scripts/                           env-init, dev-infra, openapi
```
