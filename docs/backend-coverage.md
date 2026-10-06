# Backend coverage

Every documented endpoint and dashboard screen, where it is implemented, and how it was verified on 2026-10-05.

> The verification column is a record of checks run during development. The test suite and browser smoke test were
> removed from the repository afterwards at the owner's request, so changes made after 2026-10-05 are not covered by them.

**Legend.** ✅ implemented · **IT** checked by an integration test against a real MongoDB replica set + Redis · **UI**
checked in a headless-Chrome run of the production frontend build · **double** the external provider was a stand-in, so the
live integration is **unverified** · **blocked** needs infrastructure that wasn't available.

## Live integrations

| Integration | Code | Verified with | Live status |
| ----------- | ---- | ------------- | ----------- |
| Docker hosts (build, run, stats, logs, events) | `runtime/docker-driver.ts` | in-memory driver with real HTTP health probes (IT, UI) | **blocked** — no Docker on the build machine; run `server add-local` + sample workloads (docs/operations.md §3) |
| Traefik route feed | `runtime/proxy-routes.ts`, `/internal/proxy/traefik` | IT (feed shape), manual curl | **blocked** (needs Docker) |
| Stripe | `integrations/stripe.ts` | gateway double (IT); real SDK webhook signature verification offline (IT) | **unverified** — needs test-mode keys and prices |
| Google sign-in | `integrations/google.ts` | real OIDC flow against a local issuer (`oauth2-mock-server`, IT) | **unverified** against accounts.google.com |
| GitHub App | `integrations/github.ts` | GitHub double (IT); real HMAC webhook verification (IT) | **unverified** — needs an App |
| Brevo email | `integrations/mail.ts` | captured mailer (IT); request to Brevo's API with a dummy key answered `401 Key not found` | **sending unverified** until a real API key and verified sender are set |
| S3 | `integrations/storage.ts` | filesystem driver (IT, UI) | **unverified** — MinIO profile not run here |
| MongoDB / Redis | `db/`, `infra/redis.ts` | real servers in every test; prod bundle smoke; Redis outage/recovery test | ✅ local replica set; managed services unverified |

## Endpoints

