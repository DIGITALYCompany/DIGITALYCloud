import type { NextFunction, Request, Response } from 'express';
import { ctx } from '../context';
import { CSRF_COOKIE, apiCookieOptions } from '../http/cookies';
import { forbidden } from '../lib/errors';
import { randomToken, safeEqual } from '../lib/crypto';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
export const CSRF_HEADER = 'x-csrf-token';
const CSRF_COOKIE_MS = 180 * 24 * 3600_000;

function originOf(url: string | undefined) {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** The browser-visible token is an HMAC of the HttpOnly `dgc_csrf` cookie value. */
export const csrfTokenFor = (cookieValue: string) => ctx().secrets.hmac('csrf', cookieValue);

/** Ensures the browser has a CSRF cookie and returns the matching header token. */
export function issueCsrfToken(req: Request, res: Response) {
  let value = req.cookies?.[CSRF_COOKIE] as string | undefined;
  if (!value || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
    value = randomToken(32);
    res.cookie(CSRF_COOKIE, value, apiCookieOptions(ctx().config, CSRF_COOKIE_MS));
  }
  return csrfTokenFor(value);
}

/**
 * CSRF protection for every unsafe browser request (JSON, multipart and bodyless actions alike):
 * 1. the `Origin` (or `Referer`) must exactly match an allowed frontend origin, and
 * 2. `X-CSRF-Token` must match the HMAC of the `dgc_csrf` cookie (signed double submit).
 * This covers login and signup too (login CSRF). Exemptions: bearer API-key requests (no cookies
 * are used) and signature-verified webhooks. OAuth callbacks are GET requests with state checks.
 */
export function csrfProtection(req: Request, _res: Response, next: NextFunction) {
  if (SAFE.has(req.method)) return next();
  if (req.path.startsWith('/v1/webhooks/')) return next();
  if (req.get('authorization')?.startsWith('Bearer ')) return next();

  const origin = req.get('origin') ?? originOf(req.get('referer'));
  if (!origin || !ctx().config.corsOrigins.includes(origin)) throw forbidden('This request was blocked because it came from an unexpected origin.', 'CSRF_ORIGIN_REJECTED');

  const cookie = req.cookies?.[CSRF_COOKIE] as string | undefined;
  const header = req.get(CSRF_HEADER);
  if (!cookie || !header || !safeEqual(header, csrfTokenFor(cookie))) {
    throw forbidden('Your security token expired. Reload the page and try again.', 'CSRF_TOKEN_INVALID');
  }
  next();
}
