import { getServicePlan, type AdminOverviewDto, type AdminServiceRowDto } from '@digitalycloud/shared';
import { ctx } from '../../context';
import {
  AccountDeletion,
  Deployment,
  Outbox,
  RevenueSnapshot,
  Server,
  ServerMetricSample,
  Service,
  SubscriptionItem,
  Team,
  User,
  type RevenueSnapshotDoc,
  type ServerDoc,
  type ServerMetricSampleDoc,
  type ServiceDoc,
  type SubscriptionItemDoc,
  type TeamDoc,
  type UserDoc,
} from '../../db/models';
import { escapeRegExp } from '../../lib/text';
import { liveKey, type LiveSample } from '../../serializers/service';

const DAY = 86400_000;
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Monthly recurring revenue from billing records: active subscription items at their catalog price. */
export async function currentMrrCents() {
  const items = await SubscriptionItem.find({ status: 'active' }).lean<SubscriptionItemDoc[]>();
  return items.reduce((sum, i) => sum + getServicePlan(i.type, i.plan).priceCents, 0);
}

/** Daily snapshot (worker): later charts read these instead of inventing past values. */
export async function takeSnapshot() {
  const date = isoDay(Date.now());
  const [mrrCents, users, activeServices, paidServices] = await Promise.all([
    currentMrrCents(),
    User.countDocuments({ status: 'active' }),
    Service.countDocuments({ lifecycle: 'active' }),
    SubscriptionItem.countDocuments({ status: 'active' }),
  ]);
  await RevenueSnapshot.updateOne({ _id: date }, { $set: { date, mrrCents, users, activeServices, paidServices, createdAt: new Date() } }, { upsert: true });
}

async function fleetAverages() {
  const servers = await Server.find({ demo: false, status: 'healthy' }).lean<ServerDoc[]>();
  const latest = (await Promise.all(servers.map((s) => ServerMetricSample.findOne({ serverId: s._id, ts: { $gte: new Date(Date.now() - 10 * 60_000) } }).sort({ ts: -1 }).lean<ServerMetricSampleDoc>()))).filter((x): x is ServerMetricSampleDoc => Boolean(x));
  if (!latest.length) return { cpuAvg: null, ramAvg: null };
  return { cpuAvg: Math.round(latest.reduce((a, s) => a + s.cpu, 0) / latest.length), ramAvg: Math.round(latest.reduce((a, s) => a + s.ram, 0) / latest.length) };
}

export async function overview(): Promise<AdminOverviewDto> {
  const now = Date.now();
  const monthStart = new Date(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1);
  const since14 = new Date(now - 14 * DAY);
  const [totalUsers, newUsersThisMonth, activeServices, running, servers, deployments14d, failedDeployments14d, deadLetterTasks, overdueAccountDeletions, mrrCents] = await Promise.all([
    User.countDocuments({ status: 'active' }),
    User.countDocuments({ status: 'active', createdAt: { $gte: monthStart } }),
    Service.countDocuments({ lifecycle: 'active' }),
    Service.countDocuments({ lifecycle: 'active', status: 'running' }),
    Server.find({ demo: false }).lean<ServerDoc[]>(),
    Deployment.countDocuments({ createdAt: { $gte: since14 } }),
    Deployment.countDocuments({ createdAt: { $gte: since14 }, status: 'failed' }),
    Outbox.countDocuments({ status: 'dead' }),
    AccountDeletion.countDocuments({ status: { $ne: 'completed' }, deadlineAt: { $lt: new Date() } }),
    currentMrrCents(),
  ]);
  const prev = await RevenueSnapshot.findOne({ _id: { $lte: isoDay(now - 30 * DAY) } }).sort({ _id: -1 }).lean<RevenueSnapshotDoc>();
  return {
    totalUsers,
    newUsersThisMonth,
    activeServices,
    runningPct: activeServices ? Math.round((running / activeServices) * 1000) / 10 : null,
    serversOnline: servers.filter((s) => s.status === 'healthy').length,
    serversTotal: servers.length,
    serversInMaintenance: servers.filter((s) => s.status === 'maintenance').map((s) => s.name),
    mrr: mrrCents / 100,
    mrrChangePct: prev && prev.mrrCents > 0 ? Math.round(((mrrCents - prev.mrrCents) / prev.mrrCents) * 1000) / 10 : null,
    ...(await fleetAverages()),
    deployments14d,
    failedDeployments14d,
    failureRatePct: deployments14d ? Math.round((failedDeployments14d / deployments14d) * 1000) / 10 : null,
    deadLetterTasks,
    overdueAccountDeletions,
  };
}

