# 02 — Folder structure

## Repository root

```
DIGITALYCloud/
├── apps/
│   ├── backend/            Express API (not implemented yet; only package.json)
│   └── frontend/           Next.js app: marketing site, docs, status page, auth, dashboard
├── docs/                   ← you are here: project + API + integration documentation
├── .gitignore              node_modules, .env*, .next, dist, build, logs, .DS_Store, .vercel
├── package.json            Root manifest (no workspaces, no scripts yet)
├── package-lock.json       Empty root lockfile (untracked)
└── README.md               One-line title
```

There are **no npm workspaces**, so each app installs and runs on its own (`cd apps/frontend && npm install`).
**Proposed:** add `"workspaces": ["apps/*", "packages/*"]` once a shared types package exists (see [backend guide](06-backend-guide.md#shared-types)).

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
│   │   ├── status/page.tsx                /status             (data/status.ts)
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
├── data/                                  Static content and demo seed data
│   ├── products.ts                        6 products with plans/prices/specs (source of plan catalog)
│   ├── regions.ts                         11 regions, minPlan rules, helpers (regionLabel, isRegionAllowed, serverFor)
│   ├── seed.ts                            Demo user, 3 services, deployments, servers, invoices, API keys, notifications, admin rows
│   ├── status.ts                          Status components, incidents, maintenance
│   ├── changelog.ts  legal.ts
│   └── docs/                              Documentation articles (guides, platform, best-practices) + catalog/sections/headings
│
├── hooks/
│   ├── use-live-series.ts                 Rolling chart series (random samples every N ms)
│   ├── use-service-logs.ts                Simulated log stream
│   ├── use-hydrated.ts  use-click-outside.ts
│
├── lib/
│   ├── api/
│   │   ├── index.ts                       ★ The single data-access entry point: `export { api } from './mock-api'`
│   │   └── mock-api.ts                    ★ Fake backend (localStorage). THE CONTRACT the real API must match.
│   ├── types.ts                           ★ Shared domain types (User, Service, Deployment, EnvVar, ApiKey, …)
│   ├── catalog.ts                         Plans per service type, SERVICE_TYPES, NODE_VERSIONS, monthlyTotal()
│   ├── simulation.ts                      Deterministic fake charts and logs (to be removed when real data exists)
│   ├── validation.ts                      isValidEmail, safeRedirectPath
│   ├── format.ts                          formatUptime, timeAgo, formatEuro, slugify, uid…
│   ├── routes.ts  browser.ts  toast-events.ts  utils.ts
│
├── providers/
│   ├── app-providers.tsx                  <ToastProvider><AuthProvider>
│   ├── auth-provider.tsx                  useAuth(): user, login, signup, logout, updateProfile…
│   ├── cloud-provider.tsx                 useCloud(): services, deployments, notifications + actions
│   └── toast-provider.tsx                 useToast()
│
├── public/DIGITALYCloud_Logo.png
├── .env.example                           NEXT_PUBLIC_SITE_URL
├── next.config.ts                         typedRoutes, /app → /dashboard redirect
├── components.json                        shadcn/ui config
├── eslint.config.mjs  postcss.config.mjs  tsconfig.json (alias @/* → ./*)
├── AGENTS.md / CLAUDE.md                  Next.js 16 agent rules (read node_modules/next/dist/docs before coding)
└── README.md                              Frontend readme
```

★ = the files a backend developer must read first.

---

## `apps/backend/` (target layout, Proposed)

Today the folder only has `package.json` (`express@^5.2.1`, CommonJS, no scripts). Below is the recommended structure. The reasoning is in [06-backend-guide.md](06-backend-guide.md).

```
apps/backend/
├── src/
│   ├── server.ts                    Starts the HTTP server (reads PORT)
│   ├── app.ts                       Builds the Express app: middleware → routes → error handler
│   ├── config/
│   │   └── env.ts                   Loads + validates environment variables (Zod). Crash on missing values.
│   ├── db/
│   │   ├── client.ts                Prisma/Drizzle client
│   │   └── seed.ts                  Dev seed (mirror of apps/frontend/data/seed.ts)
│   ├── catalog/
│   │   ├── plans.ts                 Plan table per service type (must match apps/frontend/lib/catalog.ts)
│   │   └── regions.ts               Regions + minPlan (must match apps/frontend/data/regions.ts)
│   ├── middleware/
│   │   ├── authenticate.ts          Session cookie OR Bearer API key → req.auth
│   │   ├── require-auth.ts          401 if not signed in
│   │   ├── require-team-role.ts     403 unless Owner/Admin/Developer/Viewer as needed
│   │   ├── require-platform-admin.ts  403 unless User.role === 'admin'
│   │   ├── require-scope.ts         API keys: 'read' = GET only, 'full' = writes
│   │   ├── validate.ts              Zod body/query/params validation → 400 VALIDATION_ERROR
│   │   ├── rate-limit.ts            Per-IP / per-user limits (auth, contact, uploads)
│   │   └── error-handler.ts         AppError → { error: { code, message, fields } }
│   ├── modules/                     One folder per domain: routes + controller + service + schemas
│   │   ├── auth/                    session, login, signup, logout, Google OAuth, password reset
│   │   ├── account/                 /me: profile, password, sessions, 2FA, notification prefs, delete
│   │   ├── services/                CRUD, start/stop/restart, plan change
│   │   ├── env-vars/                Encrypted environment variables
│   │   ├── deployments/             Trigger, list, details + build logs
│   │   ├── logs/                    Runtime logs (history + SSE stream)
│   │   ├── metrics/                 Service metrics (history + live)
│   │   ├── events/                  Per-user SSE hub (/v1/events)
│   │   ├── api-keys/
│   │   ├── notifications/
│   │   ├── team/                    Members + invitations
│   │   ├── billing/                 Summary, invoices, Stripe portal
│   │   ├── support/                 Tickets
│   │   ├── contact/                 Public contact form
│   │   ├── catalog/                 Public plans + regions
│   │   ├── status/                  Public status page data
│   │   ├── servers/                 Hosts visible to customers
│   │   ├── admin/                   Control Center stats (platform admins)
│   │   ├── uploads/                 .zip/.tar/.gz source uploads
│   │   ├── integrations/github/     GitHub App install, repos, branches
│   │   └── webhooks/                Stripe + GitHub webhooks (raw body, signature check)
│   ├── jobs/                        BullMQ workers
│   │   ├── deploy.worker.ts         Runs the 5 deploy stages, streams build logs, updates status
│   │   ├── metrics.collector.ts     Samples container stats → SSE + metrics table
│   │   ├── usage-alerts.ts          80% RAM/storage → notification + email
│   │   └── email.worker.ts
│   ├── runtime/
│   │   ├── docker.ts                Docker Engine API client (build, run, stop, stats, logs)
│   │   └── scheduler.ts             Picks a server in the region (fills Service.server)
│   └── lib/
│       ├── errors.ts                AppError + helpers (notFound, forbidden, conflict…)
│       ├── crypto.ts                AES-256-GCM for env vars & TOTP secrets, sha256 for tokens/keys
│       ├── ids.ts                   Prefixed random ids (usr_, dep_, key_, ntf_…)
│       ├── slug.ts                  Service id from name (same rules as apps/frontend/lib/format.ts slugify)
│       ├── mailer.ts
│       └── serializers.ts           DB row → API JSON (camelCase, epoch-ms timestamps)
├── prisma/schema.prisma             (or drizzle/ schema)
├── tests/                           Integration tests per module (supertest)
├── .env.example
├── tsconfig.json
└── package.json                     scripts: dev, build, start, test, db:migrate, db:seed
```

### Proposed shared package

```
packages/shared/
├── src/types.ts       Moved from apps/frontend/lib/types.ts (User, Service, Deployment…)
├── src/catalog.ts     Plans + regions + isRegionAllowed (one source of truth)
└── src/api.ts         Request/response types for every endpoint
```

This stops the frontend and backend from drifting apart. Until it exists, **any change to `lib/types.ts`, `lib/catalog.ts` or `data/regions.ts` must be mirrored in `apps/backend/src/catalog/`**.
