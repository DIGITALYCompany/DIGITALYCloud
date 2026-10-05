import {
  getServicePlan,
  isPaidPlan,
  planAllowsAutoRestart,
  planLevel,
  planLimits,
  type BillingOperationDto,
  type BillingSummaryDto,
  type CreateServiceInput,
  type InvoiceDto,
  type PlanId,
} from '@digitalycloud/shared';
import { ctx } from '../../context';
import { withTransaction } from '../../db/connection';
import {
  BILLING_OP_RETENTION_SECONDS,
  BillingAccount,
  BillingOperation,
  Invoice,
  Membership,
  Service,
  SubscriptionItem,
  User,
  WebhookReceipt,
  type BillingAccountDoc,
  type BillingOperationDoc,
  type InvoiceDoc,
  type MembershipDoc,
  type ServiceDoc,
  type SubscriptionItemDoc,
  type TeamDoc,
  type UserDoc,
  type WebhookReceiptDoc,
} from '../../db/models';
import type { BillingGateway, ChargeResult, GatewayInvoice, GatewaySubscription } from '../../integrations/billing-gateway';
import type { Tenant } from '../../http/principal';
import { addToOutbox, dispatchNow } from '../../jobs/outbox';
import { registerProcessor } from '../../jobs/registry';
import { audit } from '../../lib/audit';
import { AppError, conflict, notFound, paymentRequired, unavailable } from '../../lib/errors';
import { isId, newId } from '../../lib/ids';
import { resize } from '../../runtime/capacity';
import { frontendLink } from '../email/email.service';
import { notify } from '../notifications/notifications.service';
import type { Actor } from '../deployments/deployments.service';
import { publishService } from '../services/publish';
import { OperationAlreadyFinished, finalizeService, prepareService, type CreateResult, type PreparedService } from '../services/services.service';

const OP_TTL_MS = 24 * 3600_000;
const LOCK_MS = 2 * 60_000;
const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function gateway(): BillingGateway {
  const g = ctx().integrations.billing;
  if (!g?.ready()) throw unavailable('Paid plans aren’t available right now. Choose a free plan or try again later.', 'BILLING_UNAVAILABLE');
  return g;
}

export async function billingAccount(teamId: string): Promise<BillingAccountDoc> {
  return (await BillingAccount.findOneAndUpdate({ _id: teamId }, { $setOnInsert: { status: 'none' } }, { upsert: true }).lean<BillingAccountDoc>())!;
}

export const paymentFailed = (message: string) =>
  new AppError(402, 'PAYMENT_FAILED', `${message} Update your payment method in Billing and try again.`, undefined, { portal: true });

// ---------------------------------------------------------------------------------------------
// Operations

export function operationDto(op: BillingOperationDoc, viewerIsOwner: boolean): BillingOperationDto {
  return {
    id: op._id,
    kind: op.kind,
    status: op.status,
    serviceId: op.serviceId,
    serviceName: op.serviceName,
    plan: op.plan,
    checkoutUrl: viewerIsOwner && op.status === 'awaiting_payment' ? op.stripe.checkoutUrl : null,
    message: op.message,
    createdAt: op.createdAt.getTime(),
    expiresAt: op.expiresAt.getTime(),
  };
}

async function createOperation(input: { team: TeamDoc; actor: Actor; kind: BillingOperationDoc['kind']; plan: PlanId; previousPlan: PlanId | null; serviceType: ServiceDoc['type']; serviceId: string | null; serviceName: string; payload?: CreateServiceInput; status: BillingOperationDoc['status'] }) {
  const now = new Date();
  const id = newId('billingOp');
  const doc: BillingOperationDoc = {
    _id: id,
    teamId: input.team._id,
    actorUserId: input.actor.userId!,
    kind: input.kind,
    status: input.status,
    serviceId: input.serviceId,
    serviceName: input.serviceName,
    serviceType: input.serviceType,
    plan: input.plan,
    previousPlan: input.previousPlan,
    // The intended service (including env secrets) is kept encrypted server-side, never in the browser.
    payloadEnc: input.payload ? ctx().cipher.encrypt(JSON.stringify(input.payload), `billing-op:${id}`) : null,
    idempotencyKey: id,
    stripe: { checkoutSessionId: null, checkoutUrl: null, subscriptionId: null, itemId: null, invoiceId: null },
    message: null,
    attempts: 0,
    lockedUntil: input.status === 'processing' ? new Date(now.getTime() + LOCK_MS) : null,
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(now.getTime() + OP_TTL_MS),
    completedAt: null,
    purgeAt: new Date(now.getTime() + BILLING_OP_RETENTION_SECONDS * 1000),
  };
  await BillingOperation.create(doc);
  await audit({ action: `billing.operation_${input.kind}`, actorUserId: input.actor.userId, teamId: input.team._id, targetType: 'billing_operation', targetId: id, meta: { plan: input.plan } });
  return doc;
}

