/**
 * Data access layer used by every page and provider.
 *
 * The current implementation is a browser-side simulation backed by localStorage.
 * To connect the real backend, replace `./mock-api` with an HTTP client that exposes
 * the same `api` shape; no component needs to change.
 */
export { api } from './mock-api';
export type { CreateServiceInput } from './mock-api';
