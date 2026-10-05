import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { MESSAGES } from '@digitalycloud/shared';
import { AppError, isDuplicateKey } from '../lib/errors';
import { zodToAppError } from '../http/validate';

export const notFoundHandler: RequestHandler = (_req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'Not found'));

/** Maps errors to `{ error: { code, message, fields?, ...details } }`. Internals are logged, never returned. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let e: AppError;
  const anyErr = err as { type?: string; status?: number; name?: string };
  if (err instanceof AppError) e = err;
  else if (err instanceof ZodError) e = zodToAppError(err);
  else if (anyErr?.type === 'entity.parse.failed') e = new AppError(400, 'VALIDATION_ERROR', 'Invalid JSON body.');
  else if (anyErr?.type === 'entity.too.large') e = new AppError(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.');
  else if (anyErr?.type === 'encoding.unsupported' || anyErr?.type === 'charset.unsupported') e = new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported request encoding.');
  else if (isDuplicateKey(err)) e = new AppError(409, 'CONFLICT', 'This already exists.');
  else if (anyErr?.name === 'ValidationError' || anyErr?.name === 'CastError') {
    req.log?.warn({ err }, 'model validation rejected a write');
    e = new AppError(400, 'VALIDATION_ERROR', 'Invalid value.');
  } else {
    req.log?.error({ err }, 'unhandled error');
    e = new AppError(500, 'INTERNAL', MESSAGES.internal);
  }

  if (res.headersSent) {
    res.end();
    return;
  }
  if (e.headers) for (const [k, v] of Object.entries(e.headers)) res.setHeader(k, v);
  res.status(e.status).json({ error: { code: e.code, message: e.message, ...(e.fields ? { fields: e.fields } : {}), ...(e.details ?? {}) } });
};
