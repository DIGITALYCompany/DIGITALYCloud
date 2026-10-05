# 07 — Frontend integration

How to move `apps/frontend` from the mock backend to the real API, step by step, without rewriting components.
Contract: [05-api-reference.md](05-api-reference.md). Paths are relative to `apps/frontend/`.

> Next.js 16 note (`AGENTS.md`): read `node_modules/next/dist/docs/` before writing framework code such as `proxy.ts`.

## Overview

```
Step 1  Config            NEXT_PUBLIC_API_URL, NEXT_PUBLIC_API_MODE
Step 2  Contract type     lib/api/types.ts: one `Api` interface for mock + http
Step 3  HTTP client       lib/api/http-client.ts (fetch, cookies, errors)
Step 4  HTTP api          lib/api/http-api.ts (same shape as the mock)
Step 5  Switch            lib/api/index.ts picks mock or http
Step 6  Real-time         lib/api/events.ts (SSE) → CloudProvider; remove simulations
Step 7  Auth guard        proxy.ts redirect + 401 handling + Google redirect
Step 8  Screens           wire every hard-coded screen (table below)
Step 9  New pages         reset password, accept invite, 2FA, deploy failure…
```

Do steps 1–5 first with only the endpoints that already exist on the backend. The mock stays available through `NEXT_PUBLIC_API_MODE=mock`.

---

## Step 1: Config

`apps/frontend/.env.example` (and `.env.local`):

```bash
NEXT_PUBLIC_SITE_URL=https://cloud.digitaly.fr
NEXT_PUBLIC_API_URL=http://localhost:4000/v1     # https://api.cloud.digitaly.fr/v1 in production
NEXT_PUBLIC_API_MODE=http                        # "mock" keeps the localStorage demo
```

## Step 2: Contract type

Create `lib/api/types.ts`, move `CreateServiceInput` there (out of `mock-api.ts`) and describe the whole object, so both implementations are type-checked against it:

```ts
import type { ApiKey, Deployment, EnvVar, Notification, Service, User } from '@/lib/types';

export interface CreateServiceInput {
  name: string; type: ServiceType; source: SourceType; repo: string; branch: string;
  uploadId?: string | null;                 // new: from api.uploads.create
  nodeVersion: string; startCommand: string; port: number | null; plan: PlanId;
  region: string;                           // UI keeps the label; http-api converts it to regionId
  env: EnvVar[];
}

export interface Api {
  auth: {
    session(): Promise<User | null>;
    login(email: string, password: string, remember: boolean): Promise<User>;
    loginWithGoogle(): Promise<User>;
    signup(name: string, email: string, password: string): Promise<User>;
    requestReset(email: string): Promise<true>;
    updateProfile(patch: Partial<Pick<User, 'name' | 'email' | 'language' | 'timezone'>>): Promise<User>;
    logout(): Promise<void>;
  };
  services: {
    list(): Promise<Service[]>;
    create(input: CreateServiceInput): Promise<{ service: Service; deployment: Deployment }>;
    update(id: string, patch: Partial<Service>): Promise<Service>;
    restart(id: string): Promise<Service>;
    stop(id: string): Promise<Service>;
    remove(id: string): Promise<void>;
    setEnv(id: string, env: EnvVar[]): Promise<EnvVar[]>;
  };
  deployments: {
    list(serviceId?: string): Promise<Deployment[]>;
    get(id: string): Promise<Deployment>;                     // new: build logs
    trigger(serviceId: string, opts?: { deploymentId?: string }): Promise<{ service: Service; deployment: Deployment }>;
  };
  apiKeys: { list(): Promise<ApiKey[]>; create(name: string, scope: ApiKey['scope']): Promise<{ key: ApiKey; secret: string }>; revoke(id: string): Promise<void> };
  notifications: { list(): Promise<Notification[]>; markAllRead(): Promise<Notification[]> };
  // New namespaces, added as the backend ships them (see Step 8):
  // account, team, billing, uploads, github, logs, metrics, servers, support, contact, docs, admin, status
}
```

