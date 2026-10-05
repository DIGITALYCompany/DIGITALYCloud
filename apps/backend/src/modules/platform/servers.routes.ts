import { Router } from 'express';
import { z } from 'zod';
import { getRegion, regionLabel, type ServerDto } from '@digitalycloud/shared';
import { Server, ServerMetricSample, type ServerDoc, type ServerMetricSampleDoc } from '../../db/models';
import { query } from '../../http/validate';
import { requireSession } from '../../middleware/authenticate';
import { authorize } from '../../middleware/tenant';
import { bucketsFor } from '../metrics/metrics.service';

const FRESH_MS = 5 * 60_000;
const loadSchema = z.strictObject({ range: z.enum(['24h']).default('24h'), team: z.string().max(64).optional() });

/** Customer-facing host view. Never includes Docker endpoints, private addresses or credentials; demo records are excluded. */
export function serverDto(s: ServerDoc, latest: ServerMetricSampleDoc | null): ServerDto {
  const region = getRegion(s.regionId);
  const fresh = latest && Date.now() - latest.ts.getTime() < FRESH_MS ? latest : null;
  return {
    id: s._id,
    name: s.name,
    status: s.status,
    cpu: fresh?.cpu ?? null,
    ram: fresh?.ram ?? null,
    storage: fresh?.storage ?? null,
    containers: fresh?.containers ?? null,
    region: region ? regionLabel(region) : s.regionId,
    regionId: s.regionId,
    country: region?.countryCode ?? '',
    ip: s.publicIp,
    cores: s.hardware.cores,
    memoryGb: s.hardware.memoryGb,
    diskTb: s.hardware.diskTb,
    uptimeDays: s.bootedAt ? Math.floor((Date.now() - s.bootedAt.getTime()) / 86400_000) : null,
    sampledAt: fresh?.ts.getTime() ?? null,
  };
}

export async function publicServers() {
  const servers = await Server.find({ demo: false, status: { $ne: 'offline' } }).sort({ regionId: 1, name: 1 }).lean<ServerDoc[]>();
  const out: ServerDto[] = [];
  for (const s of servers) out.push(serverDto(s, await ServerMetricSample.findOne({ serverId: s._id }).sort({ ts: -1 }).lean<ServerMetricSampleDoc>()));
  return out;
}

export function serversRouter() {
  const r = Router();
  r.get('/servers', requireSession, authorize('servers.read'), async (_req, res) => {
    res.json({ data: await publicServers(), nextCursor: null });
  });

  /** Hourly average CPU per region over the last 24 hours (null where no samples exist). */
  r.get('/servers/load', requireSession, authorize('servers.read'), async (req, res) => {
    query(req, loadSchema);
    const { start, sizeMs, buckets } = bucketsFor('24h');
    const servers = await Server.find({ demo: false }, { regionId: 1 }).lean<Pick<ServerDoc, '_id' | 'regionId'>[]>();
    const regionOf = new Map(servers.map((s) => [s._id, s.regionId]));
    const rows = await ServerMetricSample.aggregate<{ _id: { b: number; s: string }; cpu: number }>([
      { $match: { serverId: { $in: [...regionOf.keys()] }, ts: { $gte: new Date(start) } } },
      { $group: { _id: { b: { $floor: { $divide: [{ $subtract: [{ $toLong: '$ts' }, start] }, sizeMs] } }, s: '$serverId' }, cpu: { $avg: '$cpu' } } },
    ]);
    const regions = [...new Set(regionOf.values())];
    const data = Array.from({ length: buckets }, (_, i) => {
      const point: Record<string, number | null> = { ts: start + i * sizeMs };
      for (const reg of regions) {
        const vals = rows.filter((r) => r._id.b === i && regionOf.get(r._id.s) === reg).map((r) => r.cpu);
        point[reg] = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
      }
      return point;
    });
    res.json({ data, nextCursor: null });
  });
  return r;
}