async function failOperation(opId: string, message: string, status: 'failed' | 'expired' | 'canceled' = 'failed') {
  await BillingOperation.updateOne({ _id: opId, status: { $in: ['awaiting_payment', 'processing'] } }, { $set: { status, message, lockedUntil: null } });
}

const decryptPayload = (op: BillingOperationDoc) => JSON.parse(ctx().cipher.decrypt(op.payloadEnc!, `billing-op:${op._id}`)) as CreateServiceInput;

async function ensureCustomer(team: TeamDoc): Promise<string> {
  const acct = await billingAccount(team._id);
  if (acct.stripeCustomerId) return acct.stripeCustomerId;
  const owner = await User.findById(team.ownerUserId).lean<UserDoc>();
  const customerId = await gateway().createCustomer({ teamId: team._id, email: owner?.email ?? '', name: team.name }, `customer:${team._id}`);
  await BillingAccount.updateOne({ _id: team._id, stripeCustomerId: null }, { $set: { stripeCustomerId: customerId } });
  return (await billingAccount(team._id)).stripeCustomerId!;
}

/** Charges for one operation: a new item on the team subscription, or a new subscription. */
async function charge(op: BillingOperationDoc, priceId: string): Promise<{ subscriptionId: string; itemId: string }> {
  const g = gateway();
  const acct = await billingAccount(op.teamId);
  let r: ChargeResult;
  if (acct.subscriptionId) r = await g.addItem({ subscriptionId: acct.subscriptionId, priceId, operationId: op._id }, `${op._id}:charge`);
  else r = await g.createSubscription({ customerId: acct.stripeCustomerId!, priceId, operationId: op._id, teamId: op.teamId }, `${op._id}:charge`);
  if (!r.ok) {
    await failOperation(op._id, r.message);
    await audit({ action: 'billing.payment_failed', actorUserId: op.actorUserId, teamId: op.teamId, targetType: 'billing_operation', targetId: op._id, meta: { reason: r.reason } });
    throw paymentFailed(r.message);
  }
  if (!acct.subscriptionId) await BillingAccount.updateOne({ _id: op.teamId, subscriptionId: null }, { $set: { subscriptionId: r.subscription.id } });
  await BillingOperation.updateOne({ _id: op._id }, { $set: { 'stripe.subscriptionId': r.subscription.id, 'stripe.itemId': r.itemId } });
  await applySubscriptionState(op.teamId, r.subscription);
  await refreshCustomer(op.teamId).catch(() => {});
  return { subscriptionId: r.subscription.id, itemId: r.itemId };
}

/** Undo a charge whose resource could not be created: the item is removed and credited (prorated). */
async function compensate(op: BillingOperationDoc, link: { subscriptionId: string; itemId: string }, message: string) {
  try {
    await gateway().removeItem({ subscriptionId: link.subscriptionId, itemId: link.itemId }, `${op._id}:compensate`);
  } catch (err) {
    ctx().log.error({ err, operationId: op._id }, 'billing compensation failed; reconciliation will retry');
  }
  await failOperation(op._id, message);
  await notify({ teamId: op.teamId, kind: 'error', category: 'billing', title: 'A paid change couldn’t be completed', body: `${message} The charge was credited to your next invoice.`, dedupeKey: `billing-op:${op._id}:compensated`, link: '/billing' });
}

/** The payment step needs a card on file; admins without one are asked to involve the owner. */
async function requirePayment(tenant: Tenant, op: BillingOperationDoc, priceId: string, returnPath: string): Promise<never> {
  if (tenant.role !== 'owner') {
    await failOperation(op._id, 'The team owner needs to add a payment method.', 'canceled');
    await notify({ teamId: tenant.team._id, kind: 'warning', category: 'billing', title: 'Payment method needed', body: 'A team member tried to use a paid plan. Add a payment method in Billing so paid plans can be used.', dedupeKey: `owner-pm:${op._id}`, link: '/billing' });
    throw paymentRequired('The team owner needs to add a payment method before paid plans can be used.', { ownerActionRequired: true });
  }
  const g = gateway();
  const customerId = await ensureCustomer(tenant.team);
  const acct = await billingAccount(tenant.team._id);
  const mode = acct.subscriptionId ? 'setup' : 'subscription';
  const sep = returnPath.includes('?') ? '&' : '?';
  const session = await g.createCheckout(
    {
      customerId,
      mode,
      priceId: mode === 'subscription' ? priceId : undefined,
      operationId: op._id,
      teamId: tenant.team._id,
      successUrl: frontendLink(`${returnPath}${sep}checkout=success&operation=${op._id}`),
      cancelUrl: frontendLink(`${returnPath}${sep}checkout=canceled&operation=${op._id}`),
    },
    `${op._id}:checkout:${op.attempts}`,
  );
  await BillingOperation.updateOne({ _id: op._id }, { $set: { 'stripe.checkoutSessionId': session.id, 'stripe.checkoutUrl': session.url, expiresAt: new Date(Math.min(op.expiresAt.getTime(), session.expiresAt)) } });
  throw paymentRequired('Add a payment method to use paid plans.', { checkoutUrl: session.url, operationId: op._id });
}

