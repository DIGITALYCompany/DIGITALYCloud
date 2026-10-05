# 04 — Data models

The UI's types live in `apps/frontend/lib/types.ts`. The API must return **these exact field names** (camelCase), with timestamps as **epoch milliseconds**.
For each entity below: the existing fields (✅ already in `lib/types.ts`), the fields the backend should add (➕ **Proposed**), and who owns each value.

**Owner** column: **server** = computed or controlled by the backend, never accepted from the client. **client** = editable by the user, so validate it.

## Enums

```ts
type ServiceType      = 'discord' | 'node' | 'api' | 'worker';
type ServiceStatus    = 'running' | 'stopped' | 'deploying' | 'failed';
type PlanId           = 'free' | 'starter' | 'pro' | 'business';        // ordered: index = plan level
type SourceType       = 'github' | 'upload' | 'docker';
type DeploymentStatus = 'building' | 'success' | 'failed';
type NodeVersion      = '22 LTS' | '20 LTS' | '18';                     // lib/catalog.ts NODE_VERSIONS
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

## New entities (not in `lib/types.ts` yet, Proposed)

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

## Proposed database schema (PostgreSQL)

Conventions: `text` primary keys with prefixed random ids (`usr_`, `team_`, `dep_`, `env_`, `key_`, `ntf_`, `ses_`, `inv_`, `tkt_`, `upl_`). The exception is `services.id`, which **is** the public slug.
Store `timestamptz` and serialise it to epoch ms in the API layer. Store money in **cents**.

```sql
-- Accounts --------------------------------------------------------------------
create extension if not exists citext;

create table users (
  id                text primary key,
  name              text not null,
  email             citext not null unique,
  password_hash     text,                                -- null for Google-only accounts (argon2id)
  role              text not null default 'user' check (role in ('user','admin')),
  language          text not null default 'en' check (language in ('en','fr')),
  timezone          text not null default 'Europe/Paris',
  totp_secret_enc   bytea,                               -- null = 2FA disabled
  email_verified_at timestamptz,
  created_at        timestamptz not null default now(),
  deletion_requested_at timestamptz                      -- purge job deletes after 24 h
);

create table oauth_accounts (
  provider          text not null check (provider in ('google','github')),
  provider_user_id  text not null,
  user_id           text not null references users(id) on delete cascade,
  primary key (provider, provider_user_id)
);

create table sessions (
  id            text primary key,                        -- ses_…
  token_hash    text not null unique,                    -- sha256 of the cookie value
  user_id       text not null references users(id) on delete cascade,
  user_agent    text,
  ip            inet,
  location      text,
  remember      boolean not null default true,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  expires_at    timestamptz not null
);

create table password_reset_tokens (
  token_hash  text primary key,
  user_id     text not null references users(id) on delete cascade,
  expires_at  timestamptz not null,                      -- 1 hour
  used_at     timestamptz
);

create table notification_preferences (
  user_id         text primary key references users(id) on delete cascade,
  deploy_fail     boolean not null default true,
  deploy_success  boolean not null default false,
  crash           boolean not null default true,
  usage           boolean not null default true,
  billing         boolean not null default true,
  product         boolean not null default false
);

-- Teams (an "account" that owns services and billing) -------------------------
create table teams (
  id                  text primary key,
  name                text not null,
  stripe_customer_id  text unique,
  created_at          timestamptz not null default now()
);

create table team_members (
  team_id     text not null references teams(id) on delete cascade,
  user_id     text not null references users(id) on delete cascade,
  role        text not null check (role in ('owner','admin','developer','viewer')),
  joined_at   timestamptz not null default now(),
  primary key (team_id, user_id)
);
create unique index one_owner_per_team on team_members (team_id) where role = 'owner';

create table team_invitations (
  id          text primary key,
  team_id     text not null references teams(id) on delete cascade,
  email       citext not null,
  role        text not null check (role in ('admin','developer','viewer')),
  token_hash  text not null unique,
  invited_by  text references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,                      -- 7 days
  accepted_at timestamptz,
  unique (team_id, email)
);

-- Infrastructure ---------------------------------------------------------------
create table servers (
  id          text primary key,                          -- 'lyon-01'
  name        text not null,                             -- 'Lyon-01'
  region_id   text not null,                             -- 'lyon'
  status      text not null check (status in ('healthy','degraded','maintenance')),
  ip          inet not null,
  cores       int not null,
  memory_gb   int not null,
  disk_tb     numeric(5,1) not null,
  docker_host text not null,                             -- e.g. tcp://10.0.0.10:2376 (never exposed)
  booted_at   timestamptz
);

create table uploads (
  id           text primary key,
  team_id      text not null references teams(id) on delete cascade,
  file_name    text not null,
  size_bytes   bigint not null,
  storage_key  text not null,                            -- path in object storage
  created_at   timestamptz not null default now()
);

create table github_installations (
  id               text primary key,
  team_id          text not null references teams(id) on delete cascade,
  installation_id  bigint not null unique,
  account_login    text not null
);

