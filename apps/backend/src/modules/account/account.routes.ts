import { Router } from 'express';
import { z } from 'zod';
import { DEFAULT_NOTIFICATION_PREFERENCES, LANGUAGES, MAX_PASSWORD_LENGTH, MESSAGES, MIN_PASSWORD_LENGTH, isValidEmail, type SessionDto } from '@digitalycloud/shared';
import { jsonSmall } from '../../http/body';
import { body, str } from '../../http/validate';
import { requireSession, sessionUser } from '../../middleware/authenticate';
import { userResponse } from '../auth/auth.routes';
import * as account from './account.service';
import { deleteAccount } from './deletion.service';
import { clearSessionCookie } from '../../http/cookies';
import { ctx } from '../../context';

const profileSchema = z.strictObject({
  name: z.string({ error: MESSAGES.name }).trim().min(2, { error: MESSAGES.name }).max(100, { error: MESSAGES.name }).optional(),
  email: z.string({ error: MESSAGES.email }).trim().max(254).refine(isValidEmail, { error: MESSAGES.email }).optional(),
  language: z.enum(LANGUAGES, { error: 'Choose English or Français.' }).optional(),
  timezone: z.string({ error: 'Choose a valid timezone.' }).refine(account.isValidTimezone, { error: 'Choose a valid timezone.' }).optional(),
  currentPassword: z.string().max(MAX_PASSWORD_LENGTH).optional(),
});

const passwordSchema = z.strictObject({
  currentPassword: z.string().max(MAX_PASSWORD_LENGTH).optional(),
  newPassword: z.string({ error: MESSAGES.password }).min(MIN_PASSWORD_LENGTH, { error: MESSAGES.password }).max(MAX_PASSWORD_LENGTH, { error: MESSAGES.passwordTooLong }),
});

const codeSchema = z.strictObject({ code: str(MESSAGES.code, 32) });
const disableSchema = z.union([z.strictObject({ password: str('Enter your password.', MAX_PASSWORD_LENGTH) }), z.strictObject({ code: str(MESSAGES.code, 32) })], {
  error: 'Confirm with your password or a code.',
});

const prefKeys = Object.keys(DEFAULT_NOTIFICATION_PREFERENCES) as (keyof typeof DEFAULT_NOTIFICATION_PREFERENCES)[];
const prefsSchema = z.strictObject(Object.fromEntries(prefKeys.map((k) => [k, z.boolean({ error: `${k} must be true or false.` }).optional()])) as Record<(typeof prefKeys)[number], z.ZodOptional<z.ZodBoolean>>);

const deleteSchema = z.strictObject({ confirmEmail: str('Type your email address to confirm.', 254), currentPassword: z.string().max(MAX_PASSWORD_LENGTH).optional() });

const sessionDto = (s: { _id: string; device: string; createdAt: Date; lastSeenAt: Date }, currentId: string): SessionDto => ({
  id: s._id,
  device: s.device,
  // No GeoIP database is configured, so no location is claimed.
  location: null,
  current: s._id === currentId,
  createdAt: s.createdAt.getTime(),
  lastActiveAt: s.lastSeenAt.getTime(),
});

export function accountRouter() {
  const r = Router();
  r.use('/me', requireSession);

  r.patch('/me', jsonSmall, async (req, res) => {
    const { user, session } = sessionUser(req);
    const updated = await account.updateProfile(user, session, body(req, profileSchema));
    res.json(await userResponse(updated, session.activeTeamId));
  });

  r.put('/me/password', jsonSmall, async (req, res) => {
    const { user, session } = sessionUser(req);
    await account.changePassword(user, session, body(req, passwordSchema));
    res.status(204).end();
  });

  r.get('/me/sessions', async (req, res) => {
    const { user, session } = sessionUser(req);
    res.json({ data: (await account.listSessions(user._id)).map((s) => sessionDto(s, session._id)), nextCursor: null });
  });

  r.delete('/me/sessions/:id', async (req, res) => {
    const { user, session } = sessionUser(req);
    await account.deleteSession(user._id, session._id, String(req.params.id));
    res.status(204).end();
  });

  r.post('/me/2fa/setup', jsonSmall, async (req, res) => {
    const { user } = sessionUser(req);
    res.json(await account.setupTwoFactor(user));
  });

  r.post('/me/2fa/enable', jsonSmall, async (req, res) => {
    const { user } = sessionUser(req);
    const { code } = body(req, codeSchema);
    res.json({ recoveryCodes: await account.enableTwoFactor(user, code) });
  });

  r.post('/me/2fa/disable', jsonSmall, async (req, res) => {
    const { user } = sessionUser(req);
    await account.disableTwoFactor(user, body(req, disableSchema));
    res.status(204).end();
  });

  r.get('/me/notification-preferences', (req, res) => {
    res.json(account.preferencesOf(sessionUser(req).user));
  });

  r.put('/me/notification-preferences', jsonSmall, async (req, res) => {
    const patch = body(req, prefsSchema);
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<typeof DEFAULT_NOTIFICATION_PREFERENCES>;
    res.json(await account.updatePreferences(sessionUser(req).user._id, clean));
  });

  r.delete('/me', jsonSmall, async (req, res) => {
    const { user, session } = sessionUser(req);
    await deleteAccount(user, session, body(req, deleteSchema));
    clearSessionCookie(res, ctx().config);
    res.status(202).end();
  });

  return r;
}
