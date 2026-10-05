# 03 — Frontend architecture

Written for backend developers: how the UI gets its data, and what it expects back.

## Running it

```bash
cd apps/frontend
npm install
npm run dev          # http://localhost:3000
npm run typecheck    # route types + tsc
npm run lint
npm run build
```

Demo sign-in: the login form is prefilled. With the mock, **any email + a password of 6+ characters** works.

> ⚠️ `AGENTS.md`: this is **Next.js 16**, which has breaking changes from older versions. Before writing framework code (e.g. `proxy.ts`, which replaces `middleware.ts`), read the guide in `node_modules/next/dist/docs/`.

## Route groups and rendering

| Group          | Rendering                                    | Auth          | Layout                                                    |
| -------------- | -------------------------------------------- | ------------- | --------------------------------------------------------- |
| `(marketing)`  | Server Components, static (SSG)              | Public        | Site header + footer                                      |
| `(auth)`       | Client forms inside a server layout          | Public        | Split screen with brand panel                             |
| `(dashboard)`  | Client Components (data via React context)   | **Required**  | `<RequireAuth>` → `<CloudProvider>` → `<AppShell>`        |

Route files in `app/` are thin: they export `metadata` and render one feature component from `components/`.
Dashboard pages are marked `robots: noindex`.

## Data flow

```
                ┌──────────────────────────── app/layout.tsx ────────────────────────────┐
                │  <ToastProvider>                                                       │
                │    <AuthProvider>  ── api.auth.session() on mount ──► user | null       │
                │                                                                        │
                │      (dashboard)/layout.tsx                                            │
                │      <RequireAuth>   no user → router.replace('/login?from=…')         │
                │        <CloudProvider>  ── on user change:                             │
                │             Promise.all([ api.services.list(),                         │
                │                           api.deployments.list(),                      │
                │                           api.notifications.list() ])                  │
                │          <AppShell> {page} </AppShell>                                 │
                └────────────────────────────────────────────────────────────────────────┘

  Components ──► useAuth() / useCloud() ──► api.*  (lib/api/index.ts)
                                              │
                                              └─► today:  lib/api/mock-api.ts  (localStorage)
                                                  target: lib/api/http-api.ts  (fetch → backend)
```

**Rule:** components never call `fetch` or touch `localStorage`. Everything goes through `api` (`import { api } from '@/lib/api'`), mostly via the two providers.
Two components call `api` directly: `components/settings/api-keys-panel.tsx` (`api.apiKeys.*`) and `components/auth/forgot-password-form.tsx` (`api.auth.requestReset`).

### `AuthProvider` (`providers/auth-provider.tsx`)

| Exposes          | Calls                                   | Notes                                     |
| ---------------- | --------------------------------------- | ----------------------------------------- |
| `user`, `loading`| `api.auth.session()` once on mount      | `null` = signed out                       |
| `login(email, password, remember)` | `api.auth.login`      | Throws `Error(message)`; form shows `message` |
| `loginWithGoogle()` | `api.auth.loginWithGoogle`           | Will become a redirect (OAuth)            |
| `signup(name, email, password)` | `api.auth.signup`        |                                           |
| `logout()`       | `api.auth.logout`                       |                                           |
| `updateProfile({name?, email?})` | `api.auth.updateProfile` | Returns the updated `User`              |

### `CloudProvider` (`providers/cloud-provider.tsx`)

Holds `services`, `deployments`, `notifications`, `loading`, `error` for the signed-in user.

| Action                         | Calls                                  | Local state update                         |
| ------------------------------ | -------------------------------------- | ------------------------------------------ |
| `reload()`                     | `services.list`, `deployments.list`, `notifications.list` | replace all          |
| `createService(input)`         | `api.services.create`                  | prepend service + deployment               |
| `deploy(serviceId)`            | `api.deployments.trigger`              | patch service, add deployment, then **fakes the result after 6.5 s (85% success)** |
| `completeDeployment(id, ok)`   | `api.deployments.complete`             | patch service + deployment, refresh notifications. **Mock only.** |
| `restart(id)` / `stop(id)`     | `api.services.restart` / `stop`        | patch service                              |
| `update(id, patch)`            | `api.services.update`                  | patch service                              |
| `remove(id)`                   | `api.services.remove`                  | remove service + its deployments           |
| `setEnv(id, env)`              | `api.services.setEnv`                  | replace `service.env`                      |
| `markNotificationsRead()`      | `api.notifications.markAllRead`        | replace notifications                      |
| `resetDemo()`                  | `api.resetDemo`                        | **Demo only.** Remove for production.     |

It also runs a **3-second interval that randomly changes `cpu` and `ramMb`** of running services. That has to be replaced by real metrics (SSE). See [07](07-frontend-integration.md).

## The `api` object: the contract

`lib/api/mock-api.ts` exports this shape. Every function is `async` and either **resolves with plain JSON** (it returns clones) or **throws `Error` with a user-facing message**.

```ts
api.auth.session(): Promise<User | null>
api.auth.login(email, password, remember): Promise<User>
api.auth.loginWithGoogle(): Promise<User>
api.auth.signup(name, email, password): Promise<User>
api.auth.requestReset(email): Promise<true>
api.auth.updateProfile(patch: { name?, email? }): Promise<User>
api.auth.logout(): Promise<void>

api.services.list(): Promise<Service[]>
api.services.create(input: CreateServiceInput): Promise<{ service: Service; deployment: Deployment }>
api.services.update(id, patch: Partial<Service>): Promise<Service>
api.services.restart(id): Promise<Service>          // also used to START a stopped service
api.services.stop(id): Promise<Service>
api.services.remove(id): Promise<void>
api.services.setEnv(id, env: EnvVar[]): Promise<EnvVar[]>   // replaces the whole list

api.deployments.list(serviceId?): Promise<Deployment[]>     // newest first
api.deployments.trigger(serviceId): Promise<{ service: Service; deployment: Deployment }>
api.deployments.complete(deploymentId, ok): Promise<{ service; deployment }>  // MOCK ONLY, no real endpoint

api.apiKeys.list(): Promise<ApiKey[]>
api.apiKeys.create(name, scope: 'read' | 'full'): Promise<{ key: ApiKey; secret: string }>
api.apiKeys.revoke(id): Promise<void>

api.notifications.list(): Promise<Notification[]>
api.notifications.markAllRead(): Promise<Notification[]>

api.resetDemo(): Promise<void>                                // DEMO ONLY
```

