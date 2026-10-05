# 01 — Project overview

## What DIGITALYCloud is

DIGITALYCloud ("Deploy. Run. Scale.") is a hosting platform by **DIGITALY SAS** (Lyon, France) for:

- **Discord bots** (always-on, auto-restart)
- **Node.js apps** (any start command, public URL)
- **APIs** (HTTP services with a public HTTPS URL and health checks)
- **Background workers** (jobs, schedulers, queue consumers)

The marketing site also advertises **Game servers** and **Website hosting** (`data/products.ts`). They have product pages and pricing, but **the dashboard can't create them yet**: only the four types above exist in `lib/types.ts` (`ServiceType`).

Users sign up, create a **service** in a 5-step wizard, and it deploys. From then on they can start, stop, restart and redeploy it, edit environment variables, watch logs and metrics, change its plan, and delete it.

| Item              | Value                                                         |
| ----------------- | ------------------------------------------------------------- |
| Production site   | `https://cloud.digitaly.fr` (`NEXT_PUBLIC_SITE_URL`)          |
| Public API (docs) | `https://api.cloud.digitaly.fr/v1` (see `data/docs/platform.tsx`) |
| Service URLs      | `https://{serviceId}.digitaly.app` (only services with a port) |
| Currency          | EUR, VAT included, billed monthly, prorated                   |
| Support email     | `support@digitaly.fr`                                         |
| Repository        | `github.com/DIGITALYCompany/DIGITALYCloud`                    |

## Current state (October 2026)

| Part                      | State                                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Marketing site, docs, status, legal | ✅ Done. Static content in `apps/frontend/data/`.                                                                             |
| Auth screens              | ✅ UI done. Uses the mock (any email + password of 6+ characters signs in).                                                            |
| Dashboard                 | ✅ UI done. Uses the mock for services, deployments, env vars, API keys, notifications. Other screens use hard-coded data.                 |
| Backend (`apps/backend`)  | ❌ Not started. Only `package.json` with `express@^5.2.1`.                                                                             |
| Real deployments/runtime  | ❌ None. Deploy progress, logs, metrics and resource usage are all simulated in the browser.                                       |
| Payments                  | ❌ None. Card, invoices and next billing date are hard-coded.                                                                         |

## Features (what the backend has to support)

### Public (no login)

| Feature                  | Route(s)                                  | Needs backend?                                                     |
| ------------------------ | ----------------------------------------- | ------------------------------------------------------------------ |
| Landing, products, pricing | `/`, `/products`, `/products/[slug]`, `/pricing` | No (static). Plans/regions should match the backend catalog. |
| Documentation            | `/docs`, `/docs/[slug]`                   | Optional: article feedback (👍/👎)                                 |
| Status page              | `/status`                                 | Optional: live components, incidents, maintenance                  |
| Contact form             | `/contact`                                | **Yes**: `POST /v1/contact`                                        |
| About, changelog, infrastructure, legal | `/about`, `/changelog`, `/infrastructure`, `/legal/[doc]` | No |

### Authentication

| Feature                 | Route              | Notes                                                                          |
| ----------------------- | ------------------ | ------------------------------------------------------------------------------ |
| Email + password login  | `/login`           | "Remember me" checkbox → long-lived vs browser-session cookie. `?from=` returns the user to the page they came from. |
| Sign up                 | `/signup`          | Name, email, password (≥ 8 chars)                                              |
| Google sign-in          | `/login`, `/signup`| Button exists, mock fakes it                                                   |
| Forgot password         | `/forgot-password` | Sends reset email. **The reset page itself (`/reset-password?token=`) does not exist yet.** |

### Dashboard (logged in)

