'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CreditCard, Download, ExternalLink, FileText, Lock, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { MetricRow, Panel } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Skeleton } from '@/components/ui/skeleton';
import { ChangePlanModal } from '@/components/services/change-plan-modal';
import { useApi } from '@/hooks/use-api';
import { useAuth } from '@/providers/auth-provider';
import { useCloud } from '@/providers/cloud-provider';
import { useToast } from '@/providers/toast-provider';
import { api, errorMessage } from '@/lib/api';
import { PLAN_LEVELS, SERVICE_TYPES, getServicePlan, monthlyTotal } from '@/lib/catalog';
import { formatDate, formatEuro, formatMb } from '@/lib/format';
import type { BillingSummary, Invoice } from '@/lib/types';
import { CheckoutReturn, useCheckoutReturn } from './checkout-return';

const pct = (v: number, max: number) => Math.min(100, (v / max) * 100);

const INVOICE_BADGE: Record<Invoice['status'], { tone: 'success' | 'warning' | 'danger'; label: string }> = {
  paid: { tone: 'success', label: 'Paid' },
  pending: { tone: 'warning', label: 'Pending' },
  failed: { tone: 'danger', label: 'Failed' },
};

const STATUS_BADGE: Record<BillingSummary['status'], { tone: 'success' | 'warning' | 'danger' | 'neutral'; label: string }> = {
  none: { tone: 'neutral', label: 'Free plans only' },
  active: { tone: 'success', label: 'Active' },
  past_due: { tone: 'danger', label: 'Payment past due' },
  canceled: { tone: 'warning', label: 'Subscription canceled' },
};

/** `?upgrade=<serviceId>` opens the plan picker for that service once, then is removed from the URL. */
function useUpgradeParam() {
  const [initial] = useState(() => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('upgrade')));
  useEffect(() => {
    if (initial) window.history.replaceState(null, '', window.location.pathname);
  }, [initial]);
  return initial;
}

function InvoiceDownload({ inv, compact }: { inv: Invoice; compact?: boolean }) {
  if (!inv.pdfUrl) return <span className="text-xs text-ink-500">No PDF yet</span>;
  // The API streams the provider's PDF for this team (cookie + `?team=`).
  const href = api.billing.invoicePdfUrl(inv.id);
  return compact ? (
    <a href={href} className="rounded-lg p-2 text-ink-400 hover:bg-white/[0.06] hover:text-white" aria-label={`Download ${inv.number}`}>
      <Download className="h-4 w-4" />
    </a>
  ) : (
    <a href={href} className="inline-flex h-8 items-center gap-2 rounded-xl px-3 text-xs font-medium text-ink-300 transition hover:bg-white/[0.06] hover:text-ink-100">
      <Download className="h-4 w-4" /> Download
    </a>
  );
}

