import type { CookieOptions, Response } from 'express';
import type { AppConfig } from '../config/env';

export const SESSION_COOKIE = 'dgc_session';
export const CSRF_COOKIE = 'dgc_csrf';
export const OAUTH_COOKIE = 'dgc_oauth';

export const REMEMBER_MS = 30 * 24 * 3600_000;
export const SESSION_ONLY_MS = 12 * 3600_000;

/**
 * `dgc_session`: HttpOnly, SameSite=Lax, Secure in production. `COOKIE_DOMAIN` (e.g. cloud.digitaly.fr)
 * is only set so the Next.js proxy can see the cookie for its optimistic redirect; it never covers
 * customer runtime domains (validated in config). Remembered sessions get a 30-day Max-Age that
 * slides; other sessions are browser-session cookies with a 12-hour server-side expiry.
 */
export function sessionCookieOptions(cfg: AppConfig, remember: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: cfg.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    ...(cfg.COOKIE_DOMAIN ? { domain: cfg.COOKIE_DOMAIN } : {}),
    ...(remember ? { maxAge: REMEMBER_MS } : {}),
  };
}

export function setSessionCookie(res: Response, cfg: AppConfig, token: string, remember: boolean) {
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions(cfg, remember));
}

export function clearSessionCookie(res: Response, cfg: AppConfig) {
  const { maxAge: _ignored, ...opts } = sessionCookieOptions(cfg, false);
  res.clearCookie(SESSION_COOKIE, opts);
}

/** Host-only cookies read by the API alone. */
export function apiCookieOptions(cfg: AppConfig, maxAgeMs: number): CookieOptions {
  return { httpOnly: true, secure: cfg.COOKIE_SECURE, sameSite: 'lax', path: '/', maxAge: maxAgeMs };
}
