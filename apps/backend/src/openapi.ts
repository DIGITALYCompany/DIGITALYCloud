import { ASSIGNABLE_TEAM_ROLES, CONTACT_TOPICS, DEPLOY_STAGES, DEPLOY_TRIGGERS, EVENT_NAMES, LANGUAGES, LOG_LEVELS, NOTIFICATION_KINDS, PERMISSIONS, PLAN_LEVELS, SERVER_STATUSES, SERVICE_STATUSES, SERVICE_TYPE_IDS, SOURCE_TYPES, TEAM_ROLES, TICKET_PRIORITIES, UPLOAD_FORMATS, type Action } from '@digitalycloud/shared';
import { VERSION } from './version';

/**
 * OpenAPI 3.1 description of the public HTTP API, generated into docs/openapi.json by
 * `npm run openapi`. Keep it in step with the routes when adding or changing endpoints.
 * Schemas mirror the DTOs in packages/shared/src/types.ts.
 */

type Schema = Record<string, unknown>;
const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const str = (extra: Schema = {}): Schema => ({ type: 'string', ...extra });
const num = (extra: Schema = {}): Schema => ({ type: 'number', ...extra });
const int = (extra: Schema = {}): Schema => ({ type: 'integer', ...extra });
const bool: Schema = { type: 'boolean' };
const ms: Schema = { type: 'integer', description: 'Epoch milliseconds' };
const nullable = (s: Schema): Schema => ({ anyOf: [s, { type: 'null' }] });
const enumOf = (values: readonly string[]): Schema => ({ type: 'string', enum: [...values] });
const arr = (items: Schema): Schema => ({ type: 'array', items });
const obj = (properties: Record<string, Schema>, required: string[] = Object.keys(properties), extra: Schema = {}): Schema => ({ type: 'object', properties, required, additionalProperties: false, ...extra });
const list = (item: string): Schema => obj({ data: arr(ref(item)), nextCursor: nullable(str()) });

