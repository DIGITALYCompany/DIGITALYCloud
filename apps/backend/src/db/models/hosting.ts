import { Schema } from 'mongoose';
import {
  DEPLOY_STAGES,
  DEPLOY_TRIGGERS,
  DEPLOYMENT_STATUSES,
  LOG_LEVELS,
  PLAN_LEVELS,
  SERVICE_STATUSES,
  SERVICE_TYPE_IDS,
  SOURCE_TYPES,
  type DeployStage,
  type DeployTrigger,
  type DeploymentStatus,
  type LogLevel,
  type NodeVersion,
  type PlanId,
  type ServiceStatus,
  type ServiceType,
  type SourceType,
} from '@digitalycloud/shared';
import type { Encrypted } from '../../lib/crypto';
import { DAY_SECONDS, baseOptions, defineModel, encryptedSchema } from './common';

// ---------------------------------------------------------------------------------------------
// Services. `_id` is the public slug. Desired state is stored separately from observed state.

export interface ServiceRuntimeState {
  serverId: string;
  containerId: string;
  containerName: string;
  hostPort: number | null;
  imageRef: string;
  deploymentId: string;
  envVersion: number;
  settingsVersion: number;
  plan: PlanId;
  startedAt: Date;
}

export interface ServiceOperation {
  id: string;
  kind: 'deploy' | 'start' | 'stop' | 'restart' | 'apply_limits' | 'delete';
  generation: number;
  startedAt: Date;
  /** Reconciliation clears operations whose lease expired (crashed worker). */
  leaseUntil: Date;
}

export interface ServiceDoc {
  _id: string;
  teamId: string;
  name: string;
  nameNormalized: string;
  type: ServiceType;
  plan: PlanId;
  regionId: string;
  source: SourceType;
  repo: string;
  /** Lowercased `owner/repo` for GitHub push matching. */
  repoNormalized: string | null;
  branch: string | null;
  uploadId: string | null;
  githubInstallationId: string | null;
  nodeVersion: NodeVersion;
  startCommand: string;
  port: number | null;
  autoDeploy: boolean;
  autoRestart: boolean;
  status: ServiceStatus;
  desiredState: 'running' | 'stopped';
  lifecycle: 'active' | 'deleting';
  deploymentSeq: number;
  lastDeployAt: Date;
  activeDeploymentId: string | null;
  lastSuccessfulDeploymentId: string | null;
  startedAt: Date | null;
  storageMb: number;
  envVersion: number;
  settingsVersion: number;
  runtime: ServiceRuntimeState | null;
  /** Current upstream for HTTP services; the proxy only routes to healthy, switched-in containers. */
  route: { upstream: string; deploymentId: string; updatedAt: Date } | null;
  activeOperation: ServiceOperation | null;
  /** Incremented by every control action; stale workers compare it before committing results (fencing). */
  opGeneration: number;
  /** Latest GitHub push received while a deployment was running (coalesced, latest wins). */
  pendingPush: { sha: string; message: string; author: string; receivedAt: Date } | null;
  resourceState: { status: 'applied' | 'pending' | 'failed'; error: string | null; updatedAt: Date };
  crash: { count: number; windowStart: Date | null; lastAt: Date | null; backoffUntil: Date | null };
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletingAt: Date | null;
}

const runtimeStateSchema = new Schema(
  {
    serverId: { type: String, required: true },
    containerId: { type: String, required: true },
    containerName: { type: String, required: true },
    hostPort: { type: Number, default: null },
    imageRef: { type: String, required: true },
    deploymentId: { type: String, required: true },
    envVersion: { type: Number, required: true },
    settingsVersion: { type: Number, required: true },
    plan: { type: String, enum: PLAN_LEVELS, required: true },
    startedAt: { type: Date, required: true },
  },
  { _id: false, strict: 'throw' },
);