/**
 * Paid service creation. With a card on file the prorated amount is charged now and the service is
 * created only if that succeeds. Without one, the intended service is stored encrypted in a
 * billing operation and the owner gets a Checkout URL; the verified webhook later resumes it once.
 */
export async function purchaseService(tenant: Tenant, actor: Actor, prepared: PreparedService): Promise<CreateResult> {
  const g = gateway();
  const input = prepared.input;
  const priceId = g.priceId(input.type, input.plan);
  const acct = await billingAccount(tenant.team._id);
  const ready = Boolean(acct.stripeCustomerId && acct.defaultPaymentMethodId);
  const op = await createOperation({ team: tenant.team, actor, kind: 'create_service', plan: input.plan, previousPlan: null, serviceType: input.type, serviceId: null, serviceName: prepared.name, payload: input, status: ready ? 'processing' : 'awaiting_payment' });
  if (!ready) return requirePayment(tenant, op, priceId, '/services/new');
  const link = await charge(op, priceId);
  return finalizePaid(op, prepared, actor, link, priceId);
}

async function finalizePaid(op: BillingOperationDoc, prepared: PreparedService, actor: Actor, link: { subscriptionId: string; itemId: string }, priceId: string) {
  try {
    return await finalizeService(prepared, actor, { operationId: op._id, subscriptionId: link.subscriptionId, stripeItemId: link.itemId, priceId });
  } catch (e) {
    if (e instanceof OperationAlreadyFinished) {
      const done = await BillingOperation.findById(op._id).lean<BillingOperationDoc>();
      const svc = done?.serviceId ? await Service.findById(done.serviceId).lean<ServiceDoc>() : null;
      if (svc) {
        const { Deployment } = await import('../../db/models');
        const { deploymentDto } = await import('../../serializers/deployment');
        const dep = await Deployment.findOne({ serviceId: svc._id, number: 1 }).lean();
        return { service: svc, deployment: deploymentDto(dep!) };
      }
    }
    await compensate(op, link, e instanceof AppError ? e.message : 'The service could not be created.');
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------
// Plan changes

async function applyPlan(op: BillingOperationDoc, serviceId: string, target: PlanId, item: { subscriptionId: string; itemId: string; priceId: string } | null) {
  let outbox: string[] = [];
  await withTransaction(async (s) => {
    const done = await BillingOperation.updateOne({ _id: op._id, status: 'processing' }, { $set: { status: 'completed', completedAt: new Date(), message: null } }, { session: s });
    if (done.modifiedCount !== 1) throw new OperationAlreadyFinished();
    const svc = await Service.findOne({ _id: serviceId, teamId: op.teamId, lifecycle: 'active' }, null, { session: s }).lean<ServiceDoc>();
    if (!svc) throw notFound('Service');
    const fits = await resize(s, svc, target);
    await Service.updateOne(
      { _id: serviceId },
      {
        $set: {
          plan: target,
          autoRestart: planAllowsAutoRestart(target) ? svc.autoRestart : false,
          resourceState: fits ? { status: 'pending', error: null, updatedAt: new Date() } : { status: 'failed', error: 'The current host has no room for the new plan’s resources. Redeploy to move the service.', updatedAt: new Date() },
        },
      },
      { session: s },
    );
    const existing = await SubscriptionItem.findOne({ serviceId, status: 'active' }, null, { session: s }).lean<SubscriptionItemDoc>();
    if (item && existing) await SubscriptionItem.updateOne({ _id: existing._id }, { $set: { plan: target, priceId: item.priceId, stripeSubscriptionItemId: item.itemId, stripeSubscriptionId: item.subscriptionId } }, { session: s });
    else if (item) await SubscriptionItem.create([{ _id: newId('subscriptionItem'), teamId: op.teamId, serviceId, type: svc.type, plan: target, priceId: item.priceId, stripeSubscriptionId: item.subscriptionId, stripeSubscriptionItemId: item.itemId, status: 'active' }], { session: s });
    else if (existing) await SubscriptionItem.updateOne({ _id: existing._id }, { $set: { status: 'removed' } }, { session: s });
    outbox = await addToOutbox(s, [{ topic: 'runtime.apply_limits', payload: { serviceId }, dedupeKey: `limits:${op._id}` }]);
    await audit({ action: 'service.plan_changed', actorUserId: op.actorUserId, teamId: op.teamId, targetType: 'service', targetId: serviceId, meta: { from: svc.plan, to: target, operationId: op._id } }, s);
  });
  await dispatchNow(ctx().queues, outbox);
  await publishService(serviceId);
}

/**
 * `POST /services/:id/plan`. Upgrades are charged immediately (prorated, applied only once paid);
 * downgrades apply at once with the difference credited to a later invoice; moving to Free removes
 * the item (credited) and turns auto-restart off. Storage downgrades below current usage are refused.
 */
export async function changeServicePlan(tenant: Tenant, actor: Actor, svc: ServiceDoc, target: PlanId): Promise<ServiceDoc> {
  const g = gateway();
  const down = planLevel(target) < planLevel(svc.plan);
  const newLimits = planLimits(svc.type, target);
  if (down && svc.storageMb > newLimits.storageLimitMb) {
    throw conflict(`This service uses ${Math.round(svc.storageMb)} MB of storage, more than the ${newLimits.storageLimitMb} MB included in ${getServicePlan(svc.type, target).name}. Free up space first.`, 'STORAGE_DOWNGRADE_BLOCKED');
  }
  const item = await SubscriptionItem.findOne({ serviceId: svc._id, status: 'active' }).lean<SubscriptionItemDoc>();
  const op = await createOperation({ team: tenant.team, actor, kind: 'change_plan', plan: target, previousPlan: svc.plan, serviceType: svc.type, serviceId: svc._id, serviceName: svc.name, status: 'processing' });

  if (!isPaidPlan(svc.type, target)) {
    if (item) await g.removeItem({ subscriptionId: item.stripeSubscriptionId, itemId: item.stripeSubscriptionItemId }, `${op._id}:remove`);
    await applyPlan(op, svc._id, target, null);
    if (item) await syncTeamBilling(tenant.team._id).catch(() => {});
    return (await Service.findById(svc._id).lean<ServiceDoc>())!;
  }
  const priceId = g.priceId(svc.type, target);
  if (item) {
    const r = await g.changeItemPrice({ subscriptionId: item.stripeSubscriptionId, itemId: item.stripeSubscriptionItemId, priceId, upgrade: !down }, `${op._id}:change`);
    if (!r.ok) {
      await failOperation(op._id, r.message);
      throw paymentFailed(r.message);
    }
    await applyPlan(op, svc._id, target, { subscriptionId: item.stripeSubscriptionId, itemId: item.stripeSubscriptionItemId, priceId });
    return (await Service.findById(svc._id).lean<ServiceDoc>())!;
  }
  const acct = await billingAccount(tenant.team._id);
  if (!acct.stripeCustomerId || !acct.defaultPaymentMethodId) {
    await BillingOperation.updateOne({ _id: op._id }, { $set: { status: 'awaiting_payment', lockedUntil: null } });
    return requirePayment(tenant, { ...op, status: 'awaiting_payment' }, priceId, `/billing?service=${svc._id}`);
  }
  const link = await charge(op, priceId);
  try {
    await applyPlan(op, svc._id, target, { ...link, priceId });
  } catch (e) {
    if (!(e instanceof OperationAlreadyFinished)) await compensate(op, link, 'The plan change could not be applied.');
    throw e;
  }
  return (await Service.findById(svc._id).lean<ServiceDoc>())!;
}

// ---------------------------------------------------------------------------------------------
// Resuming operations after Checkout (verified webhook or reconciliation), exactly once.

export async function resumeOperation(opId: string) {
  const now = new Date();
  const op = await BillingOperation.findOneAndUpdate(
    { _id: opId, status: { $in: ['awaiting_payment', 'processing'] }, $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }] },
    { $set: { lockedUntil: new Date(now.getTime() + LOCK_MS) }, $inc: { attempts: 1 } },
  ).lean<BillingOperationDoc>();
  if (!op) return;
  const release = () => BillingOperation.updateOne({ _id: op._id }, { $set: { lockedUntil: null } });
  const g = gateway();
  const priceId = g.priceId(op.serviceType, op.plan);
  let link: { subscriptionId: string; itemId: string } | null = op.stripe.subscriptionId && op.stripe.itemId ? { subscriptionId: op.stripe.subscriptionId, itemId: op.stripe.itemId } : null;

  if (!link && op.stripe.checkoutSessionId) {
    const s = await g.getCheckout(op.stripe.checkoutSessionId);
    if (s.status === 'expired') return failOperation(op._id, 'The checkout expired before payment.', 'expired');
    // A success redirect or `checkout.session.completed` alone grants nothing: the payment must be confirmed.
    if (s.status !== 'complete') return void (await release());
    if (s.customerId) await BillingAccount.updateOne({ _id: op.teamId, stripeCustomerId: null }, { $set: { stripeCustomerId: s.customerId } });
    if (s.mode === 'subscription') {
      if (s.paymentStatus !== 'paid' || !s.subscriptionId) return void (await release());
      const sub = await g.getSubscription(s.subscriptionId);
      if (!sub || (sub.status !== 'active' && sub.status !== 'trialing')) return void (await release());
      const item = sub.items.find((i) => i.priceId === priceId);
      if (!item) return failOperation(op._id, 'The subscription does not contain the expected plan.');
      await BillingAccount.updateOne({ _id: op.teamId }, { $set: { subscriptionId: sub.id } });
      await applySubscriptionState(op.teamId, sub);
      link = { subscriptionId: sub.id, itemId: item.id };
      await BillingOperation.updateOne({ _id: op._id }, { $set: { status: 'processing', 'stripe.subscriptionId': sub.id, 'stripe.itemId': item.id } });
    } else {
      if (!s.setupPaymentMethodId) return void (await release());
      const acct = await billingAccount(op.teamId);
      await g.setDefaultPaymentMethod(acct.stripeCustomerId!, s.setupPaymentMethodId);
      await BillingAccount.updateOne({ _id: op.teamId }, { $set: { defaultPaymentMethodId: s.setupPaymentMethodId } });
      await BillingOperation.updateOne({ _id: op._id }, { $set: { status: 'processing' } });
      try {
        link = await charge({ ...op, status: 'processing' }, priceId);
      } catch {
        return;
      }
    }
  }
  if (!link) return void (await release());

  // Authorization and the resource itself are checked again: they may have changed meanwhile.
  const membership = await Membership.findOne({ teamId: op.teamId, userId: op.actorUserId }).lean<MembershipDoc>();
  const actorUser = await User.findById(op.actorUserId).lean<UserDoc>();
  if (!membership || (membership.role !== 'owner' && membership.role !== 'admin') || !actorUser) return compensate(op, link, 'You no longer have permission to make this change.');
  const actor: Actor = { userId: actorUser._id, apiKeyId: null, name: actorUser.name };
  try {
    if (op.kind === 'create_service') {
      const prepared = await prepareService(op.teamId, decryptPayload(op));
      await finalizePaid({ ...op, status: 'processing' }, prepared, actor, link, priceId);
    } else {
      await applyPlan(op, op.serviceId!, op.plan, { ...link, priceId });
    }
  } catch (e) {
    if (e instanceof OperationAlreadyFinished) return;
    if (op.kind === 'change_plan') await compensate(op, link, e instanceof AppError ? e.message : 'The plan change could not be applied.');
    // finalizePaid compensates itself for creations.
  }
}

