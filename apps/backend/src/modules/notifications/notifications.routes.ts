import { Router } from 'express';
import { z } from 'zod';
import { jsonSmall } from '../../http/body';
import { limitParam, query } from '../../http/validate';
import { requireSession, sessionUser } from '../../middleware/authenticate';
import { listNotifications, markAllRead } from './notifications.service';

const listSchema = z.strictObject({ limit: limitParam(30, 100), team: z.string().max(64).optional() });

/** Notifications belong to the user (across teams), never to an API key. */
export function notificationsRouter() {
  const r = Router();
  r.get('/notifications', requireSession, async (req, res) => {
    res.json({ data: await listNotifications(sessionUser(req).user._id, query(req, listSchema).limit), nextCursor: null });
  });
  r.post('/notifications/read-all', requireSession, jsonSmall, async (req, res) => {
    res.json({ data: await markAllRead(sessionUser(req).user._id, 30), nextCursor: null });
  });
  return r;
}
