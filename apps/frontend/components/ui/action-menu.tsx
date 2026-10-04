'use client';

import type { ReactNode } from 'react';
import { DropdownMenu } from 'radix-ui';
import { cn } from '@/lib/utils';

export interface ActionMenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/** Dropdown of actions (row "more" menus). Keyboard accessible; positioned like the original absolute menu. */
export function ActionMenu({ trigger, items, align = 'right', up = false }: { trigger: ReactNode; items: ActionMenuItem[]; align?: 'left' | 'right'; up?: boolean }) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side={up ? 'top' : 'bottom'}
          align={align === 'right' ? 'end' : 'start'}
          sideOffset={8}
          avoidCollisions={false}
          className={cn(
            'z-50 min-w-[200px] animate-scale-in rounded-xl border border-white/10 bg-ink-850/95 p-1.5 shadow-2xl shadow-black/60 backdrop-blur-xl outline-hidden',
            align === 'right' ? 'origin-top-right' : 'origin-top-left'
          )}
        >
          {items.map((it) => (
            <DropdownMenu.Item
              key={it.label}
              disabled={it.disabled}
              onSelect={it.onClick}
              className={cn(
                'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm outline-hidden transition data-[disabled]:cursor-default data-[disabled]:opacity-40',
                it.danger
                  ? 'text-danger-400 hover:bg-danger-500/10 data-[highlighted]:bg-danger-500/10'
                  : 'text-ink-200 hover:bg-white/[0.06] hover:text-white data-[highlighted]:bg-white/[0.06] data-[highlighted]:text-white'
              )}
            >
              {it.icon && <span className="h-4 w-4 shrink-0 [&>svg]:h-4 [&>svg]:w-4">{it.icon}</span>}
              {it.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
