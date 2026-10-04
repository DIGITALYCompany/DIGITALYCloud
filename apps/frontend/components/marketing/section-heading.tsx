import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-xs font-medium uppercase tracking-[0.18em] text-brand-300', className)}>{children}</p>;
}

export function SectionHeading({ eyebrow, title, description, center = true }: { eyebrow: string; title: ReactNode; description?: string; center?: boolean }) {
  return (
    <div className={center ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h2>
      {description && <p className="mt-4 text-base text-ink-300 sm:text-lg">{description}</p>}
    </div>
  );
}