const schemas: Record<string, Schema> = {
  Error: obj(
    {
      error: obj(
        {
          code: str({ examples: ['VALIDATION_ERROR', 'UNAUTHENTICATED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT', 'RATE_LIMITED', 'CSRF_TOKEN_INVALID', 'BILLING_UNAVAILABLE', 'PAYMENT_METHOD_REQUIRED'] }),
          message: str({ description: 'User-facing message, shown as-is by the dashboard.' }),
          fields: { type: 'object', additionalProperties: str(), description: 'Per-field validation messages.' },
        },
        ['code', 'message'],
        { additionalProperties: true, description: 'Extra details depend on the code, e.g. `checkoutUrl`/`operationId` (402), `retryAfter` (429).' }
      ),
    },
    ['error']
  ),
  User: obj({
    id: str(),
    name: str(),
    firstName: str(),
    email: str({ format: 'email' }),
    plan: { ...enumOf(PLAN_LEVELS), description: 'Highest plan in the active team (display only).' },
    role: enumOf(['user', 'admin']),
    avatarInitials: str(),
    language: enumOf(LANGUAGES),
    timezone: str({ description: 'IANA timezone' }),
    twoFactorEnabled: bool,
    emailVerified: bool,
    pendingEmail: nullable(str({ format: 'email' })),
    hasPassword: bool,
    createdAt: ms,
  }),
  TwoFactorChallenge: obj({ twoFactorRequired: { const: true }, challengeToken: str() }),
  BrowserSession: obj({ id: str(), device: str(), location: nullable(str()), current: bool, createdAt: ms, lastActiveAt: ms }),
  NotificationPreferences: obj({ deployFail: bool, deploySuccess: bool, crash: bool, usage: bool, billing: bool, product: bool }),
  TwoFactorSetup: obj({ secret: str(), otpauthUrl: str(), qrCodeDataUrl: str({ description: 'data:image/png;base64,…' }) }),
  Team: obj({ id: str(), name: str(), personal: bool, role: enumOf(TEAM_ROLES) }),
  TeamMember: obj({ id: str({ description: '`mem_…` member or `ivt_…` pending invitation' }), name: str(), email: str(), role: enumOf(TEAM_ROLES), pending: bool, invitedAt: nullable(ms), joinedAt: nullable(ms) }),
  EnvVar: obj({ id: str(), key: str(), value: str({ description: 'Empty when redacted (viewers).' }), secret: bool }),
  EnvVarInput: obj({ id: str({ description: 'Existing id to keep, or a temporary id for a new row.' }), key: str({ pattern: '^[A-Z_][A-Z0-9_]*$', maxLength: 128 }), value: str({ maxLength: 32768, description: 'May be omitted for an existing id to keep the stored value.' }), secret: bool }, ['key', 'secret']),
  PendingChanges: obj({ settings: bool, env: bool, resources: bool, resourceError: nullable(str()) }),
  Service: obj(
    {
      id: str({ description: 'Immutable public slug' }),
      name: str(),
      type: enumOf(SERVICE_TYPE_IDS),
      status: enumOf(SERVICE_STATUSES),
      cpu: num({ description: '% of the plan allocation (0 when not measured; see metricsAt)' }),
      ramMb: num(),
      ramLimitMb: int(),
      storageMb: num(),
      storageLimitMb: int(),
      metricsAt: nullable(ms),
      startedAt: nullable(ms),
      createdAt: ms,
      lastDeployAt: ms,
      region: str({ examples: ['France — Lyon'] }),
      regionId: str(),
      server: str(),
      runtime: enumOf(['Docker', 'Node.js']),
      nodeVersion: str({ examples: ['24 LTS'] }),
      startCommand: str(),
      port: nullable(int({ minimum: 1, maximum: 65535 })),
      url: nullable(str({ format: 'uri' })),
      plan: enumOf(PLAN_LEVELS),
      source: enumOf(SOURCE_TYPES),
      repo: str(),
      branch: nullable(str()),
      autoDeploy: bool,
      autoRestart: bool,
      pendingChanges: ref('PendingChanges'),
      operation: nullable(obj({ kind: enumOf(['deploy', 'start', 'stop', 'restart', 'apply_limits', 'delete']), startedAt: ms })),
      env: { ...arr(ref('EnvVar')), description: 'Session requests only; never sent to API keys or over SSE.' },
    },
    ['id', 'name', 'type', 'status', 'cpu', 'ramMb', 'ramLimitMb', 'storageMb', 'storageLimitMb', 'metricsAt', 'startedAt', 'createdAt', 'lastDeployAt', 'region', 'regionId', 'server', 'runtime', 'nodeVersion', 'startCommand', 'port', 'url', 'plan', 'source', 'repo', 'branch', 'autoDeploy', 'autoRestart', 'pendingChanges', 'operation']
  ),
  CreateServiceInput: obj(
    {
      name: str({ pattern: '^[A-Za-z][\\w-]{1,31}$' }),
      type: enumOf(SERVICE_TYPE_IDS),
      source: enumOf(SOURCE_TYPES),
      repo: str({ description: '`owner/repo` (github) or an image reference (docker); empty for uploads.' }),
      branch: nullable(str()),
      uploadId: nullable(str()),
      nodeVersion: enumOf(['24 LTS', '22 LTS']),
      startCommand: str({ maxLength: 1000 }),
      port: nullable(int({ minimum: 1, maximum: 65535 })),
      plan: enumOf(PLAN_LEVELS),
      regionId: str(),
      env: arr(ref('EnvVarInput')),
      autoDeploy: bool,
      autoRestart: bool,
    },
    ['name', 'type', 'source', 'startCommand', 'port', 'plan', 'regionId']
  ),
  UpdateServiceInput: obj({ name: str(), startCommand: str(), nodeVersion: str(), port: nullable(int()), branch: str(), autoDeploy: bool, autoRestart: bool }, []),
  Deployment: obj(
    {
      id: str(),
      serviceId: str(),
      number: int(),
      environment: enumOf(['Production', 'Preview']),
      status: enumOf(['building', 'success', 'failed']),
      stage: nullable(enumOf(DEPLOY_STAGES)),
      trigger: enumOf(DEPLOY_TRIGGERS),
      createdAt: ms,
      finishedAt: nullable(ms),
      commit: str(),
      commitMessage: str(),
      author: str(),
      durationSec: int(),
      rollbackOf: nullable(str()),
      failureReason: nullable(str()),
      logs: { ...arr(str()), description: 'Build log; only on GET /deployments/{id}.' },
    },
    ['id', 'serviceId', 'number', 'environment', 'status', 'stage', 'trigger', 'createdAt', 'finishedAt', 'commit', 'commitMessage', 'author', 'durationSec', 'rollbackOf', 'failureReason']
  ),
  ServiceDeploymentPair: obj({ service: ref('Service'), deployment: ref('Deployment') }),
  LogLine: obj({ id: int(), ts: ms, level: enumOf(LOG_LEVELS), text: str() }),
  MetricPoint: obj({ ts: ms, cpu: nullable(num({ description: '%' })), ram: nullable(num({ description: 'MB' })), netIn: nullable(num({ description: 'KB/s' })), netOut: nullable(num({ description: 'KB/s' })), disk: nullable(num({ description: 'MB' })) }),
  Metrics: obj({ range: enumOf(['live', '24h', '7d', '30d']), intervalSec: int(), data: arr(ref('MetricPoint')) }),
  UsagePoint: obj({ ts: ms, cpu: nullable(num()), ram: nullable(num()) }),
  ApiKey: obj({ id: str(), name: str(), prefix: str(), createdAt: ms, lastUsed: nullable(ms), scope: enumOf(['read', 'full']) }),
  CreatedApiKey: obj({ key: ref('ApiKey'), secret: str({ description: 'Shown once: `dgc_live_…`' }) }),
  Notification: obj({ id: str(), title: str(), body: str(), time: ms, read: bool, kind: enumOf(NOTIFICATION_KINDS), serviceId: nullable(str()) }),
  BillingSummary: obj({
    status: enumOf(['none', 'active', 'past_due', 'canceled']),
    currency: { const: 'EUR' },
    monthlyTotal: num({ description: 'Euros' }),
    nextBillingDate: nullable(str({ format: 'date' })),
    periodStart: nullable(str({ format: 'date' })),
    periodEnd: nullable(str({ format: 'date' })),
    paymentMethod: nullable(obj({ brand: str(), last4: str(), expMonth: int(), expYear: int() })),
    billingAvailable: bool,
  }),
  Invoice: obj({ id: str(), number: str(), date: str({ format: 'date' }), amount: num({ description: 'Euros' }), status: enumOf(['paid', 'pending', 'failed']), plan: str(), pdfUrl: nullable(str()) }),
  BillingOperation: obj({
    id: str(),
    kind: enumOf(['create_service', 'change_plan']),
    status: enumOf(['awaiting_payment', 'processing', 'completed', 'failed', 'canceled', 'expired']),
    serviceId: nullable(str()),
    serviceName: nullable(str()),
    plan: enumOf(PLAN_LEVELS),
    checkoutUrl: nullable(str({ description: 'Owner only, while payment is outstanding.' })),
    message: nullable(str()),
    createdAt: ms,
    expiresAt: ms,
  }),
  Upload: obj({ id: str(), fileName: str(), sizeBytes: int(), format: enumOf(UPLOAD_FORMATS), createdAt: ms, expiresAt: nullable(ms) }),
  GithubConnection: obj({ connected: bool, configured: bool, accounts: arr(obj({ login: str(), installationId: int() })) }),
  GithubRepo: obj({ fullName: str(), defaultBranch: str(), private: bool }),
  GithubBranch: obj({ name: str() }),
  SupportTicketInput: obj({ subject: str({ minLength: 4, maxLength: 200 }), serviceId: nullable(str()), priority: enumOf(TICKET_PRIORITIES), message: str({ minLength: 10, maxLength: 10000 }) }, ['subject', 'message']),
  SupportTicket: obj({ id: str(), number: int(), subject: str(), serviceId: nullable(str()), priority: enumOf(TICKET_PRIORITIES), message: str(), status: enumOf(['open', 'pending', 'closed']), createdAt: ms }),
  ContactInput: obj({ name: str(), email: str({ format: 'email' }), company: str(), topic: enumOf(CONTACT_TOPICS), message: str({ minLength: 10 }), website: str({ description: 'Honeypot: must stay empty.' }) }, ['name', 'email', 'topic', 'message']),
  Plan: obj({ id: enumOf(PLAN_LEVELS), name: str(), price: num(), priceCents: int(), ramMb: int(), vcpu: num(), storageGb: int(), features: arr(str()), popular: bool }, ['id', 'name', 'price', 'priceCents', 'ramMb', 'vcpu', 'storageGb', 'features']),
  Region: obj({ id: str(), city: str(), country: str(), countryCode: str(), area: str(), code: str(), minPlan: enumOf(PLAN_LEVELS), latencyMs: int(), lat: num(), lon: num(), desc: str(), available: bool }),
  Catalog: obj({
    plans: { type: 'object', properties: Object.fromEntries(SERVICE_TYPE_IDS.map((t) => [t, arr(ref('Plan'))])), required: [...SERVICE_TYPE_IDS] },
    regions: arr(ref('Region')),
    nodeVersions: arr(str()),
    legacyNodeVersions: arr(str()),
    uploadLimits: obj({ defaultBytes: int(), largeBytes: int() }),
    paidPlansAvailable: bool,
  }),
  Server: obj({
    id: str(),
    name: str(),
    status: enumOf(SERVER_STATUSES),
    cpu: nullable(num()),
    ram: nullable(num()),
    storage: nullable(num()),
    containers: nullable(int()),
    region: str(),
    regionId: str(),
    country: str(),
    ip: nullable(str({ description: 'Public display address, if published' })),
    cores: int(),
    memoryGb: num(),
    diskTb: num(),
    uptimeDays: nullable(int()),
    sampledAt: nullable(ms),
  }),
  ServerLoadPoint: { type: 'object', properties: { ts: ms }, required: ['ts'], additionalProperties: nullable(num()), description: 'Average CPU % per region id.' },
  StatusComponent: obj({ name: str(), desc: str(), uptime: nullable(num()), state: enumOf(['ok', 'maintenance', 'degraded', 'outage', 'unknown']), events: arr(obj({ daysAgo: int(), state: enumOf(['maintenance', 'degraded', 'outage']), note: str() })) }),
  Status: obj({
    overallUptime: nullable(num()),
    current: enumOf(['ok', 'maintenance', 'degraded', 'outage', 'unknown']),
    groups: arr(obj({ name: str(), components: arr(ref('StatusComponent')) })),
    maintenance: nullable(obj({ title: str(), window: str(), body: str(), affected: arr(str()) })),
    incidents: arr(obj({ date: str(), title: str(), impact: enumOf(['minor', 'major', 'maintenance']), duration: str(), affected: arr(str()), updates: arr(obj({ time: str(), stage: str(), text: str() })) })),
    history: arr(obj({ ts: ms, uptime: nullable(num()), latency: nullable(num()) })),
    observedSince: nullable(ms),
  }),
  AdminOverview: obj({
    totalUsers: int(),
    newUsersThisMonth: int(),
    activeServices: int(),
    runningPct: nullable(num()),
    serversOnline: int(),
    serversTotal: int(),
    serversInMaintenance: arr(str()),
    mrr: num(),
    mrrChangePct: nullable(num()),
    cpuAvg: nullable(num()),
    ramAvg: nullable(num()),
    deployments14d: int(),
    failedDeployments14d: int(),
    failureRatePct: nullable(num()),
    deadLetterTasks: int(),
    overdueAccountDeletions: int(),
  }),
  AdminServiceRow: obj({ id: str(), name: str(), owner: str(), type: enumOf(SERVICE_TYPE_IDS), server: str(), cpu: num(), ramMb: num(), plan: enumOf(PLAN_LEVELS), status: enumOf(SERVICE_STATUSES) }),
  // Server-Sent Events payloads (GET /events)
  ServiceMetricsEvent: obj({ serviceId: str(), ts: ms, cpu: num(), ramMb: num(), netIn: num(), netOut: num(), storageMb: num() }),
  DeploymentLogEvent: obj({ deploymentId: str(), lineNo: int(), text: str() }),
};