| Feature                    | Route                                   | Main data                                    |
| -------------------------- | --------------------------------------- | -------------------------------------------- |
| Overview                   | `/dashboard`                            | Services, recent deployments, 24h usage chart |
| Services list              | `/services`                             | Services (search + status filter)            |
| Create service (wizard)    | `/services/new`                         | Type → Source → Configure → Plan & region → Review → live deploy progress |
| Service overview           | `/services/[id]`                        | Status, uptime, resources, live CPU/RAM, recent deploys |
| Service deployments        | `/services/[id]/deployments`            | History + "Deploy" button + build logs       |
| Service environment        | `/services/[id]/environment`            | Env vars (add/edit/delete, secret toggle, reveal, copy) |
| Service logs               | `/services/[id]/logs`                   | Live stream, level filter, search, pause, download |
| Service metrics            | `/services/[id]/metrics`                | Live / 24h / 7d / 30d: CPU, RAM, network, disk |
| Service settings           | `/services/[id]/settings`               | Name, branch, start command, port, Node version, plan, auto-deploy, auto-restart, delete |
| All deployments            | `/deployments`                          | Deployments across all services              |
| Servers                    | `/servers`                              | Hosts, their load, containers                |
| Billing                    | `/billing`                              | Monthly total, payment method, plan per service, usage, invoices |
| Support                    | `/support`                              | Open a ticket                                |
| Settings                   | `/settings?tab=profile\|security\|notifications\|api\|team\|danger` | Profile, password, 2FA, sessions, email prefs, API keys, team, delete account |
| Control Center (staff)     | `/admin`                                | Platform-wide stats (only `User.role === 'admin'`) |

## Service types

| `ServiceType` | Label       | Default start command | Port                  | Product slug    |
| ------------- | ----------- | --------------------- | --------------------- | --------------- |
| `discord`     | Discord Bot | `node index.js`       | none                  | `discord-bots`  |
| `node`        | Node.js     | `npm run start`       | **required** (3000)   | `nodejs`        |
| `api`         | API         | `npm run start`       | **required** (3000)   | `apis`          |
| `worker`      | Worker      | `node worker.js`      | none                  | `workers`       |

Runtimes: **Node.js** (`22 LTS`, `20 LTS`, `18`) for `github`/`upload` sources, **Docker** for `docker` source.

## Plans (per service type)

Each service has its own plan. Every type has four plan levels (`free`, `starter`, `pro`, `business`) with its own name and price.
Values come from `data/products.ts`, parsed by `lib/catalog.ts`. Where a product's specs don't state vCPU or storage, `lib/catalog.ts` falls back to the level defaults (0.25/0.5/1/2 vCPU, 1/5/15/30 GB).

| Level (`PlanId`) | Discord bot                 | Node.js                      | API                          | Worker                         |
| ---------------- | --------------------------- | ---------------------------- | ---------------------------- | ------------------------------ |
| `free`           | Bot Free · €0 · 256 MB · 0.25 vCPU · 1 GB | Hobby · €0 · 512 MB · 0.25 vCPU · 1 GB | Hobby · €0 · 512 MB · 0.25 vCPU · 1 GB | Free · €0 · 256 MB · 0.25 vCPU · 1 GB |
| `starter`        | Bot Starter · €1.99 · 512 MB · 0.5 vCPU · 5 GB | Starter · €2.99 · 1 GB · 0.5 vCPU · 5 GB | Launch · €3.99 · 1 GB · 0.5 vCPU · 5 GB | Worker · €2.49 · 512 MB · 0.5 vCPU · 5 GB |
| `pro`            | Bot Pro · €3.99 · 1 GB · 1 vCPU · 15 GB | Pro · €6.99 · 2 GB · 1 vCPU · 15 GB | Growth · €8.99 · 2 GB · 1 vCPU · 15 GB | Worker Pro · €5.99 · 1.5 GB · 1 vCPU · 15 GB |
| `business`       | Bot Ultra · €7.99 · 2 GB · 2 vCPU · 30 GB | Scale · €14.99 · 4 GB · 2 vCPU · 30 GB | Scale · €19.99 · 4 GB · 2 vCPU · 30 GB | Worker Max · €12.99 · 4 GB · 2 vCPU · 30 GB |

Rules the backend must enforce:

- `ramLimitMb = plan.ramMb` and `storageLimitMb = plan.storageGb × 1024`. The **server derives these**. Never trust a client-sent limit.
- **Automatic restart** is a paid feature (disabled on `free`).
- Upgrades are prorated and immediate. Downgrades apply immediately and credit the difference to the next invoice (`data/docs/platform.tsx` → Billing).
- Free plans never require a payment method.

