'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Bell, CheckCircle2, RefreshCw } from 'lucide-react';
import { AreaSeriesChart, CHART_COLORS, Sparkline } from '@/components/charts/charts';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/providers/toast-provider';
import { useLiveSeries } from '@/hooks/use-live-series';
import type { Region } from '@/data/regions';
import { statusHistory } from '@/data/status';
import { dayLabel } from '@/lib/simulation';
import { isValidEmail } from '@/lib/validation';

function useSecondsSince(intervalMs = 30_000) {
  const [checkedAt, setCheckedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const refresh = setInterval(() => setCheckedAt(Date.now()), intervalMs);
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, [intervalMs]);
  const refresh = () => {
    setCheckedAt(Date.now());
    setNow(Date.now());
  };
  return { seconds: Math.max(0, Math.floor((now - checkedAt) / 1000)), refresh };
}

/** "All systems operational" banner with a self-refreshing "checked Xs ago" indicator. */
export function StatusBanner() {
  const { seconds, refresh } = useSecondsSince();
  return (
    <div className="relative mt-10 overflow-hidden rounded-3xl border border-success-500/25 bg-linear-to-br/srgb from-success-500/[0.10] via-success-500/[0.04] to-transparent p-6 sm:p-8">
      <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-success-500/20 blur-3xl" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-success-500/15 ring-1 ring-success-500/30">
            <span className="absolute inset-0 animate-ping rounded-2xl bg-success-500/10" />
            <CheckCircle2 className="relative h-7 w-7 text-success-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold leading-tight text-white sm:text-2xl sm:leading-8">All systems operational</h2>
            <p className="mt-1 text-sm text-ink-300">Every service and region is running normally.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="group inline-flex items-center gap-2 self-start rounded-full border border-white/10 bg-ink-950/40 px-3 py-1.5 text-xs text-ink-300 transition hover:border-white/20 hover:text-white sm:self-auto"
        >
          <RefreshCw className="h-3.5 w-3.5 transition-transform duration-500 group-hover:rotate-180" />
          Checked {seconds < 5 ? 'just now' : `${seconds}s ago`}
        </button>
      </div>
    </div>
  );
}

export function RegionCard({ region }: { region: Region }) {
  const data = useLiveSeries(`status-${region.id}`, (random) => ({ ms: +(region.latencyMs + random() * 6 - 3).toFixed(1) }), 24, 2500);
  const last = data[data.length - 1]?.ms as number;
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-medium text-white">
            <span className="relative flex h-2 w-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-success-400 opacity-60" />
              <span className="relative h-2 w-2 rounded-full bg-success-400" />
            </span>
            {region.city}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-ink-400">
            {region.code} · {region.country}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-lg font-medium leading-none text-white">
            {last?.toFixed(0)}
            <span className="ml-0.5 text-xs text-ink-400">ms</span>
          </p>
          <p className="mt-1 text-[11px] text-ink-400">From Paris</p>
        </div>
      </div>
      <div className="mt-4">
        <Sparkline data={data} dataKey="ms" color={CHART_COLORS.secondary} height={44} />
      </div>
    </div>
  );
}

export function StatusCharts() {
  const history = useMemo(() => statusHistory(dayLabel(30)), []);
  return (
    <div className="mt-14 grid gap-4 lg:grid-cols-2">
      <div className="card p-6">
        <h3 className="font-medium text-white">Platform uptime</h3>
        <p className="text-xs text-ink-400">Last 30 days</p>
        <div className="mt-4">
          <AreaSeriesChart data={history} series={[{ key: 'uptime', name: 'Uptime', color: CHART_COLORS.green, unit: '%' }]} yDomain={[99.8, 100]} height={200} />
        </div>
      </div>
      <div className="card p-6">
        <h3 className="font-medium text-white">API response time</h3>
        <p className="text-xs text-ink-400">Daily average, last 30 days</p>
        <div className="mt-4">
          <AreaSeriesChart data={history} series={[{ key: 'latency', name: 'Latency', color: CHART_COLORS.primary, unit: 'ms' }]} height={200} />
        </div>
      </div>
    </div>
  );
}

export function SubscribeButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" icon={<Bell className="h-4 w-4" />} onClick={() => setOpen(true)} className="self-start sm:self-auto">
        Subscribe to updates
      </Button>
      <SubscribeModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function SubscribeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [prefs, setPrefs] = useState({ incidents: true, maintenance: true });
  const valid = isValidEmail(email.trim());

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    toast({ kind: 'success', title: 'You are subscribed', description: `Status updates will be sent to ${email.trim()}.` });
    setEmail('');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Subscribe to status updates"
      description="Get an email as soon as we open, update or resolve an incident."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="status-subscribe" disabled={!valid}>
            Subscribe
          </Button>
        </>
      }
    >
      <form id="status-subscribe" onSubmit={submit} className="space-y-5">
        <div>
          <label className="label" htmlFor="status-email">
            Email address
          </label>
          <input id="status-email" type="email" className="input" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </div>
        <div className="space-y-2">
          {(
            [
              ['incidents', 'Incidents', 'Outages and degraded performance'],
              ['maintenance', 'Scheduled maintenance', 'Planned work, sent 48h in advance'],
            ] as const
          ).map(([key, title, desc]) => (
            <label key={key} className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.08] p-3 transition hover:border-white/15">
              <input type="checkbox" className="mt-1 accent-brand-500" checked={prefs[key]} onChange={(e) => setPrefs((p) => ({ ...p, [key]: e.target.checked }))} />
              <span>
                <span className="block text-sm font-medium text-white">{title}</span>
                <span className="block text-xs text-ink-400">{desc}</span>
              </span>
            </label>
          ))}
        </div>
      </form>
    </Modal>
  );
}
