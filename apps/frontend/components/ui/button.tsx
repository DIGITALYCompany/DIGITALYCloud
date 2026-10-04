import type { ComponentProps, ReactNode } from 'react';
import type { Route } from 'next';
import Link from 'next/link';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-all duration-200 outline-hidden focus-visible:ring-4 focus-visible:ring-brand-500/30 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
  {
    variants: {
      variant: {
        primary:
          'bg-brand-gradient text-white shadow-[0_8px_24px_-8px_rgba(37,99,255,0.6)] hover:shadow-[0_10px_32px_-6px_rgba(18,168,240,0.6)] hover:brightness-110',
        secondary: 'bg-white text-ink-950 hover:bg-ink-100',
        outline: 'border border-white/10 bg-white/[0.03] text-ink-100 hover:border-white/20 hover:bg-white/[0.07]',
        ghost: 'text-ink-300 hover:bg-white/[0.06] hover:text-ink-100',
        danger: 'bg-danger-500/10 text-danger-400 ring-1 ring-inset ring-danger-500/25 hover:bg-danger-500/20',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-[15px]',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

type ButtonVariantProps = VariantProps<typeof buttonVariants>;

interface ButtonProps extends ComponentProps<'button'>, ButtonVariantProps {
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ variant, size, loading, icon, className, children, disabled, ...props }: ButtonProps) {
  return (
    <button data-slot="button" className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

interface ButtonLinkProps<T extends string> extends ButtonVariantProps {
  href: Route<T>;
  className?: string;
  icon?: ReactNode;
  children: ReactNode;
}

export function ButtonLink<T extends string>({ href, variant, size, className, icon, children }: ButtonLinkProps<T>) {
  return (
    <Link href={href} className={cn(buttonVariants({ variant, size }), className)}>
      {icon}
      {children}
    </Link>
  );
}
