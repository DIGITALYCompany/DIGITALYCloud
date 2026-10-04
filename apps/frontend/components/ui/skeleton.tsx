import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />;
}

export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="card p-5">
      <Skeleton className="h-4 w-1/3" />
      <div className="mt-4 space-y-2.5">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className={cn('h-3', i % 2 ? 'w-2/3' : 'w-full')} />
        ))}
      </div>
    </div>
  );
}
