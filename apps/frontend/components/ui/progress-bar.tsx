import { cn } from '@/lib/utils';

type ProgressTone = 'brand' | 'success' | 'warning' | 'danger';

const FILL: Record<ProgressTone, string> = {
  brand: 'bg-brand-gradient',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
};

/** The default brand tone turns amber above 70% and red above 85%. */
export function ProgressBar({ value, tone = 'brand', className }: { value: number; tone?: ProgressTone; className?: string }) {
  const auto = tone === 'brand' && value >= 85 ? 'danger' : tone === 'brand' && value >= 70 ? 'warning' : tone;
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]', className)}>
      <div className={cn('h-full rounded-full transition-all duration-700', FILL[auto])} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}
