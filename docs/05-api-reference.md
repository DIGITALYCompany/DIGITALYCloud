# 05 — API reference

> **Implemented.** Every endpoint below exists. Extensions and the few deviations (CSRF bootstrap, team scope header, billing
> operations, email verification, nullable fields) are listed in [backend-decisions.md §9](backend-decisions.md#9-endpoint-and-dto-extensions-to-05-api-reference);
> the generated [openapi.json](openapi.json) is the exact contract (`npm run openapi` in apps/backend regenerates it).

The HTTP contract between the frontend and the backend, written before implementation. Every endpoint lists the former
mock function it **replaced** and the UI file that **uses** it.

---

## 1. Conventions

### Base URL and versioning

| Environment | Base URL                              |
| ----------- | ------------------------------------- |
| Production  | `https://api.cloud.digitaly.fr/v1`    |
| Local dev   | `http://localhost:4000/v1`            |

The public docs (`data/docs/platform.tsx`) already promise `https://api.cloud.digitaly.fr/v1/...`, so keep that host and prefix.

### Authentication

One API, two ways to authenticate:

| Method              | Who uses it                 | How                                                                                 |
| ------------------- | --------------------------- | ----------------------------------------------------------------------------------- |
| **Session cookie**  | The dashboard (browser)     | `dgc_session` httpOnly cookie set by `/auth/login`, `/auth/signup` or Google OAuth. Requests use `credentials: 'include'`. |
| **API key**         | CI, scripts, public API     | `Authorization: Bearer dgc_live_…` (Settings → API Keys)                           |

- **API keys** can only call the endpoints marked `key:read` / `key:full` below. They can **never** call `/auth/*`, `/me/*`, `/api-keys/*`, `/team/*`, `/billing/*`, `/admin/*`.
- `read` scope: `GET` only. `full` scope: also deploy, start, stop, restart, update settings and env vars.
- **CSRF**: cookie requests must send `Content-Type: application/json` (forces a CORS preflight) and come from the allowed origin. The session cookie is `SameSite=Lax`.

### Request and response format

- JSON bodies, UTF-8, **camelCase** fields matching `apps/frontend/lib/types.ts`.
- All timestamps are **epoch milliseconds** (numbers). Exception: calendar dates (`Invoice.date`, billing dates) are `YYYY-MM-DD` strings.
- Money is a number in **euros** (`6.99`), VAT included.
- **Single resource** → the object itself.
- **List** → `{ "data": [ … ], "nextCursor": null }`. Lists are small today, so `nextCursor` is always `null` until pagination is needed. Accept `?limit=&cursor=` from day one.
- **Action** endpoints return the updated resource(s), e.g. `{ "service": {…}, "deployment": {…} }`, exactly like the mock.
- `204 No Content` for deletes and fire-and-forget actions.

### Errors

Every error uses the same shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Port must be between 1 and 65535.",
    "fields": { "port": "Port must be between 1 and 65535." }
  }
}
```

The frontend shows `error.message` **directly to the user**, so keep it short, friendly and free of internals. `fields` is optional (per-field messages for forms).

| HTTP | `code`                      | When                                                                  |
| ---- | --------------------------- | --------------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR`          | Body/query fails validation                                           |
| 400  | `REGION_NOT_ALLOWED`        | Region not included in the plan (`Frankfurt isn’t available on the Bot Free plan.`) |
| 401  | `UNAUTHENTICATED`           | No or expired session/key (`Not signed in`)                           |
| 401  | `INVALID_CREDENTIALS`       | Login failed (`Incorrect email or password.`)                         |
| 402  | `PAYMENT_METHOD_REQUIRED`   | Paid plan chosen without a payment method. Includes `checkoutUrl`.    |
| 403  | `FORBIDDEN`                 | Team role, platform role or key scope not allowed                     |
| 404  | `NOT_FOUND`                 | Resource missing **or not visible to this team** (`Service not found`) |
| 409  | `CONFLICT`                  | Duplicate email, service name, env key, already deploying…            |
| 413  | `PAYLOAD_TOO_LARGE`         | Upload over the limit                                                 |
| 429  | `RATE_LIMITED`              | Too many requests (`Retry-After` header)                              |
| 500  | `INTERNAL`                  | Unexpected (`Something went wrong. Please try again.`)                |

### Permissions

Team roles (Proposed, based on `data/docs/platform.tsx` → Team access):

| Action                                              | owner | admin | developer | viewer | `key:read` | `key:full` |
| --------------------------------------------------- | :---: | :---: | :-------: | :----: | :--------: | :--------: |
| View services, deployments, logs, metrics           | ✅    | ✅    | ✅        | ✅     | ✅         | ✅         |
| See secret env var values                           | ✅    | ✅    | ✅        | ❌ (redacted) | ❌   | ❌         |
| Deploy, start, stop, restart                        | ✅    | ✅    | ✅        | ❌     | ❌         | ✅         |
| Edit service settings and env vars                  | ✅    | ✅    | ❌        | ❌     | ❌         | ✅         |
| Create / delete services, change plan               | ✅    | ✅    | ❌        | ❌     | ❌         | ❌         |
| API keys, team members                              | ✅    | ✅    | ❌        | ❌     | ❌         | ❌         |
| Billing (summary, invoices, payment method)         | ✅    | ❌    | ❌        | ❌     | ❌         | ❌         |
| Delete the account                                  | ✅    | ❌    | ❌        | ❌     | ❌         | ❌         |
| Support tickets                                     | ✅    | ✅    | ✅        | ✅     | ❌         | ❌         |

