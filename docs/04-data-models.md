# 04 — Data models

> **Implemented.** The wire DTOs now live in `packages/shared/src/types.ts` (the UI's `lib/types.ts` aliases them) and the
> storage model is MongoDB (see [MongoDB collections](#mongodb-collections-implemented) below and
> [backend-decisions.md](backend-decisions.md)). The tables below remain the field-level reference; fields marked ➕ were
> added as proposed. Node.js versions are now `24 LTS` (default) and `22 LTS`; `20 LTS` and `18` are end-of-life.

The API returns **these exact field names** (camelCase), with timestamps as **epoch milliseconds**.
For each entity below: the original UI fields (✅), the fields the backend added (➕), and who owns each value.

**Owner** column: **server** = computed or controlled by the backend, never accepted from the client. **client** = editable by the user, so validate it.

## Enums

```ts
type ServiceType      = 'discord' | 'node' | 'api' | 'worker';
type ServiceStatus    = 'running' | 'stopped' | 'deploying' | 'failed';
type PlanId           = 'free' | 'starter' | 'pro' | 'business';        // ordered: index = plan level
type SourceType       = 'github' | 'upload' | 'docker';
type DeploymentStatus = 'building' | 'success' | 'failed';
type NodeVersion      = '24 LTS' | '22 LTS' | '20 LTS' | '18';          // deployable: 24 LTS, 22 LTS (shared NODE_VERSIONS)
type ApiKeyScope      = 'read' | 'full';
type NotificationKind = 'success' | 'warning' | 'info' | 'error';
type LogLevel         = 'info' | 'warn' | 'error' | 'success' | 'debug';
type PlatformRole     = 'user' | 'admin';                               // User.role
type TeamRole         = 'owner' | 'admin' | 'developer' | 'viewer';     // ➕ (UI shows 'Owner', 'Admin'…)
```

---

## User

| Field            | Type                   | Owner  | Notes                                                                                |
| ---------------- | ---------------------- | ------ | ------------------------------------------------------------------------------------ |
| ✅ `id`          | string                 | server | e.g. `usr_8f3a91c2`                                                                  |
| ✅ `name`        | string                 | client | Full name, ≥ 2 chars after trim                                                      |
| ✅ `firstName`   | string                 | server | First word of `name`                                                                 |
| ✅ `email`       | string                 | client | Unique (case-insensitive), must match `^[^\s@]+@[^\s@]+\.[^\s@]+$`                   |
| ✅ `plan`        | PlanId                 | server | **Not used by the UI** (billing is per service). Keep for compatibility, see open questions. |
| ✅ `role`        | `'user' \| 'admin'`    | server | Platform staff flag. `admin` unlocks `/admin`. Never editable through the API.     |
| ✅ `avatarInitials` | string              | server | First letter of the first two words, uppercased (`Mehdi Forhrani` → `MF`)           |
| ➕ `language`    | `'en' \| 'fr'`         | client | Settings → Profile (not saved today)                                                 |
| ➕ `timezone`    | string (IANA)          | client | e.g. `Europe/Paris`. The UI currently offers `paris` / `london` options; map those to IANA names |
| ➕ `twoFactorEnabled` | boolean           | server | Settings → Security                                                                  |
| ➕ `emailVerified` | boolean              | server |                                                                                      |
| ➕ `createdAt`   | number                 | server |                                                                                      |

Never return `passwordHash`, TOTP secrets or OAuth tokens.

## Service

| Field              | Type             | Owner  | Notes                                                                                                   |
| ------------------ | ---------------- | ------ | ------------------------------------------------------------------------------------------------------- |
| ✅ `id`            | string           | server | **Public slug**, globally unique and immutable. Created as `slugify(name)`; on collision append `-` + 4 random chars. Used in `/services/:id` and `https://{id}.digitaly.app`. |
| ✅ `name`          | string           | client | `^[A-Za-z][\w-]{1,31}$` (2–32 chars, starts with a letter). Unique per team, case-insensitive. Renaming does **not** change `id`. |
| ✅ `type`          | ServiceType      | client | Set at creation, immutable                                                                              |
| ✅ `status`        | ServiceStatus    | server | See state machine below                                                                                 |
| ✅ `cpu`           | number           | server | Current CPU usage in % (live metric, 1 decimal). `0` when not running.                                    |
| ✅ `ramMb`         | number           | server | Current memory usage (MB, live metric). `0` when not running.                                             |
| ✅ `ramLimitMb`    | number           | server | `plan.ramMb`: **derived from plan, ignore client values**                                               |
| ✅ `storageMb`     | number           | server | Current disk usage (MB)                                                                                 |
| ✅ `storageLimitMb`| number           | server | `plan.storageGb × 1024`: derived                                                                         |
| ✅ `startedAt`     | number \| null   | server | When the current process started. `null` unless running. The UI computes uptime from it.                     |
| ✅ `createdAt`     | number           | server |                                                                                                         |
| ✅ `lastDeployAt`  | number           | server | Last deployment start/finish time                                                                       |
| ✅ `region`        | string           | server | **Display label** `"{country} — {city}"`, e.g. `France — Lyon` (the UI looks regions up by this label today) |
| ✅ `server`        | string           | server | Host name, e.g. `Lyon-01` (assigned by the scheduler)                                                   |
| ✅ `runtime`       | string           | server | `'Docker'` if `source === 'docker'`, else `'Node.js'`                                                   |
| ✅ `nodeVersion`   | NodeVersion      | client | Ignored for Docker                                                                                      |
| ✅ `startCommand`  | string           | client | Required, non-empty                                                                                     |
| ✅ `port`          | number \| null   | client | 1–65535. **Required for `api` and `node`**. A port means the service gets a public URL.                   |
| ✅ `plan`          | PlanId           | client | Must allow the service's region. Changing it has billing effects (see `POST /services/:id/plan`).       |
| ✅ `source`        | SourceType       | client | Immutable after creation                                                                                |
| ✅ `repo`          | string           | client | `github`: `owner/repo` (`^[\w.-]+\/[\w.-]+$`) · `docker`: image ref (≥ 3 chars) · `upload`: original file name |
| ✅ `branch`        | string           | client | GitHub only. The mock uses `'—'` for other sources. **Proposed:** API returns `null`, and the frontend adapter maps it to `'—'`. |
| ✅ `env`           | EnvVar[]         | client | Embedded for session (dashboard) requests. Omitted for API-key requests.                                       |
| ➕ `regionId`      | string           | server | `lyon`, `paris`, … (store this, derive `region` label from it)                                          |
| ➕ `url`           | string \| null   | server | `https://{id}.digitaly.app` when `port` is set, else `null`                                             |
| ➕ `autoDeploy`    | boolean          | client | Deploy on every push to `branch` (GitHub only). Default `true`.                                         |
| ➕ `autoRestart`   | boolean          | client | Restart on crash. **Paid plans only** (force `false` on `free`).                                        |

### Service status state machine

```
             create / deploy                 deploy succeeds
  (new) ───────────────────────► deploying ─────────────────────► running
                                    │  ▲                          │   │
             deploy fails, never    │  │ deploy                   │   │ stop
             ran before             ▼  │                          │   ▼
                                 failed ◄──────── crash (no       │ stopped
                                                  auto-restart)   │   │
                                                                  │   │ start / restart
                              deploy fails but an older version   │   │
                              was running → stays running ◄───────┘ ◄─┘
```

Rules taken from the mock:

| Action            | Result                                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| Create            | `status = deploying`, `cpu = 0`, `ramMb = 0`, `startedAt = null`, deployment #1 created as `building`     |
| Deploy            | `status = deploying`, new deployment `#(last + 1)` as `building`                                          |
| Deploy success    | `status = running`, `startedAt = now`, `lastDeployAt = now`, notification "Deployment #N succeeded"     |
| Deploy failure    | `status = running` if `startedAt` was set (previous version keeps running), otherwise `failed`. Notification "Deployment #N failed". |
| Restart / Start   | `status = running`, `startedAt = now`                                                                     |
| Stop              | `status = stopped`, `startedAt = null`, `cpu = 0`, `ramMb = 0`                                            |
| Delete            | Removes the service, its deployments, env vars and logs                                                   |

## EnvVar

| Field        | Type    | Owner  | Notes                                                                       |
| ------------ | ------- | ------ | --------------------------------------------------------------------------- |
| ✅ `id`      | string  | server | The UI generates temporary ids (`uid('e')`) for new rows. The server may keep or replace them. |
| ✅ `key`     | string  | client | `^[A-Z_][A-Z0-9_]*$`, unique within the service                             |
| ✅ `value`   | string  | client | **Encrypted at rest** (AES-256-GCM). Injected at runtime only.              |
| ✅ `secret`  | boolean | client | Secret values are masked in the UI and must be redacted in logs              |

Proposed limits: key ≤ 128 chars, value ≤ 32 KB, ≤ 100 variables per service.
Reserved names (the platform injects these, per `data/docs/platform.tsx`): `PORT` (= `service.port`), `DIGITALY_REGION` (region id), `DIGITALY_DEPLOYMENT_ID`. Reject user keys starting with `DIGITALY_`. If a user sets `PORT`, the platform value wins.

## Deployment

| Field              | Type                         | Owner  | Notes                                                       |
| ------------------ | ---------------------------- | ------ | ----------------------------------------------------------- |
| ✅ `id`            | string                       | server | Opaque (mock: `{serviceId}-dep-{n}-{rand}`)                 |
| ✅ `serviceId`     | string                       | server | Service slug                                                |
| ✅ `number`        | number                       | server | Per-service sequence starting at 1                          |
| ✅ `environment`   | `'Production' \| 'Preview'`  | server | Always `Production` for now                                 |
| ✅ `status`        | DeploymentStatus             | server |                                                             |
| ✅ `createdAt`     | number                       | server |                                                             |
| ✅ `commit`        | string                       | server | 7-char short SHA for GitHub. For uploads/Docker, a short hash of the archive or image digest. |
| ✅ `commitMessage` | string                       | server | Git commit message, or e.g. `Initial deployment`, `chore: redeploy from dashboard` |
| ✅ `author`        | string                       | server | Commit author or the user who clicked Deploy                |
| ✅ `durationSec`   | number                       | server | Set when finished; `0` while building                       |
| ✅ `logs`          | string[]                     | server | Build log lines. **Only returned by `GET /deployments/:id`.** Lists omit them or return `[]`. |
| ➕ `stage`         | DeployStage \| null          | server | `'preparing' \| 'pulling' \| 'installing' \| 'starting' \| 'health_check'`. Drives the progress screen. |
| ➕ `trigger`       | string                       | server | `'initial' \| 'manual' \| 'git_push' \| 'api' \| 'rollback'` |
| ➕ `finishedAt`    | number \| null               | server |                                                             |
| ➕ `rollbackOf`    | string \| null               | server | Deployment id that was redeployed                           |

The five stages come from the public docs (`data/docs/platform.tsx` → Deployments) and `components/services/deploy-progress.tsx`:
**Preparing environment → Pulling source → Installing dependencies → Starting service → Health check.**
If any stage fails, the previous version keeps running.

## LogLine (runtime logs)

| Field     | Type     | Notes                                                    |
| --------- | -------- | -------------------------------------------------------- |
| ✅ `id`   | number   | Monotonic within a service's stream (used as React key and as a cursor) |
| ✅ `ts`   | number   | Epoch ms                                                 |
| ✅ `level`| LogLevel | `stderr` or lines starting with `ERROR` → `error`, `WARN` → `warn` |
| ✅ `text` | string   | One line, secrets redacted                               |

## ApiKey

| Field          | Type             | Notes                                                                    |
| -------------- | ---------------- | ------------------------------------------------------------------------ |
| ✅ `id`        | string           |                                                                          |
| ✅ `name`      | string           | ≥ 2 chars                                                                |
| ✅ `prefix`    | string           | First 13 chars of the secret (`dgc_live_` + 4), e.g. `dgc_live_8f3a`. The UI shows `prefix••••••••••••`. |
| ✅ `createdAt` | number           |                                                                          |
| ✅ `lastUsed`  | number \| null   | Updated on each authenticated request (can be throttled to once a minute) |
| ✅ `scope`     | ApiKeyScope      | `read` = view services and metrics · `full` = deploy, restart and edit   |

Secret format: `dgc_live_` + ≥ 24 random URL-safe chars. **Store only a SHA-256 hash.** The full secret is returned once, at creation.

## Notification

| Field       | Type             | Notes                                         |
| ----------- | ---------------- | --------------------------------------------- |
| ✅ `id`     | string           |                                               |
| ✅ `title`  | string           | e.g. `Deployment #42 succeeded`               |
| ✅ `body`   | string           | e.g. `SyncBot is live.`                       |
| ✅ `time`   | number           | Epoch ms                                      |
| ✅ `read`   | boolean          |                                               |
| ✅ `kind`   | NotificationKind |                                               |
| ➕ `serviceId` | string \| null | Optional deep link                           |

Events that create notifications: deployment succeeded/failed, service crashed, usage above 80% RAM or storage, scheduled maintenance, invoice paid or failed.

## Server

| Field          | Type                                        | Notes                     |
| -------------- | ------------------------------------------- | ------------------------- |
| ✅ `id`        | string                                      | `lyon-01`                 |
| ✅ `name`      | string                                      | `Lyon-01`                 |
| ✅ `status`    | `'healthy' \| 'degraded' \| 'maintenance'`  |                           |
| ✅ `cpu`       | number                                      | % utilisation             |
| ✅ `ram`       | number                                      | % utilisation             |
| ✅ `storage`   | number                                      | % utilisation             |
| ✅ `containers`| number                                      | Running containers        |
| ✅ `region`    | string                                      | Label, `France — Lyon`    |
| ✅ `country`   | string                                      | ISO code, `FR`            |
| ✅ `ip`        | string                                      |                           |
| ✅ `cores`     | number                                      |                           |
| ✅ `memoryGb`  | number                                      |                           |
| ✅ `diskTb`    | number                                      |                           |
| ✅ `uptimeDays`| number                                      |                           |

## Invoice

| Field       | Type                                | Notes                                                    |
| ----------- | ----------------------------------- | -------------------------------------------------------- |
| ✅ `id`     | string                              |                                                          |
| ✅ `number` | string                              | `DGC-YYYY-MMDD` style, e.g. `DGC-2026-0918`              |
| ✅ `date`   | string                              | `YYYY-MM-DD`                                             |
| ✅ `amount` | number                              | Euros, VAT included (`6.99`). Store **cents** in the DB. |
| ✅ `status` | `'paid' \| 'pending' \| 'failed'`   | The UI currently always shows "Paid", so it needs updating   |
| ✅ `plan`   | string                              | Label shown in the table (e.g. `Pro`). With per-service billing this should become a summary, e.g. `3 services`. |
| ➕ `pdfUrl` | string \| null                      | Replaces the `.txt` download                             |

## Catalog types (`lib/catalog.ts`, `data/regions.ts`)

```ts
interface Plan   { id: PlanId; name: string; price: number; ramMb: number; vcpu: number; storageGb: number; features: string[]; popular?: boolean }
interface Region { id: string; city: string; country: string; countryCode: string; area: 'Europe' | 'North America' | 'Asia Pacific';
                   code: string; minPlan: PlanId; latencyMs: number; lat: number; lon: number; desc: string }
```

Values are listed in [01-project-overview.md](01-project-overview.md#plans-per-service-type).

---

## Entities added by the backend

```ts
interface Session {              // Settings → Security → Active sessions
  id: string;
  device: string;                // "MacBook Pro · Chrome" (parsed from User-Agent)
  location: string;              // "Lyon, France" (GeoIP, optional)
  current: boolean;              // true for the session making the request
  createdAt: number;
  lastActiveAt: number;
}

interface NotificationPreferences {   // Settings → Notifications (keys match settings-view.tsx)
  deployFail: boolean;     // default true
  deploySuccess: boolean;  // default false
  crash: boolean;          // default true
  usage: boolean;          // default true
  billing: boolean;        // default true
  product: boolean;        // default false
}

interface TeamMember {           // Settings → Team
  id: string;
  name: string;                  // invitee's email local-part until they accept
  email: string;
  role: TeamRole;                // 'owner' | 'admin' | 'developer' | 'viewer'
  pending: boolean;              // true = invitation not accepted yet
  invitedAt: number | null;
  joinedAt: number | null;
}

interface BillingSummary {       // Billing page header + usage panel
  status: 'active' | 'past_due' | 'canceled';
  currency: 'EUR';
  monthlyTotal: number;          // sum of service plan prices
  nextBillingDate: string;       // YYYY-MM-DD
  periodStart: string;           // YYYY-MM-DD
  periodEnd: string;             // YYYY-MM-DD
  paymentMethod: { brand: string; last4: string; expMonth: number; expYear: number } | null;
}

interface SupportTicket {
  id: string;
  number: number;                // shown as "Ticket #4821"
  subject: string;               // ≥ 4 chars
  serviceId: string | null;
  priority: 'low' | 'normal' | 'high';
  message: string;               // ≥ 10 chars
  status: 'open' | 'pending' | 'closed';
  createdAt: number;
}

interface MetricPoint {          // Service metrics history
  ts: number;                    // epoch ms (UI formats the axis label)
  cpu: number;                   // %
  ram: number;                   // MB
  netIn: number;                 // KB/s
  netOut: number;                // KB/s
  disk: number;                  // MB
}

interface Upload { id: string; fileName: string; sizeBytes: number; createdAt: number }
interface GithubRepo { fullName: string; defaultBranch: string; private: boolean }
```

---

## MongoDB collections (implemented)

The relational proposal that used to be here was replaced by MongoDB (project requirement). Models are in
`apps/backend/src/db/models/`; indexes are created by `npm run db:migrate` and checked by `cli indexes verify`.

| Area | Collections | Notes |
| ---- | ----------- | ----- |
| Identity | `users`, `sessions`, `auth_tokens`, `auth_challenges`, `oauth_states`, `oauth_identities` | Token hashes only; TTL indexes expire sessions/tokens; TOTP secrets encrypted. |
| Teams | `teams`, `memberships`, `invitations` | Unique `(teamId, userId)`; partial unique index allows one owner per team; one pending invitation per email. |
| Hosting | `services`, `slug_reservations`, `env_vars`, `deployments`, `deployment_logs`, `runtime_logs`, `metric_samples`, `usage_alert_states` | Service `_id` = slug; one `building` deployment per service (partial unique); env values AES-256-GCM. |
| Infrastructure | `servers`, `capacity_reservations`, `server_metric_samples`, `github_installations`, `uploads` | Capacity reserved with conditional atomic updates. |
| Product | `api_keys`, `notifications`, `support_tickets`, `contact_messages`, `doc_feedback`, `email_deliveries` | Key hashes; notifications deduplicated by `(userId, dedupeKey)`. |
| Billing | `billing_accounts`, `subscription_items`, `invoices`, `billing_operations`, `webhook_receipts` | Money in integer cents; receipts unique per provider event id. |
| Reliability | `outbox`, `idempotency_records`, `counters`, `audit_events`, `account_deletions`, `migration_ledger` | Transactional outbox → BullMQ; idempotency replays; atomic sequences. |
| Status | `availability_samples`, `incidents`, `maintenance_windows`, `revenue_snapshots` | Only real observations and published incidents. |

Conventions: string ids with a type prefix (`usr_…`, `team_…`, `dep_…`), BSON dates (epoch ms on the wire), no `_id`/`__v`
in responses, `strict: 'throw'` schemas. Full index list and retention periods: [backend-decisions.md §1](backend-decisions.md#1-mongodb-instead-of-postgresql).

## Validation rules (mirror the UI, enforce on the server)

| Where                 | Field                | Rule (message the UI uses)                                                          |
| --------------------- | -------------------- | ----------------------------------------------------------------------------------- |
| Signup                | name                 | trimmed length ≥ 2: `Please enter your full name.`                                 |
| Signup / login / profile | email             | `^[^\s@]+@[^\s@]+\.[^\s@]+$`: `Enter a valid email address.`                       |
| Signup / password change / reset | password  | length ≥ 8: `Password must be at least 8 characters.` (the mock only checks ≥ 6 at login; the real login just checks the credentials) |
| Login                 | credentials          | wrong → `Incorrect email or password.` (same message for unknown email)            |
| Service create        | name                 | `^[A-Za-z][\w-]{1,31}$`: `Use 2–32 letters, numbers, dashes or underscores, starting with a letter.`; duplicate → `You already have a service with this name.` |
| Service create        | repo (github)        | `^[\w.-]+\/[\w.-]+$`: `Enter a repository like username/repo.`                     |
| Service create        | docker image         | length ≥ 3: `Enter a Docker image name.`                                           |
| Service create        | upload               | `.zip`, `.tar`, `.gz` (+ size limit): `Upload a .zip of your project.`              |
| Service create/update | startCommand         | non-empty: `A start command is required.`                                          |
| Service create/update | port                 | 1–65535: `Port must be between 1 and 65535.`; required for `api`/`node`: `Web services need a port.` |
| Service create/update | region vs plan       | `level(plan) ≥ level(region.minPlan)`: `{City} isn’t available on the {Plan name} plan.` |
| Service create        | region               | unknown → `Unknown region.`                                                        |
| Service settings      | name                 | ≥ 2 chars: `Name is too short`                                                     |
| Env vars              | key                  | `^[A-Z_][A-Z0-9_]*$`: `Keys must use uppercase letters, numbers and underscores.`; duplicate → `{KEY} already exists.` |
| API key               | name                 | trimmed length ≥ 2                                                                 |
| Team invite           | email, role          | valid email; role ∈ admin/developer/viewer                                         |
| Support ticket        | subject, message     | subject ≥ 4 chars, message ≥ 10 chars                                              |
| Contact form          | name, email, message | name ≥ 2, valid email, message ≥ 10                                                |
| Delete account        | confirmation         | user must type their email                                                         |
| Delete service        | confirmation         | user must type the service name (UI-side; server only needs auth + role)           |
