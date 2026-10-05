import { Router } from 'express';
import { z } from 'zod';
import { API_KEY_SCOPES, MESSAGES, type ApiKeyDto } from '@digitalycloud/shared';
import { ApiKey, type ApiKeyDoc } from '../../db/models';
import { jsonSmall } from '../../http/body';
import { body } from '../../http/validate';
import { audit } from '../../lib/audit';
import { sha256 } from '../../lib/crypto';
import { notFound } from '../../lib/errors';
import { isId, newId, randomBase62 } from '../../lib/ids';
import { requireSession, sessionUser } from '../../middleware/authenticate';
import { authorize, tenantOf } from '../../middleware/tenant';

const createSchema = z.strictObject({
  name: z.string({ error: MESSAGES.apiKeyName }).trim().min(2, { error: MESSAGES.apiKeyName }).max(80, { error: 'Use at most 80 characters.' }),
  scope: z.enum(API_KEY_SCOPES, { error: 'Choose read or full access.' }),
});

export const apiKeyDto = (k: ApiKeyDoc): ApiKeyDto => ({ id: k._id, name: k.name, prefix: k.prefix, createdAt: k.createdAt.getTime(), lastUsed: k.lastUsedAt?.getTime() ?? null, scope: k.scope });

/**
 * API keys: `dgc_live_` + 32 random base-62 characters (≈190 bits), shown once. Only the SHA-256
 * hash is stored (fine for high-entropy secrets); the 13-character prefix is kept for display.
 * Revocation takes effect on the next request (no caching).
 */
export function apiKeysRouter() {
  const r = Router();
  r.use('/api-keys', requireSession, authorize('apiKeys.manage'));

  r.get('/api-keys', async (req, res) => {
    const rows = await ApiKey.find({ teamId: tenantOf(req).team._id, revokedAt: null }).sort({ createdAt: -1, _id: -1 }).limit(200).lean<ApiKeyDoc[]>();
    res.json({ data: rows.map(apiKeyDto), nextCursor: null });
  });

  r.post('/api-keys', jsonSmall, async (req, res) => {
    const input = body(req, createSchema);
    const secret = `dgc_live_${randomBase62(32)}`;
    const now = new Date();
    const doc: ApiKeyDoc = {
      _id: newId('apiKey'),
      teamId: tenantOf(req).team._id,
      createdBy: sessionUser(req).user._id,
      name: input.name,
      prefix: secret.slice(0, 13),
      secretHash: sha256(secret),
      scope: input.scope,
      createdAt: now,
      lastUsedAt: null,
      revokedAt: null,
      revokedReason: null,
    };
    await ApiKey.create(doc);
    await audit({ action: 'apikey.created', actorUserId: doc.createdBy, teamId: doc.teamId, targetType: 'api_key', targetId: doc._id, meta: { scope: doc.scope } });
    res.status(201).json({ key: apiKeyDto(doc), secret });
  });

  r.delete('/api-keys/:id', async (req, res) => {
    const id = String(req.params.id);
    if (!isId('apiKey', id)) throw notFound('API key');
    const r2 = await ApiKey.updateOne({ _id: id, teamId: tenantOf(req).team._id, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: 'revoked' } });
    if (r2.modifiedCount !== 1) throw notFound('API key');
    await audit({ action: 'apikey.revoked', actorUserId: sessionUser(req).user._id, teamId: tenantOf(req).team._id, targetType: 'api_key', targetId: id });
    res.status(204).end();
  });

  return r;
}
