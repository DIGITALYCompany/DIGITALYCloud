'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CreditCard, Download, FileText, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { MetricRow, Panel } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { ProgressBar } from '@/components/ui/progress-bar';
import { ChangePlanModal } from '@/components/services/change-plan-modal';
import { useAuth } from '@/providers/auth-provider';
import { useCloud } from '@/providers/cloud-provider';
import { useToast } from '@/providers/toast-provider';
import { INVOICES } from '@/data/seed';
import { downloadTextFile } from '@/lib/browser';
import { PLAN_LEVELS, SERVICE_TYPES, getServicePlan, monthlyTotal } from '@/lib/catalog';
import { formatDate, formatEuro, formatMb } from '@/lib/format';
import type { Invoice } from '@/lib/types';

function downloadInvoice(inv: Invoice, customer: string) {
  const text = [
    'DIGITALY — DIGITALYCloud',
    `Invoice ${inv.number}`,
    `Date: ${formatDate(inv.date)}`,
    `Customer: ${customer}`,
    '',
    `${inv.plan} plan — 1 month`.padEnd(40) + formatEuro(inv.amount),
    '',
    `Total`.padEnd(40) + formatEuro(inv.amount),
    `Status: ${inv.status.toUpperCase()}`,
  ].join('\n');
  downloadTextFile(`${inv.number}.txt`, text);
}

const pct = (v: number, max: number) => Math.min(100, (v / max) * 100);

/** `?upgrade=<serviceId>` opens the plan picker for that service once, then is removed from the URL. */
function useUpgradeParam() {
  const [initial] = useState(() => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('upgrade')));
  useEffect(() => {
    if (initial) window.history.replaceState(null, '', window.location.pathname);
  }, [initial]);
  return initial;
}

export function BillingView() {
  const { user } = useAuth();
  const { services } = useCloud();
  const toast = useToast();
  const upgrade = useUpgradeParam();
  const [editingId, setEditingId] = useState<string | null>(upgrade);

  if (!user) return null;
  const total = monthlyTotal(services);
  const ram = services.reduce((a, s) => a + (s.status === 'running' ? s.ramMb : 0), 0);
  const ramLimit = services.reduce((a, s) => a + s.ramLimitMb, 0) || 1;
  const storage = services.reduce((a, s) => a + s.storageMb, 0);
  const storageLimit = services.reduce((a, s) => a + s.storageLimitMb, 0) || 1;
  const paidCount = services.filter((s) => getServicePlan(s.type, s.plan).price > 0).length;
  const editing = services.find((s) => s.id === editingId) ?? null;

  return (
    <>
      <PageHeader title="Billing" description="Each service has its own plan. Manage plans, usage and invoices." />

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
              <Badge tone="success">Active</Badge>
              <Badge>Next billing date: October 15, 2026</Badge>
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
                <p className="font-mono text-sm text-white">Visa •••• 4242</p>
                <p className="text-xs text-ink-500">Expires 08/2028</p>
              </div>
            </div>
          </div>
          <Button variant="secondary" className="mt-5" onClick={() => toast({ kind: 'info', title: 'Card update', description: 'Secure card update will open in the payment portal.' })}>
            Update card
          </Button>
        </div>
      </div>

      <Panel title="Plans by service" description="Upgrade or downgrade any service on its own. Changes are prorated." bodyClass="p-0" className="mb-6">
        {services.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm text-ink-400">No services yet. Each new service comes with its own plan.</p>
            <ButtonLink href="/services/new" size="sm" className="mt-4">
              Create a service
            </ButtonLink>
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {services.map((s) => {
              const plan = getServicePlan(s.type, s.plan);
              const T = SERVICE_TYPES[s.type];
              const top = s.plan === PLAN_LEVELS[PLAN_LEVELS.length - 1];
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${T.color}`}>
                    <T.icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/services/${s.id}`} className="block truncate text-sm font-medium text-white hover:text-brand-200">
                      {s.name}
                    </Link>
                    <p className="truncate text-xs text-ink-400">
                      {T.label} · {plan.name} · {formatMb(plan.ramMb)} RAM · {plan.vcpu} vCPU
                    </p>
                  </div>
                  <span className="font-mono text-sm text-white">
                    {plan.price ? formatEuro(plan.price) : 'Free'}
                    {plan.price > 0 && <span className="text-xs text-ink-500">/mo</span>}
                  </span>
                  <Button size="sm" variant={top ? 'outline' : 'primary'} icon={top ? undefined : <Sparkles className="h-3.5 w-3.5" />} onClick={() => setEditingId(s.id)}>
                    {top ? 'Change plan' : 'Upgrade'}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Usage this period" description="September 15 – October 15, 2026" className="mb-6">
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

      <Panel title="Invoices" description={`${INVOICES.length} invoices`} bodyClass="p-0">
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
            {INVOICES.map((inv) => (
              <tr key={inv.id} className="transition hover:bg-white/[0.02]">
                <td className="px-5 py-3.5 font-mono text-white">{inv.number}</td>
                <td className="px-5 py-3.5 text-ink-300">{formatDate(inv.date)}</td>
                <td className="px-5 py-3.5 text-ink-300">{inv.plan}</td>
                <td className="px-5 py-3.5 font-mono text-white">{formatEuro(inv.amount)}</td>
                <td className="px-5 py-3.5">
                  <Badge tone="success">Paid</Badge>
                </td>
                <td className="px-5 py-3.5 text-right">
                  <Button variant="ghost" size="sm" icon={<Download className="h-4 w-4" />} onClick={() => downloadInvoice(inv, user.name)}>
                    Download
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="divide-y divide-white/[0.05] md:hidden">
          {INVOICES.map((inv) => (
            <div key={inv.id} className="flex items-center gap-3 px-5 py-4">
              <FileText className="h-5 w-5 shrink-0 text-ink-400" />
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm text-white">{inv.number}</p>
                <p className="text-xs text-ink-400">
                  {formatDate(inv.date)} · {inv.plan} · <span className="text-success-400">Paid</span>
                </p>
              </div>
              <span className="font-mono text-sm text-white">{formatEuro(inv.amount)}</span>
              <button onClick={() => downloadInvoice(inv, user.name)} className="rounded-lg p-2 text-ink-400 hover:bg-white/[0.06] hover:text-white" aria-label={`Download ${inv.number}`}>
                <Download className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </Panel>

      <ChangePlanModal service={editing} onClose={() => setEditingId(null)} />
    </>
  );
}
