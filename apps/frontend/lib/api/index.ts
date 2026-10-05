/**
 * Data access layer used by every page and provider: typed calls to the DIGITALYCloud API.
 * Paths and payloads follow docs/05-api-reference.md; DTO types come from `@digitalycloud/shared`.
 */
import type {
  AdminOverviewDto,
  AdminServiceRowDto,
  AssignableTeamRole,
  BillingOperationDto,
  BillingSummaryDto,
  CatalogResponse,
  ContactInput,
  CreateServiceInput,
  CreatedApiKey,
  DeployRequest,
  DeploymentDto,
  EnvVarDto,
  EnvVarInput,
  GithubBranchDto,
  GithubConnectionDto,
  GithubRepoDto,
  InvoiceDto,
  ListResponse,
  LoginResponse,
  LogLineDto,
  MetricRange,
  MetricsResponse,
  NotificationDto,
  NotificationPreferences,
  PlanId,
  PortalSessionResponse,
  ServerDto,
  ServerLoadPoint,
  ServiceDeploymentPair,
  ServiceDto,
  SessionDto,
  SessionResponse,
  StatusResponse,
  SupportTicketDto,
  SupportTicketInput,
  TeamMemberDto,
  TeamSummaryDto,
  TeamsResponse,
  TwoFactorEnableResponse,
  TwoFactorSetupResponse,
  UpdateProfileInput,
  UpdateServiceInput,
  UploadDto,
  UsagePointDto,
  UserDto,
} from '@digitalycloud/shared';
import type { ApiKey, Deployment, Service } from '@/lib/types';
import { apiUrl, http, query, uploadFile } from './http-client';

export { ApiError, API_URL, apiUrl, errorMessage, isApiError, requestTeam, setRequestTeam } from './http-client';
export type { CreateServiceInput, EnvVarInput, UpdateServiceInput } from '@digitalycloud/shared';

/** The UI keeps `env` as an array; SSE and API-key payloads omit it. */
export const toService = (s: ServiceDto | Omit<ServiceDto, 'env'>, keepEnv: Service['env'] = []): Service => ({ ...s, env: 'env' in s && s.env ? s.env : keepEnv });

const pair = (r: ServiceDeploymentPair): { service: Service; deployment: Deployment } => ({ service: toService(r.service), deployment: r.deployment });
const enc = encodeURIComponent;

