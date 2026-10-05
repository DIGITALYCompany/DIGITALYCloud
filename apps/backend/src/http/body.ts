import express from 'express';

/**
 * Route-specific JSON parsers. There is no global parser: every route opts into a bounded limit.
 * The env payload limit fits the documented maximum (100 variables × 32 KB values) with room for
 * JSON escaping; ordinary endpoints accept 64 KB.
 */
export const jsonSmall = express.json({ limit: '64kb', type: 'application/json', strict: true });
export const jsonEnv = express.json({ limit: '8mb', type: 'application/json', strict: true });