Add the new fields to `lib/types.ts`: `Service.regionId`, `url`, `autoDeploy`, `autoRestart`. `Deployment.stage`, `trigger`, `finishedAt`. `User.language`, `timezone`, `twoFactorEnabled`, `emailVerified`. Plus the new interfaces from [04-data-models.md](04-data-models.md#new-entities-not-in-libtypests-yet-proposed).

`deployments.complete` and `resetDemo` are **mock-only** and are not part of `Api` (see Step 6).

## Step 3: HTTP client

`lib/api/http-client.ts`:

```ts
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/v1';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Record<string, string>, public details?: Record<string, unknown>) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      credentials: 'include',                                  // send the dgc_session cookie
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Could not reach DIGITALYCloud. Check your connection and try again.');
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = json?.error ?? {};
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('dgc:unauthenticated'));
    throw new ApiError(res.status, e.code ?? 'INTERNAL', e.message ?? 'Something went wrong. Please try again.', e.fields, e);
  }
  return json as T;
}

export const http = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),   // {} forces JSON + CORS preflight (CSRF)
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  del: <T = void>(path: string, body?: unknown) => request<T>('DELETE', path, body),
  upload: async <T>(path: string, file: File): Promise<T> => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_URL}${path}`, { method: 'POST', credentials: 'include', body: form });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, json?.error?.code ?? 'INTERNAL', json?.error?.message ?? 'Upload failed.');
    return json as T;
  },
};
```

Because `ApiError extends Error`, every existing `catch (e) { e instanceof Error ? e.message : … }` in the UI keeps working and shows the backend's message.

## Step 4: HTTP api

`lib/api/http-api.ts` implements `Api` and smooths over the small differences listed in the API reference:

```ts
import { getRegionByLabel } from '@/data/regions';
import type { ApiKey, Deployment, EnvVar, Notification, Service, User } from '@/lib/types';
import { API_URL, http } from './http-client';
import type { Api, CreateServiceInput } from './types';

type List<T> = { data: T[]; nextCursor: string | null };
type Pair = { service: Service; deployment: Deployment };

// API sends branch: null for non-GitHub sources and omits env for some payloads; the UI expects '—' and [].
const toService = (s: Service): Service => ({ ...s, branch: s.branch ?? '—', env: s.env ?? [] });
const toPair = (r: Pair): Pair => ({ service: toService(r.service), deployment: { ...r.deployment, logs: r.deployment.logs ?? [] } });
const SETTINGS = ['name', 'startCommand', 'nodeVersion', 'port', 'branch', 'autoDeploy', 'autoRestart'] as const;

