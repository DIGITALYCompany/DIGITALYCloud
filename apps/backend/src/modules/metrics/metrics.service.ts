import type { MetricPointDto, MetricRange, MetricsResponse, ServiceMetricsEvent, UsagePointDto } from '@digitalycloud/shared';
import { ctx } from '../../context';
import { MetricSample, type ServiceDoc } from '../../db/models';
import { seriesKey } from '../../runtime/collectors';

const HOUR = 3600_000;
export const RANGES: Record<Exclude<MetricRange, 'live'>, { buckets: number; sizeMs: number }> = {
  '24h': { buckets: 24, sizeMs: HOUR },
  '7d': { buckets: 28, sizeMs: 6 * HOUR },
  '30d': { buckets: 30, sizeMs: 24 * HOUR },
};

/** Bucket boundaries aligned to UTC, ending with the bucket that contains "now". */
export function bucketsFor(range: keyof typeof RANGES, now = Date.now()) {
  const { buckets, sizeMs } = RANGES[range];
  const lastStart = Math.floor(now / sizeMs) * sizeMs;
  const start = lastStart - (buckets - 1) * sizeMs;
  return { start, sizeMs, buckets };
}

const r1 = (n: number | null | undefined) => (n === null || n === undefined ? null : Math.round(n * 10) / 10);

/**
 * Metric history. Units: CPU % of the plan's allocation, RAM/disk MB, network KB/s.
 * Buckets without samples are `null` (a gap), never invented values or zeros.
 */
export async function serviceMetrics(svc: ServiceDoc, range: MetricRange): Promise<MetricsResponse> {
  if (range === 'live') {
    const raw = await ctx().redis.lrange(seriesKey(ctx(), svc._id), 0, 39).catch(() => [] as string[]);
    const data = raw
      .map((s) => JSON.parse(s) as ServiceMetricsEvent)
      .reverse()
      .map((e) => ({ ts: e.ts, cpu: e.cpu, ram: e.ramMb, netIn: e.netIn, netOut: e.netOut, disk: e.storageMb }));
    return { range, intervalSec: 2, data };
  }
  const { start, sizeMs, buckets } = bucketsFor(range);
  const rows = await MetricSample.aggregate<{ _id: number; cpu: number; ram: number; netIn: number; netOut: number; disk: number | null }>([
    { $match: { serviceId: svc._id, ts: { $gte: new Date(start) } } },
    { $group: { _id: { $floor: { $divide: [{ $subtract: [{ $toLong: '$ts' }, start] }, sizeMs] } }, cpu: { $avg: '$cpu' }, ram: { $avg: '$ramMb' }, netIn: { $avg: '$netIn' }, netOut: { $avg: '$netOut' }, disk: { $max: '$diskMb' } } },
  ]);
  const byBucket = new Map(rows.map((r) => [r._id, r]));
  const data: MetricPointDto[] = Array.from({ length: buckets }, (_, i) => {
    const r = byBucket.get(i);
    return { ts: start + i * sizeMs, cpu: r1(r?.cpu), ram: r ? Math.round(r.ram) : null, netIn: r1(r?.netIn), netOut: r1(r?.netOut), disk: r?.disk ?? null };
  });
  return { range, intervalSec: sizeMs / 1000, data };
}

/**
 * Team usage for the dashboard: capacity-weighted CPU (Σ cpu·vCPU / Σ vCPU) and memory as a share
 * of allocated RAM (Σ ram / Σ limit), per hour. Hours without samples are `null`.
 */
export async function teamUsage(teamId: string): Promise<UsagePointDto[]> {
  const { start, sizeMs, buckets } = bucketsFor('24h');
  const rows = await MetricSample.aggregate<{ _id: number; cpuW: number; vcpu: number; ram: number; limit: number }>([
    { $match: { teamId, ts: { $gte: new Date(start) } } },
    {
      $group: {
        _id: { b: { $floor: { $divide: [{ $subtract: [{ $toLong: '$ts' }, start] }, sizeMs] } }, s: '$serviceId' },
        cpu: { $avg: '$cpu' },
        ram: { $avg: '$ramMb' },
        vcpu: { $last: '$vcpu' },
        limit: { $last: '$ramLimitMb' },
      },
    },
    { $group: { _id: '$_id.b', cpuW: { $sum: { $multiply: ['$cpu', '$vcpu'] } }, vcpu: { $sum: '$vcpu' }, ram: { $sum: '$ram' }, limit: { $sum: '$limit' } } },
  ]);
  const byBucket = new Map(rows.map((r) => [r._id, r]));
  return Array.from({ length: buckets }, (_, i) => {
    const r = byBucket.get(i);
    return { ts: start + i * sizeMs, cpu: r && r.vcpu > 0 ? r1(r.cpuW / r.vcpu) : null, ram: r && r.limit > 0 ? r1((r.ram / r.limit) * 100) : null };
  });
}