`/admin/*` requires `User.role === 'admin'` (platform staff), checked **on the server**.

### Rate limits (Proposed)

| Group                                   | Limit                          |
| --------------------------------------- | ------------------------------ |
| `/auth/login`, `/auth/signup`, `/auth/password/*` | 10 / 15 min per IP + per email |
| `/contact`, `/docs/feedback`            | 5 / hour per IP                |
| `/uploads`                              | 20 / hour per team             |
| Everything else (session)               | 600 / min per user             |
| API keys                                | 120 / min per key              |

---

## 2. Endpoint index

Auth column: `public` · `session` · `key:read` / `key:full` (API key allowed with that scope) · `staff` (platform admin).

| Method | Path | Auth | Replaces (mock) | Used by (UI) |
| ------ | ---- | ---- | --------------- | ------------ |
| GET    | `/health` | public | — | monitoring |
| **Auth** |||||
| GET    | `/auth/session` | public | `auth.session` | `providers/auth-provider.tsx` |
| POST   | `/auth/login` | public | `auth.login` | `components/auth/login-form.tsx` |
| POST   | `/auth/2fa/verify` | public | — (new) | login (2FA step, not built) |
| POST   | `/auth/signup` | public | `auth.signup` | `components/auth/signup-form.tsx` |
| GET    | `/auth/google` | public | `auth.loginWithGoogle` | login & signup forms |
| GET    | `/auth/google/callback` | public | — | (OAuth redirect) |
| POST   | `/auth/password/forgot` | public | `auth.requestReset` | `components/auth/forgot-password-form.tsx` |
| POST   | `/auth/password/reset` | public | — (new) | `/reset-password` page (not built) |
| POST   | `/auth/logout` | session | `auth.logout` | account menu, settings |
| **Account** |||||
| PATCH  | `/me` | session | `auth.updateProfile` | settings → Profile |
| PUT    | `/me/password` | session | — (fake) | settings → Security |
| GET    | `/me/sessions` | session | — (hard-coded) | settings → Security |
| DELETE | `/me/sessions/:id` | session | — (local) | settings → Security |
| POST   | `/me/2fa/setup` | session | — (local switch) | settings → Security |
| POST   | `/me/2fa/enable` | session | — | settings → Security |
| POST   | `/me/2fa/disable` | session | — | settings → Security |
| GET    | `/me/notification-preferences` | session | — (local) | settings → Notifications |
| PUT    | `/me/notification-preferences` | session | — (local) | settings → Notifications |
| DELETE | `/me` | session (owner) | — (resetDemo + logout) | settings → Danger Zone |
| **Catalog** |||||
| GET    | `/catalog` | public | — (`lib/catalog.ts`, `data/regions.ts`) | wizard, plan modal (optional) |
| **Services** |||||
| GET    | `/services` | session, key:read | `services.list` | `providers/cloud-provider.tsx` |
| POST   | `/services` | session | `services.create` | `components/services/new-service-wizard.tsx` |
| GET    | `/services/:id` | session, key:read | — (filtered client-side) | public API |
| PATCH  | `/services/:id` | session, key:full | `services.update` | `service-settings.tsx` |
| DELETE | `/services/:id` | session | `services.remove` | `use-service-actions.tsx` |
| POST   | `/services/:id/start` | session, key:full | `services.restart` (when stopped) | `use-service-actions.tsx` |
| POST   | `/services/:id/stop` | session, key:full | `services.stop` | `use-service-actions.tsx` |
| POST   | `/services/:id/restart` | session, key:full | `services.restart` | `use-service-actions.tsx` |
| POST   | `/services/:id/plan` | session | `services.update({ plan })` | `change-plan-modal.tsx`, `service-settings.tsx` |
| PUT    | `/services/:id/env` | session, key:full | `services.setEnv` | `service-environment.tsx` |
| **Deployments** |||||
| GET    | `/deployments` | session, key:read | `deployments.list` | cloud provider, `/deployments` |
| GET    | `/deployments/:id` | session, key:read | — (logs were inline) | `deployment-item.tsx` |
| POST   | `/services/:id/deploy` | session, key:full | `deployments.trigger` | `service-deployments.tsx`, `use-service-actions.tsx` |
| —      | *(none)* | — | `deployments.complete` | **server-side only** (deploy worker) |
| **Logs & metrics** |||||
| GET    | `/services/:id/logs` | session, key:read | — (simulated) | `service-logs.tsx` |
| GET    | `/services/:id/logs/stream` | session | — (simulated) | `hooks/use-service-logs.ts` |
| GET    | `/services/:id/metrics` | session, key:read | — (simulated) | `service-metrics.tsx` |
| GET    | `/metrics/usage` | session | — (simulated) | `dashboard-overview.tsx` |
| GET    | `/events` | session | — (intervals/timeouts) | cloud provider (SSE) |
| **API keys** |||||
| GET    | `/api-keys` | session | `apiKeys.list` | `api-keys-panel.tsx` |
| POST   | `/api-keys` | session | `apiKeys.create` | `api-keys-panel.tsx` |
| DELETE | `/api-keys/:id` | session | `apiKeys.revoke` | `api-keys-panel.tsx` |
| **Notifications** |||||
| GET    | `/notifications` | session | `notifications.list` | cloud provider |
| POST   | `/notifications/read-all` | session | `notifications.markAllRead` | `notifications-menu.tsx` |
| **Team** |||||
| GET    | `/team/members` | session | — (local) | `team-panel.tsx` |
| POST   | `/team/invitations` | session | — (local) | `team-panel.tsx` |
| POST   | `/team/invitations/accept` | session | — (new) | `/invite?token=` page (not built) |
| PATCH  | `/team/members/:id` | session | — (local) | `team-panel.tsx` |
| DELETE | `/team/members/:id` | session | — (local) | `team-panel.tsx` |
| **Billing** |||||
| GET    | `/billing/summary` | session (owner) | — (hard-coded) | `billing-view.tsx` |
| GET    | `/billing/invoices` | session (owner) | — (`INVOICES`) | `billing-view.tsx` |
| GET    | `/billing/invoices/:id/pdf` | session (owner) | — (.txt download) | `billing-view.tsx` |
| POST   | `/billing/portal-session` | session (owner) | — (toast) | `billing-view.tsx` "Update card" |
| **Sources & integrations** |||||
| POST   | `/uploads` | session | — (file name only) | `wizard-steps.tsx` |
| GET    | `/integrations/github` | session | — | `wizard-steps.tsx` |
| GET    | `/integrations/github/install` | session | — | `wizard-steps.tsx` |
| GET    | `/integrations/github/callback` | public | — | (GitHub redirect) |
| GET    | `/integrations/github/repos` | session | — (`SUGGESTED_REPOS`) | `wizard-steps.tsx` |
| GET    | `/integrations/github/repos/:owner/:repo/branches` | session | — | `wizard-steps.tsx` |
| **Support & public forms** |||||
| POST   | `/support/tickets` | session | — (fake) | `support-view.tsx` |
| POST   | `/contact` | public | — (fake) | `contact-form.tsx` |
| POST   | `/docs/feedback` | public | — (local) | `article-feedback.tsx` |
| **Infrastructure & status** |||||
| GET    | `/servers` | session | — (`SERVERS`) | `servers-view.tsx` |
| GET    | `/servers/load` | session | — (simulated) | `servers-view.tsx` |
| GET    | `/status` | public | — (`data/status.ts`) | `/status` page (optional) |
| **Control Center** |||||
| GET    | `/admin/overview` | staff | — (hard-coded) | `admin-view.tsx` |
| GET    | `/admin/revenue` | staff | — (simulated) | `admin-view.tsx` |
| GET    | `/admin/deployments/daily` | staff | — (simulated) | `admin-view.tsx` |
| GET    | `/admin/services` | staff | — (`ADMIN_TOP_SERVICES`) | `admin-view.tsx` |
| **Webhooks (inbound)** |||||
| POST   | `/webhooks/github` | signature | — | GitHub App |
| POST   | `/webhooks/stripe` | signature | — | Stripe |

