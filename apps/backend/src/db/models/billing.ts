import { Schema } from 'mongoose';
import {
  BILLING_OPERATION_KINDS,
  BILLING_OPERATION_STATUSES,
  BILLING_STATUSES,
  INVOICE_STATUSES,
  PLAN_LEVELS,
  SERVICE_TYPE_IDS,
  type BillingOperationKind,
  type BillingOperationStatus,
  type BillingStatus,
  type InvoiceStatus,
  type PaymentMethodSummary,
  type PlanId,
  type ServiceType,
} from '@digitalycloud/shared';
import type { Encrypted } from '../../lib/crypto';
import { DAY_SECONDS, baseOptions, defineModel, encryptedSchema } from './common';

/** Billing state per team (`_id` = team id). One Stripe customer and one monthly subscription per team. */
export interface BillingAccountDoc {
  _id: string;
  stripeCustomerId: string | null;
  subscriptionId: string | null;
  subscriptionStatus: string | null;
  status: BillingStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  defaultPaymentMethodId: string | null;
  paymentMethod: PaymentMethodSummary | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const billingAccountSchema = new Schema(
  {
    _id: { type: String, required: true },
    stripeCustomerId: { type: String, default: null },
    subscriptionId: { type: String, default: null },
    subscriptionStatus: { type: String, default: null },
    status: { type: String, enum: BILLING_STATUSES, default: 'none', required: true },
    currentPeriodStart: { type: String, default: null, match: /^\d{4}-\d{2}-\d{2}$/ },
    currentPeriodEnd: { type: String, default: null, match: /^\d{4}-\d{2}-\d{2}$/ },
    defaultPaymentMethodId: { type: String, default: null },
    paymentMethod: {
      type: new Schema({ brand: String, last4: String, expMonth: Number, expYear: Number }, { _id: false, strict: 'throw' }),
      default: null,
    },
    lastSyncedAt: { type: Date, default: null },
  },
  { ...baseOptions, timestamps: true },
);
billingAccountSchema.index({ stripeCustomerId: 1 }, { unique: true, name: 'billing_customer_unique', partialFilterExpression: { stripeCustomerId: { $type: 'string' } } });
billingAccountSchema.index({ subscriptionId: 1 }, { unique: true, name: 'billing_subscription_unique', partialFilterExpression: { subscriptionId: { $type: 'string' } } });

export const BillingAccount = defineModel<BillingAccountDoc>('BillingAccount', billingAccountSchema, 'billing_accounts');

/** Mapping between a paid service and its Stripe subscription item. */
export interface SubscriptionItemDoc {
  _id: string;
  teamId: string;
  serviceId: string;
  type: ServiceType;
  plan: PlanId;
  priceId: string;
  stripeSubscriptionId: string;
  stripeSubscriptionItemId: string;
  status: 'active' | 'removing' | 'removed';
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionItemSchema = new Schema(
  {
    _id: { type: String, required: true },
    teamId: { type: String, required: true },
    serviceId: { type: String, required: true },
    type: { type: String, enum: SERVICE_TYPE_IDS, required: true },
    plan: { type: String, enum: PLAN_LEVELS, required: true },
    priceId: { type: String, required: true },
    stripeSubscriptionId: { type: String, required: true },
    stripeSubscriptionItemId: { type: String, required: true },
    status: { type: String, enum: ['active', 'removing', 'removed'], required: true },
  },
  { ...baseOptions, timestamps: true },
);
subscriptionItemSchema.index({ stripeSubscriptionItemId: 1 }, { unique: true, name: 'subscription_item_stripe_unique' });
subscriptionItemSchema.index({ serviceId: 1 }, { unique: true, name: 'subscription_item_service_active_unique', partialFilterExpression: { status: 'active' } });
subscriptionItemSchema.index({ teamId: 1, status: 1 }, { name: 'subscription_item_team' });

export const SubscriptionItem = defineModel<SubscriptionItemDoc>('SubscriptionItem', subscriptionItemSchema, 'subscription_items');

export interface InvoiceDoc {
  _id: string;
  teamId: string;
  stripeInvoiceId: string | null;
  number: string;
  date: string;
  amountCents: number;
  currency: 'EUR';
  status: InvoiceStatus;
  providerStatus: string | null;
  summary: string;
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const invoiceSchema = new Schema(
  {
    _id: { type: String, required: true },
    teamId: { type: String, required: true },
    stripeInvoiceId: { type: String, default: null },
    number: { type: String, required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    amountCents: { type: Number, required: true, validate: { validator: Number.isInteger, message: 'amountCents must be an integer' } },
    currency: { type: String, enum: ['EUR'], default: 'EUR', required: true },
    status: { type: String, enum: INVOICE_STATUSES, required: true },
    providerStatus: { type: String, default: null },
    summary: { type: String, required: true },
    hostedInvoiceUrl: { type: String, default: null },
    invoicePdfUrl: { type: String, default: null },
  },
  { ...baseOptions, timestamps: true },
);
invoiceSchema.index({ stripeInvoiceId: 1 }, { unique: true, name: 'invoice_stripe_unique', partialFilterExpression: { stripeInvoiceId: { $type: 'string' } } });
invoiceSchema.index({ teamId: 1, date: -1, _id: -1 }, { name: 'invoice_team_date' });

export const Invoice = defineModel<InvoiceDoc>('Invoice', invoiceSchema, 'invoices');

/**
 * A paid action waiting on payment (402 → checkout → webhook → resume exactly once). The intended
 * service input, including env values, is stored encrypted so nothing secret survives in the browser.
 */
export interface BillingOperationDoc {
  _id: string;
  teamId: string;
  actorUserId: string;
  kind: BillingOperationKind;
  status: BillingOperationStatus;
  serviceId: string | null;
  serviceName: string | null;
  serviceType: ServiceType;
  plan: PlanId;
  previousPlan: PlanId | null;
  payloadEnc: Encrypted | null;
  idempotencyKey: string;
  stripe: { checkoutSessionId: string | null; checkoutUrl: string | null; subscriptionId: string | null; itemId: string | null; invoiceId: string | null };
  message: string | null;
  attempts: number;
  lockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  completedAt: Date | null;
  /** Records are kept for audit and removed by TTL long after completion. */
  purgeAt: Date;
}

const billingOperationSchema = new Schema(
  {
    _id: { type: String, required: true },
    teamId: { type: String, required: true },
    actorUserId: { type: String, required: true },
    kind: { type: String, enum: BILLING_OPERATION_KINDS, required: true },
    status: { type: String, enum: BILLING_OPERATION_STATUSES, required: true },
    serviceId: { type: String, default: null },
    serviceName: { type: String, default: null },
    serviceType: { type: String, enum: SERVICE_TYPE_IDS, required: true },
    plan: { type: String, enum: PLAN_LEVELS, required: true },
    previousPlan: { type: String, enum: PLAN_LEVELS, default: null },
    payloadEnc: { type: encryptedSchema, default: null },
    idempotencyKey: { type: String, required: true },
    stripe: {
      checkoutSessionId: { type: String, default: null },
      checkoutUrl: { type: String, default: null },
      subscriptionId: { type: String, default: null },
      itemId: { type: String, default: null },
      invoiceId: { type: String, default: null },
    },
    message: { type: String, default: null },
    attempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
    completedAt: { type: Date, default: null },
    purgeAt: { type: Date, required: true },
  },
  { ...baseOptions, timestamps: true },
);
billingOperationSchema.index({ teamId: 1, idempotencyKey: 1 }, { unique: true, name: 'billing_op_idempotency_unique' });
billingOperationSchema.index({ 'stripe.checkoutSessionId': 1 }, { unique: true, name: 'billing_op_checkout_unique', partialFilterExpression: { 'stripe.checkoutSessionId': { $type: 'string' } } });
billingOperationSchema.index({ status: 1, expiresAt: 1 }, { name: 'billing_op_status' });
billingOperationSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0, name: 'billing_op_purge_ttl' });

export const BillingOperation = defineModel<BillingOperationDoc>('BillingOperation', billingOperationSchema, 'billing_operations');

/** Inbound webhook receipts: `(provider, eventId)` is unique, so redeliveries are acknowledged but processed once. */
export interface WebhookReceiptDoc {
  _id: string;
  provider: 'stripe' | 'github';
  eventId: string;
  type: string;
  status: 'received' | 'processed' | 'ignored' | 'failed';
  attempts: number;
  error: string | null;
  /** GitHub payloads cannot be fetched again, so the relevant subset is kept. Stripe events are re-fetched. */
  payload: unknown;
  receivedAt: Date;
  processedAt: Date | null;
  expiresAt: Date;
}

const webhookReceiptSchema = new Schema(
  {
    _id: { type: String, required: true },
    provider: { type: String, enum: ['stripe', 'github'], required: true },
    eventId: { type: String, required: true },
    type: { type: String, required: true },
    status: { type: String, enum: ['received', 'processed', 'ignored', 'failed'], required: true },
    attempts: { type: Number, default: 0 },
    error: { type: String, default: null },
    payload: { type: Schema.Types.Mixed, default: null },
    receivedAt: { type: Date, required: true },
    processedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  baseOptions,
);
webhookReceiptSchema.index({ provider: 1, eventId: 1 }, { unique: true, name: 'webhook_provider_event_unique' });
webhookReceiptSchema.index({ status: 1, receivedAt: 1 }, { name: 'webhook_status' });
webhookReceiptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'webhook_ttl' });

export const WebhookReceipt = defineModel<WebhookReceiptDoc>('WebhookReceipt', webhookReceiptSchema, 'webhook_receipts');

export const BILLING_OP_RETENTION_SECONDS = 400 * DAY_SECONDS;
