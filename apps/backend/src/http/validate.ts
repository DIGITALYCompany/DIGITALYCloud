import { z, type ZodType } from 'zod';
import type { Request } from 'express';
import { AppError } from '../lib/errors';

/**
 * Request validation. Bodies and queries are always parsed through strict schemas (unknown fields
 * rejected, only expected types accepted), so no client object ever reaches a MongoDB query.
 */
export function parse<T extends ZodType>(schema: T, data: unknown): z.infer<T> {
  return schema.parse(data);
}

export const body = <T extends ZodType>(req: Request, schema: T): z.infer<T> => parse(schema, req.body ?? {});
export const query = <T extends ZodType>(req: Request, schema: T): z.infer<T> => parse(schema, req.query ?? {});

/** Converts a Zod error into the documented error body. */
export function zodToAppError(err: z.ZodError): AppError {
  const fields: Record<string, string> = {};
  let message: string | null = null;
  for (const issue of err.issues) {
    let msg = issue.message;
    if (issue.code === 'unrecognized_keys') msg = `Unexpected field: ${issue.keys.join(', ')}.`;
    else if (issue.code === 'invalid_type' && issue.path.length === 0) msg = 'Invalid request body.';
    const key = issue.path.length ? issue.path.join('.') : issue.code === 'unrecognized_keys' ? issue.keys[0]! : '_';
    fields[key] ??= msg;
    message ??= msg;
  }
  return new AppError(400, 'VALIDATION_ERROR', message ?? 'Invalid request.', fields);
}

// Reusable schema pieces --------------------------------------------------------------------------

/** A required string field with one friendly message for every failure (missing, wrong type, empty). */
export const str = (message: string, max = 10_000) => z.string({ error: message }).max(max, { error: message });

export const limitParam = (def = 50, max = 100) => z.coerce.number({ error: 'limit must be a number' }).int().min(1).max(max).default(def);
export const cursorParam = z.string().max(200).regex(/^[A-Za-z0-9_-]+$/, { error: 'Invalid cursor.' }).optional();
