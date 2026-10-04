import { ArrowRight, Sparkles } from 'lucide-react';
import { getServicePlan, monthlyTotal } from '@/lib/catalog';
import { formatEuro } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Service, ServiceStatus } from '@/lib/types';

const SEGMENT: Record<ServiceStatus, string> = {
  running: 'bg-success-400 shadow-[0_0_8px_rgba(74,222,128,0.45)]',
  deploying: 'animate-pulse bg-brand-400',
  failed: 'bg-danger-500',
  stopped: 'bg-white/15',
};

/** Monthly spend and per-service health strip at the bottom of the sidebar. */
export function SidebarPlanCard({ services, onManage }: { services: Service[]; onManage: () => void }) {
  const total = monthlyTotal(services);
  const running = services.filter((s) => s.status === 'running').length;
  const offline = services.length - running;
  const paid = services.filter((s) => getServicePlan(s.type, s.plan).price > 0).length;

  return (
    <div className="rounded-2xl bg-linear-to-br/srgb from-brand-500/40 via-white/[0.06] to-azure-500/30 p-px">
      <div className="relative overflow-hidden rounded-[15px] bg-ink-900/95 p-4">
        <div className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-brand-500/25 blur-2xl" />

        <div className="relative flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-400">
            <Sparkles className="h-3 w-3 text-azure-400" /> Your plans
          </span>
          <span className="rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-ink-400">{paid} paid</span>
        </div>

        <p className="relative mt-2.5 font-mono text-[22px] font-medium leading-none tracking-tight text-white">
          {formatEuro(total)}
          <span className="ml-1 font-sans text-xs font-normal text-ink-400">/month</span>
        </p>

        <div className="relative mt-4 flex h-1.5 gap-1" role="img" aria-label={`${running} of ${services.length} services online`}>
          {services.length === 0 ? (
            <span className="h-full flex-1 rounded-full bg-white/[0.08]" />
          ) : (
            services.map((s) => <span key={s.id} title={`${s.name} · ${s.status}`} className={cn('h-full flex-1 rounded-full transition-colors duration-500', SEGMENT[s.status])} />)
          )}
        </div>

        <div className="relative mt-2 flex items-center gap-3 text-[11px] text-ink-400">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-success-400" /> {running} online
          </span>
          {offline > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-white/30" /> {offline} offline
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onManage}
          className="group relative mt-4 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] text-xs font-medium text-white transition hover:border-brand-400/40 hover:bg-brand-500/15"
        >
          Manage plans
          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </div>
  );
}
