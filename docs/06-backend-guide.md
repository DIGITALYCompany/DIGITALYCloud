# 06 — Backend guide

How `apps/backend` is built and how to extend it. Setup and commands: [apps/backend/README.md](../apps/backend/README.md).
Why things are the way they are: [backend-decisions.md](backend-decisions.md). Contract: [05-api-reference.md](05-api-reference.md)
and [openapi.json](openapi.json). Operating it: [operations.md](operations.md).

## 1. Stack

| Choice | Why |
| ------ | --- |
| **Node.js 24 LTS + TypeScript** (ESM, `tsx` in development, `tsup` bundles) | Same language as the frontend; DTOs and rules shared through `@digitalycloud/shared`. |
| **Express 5** | Async handlers forward rejections to the error middleware; no wrappers. |
| **Zod 4** | Strict request schemas (`z.strictObject`) with the UI's messages; unknown fields are rejected (mass assignment). |
| **MongoDB 8 replica set + Mongoose 9** | Project requirement. Transactions for multi-document invariants, TTL indexes for expiry, partial unique indexes for "at most one" rules. |
| **Redis + BullMQ** | Queues (fed by a transactional outbox), rate limits, live metrics, Redis Streams + Pub/Sub for SSE fan-out and replay. |
| **Docker Engine API** (`dockerode`, mTLS) | Build and run customer containers on DIGITALY hosts. |
| **Server-Sent Events** | Server→browser updates with cookies, automatic reconnect and `Last-Event-ID` replay. |
| **Argon2id**, **otpauth**, **openid-client** | Passwords, TOTP, Google OIDC (PKCE + nonce). |
| **Stripe** | Subscription items per paid service, Checkout, Customer Portal, invoices. |
| **Pino** | JSON logs with request ids; secrets, cookies and tokens redacted. |

## 2. Processes

- `src/server.ts` — the API (public port) and the private listener (`INTERNAL_PORT`: `/internal/ready`, `/internal/metrics`,
  `/internal/proxy/traefik`, bearer `INTERNAL_API_TOKEN`).
- `src/worker.ts` — queue consumers, outbox dispatcher, periodic job schedulers and (role `collector`) per-host log/metric
  collectors. `WORKER_ROLES` selects roles.
- `src/cli.ts` — operator commands (migrations, indexes, seed, servers, staff, incidents, key rotation).

All three call `bootstrap(role)`: validated config → MongoDB (replica set required) → integrations → context (`ctx()`):
config, logger, cipher, Redis, event hub, queues, integrations.

## 3. Request pipeline

`app.ts` order: request id → HTTP logger → helmet → CORS (exact origins) → **webhooks** (raw bodies, before parsers) →
cookies → `no-store` → **CSRF** (unsafe cookie requests: allowed Origin + `X-CSRF-Token`) → **authenticate** (session cookie
or `Bearer dgc_live_…`) → general rate limit → `/v1` routes → 404 → error handler.

Inside a route: body/query validation (`http/validate.ts`) → `authorize(action)` (permission matrix in
`packages/shared/src/permissions.ts`; resolves the tenant from `X-Team-Id`/`?team=`/session default) → a service function →
a serializer.

## 4. Adding an endpoint

1. **Contract**: add the DTO to `packages/shared/src/types.ts` (and the enum to `enums.ts`), and an action to
   `permissions.ts` if it needs a new permission.
2. **Route** in `src/modules/<area>/<area>.routes.ts`: a `z.strictObject` schema with user-facing messages, `jsonSmall`
   body parser, `authorize('<action>')`, then call the service. Keep Express objects out of services.
3. **Service** in `<area>.service.ts`: read with `.lean<Doc>()`; wrap multi-document writes in `withTransaction`; put side
   effects (Docker, email, Stripe, GitHub, storage, notifications) in the outbox with `addToOutbox(session, …)` inside the
   same transaction — never call external services inside a transaction. Throw `AppError` helpers (`validation`, `notFound`,
   `forbidden`, `conflict`, `paymentRequired`, `unavailable`…).