// ---------------------------------------------------------------------------------------------
// Synchronisation with the provider (authoritative state; order of webhooks does not matter)

async function applySubscriptionState(teamId: string, sub: GatewaySubscription | null) {
  if (!sub || sub.status === 'canceled' || sub.status === 'incomplete_expired') {
    await BillingAccount.updateOne({ _id: teamId }, { $set: { subscriptionId: null, subscriptionStatus: sub?.status ?? null, status: 'none', currentPeriodStart: null, currentPeriodEnd: null, lastSyncedAt: new Date() } });
    return;
  }
  const starts = sub.items.map((i) => i.periodStart);
  const ends = sub.items.map((i) => i.periodEnd);
  await BillingAccount.updateOne(
    { _id: teamId },
    {
      $set: {
        subscriptionId: sub.id,
        subscriptionStatus: sub.status,
        status: sub.status === 'active' || sub.status === 'trialing' ? 'active' : 'past_due',
        currentPeriodStart: starts.length ? isoDate(Math.min(...starts)) : null,
        currentPeriodEnd: ends.length ? isoDate(Math.max(...ends)) : null,
        lastSyncedAt: new Date(),
        ...(sub.defaultPaymentMethodId ? { defaultPaymentMethodId: sub.defaultPaymentMethodId } : {}),
      },
    },
  );
}