for (const name of ['Service', 'Deployment', 'LogLine', 'ApiKey', 'Notification', 'Invoice', 'TeamMember', 'BrowserSession', 'GithubRepo', 'GithubBranch', 'Server', 'ServerLoadPoint', 'AdminServiceRow']) schemas[`${name}List`] = list(name);

// ---------------------------------------------------------------------------------------------

type Auth = 'public' | 'session' | 'any' | 'staff' | 'signature' | 'internal';
interface Op {
  summary: string;
  tag: string;
  auth: Auth;
  /** Permission action (team role + API-key scope), from packages/shared/src/permissions.ts. */
  action?: Action;
  params?: Schema[];
  body?: Schema | { multipart: Schema };
  ok: { status: number; schema?: Schema; description?: string; contentType?: string };
  errors?: number[];
  description?: string;
  idempotent?: boolean;
}

const P = {
  id: { name: 'id', in: 'path', required: true, schema: str() },
  team: { name: 'X-Team-Id', in: 'header', required: false, schema: str(), description: 'Team for this request (session principals). Defaults to the session’s active team.' },
  teamQuery: { name: 'team', in: 'query', required: false, schema: str(), description: 'Team scope for GET/EventSource requests that cannot send headers.' },
  limit: (max: number) => ({ name: 'limit', in: 'query', required: false, schema: int({ minimum: 1, maximum: max }) }),
  cursor: { name: 'cursor', in: 'query', required: false, schema: str() },
  idempotency: { name: 'Idempotency-Key', in: 'header', required: false, schema: str({ pattern: '^[A-Za-z0-9._-]{8,100}$' }), description: 'Replays the first response for 24 h; a different body with the same key is 422.' },
  q: (name: string, schema: Schema, description?: string) => ({ name, in: 'query', required: false, schema, ...(description ? { description } : {}) }),
};