export const api = {
  auth: {
    session: async () => (await http.get<{ user: User | null }>('/auth/session')).user,
    login: (email, password, remember) => http.post<User>('/auth/login', { email, password, remember }),   // 2FA: see Step 9
    loginWithGoogle: () => {
      const from = new URLSearchParams(window.location.search).get('from') ?? '/dashboard';
      window.location.href = `${API_URL}/auth/google?from=${encodeURIComponent(from)}`;
      return new Promise<User>(() => {});                      // the page navigates away
    },
    signup: (name, email, password) => http.post<User>('/auth/signup', { name, email, password }),
    requestReset: async (email) => {
      await http.post('/auth/password/forgot', { email });
      return true as const;
    },
    updateProfile: (patch) => http.patch<User>('/me', patch),
    logout: () => http.post<void>('/auth/logout'),
  },

  services: {
    list: async () => (await http.get<List<Service>>('/services')).data.map(toService),
    create: async ({ region, ...input }: CreateServiceInput) =>
      toPair(await http.post<Pair>('/services', {
        ...input,
        regionId: getRegionByLabel(region)?.id ?? region,
        branch: input.source === 'github' ? input.branch : null,
      })),
    update: async (id, patch) => {
      // Settings → PATCH; plan → its own endpoint (billing side effects). Client-sent limits are dropped.
      const settings = Object.fromEntries(SETTINGS.filter((k) => k in patch).map((k) => [k, patch[k]]));
      let s: Service | undefined;
      if (Object.keys(settings).length) s = await http.patch<Service>(`/services/${id}`, settings);
      if (patch.plan) s = await http.post<Service>(`/services/${id}/plan`, { plan: patch.plan });
      return toService(s ?? (await http.get<Service>(`/services/${id}`)));
    },
    restart: async (id) => toService(await http.post<Service>(`/services/${id}/restart`)),
    stop: async (id) => toService(await http.post<Service>(`/services/${id}/stop`)),
    remove: (id) => http.del(`/services/${id}`),
    setEnv: async (id, env: EnvVar[]) => (await http.put<List<EnvVar>>(`/services/${id}/env`, { env })).data,
  },

  deployments: {
    list: async (serviceId) =>
      (await http.get<List<Deployment>>(`/deployments${serviceId ? `?serviceId=${encodeURIComponent(serviceId)}` : ''}`)).data.map((d) => ({ ...d, logs: d.logs ?? [] })),
    get: (id) => http.get<Deployment>(`/deployments/${id}`),
    trigger: async (serviceId, opts) => toPair(await http.post<Pair>(`/services/${serviceId}/deploy`, opts ?? {})),
  },

  apiKeys: {
    list: async () => (await http.get<List<ApiKey>>('/api-keys')).data,
    create: (name, scope) => http.post<{ key: ApiKey; secret: string }>('/api-keys', { name, scope }),
    revoke: (id) => http.del(`/api-keys/${id}`),
  },

  notifications: {
    list: async () => (await http.get<List<Notification>>('/notifications')).data,
    markAllRead: async () => (await http.post<List<Notification>>('/notifications/read-all')).data,
  },
} satisfies Api;
```

## Step 5: Switch

`lib/api/index.ts`:

```ts
import { api as httpApi } from './http-api';
import { api as mockApi } from './mock-api';
import type { Api } from './types';

/** Data access layer used by every page and provider. NEXT_PUBLIC_API_MODE=mock keeps the localStorage demo. */
export const api: Api = process.env.NEXT_PUBLIC_API_MODE === 'mock' ? mockApi : httpApi;
export type { Api, CreateServiceInput } from './types';
```

If the mock mode is kept, every new `Api` method also needs a mock implementation. Once the backend is stable, the team can delete `mock-api.ts`, `lib/simulation.ts` and the seed-only parts of `data/seed.ts`.

## Step 6: Real-time, and removing the simulations

### 6a. Shared SSE connection: `lib/api/events.ts`

```ts
import { API_URL } from './http-client';

let source: EventSource | null = null;
let refs = 0;

/** Subscribe to one /v1/events event type. All subscribers in a tab share one EventSource. Returns an unsubscribe function. */
export function onEvent<T>(name: string, handler: (data: T) => void) {
  if (refs++ === 0) source = new EventSource(`${API_URL}/events`, { withCredentials: true });
  const forward = (e: Event) => handler(JSON.parse((e as MessageEvent<string>).data) as T);
  source!.addEventListener(name, forward);
  return () => {
    source?.removeEventListener(name, forward);
    if (--refs === 0) {
      source?.close();
      source = null;
    }
  };
}