/** Refreshes the stored payment-method summary (card brand/last4) from the customer. */
async function refreshCustomer(teamId: string) {
  const acct = await billingAccount(teamId);
  if (!acct.stripeCustomerId) return;
  const customer = await gateway().getCustomer(acct.stripeCustomerId);
  await BillingAccount.updateOne({ _id: teamId }, { $set: { defaultPaymentMethodId: customer.defaultPaymentMethodId, paymentMethod: customer.card } });
}

/**
 * Reconciles a team with Stripe: payment method, subscription status and periods, and items.
 * Local items missing remotely lose their paid entitlement (service falls back to Free limits);
 * remote items created for operations that never completed are resumed or credited back.
 */
export async function syncTeamBilling(teamId: string) {
  const g = gateway();
  const acct = await billingAccount(teamId);
  if (!acct.stripeCustomerId) return;
  await refreshCustomer(teamId);
  const sub = acct.subscriptionId ? await g.getSubscription(acct.subscriptionId) : null;
  await applySubscriptionState(teamId, sub);
  const live = sub && sub.status !== 'canceled' ? sub.items : [];
  const locals = await SubscriptionItem.find({ teamId, status: 'active' }).lean<SubscriptionItemDoc[]>();
  for (const local of locals) if (!live.some((i) => i.id === local.stripeSubscriptionItemId)) await loseEntitlement(local);
  for (const remote of live) {
    if (locals.some((l) => l.stripeSubscriptionItemId === remote.id)) continue;
    const opId = remote.metadata.operationId;
    const op = opId && isId('billingOp', opId) ? await BillingOperation.findById(opId).lean<BillingOperationDoc>() : null;
    if (op && (op.status === 'awaiting_payment' || op.status === 'processing')) await enqueueResume(op._id);
    else if (!op || op.status !== 'completed') await g.removeItem({ subscriptionId: sub!.id, itemId: remote.id }, `orphan:${remote.id}`);
  }
}

