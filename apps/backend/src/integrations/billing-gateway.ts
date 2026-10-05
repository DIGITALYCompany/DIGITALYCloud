import type { Readable } from 'node:stream';
import type { PlanId, ServiceType } from '@digitalycloud/shared';

export interface CardSummary {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export interface GatewayCustomer {
  customerId: string;
  defaultPaymentMethodId: string | null;
  card: CardSummary | null;
}

export interface GatewaySubscription {
  id: string;
  customerId: string;
  /** Provider status (`active`, `past_due`, `incomplete`, `canceled`, …). */
  status: string;
  items: { id: string; priceId: string; metadata: Record<string, string>; periodStart: number; periodEnd: number }[];
  /** True while a change waits for an unpaid invoice (pending update): it is not in effect. */
  pendingUpdate: boolean;
  defaultPaymentMethodId: string | null;
}

export interface GatewayInvoice {
  id: string;
  customerId: string;
  subscriptionId: string | null;
  number: string | null;
  created: number;
  totalCents: number;
  currency: string;
  /** Provider status: draft, open, paid, uncollectible, void. */
  status: string;
  attemptCount: number;
  pdfUrl: string | null;
  hostedUrl: string | null;
  lineCount: number;
  /** Why the invoice exists (`subscription_cycle`, `subscription_update` for prorations, …). */
  reason: string | null;
}

export type ChargeResult =
  | { ok: true; subscription: GatewaySubscription; itemId: string }
  | { ok: false; reason: 'declined' | 'requires_action' | 'no_payment_method'; message: string };

export interface CheckoutState {
  id: string;
  status: 'open' | 'complete' | 'expired';
  paymentStatus: 'paid' | 'unpaid' | 'no_payment_required';
  mode: 'subscription' | 'setup';
  customerId: string | null;
  subscriptionId: string | null;
  setupPaymentMethodId: string | null;
  metadata: Record<string, string>;
}

export interface WebhookEvent {
  id: string;
  type: string;
  objectId: string | null;
  customerId: string | null;
}

/**
 * Payment provider boundary (implemented by the Stripe gateway). `ready()` is false until the
 * configured price mapping has been validated against the catalog (EUR, monthly, VAT-inclusive,
 * exact amounts), so a misconfigured deployment can never sell a plan at the wrong price.
 * Every mutating call takes an idempotency key derived from the local operation.
 */
export interface BillingGateway {
  ready(): boolean;
  readonly validationError: string | null;
  validate(): Promise<void>;
  priceId(type: ServiceType, plan: PlanId): string;
  createCustomer(input: { teamId: string; email: string; name: string }, idempotencyKey: string): Promise<string>;
  getCustomer(customerId: string): Promise<GatewayCustomer>;
  setDefaultPaymentMethod(customerId: string, paymentMethodId: string): Promise<void>;
  createCheckout(
    input: { customerId: string; mode: 'subscription' | 'setup'; priceId?: string; operationId: string; teamId: string; successUrl: string; cancelUrl: string },
    idempotencyKey: string,
  ): Promise<{ id: string; url: string; expiresAt: number }>;
  getCheckout(id: string): Promise<CheckoutState>;
  expireCheckout(id: string): Promise<void>;
  createSubscription(input: { customerId: string; priceId: string; operationId: string; teamId: string }, idempotencyKey: string): Promise<ChargeResult>;
  addItem(input: { subscriptionId: string; priceId: string; operationId: string }, idempotencyKey: string): Promise<ChargeResult>;
  changeItemPrice(input: { subscriptionId: string; itemId: string; priceId: string; upgrade: boolean }, idempotencyKey: string): Promise<ChargeResult>;
  removeItem(input: { subscriptionId: string; itemId: string }, idempotencyKey: string): Promise<{ subscriptionCanceled: boolean }>;
  cancelSubscription(subscriptionId: string, idempotencyKey: string): Promise<void>;
  getSubscription(id: string): Promise<GatewaySubscription | null>;
  listInvoices(customerId: string, limit: number): Promise<GatewayInvoice[]>;
  getInvoice(id: string): Promise<GatewayInvoice>;
  portalUrl(customerId: string, returnUrl: string): Promise<string>;
  constructEvent(rawBody: Buffer, signature: string | undefined): WebhookEvent;
  downloadPdf(url: string): Promise<Readable>;
}
