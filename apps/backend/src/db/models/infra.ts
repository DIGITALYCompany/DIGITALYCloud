import { Schema } from 'mongoose';
import { SERVER_STATUSES, UPLOAD_FORMATS, type ServerStatus, type UploadFormat } from '@digitalycloud/shared';
import { DAY_SECONDS, baseOptions, defineModel } from './common';

// ---------------------------------------------------------------------------------------------
// Servers: runtime/build hosts. Docker endpoints and private addresses are never serialized.

export interface Resources {
  cpuMillis: number;
  memoryMb: number;
  storageMb: number;
}

export interface ServerDoc {
  _id: string;
  name: string;
  regionId: string;
  status: ServerStatus;
  roles: ('runtime' | 'build')[];
  /** False stops new placements (e.g. draining) without marking the host unhealthy. */
  acceptingWorkloads: boolean;
  /** Seeded demo record: never scheduled on and labelled in admin views. */
  demo: boolean;
  publicIp: string | null;
  /** Address the reverse proxy uses to reach published container ports. */
  privateIp: string;
  docker: {
    protocol: 'https' | 'http' | 'ssh' | 'socket';
    host: string | null;
    port: number | null;
    socketPath: string | null;
    /** Paths to PEM files on the worker host (mTLS to the Docker daemon). */
    tls: { caFile: string; certFile: string; keyFile: string } | null;
  };
  capacity: Resources;
  reserved: Resources;
  hardware: { cores: number; memoryGb: number; diskTb: number };
  capabilities: { storageQuota: boolean; ociRuntime: string | null; checkedAt: Date | null };
  bootedAt: Date | null;
  lastHeartbeatAt: Date | null;
  lastError: string | null;
  collectorLease: { owner: string; until: Date } | null;
  createdAt: Date;
  updatedAt: Date;
}

const resources = { cpuMillis: { type: Number, default: 0 }, memoryMb: { type: Number, default: 0 }, storageMb: { type: Number, default: 0 } };

const serverSchema = new Schema(
  {
    _id: { type: String, required: true, match: /^[a-z0-9][a-z0-9-]{1,40}$/ },
    name: { type: String, required: true },
    regionId: { type: String, required: true },
    status: { type: String, enum: SERVER_STATUSES, required: true },
    roles: { type: [String], enum: ['runtime', 'build'], default: ['runtime', 'build'] },
    acceptingWorkloads: { type: Boolean, default: true },
    demo: { type: Boolean, default: false },
    publicIp: { type: String, default: null },
    privateIp: { type: String, required: true },
    docker: {
      protocol: { type: String, enum: ['https', 'http', 'ssh', 'socket'], required: true },
      host: { type: String, default: null },
      port: { type: Number, default: null },
      socketPath: { type: String, default: null },
      tls: { type: new Schema({ caFile: String, certFile: String, keyFile: String }, { _id: false, strict: 'throw' }), default: null },
    },
    capacity: resources,
    reserved: resources,
    hardware: { cores: { type: Number, default: 0 }, memoryGb: { type: Number, default: 0 }, diskTb: { type: Number, default: 0 } },
    capabilities: { storageQuota: { type: Boolean, default: false }, ociRuntime: { type: String, default: null }, checkedAt: { type: Date, default: null } },
    bootedAt: { type: Date, default: null },
    lastHeartbeatAt: { type: Date, default: null },
    lastError: { type: String, default: null },
    collectorLease: { type: new Schema({ owner: String, until: Date }, { _id: false, strict: 'throw' }), default: null },
  },
  { ...baseOptions, timestamps: true },
);
serverSchema.index({ regionId: 1, status: 1 }, { name: 'server_region_status' });

export const Server = defineModel<ServerDoc>('Server', serverSchema, 'servers');

/**
 * Capacity reservations. The server document's `reserved` counters are changed with a conditional
 * `$inc` (only when the result fits `capacity`) in the same transaction as the reservation record,
 * so concurrent schedulers can never over-commit a host.
 */
export interface CapacityReservationDoc {
  _id: string;
  serverId: string;
  serviceId: string;
  deploymentId: string | null;
  kind: 'active' | 'candidate';
  cpuMillis: number;
  memoryMb: number;
  storageMb: number;
  status: 'held' | 'released';
  createdAt: Date;
  /** Candidate reservations expire if the deployment never finishes (reconciled). */
  expiresAt: Date | null;
  releasedAt: Date | null;
}

