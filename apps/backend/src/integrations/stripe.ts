import { Readable } from 'node:stream';
import Stripe from 'stripe';
import { PLAN_LEVELS, SERVICE_TYPE_IDS, getServicePlan, type PlanId, type ServiceType } from '@digitalycloud/shared';
import type { AppConfig } from '../config/env';
import type { BillingGateway, ChargeResult, CheckoutState, GatewayCustomer, GatewayInvoice, GatewaySubscription, WebhookEvent } from './billing-gateway';

/** Pinned to the API version this SDK release was generated for (verified 2026-10-05). */
export const STRIPE_API_VERSION = '2026-09-30.endive';
const PDF_HOSTS = /(^|\.)stripe\.com$/;

const id = (v: string | { id: string } | null | undefined) => (v == null ? null : typeof v === 'string' ? v : v.id);

function toSubscription(s: Stripe.Subscription): GatewaySubscription {
  return {
    id: s.id,
    customerId: id(s.customer as string | { id: string })!,
    status: s.status,
    items: s.items.data.map((i) => ({ id: i.id, priceId: i.price.id, metadata: (i.metadata ?? {}) as Record<string, string>, periodStart: i.current_period_start * 1000, periodEnd: i.current_period_end * 1000 })),
    pendingUpdate: Boolean(s.pending_update),
    defaultPaymentMethodId: id(s.default_payment_method as string | { id: string } | null),
  };
}

function toInvoice(i: Stripe.Invoice): GatewayInvoice {
  const sub = i.parent?.subscription_details?.subscription;
  return {
    id: i.id!,
    customerId: id(i.customer as string | { id: string })!,
    subscriptionId: id(sub as string | { id: string } | null | undefined),
    number: i.number,
    created: i.created * 1000,
    totalCents: i.total,
    currency: i.currency,
    status: i.status ?? 'draft',
    attemptCount: i.attempt_count ?? 0,
    pdfUrl: i.invoice_pdf ?? null,
    hostedUrl: i.hosted_invoice_url ?? null,
    lineCount: i.lines?.data?.length ?? 0,
    reason: i.billing_reason ?? null,
  };
}

function declined(e: unknown): ChargeResult | null {
  const err = e as { type?: string; code?: string; message?: string };
  if (err?.type === 'StripeCardError' || err?.code === 'card_declined') return { ok: false, reason: 'declined', message: 'Your card was declined.' };
  if (err?.code === 'subscription_payment_intent_requires_action' || err?.code === 'authentication_required') return { ok: false, reason: 'requires_action', message: 'Your bank needs you to confirm this payment.' };
  if (err?.code === 'resource_missing' && /payment method|source/i.test(err.message ?? '')) return { ok: false, reason: 'no_payment_method', message: 'No payment method is on file.' };
  return null;
}

/**
 * Stripe implementation. Prices must be monthly EUR, tax-inclusive and equal to the catalog;
 * otherwise `ready()` stays false and every paid action is refused. Immediate upgrades use
 * `proration_behavior: always_invoice` with `payment_behavior: pending_if_incomplete`, so a change
 * only takes effect once its prorated invoice is paid; downgrades create prorations credited later.
 */
export class StripeGateway implements BillingGateway {
  private readonly stripe: Stripe;
  private validated = false;
  validationError: string | null = 'Price mapping not validated yet';

  constructor(private readonly config: AppConfig) {
    this.stripe = new Stripe(config.STRIPE_SECRET_KEY!, { apiVersion: STRIPE_API_VERSION as never, maxNetworkRetries: 2, timeout: 20_000, appInfo: { name: 'DIGITALYCloud' } });
  }

  ready() {
    return this.validated;
  }

  async validate() {
    const problems: string[] = [];
    for (const type of SERVICE_TYPE_IDS) {
      for (const plan of PLAN_LEVELS.slice(1)) {
        const expected = getServicePlan(type, plan);
        try {
          const p = await this.stripe.prices.retrieve(this.priceId(type, plan));
          if (!p.active) problems.push(`${type}:${plan} price is archived`);
          if (p.currency !== 'eur') problems.push(`${type}:${plan} is not EUR`);
          if (p.unit_amount !== expected.priceCents) problems.push(`${type}:${plan} is ${p.unit_amount} cents, catalog says ${expected.priceCents}`);
          if (p.recurring?.interval !== 'month' || (p.recurring.interval_count ?? 1) !== 1) problems.push(`${type}:${plan} is not billed monthly`);
          if (p.tax_behavior !== 'inclusive') problems.push(`${type}:${plan} is not tax-inclusive`);
        } catch {
          problems.push(`${type}:${plan} price could not be retrieved`);
        }
      }
    }
    this.validated = problems.length === 0;
    this.validationError = problems.length ? problems.join('; ') : null;
  }

