'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Check, Lock, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useCloud } from '@/providers/cloud-provider';
import { useToast } from '@/providers/toast-provider';
import { getRegion, isRegionAllowed } from '@/data/regions';
import { errorMessage, isApiError } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { PLAN_LEVELS, SERVICE_TYPES, getServicePlan, getServicePlans } from '@/lib/catalog';
import { formatEuro, formatMb } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { PlanId, Service } from '@/lib/types';

/**
 * Applies a plan change with the billing outcomes: charged now (card on file), Stripe Checkout
 * (owner without a card), owner action needed (admins), or a failed payment. Resolves true on success.
 */
export function usePlanChange() {
  const { changePlan } = useCloud();
  const toast = useToast();
  const router = useRouter();
  return async (service: Service, plan: PlanId) => {
    const next = getServicePlan(service.type, plan);
    try {
      const updated = await changePlan(service.id, plan);
      toast({
        kind: 'success',
        title: `${service.name} is now on ${next.name}`,
        description: updated.pendingChanges.resources
          ? 'The new limits are being applied to the running service.'
          : `${formatMb(next.ramMb)} RAM · ${next.vcpu} vCPU. ${next.price ? `${formatEuro(next.price)}/month, prorated from today.` : 'No charge from the next billing date.'}`,
      });
      return true;
    } catch (e) {
      if (isApiError(e) && e.status === 402 && typeof e.details.checkoutUrl === 'string') {
        // No card on file: the owner pays in Stripe Checkout and comes back to /billing.
        window.location.assign(e.details.checkoutUrl);
        return false;
      }
      if (isApiError(e) && e.status === 402 && e.details.ownerActionRequired) toast({ kind: 'warning', title: 'Payment method needed', description: e.message });
      else if (isApiError(e, 'PAYMENT_FAILED')) toast({ kind: 'error', title: 'Payment failed', description: e.message, action: { label: 'Open billing', onClick: () => router.push('/billing') } });
      else toast({ kind: 'error', title: 'Plan change failed', description: errorMessage(e) });
      return false;
    }
  };
}

/** Plan picker for one service. Open by passing a service, close by calling `onClose`. */
export function ChangePlanModal({ service, onClose }: { service: Service | null; onClose: () => void }) {
  if (!service) return null;
  // Remount when switching to another service or when its plan changes, so the selection starts from the current plan.
  return <ChangePlanDialog key={`${service.id}:${service.plan}`} service={service} onClose={onClose} />;
}

function ChangePlanDialog({ service, onClose }: { service: Service; onClose: () => void }) {
  const { catalog } = useCloud();
  const [selected, setSelected] = useState<PlanId>(service.plan);
  const [busy, setBusy] = useState(false);

  const plans = getServicePlans(service.type);
  const current = getServicePlan(service.type, service.plan);
  const next = getServicePlan(service.type, selected);
  const isUpgrade = PLAN_LEVELS.indexOf(selected) > PLAN_LEVELS.indexOf(service.plan);
  const diff = next.price - current.price;
  const T = SERVICE_TYPES[service.type];
  const region = getRegion(service.regionId);
  // Paid plans need working billing on this deployment; moving to Free is always possible.
  const paidAvailable = catalog?.paidPlansAvailable ?? false;
  const purchasable = (id: PlanId) => id === service.plan || getServicePlan(service.type, id).priceCents === 0 || paidAvailable;
  const fits = (id: PlanId) => !region || isRegionAllowed(region, id);

  const apply = usePlanChange();
  const confirm = async () => {
    setBusy(true);
    try {
      if (await apply(service, selected)) onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      size="xl"
      title={`Change plan for ${service.name}`}
      description={`${T.label} plans · each service has its own plan, billed monthly and prorated.`}
      footer={
        <>
          {selected !== service.plan && (
            <p className="mr-auto hidden items-center gap-1.5 text-xs text-ink-300 sm:flex">
              {isUpgrade ? <ArrowUp className="h-3.5 w-3.5 text-success-400" /> : <ArrowDown className="h-3.5 w-3.5 text-warning-400" />}
              {diff >= 0 ? '+' : '−'}
              {formatEuro(Math.abs(diff))}/month on your bill
            </p>
          )}
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={confirm} loading={busy} disabled={selected === service.plan}>
            {selected === service.plan ? 'Current plan' : `${isUpgrade ? 'Upgrade' : 'Switch'} to ${next.name}`}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((p) => {
          const active = selected === p.id;
          const available = fits(p.id) && purchasable(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => available && setSelected(p.id)}
              disabled={!available}
              className={cn(
                'relative flex flex-col rounded-2xl border p-4 text-left transition',
                !available
                  ? 'cursor-not-allowed border-dashed border-white/[0.08] opacity-60'
                  : active
                    ? 'border-brand-500/70 bg-brand-500/[0.08] shadow-[0_0_0_1px_rgba(37,99,255,0.4)]'
                    : 'border-white/[0.08] hover:border-white/20 hover:bg-white/[0.02]'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-white">{p.name}</span>
                {p.id === service.plan ? <Badge>Current</Badge> : p.popular ? <Badge tone="brand">Popular</Badge> : null}
              </div>
              <p className="mt-2 font-mono text-2xl text-white">
                {p.price ? formatEuro(p.price) : '€0'}
                <span className="text-xs text-ink-500">/mo</span>
              </p>
              <ul className="mt-3 space-y-1.5 text-xs text-ink-300">
                {p.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <span className={cn('mt-auto flex items-center gap-1.5 pt-4 text-xs', !available ? 'text-ink-300' : active ? 'text-brand-200' : 'text-transparent')}>
                {available ? (
                  <>
                    <Check className="h-3.5 w-3.5" /> Selected
                  </>
                ) : (
                  <>
                    <Lock className="h-3.5 w-3.5" /> {fits(p.id) ? 'Paid plans unavailable' : `Not available in ${region?.city}`}
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {region && (
        <p className="mt-4 flex items-center gap-2 text-xs text-ink-400">
          <MapPin className="h-3.5 w-3.5 text-ink-300" /> This service runs in {region.city} ({region.code}). Plans that don’t include this region can’t be selected.
        </p>
      )}
      {!paidAvailable && <p className="mt-2 text-xs text-ink-400">Paid plans can’t be purchased on this platform yet. Your service can stay on its current plan or move to Free.</p>}
    </Modal>
  );
}