const sse = (description: string) => ({ status: 200, contentType: 'text/event-stream', schema: str(), description });

const ops: Record<string, Record<string, Op>> = {
  '/health': { get: { summary: 'Liveness', tag: 'Platform', auth: 'public', ok: { status: 200, schema: obj({ status: { const: 'ok' }, version: str(), time: ms }) } } },
  '/health/ready': { get: { summary: 'Readiness (MongoDB, Redis, migrations, indexes, capabilities)', tag: 'Platform', auth: 'public', ok: { status: 200, schema: obj({ status: str() }) }, errors: [503] } },
  '/catalog': { get: { summary: 'Plans, regions with live availability, Node versions, upload limits', tag: 'Platform', auth: 'public', ok: { status: 200, schema: ref('Catalog') } } },

  '/auth/csrf': { get: { summary: 'Issue the CSRF cookie and header token', tag: 'Auth', auth: 'public', ok: { status: 200, schema: obj({ csrfToken: str() }) }, description: 'Sets the HttpOnly `dgc_csrf` cookie. Unsafe cookie-authenticated requests send the token as `X-CSRF-Token`.' } },
  '/auth/session': { get: { summary: 'Current user (or null)', tag: 'Auth', auth: 'public', ok: { status: 200, schema: obj({ user: nullable(ref('User')) }) } } },
  '/auth/signup': { post: { summary: 'Create an account (and a personal team)', tag: 'Auth', auth: 'public', body: obj({ name: str({ minLength: 2, maxLength: 100 }), email: str({ format: 'email' }), password: str({ minLength: 8, maxLength: 256 }) }), ok: { status: 201, schema: ref('User'), description: 'Sets `dgc_session` (30 days).' }, errors: [400, 409, 429] } },
  '/auth/login': {
    post: {
      summary: 'Sign in with email and password',
      tag: 'Auth',
      auth: 'public',
      body: obj({ email: str({ format: 'email' }), password: str(), remember: bool }, ['email', 'password']),
      ok: { status: 200, schema: { oneOf: [ref('User'), ref('TwoFactorChallenge')] }, description: 'Sets `dgc_session` unless a second factor is required.' },
      errors: [400, 401, 429],
    },
  },
  '/auth/2fa/verify': { post: { summary: 'Complete sign-in with a TOTP or recovery code', tag: 'Auth', auth: 'public', body: obj({ challengeToken: str(), code: str() }), ok: { status: 200, schema: ref('User') }, errors: [400, 401, 429] } },
  '/auth/password/forgot': { post: { summary: 'Email a password reset link (always 204)', tag: 'Auth', auth: 'public', body: obj({ email: str({ format: 'email' }) }), ok: { status: 204 }, errors: [400, 429] } },
  '/auth/password/reset': { post: { summary: 'Set a new password from a reset link (signs out every session)', tag: 'Auth', auth: 'public', body: obj({ token: str(), password: str({ minLength: 8 }) }), ok: { status: 204 }, errors: [400, 429] } },
  '/auth/email/verify': { post: { summary: 'Confirm an email address from its link', tag: 'Auth', auth: 'public', body: obj({ token: str() }), ok: { status: 204 }, errors: [400, 429] } },
  '/auth/email/resend': { post: { summary: 'Resend the verification email', tag: 'Auth', auth: 'session', ok: { status: 204 }, errors: [401, 429] } },
  '/auth/logout': { post: { summary: 'Sign out (revokes the session)', tag: 'Auth', auth: 'public', ok: { status: 204 } } },
  '/auth/google': { get: { summary: 'Start Google sign-in (browser navigation)', tag: 'Auth', auth: 'public', params: [P.q('from', str(), 'Same-site path to return to')], ok: { status: 302, description: 'Redirect to Google, or back to /login?error=… when unavailable.' } } },
  '/auth/google/callback': { get: { summary: 'Google OIDC callback (browser navigation)', tag: 'Auth', auth: 'public', ok: { status: 302, description: 'Redirect to `from`, to `/login?error=<code>`, or to `/login#challenge=<token>` when 2FA is on.' } } },

  '/me': {
    patch: { summary: 'Update profile (email changes need the current password and confirmation)', tag: 'Account', auth: 'session', body: obj({ name: str(), email: str({ format: 'email' }), language: enumOf(LANGUAGES), timezone: str(), currentPassword: str() }, []), ok: { status: 200, schema: ref('User') }, errors: [400, 401, 403, 409] },
    delete: { summary: 'Delete the account (asynchronous cleanup, access ends now)', tag: 'Account', auth: 'session', body: obj({ confirmEmail: str(), currentPassword: str() }, ['confirmEmail']), ok: { status: 202 }, errors: [400, 401, 403] },
  },
  '/me/password': { put: { summary: 'Change (or set) the password; signs out other sessions', tag: 'Account', auth: 'session', body: obj({ currentPassword: str(), newPassword: str({ minLength: 8 }) }, ['newPassword']), ok: { status: 204 }, errors: [400, 401, 403] } },
  '/me/sessions': { get: { summary: 'Signed-in devices', tag: 'Account', auth: 'session', ok: { status: 200, schema: ref('BrowserSessionList') } } },
  '/me/sessions/{id}': { delete: { summary: 'Sign out another device', tag: 'Account', auth: 'session', params: [P.id], ok: { status: 204 }, errors: [404] } },
  '/me/2fa/setup': { post: { summary: 'Start TOTP setup (pending secret + QR code)', tag: 'Account', auth: 'session', ok: { status: 200, schema: ref('TwoFactorSetup') } } },
  '/me/2fa/enable': { post: { summary: 'Confirm TOTP with a first code; returns recovery codes once', tag: 'Account', auth: 'session', body: obj({ code: str() }), ok: { status: 200, schema: obj({ recoveryCodes: arr(str()) }) }, errors: [400, 401] } },
  '/me/2fa/disable': { post: { summary: 'Turn off TOTP (password or code)', tag: 'Account', auth: 'session', body: { oneOf: [obj({ password: str() }), obj({ code: str() })] }, ok: { status: 204 }, errors: [400, 401] } },
  '/me/notification-preferences': {
    get: { summary: 'Email notification preferences', tag: 'Account', auth: 'session', ok: { status: 200, schema: ref('NotificationPreferences') } },
    put: { summary: 'Update some preferences', tag: 'Account', auth: 'session', body: { ...ref('NotificationPreferences'), description: 'Any subset of the keys.' }, ok: { status: 200, schema: ref('NotificationPreferences') } },
  },

  '/teams': { get: { summary: 'Teams of the signed-in user and the session default', tag: 'Teams', auth: 'session', ok: { status: 200, schema: obj({ data: arr(ref('Team')), activeTeamId: str() }) } } },
  '/teams/active': { post: { summary: 'Set the session default team (new tabs)', tag: 'Teams', auth: 'session', body: obj({ teamId: str() }), ok: { status: 200, schema: obj({ team: ref('Team') }) }, errors: [403] } },
  '/team/members': { get: { summary: 'Members and pending invitations', tag: 'Teams', auth: 'session', action: 'team.read', params: [P.team], ok: { status: 200, schema: ref('TeamMemberList') } } },
  '/team/invitations': { post: { summary: 'Invite by email', tag: 'Teams', auth: 'session', action: 'team.manage', params: [P.team], body: obj({ email: str({ format: 'email' }), role: enumOf(ASSIGNABLE_TEAM_ROLES) }), ok: { status: 201, schema: ref('TeamMember') }, errors: [400, 403, 409, 429] } },
  '/team/invitations/accept': { post: { summary: 'Accept an invitation (verified matching email required)', tag: 'Teams', auth: 'session', body: obj({ token: str() }), ok: { status: 200, schema: { allOf: [ref('TeamMember'), obj({ team: ref('Team') }, ['team'], { additionalProperties: true })] } }, errors: [400, 403] } },
  '/team/members/{id}': {
    patch: { summary: 'Change a member’s role', tag: 'Teams', auth: 'session', action: 'team.manage', params: [P.id, P.team], body: obj({ role: enumOf(ASSIGNABLE_TEAM_ROLES) }), ok: { status: 200, schema: ref('TeamMember') }, errors: [403, 404] },
    delete: { summary: 'Remove a member (revokes their API keys) or revoke an invitation', tag: 'Teams', auth: 'session', action: 'team.manage', params: [P.id, P.team], ok: { status: 204 }, errors: [403, 404] },
  },

  '/services': {
    get: { summary: 'List services', tag: 'Services', auth: 'any', action: 'services.read', params: [P.team, P.limit(100), P.cursor], ok: { status: 200, schema: ref('ServiceList') } },
    post: { summary: 'Create a service and its first deployment', tag: 'Services', auth: 'session', action: 'services.create', idempotent: true, params: [P.team, P.idempotency], body: ref('CreateServiceInput'), ok: { status: 201, schema: ref('ServiceDeploymentPair') }, errors: [400, 402, 403, 409, 503], description: 'Paid plans charge the prorated amount now; without a card the owner gets `402` with `checkoutUrl` and `operationId`, and the service is created after payment.' },
  },
  '/services/{id}': {
    get: { summary: 'Get a service', tag: 'Services', auth: 'any', action: 'services.read', params: [P.id, P.team], ok: { status: 200, schema: ref('Service') }, errors: [404] },
    patch: { summary: 'Update settings (applied by the next deployment)', tag: 'Services', auth: 'any', action: 'services.update', params: [P.id, P.team], body: ref('UpdateServiceInput'), ok: { status: 200, schema: ref('Service') }, errors: [400, 403, 404, 409] },
    delete: { summary: 'Delete (asynchronous purge; slug reserved 30 days)', tag: 'Services', auth: 'session', action: 'services.delete', params: [P.id, P.team], ok: { status: 204 }, errors: [403, 404] },
  },
  '/services/{id}/start': { post: { summary: 'Start', tag: 'Services', auth: 'any', action: 'services.control', params: [P.id, P.team], ok: { status: 200, schema: ref('Service'), description: 'Answers when the worker finished, or with `operation` still set.' }, errors: [403, 404, 409] } },
  '/services/{id}/stop': { post: { summary: 'Stop', tag: 'Services', auth: 'any', action: 'services.control', params: [P.id, P.team], ok: { status: 200, schema: ref('Service') }, errors: [403, 404, 409] } },
  '/services/{id}/restart': { post: { summary: 'Restart (recreates the container so env changes apply)', tag: 'Services', auth: 'any', action: 'services.control', params: [P.id, P.team], ok: { status: 200, schema: ref('Service') }, errors: [403, 404, 409] } },
  '/services/{id}/plan': { post: { summary: 'Change the plan (billed)', tag: 'Services', auth: 'session', action: 'services.plan', params: [P.id, P.team], body: obj({ plan: enumOf(PLAN_LEVELS) }), ok: { status: 200, schema: ref('Service') }, errors: [400, 402, 403, 404, 409, 503] } },
  '/services/{id}/env': { put: { summary: 'Replace environment variables', tag: 'Services', auth: 'any', action: 'services.env.write', params: [P.id, P.team], body: obj({ env: arr(ref('EnvVarInput')) }), ok: { status: 200, schema: obj({ data: arr(ref('EnvVar')) }), description: 'API keys get keys only (values blank).' }, errors: [400, 403, 404] } },
  '/services/{id}/deploy': {
    post: {
      summary: 'Deploy (latest source, a previous deployment, or a new upload)',
      tag: 'Deployments',
      auth: 'any',
      action: 'services.control',
      idempotent: true,
      params: [P.id, P.team, P.idempotency],
      body: { oneOf: [obj({}, []), obj({ deploymentId: str() }), obj({ uploadId: str() })] },
      ok: { status: 202, schema: obj({ service: nullable(ref('Service')), deployment: ref('Deployment') }) },
      errors: [400, 403, 404, 409],
    },
  },
  '/deployments': { get: { summary: 'Deployments, newest first (without logs)', tag: 'Deployments', auth: 'any', action: 'deployments.read', params: [P.team, P.q('serviceId', str()), P.limit(100), P.cursor], ok: { status: 200, schema: ref('DeploymentList') } } },
  '/deployments/{id}': { get: { summary: 'Deployment with its build log', tag: 'Deployments', auth: 'any', action: 'deployments.read', params: [P.id, P.team], ok: { status: 200, schema: ref('Deployment') }, errors: [404] } },

  '/services/{id}/logs': {
    get: { summary: 'Runtime log history (plan retention)', tag: 'Observability', auth: 'any', action: 'logs.read', params: [P.id, P.team, P.limit(1000), P.q('before', int(), 'Line id cursor'), P.q('level', str(), 'Comma-separated levels'), P.q('q', str(), 'Text search')], ok: { status: 200, schema: ref('LogLineList') } },
  },
  '/services/{id}/logs/stream': {
    get: { summary: 'Live runtime logs (SSE)', tag: 'Observability', auth: 'session', action: 'logs.stream', params: [P.id, P.teamQuery, P.q('since', int(), 'Resume after this line id')], ok: sse('Events: `log` (LogLine, id = line id), `logs.reset` (cursor too old; stream restarts from the latest 200 lines), `stream.revoked`.') },
  },
  '/services/{id}/metrics': { get: { summary: 'Metric history; null buckets are gaps', tag: 'Observability', auth: 'any', action: 'metrics.read', params: [P.id, P.team, P.q('range', enumOf(['live', '24h', '7d', '30d']))], ok: { status: 200, schema: ref('Metrics') } } },
  '/metrics/usage': { get: { summary: 'Team usage over 24 h (capacity-weighted)', tag: 'Observability', auth: 'session', action: 'metrics.usage', params: [P.team, P.q('range', enumOf(['24h']))], ok: { status: 200, schema: obj({ range: { const: '24h' }, intervalSec: int(), data: arr(ref('UsagePoint')) }) } } },
  '/events': {
    get: {
      summary: 'Real-time events for the team (SSE, one per tab)',
      tag: 'Observability',
      auth: 'session',
      action: 'events.stream',
      params: [P.teamQuery, { name: 'Last-Event-ID', in: 'header', required: false, schema: str(), description: 'Sent by browsers on reconnect; the server replays missed events.' }],
      ok: sse(`Events: ${EVENT_NAMES.map((e) => `\`${e}\``).join(', ')} (payloads: Service without env, ServiceMetricsEvent, Deployment, DeploymentLogEvent, Notification, \`{ id }\` for deletions) and control events \`stream.resync\` (reload state) and \`stream.revoked\`. \`service.metrics\` is live-only and may be dropped under backpressure.`),
    },
  },

  '/api-keys': {
    get: { summary: 'API keys of the team', tag: 'API keys', auth: 'session', action: 'apiKeys.manage', params: [P.team], ok: { status: 200, schema: ref('ApiKeyList') } },
    post: { summary: 'Create a key (secret returned once)', tag: 'API keys', auth: 'session', action: 'apiKeys.manage', params: [P.team], body: obj({ name: str({ minLength: 2, maxLength: 80 }), scope: enumOf(['read', 'full']) }), ok: { status: 201, schema: ref('CreatedApiKey') }, errors: [400, 403] },
  },
  '/api-keys/{id}': { delete: { summary: 'Revoke a key (immediate)', tag: 'API keys', auth: 'session', action: 'apiKeys.manage', params: [P.id, P.team], ok: { status: 204 }, errors: [404] } },
  '/notifications': { get: { summary: 'Notifications of the signed-in user', tag: 'Account', auth: 'session', params: [P.limit(100)], ok: { status: 200, schema: ref('NotificationList') } } },
  '/notifications/read-all': { post: { summary: 'Mark all as read', tag: 'Account', auth: 'session', ok: { status: 200, schema: ref('NotificationList') } } },

  '/billing/summary': { get: { summary: 'Billing summary', tag: 'Billing', auth: 'session', action: 'billing.manage', params: [P.team], ok: { status: 200, schema: ref('BillingSummary') } } },
  '/billing/invoices': { get: { summary: 'Invoices', tag: 'Billing', auth: 'session', action: 'billing.manage', params: [P.team], ok: { status: 200, schema: ref('InvoiceList') } } },
  '/billing/invoices/{id}/pdf': { get: { summary: 'Invoice PDF (provider document)', tag: 'Billing', auth: 'session', action: 'billing.manage', params: [P.id, P.teamQuery], ok: { status: 200, contentType: 'application/pdf', schema: str({ format: 'binary' }) }, errors: [404] } },
  '/billing/portal-session': { post: { summary: 'Payment portal URL', tag: 'Billing', auth: 'session', action: 'billing.manage', params: [P.team], ok: { status: 200, schema: obj({ url: str() }) }, errors: [503] } },
  '/billing/operations/{id}': { get: { summary: 'Status of a paid change (checkout return)', tag: 'Billing', auth: 'session', action: 'billing.operations', params: [P.id, P.team], ok: { status: 200, schema: ref('BillingOperation') }, errors: [404] } },
  '/billing/operations/{id}/checkout': { post: { summary: 'Reopen or recreate the checkout', tag: 'Billing', auth: 'session', action: 'billing.manage', params: [P.id, P.team], ok: { status: 200, schema: obj({ checkoutUrl: str() }) }, errors: [409] } },
  '/billing/operations/{id}/cancel': { post: { summary: 'Cancel a change waiting for payment', tag: 'Billing', auth: 'session', action: 'billing.operations', params: [P.id, P.team], ok: { status: 200, schema: ref('BillingOperation') }, errors: [409] } },

  '/uploads': { post: { summary: 'Upload a source archive (multipart field `file`, optional `serviceId` first)', tag: 'Sources', auth: 'session', action: 'uploads.create', params: [P.team], body: { multipart: obj({ serviceId: str(), file: str({ format: 'binary' }) }, ['file']) }, ok: { status: 201, schema: ref('Upload') }, errors: [400, 403, 413, 429] } },
  '/integrations/github': { get: { summary: 'GitHub connection of the team', tag: 'Sources', auth: 'session', action: 'github.manage', params: [P.team], ok: { status: 200, schema: ref('GithubConnection') } } },
  '/integrations/github/install': { get: { summary: 'Install the GitHub App (browser navigation)', tag: 'Sources', auth: 'session', action: 'github.manage', params: [P.teamQuery, P.q('from', str())], ok: { status: 302, description: 'To GitHub; returns to `from?github=connected|unverified|other_team|unavailable|error`.' } } },
  '/integrations/github/callback': { get: { summary: 'GitHub App setup callback (browser navigation)', tag: 'Sources', auth: 'public', ok: { status: 302 } } },
  '/integrations/github/repos': { get: { summary: 'Repositories visible to the installation', tag: 'Sources', auth: 'session', action: 'github.manage', params: [P.team, P.q('q', str())], ok: { status: 200, schema: ref('GithubRepoList') } } },
  '/integrations/github/repos/{owner}/{repo}/branches': {
    get: { summary: 'Branches of a repository', tag: 'Sources', auth: 'session', action: 'github.manage', params: [{ name: 'owner', in: 'path', required: true, schema: str() }, { name: 'repo', in: 'path', required: true, schema: str() }, P.team], ok: { status: 200, schema: ref('GithubBranchList') }, errors: [404] },
  },

  '/support/tickets': { post: { summary: 'Open a support ticket', tag: 'Support', auth: 'session', action: 'support.create', params: [P.team], body: ref('SupportTicketInput'), ok: { status: 201, schema: ref('SupportTicket') }, errors: [400] } },
  '/contact': { post: { summary: 'Contact form', tag: 'Support', auth: 'public', body: ref('ContactInput'), ok: { status: 202 }, errors: [400, 429] } },
  '/docs/feedback': { post: { summary: 'Docs article feedback', tag: 'Support', auth: 'public', body: obj({ slug: str(), vote: enumOf(['up', 'down']) }), ok: { status: 204 }, errors: [400, 429] } },
  '/servers': { get: { summary: 'Platform servers (no private details)', tag: 'Platform', auth: 'session', action: 'servers.read', params: [P.team], ok: { status: 200, schema: ref('ServerList') } } },
  '/servers/load': { get: { summary: 'Hourly CPU per region, 24 h', tag: 'Platform', auth: 'session', action: 'servers.read', params: [P.team, P.q('range', enumOf(['24h']))], ok: { status: 200, schema: ref('ServerLoadPointList') } } },
  '/status': { get: { summary: 'Public status page data (observations and published incidents only)', tag: 'Platform', auth: 'public', ok: { status: 200, schema: ref('Status') } } },
  '/admin/overview': { get: { summary: 'Platform statistics', tag: 'Staff', auth: 'staff', ok: { status: 200, schema: ref('AdminOverview') }, errors: [403] } },
  '/admin/revenue': { get: { summary: 'MRR and users per day', tag: 'Staff', auth: 'staff', params: [P.q('range', enumOf(['30d', '90d']))], ok: { status: 200, schema: obj({ data: arr(obj({ ts: ms, mrr: num(), users: int() })), nextCursor: { type: 'null' } }) }, errors: [403] } },
  '/admin/deployments/daily': { get: { summary: 'Deployments per day', tag: 'Staff', auth: 'staff', params: [P.q('range', enumOf(['14d', '30d']))], ok: { status: 200, schema: obj({ data: arr(obj({ ts: ms, success: int(), failed: int() })), nextCursor: { type: 'null' } }) }, errors: [403] } },
  '/admin/services': { get: { summary: 'Top services by usage', tag: 'Staff', auth: 'staff', params: [P.q('q', str()), P.q('sort', enumOf(['cpu', 'ram', 'created'])), P.limit(100)], ok: { status: 200, schema: ref('AdminServiceRowList') }, errors: [403] } },

  '/webhooks/github': { post: { summary: 'GitHub App webhook', tag: 'Webhooks', auth: 'signature', body: { type: 'object' }, ok: { status: 202, schema: obj({ received: bool }), description: 'Stored once per delivery id and processed asynchronously; 200 for a repeated delivery, 204 for `ping`.' }, errors: [400, 401] } },
  '/webhooks/stripe': { post: { summary: 'Stripe webhook', tag: 'Webhooks', auth: 'signature', body: { type: 'object' }, ok: { status: 200, schema: obj({ received: bool, duplicate: bool }) }, errors: [400, 503] } },
};

