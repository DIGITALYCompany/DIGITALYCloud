import { Schema } from 'mongoose';
import { ASSIGNABLE_TEAM_ROLES, TEAM_ROLES, type AssignableTeamRole, type TeamRole } from '@digitalycloud/shared';
import { baseOptions, defineModel } from './common';

export interface TeamDoc {
  _id: string;
  name: string;
  personal: boolean;
  ownerUserId: string;
  status: 'active' | 'deleting' | 'deleted';
  createdAt: Date;
  updatedAt: Date;
}

const teamSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, maxlength: 120 },
    personal: { type: Boolean, required: true },
    ownerUserId: { type: String, required: true },
    status: { type: String, enum: ['active', 'deleting', 'deleted'], default: 'active', required: true },
  },
  { ...baseOptions, timestamps: true },
);
teamSchema.index({ ownerUserId: 1 }, { name: 'team_owner' });
teamSchema.index({ status: 1 }, { name: 'team_status' });

export const Team = defineModel<TeamDoc>('Team', teamSchema, 'teams');

/**
 * Team memberships. `(teamId, userId)` is unique and a partial unique index allows at most one
 * owner per team. "Exactly one owner" is maintained by the transactional workflows that create
 * teams (signup) and remove members (owners can never be removed or demoted).
 */
export interface MembershipDoc {
  _id: string;
  teamId: string;
  userId: string;
  role: TeamRole;
  invitedBy: string | null;
  invitedAt: Date | null;
  joinedAt: Date;
}

const membershipSchema = new Schema(
  {
    _id: { type: String, required: true },
    teamId: { type: String, required: true },
    userId: { type: String, required: true },
    role: { type: String, enum: TEAM_ROLES, required: true },
    invitedBy: { type: String, default: null },
    invitedAt: { type: Date, default: null },
    joinedAt: { type: Date, required: true },
  },
  baseOptions,
);
membershipSchema.index({ teamId: 1, userId: 1 }, { unique: true, name: 'membership_team_user_unique' });
membershipSchema.index({ teamId: 1 }, { unique: true, name: 'membership_one_owner', partialFilterExpression: { role: 'owner' } });
membershipSchema.index({ userId: 1, joinedAt: 1 }, { name: 'membership_user' });

export const Membership = defineModel<MembershipDoc>('Membership', membershipSchema, 'memberships');

export interface InvitationDoc {
  _id: string;
  teamId: string;
  email: string;
  emailNormalized: string;
  role: AssignableTeamRole;
  tokenHash: string;
  invitedBy: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  acceptedBy: string | null;
  /** Terminal invitations are deleted by TTL after 90 days. */
  purgeAt: Date | null;
}

const invitationSchema = new Schema(
  {
    _id: { type: String, required: true },
    teamId: { type: String, required: true },
    email: { type: String, required: true },
    emailNormalized: { type: String, required: true },
    role: { type: String, enum: ASSIGNABLE_TEAM_ROLES, required: true },
    tokenHash: { type: String, required: true },
    invitedBy: { type: String, required: true },
    status: { type: String, enum: ['pending', 'accepted', 'revoked', 'expired'], required: true },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    acceptedAt: { type: Date, default: null },
    acceptedBy: { type: String, default: null },
    purgeAt: { type: Date, default: null },
  },
  baseOptions,
);
invitationSchema.index({ tokenHash: 1 }, { unique: true, name: 'invitation_token_unique' });
invitationSchema.index({ teamId: 1, emailNormalized: 1 }, { unique: true, name: 'invitation_team_email_pending_unique', partialFilterExpression: { status: 'pending' } });
invitationSchema.index({ teamId: 1, createdAt: -1, _id: -1 }, { name: 'invitation_team' });
invitationSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0, name: 'invitation_purge_ttl' });

export const Invitation = defineModel<InvitationDoc>('Invitation', invitationSchema, 'invitations');
