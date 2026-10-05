import { MESSAGES } from '@digitalycloud/shared';

/**
 * Errors with a user-safe message. `details` are merged into the error body
 * (`{ error: { code, message, fields?, ...details } }`), e.g. `checkoutUrl`.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
    public readonly details?: Record<string, unknown>,
    public readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const validation = (message: string, field?: string) => new AppError(400, 'VALIDATION_ERROR', message, field ? { [field]: message } : undefined);
export const badRequest = (code: string, message: string, details?: Record<string, unknown>) => new AppError(400, code, message, undefined, details);
export const unauthenticated = (message: string = MESSAGES.notSignedIn) => new AppError(401, 'UNAUTHENTICATED', message);
export const invalidCredentials = (message: string = MESSAGES.credentials) => new AppError(401, 'INVALID_CREDENTIALS', message);
export const forbidden = (message: string = MESSAGES.forbidden, code = 'FORBIDDEN', details?: Record<string, unknown>) => new AppError(403, code, message, undefined, details);
export const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`);
export const conflict = (message: string, code = 'CONFLICT', fields?: Record<string, string>, details?: Record<string, unknown>) => new AppError(409, code, message, fields, details);
export const paymentRequired = (message: string, details: Record<string, unknown>, code = 'PAYMENT_METHOD_REQUIRED') => new AppError(402, code, message, undefined, details);
export const tooLarge = (message: string) => new AppError(413, 'PAYLOAD_TOO_LARGE', message);
export const rateLimited = (retryAfterSec: number) =>
  new AppError(429, 'RATE_LIMITED', 'Too many requests. Please wait a moment and try again.', undefined, { retryAfter: retryAfterSec }, { 'Retry-After': String(retryAfterSec) });
/** An optional integration is not configured on this deployment. */
export const notConfigured = (what: string, code = 'INTEGRATION_NOT_CONFIGURED') => new AppError(503, code, `${what} isn’t available on this server right now.`);
export const unavailable = (message: string, code = 'SERVICE_UNAVAILABLE', retryAfterSec?: number) =>
  new AppError(503, code, message, undefined, undefined, retryAfterSec ? { 'Retry-After': String(retryAfterSec) } : undefined);

/** MongoDB duplicate key error (E11000), raised by unique indexes. */
export function isDuplicateKey(err: unknown, indexName?: string): boolean {
  const e = err as { code?: number; message?: string; keyPattern?: Record<string, unknown>; errorResponse?: { errmsg?: string } };
  if (e?.code !== 11000) return false;
  if (!indexName) return true;
  const msg = e.message ?? e.errorResponse?.errmsg ?? '';
  return msg.includes(`index: ${indexName} `) || msg.includes(`index: ${indexName}\n`) || msg.endsWith(`index: ${indexName}`);
}

/** Duplicate key on a specific collection's index (e.g. `_id_` of `slug_reservations`). */
export function isDuplicateIn(err: unknown, collection: string, indexName: string) {
  const e = err as { code?: number; message?: string };
  return e?.code === 11000 && typeof e.message === 'string' && e.message.includes(`.${collection} `) && e.message.includes(`index: ${indexName}`);
}

