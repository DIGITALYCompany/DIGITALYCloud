/** Enumerations shared by the API contract. Arrays are the source of truth; types derive from them. */

export const SERVICE_TYPE_IDS = ['discord', 'node', 'api', 'worker'] as const;
export type ServiceType = (typeof SERVICE_TYPE_IDS)[number];

export const SERVICE_STATUSES = ['running', 'stopped', 'deploying', 'failed'] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

/** Ordered: the index is the plan level. */
export const PLAN_LEVELS = ['free', 'starter', 'pro', 'business'] as const;
export type PlanId = (typeof PLAN_LEVELS)[number];

export const SOURCE_TYPES = ['github', 'upload', 'docker'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const DEPLOYMENT_STATUSES = ['building', 'success', 'failed'] as const;
export type DeploymentStatus = (typeof DEPLOYMENT_STATUSES)[number];

export const DEPLOY_STAGES = ['preparing', 'pulling', 'installing', 'starting', 'health_check'] as const;
export type DeployStage = (typeof DEPLOY_STAGES)[number];

export const DEPLOY_TRIGGERS = ['initial', 'manual', 'git_push', 'api', 'rollback'] as const;
export type DeployTrigger = (typeof DEPLOY_TRIGGERS)[number];

export const API_KEY_SCOPES = ['read', 'full'] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export const NOTIFICATION_KINDS = ['success', 'warning', 'info', 'error'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const LOG_LEVELS = ['info', 'warn', 'error', 'success', 'debug'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export const PLATFORM_ROLES = ['user', 'admin'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const TEAM_ROLES = ['owner', 'admin', 'developer', 'viewer'] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];
/** Roles that can be granted through invitations or role changes (ownership is never assigned this way). */
export const ASSIGNABLE_TEAM_ROLES = ['admin', 'developer', 'viewer'] as const;
export type AssignableTeamRole = (typeof ASSIGNABLE_TEAM_ROLES)[number];

export const SERVER_STATUSES = ['healthy', 'degraded', 'maintenance', 'offline'] as const;
export type ServerStatus = (typeof SERVER_STATUSES)[number];

export const INVOICE_STATUSES = ['paid', 'pending', 'failed'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** `none` = the team has no paid subscription (free-only teams never need a card). */
export const BILLING_STATUSES = ['none', 'active', 'past_due', 'canceled'] as const;
export type BillingStatus = (typeof BILLING_STATUSES)[number];

export const BILLING_OPERATION_KINDS = ['create_service', 'change_plan'] as const;
export type BillingOperationKind = (typeof BILLING_OPERATION_KINDS)[number];

export const BILLING_OPERATION_STATUSES = ['awaiting_payment', 'processing', 'completed', 'failed', 'canceled', 'expired'] as const;
export type BillingOperationStatus = (typeof BILLING_OPERATION_STATUSES)[number];

export const TICKET_PRIORITIES = ['low', 'normal', 'high'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_STATUSES = ['open', 'pending', 'closed'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const CONTACT_TOPICS = ['Sales & dedicated resources', 'Technical question', 'Billing', 'Partnership', 'Press'] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

export const LANGUAGES = ['en', 'fr'] as const;
export type Language = (typeof LANGUAGES)[number];

export const METRIC_RANGES = ['live', '24h', '7d', '30d'] as const;
export type MetricRange = (typeof METRIC_RANGES)[number];

export const UPLOAD_FORMATS = ['zip', 'tar', 'tar.gz'] as const;
export type UploadFormat = (typeof UPLOAD_FORMATS)[number];