---

## 3. Health

### `GET /health`

```json
200 { "status": "ok", "version": "1.0.0", "time": 1791201600000 }
```

---

## 4. Auth

### `GET /auth/session`

**Replaces** `api.auth.session()`. Called once when the app loads.
Always `200`, so the frontend never has to handle a 401 here.

```json
200 { "user": { "id": "usr_mehdi", "name": "Mehdi Forhrani", "firstName": "Mehdi", "email": "mehdi@digitaly.fr",
               "plan": "pro", "role": "admin", "avatarInitials": "MF",
               "language": "en", "timezone": "Europe/Paris", "twoFactorEnabled": true, "emailVerified": true,
               "createdAt": 1785844800000 } }
200 { "user": null }
```

Side effect: refreshes `sessions.last_seen_at` and slides the expiry of remembered sessions.

### `POST /auth/login`

**Replaces** `api.auth.login(email, password, remember)`.

```json
{ "email": "mehdi@digitaly.fr", "password": "••••••••", "remember": true }
```

| Result | Response |
| ------ | -------- |
| OK | `200` + `User` + `Set-Cookie: dgc_session=…; HttpOnly; Secure; SameSite=Lax; Path=/; Domain=cloud.digitaly.fr` (+ `Max-Age=2592000` if `remember`, otherwise a browser-session cookie with a 12 h server-side expiry) |
| 2FA enabled | `200 { "twoFactorRequired": true, "challengeToken": "…" }` (no cookie yet) → call `/auth/2fa/verify` |
| Bad email format | `400 VALIDATION_ERROR` `Enter a valid email address.` |
| Wrong email or password | `401 INVALID_CREDENTIALS` `Incorrect email or password.` (same message whether or not the email exists) |
| Too many attempts | `429 RATE_LIMITED` |

### `POST /auth/2fa/verify`

```json
{ "challengeToken": "…", "code": "123456" }         → 200 User + Set-Cookie
                                                     → 401 INVALID_CREDENTIALS "That code is not valid."
```

Recovery codes are accepted in `code` too.

### `POST /auth/signup`

**Replaces** `api.auth.signup(name, email, password)`.

```json
{ "name": "Léa Martin", "email": "lea@example.com", "password": "at-least-8-chars" }
```

| Result | Response |
| ------ | -------- |
| OK | `201` + `User` + session cookie (remembered). Creates the user, a personal team (user = owner), default notification preferences. Sends a verification email. |
| Name too short | `400` `Please enter your full name.` |
| Bad email | `400` `Enter a valid email address.` |
| Short password | `400` `Password must be at least 8 characters.` |
| Email taken | `409 CONFLICT` `An account with this email already exists.` |

### `GET /auth/google?from=/dashboard`

