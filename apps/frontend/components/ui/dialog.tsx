'use client';

import type { ComponentProps } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { isToastEvent } from '@/lib/toast-events';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;
export const DialogClose = DialogPrimitive.Close;

const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-5xl' };

export type DialogSize = keyof typeof widths;


/** Bottom sheet on mobile, centered panel from `sm` up. */
export function DialogContent({ size = 'md', className, children, onInteractOutside, ...props }: ComponentProps<typeof DialogPrimitive.Content> & { size?: DialogSize }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-6">
        <div aria-hidden className="absolute inset-0 animate-fade-in bg-black/70 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className={cn(
            'relative max-h-[92vh] w-full animate-scale-in overflow-y-auto rounded-t-3xl border border-white/10 bg-ink-900 shadow-2xl shadow-black/60 outline-hidden sm:rounded-3xl',
            widths[size],
            className
          )}
          onInteractOutside={(e) => {
            if (isToastEvent(e.detail.originalEvent)) e.preventDefault();
            onInteractOutside?.(e);
          }}
          {...props}
        >
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Overlay>
    </DialogPrimitive.Portal>
  );
}