The endpoint for each function is in [05-api-reference.md](05-api-reference.md#2-endpoint-index).

### Error handling the UI expects

- Errors are shown **as-is** in toasts or form banners: `e instanceof Error ? e.message : 'Please try again.'`.
  So backend `message`s must be **short, human-readable and safe to show** (e.g. `"Incorrect email or password."`).
- Loading states are local. There's no global spinner, and the providers expose `loading` / `error`.
- Lists show an `ErrorState` with a **Retry** button when the call throws.

## What is simulated today (must become real)

| Area                                       | Where                                                                  | What it does today                                         |
| ------------------------------------------ | ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| Whole backend                              | `lib/api/mock-api.ts`                                                  | localStorage DB, artificial 150–1400 ms delays             |
| Live CPU/RAM of services                   | `providers/cloud-provider.tsx` (3 s interval)                          | Random walk                                                |
| Deployment result                          | `providers/cloud-provider.tsx` `deploy()`                              | `setTimeout(6500)` then 85% random success                |
| First-deploy progress screen               | `components/services/deploy-progress.tsx`                              | Timer-driven stages + fake log lines, always succeeds     |
| Runtime logs                               | `hooks/use-service-logs.ts`, `lib/simulation.ts`                       | Random lines from a fixed pool every 2.2 s                 |
| Live charts                                | `components/services/live-charts.tsx`, `hooks/use-live-series.ts`      | Random samples every 2 s                                   |
| Metrics history (24h/7d/30d)               | `components/services/detail/service-metrics.tsx`                       | Seeded random series                                       |
| Dashboard 24h usage chart                  | `components/dashboard/dashboard-overview.tsx`                          | Seeded random series                                       |
| Servers page                               | `components/servers/servers-view.tsx` + `data/seed.ts` `SERVERS`       | Hard-coded hosts + random load                             |
| Billing                                    | `components/billing/billing-view.tsx` + `INVOICES`                     | Hard-coded card "Visa •••• 4242", next billing date, period, invoices (download = .txt) |
| Password change, 2FA, sessions             | `components/settings/settings-view.tsx` `SecurityTab`                  | Fake delay / local state / hard-coded `SESSIONS`          |
| Email notification preferences             | `settings-view.tsx` `NotificationsTab`                                 | Local state only                                           |
| Language + timezone                        | `settings-view.tsx` `ProfileTab`                                       | Not saved                                                  |
| Delete account                             | `settings-view.tsx` `DangerTab`                                        | Calls `resetDemo()` + `logout()`                           |
| Team members & invites                     | `components/settings/team-panel.tsx`                                   | Local state only                                           |
| Auto-deploy / auto-restart toggles         | `components/services/detail/service-settings.tsx` `BehaviorSection`    | Local state only                                           |
| GitHub repo suggestions                    | `components/services/wizard-steps.tsx` `SUGGESTED_REPOS`               | Hard-coded list                                            |
| Source upload                              | `wizard-steps.tsx` (upload step)                                       | Only keeps the file **name**, no upload happens           |
| Support ticket                             | `components/support/support-view.tsx`                                  | Fake delay, always "Ticket #4821"                          |
| Contact form                               | `components/marketing/contact-form.tsx`                                | Fake delay                                                 |
| Docs feedback                              | `components/docs/article-feedback.tsx`                                 | Local state only                                           |
| Control Center                             | `components/admin/admin-view.tsx`                                      | Hard-coded stats, `ADMIN_TOP_SERVICES`, seeded charts      |
| Status page                                | `data/status.ts`                                                       | Static                                                     |
| Admin access check                         | `admin-view.tsx`, `sidebar.tsx`                                        | Client-side `user.role === 'admin'` only                   |
| Auth guard                                 | `components/layout/require-auth.tsx`                                   | Client-side redirect only                                  |

## Static content that can stay static

These are product/marketing content, not user data. They don't need an API unless the team wants a CMS:
`data/products.ts`, `data/regions.ts` (but the backend must use the **same values**), `data/docs/*`, `data/changelog.ts`, `data/legal.ts`, the `PREVIEW` cards in `app/(auth)/layout.tsx`, `ECOSYSTEM` in `admin-view.tsx`.

## Conventions worth knowing

- **Timestamps** are numbers: epoch **milliseconds** (`Date.now()`), for example `createdAt`, `startedAt`, `time`, `ts`. `Invoice.date` is an ISO date string `YYYY-MM-DD`.
- **Field names** are camelCase and match `lib/types.ts`. The backend should return exactly these names so no mapping is needed.
- **Money** is a number in euros (e.g. `6.99`), displayed with `formatEuro`.
- **Service ids are slugs** (`syncbot`, `communityapi`), used in URLs (`/services/syncbot`) and public hostnames (`syncbot.digitaly.app`).
- **Typed routes** are on: every `<Link href>` is checked at build time, and `lib/routes.ts` `AppHref` types links stored in data.
- **Styling**: Tailwind v4 tokens in `app/globals.css`. lucide-react is pinned to `0.446.0` on purpose.
