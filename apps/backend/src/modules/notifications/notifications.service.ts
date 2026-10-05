import { DEFAULT_NOTIFICATION_PREFERENCES, type NotificationDto, type NotificationKind, type NotificationPreferences } from '@digitalycloud/shared';
import { ctx } from '../../context';
import { withTransaction } from '../../db/connection';
import { Membership, Notification, NOTIFICATION_TTL_SECONDS, User, type MembershipDoc, type NotificationDoc, type UserDoc } from '../../db/models';
import { dispatchNow } from '../../jobs/outbox';
import { isDuplicateKey } from '../../lib/errors';
import { newId } from '../../lib/ids';
import { frontendLink, queueEmail } from '../email/email.service';

export type NotificationCategory = NotificationDoc['category'];

export interface NotifyInput {
  teamId: string | null;
  /** Explicit recipients; otherwise every team member (billing: owners only). */
  userIds?: string[];
  serviceId?: string | null;
  kind: NotificationKind;
  category: NotificationCategory;
  title: string;
  body: string;
  /** Stable event identity, e.g. `deploy:dep_x:success`. Retries never create duplicates. */
  dedupeKey: string;
  link?: string;
}

/** Which preference key controls emails for a category (`account` and `maintenance` always notify in-app). */
const PREF_FOR: Partial<Record<NotificationCategory, keyof NotificationPreferences>> = {
  deploySuccess: 'deploySuccess',
  deployFail: 'deployFail',
  crash: 'crash',
  usage: 'usage',
  billing: 'billing',
  product: 'product',
};

export const notificationDto = (n: NotificationDoc): NotificationDto => ({
  id: n._id,
  title: n.title,
  body: n.body,
  time: n.createdAt.getTime(),
  read: Boolean(n.readAt),
  kind: n.kind,
  serviceId: n.serviceId,
});

async function recipients(input: NotifyInput): Promise<UserDoc[]> {
  let ids = input.userIds;
  if (!ids) {
    if (!input.teamId) return [];
    const ms = await Membership.find({ teamId: input.teamId, ...(input.category === 'billing' ? { role: 'owner' } : {}) }).lean<MembershipDoc[]>();
    ids = ms.map((m) => m.userId);
  }
  return User.find({ _id: { $in: ids }, status: 'active' }).lean<UserDoc[]>();
}

/**
 * Creates in-app notifications (one per recipient) and preference-gated emails with stable
 * identities, then pushes `notification.created` to each user's stream.
 */
export async function notify(input: NotifyInput) {
  const users = await recipients(input);
  const created: NotificationDoc[] = [];
  let outbox: string[] = [];
  for (const u of users) {
    const now = new Date();
    const doc: NotificationDoc = {
      _id: newId('notification'),
      userId: u._id,
      teamId: input.teamId,
      serviceId: input.serviceId ?? null,
      kind: input.kind,
      category: input.category,
      title: input.title.slice(0, 200),
      body: input.body.slice(0, 1000),
      readAt: null,
      createdAt: now,
      dedupeKey: input.dedupeKey,
      expiresAt: new Date(now.getTime() + NOTIFICATION_TTL_SECONDS * 1000),
    };
    try {
      await withTransaction(async (s) => {
        await Notification.create([doc], { session: s });
        const pref = PREF_FOR[input.category];
        const prefs = { ...DEFAULT_NOTIFICATION_PREFERENCES, ...u.notificationPreferences };
        if (pref && prefs[pref]) {
          outbox = outbox.concat(
            await queueEmail(s, {
              key: `ntf:${input.dedupeKey}:${u._id}`,
              to: u.email,
              template: 'notification',
              data: { title: doc.title, body: doc.body, url: frontendLink(input.link ?? (input.serviceId ? `/services/${input.serviceId}` : '/dashboard')) },
            }),
          );
        }
      });
      created.push(doc);
    } catch (e) {
      if (!isDuplicateKey(e, 'notification_dedupe_unique')) throw e;
    }
  }
  await dispatchNow(ctx().queues, outbox);
  for (const n of created) await ctx().hub.publish({ kind: 'user', id: n.userId }, 'notification.created', notificationDto(n));
  return created.length;
}

export async function listNotifications(userId: string, limit: number) {
  const rows = await Notification.find({ userId }).sort({ createdAt: -1, _id: -1 }).limit(limit).lean<NotificationDoc[]>();
  return rows.map(notificationDto);
}

export async function markAllRead(userId: string, limit: number) {
  await Notification.updateMany({ userId, readAt: null }, { $set: { readAt: new Date() } });
  return listNotifications(userId, limit);
}