/** Only days with a collected snapshot are returned. */
export async function revenueSeries(days: number) {
  const from = isoDay(Date.now() - (days - 1) * DAY);
  const rows = await RevenueSnapshot.find({ _id: { $gte: from } }).sort({ _id: 1 }).lean<RevenueSnapshotDoc[]>();
  return rows.map((r) => ({ ts: Date.parse(`${r.date}T00:00:00Z`), mrr: r.mrrCents / 100, users: r.users }));
}

/** Deployment outcomes per UTC day (complete records, so zero means zero). */
export async function deploymentsDaily(days: number) {
  const start = Math.floor(Date.now() / DAY) * DAY - (days - 1) * DAY;
  const rows = await Deployment.aggregate<{ _id: { d: number; s: string }; n: number }>([
    { $match: { createdAt: { $gte: new Date(start) }, status: { $in: ['success', 'failed'] } } },
    { $group: { _id: { d: { $floor: { $divide: [{ $subtract: [{ $toLong: '$createdAt' }, start] }, DAY] } }, s: '$status' }, n: { $sum: 1 } } },
  ]);
  return Array.from({ length: days }, (_, i) => ({
    ts: start + i * DAY,
    success: rows.find((r) => r._id.d === i && r._id.s === 'success')?.n ?? 0,
    failed: rows.find((r) => r._id.d === i && r._id.s === 'failed')?.n ?? 0,
  }));
}

export async function topServices(opts: { q?: string; sort: 'cpu' | 'ram' | 'created'; limit: number }): Promise<AdminServiceRowDto[]> {
  const filter: Record<string, unknown> = { lifecycle: 'active' };
  if (opts.q) filter.name = { $regex: escapeRegExp(opts.q), $options: 'i' };
  const services = await Service.find(filter).sort({ createdAt: -1 }).limit(500).lean<ServiceDoc[]>();
  const live = new Map<string, LiveSample>();
  if (services.length) {
    const raw = await ctx().redis.mget(...services.map((s) => liveKey(s._id))).catch(() => [] as (string | null)[]);
    raw.forEach((v, i) => v && live.set(services[i]!._id, JSON.parse(v) as LiveSample));
  }
  const teams = new Map((await Team.find({ _id: { $in: [...new Set(services.map((s) => s.teamId))] } }).lean<TeamDoc[]>()).map((t) => [t._id, t]));
  const owners = new Map((await User.find({ _id: { $in: [...teams.values()].map((t) => t.ownerUserId) } }, { name: 1 }).lean<UserDoc[]>()).map((u) => [u._id, u.name]));
  const servers = new Map((await Server.find({}, { name: 1 }).lean<ServerDoc[]>()).map((s) => [s._id, s.name]));
  const rows = services.map((s) => {
    const l = s.status === 'running' ? live.get(s._id) : undefined;
    return {
      id: s._id,
      name: s.name,
      owner: owners.get(teams.get(s.teamId)?.ownerUserId ?? '') ?? 'Unknown',
      type: s.type,
      server: (s.runtime && servers.get(s.runtime.serverId)) || '',
      cpu: l ? Math.round(l.cpu * 10) / 10 : 0,
      ramMb: l ? Math.round(l.ramMb) : 0,
      plan: s.plan,
      status: s.status,
    };
  });
  const q = opts.q?.toLowerCase();
  const matched = q ? rows.filter((r) => `${r.name} ${r.owner} ${r.server}`.toLowerCase().includes(q)) : rows;
  matched.sort((a, b) => (opts.sort === 'ram' ? b.ramMb - a.ramMb : opts.sort === 'cpu' ? b.cpu - a.cpu : 0));
  return matched.slice(0, opts.limit);
}