## Regions

From `data/regions.ts`. A region is allowed when `level(plan) ≥ level(region.minPlan)`.

| id          | City       | Country        | Code       | Area          | `minPlan`  |
| ----------- | ---------- | -------------- | ---------- | ------------- | ---------- |
| `lyon`      | Lyon       | France         | `FR-LYS-1` | Europe        | `free` (default) |
| `paris`     | Paris      | France         | `FR-PAR-1` | Europe        | `free`     |
| `frankfurt` | Frankfurt  | Germany        | `DE-FRA-1` | Europe        | `starter`  |
| `amsterdam` | Amsterdam  | Netherlands    | `NL-AMS-1` | Europe        | `starter`  |
| `london`    | London     | United Kingdom | `UK-LON-1` | Europe        | `starter`  |
| `madrid`    | Madrid     | Spain          | `ES-MAD-1` | Europe        | `starter`  |
| `montreal`  | Montréal   | Canada         | `CA-MTL-1` | North America | `pro`      |
| `virginia`  | Virginia   | United States  | `US-ASH-1` | North America | `pro`      |
| `singapore` | Singapore  | Singapore      | `SG-SIN-1` | Asia Pacific  | `business` |
| `tokyo`     | Tokyo      | Japan          | `JP-TYO-1` | Asia Pacific  | `business` |
| `sydney`    | Sydney     | Australia      | `AU-SYD-1` | Asia Pacific  | `business` |

Coverage by plan: free = France · starter = all of Europe · pro = Europe & North America · business = worldwide.

The UI displays a region as `"{country} — {city}"` (e.g. `France — Lyon`). The mock stores that **label** in `Service.region`. The backend should store the region **id** (see [04-data-models.md](04-data-models.md)).

> Only **Lyon** and **Paris** have servers in the seed data (`Lyon-01`, `Lyon-02`, `Paris-01`). The other regions are listed for sale but have no infrastructure in the demo. See [open questions](08-roadmap-and-open-questions.md).

## Users and roles

There are **two separate role systems**. Don't mix them up:

1. **Platform role**: `User.role: 'user' | 'admin'`. `admin` means DIGITALY staff and unlocks `/admin` (Control Center).
2. **Team role**: Owner · Admin · Developer · Viewer, inside a team/account (Settings → Team).

| Team role | Can do (from `data/docs/platform.tsx` + `components/settings/team-panel.tsx`) |
| --------- | ------------------------------------------------------------------------------ |
| Owner     | Everything, including billing and deleting the account. Exactly one per team. |
| Admin     | Manage services, deployments, variables and team members.                     |
| Developer | Deploy, restart and read logs. Cannot see billing.                            |
| Viewer    | Read-only (in the UI, but not described in the public docs; see open questions). |

## Tech stack

| Layer     | Today                                                                                   | Proposed for backend                                                  |
| --------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Frontend  | Next.js 16.3 (App Router, Turbopack, `typedRoutes`), React 19.2, TypeScript 5, Tailwind CSS v4, shadcn/ui conventions (Radix, `cva`, `cn()`), Recharts 3, lucide-react 0.446 (pinned) | — |
| Backend   | Express 5 (declared only)                                                               | Node.js 22 + TypeScript, Express 5, Zod validation                    |
| Database  | `localStorage` (mock)                                                                   | PostgreSQL 16 (+ Prisma or Drizzle)                                   |
| Jobs      | `setTimeout` in the browser                                                             | Redis + BullMQ (deploy pipeline, emails, usage alerts)               |
| Runtime   | Simulated                                                                               | Docker containers on DIGITALY servers (Docker Engine API)             |
| Real-time | Simulated intervals                                                                     | Server-Sent Events (SSE)                                              |
| Payments  | Hard-coded                                                                              | Stripe (subscriptions with proration, Billing Portal, invoices)       |
| Email     | None                                                                                    | Transactional email provider (SMTP / Resend / Postmark)              |
| Auth      | Mock                                                                                    | httpOnly session cookie (dashboard) + Bearer API keys (public API), Google OAuth, TOTP 2FA |

Details and reasons are in [06-backend-guide.md](06-backend-guide.md).
