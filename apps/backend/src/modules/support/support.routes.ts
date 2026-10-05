import { Router } from 'express';
import { z } from 'zod';
import { CONTACT_TOPICS, MESSAGES, TICKET_PRIORITIES, isValidEmail, type SupportTicketDto } from '@digitalycloud/shared';
import { ctx } from '../../context';
import { withTransaction } from '../../db/connection';
import { ContactMessage, Counter, DocFeedback, Service, SupportTicket, type SupportTicketDoc } from '../../db/models';
import { jsonSmall } from '../../http/body';
import { body } from '../../http/validate';
import { dispatchNow } from '../../jobs/outbox';
import { validation } from '../../lib/errors';
import { newId } from '../../lib/ids';
import { requireSession, sessionUser } from '../../middleware/authenticate';
import { clientIp, limit } from '../../middleware/rate-limit';
import { authorize, tenantOf } from '../../middleware/tenant';
import { queueEmail } from '../email/email.service';

const ticketSchema = z.strictObject({
  subject: z.string({ error: MESSAGES.ticketSubject }).trim().min(4, { error: MESSAGES.ticketSubject }).max(200, { error: 'Keep the subject under 200 characters.' }),
  serviceId: z.string().max(63).nullable().default(null),
  priority: z.enum(TICKET_PRIORITIES, { error: 'Choose a priority.' }).default('normal'),
  message: z.string({ error: MESSAGES.ticketMessage }).trim().min(10, { error: MESSAGES.ticketMessage }).max(10_000, { error: 'Keep the message under 10,000 characters.' }),
});

const contactSchema = z.strictObject({
  name: z.string({ error: MESSAGES.name }).trim().min(2, { error: MESSAGES.name }).max(120),
  email: z.string({ error: MESSAGES.email }).trim().max(254).refine(isValidEmail, { error: MESSAGES.email }),
  company: z.string().trim().max(120).optional(),
  topic: z.enum(CONTACT_TOPICS, { error: 'Choose a topic.' }),
  message: z.string({ error: MESSAGES.contactMessage }).trim().min(10, { error: MESSAGES.contactMessage }).max(10_000),
  /** Honeypot: humans never see or fill this field. */
  website: z.string().max(200).optional(),
});

const feedbackSchema = z.strictObject({ slug: z.string().regex(/^[a-z0-9-]{1,80}$/, { error: 'Unknown article.' }), vote: z.enum(['up', 'down'], { error: 'vote must be up or down.' }) });

export const ticketDto = (t: SupportTicketDoc): SupportTicketDto => ({ id: t._id, number: t.number, subject: t.subject, serviceId: t.serviceId, priority: t.priority, message: t.message, status: t.status, createdAt: t.createdAt.getTime() });

const ipHash = (ip: string) => ctx().secrets.hmac('ip', ip).slice(0, 32);

export function supportRouter() {
  const r = Router();

  /** Persists the ticket with a real sequential number and queues delivery to the support inbox plus a copy to the user. */
  r.post('/support/tickets', requireSession, jsonSmall, authorize('support.create'), async (req, res) => {
    const input = body(req, ticketSchema);
    const team = tenantOf(req).team;
    const { user } = sessionUser(req);
    if (input.serviceId && !(await Service.exists({ _id: input.serviceId, teamId: team._id, lifecycle: 'active' }))) throw validation('Choose one of your services.', 'serviceId');
    let outbox: string[] = [];
    const ticket = await withTransaction(async (s) => {
      const counter = await Counter.findOneAndUpdate({ _id: 'support_ticket' }, { $inc: { seq: 1 } }, { upsert: true, session: s }).lean<{ seq: number }>();
      const doc: SupportTicketDoc = { _id: newId('ticket'), number: counter!.seq, teamId: team._id, userId: user._id, serviceId: input.serviceId, subject: input.subject, priority: input.priority, message: input.message, status: 'open', createdAt: new Date() };
      await SupportTicket.create([doc], { session: s });
      outbox = [
        ...(await queueEmail(s, {
          key: `ticket:${doc._id}:inbox`,
          to: ctx().config.SUPPORT_INBOX,
          replyTo: user.email,
          template: 'support_ticket_inbox',
          data: { number: doc.number, subject: doc.subject, message: doc.message, priority: doc.priority, serviceId: doc.serviceId, teamId: team._id, userName: user.name, userEmail: user.email },
        })),
        ...(await queueEmail(s, { key: `ticket:${doc._id}:copy`, to: user.email, template: 'support_ticket_copy', data: { number: doc.number, subject: doc.subject, message: doc.message, name: user.name } })),
      ];
      return doc;
    });
    await dispatchNow(ctx().queues, outbox);
    res.status(201).json(ticketDto(ticket));
  });

  r.post('/contact', jsonSmall, limit('publicForm'), async (req, res) => {
    const input = body(req, contactSchema);
    // Bots that fill the honeypot get the same answer, but nothing is stored or sent.
    if (input.website) return res.status(202).end();
    let outbox: string[] = [];
    await withTransaction(async (s) => {
      const id = newId('contact');
      await ContactMessage.create([{ _id: id, name: input.name, email: input.email, company: input.company || null, topic: input.topic, message: input.message, ipHash: ipHash(clientIp(req)), userAgent: req.get('user-agent')?.slice(0, 512) ?? null, createdAt: new Date() }], { session: s });
      outbox = await queueEmail(s, { key: `contact:${id}`, to: ctx().config.SUPPORT_INBOX, replyTo: input.email, template: 'contact_inbox', data: { name: input.name, email: input.email, company: input.company ?? null, topic: input.topic, message: input.message } });
    });
    await dispatchNow(ctx().queues, outbox);
    res.status(202).end();
  });

  r.post('/docs/feedback', jsonSmall, limit('publicForm'), async (req, res) => {
    const input = body(req, feedbackSchema);
    await DocFeedback.create({ _id: newId('feedback'), slug: input.slug, vote: input.vote, ipHash: ipHash(clientIp(req)), createdAt: new Date() });
    res.status(204).end();
  });

  return r;
}
