import { cn } from '@/lib/utils';

/** Soft brand glow behind the top of a marketing page. */
export function HeroGlow({ className = 'h-[400px] w-[800px]' }: { className?: string }) {
  return <div className={cn('pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-full bg-brand-500/15 blur-[120px]', className)} />;
}
