import type { ClientSession } from 'mongoose';
import { ctx } from '../../context';
import { EmailDelivery, type EmailDeliveryDoc } from '../../db/models';
import { addToOutbox } from '../../jobs/outbox';
import { PermanentJobError, registerProcessor } from '../../jobs/registry';
import type { Encrypted } from '../../lib/crypto';
import { TEMPLATES } from './templates';

const RETENTION_MS = 180 * 24 * 3600_000;

export interface QueuedEmail {
  /** Stable identity: the same key is never sent twice (e.g. `verify:<tokenId>`, `ntf:<notificationId>`). */
  key: string;
  to: string;
  template: keyof typeof TEMPLATES;
  data: Record<string, string | number | null | undefined>;
  replyTo?: string;
}

/**
 * Records an email and its outbox entry in the caller's transaction. Template data can contain
 * one-time links, so it is encrypted in the outbox payload (AAD binds it to the delivery id).
 * Returns outbox ids for immediate dispatch, or [] when the email was already queued.
 */
export async function queueEmail(session: ClientSession | null, email: QueuedEmail): Promise<string[]> {
  const exists = await EmailDelivery.exists({ _id: email.key }).session(session ?? null);
  if (exists) return [];
  const rendered = TEMPLATES[email.template]!(email.data);
  const now = new Date();
  const doc: EmailDeliveryDoc = {
    _id: email.key,
    to: email.to,
    template: email.template,
    subject: rendered.subject,
    status: 'queued',
    attempts: 0,
    lastError: null,
    messageId: null,
    createdAt: now,
    sentAt: null,
    expiresAt: new Date(now.getTime() + RETENTION_MS),
  };
  await EmailDelivery.create([doc], session ? { session } : {});
  const enc = ctx().cipher.encrypt(JSON.stringify({ data: email.data, replyTo: email.replyTo ?? null }), `email:${email.key}`);
  return addToOutbox(session, [{ topic: 'email.send', payload: { deliveryId: email.key, enc: encToJson(enc) }, dedupeKey: `email:${email.key}` }]);
}

const encToJson = (e: Encrypted) => ({ kid: e.kid, iv: e.iv.toString('base64'), tag: e.tag.toString('base64'), ct: e.ct.toString('base64') });
const encFromJson = (j: { kid: string; iv: string; tag: string; ct: string }): Encrypted => ({
  kid: j.kid,
  iv: Buffer.from(j.iv, 'base64'),
  tag: Buffer.from(j.tag, 'base64'),
  ct: Buffer.from(j.ct, 'base64'),
});

/** Sends one queued email. Already-sent deliveries are skipped, so retries never duplicate. */
export async function sendQueuedEmail(payload: Record<string, unknown>) {
  const id = payload.deliveryId as string;
  const claimed = await EmailDelivery.findOneAndUpdate(
    { _id: id, status: { $in: ['queued', 'failed', 'sending'] } },
    { $set: { status: 'sending' }, $inc: { attempts: 1 } },
  ).lean<EmailDeliveryDoc>();
  if (!claimed) return; // Sent already, or expired.
  const c = ctx();
  if (!c.integrations.mailer.configured) {
    await EmailDelivery.updateOne({ _id: id }, { $set: { status: 'failed', lastError: 'Email delivery is not configured (SMTP_URL).' } });
    if (!c.config.production) {
      // Development aid only: the delivery stays failed; nothing claims it was sent.
      const { data } = JSON.parse(c.cipher.decrypt(encFromJson(payload.enc as never), `email:${id}`)) as { data: Record<string, string> };
      c.log.warn({ to: claimed.to, template: claimed.template, link: data.url }, 'email not sent (SMTP not configured)');
    }
    throw new PermanentJobError('Email delivery is not configured');
  }
  const { data, replyTo } = JSON.parse(c.cipher.decrypt(encFromJson(payload.enc as never), `email:${id}`)) as { data: Record<string, string>; replyTo: string | null };
  const rendered = TEMPLATES[claimed.template]!(data);
  try {
    const res = await c.integrations.mailer.send({
      to: claimed.to,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      replyTo: replyTo ?? undefined,
      messageId: `<${id.replace(/[^A-Za-z0-9._-]/g, '.')}@digitalycloud>`,
    });
    await EmailDelivery.updateOne({ _id: id }, { $set: { status: 'sent', sentAt: new Date(), messageId: res.messageId, lastError: null } });
  } catch (err) {
    await EmailDelivery.updateOne({ _id: id }, { $set: { status: 'failed', lastError: (err as Error).message.slice(0, 500) } });
    throw err;
  }
}

export function registerEmailProcessors() {
  registerProcessor('email.send', sendQueuedEmail);
}

/** Absolute link into the dashboard. */
export const frontendLink = (path: string) => `${ctx().config.FRONTEND_URL.replace(/\/$/, '')}${path}`;
