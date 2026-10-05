/**
 * UI-facing types. They are the API's wire DTOs from `@digitalycloud/shared`, so the dashboard
 * cannot drift from what the backend sends.
 */
import type {
  ApiKeyDto,
  BillingOperationDto,
  BillingSummaryDto,
  DeploymentDto,
  EnvVarDto,
  InvoiceDto,
  LogLineDto,
  NotificationDto,
  ServerDto,
  ServiceDto,
  SessionDto,
  TeamMemberDto,
  TeamSummaryDto,
  UserDto,
} from '@digitalycloud/shared';

export type {
  ApiKeyScope,
  DeployStage,
  DeploymentStatus,
  LogLevel,
  MetricRange,
  NotificationPreferences,
  PlanId,
  ServiceStatus,
  ServiceType,
  SourceType,
  TeamRole,
} from '@digitalycloud/shared';

export type User = UserDto;
export type EnvVar = EnvVarDto;
/** `env` is always an array in the UI: empty until loaded, values blank when redacted for the viewer's role. */
export type Service = Omit<ServiceDto, 'env'> & { env: EnvVar[] };
export type Deployment = DeploymentDto;
export type Server = ServerDto;
export type Invoice = InvoiceDto;
export type ApiKey = ApiKeyDto;
export type Notification = NotificationDto;
export type LogLine = LogLineDto;
export type Team = TeamSummaryDto;
export type TeamMember = TeamMemberDto;
export type BrowserSession = SessionDto;
export type BillingSummary = BillingSummaryDto;
export type BillingOperation = BillingOperationDto;
