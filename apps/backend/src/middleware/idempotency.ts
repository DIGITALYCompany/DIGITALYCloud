import type { NextFunction, Request, Response } from 'express';
import { IdempotencyRecord } from '../db/models';
import { sha256 } from '../lib/crypto';
import { AppError, conflict, isDuplicateKey } from '../lib/errors';

const KEY_RE = /^[A-Za-z0-9_.:-]{8,100}$/;
const TTL_MS = 24 * 3600_000;

/**
 * Optional `Idempotency-Key` for retried writes (CI scripts, flaky networks). The first response is
 * stored for 24 hours and replayed for the same key and body; a different body is rejected.
 */
export function idempotent(scope: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = req.get('idempotency-key');
    if (!key) return next();
    if (!KEY_RE.test(key)) throw new AppError(400, 'VALIDATION_ERROR', 'Idempotency-Key must be 8–100 letters, digits, dots, dashes or underscores.');
    const principal = req.auth?.kind === 'session' ? req.auth.user._id : req.auth?.kind === 'apiKey' ? req.auth.key._id : 'anon';
    const id = `${principal}:${scope}:${req.params.id ?? ''}:${key}`;
    const requestHash = sha256(JSON.stringify(req.body ?? {}));
    const existing = await IdempotencyRecord.findById(id).lean();
    if (existing) {
      if (existing.requestHash !== requestHash) throw new AppError(422, 'IDEMPOTENCY_MISMATCH', 'This Idempotency-Key was already used with a different request.');
      if (existing.state === 'pending' || !existing.response) throw conflict('A request with this Idempotency-Key is still being processed.');
      res.setHeader('Idempotent-Replayed', 'true');
      res.status(existing.response.status).json(existing.response.body);
      return;
    }
    try {
      await IdempotencyRecord.create({ _id: id, requestHash, state: 'pending', response: null, createdAt: new Date(), expiresAt: new Date(Date.now() + TTL_MS) });
    } catch (e) {
      if (isDuplicateKey(e)) throw conflict('A request with this Idempotency-Key is still being processed.');
      throw e;
    }
    const json = res.json.bind(res);
    res.json = (body: unknown) => {
      const status = res.statusCode;
      // Only successful outcomes are stored; failed attempts may be retried with the same key.
      if (status < 400) void IdempotencyRecord.updateOne({ _id: id }, { $set: { state: 'done', response: { status, body } } }).catch(() => {});
      else void IdempotencyRecord.deleteOne({ _id: id }).catch(() => {});
      return json(body);
    };
    res.on('close', () => {
      if (!res.writableFinished) void IdempotencyRecord.deleteOne({ _id: id, state: 'pending' }).catch(() => {});
    });
    next();
  };
}