**Replaces** `api.auth.loginWithGoogle()`. A **browser redirect**, not a fetch.
`302` → Google consent screen (state = signed `{ from, nonce }`).

### `GET /auth/google/callback`

Exchanges the code, then finds the user by Google id, or links/creates one by verified email. Creates a session and redirects:
`302 → ${FRONTEND_URL}${from || '/dashboard'}`. On error: `302 → ${FRONTEND_URL}/login?error=google`.
Validate `from` the same way as `lib/validation.ts` `safeRedirectPath` (must start with `/`, not `//`).

### `POST /auth/password/forgot`

**Replaces** `api.auth.requestReset(email)`.

```json
{ "email": "mehdi@digitaly.fr" }  → 204   (always, even if the email is unknown)
                                  → 400 "Enter a valid email address."
```

Emails a link to `${FRONTEND_URL}/reset-password?token=…` (valid 1 hour, single use).

### `POST /auth/password/reset`

```json
{ "token": "…", "password": "new-password" }   → 204 (revokes all sessions)
                                               → 400 "This reset link is invalid or has expired."
```

### `POST /auth/logout`

**Replaces** `api.auth.logout()`. Deletes the session row and clears the cookie. `204`.

---

## 5. Account (`/me`)

### `PATCH /me`

**Replaces** `api.auth.updateProfile(patch)`.

```json
{ "name": "Mehdi Forhrani", "email": "mehdi@digitaly.fr", "language": "fr", "timezone": "Europe/Paris" }
```

All fields optional. Returns `200 User` (`firstName`/`avatarInitials` recomputed).
Errors: `400` validation, `409` email taken. Changing the email should require re-verification.

### `PUT /me/password`

```json
{ "currentPassword": "…", "newPassword": "…" }   → 204
```

`400` `Password must be at least 8 characters.` · `401 INVALID_CREDENTIALS` `Your current password is incorrect.`
Side effect: revokes **all other** sessions (the UI says "Other sessions will need to sign in again").

### `GET /me/sessions` · `DELETE /me/sessions/:id`

```json
200 { "data": [
  { "id": "ses_a1", "device": "MacBook Pro · Chrome", "location": "Lyon, France", "current": true,
    "createdAt": 1790000000000, "lastActiveAt": 1791201600000 },
  { "id": "ses_b2", "device": "iPhone 15 · Safari", "location": "Lyon, France", "current": false,
    "createdAt": 1789000000000, "lastActiveAt": 1791100000000 }
] }
```

`DELETE` → `204`. You can't delete the current session here (`400`). Use logout.

### Two-factor (TOTP)

| Endpoint | Body | Response |
| -------- | ---- | -------- |
| `POST /me/2fa/setup` | — | `200 { "secret": "BASE32…", "otpauthUrl": "otpauth://totp/DIGITALYCloud:mehdi@…", "qrCodeDataUrl": "data:image/png;base64,…" }` |
| `POST /me/2fa/enable` | `{ "code": "123456" }` | `200 { "recoveryCodes": ["abcd-efgh", …] }` · `400` wrong code |
| `POST /me/2fa/disable` | `{ "password": "…" }` or `{ "code": "123456" }` | `204` |

The current UI is a simple switch. It needs a setup modal (QR + code input). See [07](07-frontend-integration.md).

### `GET /me/notification-preferences` · `PUT /me/notification-preferences`

```json
{ "deployFail": true, "deploySuccess": false, "crash": true, "usage": true, "billing": true, "product": false }
```

`PUT` takes the full object (or a partial object, merged) and returns the saved object.

### `DELETE /me`

```json
{ "confirmEmail": "mehdi@digitaly.fr" }   → 202
```

Only the **owner** of the personal team. Stops every service right away, revokes sessions and API keys, cancels the Stripe subscription, and schedules a purge in 24 h ("all data removed within 24 hours"). Clears the cookie.
`400` if `confirmEmail` doesn't match.

---

## 6. Catalog

### `GET /catalog` (public, cacheable)

The backend's plan and region tables. **The backend validates against these**, and they must match `lib/catalog.ts` and `data/regions.ts` (see values in [01](01-project-overview.md#plans-per-service-type)).

```json
200 {
  "plans": {
    "discord": [ { "id": "free", "name": "Bot Free", "price": 0, "ramMb": 256, "vcpu": 0.25, "storageGb": 1,
                   "features": ["1 bot", "256 MB RAM", "0.25 vCPU", "Community support"] }, … ],
    "node":    [ … ], "api": [ … ], "worker": [ … ]
  },
  "regions": [ { "id": "lyon", "city": "Lyon", "country": "France", "countryCode": "FR", "area": "Europe",
                 "code": "FR-LYS-1", "minPlan": "free", "latencyMs": 11, "lat": 45.76, "lon": 4.84,
                 "desc": "Our home region and the default for new services." }, … ],
  "nodeVersions": ["22 LTS", "20 LTS", "18"]
}
```

---

## 7. Services

### Service object

