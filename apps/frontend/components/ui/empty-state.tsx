import type { ReactNode } from 'react';
import { AlertOctagon, RefreshCw } from 'lucide-react';
import { Button } from './button';

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="relative mb-5">
        <div className="absolute inset-0 rounded-2xl bg-brand-gradient opacity-30 blur-xl" />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-ink-850 text-brand-300">{icon}</div>
      </div>
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-ink-300">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-danger-500/10 text-danger-400">
        <AlertOctagon className="h-6 w-6" />
      </div>
      <h3 className="font-semibold text-white">Something went wrong</h3>
      <p className="mt-1 max-w-sm text-sm text-ink-300">{message}</p>
      {onRetry && (
        <Button variant="outline" className="mt-5" icon={<RefreshCw className="h-4 w-4" />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
