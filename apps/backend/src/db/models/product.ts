import { Schema } from 'mongoose';
import {
  API_KEY_SCOPES,
  CONTACT_TOPICS,
  NOTIFICATION_KINDS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type ApiKeyScope,
  type NotificationKind,
  type TicketPriority,
  type TicketStatus,
} from '@digitalycloud/shared';
import { DAY_SECONDS, baseOptions, defineModel } from './common';

export interface ApiKeyDoc {
  _id: string;
  teamId: string;
  createdBy: string;
  name: string;
  prefix: string;
  secretHash: string;
  scope: ApiKeyScope;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  revokedReason: string | null;
}

const apiKeySchema = new Schema(
  {
    _id: { type: String, required: true },
    teamId: { type: String, required: true },
    createdBy: { type: String, required: true },
    name: { type: String, required: true, minlength: 2, maxlength: 80 },
    prefix: { type: String, required: true },
    secretHash: { type: String, required: true },
    scope: { type: String, enum: API_KEY_SCOPES, required: true },
    createdAt: { type: Date, required: true },
    lastUsedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, default: null },
  },
  baseOptions,
);
apiKeySchema.index({ secretHash: 1 }, { unique: true, name: 'api_key_secret_unique' });
apiKeySchema.index({ teamId: 1, createdAt: -1, _id: -1 }, { name: 'api_key_team' });
apiKeySchema.index({ teamId: 1, createdBy: 1 }, { name: 'api_key_creator' });

export const ApiKey = defineModel<ApiKeyDoc>('ApiKey', apiKeySchema, 'api_keys');

export interface NotificationDoc {
  _id: string;
  userId: string;
  teamId: string | null;
  serviceId: string | null;
  kind: NotificationKind;
  category: 'deploySuccess' | 'deployFail' | 'crash' | 'usage' | 'billing' | 'product' | 'maintenance' | 'account';
  title: string;
  body: string;
  readAt: Date | null;
  createdAt: Date;
  /** Stable identity of the event (e.g. `deploy:dep_x:success`) so worker retries never duplicate. */
  dedupeKey: string | null;
  expiresAt: Date;
}

const notificationSchema = new Schema(
  {
    _id: { type: String, required: true },
    userId: { type: String, required: true },
    teamId: { type: String, default: null },
    serviceId: { type: String, default: null },
    kind: { type: String, enum: NOTIFICATION_KINDS, required: true },
    category: { type: String, enum: ['deploySuccess', 'deployFail', 'crash', 'usage', 'billing', 'product', 'maintenance', 'account'], required: true },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 1000 },
    readAt: { type: Date, default: null },
    createdAt: { type: Date, required: true },
    dedupeKey: { type: String, default: null },
    expiresAt: { type: Date, required: true },
  },
  baseOptions,
);
notificationSchema.index({ userId: 1, createdAt: -1, _id: -1 }, { name: 'notification_user' });
notificationSchema.index({ userId: 1, dedupeKey: 1 }, { unique: true, name: 'notification_dedupe_unique', partialFilterExpression: { dedupeKey: { $type: 'string' } } });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'notification_ttl' });

export const Notification = defineModel<NotificationDoc>('Notification', notificationSchema, 'notifications');

export interface SupportTicketDoc {
  _id: string;
  number: number;
  teamId: string;
  userId: string;
  serviceId: string | null;
  subject: string;
  priority: TicketPriority;
  message: string;
  status: TicketStatus;
  createdAt: Date;
}

const ticketSchema = new Schema(
  {
    _id: { type: String, required: true },
    number: { type: Number, required: true },
    teamId: { type: String, required: true },
    userId: { type: String, required: true },
    serviceId: { type: String, default: null },
    subject: { type: String, required: true, minlength: 4, maxlength: 200 },
    priority: { type: String, enum: TICKET_PRIORITIES, required: true },
    message: { type: String, required: true, minlength: 10, maxlength: 10_000 },
    status: { type: String, enum: TICKET_STATUSES, default: 'open', required: true },
    createdAt: { type: Date, required: true },
  },
  baseOptions,
);
ticketSchema.index({ number: 1 }, { unique: true, name: 'ticket_number_unique' });
ticketSchema.index({ teamId: 1, createdAt: -1, _id: -1 }, { name: 'ticket_team' });

export const SupportTicket = defineModel<SupportTicketDoc>('SupportTicket', ticketSchema, 'support_tickets');

export interface ContactMessageDoc {
  _id: string;
  name: string;
  email: string;
  company: string | null;
  topic: string;
  message: string;
  ipHash: string | null;
  userAgent: string | null;
  createdAt: Date;
}

const contactSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, maxlength: 120 },
    email: { type: String, required: true, maxlength: 254 },
    company: { type: String, default: null, maxlength: 120 },
    topic: { type: String, enum: CONTACT_TOPICS, required: true },
    message: { type: String, required: true, maxlength: 10_000 },
    ipHash: { type: String, default: null },
    userAgent: { type: String, default: null, maxlength: 512 },
    createdAt: { type: Date, required: true },
  },
  baseOptions,
);
contactSchema.index({ createdAt: -1 }, { name: 'contact_created' });

export const ContactMessage = defineModel<ContactMessageDoc>('ContactMessage', contactSchema, 'contact_messages');

export interface DocFeedbackDoc {
  _id: string;
  slug: string;
  vote: 'up' | 'down';
  ipHash: string | null;
  createdAt: Date;
}

const feedbackSchema = new Schema(
  {
    _id: { type: String, required: true },
    slug: { type: String, required: true, maxlength: 100 },
    vote: { type: String, enum: ['up', 'down'], required: true },
    ipHash: { type: String, default: null },
    createdAt: { type: Date, required: true },
  },
  baseOptions,
);
feedbackSchema.index({ slug: 1, createdAt: -1 }, { name: 'feedback_slug' });

export const DocFeedback = defineModel<DocFeedbackDoc>('DocFeedback', feedbackSchema, 'doc_feedback');

/** One record per logical email (`_id` = stable dedupe key), so retries never send twice. */
export interface EmailDeliveryDoc {
  _id: string;
  to: string;
  template: string;
  subject: string;
  status: 'queued' | 'sending' | 'sent' | 'failed';
  attempts: number;
  lastError: string | null;
  messageId: string | null;
  createdAt: Date;
  sentAt: Date | null;
  expiresAt: Date;
}

const emailSchema = new Schema(
  {
    _id: { type: String, required: true },
    to: { type: String, required: true },
    template: { type: String, required: true },
    subject: { type: String, required: true },
    status: { type: String, enum: ['queued', 'sending', 'sent', 'failed'], required: true },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: null },
    messageId: { type: String, default: null },
    createdAt: { type: Date, required: true },
    sentAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  baseOptions,
);
emailSchema.index({ status: 1, createdAt: 1 }, { name: 'email_status' });
emailSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'email_ttl' });

export const EmailDelivery = defineModel<EmailDeliveryDoc>('EmailDelivery', emailSchema, 'email_deliveries');

export const NOTIFICATION_RETENTION_DAYS = 90;
export const NOTIFICATION_TTL_SECONDS = NOTIFICATION_RETENTION_DAYS * DAY_SECONDS;