4. **Serializer**: map documents to DTOs explicitly (epoch ms, no `_id`, no hashes or encrypted fields).
5. **Jobs**: add a topic in `jobs/queues.ts` and register a processor (`registerProcessor`). Processors must be idempotent and
   check operation generations before touching the runtime.
6. **Real-time**: publish with `ctx().hub.publish({ kind: 'team', id }, 'service.updated', dto)` after the commit; add new event
   names to `EVENT_NAMES`.
7. **Docs**: add the operation to `src/openapi.ts`, run `npm run openapi`, and update
   [backend-coverage.md](backend-coverage.md).

## 5. Errors

`{ "error": { "code": "VALIDATION_ERROR", "message": "…", "fields": { "name": "…" } } }` plus code-specific details
(`checkoutUrl`/`operationId` on 402, `retryAfter` and `Retry-After` on 429). Messages are shown as-is by the dashboard:
never include stack traces, queries or internal ids. Unexpected errors are logged with the request id and answered as
`500 INTERNAL` with a generic message.

## 6. Authentication and tenancy

- Sessions: `dgc_session` (HttpOnly, `SameSite=Lax`, `Secure` in production), SHA-256 stored, sliding 30-day "remember me"
  or 12-hour sessions; `requireSession`, `sessionUser(req)`.
- CSRF: `GET /v1/auth/csrf` sets `dgc_csrf` and returns the HMAC token for `X-CSRF-Token`.
- API keys: `Authorization: Bearer dgc_live_…`, hashed, team-bound, `read`/`full`, refused where the matrix says `key: null`.
- Tenant: `authorize()` attaches `req.tenant` (`team`, `role`); `tenantOf(req)` reads it. Cross-team ids answer 404.
- Staff: `requireStaff` (`User.role === 'admin'`) for `/admin/*`.

## 7. Runtime

`runtime/pipeline.ts` runs deployments: lock + capacity reservation → source (GitHub tarball at a commit, upload, image
pull) → generated `Dockerfile.digitaly` for Node sources → build with streaming, redacted logs → hardened container on the
team network → health check (process alive; HTTP on `PORT` for web services) → route switch (blue/green) or singleton
handoff → release the old version. `operations.ts` handles start/stop/restart/limits; `crash.ts` the restart policy;
`reconcile.ts` desired vs actual state; `purge.ts` deleted services. Everything goes through the `RuntimeDriver` interface
(`docker-driver.ts` in production, an in-memory double in tests).

## 8. Real-time, logs and metrics

- `realtime/hub.ts`: publish to a Redis Stream (replay) and Pub/Sub (fan-out); `realtime/sse.ts`: per-user stream limits,
  keep-alives, backpressure (droppable metrics).
- Collectors (one per host via a lease) attach to container logs, redact secrets, number lines, store them with plan TTLs and
  publish live lines; they sample stats every 2 s into Redis (live) and once a minute into `metric_samples`.

## 9. Security checklist (implemented)

- Validation everywhere, unknown fields rejected, NoSQL operators impossible (strict schemas, typed queries).
- Argon2id passwords; enumeration-safe login/reset; rate limits on auth, forms, uploads, invitations, keys.
- Env values and TOTP secrets encrypted (AES-256-GCM, associated data, key ring); never logged or streamed.
- Uploads: size limits while streaming, magic-byte sniffing, archive traversal/link/device/expansion checks.
- Source fetching: GitHub tarballs only from `codeload.github.com`; images only from public registries; no private-network
  addresses.
- Containers: non-root, capabilities dropped, no-new-privileges, PID/memory/CPU/disk limits, per-team networks.
- Webhooks: signature verified on the raw body, stored once, processed asynchronously.
- Redirects: same-site paths only (`safeRedirectPath`).

## Shared types

`packages/shared` is consumed as TypeScript source by both apps (Next.js transpiles workspace packages automatically; the
backend bundles it with tsup). Changing a DTO there is a contract change: update the API, the dashboard and
`src/openapi.ts` together — the type checker finds every mismatch.