export const api = {
  auth: {
    session: async () => (await http.get<SessionResponse>('/auth/session', { scoped: false })).user,
    login: (email: string, password: string, remember: boolean) => http.post<LoginResponse>('/auth/login', { email, password, remember }, { scoped: false }),
    verifyTwoFactor: (challengeToken: string, code: string) => http.post<UserDto>('/auth/2fa/verify', { challengeToken, code }, { scoped: false }),
    /** Full-page navigation to Google; the API redirects back to `from`. */
    googleUrl: (from: string) => apiUrl('/auth/google', { from }, false),
    signup: (name: string, email: string, password: string) => http.post<UserDto>('/auth/signup', { name, email, password }, { scoped: false }),
    requestReset: (email: string) => http.post<void>('/auth/password/forgot', { email }, { scoped: false }),
    resetPassword: (token: string, password: string) => http.post<void>('/auth/password/reset', { token, password }, { scoped: false }),
    verifyEmail: (token: string) => http.post<void>('/auth/email/verify', { token }, { scoped: false }),
    resendVerification: () => http.post<void>('/auth/email/resend', {}, { scoped: false }),
    logout: () => http.post<void>('/auth/logout', {}, { scoped: false }),
  },

  account: {
    updateProfile: (patch: UpdateProfileInput) => http.patch<UserDto>('/me', patch),
    changePassword: (input: { currentPassword?: string; newPassword: string }) => http.put<void>('/me/password', input),
    sessions: async () => (await http.get<ListResponse<SessionDto>>('/me/sessions')).data,
    revokeSession: (id: string) => http.del(`/me/sessions/${enc(id)}`),
    setupTwoFactor: () => http.post<TwoFactorSetupResponse>('/me/2fa/setup'),
    enableTwoFactor: (code: string) => http.post<TwoFactorEnableResponse>('/me/2fa/enable', { code }),
    disableTwoFactor: (proof: { password: string } | { code: string }) => http.post<void>('/me/2fa/disable', proof),
    preferences: () => http.get<NotificationPreferences>('/me/notification-preferences'),
    updatePreferences: (patch: Partial<NotificationPreferences>) => http.put<NotificationPreferences>('/me/notification-preferences', patch),
    deleteAccount: (input: { confirmEmail: string; currentPassword?: string }) => http.del('/me', input),
  },

  teams: {
    list: () => http.get<TeamsResponse>('/teams', { scoped: false }),
    /** Default team for this session and for new tabs. */
    select: (teamId: string) => http.post<{ team: TeamSummaryDto }>('/teams/active', { teamId }, { scoped: false }),
    members: async () => (await http.get<ListResponse<TeamMemberDto>>('/team/members')).data,
    invite: (email: string, role: AssignableTeamRole) => http.post<TeamMemberDto>('/team/invitations', { email, role }),
    accept: (token: string) => http.post<TeamMemberDto & { team: TeamSummaryDto }>('/team/invitations/accept', { token }, { scoped: false }),
    changeRole: (id: string, role: AssignableTeamRole) => http.patch<TeamMemberDto>(`/team/members/${enc(id)}`, { role }),
    remove: (id: string) => http.del(`/team/members/${enc(id)}`),
  },

  catalog: () => http.get<CatalogResponse>('/catalog', { scoped: false }),

  services: {
    list: async () => {
      const all: Service[] = [];
      let cursor: string | null = null;
      do {
        const page: ListResponse<ServiceDto> = await http.get<ListResponse<ServiceDto>>(`/services${query({ limit: 100, cursor })}`);
        all.push(...page.data.map((s) => toService(s)));
        cursor = page.nextCursor;
      } while (cursor);
      return all;
    },
    get: async (id: string) => toService(await http.get<ServiceDto>(`/services/${enc(id)}`)),
    create: async (input: CreateServiceInput, idempotencyKey: string) => pair(await http.post<ServiceDeploymentPair>('/services', input, { headers: { 'Idempotency-Key': idempotencyKey } })),
    update: async (id: string, patch: UpdateServiceInput) => toService(await http.patch<ServiceDto>(`/services/${enc(id)}`, patch)),
    /** Plan changes are billed: may answer 402 with `details.checkoutUrl`. */
    changePlan: async (id: string, plan: PlanId) => toService(await http.post<ServiceDto>(`/services/${enc(id)}/plan`, { plan })),
    start: async (id: string) => toService(await http.post<ServiceDto>(`/services/${enc(id)}/start`)),
    stop: async (id: string) => toService(await http.post<ServiceDto>(`/services/${enc(id)}/stop`)),
    restart: async (id: string) => toService(await http.post<ServiceDto>(`/services/${enc(id)}/restart`)),
    remove: (id: string) => http.del(`/services/${enc(id)}`),
    setEnv: async (id: string, env: EnvVarInput[]) => (await http.put<{ data: EnvVarDto[] }>(`/services/${enc(id)}/env`, { env })).data,
    deploy: async (id: string, input: DeployRequest, idempotencyKey: string) => {
      const r = await http.post<{ service: ServiceDto | null; deployment: DeploymentDto }>(`/services/${enc(id)}/deploy`, input, { headers: { 'Idempotency-Key': idempotencyKey } });
      return { service: r.service ? toService(r.service) : null, deployment: r.deployment };
    },
  },

  deployments: {
    list: async (serviceId?: string) => (await http.get<ListResponse<DeploymentDto>>(`/deployments${query({ serviceId, limit: 100 })}`)).data,
    /** Includes the build log. */
    get: (id: string) => http.get<DeploymentDto>(`/deployments/${enc(id)}`),
  },

  logs: {
    history: (serviceId: string, opts: { limit?: number; before?: number } = {}) => http.get<ListResponse<LogLineDto>>(`/services/${enc(serviceId)}/logs${query(opts)}`),
    streamUrl: (serviceId: string, since?: number) => apiUrl(`/services/${enc(serviceId)}/logs/stream`, { since }),
  },

  metrics: {
    service: (serviceId: string, range: MetricRange) => http.get<MetricsResponse>(`/services/${enc(serviceId)}/metrics${query({ range })}`),
    usage: () => http.get<{ range: '24h'; intervalSec: number; data: UsagePointDto[] }>('/metrics/usage?range=24h'),
  },

  uploads: {
    create: (file: File, opts: { serviceId?: string; onProgress?: (fraction: number) => void; signal?: AbortSignal } = {}) =>
      uploadFile<UploadDto>('/uploads', file, { fields: opts.serviceId ? { serviceId: opts.serviceId } : {}, onProgress: opts.onProgress, signal: opts.signal }),
  },

  github: {
    connection: () => http.get<GithubConnectionDto>('/integrations/github'),
    /** Full-page navigation to the GitHub App installation; returns to `from?github=<result>`. */
    installUrl: (from: string) => apiUrl('/integrations/github/install', { from }),
    repos: async (q?: string) => (await http.get<ListResponse<GithubRepoDto>>(`/integrations/github/repos${query({ q })}`)).data,
    branches: async (fullName: string) => {
      const [owner, repo] = fullName.split('/');
      return (await http.get<ListResponse<GithubBranchDto>>(`/integrations/github/repos/${enc(owner ?? '')}/${enc(repo ?? '')}/branches`)).data;
    },
  },

  apiKeys: {
    list: async (): Promise<ApiKey[]> => (await http.get<ListResponse<ApiKey>>('/api-keys')).data,
    create: (name: string, scope: ApiKey['scope']) => http.post<CreatedApiKey>('/api-keys', { name, scope }),
    revoke: (id: string) => http.del(`/api-keys/${enc(id)}`),
  },

  notifications: {
    list: async () => (await http.get<ListResponse<NotificationDto>>('/notifications')).data,
    markAllRead: async () => (await http.post<ListResponse<NotificationDto>>('/notifications/read-all')).data,
  },

  billing: {
    summary: () => http.get<BillingSummaryDto>('/billing/summary'),
    invoices: async () => (await http.get<ListResponse<InvoiceDto>>('/billing/invoices')).data,
    /** Same-team download link (GET, scoped with `?team=`). */
    invoicePdfUrl: (id: string) => apiUrl(`/billing/invoices/${enc(id)}/pdf`),
    portal: () => http.post<PortalSessionResponse>('/billing/portal-session'),
    operation: (id: string) => http.get<BillingOperationDto>(`/billing/operations/${enc(id)}`),
    retryCheckout: (id: string) => http.post<{ checkoutUrl: string }>(`/billing/operations/${enc(id)}/checkout`),
    cancelOperation: (id: string) => http.post<BillingOperationDto>(`/billing/operations/${enc(id)}/cancel`),
  },

  servers: {
    list: async () => (await http.get<ListResponse<ServerDto>>('/servers')).data,
    load: async () => (await http.get<ListResponse<ServerLoadPoint>>('/servers/load?range=24h')).data,
  },

  support: {
    createTicket: (input: SupportTicketInput) => http.post<SupportTicketDto>('/support/tickets', input),
    contact: (input: ContactInput) => http.post<void>('/contact', input, { scoped: false }),
    docFeedback: (slug: string, vote: 'up' | 'down') => http.post<void>('/docs/feedback', { slug, vote }, { scoped: false }),
  },

  admin: {
    overview: () => http.get<AdminOverviewDto>('/admin/overview', { scoped: false }),
    revenue: async (range: '30d' | '90d' = '30d') => (await http.get<ListResponse<{ ts: number; mrr: number; users: number }>>(`/admin/revenue?range=${range}`, { scoped: false })).data,
    deploymentsDaily: async (range: '14d' | '30d' = '14d') => (await http.get<ListResponse<{ ts: number; success: number; failed: number }>>(`/admin/deployments/daily?range=${range}`, { scoped: false })).data,
    services: async (q?: string) => (await http.get<ListResponse<AdminServiceRowDto>>(`/admin/services${query({ q, limit: 20 })}`, { scoped: false })).data,
  },

  status: () => http.get<StatusResponse>('/status', { scoped: false }),
};

export type Api = typeof api;
