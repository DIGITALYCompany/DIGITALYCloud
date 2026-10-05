'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import { CheckCircle2, CreditCard, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { BillingOperation } from '@/lib/types';

const TERMINAL = new Set<BillingOperation['status']>(['completed', 'failed', 'canceled', 'expired']);
const POLL_MS = 2000;
const MAX_WAIT_MS = 3 * 60_000;

/** Reads `?checkout=success|canceled&operation=<id>` once and removes it from the URL. */
export function useCheckoutReturn() {
  const [value] = useState(() => {
    if (typeof window === 'undefined') return null;
    const p = new URLSearchParams(window.location.search);
    const checkout = p.get('checkout');
    const operation = p.get('operation');
    if ((checkout !== 'success' && checkout !== 'canceled') || !operation) return null;
    return { checkout: checkout as 'success' | 'canceled', operation, service: p.get('service') };
  });
  useEffect(() => {
    if (!value) return;
    const url = new URL(window.location.href);
    for (const k of ['checkout', 'operation', 'service']) url.searchParams.delete(k);
    window.history.replaceState(null, '', url.pathname + url.search);
  }, [value]);
  return value;
}

/**
 * Banner for a Stripe Checkout return. Payment confirmation arrives by webhook, so the
 * operation is polled until it completes, fails or expires; returning twice is harmless.
 */
export function CheckoutReturn({ operationId, returned, onCompleted }: { operationId: string; returned: 'success' | 'canceled'; onCompleted?: (op: BillingOperation) => void }) {
  const [op, setOp] = useState<BillingOperation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'resume' | 'cancel' | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const completed = useEffectEvent((o: BillingOperation) => onCompleted?.(o));

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const started = Date.now();
    const poll = async () => {
      try {
        const o = await api.billing.operation(operationId);
        if (!alive) return;
        setOp(o);
        if (o.status === 'completed') completed(o);
        // A canceled checkout stays open for a retry: no need to keep polling.
        if (TERMINAL.has(o.status) || returned === 'canceled') return;
        if (Date.now() - started > MAX_WAIT_MS) return setTimedOut(true);
      } catch (e) {
        if (alive) setError(errorMessage(e));
        return;
      }
      timer = setTimeout(poll, POLL_MS);
    };
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [operationId, returned]);

  if (dismissed) return null;

  const resume = async () => {
    setBusy('resume');
    try {
      window.location.assign((await api.billing.retryCheckout(operationId)).checkoutUrl);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(null);
    }
  };
  const cancel = async () => {
    setBusy('cancel');
    try {
      setOp(await api.billing.cancelOperation(operationId));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const what = op ? (op.kind === 'create_service' ? `Creating ${op.serviceName ?? 'your service'}` : `Changing ${op.serviceName ?? 'the service'}’s plan`) : 'Your payment';
  let tone: 'brand' | 'success' | 'danger' | 'warning' = 'brand';
  let icon = <Loader2 className="h-4 w-4 animate-spin" />;
  let text = 'Confirming your payment with our payment provider…';
  if (error) {
    tone = 'danger';
    icon = <XCircle className="h-4 w-4" />;
    text = error;
  } else if (op?.status === 'completed') {
    tone = 'success';
    icon = <CheckCircle2 className="h-4 w-4" />;
    text = `${what}: payment confirmed.`;
  } else if (op && (op.status === 'failed' || op.status === 'expired' || op.status === 'canceled')) {
    tone = 'danger';
    icon = <XCircle className="h-4 w-4" />;
    text = op.message ?? (op.status === 'expired' ? 'The checkout expired. Nothing was charged.' : op.status === 'canceled' ? 'Canceled. Nothing was charged.' : 'The payment didn’t go through. Nothing was charged.');
  } else if (returned === 'canceled' && op?.status === 'awaiting_payment') {
    tone = 'warning';
    icon = <CreditCard className="h-4 w-4" />;
    text = `${what} is waiting for payment. Nothing was charged.`;
  } else if (timedOut) {
    text = 'Still waiting for the payment confirmation. This page updates when it arrives; you can also check again later in Billing.';
  }

  return (
    <div
      role="status"
      className={cn(
        'mb-6 flex flex-col gap-3 rounded-2xl border p-4 text-sm sm:flex-row sm:items-center',
        tone === 'success' && 'border-success-500/25 bg-success-500/[0.06] text-success-400',
        tone === 'danger' && 'border-danger-500/25 bg-danger-500/[0.06] text-danger-400',
        tone === 'warning' && 'border-warning-500/25 bg-warning-500/[0.06] text-warning-400',
        tone === 'brand' && 'border-brand-500/25 bg-brand-500/[0.06] text-brand-200'
      )}
    >
      <span className="flex flex-1 items-center gap-2.5">
        {icon}
        <span className="text-ink-100">{text}</span>
      </span>
      <span className="flex gap-2">
        {op?.status === 'awaiting_payment' && op.checkoutUrl !== null && (
          <>
            <Button size="sm" onClick={resume} loading={busy === 'resume'}>
              Complete payment
            </Button>
            <Button size="sm" variant="ghost" onClick={cancel} loading={busy === 'cancel'}>
              Cancel
            </Button>
          </>
        )}
        {(op && TERMINAL.has(op.status)) || error ? (
          <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
            Dismiss
          </Button>
        ) : null}
      </span>
    </div>
  );
}
