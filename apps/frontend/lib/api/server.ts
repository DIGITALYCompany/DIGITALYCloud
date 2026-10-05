import type { StatusResponse } from '@digitalycloud/shared';
import { API_URL } from './http-client';

/** Base URL for server-side rendering (an internal address can be set for the Next.js server). */
const SERVER_API_URL = (process.env.API_INTERNAL_URL ?? API_URL).replace(/\/+$/, '');

/** `GET /status` for Server Components, revalidated every minute. Null when the API can't be reached. */
export async function fetchStatus(): Promise<StatusResponse | null> {
  try {
    const res = await fetch(`${SERVER_API_URL}/status`, { next: { revalidate: 60 }, signal: AbortSignal.timeout(5000) });
    return res.ok ? ((await res.json()) as StatusResponse) : null;
  } catch {
    return null;
  }
}
