# 08 — Roadmap and open questions

## Build order — status (2026-10-05)

All phases are implemented (MongoDB instead of Postgres, see [backend-decisions.md](backend-decisions.md)); the mock mode,
simulations and seed data were removed from the frontend. What remains is live verification with real infrastructure and
providers — tracked in [backend-progress.md](backend-progress.md) and [backend-coverage.md](backend-coverage.md).

| Phase | State |
| ----- | ----- |
| 0. Foundation | ✅ Workspaces, `packages/shared`, config, MongoDB replica set, Redis, errors, logging, CI, compose, Dockerfile, dev seed |
| 1. Auth & account | ✅ Sessions, CSRF, signup/login/reset/verification, Google OIDC, `proxy.ts`, reset/verify pages |
| 2. Services | ✅ CRUD, encrypted env, plan/region rules, deployments, notifications, SSE |
| 3. Deploy pipeline | ✅ code complete (Docker hosts, uploads, GitHub App, health checks, rollbacks, routing) · ⚠️ real Docker not yet exercised |
| 4. Observability | ✅ Logs, metrics, usage and crash alerts, notification preferences |
| 5. Public API | ✅ API keys, scopes, rate limits; the docs' `curl` example works as documented |
| 6. Security & teams | ✅ Password, sessions, TOTP + recovery codes, invitations, roles, team switcher, account deletion |
| 7. Billing | ✅ code complete (Checkout, proration, portal, invoices, webhooks, reconciliation) · ⚠️ live Stripe test mode not yet run |
| 8. Support & platform | ✅ Tickets, contact, docs feedback, servers, status, Control Center |
| 9. Cleanup | ✅ Mock API, `simulation.ts`, `data/seed.ts` removed; `packages/shared` used by both apps |

## Open questions — decisions taken

Each item lists the original recommendation; the **Implemented** column records what the code does now.

| # | Question | Context | Recommendation | Implemented |
| - | -------- | ------- | -------------- | ----------- |
| 1 | **What is `User.plan` for?** | Billing is per service; nothing in the UI reads `user.plan`. | Keep returning it for compatibility (e.g. the highest plan among the user's services), then remove it from `lib/types.ts`. | Highest plan in the active team, display only. |
| 2 | **Viewer role**: does it exist? | `team-panel.tsx` offers Viewer; the public docs (`/docs/team-access`) list only Owner/Admin/Developer. | Keep Viewer (read-only) and add it to the docs article. | Kept: read-only, secrets redacted; docs article updated. |
| 3 | **Do env var changes restart the service?** | Public docs: "Changing a variable triggers a restart". UI toast: "Restart the service to apply changes." | No automatic restart (safer, matches the UI). Fix the docs article. | No automatic restart; `pendingChanges.env` shows it; docs article updated. |
| 4 | **Who can see secret env values?** | The UI reveals and copies secret values, so the API must return plaintext. | Owner/Admin/Developer see values, Viewer gets them redacted. Later, consider a per-variable `reveal` endpoint with an audit log. | As recommended (owner/admin/developer plain, viewer redacted, API keys never). |
| 5 | **Regions without servers** | 11 regions are on sale, but the seed only has Lyon and Paris servers. | The backend rejects regions with no healthy server (`400 Region temporarily unavailable`) until capacity exists, or the marketing pages mark them "coming soon". | Regions without a healthy server with capacity are `available: false` and refused with a clear error. |
| 6 | **Game servers and websites** | Sold on the marketing site, but there's no `ServiceType` for them. | Out of scope for v1. Hide the "deploy" CTAs or add a waitlist. | Out of scope; product pages say "Coming soon" with a contact CTA. |
| 7 | **Seed data vs catalog** | Seed `SyncBot` is a `discord`/`starter` service with `ramLimitMb: 1024`, but Bot Starter is 512 MB. | Server-derived limits fix this automatically. Update the seed. | Limits always derived from the catalog; the dev seed uses catalog values. |
| 8 | **Multiple teams per user** | Data model supports it; the UI has no team switcher. | v1: personal team only (+ teams you're invited to, chosen with a simple switcher in the account menu later). | Personal team plus invited teams, switcher in the account menu, per-tab team. |
| 9 | **Service id reuse** | Ids are global subdomains (`{id}.digitaly.app`). | Reserve deleted ids for 30 days to avoid takeover of an old URL. | Deleted slugs reserved 30 days. |
| 10 | **Log retention per plan** | Docs: "Free plans keep the most recent logs… Paid plans keep a longer history." | Free: current deployment, max 24 h. Starter: 7 days. Pro: 14 days. Business: 30 days. | As recommended. |
| 11 | **Upload size limits** | Not defined. | 100 MB (free/starter), 500 MB (pro/business). | As recommended (500 MB for verified Pro/Business source replacements). |
| 12 | **Invoice granularity** | `Invoice.plan` is a single label, but billing is per service. | One invoice per team per month with one line per service. `plan` becomes a summary (e.g. `3 services`). | Invoices mirror Stripe; `plan` summarises the lines. |
| 13 | **VAT** | "VAT included" in docs. | Use Stripe Tax with prices tax-inclusive (EU OSS). Confirm with accounting. | Prices validated as tax-inclusive EUR; Stripe Tax optional (`STRIPE_AUTOMATIC_TAX`) — accounting to confirm. |
| 14 | **Email provider** | None chosen. | Any provider with EU data residency (GDPR). Sender `no-reply@digitaly.fr`. | Brevo (French, EU data), through its SMTP relay. |
| 15 | **"DIGITALY account" / SSO** | Profile says "One DIGITALY account for Cloud and every other DIGITALY service". Admin shows "DIGITALY ID". | v1: accounts live in DIGITALYCloud. Keep the auth module isolated so it can move to DIGITALY ID later. | Accounts live in DIGITALYCloud; auth module isolated. |
| 16 | **Hosting the backend itself** | Not defined. | API + workers in containers on DIGITALY infrastructure (Lyon), MongoDB replica set with continuous backups, separate build hosts from runtime hosts. | Operator decision; MongoDB replica set + Redis, see operations.md. |

## Frontend gaps found before integration — resolved

- ✅ `/reset-password`, `/invite`, `/verify-email` and the 2FA login/setup/recovery screens exist.
- ✅ `DeployProgress` follows real stages and has a failure state.
- ✅ Plan changes go through `POST /services/:id/plan`; client limits are ignored server-side.
- ✅ Invoice badges reflect the real status; PDFs come from the provider.
- ✅ Admin features are enforced by the API (`403` for non-staff); the UI check is only cosmetic.
- ☐ The OG image in `config/site.ts` is still the Bolt template default (needs a branded asset).
