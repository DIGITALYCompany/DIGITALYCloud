import { MESSAGES, normalizeEmail, type AssignableTeamRole, type TeamMemberDto, type TeamSummaryDto } from '@digitalycloud/shared';
import { ctx } from '../../context';
import { withTransaction } from '../../db/connection';
import { ApiKey, Invitation, Membership, Session, Team, User, type InvitationDoc, type MembershipDoc, type TeamDoc, type UserDoc } from '../../db/models';
import { dispatchNow } from '../../jobs/outbox';
import { audit } from '../../lib/audit';
import { randomToken, sha256 } from '../../lib/crypto';
import { conflict, forbidden, isDuplicateKey, notFound, validation } from '../../lib/errors';
import { isId, newId } from '../../lib/ids';
import { frontendLink, queueEmail } from '../email/email.service';

export const INVITATION_TTL_MS = 7 * 24 * 3600_000;
const PURGE_AFTER_MS = 90 * 24 * 3600_000;

export async function listTeams(user: UserDoc, sessionActiveTeamId: string | null): Promise<{ data: TeamSummaryDto[]; activeTeamId: string }> {
  const memberships = await Membership.find({ userId: user._id }).sort({ joinedAt: 1 }).lean<MembershipDoc[]>();
  const teams = await Team.find({ _id: { $in: memberships.map((m) => m.teamId) }, status: 'active' }).lean<TeamDoc[]>();
  const data = memberships
    .map((m) => {
      const t = teams.find((x) => x._id === m.teamId);
      return t ? { id: t._id, name: t.name, personal: t.personal && t.ownerUserId === user._id, role: m.role } : null;
    })
    .filter((x): x is TeamSummaryDto => x !== null)
    .sort((a, b) => Number(b.personal) - Number(a.personal));
  const ids = data.map((t) => t.id);
  const activeTeamId = [sessionActiveTeamId, user.defaultTeamId].find((id): id is string => Boolean(id && ids.includes(id))) ?? data[0]?.id ?? '';
  return { data, activeTeamId };
}

/** Sets the default team for this session (new tabs) and the user. Membership is verified. */
export async function selectTeam(user: UserDoc, sessionId: string, teamId: string): Promise<TeamSummaryDto> {
  const { data } = await listTeams(user, null);
  const team = data.find((t) => t.id === teamId);
  if (!team) throw forbidden('You no longer have access to this team.', 'TEAM_UNAVAILABLE');
  await Session.updateOne({ _id: sessionId }, { $set: { activeTeamId: teamId } });
  await User.updateOne({ _id: user._id }, { $set: { defaultTeamId: teamId } });
  return team;
}

const memberDto = (m: MembershipDoc, u: Pick<UserDoc, 'name' | 'email'>): TeamMemberDto => ({
  id: m._id,
  name: u.name,
  email: u.email,
  role: m.role,
  pending: false,
  invitedAt: m.invitedAt?.getTime() ?? null,
  joinedAt: m.joinedAt.getTime(),
});

const invitationDto = (i: InvitationDoc): TeamMemberDto => ({
  id: i._id,
  name: i.email.split('@')[0] ?? i.email,
  email: i.email,
  role: i.role,
  pending: true,
  invitedAt: i.createdAt.getTime(),
  joinedAt: null,
});

export async function listMembers(teamId: string): Promise<TeamMemberDto[]> {
  const memberships = await Membership.find({ teamId }).sort({ joinedAt: 1 }).limit(500).lean<MembershipDoc[]>();
  const users = await User.find({ _id: { $in: memberships.map((m) => m.userId) } }, { name: 1, email: 1 }).lean<Pick<UserDoc, '_id' | 'name' | 'email'>[]>();
  const pending = await Invitation.find({ teamId, status: 'pending', expiresAt: { $gt: new Date() } }).sort({ createdAt: 1 }).limit(200).lean<InvitationDoc[]>();
  const order = { owner: 0, admin: 1, developer: 2, viewer: 3 } as const;
  return [
    ...memberships
      .map((m) => ({ m, u: users.find((u) => u._id === m.userId) }))
      .filter((x) => x.u)
      .sort((a, b) => order[a.m.role] - order[b.m.role])
      .map(({ m, u }) => memberDto(m, u!)),
    ...pending.map(invitationDto),
  ];
}