/** A paid item disappeared (cancelled, unpaid): the service keeps running on Free limits; data is kept. */
async function loseEntitlement(item: SubscriptionItemDoc) {
  let outbox: string[] = [];
  const svc = await withTransaction(async (s) => {
    await SubscriptionItem.updateOne({ _id: item._id }, { $set: { status: 'removed' } }, { session: s });
    const svc = await Service.findOne({ _id: item.serviceId, lifecycle: 'active' }, null, { session: s }).lean<ServiceDoc>();
    if (!svc || !isPaidPlan(svc.type, svc.plan)) return null;
    const fits = await resize(s, svc, 'free');
    const tooBig = svc.storageMb > planLimits(svc.type, 'free').storageLimitMb;
    await Service.updateOne(
      { _id: svc._id },
      { $set: { plan: 'free', autoRestart: false, resourceState: tooBig || !fits ? { status: 'failed', error: 'The paid plan ended. Storage is above the Free quota, so the service needs a paid plan to keep running.', updatedAt: new Date() } : { status: 'pending', error: null, updatedAt: new Date() } } },
      { session: s },
    );
    outbox = await addToOutbox(s, [{ topic: 'runtime.apply_limits', payload: { serviceId: svc._id }, dedupeKey: `limits:lost:${item._id}` }]);
    return svc;
  });
  await dispatchNow(ctx().queues, outbox);
  if (svc) {
    await notify({ teamId: item.teamId, serviceId: svc._id, kind: 'warning', category: 'billing', title: `${svc.name} moved to the Free plan`, body: 'Its paid subscription ended, so Free plan limits now apply. Your data was kept.', dedupeKey: `entitlement-lost:${item._id}`, link: '/billing' });
    await publishService(svc._id);
  }
}

async function enqueueResume(opId: string) {
  const ids = await addToOutbox(null, [{ topic: 'billing.resume_operation', payload: { operationId: opId }, dedupeKey: `resume:${opId}:${Math.floor(Date.now() / 60_000)}` }]).catch(() => [] as string[]);
  await dispatchNow(ctx().queues, ids);
}

/** Public invoice status: paid · pending (open, not yet attempted) · failed (attempt failed or uncollectible). Drafts and voided invoices are not listed. */
export function invoiceStatus(gi: GatewayInvoice): InvoiceDoc['status'] | null {
  if (gi.status === 'paid') return 'paid';
  if (gi.status === 'open') return gi.attemptCount > 0 ? 'failed' : 'pending';
  if (gi.status === 'uncollectible') return 'failed';
  return null;
}

export async function upsertInvoice(gi: GatewayInvoice) {
  const acct = await BillingAccount.findOne({ stripeCustomerId: gi.customerId }).lean<BillingAccountDoc>();
  if (!acct) return;
  const status = invoiceStatus(gi);
  if (!status) {
    await Invoice.deleteOne({ stripeInvoiceId: gi.id });
    return;
  }
  const previous = await Invoice.findOne({ stripeInvoiceId: gi.id }).lean<InvoiceDoc>();
  const services = await SubscriptionItem.countDocuments({ teamId: acct._id, status: 'active' });
  const summary = gi.reason === 'subscription_update' ? 'Plan change (prorated)' : `${services || gi.lineCount} service${(services || gi.lineCount) === 1 ? '' : 's'}`;
  await Invoice.updateOne(
    { stripeInvoiceId: gi.id },
    {
      $set: { teamId: acct._id, number: gi.number ?? gi.id, date: isoDate(gi.created), amountCents: gi.totalCents, currency: 'EUR', status, providerStatus: gi.status, summary, hostedInvoiceUrl: gi.hostedUrl, invoicePdfUrl: gi.pdfUrl },
      $setOnInsert: { _id: newId('invoice') },
    },
    { upsert: true },
  );
  const euros = `€${(gi.totalCents / 100).toFixed(2)}`;
  if (status === 'paid' && previous?.status !== 'paid') {
    await notify({ teamId: acct._id, kind: 'success', category: 'billing', title: 'Invoice paid', body: `Invoice ${gi.number ?? gi.id} of ${euros} was paid.`, dedupeKey: `invoice:${gi.id}:paid`, link: '/billing' });
  } else if (status === 'failed') {
    await BillingAccount.updateOne({ _id: acct._id, status: 'active' }, { $set: { status: 'past_due' } });
    await notify({ teamId: acct._id, kind: 'error', category: 'billing', title: 'Payment failed', body: `We couldn’t collect ${euros} for invoice ${gi.number ?? gi.id}. Update your payment method to keep your paid plans.`, dedupeKey: `invoice:${gi.id}:failed:${gi.attemptCount}`, link: '/billing' });
  }
}

// ---------------------------------------------------------------------------------------------
// Read models and owner actions