  priceId(type: ServiceType, plan: PlanId) {
    const p = this.config.stripePrices[`${type}:${plan}`];
    if (!p) throw new Error(`No Stripe price configured for ${type}:${plan}`);
    return p;
  }

  async createCustomer(input: { teamId: string; email: string; name: string }, idempotencyKey: string) {
    const c = await this.stripe.customers.create({ email: input.email, name: input.name, metadata: { teamId: input.teamId } }, { idempotencyKey });
    return c.id;
  }

  async getCustomer(customerId: string): Promise<GatewayCustomer> {
    const c = (await this.stripe.customers.retrieve(customerId, { expand: ['invoice_settings.default_payment_method'] })) as Stripe.Customer | Stripe.DeletedCustomer;
    if ('deleted' in c && c.deleted) return { customerId, defaultPaymentMethodId: null, card: null };
    const pm = (c as Stripe.Customer).invoice_settings?.default_payment_method as Stripe.PaymentMethod | string | null;
    const card = pm && typeof pm !== 'string' ? pm.card : null;
    return {
      customerId,
      defaultPaymentMethodId: id(pm),
      card: card ? { brand: card.brand, last4: card.last4, expMonth: card.exp_month, expYear: card.exp_year } : null,
    };
  }

  async setDefaultPaymentMethod(customerId: string, paymentMethodId: string) {
    await this.stripe.customers.update(customerId, { invoice_settings: { default_payment_method: paymentMethodId } });
  }

  async createCheckout(input: { customerId: string; mode: 'subscription' | 'setup'; priceId?: string; operationId: string; teamId: string; successUrl: string; cancelUrl: string }, idempotencyKey: string) {
    const metadata = { operationId: input.operationId, teamId: input.teamId };
    const s = await this.stripe.checkout.sessions.create(
      input.mode === 'subscription'
        ? {
            mode: 'subscription',
            customer: input.customerId,
            line_items: [{ price: input.priceId!, quantity: 1 }],
            subscription_data: { metadata },
            metadata,
            success_url: input.successUrl,
            cancel_url: input.cancelUrl,
            automatic_tax: { enabled: this.config.STRIPE_AUTOMATIC_TAX },
            ...(this.config.STRIPE_AUTOMATIC_TAX ? { customer_update: { address: 'auto' as const } } : {}),
          }
        : { mode: 'setup', customer: input.customerId, currency: 'eur', metadata, success_url: input.successUrl, cancel_url: input.cancelUrl },
      { idempotencyKey },
    );
    return { id: s.id, url: s.url!, expiresAt: s.expires_at * 1000 };
  }

  async getCheckout(sessionId: string): Promise<CheckoutState> {
    const s = await this.stripe.checkout.sessions.retrieve(sessionId, { expand: ['setup_intent'] });
    const si = s.setup_intent as Stripe.SetupIntent | string | null;
    return {
      id: s.id,
      status: (s.status ?? 'open') as CheckoutState['status'],
      paymentStatus: s.payment_status as CheckoutState['paymentStatus'],
      mode: s.mode === 'setup' ? 'setup' : 'subscription',
      customerId: id(s.customer as string | { id: string } | null),
      subscriptionId: id(s.subscription as string | { id: string } | null),
      setupPaymentMethodId: si && typeof si !== 'string' ? id(si.payment_method as string | { id: string } | null) : null,
      metadata: (s.metadata ?? {}) as Record<string, string>,
    };
  }

  async expireCheckout(sessionId: string) {
    try {
      await this.stripe.checkout.sessions.expire(sessionId);
    } catch {
      // Already completed or expired.
    }
  }

  async createSubscription(input: { customerId: string; priceId: string; operationId: string; teamId: string }, idempotencyKey: string): Promise<ChargeResult> {
    try {
      const s = await this.stripe.subscriptions.create(
        {
          customer: input.customerId,
          items: [{ price: input.priceId, metadata: { operationId: input.operationId } }],
          metadata: { teamId: input.teamId },
          payment_behavior: 'error_if_incomplete',
          automatic_tax: { enabled: this.config.STRIPE_AUTOMATIC_TAX },
        },
        { idempotencyKey },
      );
      const item = s.items.data.find((i) => i.metadata?.operationId === input.operationId) ?? s.items.data[0]!;
      return { ok: true, subscription: toSubscription(s), itemId: item.id };
    } catch (e) {
      const d = declined(e);
      if (d) return d;
      throw e;
    }
  }

