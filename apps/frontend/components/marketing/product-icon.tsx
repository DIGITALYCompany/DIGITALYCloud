import type { Product } from '@/data/products';
import { cn } from '@/lib/utils';

/** Accent-coloured icon tile for a product. Size and radius come from `className`. */
export function ProductIcon({ product, className, iconClassName = 'h-5 w-5' }: { product: Product; className?: string; iconClassName?: string }) {
  return (
    <span className={cn('flex items-center justify-center ring-1', product.accent.bg, product.accent.ring, product.accent.text, className)}>
      <product.icon className={iconClassName} />
    </span>
  );
}