/** Runs `fn` whenever the shared stream reconnects (call reload() there to catch up). Call after at least one onEvent(). */
export function onReconnect(fn: () => void) {
  let opened = false;
  const handler = () => (opened ? fn() : (opened = true));
  source?.addEventListener('open', handler);
  return () => source?.removeEventListener('open', handler);
}
```

### 6b. `providers/cloud-provider.tsx`

| Today | Change |
| ----- | ------ |
| `setInterval` (lines ~64–77) randomly changes `cpu`/`ramMb` | **Delete.** Subscribe to `service.metrics` → patch `cpu`, `ramMb` (and `storageMb`) of that service. |
| `deploy()` waits 6.5 s, picks a random result, calls `completeDeployment` | Keep `api.deployments.trigger` + the "Deploying…" toast. **Delete the `setTimeout` block.** Show the success/failure toasts when a `deployment.updated` event arrives with `status` `success`/`failed`. |
| `completeDeployment` in context | **Remove** (server finishes deployments). `DeployProgress` reads the deployment from context instead (6c). |
| `resetDemo` | Remove, or keep only when `NEXT_PUBLIC_API_MODE=mock`. |
| Nothing for server pushes | `service.updated` → merge but **keep existing `env`** (`{ ...incoming, env: current.env }`), add the service if it's new. `service.deleted` → remove. `deployment.created/updated` → `upsertDeployment`. `notification.created` → prepend. |
| Reconnect | After an SSE reconnect, call `reload()` to catch up on missed events. |

### 6c. `components/services/deploy-progress.tsx`

- Remove the timers that fake stages and log lines.
- Read the live deployment from `useCloud().deployments.find(d => d.id === deployment.id)`.
- Stage index: `preparing → 0, pulling → 1, installing → 2, starting → 3, health_check → 4`. `status === 'success'` → done (keep the redirect to `/services/:id`).
- Log panel: `onEvent('deployment.log', ({ deploymentId, text }) => …)` filtered by id.
- **New:** a failure state (`status === 'failed'`) with a link to `/services/:id/deployments`. Today the screen assumes success.

### 6d. Logs, metrics and charts

| File | Change |
| ---- | ------ |
| `hooks/use-service-logs.ts` | Load `GET /services/:id/logs?limit=200`, then open `EventSource(`${API_URL}/services/${id}/logs/stream?since=${lastId}`, { withCredentials: true })`. Keep the return shape `{ lines, clear }` and the 400-line cap, so `service-logs.tsx` doesn't change. |
| `components/services/live-charts.tsx` | `useLiveServiceMetrics`: backfill from `GET /services/:id/metrics?range=live`, then append `service.metrics` events (40-point window, label `formatClock(ts)`). |
| `components/services/detail/service-metrics.tsx` | Replace `history()` / `makeSeries` with `GET /services/:id/metrics?range=24h|7d|30d`. Map `ts` → `t` label (`HH:00` for 24h, `Sep 24` for 7d/30d). |
| `components/dashboard/dashboard-overview.tsx` | Replace the `makeSeries('dash-usage')` chart with `GET /metrics/usage?range=24h`. |
| `components/deployments/deployments-view.tsx`, `services/deployment-item.tsx` | Lists no longer include `logs`. Call `api.deployments.get(id)` when a row is expanded, then cache it. |

Leave `hooks/use-live-series.ts` in place for **marketing** visuals (`components/marketing/dashboard-preview.tsx`) and the status page's latency widget until `/status` exists.

## Step 7: Auth guard and session handling

1. **Server redirect**: create `proxy.ts` (Next.js 16's replacement for `middleware.ts`; check the docs in `node_modules/next/dist/docs/`):

   ```ts
   import { NextResponse, type NextRequest } from 'next/server';

   export function proxy(req: NextRequest) {
     if (req.cookies.has('dgc_session')) return NextResponse.next();
     const login = new URL('/login', req.url);
     login.searchParams.set('from', req.nextUrl.pathname + req.nextUrl.search);
     return NextResponse.redirect(login);
   }

   export const config = {
     matcher: ['/dashboard/:path*', '/services/:path*', '/deployments/:path*', '/servers/:path*', '/billing/:path*',
               '/support/:path*', '/settings/:path*', '/admin/:path*'],
   };
   ```

   The cookie is visible to the Next.js server only if it's on the same site: `COOKIE_DOMAIN=cloud.digitaly.fr` in production. In dev, `localhost` cookies are shared across ports.
2. **Keep `components/layout/require-auth.tsx`** as a fallback (a cookie can exist but be expired, in which case `session()` returns `null`).
3. **Expired session mid-use**: `AuthProvider` listens for `dgc:unauthenticated` (dispatched by the HTTP client on 401), sets `user` to `null` and calls `router.replace('/login?from=' + pathname)`. `RequireAuth` deliberately doesn't redirect after a sign-out, so the provider has to.
4. **Google**: `loginWithGoogle` now navigates to the API (Step 4). Show `?error=google` on `/login` as a form error.
5. **Admin**: keep the UI check, but the backend enforces `403` on `/admin/*`.

## Step 8: Screen-by-screen wiring

| # | Screen / file | Today | Endpoint(s) | Notes |
| - | ------------- | ----- | ----------- | ----- |
| 1 | Login, signup, forgot password (`components/auth/*`) | mock | `/auth/*` | Works through `api.auth` after Step 4. Add a 2FA step (Step 9). |
| 2 | Profile (`settings-view.tsx` `ProfileTab`) | name/email saved; language/timezone ignored | `PATCH /me` | Send `language`, `timezone` (map `paris` → `Europe/Paris`, `london` → `Europe/London`). |
| 3 | Security: password (`SecurityTab`) | fake 700 ms delay | `PUT /me/password` | Show `401` message inline. |
| 4 | Security: 2FA switch | local state | `/me/2fa/setup`, `/enable`, `/disable` | Switch opens a modal: QR code → code input → recovery codes. Initial state from `user.twoFactorEnabled`. |
| 5 | Security: active sessions | hard-coded `SESSIONS` | `GET /me/sessions`, `DELETE /me/sessions/:id` | Pick the icon from `device` (phone vs laptop). |
| 6 | Notifications prefs (`NotificationsTab`) | local state | `GET/PUT /me/notification-preferences` | Same keys as the UI. |
| 7 | Danger zone (`DangerTab`) | `resetDemo` + `logout` | `DELETE /me { confirmEmail }` | Hide "Reset demo data" outside mock mode. |
| 8 | API keys (`api-keys-panel.tsx`) | mock | `/api-keys` | Works after Step 4. |
| 9 | Team (`team-panel.tsx`) | local state | `/team/members`, `/team/invitations` | Map roles lowercase ↔ `Owner/Admin/Developer/Viewer`. Pending = `pending: true`. |
| 10 | Billing (`billing-view.tsx`) | `INVOICES`, card, dates hard-coded | `GET /billing/summary`, `GET /billing/invoices`, `/billing/invoices/:id/pdf`, `POST /billing/portal-session` | Download → open `pdfUrl`. "Update card" → redirect to portal `url`. Invoice badge by `status`. On `403`, show "Only the account owner can see billing". |
| 11 | Change plan (`change-plan-modal.tsx`, `service-settings.tsx` Resources) | `update({ plan, ramLimitMb, storageLimitMb })` | `POST /services/:id/plan` (via `api.services.update`) | On `402`, `window.location = error.details.checkoutUrl`. |
| 12 | Service behavior (`service-settings.tsx` `BehaviorSection`) | local state | `PATCH /services/:id { autoDeploy, autoRestart }` | Initial values from `service.autoDeploy` / `autoRestart`. |
| 13 | Wizard: GitHub (`wizard-steps.tsx`) | `SUGGESTED_REPOS` | `GET /integrations/github`, `/install`, `/repos`, `/repos/:o/:r/branches` | "Connect GitHub" button if not connected. Save wizard state in `sessionStorage` before the redirect and restore it on `?github=connected`. |
| 14 | Wizard: upload | file name only | `POST /uploads` | Upload when the file is picked (progress + error), store `uploadId` in `WizardState`, pass it to `create`. |
| 15 | Wizard: create (`new-service-wizard.tsx`) | mock | `POST /services` | Handle `402` (checkout) and `409` (name taken → `errors.name`). |
| 16 | Deploy progress | timers | SSE (Step 6c) | Add the failure state. |
| 17 | Logs / metrics / live charts / dashboard chart | simulated | Step 6d | |
| 18 | Servers (`servers-view.tsx`) | `SERVERS` + random | `GET /servers`, `GET /servers/load?range=24h` | Poll `/servers` every 15 s for the per-card sparkline, or keep the visual jitter around the real value. |
| 19 | Support (`support-view.tsx`) | fake, "Ticket #4821" | `POST /support/tickets` | Toast `Ticket #${ticket.number} created`. |
| 20 | Contact (`contact-form.tsx`) | fake | `POST /contact` | Public, no cookie needed. |
| 21 | Docs feedback (`article-feedback.tsx`) | local | `POST /docs/feedback` | Fire and forget. |
| 22 | Control Center (`admin-view.tsx`) | hard-coded | `/admin/overview`, `/admin/revenue`, `/admin/deployments/daily`, `/admin/services` | Search via `?q=`. Map `type`/`plan` to labels with `SERVICE_TYPES` and the plan names. `ECOSYSTEM` stays static. |
| 23 | Status page (`app/(marketing)/status/page.tsx`) | `data/status.ts` | `GET /status` (optional) | Fetch in the Server Component with revalidation (e.g. 60 s). Same shape as `data/status.ts`. |
| 24 | Notifications menu | mock | `/notifications` + SSE | Works after Steps 4 and 6. |

## Step 9: Pages and states to build

| Page / state | Route / file | Endpoint |
| ------------ | ------------ | -------- |
| Reset password (set a new password from the email link) | `app/(auth)/reset-password/page.tsx` (`?token=`) | `POST /auth/password/reset` |
| Accept team invitation | `app/(auth)/invite/page.tsx` (`?token=`; sign in or sign up first, then accept) | `POST /team/invitations/accept` |
| 2FA code at login | step in `login-form.tsx` when `/auth/login` returns `{ twoFactorRequired, challengeToken }` (update `api.auth.login` to return a union, or throw a typed `TwoFactorRequired` error the form catches) | `POST /auth/2fa/verify` |
| 2FA setup modal | `settings-view.tsx` `SecurityTab` | `/me/2fa/*` |
| Email verification banner (optional) | dashboard top bar | — |
| Deploy failure state | `deploy-progress.tsx` | SSE |
| Billing owner-only state | `billing-view.tsx` | `403` handling |
| Stripe return | `/billing?checkout=success` and `/services/new?checkout=success` | refetch |
| GitHub connected return | `/services/new?github=connected` | `GET /integrations/github` |

## Verification checklist

Run the frontend with `NEXT_PUBLIC_API_MODE=http` against a seeded backend, then check each item:

- [ ] Sign up → land on `/dashboard`; reload keeps the session; logout → `/`; opening `/services` while signed out → `/login?from=/services` → back to `/services` after login.
- [ ] Login with "Remember me" off → session ends when the browser closes.
- [ ] Wrong password shows `Incorrect email or password.`
- [ ] Create a service (GitHub, upload, Docker): wizard validation matches the server; progress screen follows real stages; lands on the service page as `running`.
- [ ] Region not allowed by plan → error message from the server.
- [ ] Deploy from the service page → toasts for start and result; deployment appears in `/deployments`; failing deploy keeps the old version running.
- [ ] Start / stop / restart / delete update the UI immediately and in a second tab (SSE).
- [ ] Env vars: add, edit, delete, duplicate key error, secret masked; values encrypted in the DB.
- [ ] Logs stream live, pause/resume, filter, download; metrics show real history for 24h/7d/30d; live CPU/RAM move with the container.
- [ ] Change plan → limits update; paid plan without a card → Stripe checkout → back to billing.
- [ ] API key: create (secret shown once), use it with `curl -H "Authorization: Bearer …" $API/v1/services`, revoke → `401`.
- [ ] Read-only key can't `POST /services/:id/deploy` (`403`).
- [ ] Notifications: deploy result creates one; "mark all read" persists after reload.
- [ ] Team: invite → email → accept → member sees services but (as developer) not billing.
- [ ] Billing shows the real card, dates and invoices; PDF downloads.
- [ ] Support ticket and contact form arrive in the support inbox.
- [ ] Non-admin calling `/v1/admin/overview` gets `403`; admin sees real numbers.
- [ ] `npm run typecheck` and `npm run lint` pass in `apps/frontend`.