const reservationSchema = new Schema(
  {
    _id: { type: String, required: true },
    serverId: { type: String, required: true },
    serviceId: { type: String, required: true },
    deploymentId: { type: String, default: null },
    kind: { type: String, enum: ['active', 'candidate'], required: true },
    cpuMillis: { type: Number, required: true },
    memoryMb: { type: Number, required: true },
    storageMb: { type: Number, required: true },
    status: { type: String, enum: ['held', 'released'], required: true },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, default: null },
    releasedAt: { type: Date, default: null },
  },
  baseOptions,
);
reservationSchema.index({ serviceId: 1 }, { unique: true, name: 'reservation_one_active', partialFilterExpression: { status: 'held', kind: 'active' } });
reservationSchema.index({ deploymentId: 1 }, { unique: true, name: 'reservation_one_candidate', partialFilterExpression: { status: 'held', kind: 'candidate' } });
reservationSchema.index({ serverId: 1, status: 1 }, { name: 'reservation_server' });
reservationSchema.index({ status: 1, expiresAt: 1 }, { name: 'reservation_expiry' });

export const CapacityReservation = defineModel<CapacityReservationDoc>('CapacityReservation', reservationSchema, 'capacity_reservations');

export interface ServerMetricSampleDoc {
  serverId: string;
  ts: Date;
  cpu: number;
  ram: number;
  storage: number | null;
  containers: number;
}

const serverMetricSchema = new Schema(
  {
    serverId: { type: String, required: true },
    ts: { type: Date, required: true },
    cpu: { type: Number, required: true },
    ram: { type: Number, required: true },
    storage: { type: Number, default: null },
    containers: { type: Number, required: true },
  },
  baseOptions,
);
serverMetricSchema.index({ serverId: 1, ts: 1 }, { unique: true, name: 'server_metric_unique' });
serverMetricSchema.index({ ts: 1 }, { expireAfterSeconds: 30 * DAY_SECONDS, name: 'server_metric_ttl' });

export const ServerMetricSample = defineModel<ServerMetricSampleDoc>('ServerMetricSample', serverMetricSchema, 'server_metric_samples');

// ---------------------------------------------------------------------------------------------
// GitHub App installations, bound to the team whose owner/admin installed them

export interface GithubInstallationDoc {
  _id: string;
  teamId: string;
  installationId: number;
  accountLogin: string;
  accountType: 'User' | 'Organization';
  repositorySelection: 'all' | 'selected';
  suspendedAt: Date | null;
  removedAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const githubInstallationSchema = new Schema(
  {
    _id: { type: String, required: true },
    teamId: { type: String, required: true },
    installationId: { type: Number, required: true },
    accountLogin: { type: String, required: true },
    accountType: { type: String, enum: ['User', 'Organization'], required: true },
    repositorySelection: { type: String, enum: ['all', 'selected'], required: true },
    suspendedAt: { type: Date, default: null },
    removedAt: { type: Date, default: null },
    createdBy: { type: String, required: true },
  },
  { ...baseOptions, timestamps: true },
);
githubInstallationSchema.index({ installationId: 1 }, { unique: true, name: 'github_installation_unique' });
githubInstallationSchema.index({ teamId: 1 }, { name: 'github_installation_team' });

export const GithubInstallation = defineModel<GithubInstallationDoc>('GithubInstallation', githubInstallationSchema, 'github_installations');

// ---------------------------------------------------------------------------------------------
// Uploaded source archives (bytes live in object storage)

export interface UploadDoc {
  _id: string;
  teamId: string;
  createdBy: string;
  fileName: string;
  sizeBytes: number;
  format: UploadFormat;
  sha256: string;
  storageKey: string;
  status: 'ready' | 'attached' | 'deleted';
  serviceId: string | null;
  expandedBytes: number;
  fileCount: number;
  /** Single top-level folder stripped when the archive is used as a build context (e.g. `my-bot/`). */
  rootPrefix: string | null;
  createdAt: Date;
  /** Unattached uploads are deleted (object first, then record) after this date. */
  expiresAt: Date | null;
}

const uploadSchema = new Schema(
  {
    _id: { type: String, required: true },
    teamId: { type: String, required: true },
    createdBy: { type: String, required: true },
    fileName: { type: String, required: true, maxlength: 255 },
    sizeBytes: { type: Number, required: true },
    format: { type: String, enum: UPLOAD_FORMATS, required: true },
    sha256: { type: String, required: true },
    storageKey: { type: String, required: true },
    status: { type: String, enum: ['ready', 'attached', 'deleted'], required: true },
    serviceId: { type: String, default: null },
    expandedBytes: { type: Number, required: true },
    fileCount: { type: Number, required: true },
    rootPrefix: { type: String, default: null },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, default: null },
  },
  baseOptions,
);
uploadSchema.index({ teamId: 1, createdAt: -1 }, { name: 'upload_team' });
uploadSchema.index({ status: 1, expiresAt: 1 }, { name: 'upload_expiry' });
uploadSchema.index({ serviceId: 1 }, { name: 'upload_service', partialFilterExpression: { serviceId: { $type: 'string' } } });

export const Upload = defineModel<UploadDoc>('Upload', uploadSchema, 'uploads');
