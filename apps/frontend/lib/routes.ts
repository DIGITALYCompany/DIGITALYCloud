import type { Route } from 'next';
import type { ProductSlug } from '@/data/products';

/**
 * Any internal URL kept in data (nav config, link lists): a static route, optionally with
 * `?query`/`#hash`, or a dynamic route. Literals are still checked against the route tree.
 */
export type AppHref = Route | `/products/${ProductSlug}` | `/docs/${string}` | `/legal/${string}` | `/services/${string}`;