```json
{
  "id": "syncbot",
  "name": "SyncBot",
  "type": "discord",
  "status": "running",
  "cpu": 2.4,
  "ramMb": 186,
  "ramLimitMb": 512,
  "storageMb": 420,
  "storageLimitMb": 5120,
  "startedAt": 1789961820000,
  "createdAt": 1785844800000,
  "lastDeployAt": 1791201480000,
  "region": "France — Lyon",
  "regionId": "lyon",
  "server": "Lyon-01",
  "runtime": "Node.js",
  "nodeVersion": "22 LTS",
  "startCommand": "node index.js",
  "port": null,
  "url": null,
  "plan": "starter",
  "source": "github",
  "repo": "mehdi-f/syncbot",
  "branch": "main",
  "autoDeploy": true,
  "autoRestart": true,
  "env": [
    { "id": "env_e1", "key": "DISCORD_TOKEN", "value": "MTI4…", "secret": true },
    { "id": "env_e3", "key": "NODE_ENV", "value": "production", "secret": false }
  ]
}
```

- `cpu`, `ramMb`, `storageMb` are the **latest sample** from the metrics collector (Redis cache). Live updates arrive through `/events`.
- `env` is included for session requests. Secret values are redacted (`""`) for viewers. `env` is **omitted** for API-key requests.

### `GET /services`

**Replaces** `api.services.list()`. Returns every service of the current team, newest first.
`200 { "data": Service[], "nextCursor": null }`

### `GET /services/:id`

`200 Service` · `404` `Service not found`. Mentioned in the public API docs.

### `POST /services`

**Replaces** `api.services.create(input)`. Used by the wizard's final "Deploy Service" button.