export async function invite(team: TeamDoc, inviter: UserDoc, input: { email: string; role: AssignableTeamRole }) {
  const emailNormalized = normalizeEmail(input.email);
  const existingUser = await User.findOne({ emailNormalized }, { _id: 1 }).lean<{ _id: string }>();
  if (existingUser && (await Membership.exists({ teamId: team._id, userId: existingUser._id }))) throw conflict('This person is already on the team.', 'CONFLICT', { email: 'Already a member.' });
  // Expired invitations no longer block a new one.
  await Invitation.updateMany({ teamId: team._id, emailNormalized, status: 'pending', expiresAt: { $lte: new Date() } }, { $set: { status: 'expired', purgeAt: new Date(Date.now() + PURGE_AFTER_MS) } });

  const token = randomToken(32);
  const now = new Date();
  const doc: InvitationDoc = {
    _id: newId('invitation'),
    teamId: team._id,
    email: input.email.trim(),
    emailNormalized,
    role: input.role,
    tokenHash: sha256(token),
    invitedBy: inviter._id,
    status: 'pending',
    createdAt: now,
    expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
    acceptedAt: null,
    acceptedBy: null,
    purgeAt: null,
  };
  let outbox: string[] = [];
  try {
    await withTransaction(async (s) => {
      await Invitation.create([doc], { session: s });
      outbox = await queueEmail(s, {
        key: `invite:${doc._id}`,
        to: doc.email,
        template: 'team_invitation',
        data: { teamName: team.name, inviterName: inviter.name, role: input.role, url: frontendLink(`/invite?token=${encodeURIComponent(token)}`) },
      });
      await audit({ action: 'team.invitation_created', actorUserId: inviter._id, teamId: team._id, targetType: 'invitation', targetId: doc._id, meta: { role: input.role } }, s);
    });
  } catch (e) {
    if (isDuplicateKey(e, 'invitation_team_email_pending_unique')) throw conflict('An invitation was already sent to this address.', 'CONFLICT', { email: 'Already invited.' });
    throw e;
  }
  await dispatchNow(ctx().queues, outbox);
  return invitationDto(doc);
}

/**
 * Accepting requires the signed-in account's *verified* email to match the invited address, so an
 * invitation link that leaks cannot be redeemed by someone else.
 */
export async function acceptInvitation(user: UserDoc, token: string) {
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(token)) throw validation(MESSAGES.invitation, 'token');
  const inv = await Invitation.findOne({ tokenHash: sha256(token), status: 'pending', expiresAt: { $gt: new Date() } }).lean<InvitationDoc>();
  if (!inv) throw validation(MESSAGES.invitation, 'token');
  if (inv.emailNormalized !== user.emailNormalized) throw forbidden(`This invitation was sent to ${inv.email}. Sign in with that account to accept it.`, 'INVITATION_EMAIL_MISMATCH');
  if (!user.emailVerifiedAt) throw forbidden('Verify your email address before joining a team.', 'EMAIL_NOT_VERIFIED');
  const team = await Team.findOne({ _id: inv.teamId, status: 'active' }).lean<TeamDoc>();
  if (!team) throw validation(MESSAGES.invitation, 'token');

  const now = new Date();
  const membership: MembershipDoc = { _id: newId('membership'), teamId: team._id, userId: user._id, role: inv.role, invitedBy: inv.invitedBy, invitedAt: inv.createdAt, joinedAt: now };
  try {
    await withTransaction(async (s) => {
      const claimed = await Invitation.updateOne(
        { _id: inv._id, status: 'pending', expiresAt: { $gt: now } },
        { $set: { status: 'accepted', acceptedAt: now, acceptedBy: user._id, purgeAt: new Date(now.getTime() + PURGE_AFTER_MS) } },
        { session: s },
      );
      if (claimed.modifiedCount !== 1) throw validation(MESSAGES.invitation, 'token');
      await Membership.create([membership], { session: s });
      await audit({ action: 'team.invitation_accepted', actorUserId: user._id, teamId: team._id, targetType: 'invitation', targetId: inv._id }, s);
    });
  } catch (e) {
    if (isDuplicateKey(e, 'membership_team_user_unique')) throw conflict('You’re already a member of this team.');
    throw e;
  }
  return { member: memberDto(membership, user), team: { id: team._id, name: team.name, personal: false, role: membership.role } satisfies TeamSummaryDto };
}

