# 02 — Folder structure

## Repository root

```
DIGITALYCloud/
├── apps/
│   ├── backend/            Express 5 API, workers and collectors (MongoDB, Redis, Docker, Stripe)
│   └── frontend/           Next.js 16 app: marketing site, docs, status page, auth, dashboard
├── packages/
│   └── shared/             @digitalycloud/shared: enums, catalog, validation, permissions, API DTOs (used by both apps)
├── docs/                   ← you are here: project, API, integration and operations documentation
├── .github/workflows/ci.yml  Typecheck, lint and build all workspaces; build the backend image
├── compose.yaml            Local MongoDB replica set, Redis, Mailpit (+ MinIO, Traefik, app profiles)
├── package.json            npm workspaces (packages/*, apps/*) and root scripts
└── package-lock.json       The only lockfile
```

Install once at the root (`npm install`); run scripts per workspace (`npm run dev --workspace backend`) or with the root
shortcuts `npm run dev:api`, `dev:worker`, `dev:web`, `typecheck`, `lint`, `build`.

---

## `apps/frontend/` (exists)

```
apps/frontend/
├── app/                                   Next.js App Router. Route files are thin Server Components.
│   ├── layout.tsx                         Root layout: Geist fonts, metadata, <AppProviders> (toast + auth)
│   ├── globals.css                        Tailwind v4 config: @theme tokens (ink, brand, azure, aqua, success, warning, danger), animations
│   ├── not-found.tsx                      Global 404
│   │
│   ├── (marketing)/                       Public site (static / SSG). Layout = site header + footer.
│   │   ├── layout.tsx
│   │   ├── page.tsx                       Landing page  →  /
│   │   ├── about/page.tsx                 /about
│   │   ├── changelog/page.tsx             /changelog          (data/changelog.ts)
│   │   ├── contact/page.tsx               /contact            (components/marketing/contact-form.tsx)
│   │   ├── docs/page.tsx                  /docs               (data/docs)
│   │   ├── docs/[slug]/page.tsx           /docs/:slug
│   │   ├── infrastructure/page.tsx        /infrastructure     (data/regions.ts)
│   │   ├── legal/[doc]/page.tsx           /legal/terms | privacy | acceptable-use   (data/legal.ts)
│   │   ├── pricing/page.tsx               /pricing            (data/products.ts)
│   │   ├── products/page.tsx              /products
│   │   ├── products/[slug]/page.tsx       /products/:slug     (discord-bots, game-servers, nodejs, apis, workers, websites)
│   │   ├── status/page.tsx                /status             (Server Component, GET /status every 60 s)
│   │   └── not-found.tsx
│   │
│   ├── (auth)/                            Login/signup pages. Layout = split screen with brand panel.
│   │   ├── layout.tsx
│   │   ├── login/page.tsx                 /login              (components/auth/login-form.tsx)
│   │   ├── signup/page.tsx                /signup             (components/auth/signup-form.tsx)
│   │   └── forgot-password/page.tsx       /forgot-password    (components/auth/forgot-password-form.tsx)
│   │
│   └── (dashboard)/                       Authenticated app. Layout = <RequireAuth><CloudProvider><AppShell>
│       ├── layout.tsx
│       ├── loading.tsx
│       ├── dashboard/page.tsx             /dashboard          Overview
│       ├── services/page.tsx              /services           List
│       ├── services/new/page.tsx          /services/new       Creation wizard
│       ├── services/[id]/layout.tsx       Service header, actions and tabs (components/services/detail/service-shell.tsx)
│       ├── services/[id]/page.tsx         /services/:id                 Overview tab
│       ├── services/[id]/deployments/page.tsx   /services/:id/deployments
│       ├── services/[id]/environment/page.tsx   /services/:id/environment
│       ├── services/[id]/logs/page.tsx          /services/:id/logs
│       ├── services/[id]/metrics/page.tsx       /services/:id/metrics
│       ├── services/[id]/settings/page.tsx      /services/:id/settings
│       ├── deployments/page.tsx           /deployments        All deployments
│       ├── servers/page.tsx               /servers            Hosts
│       ├── billing/page.tsx               /billing            (?upgrade=<serviceId> opens plan picker)
│       ├── support/page.tsx               /support
│       ├── settings/page.tsx              /settings?tab=profile|security|notifications|api|team|danger
│       └── admin/page.tsx                 /admin              Control Center (platform admins only)
│
├── components/                            UI components, grouped by feature
│   ├── ui/                                Design-system primitives
│   │   ├── action-menu.tsx  avatar.tsx  badge.tsx  button.tsx  callout.tsx  card.tsx
│   │   ├── code-block.tsx  dialog.tsx  empty-state.tsx  link-tabs.tsx  logo.tsx  modal.tsx
│   │   └── nav-link.tsx  page-header.tsx  progress-bar.tsx  skeleton.tsx  switch.tsx  tabs.tsx  tooltip.tsx
│   ├── layout/
│   │   ├── app-shell.tsx                  Dashboard frame (sidebar, top bar, mobile bottom nav)
│   │   ├── sidebar.tsx  sidebar-plan-card.tsx
│   │   ├── account-menu.tsx               Avatar menu (shows "Control Center" link for platform admins)
│   │   ├── notifications-menu.tsx         Bell menu (uses useCloud().notifications)
│   │   ├── global-search.tsx              ⌘K search over services
│   │   ├── require-auth.tsx               Client-side auth guard → /login?from=…
│   │   ├── site-header.tsx  site-footer.tsx  site-main.tsx  products-menu.tsx  not-found-view.tsx
│   ├── auth/                              login-form, signup-form, forgot-password-form, auth-form-parts (Google button, errors)
│   ├── dashboard/                         dashboard-overview, attention-banner, plans-card, service-row
│   ├── services/
│   │   ├── services-list.tsx  service-card.tsx  service-icon.tsx
│   │   ├── new-service-wizard.tsx         5-step wizard + validation, calls createService
│   │   ├── wizard-steps.tsx               Step UIs (type, source, configure, plan & region)
│   │   ├── region-picker.tsx
│   │   ├── deploy-progress.tsx            Animated first deployment after the wizard (timer-driven today)
│   │   ├── deployment-item.tsx            Expandable deployment row with build logs
│   │   ├── change-plan-modal.tsx          Plan picker (respects region minPlan)
│   │   ├── live-charts.tsx                Live CPU / RAM charts (simulated today)
│   │   ├── use-service-actions.tsx        start / stop / restart / deploy / delete + confirm dialogs
│   │   └── detail/                        Tabs of /services/[id]:
│   │       ├── service-shell.tsx          Header + tabs + useService() context
│   │       ├── service-overview.tsx  service-deployments.tsx  service-environment.tsx
│   │       └── service-logs.tsx  service-metrics.tsx  service-settings.tsx
│   ├── deployments/deployments-view.tsx
│   ├── servers/servers-view.tsx           (hard-coded SERVERS)
│   ├── billing/billing-view.tsx           (hard-coded INVOICES, card, dates)
│   ├── settings/
│   │   ├── settings-view.tsx              Profile, Security, Notifications, Danger tabs
│   │   ├── api-keys-panel.tsx             API keys tab (uses api.apiKeys)
│   │   └── team-panel.tsx                 Team tab (local state only)
│   ├── support/support-view.tsx           Ticket form (fake submit)
│   ├── admin/admin-view.tsx               Control Center (hard-coded numbers)
│   ├── charts/charts.tsx                  Recharts wrappers (AreaSeriesChart, BarSeriesChart, colors)
│   ├── marketing/                         Landing/pricing/product sections, contact-form.tsx, pricing.ts helpers
│   ├── docs/                              docs-home, docs-sidebar, table-of-contents, article-feedback
│   ├── status/                            status-sections, status-widgets, uptime-bars, uptime-legend
│   └── infrastructure/region-map.tsx
│
├── config/
│   ├── site.ts                            Site name, title, description, URL, OG image
│   └── navigation.ts                      Public nav, footer, dashboard sidebar, mobile bar, account menus
│
├── data/                                  Static marketing content
│   ├── products.ts                        6 products (marketing copy; plans match the shared catalog; 2 are "Coming soon")
│   ├── regions.ts                         Re-exports the shared region catalog
│   ├── changelog.ts  legal.ts
│   └── docs/                              Documentation articles (guides, platform, best-practices) + catalog/sections/headings
│
├── hooks/
│   ├── use-api.ts                         Load-on-mount helper (loading/error/reload)
│   ├── use-service-logs.ts                Runtime log tail over SSE with resume and history
│   ├── use-deployment-logs.ts             Build log + live deployment.log events
│   ├── use-system-status.ts               Current platform status for badges
│   ├── use-hydrated.ts  use-click-outside.ts
│
├── lib/
│   ├── api/
│   │   ├── index.ts                       ★ `api`: every endpoint, typed with the shared DTOs
│   │   ├── http-client.ts                 ★ fetch wrapper: cookies, CSRF bootstrap/retry, X-Team-Id, ApiError, upload progress
│   │   ├── events.ts                      ★ One shared /events EventSource per tab (resync/revoked handling)
│   │   └── server.ts                      Server-side fetch for Server Components (status page)
│   ├── types.ts                           UI types = shared DTOs (User, Service, Deployment, …)
│   ├── catalog.ts                         Shared plans + SERVICE_TYPES icons, monthlyTotal()
│   ├── validation.ts                      Re-exports shared isValidEmail, safeRedirectPath
│   ├── format.ts                          formatUptime, timeAgo, formatEuro, slugify, uid…
│   ├── routes.ts  browser.ts  toast-events.ts  utils.ts
│
├── proxy.ts                               Optimistic login redirect for dashboard routes (Next.js 16 Proxy)
├── providers/
│   ├── app-providers.tsx                  <ToastProvider><AuthProvider>
│   ├── auth-provider.tsx                  useAuth(): user, teams, per-tab team, login (2FA), signup, logout, can(action)…
│   ├── cloud-provider.tsx                 useCloud(): team services/deployments/notifications/catalog + SSE + actions
│   └── toast-provider.tsx                 useToast()
│
├── public/DIGITALYCloud_Logo.png
├── .env.example                           NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_API_URL (+ server-only API_INTERNAL_URL, AUTH_PROXY_GUARD)
├── next.config.ts                         typedRoutes, /app → /dashboard redirect
├── components.json                        shadcn/ui config
├── eslint.config.mjs  postcss.config.mjs  tsconfig.json (alias @/* → ./*)
├── AGENTS.md / CLAUDE.md                  Next.js 16 agent rules (read node_modules/next/dist/docs before coding)
└── README.md                              Frontend readme
```

