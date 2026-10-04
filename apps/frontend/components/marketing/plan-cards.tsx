import { Check, MapPin, Sparkles } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import type { ProductPlan } from '@/data/products';
import { TIER_COVERAGE, regionsForPlan } from '@/data/regions';
import { PLAN_LEVELS } from '@/lib/catalog';
import { cn } from '@/lib/utils';
import { formatPrice } from './pricing';

export function PlanCards({ plans }: { plans: ProductPlan[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {plans.map((plan, i) => {
        const tier = PLAN_LEVELS[Math.min(i, PLAN_LEVELS.length - 1)];
        const regions = regionsForPlan(tier);
        return (
          <div
            key={plan.name}
            className={cn(
              'relative flex animate-fade-up flex-col rounded-3xl p-6 transition-all duration-300 hover:-translate-y-1',
              plan.popular
                ? 'border border-transparent bg-[linear-gradient(#111,#111)_padding-box,linear-gradient(135deg,#2563FF,#12A8F0,#4FE3D3)_border-box] shadow-[0_20px_60px_-20px_rgba(37,99,255,0.5)]'
                : 'border border-white/[0.08] bg-ink-900/70 hover:border-white/15'
            )}
          >
            {plan.popular && (
              <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-brand-gradient px-3 py-1 text-xs font-medium text-white shadow-lg">
                <Sparkles className="h-3 w-3" /> Most Popular
              </span>
            )}
            <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-4xl font-semibold tracking-tight text-white">{formatPrice(plan.price)}</span>
              <span className="text-sm text-ink-400">/month</span>
            </div>
            <p className="mt-1 text-xs text-ink-400">{plan.price === 0 ? 'Free forever. No card required.' : 'VAT included. Cancel anytime.'}</p>
            <ul className="mt-6 flex-1 space-y-3 border-t border-white/[0.06] pt-6">
              {plan.specs.map((s) => (
                <li key={s} className="flex items-start gap-2.5 text-sm text-ink-200">
                  <Check className={cn('mt-0.5 h-4 w-4 shrink-0', plan.popular ? 'text-azure-400' : 'text-brand-300')} />
                  {s}
                </li>
              ))}
            </ul>
            <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3.5">
              <p className="flex items-center gap-2 text-sm font-medium text-white">
                <MapPin className="h-4 w-4 text-aqua-400" /> {TIER_COVERAGE[tier]}
              </p>
              <p className="mt-1 text-xs leading-5 text-ink-400">
                {regions.length} region{regions.length > 1 ? 's' : ''} ·{' '}
                {regions
                  .slice(0, 4)
                  .map((r) => r.city)
                  .join(', ')}
                {regions.length > 4 ? ` +${regions.length - 4}` : ''}
              </p>
            </div>
            <ButtonLink href="/signup" variant={plan.popular ? 'primary' : 'outline'} className="mt-6 w-full">
              {plan.price === 0 ? 'Start for free' : `Choose ${plan.name}`}
            </ButtonLink>
          </div>
        );
      })}
    </div>
  );
}
