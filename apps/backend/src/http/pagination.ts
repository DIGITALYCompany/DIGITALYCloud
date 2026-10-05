import { validation } from '../lib/errors';

/** Opaque cursor over `(createdAt desc, _id desc)`: base64url JSON of the last item's sort key. */
export function encodeCursor(createdAt: Date, id: string) {
  return Buffer.from(JSON.stringify([createdAt.getTime(), id])).toString('base64url');
}

export function decodeCursor(cursor: string | undefined): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const v = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown;
    if (!Array.isArray(v) || typeof v[0] !== 'number' || typeof v[1] !== 'string' || v[1].length > 64) throw new Error();
    return { createdAt: new Date(v[0]), id: v[1] };
  } catch {
    throw validation('Invalid cursor.', 'cursor');
  }
}

/** MongoDB filter for "after this cursor" in descending order (stable tie-break on `_id`). */
export function afterCursor(c: { createdAt: Date; id: string } | null, field = 'createdAt') {
  if (!c) return {};
  return { $or: [{ [field]: { $lt: c.createdAt } }, { [field]: c.createdAt, _id: { $lt: c.id } }] };
}

/** Fetches `limit + 1` rows to know whether another page exists. */
export function page<T extends { _id: string; createdAt: Date }>(rows: T[], limit: number) {
  const more = rows.length > limit;
  const items = more ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return { items, nextCursor: more && last ? encodeCursor(last.createdAt, last._id) : null };
}