const serviceSchema = new Schema(
  {
    _id: { type: String, required: true, maxlength: 63 },
    teamId: { type: String, required: true },
    name: { type: String, required: true, maxlength: 32 },
    nameNormalized: { type: String, required: true, maxlength: 32 },
    type: { type: String, enum: SERVICE_TYPE_IDS, required: true, immutable: true },
    plan: { type: String, enum: PLAN_LEVELS, required: true },
    regionId: { type: String, required: true, immutable: true },
    source: { type: String, enum: SOURCE_TYPES, required: true, immutable: true },
    repo: { type: String, required: true, maxlength: 300 },
    repoNormalized: { type: String, default: null },
    branch: { type: String, default: null, maxlength: 255 },
    uploadId: { type: String, default: null },
    githubInstallationId: { type: String, default: null },
    nodeVersion: { type: String, required: true },
    startCommand: { type: String, required: true, maxlength: 1000 },
    port: { type: Number, default: null, min: 1, max: 65535 },
    autoDeploy: { type: Boolean, required: true },
    autoRestart: { type: Boolean, required: true },
    status: { type: String, enum: SERVICE_STATUSES, required: true },
    desiredState: { type: String, enum: ['running', 'stopped'], required: true },
    lifecycle: { type: String, enum: ['active', 'deleting'], default: 'active', required: true },
    deploymentSeq: { type: Number, default: 0, required: true },
    lastDeployAt: { type: Date, required: true },
    activeDeploymentId: { type: String, default: null },
    lastSuccessfulDeploymentId: { type: String, default: null },
    startedAt: { type: Date, default: null },
    storageMb: { type: Number, default: 0 },
    envVersion: { type: Number, default: 1, required: true },
    settingsVersion: { type: Number, default: 1, required: true },
    runtime: { type: runtimeStateSchema, default: null },
    route: { type: new Schema({ upstream: String, deploymentId: String, updatedAt: Date }, { _id: false, strict: 'throw' }), default: null },
    activeOperation: {
      type: new Schema(
        {
          id: { type: String, required: true },
          kind: { type: String, enum: ['deploy', 'start', 'stop', 'restart', 'apply_limits', 'delete'], required: true },
          generation: { type: Number, required: true },
          startedAt: { type: Date, required: true },
          leaseUntil: { type: Date, required: true },
        },
        { _id: false, strict: 'throw' },
      ),
      default: null,
    },
    opGeneration: { type: Number, default: 0, required: true },
    pendingPush: { type: new Schema({ sha: String, message: String, author: String, receivedAt: Date }, { _id: false, strict: 'throw' }), default: null },
    resourceState: {
      status: { type: String, enum: ['applied', 'pending', 'failed'], default: 'applied' },
      error: { type: String, default: null },
      updatedAt: { type: Date, default: () => new Date() },
    },
    crash: {
      count: { type: Number, default: 0 },
      windowStart: { type: Date, default: null },
      lastAt: { type: Date, default: null },
      backoffUntil: { type: Date, default: null },
    },
    createdBy: { type: String, default: null },
    deletingAt: { type: Date, default: null },
  },
  { ...baseOptions, timestamps: true },
);
serviceSchema.index({ teamId: 1, nameNormalized: 1 }, { unique: true, name: 'service_team_name_unique', partialFilterExpression: { lifecycle: 'active' } });
serviceSchema.index({ teamId: 1, createdAt: -1, _id: -1 }, { name: 'service_team_created' });
serviceSchema.index({ source: 1, repoNormalized: 1, branch: 1 }, { name: 'service_github_match', partialFilterExpression: { source: 'github' } });
serviceSchema.index({ githubInstallationId: 1 }, { name: 'service_github_installation', partialFilterExpression: { githubInstallationId: { $type: 'string' } } });
serviceSchema.index({ 'activeOperation.leaseUntil': 1 }, { name: 'service_operation_lease', partialFilterExpression: { 'activeOperation.leaseUntil': { $type: 'date' } } });
serviceSchema.index({ 'runtime.serverId': 1 }, { name: 'service_runtime_server', partialFilterExpression: { 'runtime.serverId': { $type: 'string' } } });
serviceSchema.index({ lifecycle: 1, deletingAt: 1 }, { name: 'service_lifecycle' });
serviceSchema.index({ status: 1 }, { name: 'service_status' });

export const Service = defineModel<ServiceDoc>('Service', serviceSchema, 'services');

/**
 * Global slug registry: one document per slug ever allocated. Active services hold `active`
 * reservations; deleted services leave a `reserved` record for 30 days so an old public URL
 * cannot be taken over. Allocation inserts here first, so the unique `_id` decides races.
 */
export interface SlugReservationDoc {
  _id: string;
  serviceId: string;
  teamId: string;
  state: 'active' | 'reserved';
  createdAt: Date;
  /** Only set for `reserved`; the TTL index removes the record afterwards. */
  expiresAt: Date | null;
}

const slugSchema = new Schema(
  {
    _id: { type: String, required: true },
    serviceId: { type: String, required: true },
    teamId: { type: String, required: true },
    state: { type: String, enum: ['active', 'reserved'], required: true },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, default: null },
  },
  baseOptions,
);
slugSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'slug_reservation_ttl' });

export const SlugReservation = defineModel<SlugReservationDoc>('SlugReservation', slugSchema, 'slug_reservations');

// ---------------------------------------------------------------------------------------------
// Environment variables, encrypted with AES-256-GCM (AAD binds service, id and key)

