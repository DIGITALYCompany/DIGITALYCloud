import type { Product } from '@/data/products';

/** Plan price as shown on plan cards: "€0" or "€2.99". */
export const formatPrice = (price: number) => (price === 0 ? '€0' : `€${price.toFixed(2)}`);

/** Entry price of a product (its first plan) as shown on product cards: "€0" or "€1.99". */
export const formatStartingPrice = (p: Product) => (p.plans[0].price === 0 ? '€0' : `€${p.plans[0].price}`);