export function BillingView() {
  const { user, can } = useAuth();
  const { services, reload } = useCloud();
  const toast = useToast();
  const upgrade = useUpgradeParam();
  const checkout = useCheckoutReturn();
  const [editingId, setEditingId] = useState<string | null>(upgrade);
  const [portalBusy, setPortalBusy] = useState(false);
  const owner = can('billing.manage');
  const canChangePlans = can('services.plan');
  const summary = useApi(() => api.billing.summary(), [], { enabled: owner });
  const invoices = useApi(() => api.billing.invoices(), [], { enabled: owner });

  if (!user) return null;
  const s = summary.data;
  const total = s?.monthlyTotal ?? monthlyTotal(services);
  const ram = services.reduce((a, x) => a + (x.status === 'running' && x.metricsAt !== null ? x.ramMb : 0), 0);
  const ramLimit = services.reduce((a, x) => a + x.ramLimitMb, 0) || 1;
  const storage = services.reduce((a, x) => a + x.storageMb, 0);
  const storageLimit = services.reduce((a, x) => a + x.storageLimitMb, 0) || 1;
  const paidCount = services.filter((x) => getServicePlan(x.type, x.plan).price > 0).length;
  const editing = services.find((x) => x.id === editingId) ?? null;
  const badge = s ? STATUS_BADGE[s.status] : null;

  const openPortal = async () => {
    setPortalBusy(true);
    try {
      window.location.assign((await api.billing.portal()).url);
    } catch (e) {
      toast({ kind: 'error', title: 'Billing portal unavailable', description: errorMessage(e) });
      setPortalBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Billing" description="Each service has its own plan. Manage plans, usage and invoices." />

      {checkout && (
        <CheckoutReturn
          operationId={checkout.operation}
          returned={checkout.checkout}
          onCompleted={() => {
            void reload();
            void summary.reload();
            void invoices.reload();
          }}
        />
      )}

      {owner && s && !s.billingAvailable && (
        <Callout kind="warning">Payments aren’t configured on this platform yet, so paid plans can’t be purchased. Free plans keep working.</Callout>
      )}

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="card relative overflow-hidden p-6 lg:col-span-2">
          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-brand-gradient opacity-20 blur-3xl" />
          <div className="relative">
            <p className="text-sm text-ink-400">Monthly total</p>
            <h2 className="mt-1 text-3xl font-semibold tracking-tight text-white">
              <span className="font-mono">{formatEuro(total)}</span>
              <span className="text-base font-normal text-ink-400">/month</span>
            </h2>
            <p className="mt-2 text-sm text-ink-300">
              {services.length} service{services.length === 1 ? '' : 's'} · {paidCount} on a paid plan
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {owner ? (
                summary.loading && !s ? (
                  <Skeleton className="h-6 w-48" />
                ) : badge && s ? (
                  <>
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                    {s.nextBillingDate && <Badge>Next billing date: {formatDate(s.nextBillingDate)}</Badge>}
                  </>
                ) : null
              ) : (
                <Badge>
                  <Lock className="h-3 w-3" /> Invoices and payment details are visible to the team owner
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="card flex flex-col justify-between p-6">
          <div>
            <p className="text-sm text-ink-400">Payment method</p>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex h-10 w-14 items-center justify-center rounded-lg border border-white/10 bg-linear-to-br/srgb from-ink-700 to-ink-850">
                <CreditCard className="h-5 w-5 text-ink-200" />
              </div>
              <div>
                {!owner ? (
                  <p className="text-sm text-ink-300">Only the owner can see this</p>
                ) : summary.loading && !s ? (
                  <Skeleton className="h-8 w-32" />
                ) : s?.paymentMethod ? (
                  <>
                    <p className="font-mono text-sm capitalize text-white">
                      {s.paymentMethod.brand} •••• {s.paymentMethod.last4}
                    </p>
                    <p className="text-xs text-ink-500">
                      Expires {String(s.paymentMethod.expMonth).padStart(2, '0')}/{s.paymentMethod.expYear}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-white">No card on file</p>
                    <p className="text-xs text-ink-500">You’ll add one when you pick a paid plan</p>
                  </>
                )}
              </div>
            </div>
          </div>
          {owner && (
            <Button variant="secondary" className="mt-5" onClick={openPortal} loading={portalBusy} disabled={!s?.billingAvailable} icon={<ExternalLink className="h-4 w-4" />}>
              {s?.paymentMethod ? 'Update card' : 'Manage billing'}
            </Button>
          )}
        </div>
      </div>

      {summary.error && owner && <ErrorState message={summary.error} onRetry={summary.reload} />}

      <Panel title="Plans by service" description="Upgrade or downgrade any service on its own. Changes are prorated." bodyClass="p-0" className="mb-6">
        {services.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm text-ink-400">No services yet. Each new service comes with its own plan.</p>
            {can('services.create') && (
              <ButtonLink href="/services/new" size="sm" className="mt-4">
                Create a service
              </ButtonLink>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {services.map((x) => {
              const plan = getServicePlan(x.type, x.plan);
              const T = SERVICE_TYPES[x.type];
              const top = x.plan === PLAN_LEVELS[PLAN_LEVELS.length - 1];
              return (
                <li key={x.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${T.color}`}>
                    <T.icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/services/${x.id}`} className="block truncate text-sm font-medium text-white hover:text-brand-200">
                      {x.name}
                    </Link>
                    <p className="truncate text-xs text-ink-400">
                      {T.label} · {plan.name} · {formatMb(plan.ramMb)} RAM · {plan.vcpu} vCPU
                    </p>
                  </div>
                  <span className="font-mono text-sm text-white">
                    {plan.price ? formatEuro(plan.price) : 'Free'}
                    {plan.price > 0 && <span className="text-xs text-ink-500">/mo</span>}
                  </span>
                  {canChangePlans && (
                    <Button size="sm" variant={top ? 'outline' : 'primary'} icon={top ? undefined : <Sparkles className="h-3.5 w-3.5" />} onClick={() => setEditingId(x.id)}>
                      {top ? 'Change plan' : 'Upgrade'}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel
        title="Usage this period"
        description={s?.periodStart && s.periodEnd ? `${formatDate(s.periodStart)} – ${formatDate(s.periodEnd)}` : 'Current allocation across your services'}
        className="mb-6"
      >
        <div className="grid gap-6 md:grid-cols-3">
          <MetricRow label="RAM in use" value={`${formatMb(ram)} / ${formatMb(ramLimit)}`}>
            <ProgressBar value={pct(ram, ramLimit)} tone={pct(ram, ramLimit) > 85 ? 'warning' : 'brand'} />
          </MetricRow>
          <MetricRow label="Storage" value={`${formatMb(storage)} / ${formatMb(storageLimit)}`}>
            <ProgressBar value={pct(storage, storageLimit)} />
          </MetricRow>
          <MetricRow label="Paid services" value={`${paidCount} / ${services.length}`}>
            <ProgressBar value={pct(paidCount, services.length || 1)} />
          </MetricRow>
        </div>
      </Panel>

      {owner && (
        <Panel title="Invoices" description={invoices.data ? `${invoices.data.length} invoice${invoices.data.length === 1 ? '' : 's'}` : 'Loading…'} bodyClass="p-0">
          {invoices.loading && !invoices.data ? (
            <div className="space-y-3 p-5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : invoices.error ? (
            <p className="px-5 py-10 text-center text-sm text-danger-400">{invoices.error}</p>
          ) : (invoices.data ?? []).length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-ink-400">No invoices yet. Invoices appear here after your first paid plan.</p>
          ) : (
            <>
              <table className="hidden w-full text-sm md:table">
                <thead>
                  <tr className="border-b border-white/[0.06] text-left text-xs text-ink-500">
                    <th className="px-5 py-3 font-normal">Invoice</th>
                    <th className="px-5 py-3 font-normal">Date</th>
                    <th className="px-5 py-3 font-normal">Plan</th>
                    <th className="px-5 py-3 font-normal">Amount</th>
                    <th className="px-5 py-3 font-normal">Status</th>
                    <th className="px-5 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {invoices.data!.map((inv) => (
                    <tr key={inv.id} className="transition hover:bg-white/[0.02]">
                      <td className="px-5 py-3.5 font-mono text-white">{inv.number}</td>
                      <td className="px-5 py-3.5 text-ink-300">{formatDate(inv.date)}</td>
                      <td className="px-5 py-3.5 text-ink-300">{inv.plan}</td>
                      <td className="px-5 py-3.5 font-mono text-white">{formatEuro(inv.amount)}</td>
                      <td className="px-5 py-3.5">
                        <Badge tone={INVOICE_BADGE[inv.status].tone}>{INVOICE_BADGE[inv.status].label}</Badge>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <InvoiceDownload inv={inv} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="divide-y divide-white/[0.05] md:hidden">
                {invoices.data!.map((inv) => (
                  <div key={inv.id} className="flex items-center gap-3 px-5 py-4">
                    <FileText className="h-5 w-5 shrink-0 text-ink-400" />
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-sm text-white">{inv.number}</p>
                      <p className="text-xs text-ink-400">
                        {formatDate(inv.date)} · {inv.plan} · <span className={inv.status === 'paid' ? 'text-success-400' : inv.status === 'failed' ? 'text-danger-400' : 'text-warning-400'}>{INVOICE_BADGE[inv.status].label}</span>
                      </p>
                    </div>
                    <span className="font-mono text-sm text-white">{formatEuro(inv.amount)}</span>
                    <InvoiceDownload inv={inv} compact />
                  </div>
                ))}
              </div>
            </>
          )}
        </Panel>
      )}

      <ChangePlanModal service={editing} onClose={() => setEditingId(null)} />
    </>
  );
}
