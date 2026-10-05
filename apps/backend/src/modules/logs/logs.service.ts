import { LOG_RETENTION_HOURS, LOG_LEVELS, type LogLevel, type LogLineDto } from '@digitalycloud/shared';
import { RuntimeLog, type RuntimeLogDoc, type ServiceDoc } from '../../db/models';
import { escapeRegExp } from '../../lib/text';

export const toLine = (l: Pick<RuntimeLogDoc, 'seq' | 'ts' | 'level' | 'text'>): LogLineDto => ({ id: l.seq, ts: l.ts.getTime(), level: l.level, text: l.text });

/**
 * Retention is enforced in queries, not only by cleanup: lines older than the current plan's
 * window are never returned (so a downgrade restricts access immediately), and free plans only
 * see the current deployment's logs.
 */
export function retentionFilter(svc: ServiceDoc) {
  return {
    serviceId: svc._id,
    ts: { $gte: new Date(Date.now() - LOG_RETENTION_HOURS[svc.plan] * 3600_000) },
    ...(svc.plan === 'free' ? { deploymentId: svc.activeDeploymentId ?? '__none__' } : {}),
  };
}

export function parseLevels(raw: string | undefined): LogLevel[] | null {
  if (!raw) return null;
  const levels = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (!levels.length || levels.some((l) => !(LOG_LEVELS as readonly string[]).includes(l))) return null;
  return levels as LogLevel[];
}

/** One page of history, oldest → newest; `nextCursor` points to older lines. */
export async function history(svc: ServiceDoc, opts: { limit: number; before?: number; levels?: LogLevel[] | null; q?: string }) {
  const filter: Record<string, unknown> = { ...retentionFilter(svc) };
  if (opts.before !== undefined) filter.seq = { $lt: opts.before };
  if (opts.levels) filter.level = { $in: opts.levels };
  if (opts.q) filter.text = { $regex: escapeRegExp(opts.q.slice(0, 200)), $options: 'i' };
  const rows = await RuntimeLog.find(filter).sort({ seq: -1 }).limit(opts.limit + 1).maxTimeMS(5000).lean<RuntimeLogDoc[]>();
  const more = rows.length > opts.limit;
  const page = (more ? rows.slice(0, opts.limit) : rows).reverse();
  return { data: page.map(toLine), nextCursor: more && page[0] ? String(page[0].seq) : null };
}

export async function linesAfter(svc: ServiceDoc, since: number, max: number) {
  return RuntimeLog.find({ ...retentionFilter(svc), seq: { $gt: since } }).sort({ seq: 1 }).limit(max + 1).lean<RuntimeLogDoc[]>();
}

export async function lastLines(svc: ServiceDoc, n: number) {
  return (await RuntimeLog.find(retentionFilter(svc)).sort({ seq: -1 }).limit(n).lean<RuntimeLogDoc[]>()).reverse();
}

export async function oldestSeq(svc: ServiceDoc) {
  return (await RuntimeLog.findOne(retentionFilter(svc)).sort({ seq: 1 }).lean<RuntimeLogDoc>())?.seq ?? null;
}
