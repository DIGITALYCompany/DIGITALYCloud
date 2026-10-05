import express, { Router } from 'express';
import { pipeline } from 'node:stream/promises';
import { ctx } from '../../context';
import { jsonSmall } from '../../http/body';
import { requireSession } from '../../middleware/authenticate';
import { authorize, tenantOf } from '../../middleware/tenant';
import { acceptStripeEvent, cancelOperation, gateway, getOperation, invoicePdf, invoices, operationDto, portalSession, retryCheckout, summary } from './billing.service';

/** Billing pages and the payment portal are owner-only; operation status is visible to owners and admins. */
export function billingRouter() {
  const r = Router();

  r.get('/billing/summary', requireSession, authorize('billing.manage'), async (req, res) => {
    res.json(await summary(tenantOf(req).team._id));
  });

  r.get('/billing/invoices', requireSession, authorize('billing.manage'), async (req, res) => {
    res.json({ data: await invoices(tenantOf(req).team._id), nextCursor: null });
  });

  r.get('/billing/invoices/:id/pdf', requireSession, authorize('billing.manage'), async (req, res) => {
    const { number, stream } = await invoicePdf(tenantOf(req).team._id, String(req.params.id));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${number.replace(/[^\w.-]/g, '_')}.pdf"`);
    await pipeline(stream, res);
  });

  r.post('/billing/portal-session', requireSession, jsonSmall, authorize('billing.manage'), async (req, res) => {
    res.json({ url: await portalSession(tenantOf(req).team) });
  });

  /** Checkout return pages poll this until the operation completes, fails or expires (contract extension). */
  r.get('/billing/operations/:id', requireSession, authorize('billing.operations'), async (req, res) => {
    const t = tenantOf(req);
    res.json(operationDto(await getOperation(t.team._id, String(req.params.id)), t.role === 'owner'));
  });

  r.post('/billing/operations/:id/checkout', requireSession, jsonSmall, authorize('billing.manage'), async (req, res) => {
    res.json({ checkoutUrl: await retryCheckout(tenantOf(req), String(req.params.id)) });
  });

  r.post('/billing/operations/:id/cancel', requireSession, jsonSmall, authorize('billing.operations'), async (req, res) => {
    const t = tenantOf(req);
    res.json(operationDto(await cancelOperation(t.team._id, String(req.params.id)), t.role === 'owner'));
  });

  return r;
}

/** `POST /webhooks/stripe`: signature-verified, receipt stored durably, acknowledged, processed asynchronously. */
export function stripeWebhookRouter() {
  const r = Router();
  r.post('/stripe', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
    const billing = ctx().integrations.billing;
    if (!billing) {
      res.status(503).json({ error: { code: 'BILLING_UNAVAILABLE', message: 'Billing is not configured' } });
      return;
    }
    let ev;
    try {
      ev = (billing.ready() ? gateway() : billing).constructEvent(req.body as Buffer, req.get('stripe-signature'));
    } catch {
      res.status(400).json({ error: { code: 'INVALID_SIGNATURE', message: 'Invalid signature' } });
      return;
    }
    const result = await acceptStripeEvent(ev);
    res.status(200).json({ received: true, duplicate: result === 'duplicate' });
  });
  return r;
}
