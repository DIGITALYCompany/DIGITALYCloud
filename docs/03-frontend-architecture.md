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

The dashboard needs the API (`NEXT_PUBLIC_API_URL`, default `http://localhost:4000/v1`); see
[apps/backend/README.md](../apps/backend/README.md). `npm run db:seed --workspace backend -- --confirm-dev` creates a
development account.

> ⚠️ `AGENTS.md`: this is **Next.js 16**, which has breaking changes from older versions. Before writing framework code (e.g. `proxy.ts`, which replaces `middleware.ts`), read the guide in `node_modules/next/dist/docs/`.

## Route groups and rendering

| Group          | Rendering                                    | Auth          | Layout                                                    |
| -------------- | -------------------------------------------- | ------------- | --------------------------------------------------------- |
| `(marketing)`  | Server Components, static (SSG)              | Public        | Site header + footer                                      |
| `(auth)`       | Client forms inside a server layout          | Public        | Split screen with brand panel                             |
| `(dashboard)`  | Client Components (data via React context)   | **Required** (`proxy.ts` + `<RequireAuth>`) | `<RequireAuth>` → `<CloudProvider>` → `<AppShell>` |

Route files in `app/` are thin: they export `metadata` and render one feature component from `components/`.
Dashboard pages are marked `robots: noindex`.

## Data flow

```
 app/layout.tsx
 <ToastProvider>
   <AuthProvider>        api.auth.session() → user; api.teams.list() → teams + this tab's team (sessionStorage)
     (dashboard)/layout.tsx
     <RequireAuth>       no user → /login?from=…   (proxy.ts already redirects when the cookie is absent)
       <CloudProvider>   remounted per user+team: services, deployments, notifications, catalog
                         + one /events?team= EventSource per tab (lib/api/events.ts)
         <AppShell> {page} </AppShell>

 Components ──► useAuth() / useCloud() / useApi(() => api.x.y()) ──► lib/api/index.ts ──► lib/api/http-client.ts ──► API
```

- `http-client.ts` sends cookies (`credentials: 'include'`), fetches the CSRF token once (`GET /auth/csrf`) and retries once
  on `CSRF_TOKEN_INVALID`, adds `X-Team-Id`, turns error bodies into `ApiError` (`status`, `code`, `message`, `fields`,
  `details`), dispatches `dgc:unauthenticated` on 401 and `dgc:team-unavailable` on `TEAM_UNAVAILABLE`, and uploads with
  progress (XHR).
- `events.ts` reconnects with `Last-Event-ID`; on `stream.resync` or a refused reconnect the provider reloads; on
  `stream.revoked` it re-checks the session and teams.
- Per-screen data that isn't global (billing, team, sessions, metrics history, logs, servers, admin) is loaded where it is
  shown with `useApi()` or dedicated hooks (`use-service-logs`, `use-deployment-logs`, `live-charts`).

### `AuthProvider` (`providers/auth-provider.tsx`)

| Exposes | Notes |
| ------- | ----- |
| `user`, `loading`, `teams`, `team` | `team` is this tab's team; requests carry it as `X-Team-Id`. |
| `login(email, password, remember)` | Resolves `null` or `{ challengeToken }` when a second factor is needed. |
| `verifyTwoFactor(token, code)`, `loginWithGoogle(from)`, `signup`, `logout`, `updateProfile` | Google is a full-page redirect through the API. |
| `switchTeam(id)`, `refreshTeams()`, `refreshUser()` | Switching remounts `CloudProvider`, so no data from the previous team can flash. |
| `can(action)` | Role check with the shared permission matrix (UI gating only; the API enforces). |

On 401 the provider clears all state and sends dashboard pages to `/login?from=…`.

### `CloudProvider` (`providers/cloud-provider.tsx`)

| Action | Calls | Notes |
| ------ | ----- | ----- |
| `reload()` | services, deployments, notifications, catalog | Also after SSE resync. |
| `createService(input, idempotencyKey)` | `POST /services` | `402` → Stripe Checkout (handled by the wizard). |
| `deploy(id, input?)` | `POST /services/:id/deploy` | Result arrives over SSE (toast for deployments started in this tab). |
| `start` / `stop` / `restart` | control endpoints | The response may still carry `operation` (worker busy); SSE completes it. |
| `update(id, settings)`, `changePlan(id, plan)` | `PATCH`, `POST /plan` | Plan changes may answer `402`. |
| `remove`, `setEnv`, `refreshService`, `markNotificationsRead` | | |

SSE merges: `service.updated` keeps the loaded `env`; `service.metrics` patches cpu/ram/storage/`metricsAt`;
`deployment.*` upserts; `notification.created` prepends (deduplicated by id).

## Formerly simulated — now real

Everything listed here before integration (mock backend, random metrics, the 6.5 s fake deploy result, timer-driven deploy
progress, random logs and charts, hard-coded servers/billing/sessions/team/admin/status data, fake support/contact/docs
feedback, client-only guards) now uses the API. Missing data is shown as empty states or `—`, never invented. The only
decorative animation left is the landing page's dashboard preview, captioned as an illustration.

## Static content that can stay static

These are product/marketing content, not user data. They don't need an API unless the team wants a CMS:
`data/products.ts` (plans match the shared catalog), `data/docs/*`, `data/changelog.ts`, `data/legal.ts`, the `PREVIEW` cards in `app/(auth)/layout.tsx`, `ECOSYSTEM` names in `admin-view.tsx`. Regions and plans come from `@digitalycloud/shared`.

## Conventions worth knowing

- **Timestamps** are numbers: epoch **milliseconds** (`Date.now()`), for example `createdAt`, `startedAt`, `time`, `ts`. `Invoice.date` is an ISO date string `YYYY-MM-DD`.
- **Field names** are camelCase and match the shared DTOs (`lib/types.ts` aliases them), so no mapping is needed.
- **Money** is a number in euros (e.g. `6.99`), displayed with `formatEuro`.
- **Service ids are slugs** (`syncbot`, `communityapi`), used in URLs (`/services/syncbot`) and public hostnames (`syncbot.digitaly.app`).
- **Typed routes** are on: every `<Link href>` is checked at build time, and `lib/routes.ts` `AppHref` types links stored in data.
- **Styling**: Tailwind v4 tokens in `app/globals.css`. lucide-react is pinned to `0.446.0` on purpose.
