# 08 — Roadmap and open questions

## Build order

Each phase leaves the product usable. The frontend switches from mock to HTTP one feature at a time ([07](07-frontend-integration.md)). Until a phase ships, its screens stay on the mock or on hard-coded data.

| Phase | Scope | Backend endpoints | Frontend work | Done when |
| ----- | ----- | ----------------- | ------------- | --------- |
| **0. Foundation** | TypeScript Express app, config, Postgres + Redis, error format, logging, CI, seed | `GET /health` | `.env` vars, `http-client.ts`, `lib/api/types.ts` | `npm run dev` serves `/v1/health`; CI runs tests; seed loads demo data |
| **1. Auth & account** | Users, personal team, sessions, password reset, Google OAuth, profile | `/auth/*`, `PATCH /me`, `GET /catalog` | `http-api.ts` auth namespace, `proxy.ts`, reset-password page, 401 handling | Sign up/in/out works with real cookies; dashboard redirects when signed out |
| **2. Services (control plane)** | Services CRUD, env vars (encrypted), plan rules, region rules, deployments as records | `/services*`, `/deployments*`, `/notifications*` | Services/deployments/notifications via HTTP | The whole dashboard runs on the API. Deployments can be completed by a **stub worker** (sleep + success) until Phase 3. |
| **3. Deploy pipeline** | BullMQ worker, Docker build/run on Lyon/Paris, stages, build logs, health check, rollbacks, `*.digitaly.app` routing, SSE | `POST /services/:id/deploy` (real), `/events`, `/uploads`, `/integrations/github/*`, `/webhooks/github` | SSE in CloudProvider, real DeployProgress, upload + GitHub steps in the wizard | A real bot/API from GitHub, an upload and a Docker image all deploy and run; auto-deploy on push works |
| **4. Observability** | Runtime logs, metrics collector, usage and crash alerts, notification emails | `/services/:id/logs*`, `/services/:id/metrics`, `/metrics/usage`, notification prefs | Logs hook, live charts, metrics history, dashboard chart, notifications tab | Logs and charts show real container data; 80% RAM sends a notification |
| **5. Public API** | API keys, scopes, rate limits | `/api-keys*`, bearer auth on service endpoints | — (panel already wired) | The `curl` example in `/docs/api` works; read keys can't write |
| **6. Security & teams** | Password change, sessions list, 2FA, team invitations and roles | `/me/password`, `/me/sessions*`, `/me/2fa/*`, `/team/*` | Security tab, team panel, invite page, 2FA login step | A developer invited to a team can deploy but not see billing |
| **7. Billing** | Stripe customers, per-service subscription items, proration, portal, invoices | `/billing/*`, `POST /services/:id/plan`, `/webhooks/stripe` | Billing page, 402 → checkout | Upgrading a service charges a prorated amount; invoices download as PDF |
| **8. Support & platform** | Tickets, contact, docs feedback, servers, status, Control Center | `/support/tickets`, `/contact`, `/docs/feedback`, `/servers*`, `/status`, `/admin/*` | Remaining screens | No screen uses `data/seed.ts` or `lib/simulation.ts` any more (except marketing visuals) |
| **9. Cleanup** | Remove mock mode (optional), shared types package | — | Delete `mock-api.ts`, `simulation.ts`, seed-only data | `packages/shared` used by both apps |

Phases 4–8 can run in parallel once Phase 3 is done.

## Open questions (need a decision)

Each item lists a **recommendation**. Record the decision here when the team makes one.

| # | Question | Context | Recommendation |
| - | -------- | ------- | -------------- |
| 1 | **What is `User.plan` for?** | Billing is per service; nothing in the UI reads `user.plan`. | Keep returning it for compatibility (e.g. the highest plan among the user's services), then remove it from `lib/types.ts`. |
| 2 | **Viewer role**: does it exist? | `team-panel.tsx` offers Viewer; the public docs (`/docs/team-access`) list only Owner/Admin/Developer. | Keep Viewer (read-only) and add it to the docs article. |
| 3 | **Do env var changes restart the service?** | Public docs: "Changing a variable triggers a restart". UI toast: "Restart the service to apply changes." | No automatic restart (safer, matches the UI). Fix the docs article. |
| 4 | **Who can see secret env values?** | The UI reveals and copies secret values, so the API must return plaintext. | Owner/Admin/Developer see values, Viewer gets them redacted. Later, consider a per-variable `reveal` endpoint with an audit log. |
| 5 | **Regions without servers** | 11 regions are on sale, but the seed only has Lyon and Paris servers. | The backend rejects regions with no healthy server (`400 Region temporarily unavailable`) until capacity exists, or the marketing pages mark them "coming soon". |
| 6 | **Game servers and websites** | Sold on the marketing site, but there's no `ServiceType` for them. | Out of scope for v1. Hide the "deploy" CTAs or add a waitlist. |
| 7 | **Seed data vs catalog** | Seed `SyncBot` is a `discord`/`starter` service with `ramLimitMb: 1024`, but Bot Starter is 512 MB. | Server-derived limits fix this automatically. Update the seed. |
| 8 | **Multiple teams per user** | Data model supports it; the UI has no team switcher. | v1: personal team only (+ teams you're invited to, chosen with a simple switcher in the account menu later). |
| 9 | **Service id reuse** | Ids are global subdomains (`{id}.digitaly.app`). | Reserve deleted ids for 30 days to avoid takeover of an old URL. |
| 10 | **Log retention per plan** | Docs: "Free plans keep the most recent logs… Paid plans keep a longer history." | Free: current deployment, max 24 h. Starter: 7 days. Pro: 14 days. Business: 30 days. |
| 11 | **Upload size limits** | Not defined. | 100 MB (free/starter), 500 MB (pro/business). |
| 12 | **Invoice granularity** | `Invoice.plan` is a single label, but billing is per service. | One invoice per team per month with one line per service. `plan` becomes a summary (e.g. `3 services`). |
| 13 | **VAT** | "VAT included" in docs. | Use Stripe Tax with prices tax-inclusive (EU OSS). Confirm with accounting. |
| 14 | **Email provider** | None chosen. | Any provider with EU data residency (GDPR). Sender `no-reply@digitaly.fr`. |
| 15 | **"DIGITALY account" / SSO** | Profile says "One DIGITALY account for Cloud and every other DIGITALY service". Admin shows "DIGITALY ID". | v1: accounts live in DIGITALYCloud. Keep the auth module isolated so it can move to DIGITALY ID later. |
| 16 | **Hosting the backend itself** | Not defined. | API + workers in containers on DIGITALY infrastructure (Lyon), Postgres with daily backups, separate build hosts from runtime hosts. |

## Known gaps in the frontend (to fix during integration)

- No `/reset-password`, `/invite` or 2FA screens (see [07, Step 9](07-frontend-integration.md#step-9-pages-and-states-to-build)).
- `DeployProgress` has no failure state.
- `services.update` sends `ramLimitMb`/`storageLimitMb` (must be ignored server-side).
- Invoice table always shows a "Paid" badge, whatever the status.
- `admin-view.tsx` and `sidebar.tsx` gate admin features only on the client.
- The OG image in `config/site.ts` is still the Bolt template default.