  async addItem(input: { subscriptionId: string; priceId: string; operationId: string }, idempotencyKey: string): Promise<ChargeResult> {
    try {
      const s = await this.stripe.subscriptions.update(
        input.subscriptionId,
        { items: [{ price: input.priceId, metadata: { operationId: input.operationId } }], proration_behavior: 'always_invoice', payment_behavior: 'pending_if_incomplete' },
        { idempotencyKey },
      );
      if (s.pending_update) return { ok: false, reason: 'declined', message: 'The prorated charge could not be collected.' };
      const item = s.items.data.find((i) => i.metadata?.operationId === input.operationId);
      if (!item) throw new Error('Subscription item missing after update');
      return { ok: true, subscription: toSubscription(s), itemId: item.id };
    } catch (e) {
      const d = declined(e);
      if (d) return d;
      throw e;
    }
  }

  async changeItemPrice(input: { subscriptionId: string; itemId: string; priceId: string; upgrade: boolean }, idempotencyKey: string): Promise<ChargeResult> {
    try {
      await this.stripe.subscriptionItems.update(
        input.itemId,
        input.upgrade
          ? { price: input.priceId, proration_behavior: 'always_invoice', payment_behavior: 'pending_if_incomplete' }
          : { price: input.priceId, proration_behavior: 'create_prorations', payment_behavior: 'allow_incomplete' },
        { idempotencyKey },
      );
      const s = await this.stripe.subscriptions.retrieve(input.subscriptionId);
      if (s.pending_update) return { ok: false, reason: 'declined', message: 'The prorated charge could not be collected.' };
      return { ok: true, subscription: toSubscription(s), itemId: input.itemId };
    } catch (e) {
      const d = declined(e);
      if (d) return d;
      throw e;
    }
  }

  async removeItem(input: { subscriptionId: string; itemId: string }, idempotencyKey: string) {
    const s = await this.stripe.subscriptions.retrieve(input.subscriptionId);
    if (s.status === 'canceled' || !s.items.data.some((i) => i.id === input.itemId)) return { subscriptionCanceled: s.status === 'canceled' };
    if (s.items.data.length === 1) {
      // The last item cannot be deleted: cancel with proration; unused time becomes customer credit.
      await this.stripe.subscriptions.cancel(input.subscriptionId, { prorate: true, invoice_now: true }, { idempotencyKey });
      return { subscriptionCanceled: true };
    }
    await this.stripe.subscriptionItems.del(input.itemId, { proration_behavior: 'create_prorations' }, { idempotencyKey });
    return { subscriptionCanceled: false };
  }

  async cancelSubscription(subscriptionId: string, idempotencyKey: string) {
    try {
      await this.stripe.subscriptions.cancel(subscriptionId, { prorate: true, invoice_now: true }, { idempotencyKey });
    } catch (e) {
      if ((e as { code?: string }).code !== 'resource_missing') throw e;
    }
  }

  async getSubscription(subscriptionId: string) {
    try {
      return toSubscription(await this.stripe.subscriptions.retrieve(subscriptionId));
    } catch (e) {
      if ((e as { code?: string }).code === 'resource_missing') return null;
      throw e;
    }
  }

  async listInvoices(customerId: string, limit: number) {
    const r = await this.stripe.invoices.list({ customer: customerId, limit });
    return r.data.map(toInvoice);
  }

  async getInvoice(invoiceId: string) {
    return toInvoice(await this.stripe.invoices.retrieve(invoiceId));
  }

  async portalUrl(customerId: string, returnUrl: string) {
    return (await this.stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl })).url;
  }

  constructEvent(rawBody: Buffer, signature: string | undefined): WebhookEvent {
    if (!signature) throw new Error('missing signature');
    const ev = this.stripe.webhooks.constructEvent(rawBody, signature, this.config.STRIPE_WEBHOOK_SECRET!);
    const obj = ev.data.object as { id?: string; customer?: string | { id: string } | null; object?: string };
    return { id: ev.id, type: ev.type, objectId: obj.id ?? null, customerId: obj.object === 'customer' ? (obj.id ?? null) : id(obj.customer ?? null) };
  }

  async downloadPdf(url: string): Promise<Readable> {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !PDF_HOSTS.test(u.hostname)) throw new Error('Unexpected invoice PDF host');
    const res = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(30_000) });
    if (!res.ok || !res.body || !PDF_HOSTS.test(new URL(res.url).hostname)) throw new Error('Invoice PDF unavailable');
    return Readable.fromWeb(res.body as never);
  }
}
