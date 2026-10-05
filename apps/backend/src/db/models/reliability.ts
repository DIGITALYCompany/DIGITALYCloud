import { Schema } from 'mongoose';
import { DAY_SECONDS, baseOptions, defineModel } from './common';

/**
 * Transactional outbox / durable task log. A record is written in the same transaction as the
 * change that needs a side effect. The dispatcher enqueues a BullMQ job; the job marks the record
 * completed. Records dispatched but never completed (Redis lost the job, worker crashed) are
 * dispatched again, so every consumer is idempotent.
 */
export interface OutboxDoc {
  _id: string;
  topic: string;
  payload: Record<string, unknown>;
  dedupeKey: string | null;
  status: 'pending' | 'dispatched' | 'completed' | 'dead';
  attempts: number;
  availableAt: Date;
  lockedUntil: Date | null;
  lastError: string | null;
  createdAt: Date;
  dispatchedAt: Date | null;
  completedAt: Date | null;
  expiresAt: Date | null;
}

const outboxSchema = new Schema(
  {
    _id: { type: String, required: true },
    topic: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    dedupeKey: { type: String, default: null },
    status: { type: String, enum: ['pending', 'dispatched', 'completed', 'dead'], required: true },
    attempts: { type: Number, default: 0 },
    availableAt: { type: Date, required: true },
    lockedUntil: { type: Date, default: null },
    lastError: { type: String, default: null },
    createdAt: { type: Date, required: true },
    dispatchedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
  },
  baseOptions,
);
outboxSchema.index({ status: 1, availableAt: 1 }, { name: 'outbox_status_available' });
outboxSchema.index({ dedupeKey: 1 }, { unique: true, name: 'outbox_dedupe_unique', partialFilterExpression: { dedupeKey: { $type: 'string' } } });
outboxSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'outbox_ttl' });

export const Outbox = defineModel<OutboxDoc>('Outbox', outboxSchema, 'outbox');

/** Stored responses for `Idempotency-Key` requests (24 hours). */
export interface IdempotencyRecordDoc {
  _id: string;
  requestHash: string;
  state: 'pending' | 'done';
  response: { status: number; body: unknown } | null;
  createdAt: Date;
  expiresAt: Date;
}

const idempotencySchema = new Schema(
  {
    _id: { type: String, required: true },
    requestHash: { type: String, required: true },
    state: { type: String, enum: ['pending', 'done'], required: true },
    response: { type: Schema.Types.Mixed, default: null },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  baseOptions,
);
idempotencySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'idempotency_ttl' });

export const IdempotencyRecord = defineModel<IdempotencyRecordDoc>('IdempotencyRecord', idempotencySchema, 'idempotency_records');

/** Atomic counters (`$inc`), e.g. support ticket numbers and per-service runtime log sequences. */
export interface CounterDoc {
  _id: string;
  seq: number;
}

const counterSchema = new Schema({ _id: { type: String, required: true }, seq: { type: Number, required: true } }, baseOptions);

export const Counter = defineModel<CounterDoc>('Counter', counterSchema, 'counters');

/** Security audit trail. Never contains secrets, tokens or env values. */
export interface AuditEventDoc {
  _id: string;
  action: string;
  actorUserId: string | null;
  actorApiKeyId: string | null;
  teamId: string | null;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  meta: Record<string, unknown>;
  createdAt: Date;
  expiresAt: Date;
}

const auditSchema = new Schema(
  {
    _id: { type: String, required: true },
    action: { type: String, required: true },
    actorUserId: { type: String, default: null },
    actorApiKeyId: { type: String, default: null },
    teamId: { type: String, default: null },
    targetType: { type: String, default: null },
    targetId: { type: String, default: null },
    ip: { type: String, default: null },
    meta: { type: Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  baseOptions,
);
auditSchema.index({ teamId: 1, createdAt: -1 }, { name: 'audit_team' });
auditSchema.index({ actorUserId: 1, createdAt: -1 }, { name: 'audit_actor' });
auditSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'audit_ttl' });

export const AuditEvent = defineModel<AuditEventDoc>('AuditEvent', auditSchema, 'audit_events');
export const AUDIT_RETENTION_SECONDS = 400 * DAY_SECONDS;

/** Durable account-deletion operation (`DELETE /me`), completed by a worker within 24 hours. */
export interface AccountDeletionDoc {
  _id: string;
  userId: string;
  personalTeamId: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  steps: Record<string, { status: 'pending' | 'done' | 'failed'; at: Date | null; error: string | null }>;
  requestedAt: Date;
  deadlineAt: Date;
  completedAt: Date | null;
  attempts: number;
  lastError: string | null;
}

const deletionSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    personalTeamId: { type: String, default: null },
    status: { type: String, enum: ['pending', 'running', 'completed', 'failed'], required: true },
    steps: { type: Schema.Types.Mixed, default: {} },
    requestedAt: { type: Date, required: true },
    deadlineAt: { type: Date, required: true },
    completedAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: null },
  },
  baseOptions,
);
deletionSchema.index({ userId: 1 }, { unique: true, name: 'deletion_user_unique' });
deletionSchema.index({ status: 1, deadlineAt: 1 }, { name: 'deletion_status' });

export const AccountDeletion = defineModel<AccountDeletionDoc>('AccountDeletion', deletionSchema, 'account_deletions');

/** Applied data/index migrations. */
export interface MigrationLedgerDoc {
  _id: string;
  name: string;
  checksum: string;
  appliedAt: Date;
  durationMs: number;
}

const ledgerSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    checksum: { type: String, required: true },
    appliedAt: { type: Date, required: true },
    durationMs: { type: Number, required: true },
  },
  baseOptions,
);

export const MigrationLedger = defineModel<MigrationLedgerDoc>('MigrationLedger', ledgerSchema, 'migration_ledger');