export async function summary(teamId: string): Promise<BillingSummaryDto> {
  const acct = await billingAccount(teamId);
  const services = await Service.find({ teamId, lifecycle: 'active' }, { type: 1, plan: 1 }).lean<Pick<ServiceDoc, 'type' | 'plan'>[]>();
  const cents = services.reduce((a, s) => a + getServicePlan(s.type, s.plan).priceCents, 0);
  return {
    status: acct.status,
    currency: 'EUR',
    monthlyTotal: cents / 100,
    nextBillingDate: acct.subscriptionId ? acct.currentPeriodEnd : null,
    periodStart: acct.subscriptionId ? acct.currentPeriodStart : null,
    periodEnd: acct.subscriptionId ? acct.currentPeriodEnd : null,
    paymentMethod: acct.paymentMethod,
    billingAvailable: Boolean(ctx().integrations.billing?.ready()),
  };
}

export const invoiceDto = (i: InvoiceDoc): InvoiceDto => ({ id: i._id, number: i.number, date: i.date, amount: i.amountCents / 100, status: i.status, plan: i.summary, pdfUrl: `${ctx().config.API_PUBLIC_URL.replace(/\/$/, '')}/v1/billing/invoices/${i._id}/pdf` });

export async function invoices(teamId: string) {
  return (await Invoice.find({ teamId }).sort({ date: -1, _id: -1 }).limit(120).lean<InvoiceDoc[]>()).map(invoiceDto);
}

export async function invoicePdf(teamId: string, id: string) {
  if (!isId('invoice', id)) throw notFound('Invoice');
  const inv = await Invoice.findOne({ _id: id, teamId }).lean<InvoiceDoc>();
  if (!inv) throw notFound('Invoice');
  let url = inv.invoicePdfUrl;
  if (!url && inv.stripeInvoiceId) url = (await gateway().getInvoice(inv.stripeInvoiceId)).pdfUrl;
  if (!url) throw notFound('Invoice PDF');
  return { number: inv.number, stream: await gateway().downloadPdf(url) };
}

export async function portalSession(team: TeamDoc) {
  const customerId = await ensureCustomer(team);
  return gateway().portalUrl(customerId, frontendLink('/billing'));
}

export async function getOperation(teamId: string, id: string) {
  if (!isId('billingOp', id)) throw notFound('Operation');
  const op = await BillingOperation.findOne({ _id: id, teamId }).lean<BillingOperationDoc>();
  if (!op) throw notFound('Operation');
  return op;
}

/** Recovery: a new Checkout session for an operation still waiting for payment. */
export async function retryCheckout(tenant: Tenant, id: string) {
  const op = await getOperation(tenant.team._id, id);
  if (op.status !== 'awaiting_payment' || op.expiresAt < new Date()) throw conflict('This payment request is no longer active. Start the change again.');
  if (op.stripe.checkoutSessionId) {
    const s = await gateway().getCheckout(op.stripe.checkoutSessionId);
    if (s.status === 'open') return op.stripe.checkoutUrl!;
    if (s.status === 'complete') {
      await enqueueResume(op._id);
      throw conflict('Payment was received; your change is being applied.', 'OPERATION_PROCESSING');
    }
  }
  const updated = await BillingOperation.findOneAndUpdate({ _id: op._id }, { $inc: { attempts: 1 } }).lean<BillingOperationDoc>();
  try {
    await requirePayment(tenant, updated!, gateway().priceId(op.serviceType, op.plan), op.kind === 'create_service' ? '/services/new' : `/billing?service=${op.serviceId}`);
  } catch (e) {
    if (e instanceof AppError && e.status === 402) return e.details?.checkoutUrl as string;
    throw e;
  }
  throw new Error('unreachable');
}

export async function cancelOperation(teamId: string, id: string) {
  const op = await getOperation(teamId, id);
  if (op.status !== 'awaiting_payment') throw conflict('Only operations waiting for payment can be cancelled.');
  if (op.stripe.checkoutSessionId) await gateway().expireCheckout(op.stripe.checkoutSessionId).catch(() => {});
  await failOperation(op._id, 'Cancelled.', 'canceled');
  return (await BillingOperation.findById(op._id).lean<BillingOperationDoc>())!;
}

/** Account deletion: cancel the team subscription (prorated credit), keep invoices. */
export async function cancelTeamBilling(teamId: string) {
  const acct = await billingAccount(teamId);
  if (!acct.subscriptionId) return;
  await gateway().cancelSubscription(acct.subscriptionId, `cancel:${acct.subscriptionId}`);
  await SubscriptionItem.updateMany({ teamId, status: 'active' }, { $set: { status: 'removed' } });
  await applySubscriptionState(teamId, null);
}

// ---------------------------------------------------------------------------------------------
// Webhook acceptance and processing

export async function acceptStripeEvent(ev: { id: string; type: string; objectId: string | null; customerId: string | null }) {
  let outbox: string[] = [];
  try {
    await withTransaction(async (s) => {
      const now = new Date();
      const receiptId = newId('outbox');
      await WebhookReceipt.create([{ _id: receiptId, provider: 'stripe', eventId: ev.id, type: ev.type, status: 'received', attempts: 0, error: null, payload: { objectId: ev.objectId, customerId: ev.customerId }, receivedAt: now, processedAt: null, expiresAt: new Date(now.getTime() + 30 * 86400_000) }], { session: s });
      outbox = await addToOutbox(s, [{ topic: 'webhook.stripe', payload: { receiptId }, dedupeKey: `stripe:${ev.id}` }]);
    });
  } catch (e) {
    if ((e as { code?: number }).code === 11000) return 'duplicate' as const;
    throw e;
  }
  await dispatchNow(ctx().queues, outbox);
  return 'accepted' as const;
}

