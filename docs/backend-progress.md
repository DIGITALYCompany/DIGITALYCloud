# Backend progress checkpoint

Resume point for the MongoDB backend implementation described in `DIGITALYCloud-MongoDB-Backend-Prompt.md`.
Decisions are in [backend-decisions.md](backend-decisions.md); endpoint/screen status in [backend-coverage.md](backend-coverage.md).

## Phases

| # | Phase | State |
| - | ----- | ----- |
| 1 | Foundation and MongoDB | ✅ Done — workspaces, `packages/shared`, config, models/indexes/migrations, errors, logging, health/readiness, outbox, queues, hub, CI (`.github/workflows/ci.yml`), compose (`compose.yaml`), Dockerfile |
| 2 | Identity and team boundaries | ✅ Backend done (sessions, signup/login/reset/verify, Google OIDC, TOTP, CSRF, permission matrix, teams/invitations). Frontend auth integration: Phase 9 |
| 3 | Service control plane | ✅ Backend done (catalog rules, CRUD, encrypted env, deployment records/locking, notifications, outbox, SSE `/events`). Frontend HTTP adapters: Phase 9 |
| 4 | Runtime and sources | ✅ Backend done (uploads, archive validation, GitHub install/repos/webhooks, Docker driver, pipeline, scheduler, swap/handoff, ops, purge, reconcile, proxy route feed). **Live Docker verification blocked** (no Docker on the dev machine); logic verified against a test-only in-memory driver with real HTTP health probes |
| 5 | Observability and public API | ✅ Backend done (collectors, logs history/SSE, metrics/usage, alerts, crash handling, API keys, rate limits) |
| 6 | Account and team completion | ✅ Backend done |
| 7 | Billing | ✅ Backend done (pending billing operations, Checkout for no-card owners, subscription items, upgrade/downgrade proration, Free transitions, deletion removal, portal, invoices/PDF, signed webhooks with durable receipts, reconciliation, entitlement loss → Free). Verified with a test-only gateway double; **live Stripe test-mode unverified** (no keys) |
| 8 | Remaining screens and platform data | ✅ Backend done (support, contact, docs feedback, servers, status, admin); frontend wiring in Phase 9 |
| 9 | Verification and cleanup | ✅ Done — operator CLI, local setup, CI, frontend wiring (mock/simulations/seed removed), OpenAPI, README, decisions, coverage, operations runbook, docs updated for MongoDB |

## Verified (2026-10-05)

- During development: 151 integration tests (real MongoDB replica set + Redis) and an 18-step headless-Chrome run passed.
  Both were then **removed from the repository at the owner's request**, together with the sample workloads in `examples/`
  (a copy was not kept in the repo). What remains as automated checks: `npm run typecheck`, `npm run lint`, `npm run build`
  (also in CI).
- Production bundle smoke against a real local MongoDB replica set + Redis (`npm run dev:infra`) with production-only
  dependencies: `migrate up`, `migrate status`, `indexes verify`, `seed`, API + worker start, health/readiness, CSRF
  rejection, cookie login, API-key bearer request, internal token gate, Prometheus metrics, route feed, SIGTERM drain.
- Redis outage test: process survives, requests fail fast (≤1.5 s), readiness 503, automatic recovery.
- Not verifiable here: `docker build`, `docker compose up`, real Docker runtime, Traefik, Stripe/Google/GitHub/Brevo/S3 live.

## Known placeholders to remove

- None. The marketing landing preview animates illustrative numbers and is captioned as an illustration.

## Remaining work (needs infrastructure or credentials)

1. Real Docker host: `server add-local` (or `server add` with mTLS), deploy an HTTP app, a worker, an uploaded archive and a
   Docker image; verify hardening (non-root, limits, disk quota), crash restarts, blue/green and rollback.
2. Traefik with the route feed and a wildcard certificate.
3. Stripe test mode: prices in `STRIPE_PRICES`, webhook endpoint, the flows listed in docs/operations.md §5.
4. Google OAuth client and GitHub App against the real providers; Brevo with a real API key and verified sender; S3 (MinIO profile).
5. `docker build` / `docker compose up` (CI builds the backend image; not run locally).
6. Branded OG image (`apps/frontend/config/site.ts`).

## Resume steps

```bash
cd /path/to/DIGITALYCloud
npm install                      # root workspaces (one lockfile)
npm run typecheck && npm run lint && npm run build
```