★ = the files a backend developer must read first.

---

## `apps/backend/`

Details and commands: [apps/backend/README.md](../apps/backend/README.md). Design: [backend-decisions.md](backend-decisions.md).

```
apps/backend/
├── src/
│   ├── server.ts  worker.ts  cli.ts       Process entry points (API · worker/collector · operator CLI)
│   ├── app.ts  routes.ts  internal.ts     Express app, /v1 route table, private listener (readiness, metrics, proxy feed)
│   ├── bootstrap.ts  context.ts           Config + MongoDB + Redis + integrations; ctx() for services
│   ├── config/env.ts                      Zod-validated environment and capabilities
│   ├── db/                                connection (replica set, withTransaction), models/, indexes, migrations
│   ├── http/  middleware/                 cookies, validation, principals; authenticate, CSRF, tenant, rate limits, idempotency, errors
│   ├── modules/<area>/                    *.routes.ts + *.service.ts per feature: auth, account, teams, services, deployments,
│   │                                      logs, metrics, events, uploads, github, billing, api-keys, notifications, support,
│   │                                      platform (servers, status, admin), catalog, email, health
│   ├── runtime/                           Docker driver, pipeline, operations, capacity, collectors, crash policy, reconcile, purge
│   ├── jobs/                              Transactional outbox, BullMQ queues, runner, processor registry
│   ├── realtime/                          Event hub (Redis Streams + Pub/Sub), SSE writer
│   ├── integrations/                      mail, storage (S3/filesystem), Google OIDC, GitHub App, Stripe
│   ├── serializers/                       Model → DTO (no _id, hashes, encrypted values or container ids)
│   ├── lib/                               errors, ids, crypto (AES-256-GCM, HMAC), logger, audit
│   └── openapi.ts                         OpenAPI description → docs/openapi.json
├── scripts/                               env-init (local .env), dev-infra (Docker-free MongoDB + Redis), openapi
├── Dockerfile                             Non-root runtime image (API, worker, CLI)
└── .env.example                           Every variable, with production notes
```

## `packages/shared/`

```
packages/shared/src/
├── enums.ts         Service types, statuses, plans, roles, stages… (arrays are the source of truth)
├── catalog.ts       Plans with prices in cents, regions + plan rules, Node versions, limits, retention
├── validation.ts    Regexes and user-facing messages shared by the forms and the API
├── permissions.ts   Role/API-key permission matrix (enforced by the API, used by the dashboard to gate controls)
└── types.ts         Wire DTOs for every endpoint and SSE event
```