| Endpoint | Implementation | Verification |
| -------- | -------------- | ------------ |
| `GET /health`, `GET /health/ready` | `modules/health` | IT (auth.test), prod smoke |
| `GET /auth/csrf` *(extension)* | `modules/auth/auth.routes.ts` | IT (every browser helper), UI |
| `GET /auth/session` | auth routes | IT, UI |
| `POST /auth/signup` | auth service (transactional) | IT (atomicity, concurrent duplicates, validation), UI |
| `POST /auth/login` | auth service | IT (enumeration-safe, NoSQL operators, remember/session cookies, expiry), UI |
| `POST /auth/2fa/verify` | auth service, `totp.ts` | IT (wrong/replayed codes, attempt limits, challenge expiry, recovery codes), UI (recovery-code login) |
| `GET /auth/google`, `GET /auth/google/callback` | `integrations/google.ts` | IT against a local OIDC issuer (state binding, takeover prevention, 2FA, safe redirects); **live unverified** |
| `POST /auth/password/forgot`, `POST /auth/password/reset` | auth/tokens services | IT (204 always, single use, 1 h expiry, revokes sessions) |
| `POST /auth/email/verify`, `POST /auth/email/resend` *(extensions)* | tokens service | IT (verify once, email change, resend), UI (invitee verification) |
| `POST /auth/logout` | auth routes | IT, UI |
| `PATCH /me` | `modules/account` | IT (language/timezone, email change with verification) |
| `PUT /me/password` | account service | IT (revokes other sessions, Google-only set-password window) |
| `GET /me/sessions`, `DELETE /me/sessions/:id` | account routes | IT |
| `POST /me/2fa/setup`, `/enable`, `/disable` | account service | IT, UI (setup with QR secret, recovery codes) |
| `GET/PUT /me/notification-preferences` | account service | IT |
| `DELETE /me` | `account/deletion.*` | IT (immediate lockout, purge, other teams kept) |
| `GET /catalog` | `modules/catalog` | IT (platform-misc: plans, Node versions, availability excludes stale/demo hosts) |
| `GET /services`, `GET /services/:id` | `modules/services` | IT (pagination, tenant isolation, role redaction), UI |
| `POST /services` | services service | IT (transaction, limits, validation, slugs, concurrency, idempotency, billing gate), UI (upload source) |
| `PATCH /services/:id` | services service | IT (legacy limits dropped, pending changes, roles) |
| `POST /services/:id/plan` | `modules/billing` | IT (card on file, checkout, admin vs owner, region rules, downgrade/Free) |
| `POST /services/:id/start` · `/stop` · `/restart` | services + `runtime/operations.ts` | IT (worker e2e through BullMQ), UI (stop) |
| `DELETE /services/:id` | services service + `runtime/purge.ts` | IT (purge, slug reservation, subscription item removal) |
| `PUT /services/:id/env` | `services/env.service.ts` | IT (encryption at rest, ids kept, 100 × 32 KB, reserved keys, roles), UI |
| `GET /deployments`, `GET /deployments/:id` | `modules/deployments` | IT (ordering, cursors, logs on detail only), UI (build log) |
| `POST /services/:id/deploy` (`{}`, `{deploymentId}`, `{uploadId}`) | deployments service + `runtime/pipeline.ts` | IT (one concurrent deploy, request forms, fencing, crash recovery, rollback paths) |
| `GET /services/:id/logs`, `GET …/logs/stream` | `modules/logs` | IT (redaction, retention, cursors, reset), UI (live tail) |
| `GET /services/:id/metrics`, `GET /metrics/usage` | `modules/metrics` | IT (units, gaps), UI (live CPU) |
| `GET /events` | `modules/events`, `realtime/` | IT (no env, replay after reconnect, revocation, other teams refused), UI (deploy progress) |
| `GET/POST /api-keys`, `DELETE /api-keys/:id` | `modules/api-keys` | IT (hash only, scopes, member removal revokes, owner/admin only), UI (create + bearer call) |
| `GET /notifications`, `POST /notifications/read-all` | `modules/notifications` | IT (per member, dedupe) |
| `GET /teams`, `POST /teams/active` *(extensions)* | `modules/teams` | IT (team switching) |
| `GET /team/members`, `POST /team/invitations`, `POST …/accept`, `PATCH/DELETE /team/members/:id` | teams service | IT (verified matching email, owner protection, admin management), UI (invite → verify → accept as Developer) |
| `GET /billing/summary`, `GET /billing/invoices`, `GET /billing/invoices/:id/pdf`, `POST /billing/portal-session` | `modules/billing` | IT with gateway double (owner-only, invoice sync); **live unverified** |
| `GET /billing/operations/:id`, `POST …/checkout`, `POST …/cancel` *(extensions)* | billing service | IT (expiry, retry, cancel) |
| `POST /uploads` | `modules/uploads` | IT (CSRF, size, sniffing, archive rules), UI (real zip upload) |
| `GET /integrations/github`, `/install`, `/callback`, `/repos`, `/repos/:o/:r/branches` | `modules/github` | IT with GitHub double (binding, forged ids, other sessions); **live unverified** |
| `POST /support/tickets`, `POST /contact`, `POST /docs/feedback` | `modules/support` | IT (sequential numbers, honeypot, rate limits) |
| `GET /servers`, `GET /servers/load` | `modules/platform` | IT (no private details, no invented history) |
| `GET /status` | `platform/status.service.ts` | IT (CLI incidents), UI |
| `GET /admin/overview`, `/admin/revenue`, `/admin/deployments/daily`, `/admin/services` | `platform/admin.service.ts` | IT (staff only, real numbers) |
| `POST /webhooks/github` | github routes | IT (signatures, single processing, push coalescing) |
| `POST /webhooks/stripe` | billing routes | IT (signatures, out-of-order events, entitlement loss) |
| `/internal/ready`, `/internal/metrics`, `/internal/proxy/traefik` *(extensions)* | `internal.ts` | IT (token gate, contents), prod smoke |

## Dashboard screens

All screens use `apps/frontend/lib/api` (typed client, CSRF, per-tab team) and `providers/*`. The mock API, simulations
and seed data were removed. Frontend `typecheck`, `lint` and `build` pass.

