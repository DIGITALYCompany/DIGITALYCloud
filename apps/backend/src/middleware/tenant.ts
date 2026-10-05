import type { NextFunction, Request, Response } from 'express';
import { Membership, Team, type MembershipDoc, type TeamDoc } from '../db/models';
import { forbidden, unauthenticated } from '../lib/errors';
import { PERMISSIONS, keyAllows, roleAllows, type Action, type Tenant } from '../http/principal';

export const TEAM_HEADER = 'x-team-id';
const TEAM_ID_RE = /^team_[a-z0-9]{6,32}$/;

/**
 * Picks the team for a session request: the tab's explicit `X-Team-Id` header (or `?team=` for
 * EventSource, which cannot send headers), else the session's default team, else the user's
 * personal team. Membership is always verified here; nothing is trusted from the client.
 */
export async function resolveSessionTenant(req: Request): Promise<Tenant> {
  if (req.tenant) return req.tenant;
  if (req.auth?.kind !== 'session') throw unauthenticated();
  const { user, session } = req.auth;
  const explicit = req.get(TEAM_HEADER) ?? (req.method === 'GET' && typeof req.query.team === 'string' ? req.query.team : undefined);

  if (explicit !== undefined) {
    if (!TEAM_ID_RE.test(explicit)) throw teamUnavailable();
    const t = await membershipTeam(user._id, explicit);
    if (!t) throw teamUnavailable();
    req.tenant = t;
    return t;
  }

  for (const candidate of [session.activeTeamId, user.defaultTeamId]) {
    if (!candidate) continue;
    const t = await membershipTeam(user._id, candidate);
    if (t) {
      req.tenant = t;
      return t;
    }
  }
  // Fall back to the personal team, then to the oldest membership.
  const memberships = await Membership.find({ userId: user._id }).sort({ joinedAt: 1 }).limit(50).lean<MembershipDoc[]>();
  const teams = await Team.find({ _id: { $in: memberships.map((m) => m.teamId) }, status: 'active' }).lean<TeamDoc[]>();
  const pick = teams.find((t) => t.personal && t.ownerUserId === user._id) ?? teams[0];
  if (!pick) throw forbidden('You are not a member of any team.', 'TEAM_UNAVAILABLE');
  const membership = memberships.find((m) => m.teamId === pick._id)!;
  req.tenant = { team: pick, role: membership.role, membership };
  return req.tenant;
}

async function membershipTeam(userId: string, teamId: string): Promise<Tenant | null> {
  const membership = await Membership.findOne({ teamId, userId }).lean<MembershipDoc>();
  if (!membership) return null;
  const team = await Team.findOne({ _id: teamId, status: 'active' }).lean<TeamDoc>();
  if (!team) return null;
  return { team, role: membership.role, membership };
}

const teamUnavailable = () => forbidden('You no longer have access to this team.', 'TEAM_UNAVAILABLE');

/**
 * Authorizes an action against the permission matrix and sets `req.tenant`.
 * API keys are bound to their own team; a session's team role must allow the action.
 */
export function authorize(action: Action) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) throw unauthenticated();
    if (req.auth.kind === 'apiKey') {
      if (!PERMISSIONS[action].key) throw forbidden('API keys can’t use this endpoint.', 'API_KEY_NOT_ALLOWED');
      if (!keyAllows(action, req.auth.scope)) throw forbidden('This API key is read-only.', 'INSUFFICIENT_SCOPE');
      const explicit = req.get(TEAM_HEADER);
      if (explicit !== undefined && explicit !== req.auth.teamId) throw forbidden('This API key belongs to another team.', 'TEAM_UNAVAILABLE');
      const team = await Team.findOne({ _id: req.auth.teamId, status: 'active' }).lean<TeamDoc>();
      if (!team) throw unauthenticated('Invalid API key.');
      req.tenant = { team, role: null, membership: null };
      return next();
    }
    const tenant = await resolveSessionTenant(req);
    if (!tenant.role || !roleAllows(action, tenant.role)) throw forbidden();
    next();
  };
}

export function tenantOf(req: Request): Tenant {
  if (!req.tenant) throw new Error('authorize() must run before tenantOf()');
  return req.tenant;
}