export interface EnvVarDoc {
  _id: string;
  serviceId: string;
  teamId: string;
  key: string;
  valueEnc: Encrypted;
  secret: boolean;
  /** Position in the list, so the saved order matches what the user sent. */
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

const envSchema = new Schema(
  {
    _id: { type: String, required: true },
    serviceId: { type: String, required: true },
    teamId: { type: String, required: true },
    key: { type: String, required: true, maxlength: 128, match: /^[A-Z_][A-Z0-9_]*$/ },
    valueEnc: { type: encryptedSchema, required: true },
    secret: { type: Boolean, required: true },
    position: { type: Number, required: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  baseOptions,
);
envSchema.index({ serviceId: 1, key: 1 }, { unique: true, name: 'env_service_key_unique' });
envSchema.index({ serviceId: 1, position: 1 }, { name: 'env_service_position' });

export const EnvVar = defineModel<EnvVarDoc>('EnvVar', envSchema, 'env_vars');

// ---------------------------------------------------------------------------------------------
// Deployments

export interface DeploymentDoc {
  _id: string;
  serviceId: string;
  teamId: string;
  number: number;
  environment: 'Production';
  status: DeploymentStatus;
  stage: DeployStage | null;
  trigger: DeployTrigger;
  commit: string;
  commitMessage: string;
  author: string;
  actor: { userId: string | null; apiKeyId: string | null };
  source: {
    type: SourceType;
    repo: string;
    branch: string | null;
    sha: string | null;
    uploadId: string | null;
    imageRef: string | null;
    archiveSha256: string | null;
  };
  /** Build-time configuration captured when the deployment was created (rollbacks reuse it). */
  config: { startCommand: string; nodeVersion: NodeVersion; port: number | null; settingsVersion: number };
  imageRef: string | null;
  imageDigest: string | null;
  rollbackOf: string | null;
  serverId: string | null;
  /** Service `opGeneration` this deployment was created under. */
  generation: number;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  durationSec: number;
  failureCode: string | null;
  failureReason: string | null;
  logLines: number;
  /** Built image retained for rollbacks until this date. */
  imageRetainedUntil: Date | null;
}

const deploymentSchema = new Schema(
  {
    _id: { type: String, required: true },
    serviceId: { type: String, required: true },
    teamId: { type: String, required: true },
    number: { type: Number, required: true, min: 1 },
    environment: { type: String, enum: ['Production'], default: 'Production', required: true },
    status: { type: String, enum: DEPLOYMENT_STATUSES, required: true },
    stage: { type: String, enum: DEPLOY_STAGES, default: null },
    trigger: { type: String, enum: DEPLOY_TRIGGERS, required: true },
    commit: { type: String, default: '', maxlength: 64 },
    commitMessage: { type: String, required: true, maxlength: 500 },
    author: { type: String, required: true, maxlength: 200 },
    actor: { userId: { type: String, default: null }, apiKeyId: { type: String, default: null } },
    source: {
      type: { type: String, enum: SOURCE_TYPES, required: true },
      repo: { type: String, required: true },
      branch: { type: String, default: null },
      sha: { type: String, default: null },
      uploadId: { type: String, default: null },
      imageRef: { type: String, default: null },
      archiveSha256: { type: String, default: null },
    },
    config: {
      startCommand: { type: String, required: true },
      nodeVersion: { type: String, required: true },
      port: { type: Number, default: null },
      settingsVersion: { type: Number, required: true },
    },
    imageRef: { type: String, default: null },
    imageDigest: { type: String, default: null },
    rollbackOf: { type: String, default: null },
    serverId: { type: String, default: null },
    generation: { type: Number, required: true },
    createdAt: { type: Date, required: true },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    durationSec: { type: Number, default: 0 },
    failureCode: { type: String, default: null },
    failureReason: { type: String, default: null, maxlength: 500 },
    logLines: { type: Number, default: 0 },
    imageRetainedUntil: { type: Date, default: null },
  },
  baseOptions,
);
deploymentSchema.index({ serviceId: 1, number: 1 }, { unique: true, name: 'deployment_service_number_unique' });
// Database-level guard: at most one building deployment per service.
deploymentSchema.index({ serviceId: 1 }, { unique: true, name: 'deployment_one_building', partialFilterExpression: { status: 'building' } });
deploymentSchema.index({ teamId: 1, createdAt: -1, _id: -1 }, { name: 'deployment_team_created' });
deploymentSchema.index({ serviceId: 1, createdAt: -1, _id: -1 }, { name: 'deployment_service_created' });
deploymentSchema.index({ status: 1, createdAt: 1 }, { name: 'deployment_status_created' });
deploymentSchema.index({ imageRetainedUntil: 1 }, { name: 'deployment_image_retention', partialFilterExpression: { imageRetainedUntil: { $type: 'date' } } });

export const Deployment = defineModel<DeploymentDoc>('Deployment', deploymentSchema, 'deployments');

export interface DeploymentLogDoc {
  deploymentId: string;
  serviceId: string;
  teamId: string;
  lineNo: number;
  text: string;
  ts: Date;
  expiresAt: Date;
}

const deploymentLogSchema = new Schema(
  {
    deploymentId: { type: String, required: true },
    serviceId: { type: String, required: true },
    teamId: { type: String, required: true },
    lineNo: { type: Number, required: true },
    text: { type: String, required: true, maxlength: 8192 },
    ts: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  baseOptions,
);
deploymentLogSchema.index({ deploymentId: 1, lineNo: 1 }, { unique: true, name: 'deployment_log_line_unique' });
deploymentLogSchema.index({ serviceId: 1 }, { name: 'deployment_log_service' });
deploymentLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'deployment_log_ttl' });

export const DeploymentLog = defineModel<DeploymentLogDoc>('DeploymentLog', deploymentLogSchema, 'deployment_logs');

// ---------------------------------------------------------------------------------------------
// Runtime logs: durable, monotonic per-service sequence numbers (the SSE/pagination cursor)

export interface RuntimeLogDoc {
  serviceId: string;
  teamId: string;
  deploymentId: string | null;
  seq: number;
  ts: Date;
  level: LogLevel;
  stream: 'stdout' | 'stderr' | 'system';
  text: string;
  expiresAt: Date;
}

const runtimeLogSchema = new Schema(
  {
    serviceId: { type: String, required: true },
    teamId: { type: String, required: true },
    deploymentId: { type: String, default: null },
    seq: { type: Number, required: true },
    ts: { type: Date, required: true },
    level: { type: String, enum: LOG_LEVELS, required: true },
    stream: { type: String, enum: ['stdout', 'stderr', 'system'], required: true },
    text: { type: String, required: true, maxlength: 8192 },
    expiresAt: { type: Date, required: true },
  },
  baseOptions,
);
runtimeLogSchema.index({ serviceId: 1, seq: 1 }, { unique: true, name: 'runtime_log_service_seq_unique' });
runtimeLogSchema.index({ serviceId: 1, ts: 1 }, { name: 'runtime_log_service_ts' });
runtimeLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'runtime_log_ttl' });

