import { normalizeEmail } from '@digitalycloud/shared';
import { ctx } from '../../context';
import { withTransaction } from '../../db/connection';
import { AccountDeletion, ApiKey, Membership, Service, Team, User, type MembershipDoc, type SessionDoc, type TeamDoc, type UserDoc } from '../../db/models';
import { addToOutbox, dispatchNow } from '../../jobs/outbox';
import { audit } from '../../lib/audit';
import { conflict, validation } from '../../lib/errors';
import { newId } from '../../lib/ids';
import { queueEmail } from '../email/email.service';
import { revokeUserSessions } from '../auth/sessions.service';
import { requireReauth } from './account.service';

export const PURGE_DEADLINE_MS = 24 * 3600_000;

/**
 * `DELETE /me`: records a durable deletion operation and immediately denies new activity
 * (all sessions revoked, the personal team's API keys and keys the user created elsewhere revoked,
 * memberships in other teams removed). Stopping services, cancelling billing and purging data is
 * done by the `account.delete` worker, retried until complete (deadline: 24 hours).
 * Teams owned by the user other than their personal team must be handed over first.
 */
export async function deleteAccount(user: UserDoc, session: SessionDoc, input: { confirmEmail: string; currentPassword?: string }) {
  if (normalizeEmail(input.confirmEmail) !== user.emailNormalized) throw validation('Type your email address exactly to confirm.', 'confirmEmail');
  await requireReauth(user, session, input.currentPassword);
  const owned = await Team.find({ ownerUserId: user._id, status: 'active' }).lean<TeamDoc[]>();
  const blocking = owned.filter((t) => !t.personal);
  if (blocking.length) {
    throw conflict('Transfer or delete the teams you own before deleting your account.', 'TEAM_OWNERSHIP_TRANSFER_REQUIRED', undefined, { teams: blocking.map((t) => t._id) });
  }
  const personal = owned.find((t) => t.personal) ?? null;
  const now = new Date();
  let outbox: string[] = [];
  let removedFrom: string[] = [];
  let personalMembers: string[] = [];

  await withTransaction(async (s) => {
    const res = await User.updateOne({ _id: user._id, status: 'active' }, { $set: { status: 'deleting', deletionRequestedAt: now } }, { session: s });
    if (res.modifiedCount !== 1) throw conflict('This account is already being deleted.');
    await revokeUserSessions(user._id, { session: s });

    const memberships = await Membership.find({ userId: user._id }, null, { session: s }).lean<MembershipDoc[]>();
    removedFrom = memberships.filter((m) => m.teamId !== personal?._id).map((m) => m.teamId);
    if (removedFrom.length) {
      await Membership.deleteMany({ userId: user._id, teamId: { $in: removedFrom } }, { session: s });
      await ApiKey.updateMany({ teamId: { $in: removedFrom }, createdBy: user._id, revokedAt: null }, { $set: { revokedAt: now, revokedReason: 'creator_deleted' } }, { session: s });
    }
    if (personal) {
      await Team.updateOne({ _id: personal._id }, { $set: { status: 'deleting' } }, { session: s });
      await ApiKey.updateMany({ teamId: personal._id, revokedAt: null }, { $set: { revokedAt: now, revokedReason: 'account_deleted' } }, { session: s });
      await Service.updateMany({ teamId: personal._id, lifecycle: 'active' }, { $set: { desiredState: 'stopped' } }, { session: s });
      personalMembers = (await Membership.find({ teamId: personal._id, userId: { $ne: user._id } }, { userId: 1 }, { session: s }).lean<{ userId: string }[]>()).map((m) => m.userId);
    }
    const deletionId = newId('deletion');
    await AccountDeletion.create(
      [{ _id: deletionId, userId: user._id, personalTeamId: personal?._id ?? null, status: 'pending', steps: {}, requestedAt: now, deadlineAt: new Date(now.getTime() + PURGE_DEADLINE_MS), completedAt: null, attempts: 0, lastError: null }],
      { session: s },
    );
    outbox = [
      ...(await addToOutbox(s, [{ topic: 'account.delete', payload: { deletionId }, dedupeKey: `account-delete:${user._id}` }])),
      ...(await queueEmail(s, { key: `deletion:${deletionId}`, to: user.email, template: 'account_deletion', data: { name: user.name } })),
    ];
    await audit({ action: 'account.deletion_requested', actorUserId: user._id, teamId: personal?._id ?? null, meta: { removedFrom } }, s);
  });

  const hub = ctx().hub;
  await hub.control(user._id, { type: 'user_disabled' });
  for (const teamId of removedFrom) await hub.control(user._id, { type: 'membership_changed', teamId });
  if (personal) for (const memberId of personalMembers) await hub.control(memberId, { type: 'membership_changed', teamId: personal._id });
  await dispatchNow(ctx().queues, outbox);
}
