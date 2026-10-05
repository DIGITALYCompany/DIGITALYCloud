import { Router } from 'express';
import { z } from 'zod';
import { ASSIGNABLE_TEAM_ROLES, MESSAGES, isValidEmail } from '@digitalycloud/shared';
import { jsonSmall } from '../../http/body';
import { body, str } from '../../http/validate';
import { requireSession, sessionUser } from '../../middleware/authenticate';
import { consume } from '../../middleware/rate-limit';
import { authorize, tenantOf } from '../../middleware/tenant';
import * as teams from './teams.service';

const role = z.enum(ASSIGNABLE_TEAM_ROLES, { error: 'Choose Admin, Developer or Viewer.' });
const inviteSchema = z.strictObject({ email: z.string({ error: MESSAGES.email }).trim().max(254).refine(isValidEmail, { error: MESSAGES.email }), role });
const acceptSchema = z.strictObject({ token: str(MESSAGES.invitation, 200) });
const roleSchema = z.strictObject({ role });
const activeSchema = z.strictObject({ teamId: str('Choose a team.', 64) });

export function teamsRouter() {
  const r = Router();

  /** Teams the signed-in user belongs to, and the session's default team (contract extension). */
  r.get('/teams', requireSession, async (req, res) => {
    const { user, session } = sessionUser(req);
    res.json(await teams.listTeams(user, session.activeTeamId));
  });

  /** Sets the default team for this session and future tabs (contract extension). */
  r.post('/teams/active', requireSession, jsonSmall, async (req, res) => {
    const { user, session } = sessionUser(req);
    res.json({ team: await teams.selectTeam(user, session._id, body(req, activeSchema).teamId) });
  });

  r.get('/team/members', requireSession, authorize('team.read'), async (req, res) => {
    res.json({ data: await teams.listMembers(tenantOf(req).team._id), nextCursor: null });
  });

  r.post('/team/invitations', requireSession, jsonSmall, authorize('team.manage'), async (req, res) => {
    const t = tenantOf(req);
    await consume('invitations', t.team._id);
    res.status(201).json(await teams.invite(t.team, sessionUser(req).user, body(req, inviteSchema)));
  });

  /** Accepting does not use a team scope: the invitation names the team. */
  r.post('/team/invitations/accept', requireSession, jsonSmall, async (req, res) => {
    const { member, team } = await teams.acceptInvitation(sessionUser(req).user, body(req, acceptSchema).token);
    res.json({ ...member, team });
  });

  r.patch('/team/members/:id', requireSession, jsonSmall, authorize('team.manage'), async (req, res) => {
    res.json(await teams.changeRole(tenantOf(req).team, sessionUser(req).user, String(req.params.id), body(req, roleSchema).role));
  });

  r.delete('/team/members/:id', requireSession, authorize('team.manage'), async (req, res) => {
    await teams.removeMember(tenantOf(req).team, sessionUser(req).user, String(req.params.id));
    res.status(204).end();
  });

  return r;
}
