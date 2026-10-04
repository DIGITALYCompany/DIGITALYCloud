'use client';

import { Switch as SwitchPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onChange}
      aria-label={label}
      className={cn('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors', checked ? 'bg-brand-gradient' : 'bg-ink-600')}
    >
      <SwitchPrimitive.Thumb className={cn('inline-block h-5 w-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} />
    </SwitchPrimitive.Root>
  );
}