const SECURITY: Record<Auth, unknown[]> = {
  public: [],
  session: [{ session: [] }],
  any: [{ session: [] }, { apiKey: [] }],
  staff: [{ session: [] }],
  signature: [],
  internal: [],
};

const STATUS_TEXT: Record<number, string> = { 400: 'Validation error', 401: 'Not signed in / invalid key', 402: 'Payment required', 403: 'Forbidden (role, scope, CSRF, team)', 404: 'Not found', 409: 'Conflict', 413: 'Too large', 422: 'Idempotency mismatch', 429: 'Rate limited (Retry-After)', 503: 'Unavailable / not configured' };

function permission(action: Action | undefined, auth: Auth) {
  if (auth === 'staff') return { platformStaff: true };
  if (!action) return undefined;
  const p = PERMISSIONS[action];
  return { action, roles: [...p.roles], apiKeyScope: p.key };
}

export function buildOpenApi() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [path, methods] of Object.entries(ops)) {
    paths[path] = {};
    for (const [method, op] of Object.entries(methods)) {
      const unsafe = method !== 'get';
      const errors = new Set([...(op.errors ?? []), ...(op.auth === 'session' || op.auth === 'any' || op.auth === 'staff' ? [401] : []), ...(op.action ? [403] : []), 429]);
      const content = op.ok.contentType ?? 'application/json';
      paths[path][method] = {
        summary: op.summary,
        ...(op.description ? { description: op.description } : {}),
        tags: [op.tag],
        security: SECURITY[op.auth],
        ...(permission(op.action, op.auth) ? { 'x-permission': permission(op.action, op.auth) } : {}),
        ...(unsafe && (op.auth === 'session' || op.auth === 'any' || op.auth === 'staff') ? { 'x-csrf': 'Cookie-authenticated calls need Origin + X-CSRF-Token; bearer keys are exempt.' } : {}),
        ...(op.params ? { parameters: op.params } : {}),
        ...(op.body
          ? {
              requestBody: {
                required: true,
                content: 'multipart' in op.body ? { 'multipart/form-data': { schema: op.body.multipart } } : { 'application/json': { schema: op.body } },
              },
            }
          : {}),
        responses: {
          [String(op.ok.status)]: { description: op.ok.description ?? 'OK', ...(op.ok.schema ? { content: { [content]: { schema: op.ok.schema } } } : {}) },
          ...Object.fromEntries([...errors].sort().map((s) => [String(s), { description: STATUS_TEXT[s] ?? 'Error', content: { 'application/json': { schema: ref('Error') } } }])),
        },
      };
    }
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'DIGITALYCloud API',
      version: VERSION,
      description:
        'Hosting for Discord bots, Node.js apps, APIs and workers. All paths are relative to `/v1`. Timestamps are epoch milliseconds, dates `YYYY-MM-DD`, money in euros (integer cents internally). Errors: `{ "error": { "code", "message", "fields?" } }`. Session principals pick the team with `X-Team-Id` (or `?team=` on GET/EventSource); API keys are bound to one team. `x-permission` lists the team roles and the minimum API-key scope for each operation (null: API keys not accepted).',
    },
    servers: [{ url: 'https://api.cloud.digitaly.fr/v1' }, { url: 'http://localhost:4000/v1' }],
    tags: ['Platform', 'Auth', 'Account', 'Teams', 'Services', 'Deployments', 'Observability', 'API keys', 'Billing', 'Sources', 'Support', 'Staff', 'Webhooks'].map((name) => ({ name })),
    components: {
      securitySchemes: {
        session: { type: 'apiKey', in: 'cookie', name: 'dgc_session', description: 'HttpOnly session cookie set by signup/login. Unsafe requests also need `X-CSRF-Token` (see GET /auth/csrf) and an allowed Origin.' },
        apiKey: { type: 'http', scheme: 'bearer', description: '`Authorization: Bearer dgc_live_…` — team-bound, scope `read` or `full`, 120 requests/min.' },
      },
      schemas,
    },
    paths,
  };
}