Request (Proposed changes from the mock's `CreateServiceInput`: `regionId` replaces the `region` label, and `uploadId` / `githubInstallationId` are added):

```json
{
  "name": "my-awesome-bot",
  "type": "discord",
  "source": "github",
  "repo": "username/my-discord-bot",
  "branch": "main",
  "uploadId": null,
  "nodeVersion": "22 LTS",
  "startCommand": "node index.js",
  "port": null,
  "plan": "starter",
  "regionId": "lyon",
  "env": [ { "key": "NODE_ENV", "value": "production", "secret": false } ]
}
```

| Field | Rule |
| ----- | ---- |
| `name` | `^[A-Za-z][\w-]{1,31}$`, unique per team (case-insensitive) → `409` `You already have a service with this name.` |
| `type` | ServiceType |
| `source` | `github` → `repo` matches `owner/repo`, `branch` required, repo reachable through the team's GitHub installation (or public). `upload` → `uploadId` belongs to the team; `repo` is set to the upload's file name. `docker` → `repo` is an image ref (≥ 3 chars). |
| `nodeVersion` | One of `nodeVersions` (ignored for Docker) |
| `startCommand` | Non-empty |
| `port` | `null` or 1–65535. **Required** for `api` and `node`. |
| `plan` | PlanId. If the plan's price > 0 and the team has no payment method → `402 PAYMENT_METHOD_REQUIRED` + `checkoutUrl`. |
| `regionId` | Known region → else `400` `Unknown region.`. Allowed for plan → else `400 REGION_NOT_ALLOWED` `{City} isn’t available on the {Plan} plan.` |
| `env` | Keys valid and unique. Server assigns ids. |

Response `201`:

```json
{ "service": { …, "status": "deploying", "cpu": 0, "ramMb": 0, "startedAt": null, "storageMb": 0 },
  "deployment": { "id": "dep_7Hk2", "serviceId": "my-awesome-bot", "number": 1, "environment": "Production",
                  "status": "building", "stage": "preparing", "trigger": "initial",
                  "createdAt": 1791201600000, "commit": "a1b2c3d", "commitMessage": "Initial deployment",
                  "author": "Mehdi Forhrani", "durationSec": 0 } }
```

Side effects: generates the slug `id` (`slugify(name)`, plus `-xxxx` on collision), picks a `server` in the region, creates the Stripe subscription item for paid plans, enqueues the deploy job, and emits `service.updated` + `deployment.created` on `/events`.

### `PATCH /services/:id`

**Replaces** `api.services.update(id, patch)` for **settings only**.

Allowed fields (anything else → `400`): `name`, `startCommand`, `nodeVersion`, `port`, `branch` (GitHub only), `autoDeploy` (GitHub only), `autoRestart` (paid plans only).

```json
{ "name": "SyncBot", "startCommand": "node index.js", "nodeVersion": "22 LTS", "port": null, "branch": "main" }
```

`200 Service`. Changes apply on the **next deployment** (the UI says so).
⚠️ The UI currently sends `ramLimitMb` / `storageLimitMb` along with `plan`. The server must **ignore** client limits and derive them from the plan. Plan changes go to `POST /services/:id/plan`.

### `POST /services/:id/plan`

**Replaces** `api.services.update(id, { plan, ramLimitMb, storageLimitMb })` from `change-plan-modal.tsx` and `service-settings.tsx` → Resources.

```json
{ "plan": "pro" }
```

| Result | Response |
| ------ | -------- |
| OK | `200 Service` with new `plan`, `ramLimitMb`, `storageLimitMb`. Stripe subscription item updated with proration. Container resource limits updated (may restart the container). |
| Region not in plan | `400 REGION_NOT_ALLOWED` `{City} isn’t available on this plan.` |
| No payment method for a paid plan | `402 PAYMENT_METHOD_REQUIRED` `{ "checkoutUrl": "https://checkout.stripe.com/…" }` |
| Downgrade to free | Also forces `autoRestart = false` |

### `POST /services/:id/start` · `/stop` · `/restart`

**Replace** `api.services.restart(id)` (also used as "start" by the UI) and `api.services.stop(id)`.
No body. Returns `200 Service`.

| Endpoint | Effect | Errors |
| -------- | ------ | ------ |
| `start` | Starts the container of the last successful deployment. `status=running`, `startedAt=now`. | `409` `Deploy the service before starting it.` if there is no successful deployment |
| `stop` | Stops the container (SIGTERM, then SIGKILL after 10 s). `status=stopped`, `startedAt=null`, `cpu=0`, `ramMb=0`. | `409` while deploying |
| `restart` | Restarts the container. `status=running`, `startedAt=now`. If stopped, behaves like `start`. | `409` while deploying |

The public docs list `POST /v1/services/:id/restart`.

### `DELETE /services/:id`

**Replaces** `api.services.remove(id)`. `204`.
Stops and removes containers, deletes deployments, env vars, logs and metrics, and removes the Stripe subscription item. Emits `service.deleted`.

### `PUT /services/:id/env`

**Replaces** `api.services.setEnv(id, env)`. Replaces the **whole list** (the UI always sends the full array).

```json
{ "env": [ { "id": "env_e1", "key": "DISCORD_TOKEN", "value": "…", "secret": true },
           { "id": "e_tmp123", "key": "NEW_VAR", "value": "x", "secret": false } ] }
```

`200 { "data": EnvVar[] }`: the saved list, with server ids for new rows.
Errors: `400` `Keys must use uppercase letters, numbers and underscores.` · `409` `{KEY} already exists.` · `400` reserved `DIGITALY_*` key.
Values are encrypted at rest. A restart is **not** automatic (the UI says "Restart the service to apply changes"; see the open question about the public docs saying otherwise).

---

## 8. Deployments

### Deployment object

See [04-data-models.md](04-data-models.md#deployment). Lists omit `logs`.

### `GET /deployments?serviceId=syncbot&limit=50`

**Replaces** `api.deployments.list(serviceId?)`. Sorted **newest first** (`createdAt desc`). `serviceId` is optional; without it you get all of the team's deployments.
`200 { "data": Deployment[], "nextCursor": null }`

### `GET /deployments/:id`

Full deployment **with** `logs: string[]` (build output). `deployment-item.tsx` should fetch it when a row is expanded.

### `POST /services/:id/deploy`

**Replaces** `api.deployments.trigger(serviceId)`. Listed in the public docs (`curl -X POST …/v1/services/syncbot/deploy`).

```json
{}                                         // redeploy latest source (branch HEAD / same upload / same image)
{ "deploymentId": "dep_41" }               // rollback: redeploy that successful deployment's built image
```

`202 { "service": Service (status "deploying"), "deployment": Deployment (status "building", number = last + 1) }`
`409` `A deployment is already in progress.` · `404` deployment to roll back not found or not successful.

### Deploy lifecycle (server-side, replaces `deployments.complete`)

The client **never** reports the result. The deploy worker runs the stages and pushes updates:

```
deployment.created   { status: "building", stage: "preparing" }
deployment.updated   { stage: "pulling" }        + deployment.log lines
deployment.updated   { stage: "installing" }     + deployment.log lines
deployment.updated   { stage: "starting" }
deployment.updated   { stage: "health_check" }
deployment.updated   { status: "success" | "failed", stage: null, durationSec, finishedAt }
service.updated      { status: "running" | "failed", startedAt, lastDeployAt, cpu, ramMb }
notification.created { title: "Deployment #43 succeeded", body: "SyncBot is live.", kind: "success" }
```

On failure: `title: "Deployment #43 failed"`, `body: "{name} failed its health check. Check the logs."`, `kind: "error"`. The service stays `running` if an older version was running, otherwise `failed`.

---

## 9. Logs, metrics and real-time

### `GET /services/:id/logs?limit=200&before=<id>&level=error,warn&q=timeout`

Runtime log history, oldest → newest within the page.
`200 { "data": LogLine[], "nextCursor": "1024" }` where `LogLine = { id, ts, level, text }`.
The public docs list `GET /v1/services/:id/logs`.

### `GET /services/:id/logs/stream?since=<id>` (SSE)

`Content-Type: text/event-stream`. Sends the last 200 lines first, then new lines live.

```
event: log
id: 1025
data: {"id":1025,"ts":1791201600000,"level":"info","text":"Command /ping executed by @lea.m in 12ms"}

: keep-alive                      ← comment every 25 s
```

### `GET /services/:id/metrics?range=live|24h|7d|30d`

Matches the point counts the UI draws: `live` → last 40 samples at 2 s (from the Redis live buffer), `24h` → 24 hourly points, `7d` → 28 points (6 h), `30d` → 30 daily points.

```json
200 { "range": "24h", "intervalSec": 3600,
      "data": [ { "ts": 1791118800000, "cpu": 3.1, "ram": 190, "netIn": 61.2, "netOut": 28.4, "disk": 420 }, … ] }
```

The "Live" tab loads `range=live` once as a backfill, then appends `service.metrics` events from `/events`.

### `GET /metrics/usage?range=24h`

Team-wide usage for the dashboard chart: CPU % and RAM % across running services.
`200 { "data": [ { "ts": …, "cpu": 24.3, "ram": 47.1 }, … ] }`

### `GET /events` (SSE, the real-time channel)

One stream per signed-in browser tab, scoped to the current team. It replaces every `setTimeout`/`setInterval` simulation.

| Event                  | `data`                                                                 | Frontend reaction (cloud provider)          |
| ---------------------- | ---------------------------------------------------------------------- | ------------------------------------------- |
| `service.updated`      | `Service` (without `env`)                                              | `patchService` (keep existing `env`)        |
| `service.deleted`      | `{ "id": "syncbot" }`                                                  | remove from list                            |
| `service.metrics`      | `{ "serviceId", "ts", "cpu", "ramMb", "netIn", "netOut", "storageMb" }` every 2–5 s per running service | patch `cpu`, `ramMb`; feed live charts |
| `deployment.created`   | `Deployment`                                                           | `upsertDeployment`                          |
| `deployment.updated`   | `Deployment`                                                           | `upsertDeployment`; toast on success/failure |
| `deployment.log`       | `{ "deploymentId", "lineNo", "text" }`                                 | deploy progress screen / open deployment row |
| `notification.created` | `Notification`                                                         | prepend to notifications                    |

Send a `: keep-alive` comment every 25 s. Support `Last-Event-ID` if possible, or let the client call `reload()` after reconnecting.
API-key users don't get SSE. They poll `GET /services/:id` and `GET /deployments`.

---

## 10. API keys

| Endpoint | Request | Response |
| -------- | ------- | -------- |
| `GET /api-keys` | — | `200 { "data": ApiKey[] }` newest first |
| `POST /api-keys` | `{ "name": "GitHub Actions", "scope": "full" }` | `201 { "key": ApiKey, "secret": "dgc_live_…" }`. **The secret is returned only here.** |
| `DELETE /api-keys/:id` | — | `204` (immediately invalid) |

**Replace** `api.apiKeys.list/create/revoke`. Name ≥ 2 chars, `scope` ∈ `read|full`.

```json
{ "id": "key_k1", "name": "GitHub Actions", "prefix": "dgc_live_8f3a", "createdAt": 1787745600000,
  "lastUsed": 1791194400000, "scope": "full" }
```

---

## 11. Notifications

| Endpoint | Response | Replaces |
| -------- | -------- | -------- |
| `GET /notifications?limit=30` | `200 { "data": Notification[] }` newest first | `notifications.list` |
| `POST /notifications/read-all` | `200 { "data": Notification[] }` (all `read: true`) | `notifications.markAllRead` |

Emails follow the user's notification preferences (deploy success/fail, crash, usage, billing, product).

---

## 12. Team

| Endpoint | Request | Response / rules |
| -------- | ------- | ---------------- |
| `GET /team/members` | — | `200 { "data": TeamMember[] }` (includes pending invitations, `pending: true`) |
| `POST /team/invitations` | `{ "email": "lea@digitaly.fr", "role": "developer" }` | `201 TeamMember` (pending). Sends an email with `${FRONTEND_URL}/invite?token=…` (7 days). `409` if already a member or invited. |
| `POST /team/invitations/accept` | `{ "token": "…" }` | `200 TeamMember`. The signed-in user's email must match the invite. |
| `PATCH /team/members/:id` | `{ "role": "admin" }` | `200 TeamMember`. Can't change the owner. Role ∈ admin/developer/viewer. |
| `DELETE /team/members/:id` | — | `204`. Removes a member or cancels a pending invite. Can't remove the owner. |

```json
{ "id": "tm_m1", "name": "Léa Martin", "email": "lea@digitaly.fr", "role": "developer",
  "pending": false, "invitedAt": 1789000000000, "joinedAt": 1789100000000 }
```

The UI shows roles capitalised (`Owner`, `Developer`). The API uses lowercase and the frontend maps them.

---

## 13. Billing (owner only)

### `GET /billing/summary`

```json
200 { "status": "active", "currency": "EUR", "monthlyTotal": 9.98,
      "nextBillingDate": "2026-10-15", "periodStart": "2026-09-15", "periodEnd": "2026-10-15",
      "paymentMethod": { "brand": "visa", "last4": "4242", "expMonth": 8, "expYear": 2028 } }
```

Replaces the hard-coded "Visa •••• 4242", "Next billing date: October 15, 2026" and "September 15 – October 15, 2026" in `billing-view.tsx`.
Per-service plans and usage bars are still computed from `services` on the client.

### `GET /billing/invoices`

`200 { "data": Invoice[] }`, e.g. `{ "id": "inv_1", "number": "DGC-2026-0918", "date": "2026-09-15", "amount": 6.99, "status": "paid", "plan": "Pro", "pdfUrl": "…" }`

### `GET /billing/invoices/:id/pdf`

`200 application/pdf` (or `302` to the Stripe-hosted PDF). Replaces the `.txt` download.

### `POST /billing/portal-session`

`200 { "url": "https://billing.stripe.com/p/session/…" }`. The frontend redirects there for "Update card". Return URL: `${FRONTEND_URL}/billing`.

---

## 14. Sources and integrations

### `POST /uploads` (multipart/form-data)

Field `file`: `.zip`, `.tar` or `.gz`. Proposed max size: 100 MB.
`201 { "id": "upl_9x", "fileName": "notifier.zip", "sizeBytes": 482113, "createdAt": … }`
`413 PAYLOAD_TOO_LARGE` · `400` wrong type. Then pass `uploadId` to `POST /services`.
To redeploy an upload service with new code, upload again and call `POST /services/:id/deploy { "uploadId": "upl_…" }`.

### GitHub App

| Endpoint | Response |
| -------- | -------- |
| `GET /integrations/github` | `200 { "connected": true, "accounts": [ { "login": "mehdi-f", "installationId": 123 } ] }` |
| `GET /integrations/github/install?from=/services/new` | `302` → GitHub App install page |
| `GET /integrations/github/callback` | Stores the installation for the team. `302 → ${FRONTEND_URL}${from}?github=connected` |
| `GET /integrations/github/repos?q=bot` | `200 { "data": [ { "fullName": "mehdi-f/syncbot", "defaultBranch": "main", "private": true } ] }` (replaces `SUGGESTED_REPOS`) |
| `GET /integrations/github/repos/:owner/:repo/branches` | `200 { "data": [ { "name": "main" }, { "name": "dev" } ] }` |

Public repos can be deployed without installing the app.

---

## 15. Support and public forms

### `POST /support/tickets` (session)

```json
{ "subject": "My bot goes offline every night", "serviceId": "syncbot", "priority": "high", "message": "…at least 10 chars…" }
```

`201 SupportTicket`, e.g. `{ "id": "tkt_1", "number": 4821, … }`. The UI toast becomes `Ticket #{number} created`.
Rules: subject ≥ 4, message ≥ 10, `priority` ∈ `low|normal|high`, `serviceId` null or owned by the team. Notify the support inbox (`support@digitaly.fr`) and email a copy to the user.

### `POST /contact` (public)

```json
{ "name": "Jane Doe", "email": "jane@company.com", "company": "Nordwind SAS",
  "topic": "Sales & dedicated resources", "message": "…at least 10 chars…" }
```

`202`. Topics: `Sales & dedicated resources`, `Technical question`, `Billing`, `Partnership`, `Press`.
Rate-limited. Add a honeypot field or captcha.

### `POST /docs/feedback` (public)

`{ "slug": "deployments", "vote": "up" }` → `204`.

---

## 16. Infrastructure and status

### `GET /servers`

`200 { "data": Server[] }`. Hosts in the regions where the team has services (or all public hosts; see open questions). Never expose `docker_host`.

### `GET /servers/load?range=24h`

Hourly CPU % per region, keyed by region id (the chart has `lyon` and `paris` series):
`200 { "data": [ { "ts": …, "lyon": 34.2, "paris": 21.0 }, … ] }`

### `GET /status` (public, optional)

Same shape as `data/status.ts` so the page can switch over without UI changes:

```json
200 { "overallUptime": 99.99,
      "groups": [ { "name": "Platform", "components": [ { "name": "REST API", "desc": "api.cloud.digitaly.fr",
                    "uptime": 99.98, "events": [ { "daysAgo": 54, "state": "outage", "note": "Partial outage · 22 min" } ] } ] } ],
      "maintenance": { "title": "…", "window": "…", "body": "…", "affected": ["Compute — Paris"] },
      "incidents": [ { "date": "Sep 24, 2026", "title": "…", "impact": "minor", "duration": "38 min",
                       "affected": ["Deployments"], "updates": [ { "time": "14:52", "stage": "Resolved", "text": "…" } ] } ],
      "history": [ { "ts": …, "uptime": 99.97, "latency": 42 } ] }
```

---

## 17. Control Center (`/admin`, platform staff only)

All endpoints return `403 FORBIDDEN` unless `User.role === 'admin'`.

| Endpoint | Response |
| -------- | -------- |
| `GET /admin/overview` | `{ "totalUsers": 2481, "newUsersThisMonth": 148, "activeServices": 3926, "runningPct": 94.2, "serversOnline": 2, "serversTotal": 3, "serversInMaintenance": ["Lyon-02"], "mrr": 12684, "mrrChangePct": 8.4, "cpuAvg": 28, "ramAvg": 52, "deployments14d": 4312, "failedDeployments14d": 187, "failureRatePct": 4.3 }` |
| `GET /admin/revenue?range=30d` | `{ "data": [ { "ts": …, "mrr": 11240, "users": 2410 } ] }` |
| `GET /admin/deployments/daily?range=14d` | `{ "data": [ { "ts": …, "success": 310, "failed": 14 } ] }` |
| `GET /admin/services?q=&sort=cpu&limit=20` | `{ "data": [ { "id": "syncbot", "name": "SyncBot", "owner": "Mehdi Forhrani", "type": "discord", "server": "Lyon-01", "cpu": 2.4, "ramMb": 186, "plan": "starter", "status": "running" } ] }` |

`admin-view.tsx` currently shows labels (`Discord Bot`, `Starter`). Return enum values and let the UI map them with `SERVICE_TYPES` and the plan names.

---

## 18. Inbound webhooks

Both need the **raw body** for signature verification. Mount them **before** `express.json()`.

### `POST /webhooks/github`

Verify `X-Hub-Signature-256` with `GITHUB_WEBHOOK_SECRET`.

| Event | Action |
| ----- | ------ |
| `push` | For each service with `source=github`, matching `repo` + `branch` and `autoDeploy=true`: create a deployment (`trigger: "git_push"`, real commit SHA/message/author) |
| `installation` / `installation_repositories` | Sync `github_installations` |

### `POST /webhooks/stripe`

Verify `Stripe-Signature` with `STRIPE_WEBHOOK_SECRET`.

| Event | Action |
| ----- | ------ |
| `invoice.paid` | Upsert invoice (`paid`), notification "Invoice paid" (`Invoice DGC-… of €6.99 was paid.`) |
| `invoice.payment_failed` | Invoice `failed`, billing `past_due`, notification + email |
| `customer.subscription.updated` / `deleted` | Sync billing status |
| `payment_method.attached`, `customer.updated` | Refresh the stored card summary |
| `checkout.session.completed` | Finish the pending plan change or paid service creation |