export async function changeRole(team: TeamDoc, actor: UserDoc, id: string, role: AssignableTeamRole) {
  if (isId('invitation', id)) {
    const inv = await Invitation.findOneAndUpdate({ _id: id, teamId: team._id, status: 'pending' }, { $set: { role } }).lean<InvitationDoc>();
    if (!inv) throw notFound('Member');
    return invitationDto(inv);
  }
  if (!isId('membership', id)) throw notFound('Member');
  const m = await Membership.findOne({ _id: id, teamId: team._id }).lean<MembershipDoc>();
  if (!m) throw notFound('Member');
  if (m.role === 'owner') throw forbidden('The owner’s role can’t be changed.');
  if (m.userId === actor._id) throw forbidden('You can’t change your own role.');
  const updated = await Membership.findOneAndUpdate({ _id: id, teamId: team._id, role: { $ne: 'owner' } }, { $set: { role } }).lean<MembershipDoc>();
  if (!updated) throw notFound('Member');
  const u = await User.findById(updated.userId, { name: 1, email: 1 }).lean<UserDoc>();
  await audit({ action: 'team.role_changed', actorUserId: actor._id, teamId: team._id, targetType: 'membership', targetId: id, meta: { from: m.role, to: role } });
  await ctx().hub.control(updated.userId, { type: 'membership_changed', teamId: team._id });
  return memberDto(updated, u ?? { name: 'Unknown', email: '' });
}

/**
 * Removes a member (never the owner) or cancels an invitation. API keys the removed member created
 * for this team are revoked in the same transaction, and their open streams for the team close.
 */
export async function removeMember(team: TeamDoc, actor: UserDoc, id: string) {
  if (isId('invitation', id)) {
    const res = await Invitation.updateOne({ _id: id, teamId: team._id, status: 'pending' }, { $set: { status: 'revoked', purgeAt: new Date(Date.now() + PURGE_AFTER_MS) } });
    if (res.modifiedCount !== 1) throw notFound('Member');
    await audit({ action: 'team.invitation_revoked', actorUserId: actor._id, teamId: team._id, targetType: 'invitation', targetId: id });
    return;
  }
  if (!isId('membership', id)) throw notFound('Member');
  const m = await Membership.findOne({ _id: id, teamId: team._id }).lean<MembershipDoc>();
  if (!m) throw notFound('Member');
  if (m.role === 'owner') throw forbidden('The team owner can’t be removed.');
  await withTransaction(async (s) => {
    const res = await Membership.deleteOne({ _id: id, teamId: team._id, role: { $ne: 'owner' } }, { session: s });
    if (res.deletedCount !== 1) throw notFound('Member');
    await ApiKey.updateMany({ teamId: team._id, createdBy: m.userId, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: 'member_removed' } }, { session: s });
    await Session.updateMany({ userId: m.userId, activeTeamId: team._id }, { $set: { activeTeamId: null } }, { session: s });
    await User.updateOne({ _id: m.userId, defaultTeamId: team._id }, { $set: { defaultTeamId: null } }, { session: s });
    await audit({ action: 'team.member_removed', actorUserId: actor._id, teamId: team._id, targetType: 'membership', targetId: id, meta: { userId: m.userId } }, s);
  });
  await ctx().hub.control(m.userId, { type: 'membership_changed', teamId: team._id });
}
