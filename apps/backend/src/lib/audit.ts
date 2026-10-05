import type { ClientSession } from 'mongoose';
import { AUDIT_RETENTION_SECONDS, AuditEvent } from '../db/models';
import { newId } from './ids';

export interface AuditInput {
  action: string;
  actorUserId?: string | null;
  actorApiKeyId?: string | null;
  teamId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  ip?: string | null;
  /** Never put secrets, tokens, passwords or env values here. */
  meta?: Record<string, unknown>;
}

/** Records a security-relevant event. Failures never break the user's request. */
export async function audit(input: AuditInput, session?: ClientSession) {
  const now = new Date();
  const doc = {
    _id: newId('audit'),
    action: input.action,
    actorUserId: input.actorUserId ?? null,
    actorApiKeyId: input.actorApiKeyId ?? null,
    teamId: input.teamId ?? null,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    ip: input.ip ?? null,
    meta: input.meta ?? {},
    createdAt: now,
    expiresAt: new Date(now.getTime() + AUDIT_RETENTION_SECONDS * 1000),
  };
  if (session) {
    await AuditEvent.create([doc], { session });
    return;
  }
  await AuditEvent.create(doc).catch(() => {});
}
