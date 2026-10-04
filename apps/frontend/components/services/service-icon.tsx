import { SERVICE_TYPES } from '@/lib/catalog';
import { cn } from '@/lib/utils';
import type { Service } from '@/lib/types';

export function ServiceIcon({ service, size = 'md' }: { service: Service; size?: 'md' | 'lg' }) {
  const T = SERVICE_TYPES[service.type];
  return (
    <span className={cn('flex shrink-0 items-center justify-center ring-1', T.color, size === 'lg' ? 'h-12 w-12 rounded-2xl [&>svg]:h-6 [&>svg]:w-6' : 'h-10 w-10 rounded-xl [&>svg]:h-5 [&>svg]:w-5')}>
      <T.icon />
    </span>
  );
}