async function teamForCustomer(customerId: string | null) {
  if (!customerId) return null;
  return (await BillingAccount.findOne({ stripeCustomerId: customerId }, { _id: 1 }).lean<{ _id: string }>())?._id ?? null;
}

export async function processStripeReceipt(receiptId: string) {
  const r = await WebhookReceipt.findOneAndUpdate({ _id: receiptId, status: { $in: ['received', 'failed'] } }, { $inc: { attempts: 1 } }).lean<WebhookReceiptDoc>();
  if (!r) return;
  const { objectId, customerId } = r.payload as { objectId: string | null; customerId: string | null };
  try {
    const type = r.type;
    if (type === 'checkout.session.completed' || type === 'checkout.session.async_payment_succeeded') {
      const op = await BillingOperation.findOne({ 'stripe.checkoutSessionId': objectId }).lean<BillingOperationDoc>();
      if (op) await resumeOperation(op._id);
    } else if (type === 'checkout.session.expired' || type === 'checkout.session.async_payment_failed') {
      const op = await BillingOperation.findOne({ 'stripe.checkoutSessionId': objectId }).lean<BillingOperationDoc>();
      if (op) await failOperation(op._id, type.endsWith('expired') ? 'The checkout expired before payment.' : 'The payment failed.', type.endsWith('expired') ? 'expired' : 'failed');
    } else if (type.startsWith('invoice.') && objectId) {
      await upsertInvoice(await gateway().getInvoice(objectId));
      const teamId = await teamForCustomer(customerId);
      if (teamId) await syncTeamBilling(teamId);
    } else if (type.startsWith('customer.subscription.') || type.startsWith('payment_method.') || type === 'customer.updated') {
      const teamId = await teamForCustomer(customerId);
      if (teamId) await syncTeamBilling(teamId);
    }
    await WebhookReceipt.updateOne({ _id: r._id }, { $set: { status: 'processed', processedAt: new Date(), error: null } });
  } catch (e) {
    await WebhookReceipt.updateOne({ _id: r._id }, { $set: { status: 'failed', error: (e as Error).message.slice(0, 500) } });
    throw e;
  }
}

/** Periodic: resume interrupted operations, expire stale ones, re-sync teams with subscriptions. */
export async function reconcileBilling() {
  if (!ctx().integrations.billing?.ready()) return;
  const now = new Date();
  for (const op of await BillingOperation.find({ status: { $in: ['awaiting_payment', 'processing'] } }).limit(200).lean<BillingOperationDoc[]>()) {
    if (op.expiresAt < now && op.status === 'awaiting_payment') {
      if (op.stripe.checkoutSessionId) await gateway().expireCheckout(op.stripe.checkoutSessionId).catch(() => {});
      await failOperation(op._id, 'The payment request expired.', 'expired');
    } else if (!op.lockedUntil || op.lockedUntil < now) await resumeOperation(op._id).catch((err: unknown) => ctx().log.warn({ err, op: op._id }, 'billing resume failed'));
  }
  const teams = await BillingAccount.find({ subscriptionId: { $ne: null } }).sort({ lastSyncedAt: 1 }).limit(50).lean<BillingAccountDoc[]>();
  for (const t of teams) await syncTeamBilling(t._id).catch((err: unknown) => ctx().log.warn({ err, teamId: t._id }, 'billing sync failed'));
}

export function registerBillingProcessors() {
  registerProcessor('webhook.stripe', (d) => processStripeReceipt(String(d.receiptId)));
  registerProcessor('billing.resume_operation', (d) => resumeOperation(String(d.operationId)));
  registerProcessor('billing.sync_team', (d) => syncTeamBilling(String(d.teamId)));
  registerProcessor('billing.cancel_subscription', (d) => cancelTeamBilling(String(d.teamId)));
  registerProcessor('billing.remove_item', async (d) => {
    const item = await SubscriptionItem.findOne({ _id: String(d.subscriptionItemId), status: { $in: ['active', 'removing'] } }).lean<SubscriptionItemDoc>();
    if (!item) return;
    await SubscriptionItem.updateOne({ _id: item._id }, { $set: { status: 'removing' } });
    await gateway().removeItem({ subscriptionId: item.stripeSubscriptionId, itemId: item.stripeSubscriptionItemId }, `remove:${item._id}`);
    await SubscriptionItem.updateOne({ _id: item._id }, { $set: { status: 'removed' } });
    await syncTeamBilling(item.teamId);
  });
  registerProcessor('periodic.billing_reconcile', () => reconcileBilling());
}

