import type {
  ApiKeyScope,
  AssignableTeamRole,
  BillingOperationKind,
  BillingOperationStatus,
  BillingStatus,
  ContactTopic,
  DeployStage,
  DeployTrigger,
  DeploymentStatus,
  InvoiceStatus,
  Language,
  LogLevel,
  MetricRange,
  NotificationKind,
  PlanId,
  PlatformRole,
  ServerStatus,
  ServiceStatus,
  ServiceType,
  SourceType,
  TeamRole,
  TicketPriority,
  TicketStatus,
  UploadFormat,
} from './enums';
import type { NodeVersion, Plan, Region } from './catalog';

/**
 * Wire DTOs: exactly what the API sends and accepts. Timestamps are epoch milliseconds,
 * calendar dates are `YYYY-MM-DD`, money is euros (integer cents internally).
 */

export interface ListResponse<T> {
  data: T[];
  nextCursor: string | null;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
    [detail: string]: unknown;
  };
}

// ---------------------------------------------------------------------------------------------
// Identity

export interface UserDto {
  id: string;
  name: string;
  firstName: string;
  email: string;
  /** Compatibility only: the highest plan in the active team. Never used for authorization or billing. */
  plan: PlanId;
  role: PlatformRole;
  avatarInitials: string;
  language: Language;
  timezone: string;
  twoFactorEnabled: boolean;
  emailVerified: boolean;
  /** New address awaiting verification after an email change, else null. */
  pendingEmail: string | null;
  /** False for Google-only accounts that have not set a password yet. */
  hasPassword: boolean;
  createdAt: number;
}

export interface SessionResponse {
  user: UserDto | null;
}

export interface TwoFactorChallenge {
  twoFactorRequired: true;
  challengeToken: string;
}

export type LoginResponse = UserDto | TwoFactorChallenge;

export interface CsrfResponse {
  csrfToken: string;
}

export interface SessionDto {
  id: string;
  device: string;
  location: string | null;
  current: boolean;
  createdAt: number;
  lastActiveAt: number;
}

export interface NotificationPreferences {
  deployFail: boolean;
  deploySuccess: boolean;
  crash: boolean;
  usage: boolean;
  billing: boolean;
  product: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  deployFail: true,
  deploySuccess: false,
  crash: true,
  usage: true,
  billing: true,
  product: false,
};