| Screen | Wired to | Verification |
| ------ | -------- | ------------ |
| Login / signup / forgot password | `/auth/*`, Google redirect, `?error=` codes | UI (signup, login with 2FA) |
| 2FA login step, recovery codes | `/auth/2fa/verify` (also after Google via `#challenge`) | UI |
| `/reset-password`, `/verify-email`, `/invite` *(new)* | `/auth/password/reset`, `/auth/email/verify`, `/team/invitations/accept` | UI (verify, invite); reset by IT only |
| Route guard (`proxy.ts`) + `RequireAuth` | cookie presence, `/auth/session`, 401 handling | UI (redirect with `?from=`) |
| Dashboard overview | services, deployments, `/metrics/usage`, `/status` | UI (empty state) |
| Services list, service cards, attention banner | services + SSE | UI (indirect) |
| New service wizard (GitHub / upload / Docker) | `/integrations/github/*`, `/uploads`, `/catalog`, `POST /services`, 402 checkout | UI (upload path); GitHub/Docker paths by build/type checks only |
| Deploy progress (success and failure states) | SSE `deployment.*`, build log | UI (success); failure state by code review |
| Checkout return (`?checkout=&operation=`) | `/billing/operations/*` | type/build checks only (needs Stripe) |
| Service overview, settings (general, resources, behavior), danger zone | `PATCH`, `/plan`, `DELETE` | UI (overview); settings by build/type checks |
| Service deployments (redeploy, rollback, replace upload) | `/deploy`, `/deployments/:id` | UI (build log) |
| Service logs (live, pause, filters, older lines) | logs history + SSE | UI |
| Service metrics (live, 24h/7d/30d) | `/metrics` + SSE | UI (live) |
| Service environment (role-aware) | `/env` | UI (owner add; developer read-only) |
| Deployments page | `/deployments` | type/build checks |
| Servers | `/servers`, `/servers/load` (polled) | type/build checks |
| Billing (owner-only details, invoices/PDF, portal, plan modal) | `/billing/*`, `/plan` | UI (owner-only message for developers) |
| Settings: profile, security (password, 2FA, sessions), notifications, API keys, team, danger zone | `/me/*`, `/api-keys`, `/team/*`, `DELETE /me` | UI (2FA, API keys, team); others by type/build checks |
| Team switcher (account menu) | `/teams`, per-tab `X-Team-Id` | type/build checks; API behaviour by IT |
| Notifications menu, toasts | `/notifications`, SSE | type/build checks |
| Support, contact form, docs feedback | `/support/tickets`, `/contact`, `/docs/feedback` | type/build checks; API by IT |
| Control Center (staff) | `/admin/*` | type/build checks; API by IT |
| Status page (Server Component, 60 s revalidation) | `GET /status` | UI |
| Marketing (products, pricing) | static; undeployable products marked "Coming soon" | build |

## Acceptance risks (prompt §15) → where they are covered

| Risk | Covered by |
| ---- | ---------- |
| Atomic signup, duplicate races, owner always present | auth.test (signup), account-platform (owner protection) |
| Login variants, remember/expiry, revocation, expired-not-TTL tokens, reset replay, verification, OAuth state, OAuth+TOTP | auth.test, twofactor-oauth.test |
| Roles and key scopes; cross-team access | services.test (tenant isolation and roles), account-platform, observability (keys), UI (developer) |
| CSRF incl. multipart; webhook signatures; unsafe redirects; NoSQL operators/mass assignment | auth.test (CSRF, operators), pipeline.test (upload CSRF), github/billing tests, twofactor-oauth (redirects), services.test (legacy fields) |
| Keys shown once, revoked immediately; env encrypted, redacted, never in SSE/keys/errors/logs | observability.test, services.test, UI (env masked, key response without env) |
| Catalog, limits, regions, capacity, slugs, reserved env keys, source validation | services.test, platform-misc.test |
| One active deployment, counters, commit→enqueue crash recovery, stale workers | services.test, pipeline.test |
| GitHub/upload/image deploys, health failure keeps previous version, honest first failure, stop/restart/rollback, singleton handoff | pipeline.test (test double), UI (upload deploy) — **real Docker blocked** |
| Archive limits, unauthorized uploads, fetch restrictions, effective limits | archive.test, pipeline.test (hardened spec) — kernel enforcement **blocked** |
| Real logs/metrics units/history, reconnect, SSE revocation, crashes, debounced notifications | observability.test, services.test (events), pipeline.test (crash policy) |
| Paid create/upgrade/downgrade/Free/delete, no-card checkout, failures, webhook order/repeats, repeated returns, limit-update failure | billing.test (gateway double) — **live Stripe unverified** |
| Team invite/accept/switch/remove; developer without billing; no tab mixing | account-platform.test, UI (invite → accept, billing owner-only); per-tab isolation by design (sessionStorage + header) |
| Account deletion | account-platform.test (deletion) |
| Every business screen connected; typecheck/lint/build/tests pass | root `npm run typecheck`, `lint`, `test`, `build`; UI smoke |
