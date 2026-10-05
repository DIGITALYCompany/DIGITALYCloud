import type { ClientSession } from 'mongoose';
import { DEFAULT_NOTIFICATION_PREFERENCES, MESSAGES, nameParts, normalizeEmail } from '@digitalycloud/shared';
import { BillingAccount, Membership, Team, User, type MembershipDoc, type TeamDoc, type UserDoc } from '../../db/models';
import { conflict, isDuplicateKey } from '../../lib/errors';
import { newId } from '../../lib/ids';

export interface NewUser {
  name: string;
  email: string;
  passwordHash: string | null;
  emailVerified: boolean;
}

/**
 * Creates a user with their personal team, its owner membership, default notification preferences
 * and an empty billing account — all in the caller's transaction, so a crash can never leave a
 * user without a team or a team without an owner. Duplicate emails surface as 409.
 */
export async function createUserWithTeam(session: ClientSession, input: NewUser): Promise<{ user: UserDoc; team: TeamDoc; membership: MembershipDoc }> {
  const now = new Date();
  const userId = newId('user');
  const teamId = newId('team');
  const user: UserDoc = {
    _id: userId,
    name: input.name,
    email: input.email.trim(),
    emailNormalized: normalizeEmail(input.email),
    emailVerifiedAt: input.emailVerified ? now : null,
    pendingEmail: null,
    pendingEmailNormalized: null,
    passwordHash: input.passwordHash,
    passwordChangedAt: input.passwordHash ? now : null,
    role: 'user',
    language: 'en',
    timezone: 'Europe/Paris',
    twoFactor: { enabled: false, secretEnc: null, pendingSecretEnc: null, pendingCreatedAt: null, enabledAt: null, lastUsedStep: null, recoveryCodes: [] },
    notificationPreferences: { ...DEFAULT_NOTIFICATION_PREFERENCES },
    defaultTeamId: teamId,
    status: 'active',
    deletionRequestedAt: null,
    lastLoginAt: now,
    createdAt: now,
    updatedAt: now,
  };
  const team: TeamDoc = { _id: teamId, name: `${nameParts(input.name).firstName}’s team`, personal: true, ownerUserId: userId, status: 'active', createdAt: now, updatedAt: now };
  const membership: MembershipDoc = { _id: newId('membership'), teamId, userId, role: 'owner', invitedBy: null, invitedAt: null, joinedAt: now };
  try {
    // Sequential writes in one transaction (MongoDB transactions do not support parallel operations on one session).
    await User.create([user], { session });
    await Team.create([team], { session });
    await Membership.create([membership], { session });
    await BillingAccount.create([{ _id: teamId, status: 'none' }], { session });
  } catch (e) {
    if (isDuplicateKey(e, 'user_email_unique')) throw conflict(MESSAGES.emailTaken, 'CONFLICT', { email: MESSAGES.emailTaken });
    throw e;
  }
  return { user, team, membership };
}

export const findActiveUserByEmail = (email: string) => User.findOne({ emailNormalized: normalizeEmail(email), status: 'active' }).lean<UserDoc>();