-- Services ---------------------------------------------------------------------
create table services (
  id              text primary key,                      -- public slug, immutable, globally unique
  team_id         text not null references teams(id) on delete cascade,
  name            text not null,
  type            text not null check (type in ('discord','node','api','worker')),
  status          text not null check (status in ('running','stopped','deploying','failed')),
  plan            text not null check (plan in ('free','starter','pro','business')),
  region_id       text not null,
  server_id       text references servers(id),
  source          text not null check (source in ('github','upload','docker')),
  repo            text not null,
  branch          text,
  upload_id       text references uploads(id),
  github_installation_id text references github_installations(id),
  node_version    text not null default '22 LTS',
  start_command   text not null,
  port            int check (port between 1 and 65535),
  auto_deploy     boolean not null default true,
  auto_restart    boolean not null default false,
  container_id    text,                                  -- current running container (never exposed)
  storage_mb      int not null default 0,
  started_at      timestamptz,
  last_deploy_at  timestamptz,
  stripe_subscription_item_id text,
  created_at      timestamptz not null default now()
);
create unique index services_team_name on services (team_id, lower(name));

create table env_vars (
  id          text primary key,
  service_id  text not null references services(id) on delete cascade,
  key         text not null check (key ~ '^[A-Z_][A-Z0-9_]*$'),
  value_enc   bytea not null,                            -- AES-256-GCM (iv + tag + ciphertext)
  secret      boolean not null default true,
  updated_at  timestamptz not null default now(),
  unique (service_id, key)
);

create table deployments (
  id              text primary key,
  service_id      text not null references services(id) on delete cascade,
  number          int not null,
  environment     text not null default 'Production',
  status          text not null check (status in ('building','success','failed')),
  stage           text check (stage in ('preparing','pulling','installing','starting','health_check')),
  trigger         text not null check (trigger in ('initial','manual','git_push','api','rollback')),
  commit          text not null,
  commit_message  text not null,
  author          text not null,
  image_ref       text,                                  -- built image, reused for rollbacks
  rollback_of     text references deployments(id),
  created_at      timestamptz not null default now(),
  finished_at     timestamptz,
  unique (service_id, number)
);

create table deployment_logs (
  deployment_id  text not null references deployments(id) on delete cascade,
  line_no        int not null,
  text           text not null,
  primary key (deployment_id, line_no)
);

-- Time series (v1 in Postgres; move to TimescaleDB/ClickHouse/Loki when volume grows)
create table service_metrics (
  service_id  text not null references services(id) on delete cascade,
  ts          timestamptz not null,
  cpu         real not null,
  ram_mb      int not null,
  net_in      real not null,
  net_out     real not null,
  disk_mb     int not null,
  primary key (service_id, ts)
);                                                       -- 1 sample/min, keep 30 days

create table service_logs (
  service_id  text not null references services(id) on delete cascade,
  id          bigint not null,                           -- LogLine.id (monotonic per service)
  ts          timestamptz not null,
  level       text not null check (level in ('info','warn','error','success','debug')),
  text        text not null,
  primary key (service_id, id)
);                                                       -- retention by plan (free: current deployment only)

-- Account features ------------------------------------------------------------
create table api_keys (
  id            text primary key,
  team_id       text not null references teams(id) on delete cascade,
  created_by    text references users(id) on delete set null,
  name          text not null,
  prefix        text not null,                           -- first 13 chars, shown in UI
  secret_hash   text not null unique,                    -- sha256(secret)
  scope         text not null check (scope in ('read','full')),
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

create table notifications (
  id          text primary key,
  user_id     text not null references users(id) on delete cascade,
  service_id  text references services(id) on delete set null,
  kind        text not null check (kind in ('success','warning','info','error')),
  title       text not null,
  body        text not null,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index on notifications (user_id, created_at desc);

create table invoices (
  id                 text primary key,
  team_id            text not null references teams(id) on delete cascade,
  number             text not null unique,
  date               date not null,
  amount_cents       int not null,
  currency           text not null default 'EUR',
  status             text not null check (status in ('paid','pending','failed')),
  summary            text not null,                      -- -> Invoice.plan
  stripe_invoice_id  text unique,
  pdf_url            text
);

create table support_tickets (
  id          text primary key,
  number      serial unique,
  team_id     text not null references teams(id) on delete cascade,
  user_id     text not null references users(id),
  service_id  text references services(id) on delete set null,
  subject     text not null,
  priority    text not null check (priority in ('low','normal','high')),
  message     text not null,
  status      text not null default 'open' check (status in ('open','pending','closed')),
  created_at  timestamptz not null default now()
);

create table contact_messages (
  id          text primary key,
  name        text not null,
  email       citext not null,
  company     text,
  topic       text not null,
  message     text not null,
  ip          inet,
  created_at  timestamptz not null default now()
);

create table doc_feedback (
  slug        text not null,
  vote        text not null check (vote in ('up','down')),
  created_at  timestamptz not null default now()
);
```

Every user gets a **personal team** at signup (they are its `owner`). Services, API keys, billing, invoices and tickets belong to the **team**. Notifications and preferences belong to the **user**.
How the UI picks the active team (team switcher) is still open. See [08](08-roadmap-and-open-questions.md).

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
