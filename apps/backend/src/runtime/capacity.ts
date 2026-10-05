import type { ClientSession } from 'mongoose';
import { planLimits, type PlanId, type ServiceType } from '@digitalycloud/shared';
import { CapacityReservation, Server, type CapacityReservationDoc, type Resources, type ServerDoc } from '../db/models';
import { newId } from '../lib/ids';

/** A server that misses heartbeats for this long is not considered for placement. */
export const HEARTBEAT_STALE_MS = 3 * 60_000;

/** CPU, memory and disk a plan reserves on its host. */
export function planResources(type: ServiceType, plan: PlanId): Resources {
  const l = planLimits(type, plan);
  return { cpuMillis: l.cpuMillis, memoryMb: l.ramLimitMb, storageMb: l.storageLimitMb };
}

/** Hosts eligible for new placements: real (not demo), healthy, accepting work and recently seen. */
export function placementFilter(regionId?: string) {
  return {
    ...(regionId ? { regionId } : {}),
    status: 'healthy' as const,
    acceptingWorkloads: true,
    demo: false,
    roles: 'runtime' as const,
    lastHeartbeatAt: { $gte: new Date(Date.now() - HEARTBEAT_STALE_MS) },
  };
}

const fits = (s: Pick<ServerDoc, 'capacity' | 'reserved'>, need: Resources) =>
  s.reserved.cpuMillis + need.cpuMillis <= s.capacity.cpuMillis &&
  s.reserved.memoryMb + need.memoryMb <= s.capacity.memoryMb &&
  s.reserved.storageMb + need.storageMb <= s.capacity.storageMb;

/** Region availability: a configured, healthy host with room for at least the smallest plan. */
export async function regionAvailability(runtimeEnabled: boolean): Promise<Record<string, boolean>> {
  if (!runtimeEnabled) return {};
  const smallest: Resources = { cpuMillis: 250, memoryMb: 256, storageMb: 1024 };
  const servers = await Server.find(placementFilter()).lean<ServerDoc[]>();
  const out: Record<string, boolean> = {};
  for (const s of servers) if (fits(s, smallest)) out[s.regionId] = true;
  return out;
}

/** True when some eligible host in the region could take the plan right now (pre-check only). */
export async function hasCapacity(regionId: string, need: Resources): Promise<'ok' | 'no_servers' | 'full'> {
  const servers = await Server.find(placementFilter(regionId)).lean<ServerDoc[]>();
  if (servers.length === 0) return 'no_servers';
  return servers.some((s) => fits(s, need)) ? 'ok' : 'full';
}

/**
 * Atomically reserves capacity on the least-loaded eligible server. The conditional `$inc` only
 * succeeds when the new totals fit the server's capacity, so concurrent schedulers cannot
 * over-commit. Must run inside a transaction together with the reservation record.
 */
export async function reserve(
  session: ClientSession,
  opts: { regionId: string; serviceId: string; deploymentId: string | null; kind: 'active' | 'candidate'; need: Resources; preferServerId?: string | null; ttlMs?: number },
): Promise<CapacityReservationDoc | null> {
  const servers = await Server.find(placementFilter(opts.regionId), null, { session }).lean<ServerDoc[]>();
  const ranked = servers
    .filter((s) => fits(s, opts.need))
    .sort((a, b) => {
      if (opts.preferServerId) {
        if (a._id === opts.preferServerId) return -1;
        if (b._id === opts.preferServerId) return 1;
      }
      return a.reserved.memoryMb / Math.max(1, a.capacity.memoryMb) - b.reserved.memoryMb / Math.max(1, b.capacity.memoryMb);
    });
  for (const s of ranked) {
    const res = await Server.updateOne(
      {
        _id: s._id,
        ...placementFilter(opts.regionId),
        $expr: {
          $and: [
            { $lte: [{ $add: ['$reserved.cpuMillis', opts.need.cpuMillis] }, '$capacity.cpuMillis'] },
            { $lte: [{ $add: ['$reserved.memoryMb', opts.need.memoryMb] }, '$capacity.memoryMb'] },
            { $lte: [{ $add: ['$reserved.storageMb', opts.need.storageMb] }, '$capacity.storageMb'] },
          ],
        },
      },
      { $inc: { 'reserved.cpuMillis': opts.need.cpuMillis, 'reserved.memoryMb': opts.need.memoryMb, 'reserved.storageMb': opts.need.storageMb } },
      { session },
    );
    if (res.modifiedCount !== 1) continue;
    const doc: CapacityReservationDoc = {
      _id: newId('reservation'),
      serverId: s._id,
      serviceId: opts.serviceId,
      deploymentId: opts.deploymentId,
      kind: opts.kind,
      ...opts.need,
      status: 'held',
      createdAt: new Date(),
      expiresAt: opts.ttlMs ? new Date(Date.now() + opts.ttlMs) : null,
      releasedAt: null,
    };
    await CapacityReservation.create([doc], { session });
    return doc;
  }
  return null;
}

/** Releases a held reservation (idempotent). */
export async function release(session: ClientSession, reservationId: string) {
  const r = await CapacityReservation.findOneAndUpdate({ _id: reservationId, status: 'held' }, { $set: { status: 'released', releasedAt: new Date() } }, { session }).lean<CapacityReservationDoc>();
  if (!r) return false;
  await Server.updateOne({ _id: r.serverId }, { $inc: { 'reserved.cpuMillis': -r.cpuMillis, 'reserved.memoryMb': -r.memoryMb, 'reserved.storageMb': -r.storageMb } }, { session });
  return true;
}

/** Promotes a candidate to the service's active reservation, releasing the previous active one. */
export async function promote(session: ClientSession, serviceId: string, candidateId: string) {
  const previous = await CapacityReservation.findOne({ serviceId, kind: 'active', status: 'held' }, null, { session }).lean<CapacityReservationDoc>();
  if (previous) await release(session, previous._id);
  await CapacityReservation.updateOne({ _id: candidateId, status: 'held' }, { $set: { kind: 'active', expiresAt: null } }, { session });
}

/**
 * Resizes a service's active reservation to a new plan (plan changes). Growth is a conditional
 * `$inc` that fails when the host lacks room; shrinking always succeeds. Returns whether it fits.
 */
export async function resize(session: ClientSession, svc: { _id: string; type: ServiceType }, plan: PlanId): Promise<boolean> {
  const r = await CapacityReservation.findOne({ serviceId: svc._id, kind: 'active', status: 'held' }, null, { session }).lean<CapacityReservationDoc>();
  if (!r) return true;
  const need = planResources(svc.type, plan);
  const delta = { cpuMillis: need.cpuMillis - r.cpuMillis, memoryMb: need.memoryMb - r.memoryMb, storageMb: need.storageMb - r.storageMb };
  const res = await Server.updateOne(
    {
      _id: r.serverId,
      $expr: {
        $and: [
          { $lte: [{ $add: ['$reserved.cpuMillis', delta.cpuMillis] }, '$capacity.cpuMillis'] },
          { $lte: [{ $add: ['$reserved.memoryMb', delta.memoryMb] }, '$capacity.memoryMb'] },
          { $lte: [{ $add: ['$reserved.storageMb', delta.storageMb] }, '$capacity.storageMb'] },
        ],
      },
    },
    { $inc: { 'reserved.cpuMillis': delta.cpuMillis, 'reserved.memoryMb': delta.memoryMb, 'reserved.storageMb': delta.storageMb } },
    { session },
  );
  if (res.modifiedCount !== 1) return false;
  await CapacityReservation.updateOne({ _id: r._id }, { $set: need }, { session });
  return true;
}