export const RuntimeLog = defineModel<RuntimeLogDoc>('RuntimeLog', runtimeLogSchema, 'runtime_logs');

// ---------------------------------------------------------------------------------------------
// One-minute metric samples (30-day retention). Units: CPU % of allocation, MB, KB/s.

export interface MetricSampleDoc {
  serviceId: string;
  teamId: string;
  ts: Date;
  cpu: number;
  ramMb: number;
  netIn: number;
  netOut: number;
  diskMb: number | null;
  vcpu: number;
  ramLimitMb: number;
  samples: number;
}

const metricSampleSchema = new Schema(
  {
    serviceId: { type: String, required: true },
    teamId: { type: String, required: true },
    ts: { type: Date, required: true },
    cpu: { type: Number, required: true },
    ramMb: { type: Number, required: true },
    netIn: { type: Number, required: true },
    netOut: { type: Number, required: true },
    diskMb: { type: Number, default: null },
    vcpu: { type: Number, required: true },
    ramLimitMb: { type: Number, required: true },
    samples: { type: Number, required: true },
  },
  baseOptions,
);
metricSampleSchema.index({ serviceId: 1, ts: 1 }, { unique: true, name: 'metric_service_ts_unique' });
metricSampleSchema.index({ teamId: 1, ts: 1 }, { name: 'metric_team_ts' });
metricSampleSchema.index({ ts: 1 }, { expireAfterSeconds: 30 * DAY_SECONDS, name: 'metric_ttl' });

export const MetricSample = defineModel<MetricSampleDoc>('MetricSample', metricSampleSchema, 'metric_samples');

/** Durable debounce for usage alerts (one per service and kind every six hours). */
export interface UsageAlertStateDoc {
  _id: string;
  serviceId: string;
  kind: 'ram' | 'storage';
  lastAlertAt: Date;
  expiresAt: Date;
}

const usageAlertSchema = new Schema(
  {
    _id: { type: String, required: true },
    serviceId: { type: String, required: true },
    kind: { type: String, enum: ['ram', 'storage'], required: true },
    lastAlertAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  baseOptions,
);
usageAlertSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'usage_alert_ttl' });

export const UsageAlertState = defineModel<UsageAlertStateDoc>('UsageAlertState', usageAlertSchema, 'usage_alert_states');

export type { Encrypted };