export interface TwoFactorSetupResponse {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

export interface TwoFactorEnableResponse {
  recoveryCodes: string[];
}

export interface UpdateProfileInput {
  name?: string;
  email?: string;
  language?: Language;
  timezone?: string;
  /** Required with `email` when the account has a password. */
  currentPassword?: string;
}

// ---------------------------------------------------------------------------------------------
// Teams

export interface TeamSummaryDto {
  id: string;
  name: string;
  personal: boolean;
  role: TeamRole;
}

export interface TeamsResponse {
  data: TeamSummaryDto[];
  /** The session's default team; tabs may still scope requests to another team they belong to. */
  activeTeamId: string;
}

export interface TeamMemberDto {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  pending: boolean;
  invitedAt: number | null;
  joinedAt: number | null;
}

export interface InviteInput {
  email: string;
  role: AssignableTeamRole;
}

// ---------------------------------------------------------------------------------------------
// Services

export interface EnvVarDto {
  id: string;
  key: string;
  /** Empty string when redacted (Viewer role, API-key responses). */
  value: string;
  secret: boolean;
}

export interface EnvVarInput {
  /** Existing id to keep, or a temporary client id for a new row. */
  id?: string;
  key: string;
  /** May be omitted only for an existing `id`, which keeps the stored value. */
  value?: string;
  secret: boolean;
}

export interface PendingChanges {
  /** Settings saved after the running deployment; applied by the next deployment. */
  settings: boolean;
  /** Environment saved after the running container started; applied by the next start/restart/deploy. */
  env: boolean;
  /** Plan limits not yet applied to the runtime (pending or failed update). */
  resources: boolean;
  /** Human-readable reason when applying resources failed. */
  resourceError: string | null;
}

export interface ServiceDto {
  id: string;
  name: string;
  type: ServiceType;
  status: ServiceStatus;
  cpu: number;
  ramMb: number;
  ramLimitMb: number;
  storageMb: number;
  storageLimitMb: number;
  /** When the latest live sample was taken; null means no measurement (cpu/ramMb are then 0, not measured zeros). */
  metricsAt: number | null;
  startedAt: number | null;
  createdAt: number;
  lastDeployAt: number;
  region: string;
  regionId: string;
  server: string;
  runtime: 'Docker' | 'Node.js';
  nodeVersion: NodeVersion;
  startCommand: string;
  port: number | null;
  url: string | null;
  plan: PlanId;
  source: SourceType;
  repo: string;
  branch: string | null;
  autoDeploy: boolean;
  autoRestart: boolean;
  pendingChanges: PendingChanges;
  /** A start/stop/restart/deploy/delete in progress (runtime work happens in workers), else null. */
  operation: { kind: ServiceOperationKind; startedAt: number } | null;
  /** Present for session requests only; omitted for API keys and SSE payloads. */
  env?: EnvVarDto[];
}

export type ServiceOperationKind = 'deploy' | 'start' | 'stop' | 'restart' | 'apply_limits' | 'delete';

export interface CreateServiceInput {
  name: string;
  type: ServiceType;
  source: SourceType;
  repo: string;
  branch: string | null;
  uploadId: string | null;
  nodeVersion: NodeVersion;
  startCommand: string;
  port: number | null;
  plan: PlanId;
  regionId: string;
  env: EnvVarInput[];
  autoDeploy?: boolean;
  autoRestart?: boolean;
}

export interface UpdateServiceInput {
  name?: string;
  startCommand?: string;
  nodeVersion?: NodeVersion;
  port?: number | null;
  branch?: string;
  autoDeploy?: boolean;
  autoRestart?: boolean;
}

export interface ServiceDeploymentPair {
  service: ServiceDto;
  deployment: DeploymentDto;
}

export type DeployRequest = Record<string, never> | { deploymentId: string } | { uploadId: string };

// ---------------------------------------------------------------------------------------------
// Deployments, logs, metrics

export interface DeploymentDto {
  id: string;
  serviceId: string;
  number: number;
  environment: 'Production' | 'Preview';
  status: DeploymentStatus;
  stage: DeployStage | null;
  trigger: DeployTrigger;
  createdAt: number;
  finishedAt: number | null;
  commit: string;
  commitMessage: string;
  author: string;
  durationSec: number;
  rollbackOf: string | null;
  /** Short reason when the deployment failed. */
  failureReason: string | null;
  /** Build log lines; only on `GET /deployments/:id`. */
  logs?: string[];
}

export interface LogLineDto {
  id: number;
  ts: number;
  level: LogLevel;
  text: string;
}

export interface MetricPointDto {
  ts: number;
  /** Null when no sample exists for the bucket (a gap, not a measured zero). */
  cpu: number | null;
  ram: number | null;
  netIn: number | null;
  netOut: number | null;
  disk: number | null;
}

export interface MetricsResponse {
  range: MetricRange;
  intervalSec: number;
  data: MetricPointDto[];
}

export interface UsagePointDto {
  ts: number;
  cpu: number | null;
  ram: number | null;
}

// ---------------------------------------------------------------------------------------------
// Real-time events (`GET /events`)

export const EVENT_NAMES = [
  'service.updated',
  'service.deleted',
  'service.metrics',
  'deployment.created',
  'deployment.updated',
  'deployment.log',
  'notification.created',
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

export interface ServiceMetricsEvent {
  serviceId: string;
  ts: number;
  cpu: number;
  ramMb: number;
  netIn: number;
  netOut: number;
  storageMb: number;
}

export interface DeploymentLogEvent {
  deploymentId: string;
  lineNo: number;
  text: string;
}

export interface EventPayloads {
  'service.updated': Omit<ServiceDto, 'env'>;
  'service.deleted': { id: string };
  'service.metrics': ServiceMetricsEvent;
  'deployment.created': DeploymentDto;
  'deployment.updated': DeploymentDto;
  'deployment.log': DeploymentLogEvent;
  'notification.created': NotificationDto;
}

/** Control events the stream sends besides the documented data events. */
export const CONTROL_EVENTS = {
  /** Replay was impossible (cursor too old); reload state from the JSON endpoints. */
  resync: 'stream.resync',
  /** The stream was closed because access was lost (signed out, removed from team). */
  revoked: 'stream.revoked',
} as const;

// ---------------------------------------------------------------------------------------------
// Account features

export interface ApiKeyDto {
  id: string;
  name: string;
  prefix: string;
  createdAt: number;
  lastUsed: number | null;
  scope: ApiKeyScope;
}

export interface CreatedApiKey {
  key: ApiKeyDto;
  secret: string;
}

export interface NotificationDto {
  id: string;
  title: string;
  body: string;
  time: number;
  read: boolean;
  kind: NotificationKind;
  serviceId: string | null;
}

// ---------------------------------------------------------------------------------------------
// Billing

export interface PaymentMethodSummary {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export interface BillingSummaryDto {
  status: BillingStatus;
  currency: 'EUR';
  /** Sum of the team's current service plan prices, in euros. */
  monthlyTotal: number;
  /** Null for free-only teams: no subscription, so no billing date. */
  nextBillingDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  paymentMethod: PaymentMethodSummary | null;
  /** False when billing is not configured on this deployment; paid plans are then unavailable. */
  billingAvailable: boolean;
}

export interface InvoiceDto {
  id: string;
  number: string;
  date: string;
  amount: number;
  status: InvoiceStatus;
  plan: string;
  pdfUrl: string | null;
}

export interface BillingOperationDto {
  id: string;
  kind: BillingOperationKind;
  status: BillingOperationStatus;
  serviceId: string | null;
  serviceName: string | null;
  plan: PlanId;
  /** Present for the team owner while payment is outstanding. */
  checkoutUrl: string | null;
  message: string | null;
  createdAt: number;
  expiresAt: number;
}

export interface PortalSessionResponse {
  url: string;
}

// ---------------------------------------------------------------------------------------------
// Sources

export interface UploadDto {
  id: string;
  fileName: string;
  sizeBytes: number;
  format: UploadFormat;
  createdAt: number;
  expiresAt: number | null;
}

export interface GithubConnectionDto {
  connected: boolean;
  configured: boolean;
  accounts: { login: string; installationId: number }[];
}

export interface GithubRepoDto {
  fullName: string;
  defaultBranch: string;
  private: boolean;
}

export interface GithubBranchDto {
  name: string;
}

// ---------------------------------------------------------------------------------------------
// Support and public forms

export interface SupportTicketDto {
  id: string;
  number: number;
  subject: string;
  serviceId: string | null;
  priority: TicketPriority;
  message: string;
  status: TicketStatus;
  createdAt: number;
}

export interface SupportTicketInput {
  subject: string;
  serviceId: string | null;
  priority: TicketPriority;
  message: string;
}

export interface ContactInput {
  name: string;
  email: string;
  company?: string;
  topic: ContactTopic;
  message: string;
  /** Honeypot: must stay empty. */
  website?: string;
}

// ---------------------------------------------------------------------------------------------
// Catalog, infrastructure, status, admin

export interface CatalogRegionDto extends Region {
  /** A configured, healthy server with free capacity exists in this region. */
  available: boolean;
}

export interface CatalogResponse {
  plans: Record<ServiceType, Plan[]>;
  regions: CatalogRegionDto[];
  nodeVersions: NodeVersion[];
  legacyNodeVersions: NodeVersion[];
  uploadLimits: { defaultBytes: number; largeBytes: number };
  paidPlansAvailable: boolean;
}

export interface ServerDto {
  id: string;
  name: string;
  status: ServerStatus;
  /** Latest utilisation in %, or null when no recent sample exists. */
  cpu: number | null;
  ram: number | null;
  storage: number | null;
  containers: number | null;
  region: string;
  regionId: string;
  country: string;
  /** Public display address, if the operator chose to publish one. */
  ip: string | null;
  cores: number;
  memoryGb: number;
  diskTb: number;
  uptimeDays: number | null;
  sampledAt: number | null;
}

export interface ServerLoadPoint {
  ts: number;
  [regionId: string]: number | null;
}

export type DayState = 'ok' | 'maintenance' | 'degraded' | 'outage';

export interface StatusComponentDto {
  name: string;
  desc: string;
  /** Null when there are no observations for the window. */
  uptime: number | null;
  state: DayState | 'unknown';
  events: { daysAgo: number; state: Exclude<DayState, 'ok'>; note: string }[];
}

export interface StatusResponse {
  overallUptime: number | null;
  current: DayState | 'unknown';
  groups: { name: string; components: StatusComponentDto[] }[];
  maintenance: { title: string; window: string; body: string; affected: string[] } | null;
  incidents: {
    date: string;
    title: string;
    impact: 'minor' | 'major' | 'maintenance';
    duration: string;
    affected: string[];
    updates: { time: string; stage: string; text: string }[];
  }[];
  history: { ts: number; uptime: number | null; latency: number | null }[];
  observedSince: number | null;
}

export interface AdminOverviewDto {
  totalUsers: number;
  newUsersThisMonth: number;
  activeServices: number;
  runningPct: number | null;
  serversOnline: number;
  serversTotal: number;
  serversInMaintenance: string[];
  mrr: number;
  /** Null when there is no snapshot from the previous month to compare with. */
  mrrChangePct: number | null;
  cpuAvg: number | null;
  ramAvg: number | null;
  deployments14d: number;
  failedDeployments14d: number;
  failureRatePct: number | null;
  deadLetterTasks: number;
  overdueAccountDeletions: number;
}

export interface AdminServiceRowDto {
  id: string;
  name: string;
  owner: string;
  type: ServiceType;
  server: string;
  cpu: number;
  ramMb: number;
  plan: PlanId;
  status: ServiceStatus;
}
