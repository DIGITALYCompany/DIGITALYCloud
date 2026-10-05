import { randomUUID } from 'node:crypto';
import { LOG_RETENTION_HOURS, planLimits, type LogLevel, type ServiceMetricsEvent } from '@digitalycloud/shared';
import type { AppContext } from '../context';
import { Counter, MetricSample, RuntimeLog, Server, ServerMetricSample, Service, UsageAlertState, type RuntimeLogDoc, type ServerDoc, type ServiceDoc } from '../db/models';
import { isDuplicateKey } from '../lib/errors';
import { notify } from '../modules/notifications/notifications.service';
import { runtimeEnv } from '../modules/services/env.service';
import { liveKey } from '../serializers/service';
import { handleUnexpectedExit } from './crash';
import { driverFor, type RuntimeDriver } from './driver';
import { LineSplitter, Redactor } from './redact';

const LEASE_MS = 60_000;
const TICK_MS = 2_000;
const HEARTBEAT_MS = 20_000;
const LIVE_POINTS = 40;
const ALERT_DEBOUNCE_MS = 6 * 3600_000;
const ALERT_THRESHOLD = 0.8;

export const seriesKey = (c: AppContext, serviceId: string) => `${c.config.REDIS_PREFIX}:svc:${serviceId}:series`;
export const logsScope = (serviceId: string) => ({ kind: 'logs' as const, id: serviceId });

/** stderr, or lines starting with ERROR/WARN, are highlighted (docs → Logs). */
export function levelOf(stream: 'stdout' | 'stderr', text: string): LogLevel {
  if (stream === 'stderr' || /^\s*(\[?error\]?|err!)/i.test(text)) return 'error';
  if (/^\s*\[?warn(ing)?\]?/i.test(text)) return 'warn';
  if (/^\s*\[?debug\]?/i.test(text)) return 'debug';
  return 'info';
}

/** Allocates `n` durable, monotonic log sequence numbers for a service (survive restarts). */
async function allocateSeq(serviceId: string, n: number) {
  const c = await Counter.findOneAndUpdate({ _id: `logseq:${serviceId}` }, { $inc: { seq: n } }, { upsert: true }).lean<{ seq: number }>();
  return c!.seq - n + 1;
}

interface Attached {
  containerId: string;
  stop: () => void;
  envVersion: number;
}

interface NetState {
  rx: number;
  tx: number;
  at: number;
}

interface MinuteAgg {
  minute: number;
  cpu: number;
  ram: number;
  netIn: number;
  netOut: number;
  n: number;
}

/**
 * Collects logs, metrics, heartbeats and crash events for the runtime hosts this process leases.
 * Several collector processes can run: each server is leased to one of them at a time.
 */
export async function startCollectors(c: AppContext) {
  if (!c.config.capabilities.runtime) {
    c.log.warn('runtime driver disabled; log and metric collectors are not running');
    return { close: async () => {} };
  }
  const owner = `collector-${randomUUID()}`;
  const leased = new Map<string, { server: ServerDoc; driver: RuntimeDriver; stopEvents: () => void }>();
  const attached = new Map<string, Attached>();
  const net = new Map<string, NetState>();
  const minutes = new Map<string, MinuteAgg>();
  const diskAt = new Map<string, number>();
  let running = true;

  async function claimServers() {
    const now = new Date();
    for (const s of await Server.find({ demo: false, status: { $ne: 'offline' } }).lean<ServerDoc[]>()) {
      const got = await Server.findOneAndUpdate(
        { _id: s._id, $or: [{ collectorLease: null }, { 'collectorLease.until': { $lt: now } }, { 'collectorLease.owner': owner }] },
        { $set: { collectorLease: { owner, until: new Date(now.getTime() + LEASE_MS) } } },
      ).lean<ServerDoc>();
      if (got && !leased.has(s._id)) {
        try {
          const driver = await driverFor(got);
          const stopEvents = await driver.events(
            (e) => void onEvent(e.containerId, e.action, e.exitCode),
            (err) => c.log.warn({ err, server: s._id }, 'runtime event stream interrupted'),
          );
          leased.set(s._id, { server: got, driver, stopEvents });
          c.log.info({ server: s._id }, 'collector leased server');
        } catch (err) {
          c.log.warn({ err, server: s._id }, 'cannot reach runtime host');
          await Server.updateOne({ _id: s._id }, { $set: { lastError: 'Docker endpoint unreachable' } });
        }
      } else if (!got && leased.has(s._id)) {
        leased.get(s._id)!.stopEvents();
        leased.delete(s._id);
      }
    }
  }

  async function onEvent(containerId: string, action: string, exitCode: number | null) {
    if (action !== 'die' && action !== 'oom') return;
    const svc = await Service.findOne({ 'runtime.containerId': containerId, lifecycle: 'active' }).lean<ServiceDoc>();
    if (!svc) return;
    detach(svc._id);
    const st = await leased.get(svc.runtime!.serverId)?.driver.inspectContainer(containerId).catch(() => null);
    await handleUnexpectedExit(svc, exitCode ?? st?.exitCode ?? null, action === 'oom' || Boolean(st?.oomKilled));
  }

  async function heartbeat() {
    for (const { server, driver } of leased.values()) {
      try {
        await driver.ping();
        await Server.updateOne({ _id: server._id }, { $set: { lastHeartbeatAt: new Date(), lastError: null } });
      } catch {
        await Server.updateOne({ _id: server._id }, { $set: { lastError: 'Docker endpoint unreachable' } });
      }
    }
  }

  function detach(serviceId: string) {
    const a = attached.get(serviceId);
    if (a) {
      a.stop();
      attached.delete(serviceId);
    }
  }

  /** Attaches to stdout/stderr of the service's active container; lines are redacted, numbered and stored. */
  async function attach(svc: ServiceDoc, driver: RuntimeDriver) {
    const rt = svc.runtime!;
    const env = await runtimeEnv(svc._id, { regionId: svc.regionId, deploymentId: rt.deploymentId, port: svc.port });
    const redactor = new Redactor(env.secrets);
    const retentionMs = LOG_RETENTION_HOURS[svc.plan] * 3600_000;
    let pending: Omit<RuntimeLogDoc, 'seq'>[] = [];
    let flushing = Promise.resolve();
    const flush = () => {
      const batch = pending;
      pending = [];
      if (!batch.length) return;
      flushing = flushing.then(async () => {
        const first = await allocateSeq(svc._id, batch.length);
        const docs = batch.map((l, i) => ({ ...l, seq: first + i }));
        try {
          await RuntimeLog.insertMany(docs, { ordered: false });
        } catch (e) {
          if (!isDuplicateKey(e)) c.log.warn({ err: e }, 'runtime log insert failed');
        }
        await c.hub.publishRaw(logsScope(svc._id), 'log', docs.map((d) => ({ id: d.seq, ts: d.ts.getTime(), level: d.level, text: d.text })));
      });
    };
    const timer = setInterval(flush, 500);
    const push = (stream: 'stdout' | 'stderr') =>
      new LineSplitter((line) => {
        if (!line) return;
        const text = redactor.redact(line);
        pending.push({ serviceId: svc._id, teamId: svc.teamId, deploymentId: rt.deploymentId, ts: new Date(), level: levelOf(stream, text), stream, text, expiresAt: new Date(Date.now() + retentionMs) });
        if (pending.length >= 200) flush();
      });
    const out = push('stdout');
    const err = push('stderr');
    const since = Math.floor(rt.startedAt.getTime() / 1000);
    const handle = await driver.logs(rt.containerId, { sinceSec: since, follow: true, onStdout: (b) => out.push(b), onStderr: (b) => err.push(b) });
    attached.set(svc._id, {
      containerId: rt.containerId,
      envVersion: svc.envVersion,
      stop: () => {
        handle.stop();
        out.flush();
        err.flush();
        flush();
        clearInterval(timer);
      },
    });
    void handle.done.then(() => {
      if (attached.get(svc._id)?.containerId === rt.containerId) detach(svc._id);
    });
  }

  async function sample(svc: ServiceDoc, driver: RuntimeDriver, now: number) {
    const rt = svc.runtime!;
    const raw = await driver.stats(rt.containerId).catch(() => null);
    if (!raw) return null;
    const limits = planLimits(svc.type, svc.plan);
    // CPU normalized to the allocation: 100 % = all vCPUs of the plan in use.
    const cpu = Math.min(100, raw.cpuPercentOfHost / limits.vcpu);
    const ramMb = raw.memoryBytes / 1024 / 1024;
    const prev = net.get(rt.containerId);
    let netIn = 0;
    let netOut = 0;
    if (prev && now > prev.at && raw.rxBytes >= prev.rx && raw.txBytes >= prev.tx) {
      const dt = (now - prev.at) / 1000;
      netIn = (raw.rxBytes - prev.rx) / 1024 / dt;
      netOut = (raw.txBytes - prev.tx) / 1024 / dt;
    } // A counter reset (container recreated) yields a 0 rate for one sample instead of a negative one.
    net.set(rt.containerId, { rx: raw.rxBytes, tx: raw.txBytes, at: now });
    let storageMb = svc.storageMb;
    if ((diskAt.get(svc._id) ?? 0) + 60_000 < now) {
      const st = await driver.inspectContainer(rt.containerId, { size: true }).catch(() => null);
      if (st?.sizeRwBytes !== null && st?.sizeRwBytes !== undefined) {
        storageMb = st.sizeRwBytes / 1024 / 1024;
        await Service.updateOne({ _id: svc._id }, { $set: { storageMb: Math.round(storageMb) } });
      }
      diskAt.set(svc._id, now);
    }
    const ev: ServiceMetricsEvent = { serviceId: svc._id, ts: now, cpu: round1(cpu), ramMb: Math.round(ramMb), netIn: round1(netIn), netOut: round1(netOut), storageMb: Math.round(storageMb) };
    await c.redis.set(liveKey(svc._id), JSON.stringify({ ts: now, cpu: ev.cpu, ramMb: ev.ramMb, netIn: ev.netIn, netOut: ev.netOut, storageMb: ev.storageMb }), 'EX', 120);
    await c.redis.multi().lpush(seriesKey(c, svc._id), JSON.stringify(ev)).ltrim(seriesKey(c, svc._id), 0, LIVE_POINTS - 1).expire(seriesKey(c, svc._id), 600).exec();
    await c.hub.publish({ kind: 'team', id: svc.teamId }, 'service.metrics', ev, { replay: false });

    const minute = Math.floor(now / 60_000) * 60_000;
    const agg = minutes.get(svc._id);
    if (agg && agg.minute !== minute) await flushMinute(svc, agg, limits.vcpu, limits.ramLimitMb, storageMb);
    const cur = agg && agg.minute === minute ? agg : { minute, cpu: 0, ram: 0, netIn: 0, netOut: 0, n: 0 };
    cur.cpu += cpu;
    cur.ram += ramMb;
    cur.netIn += netIn;
    cur.netOut += netOut;
    cur.n++;
    minutes.set(svc._id, cur);
    await usageAlerts(svc, ramMb / limits.ramLimitMb, storageMb / limits.storageLimitMb);
    return { cpuMillis: (cpu / 100) * limits.cpuMillis, ramMb };
  }

  async function flushMinute(svc: ServiceDoc, a: MinuteAgg, vcpu: number, ramLimitMb: number, diskMb: number) {
    if (a.n === 0) return;
    await MetricSample.updateOne(
      { serviceId: svc._id, ts: new Date(a.minute) },
      { $set: { teamId: svc.teamId, cpu: round1(a.cpu / a.n), ramMb: Math.round(a.ram / a.n), netIn: round1(a.netIn / a.n), netOut: round1(a.netOut / a.n), diskMb: Math.round(diskMb), vcpu, ramLimitMb, samples: a.n } },
      { upsert: true },
    );
  }

  /** RAM or storage above 80 % → one alert per service and kind every six hours (durable debounce). */
  async function usageAlerts(svc: ServiceDoc, ramRatio: number, storageRatio: number) {
    for (const [kind, ratio] of [['ram', ramRatio], ['storage', storageRatio]] as const) {
      if (!(ratio > ALERT_THRESHOLD)) continue;
      const now = new Date();
      let claimed = false;
      try {
        const r = await UsageAlertState.updateOne(
          { _id: `${svc._id}:${kind}`, lastAlertAt: { $lt: new Date(now.getTime() - ALERT_DEBOUNCE_MS) } },
          { $set: { lastAlertAt: now, expiresAt: new Date(now.getTime() + 7 * 86400_000) } },
        );
        claimed = r.modifiedCount === 1;
        if (!claimed && r.matchedCount === 0) {
          await UsageAlertState.create({ _id: `${svc._id}:${kind}`, serviceId: svc._id, kind, lastAlertAt: now, expiresAt: new Date(now.getTime() + 7 * 86400_000) });
          claimed = true;
        }
      } catch (e) {
        if (!isDuplicateKey(e)) throw e;
      }
      if (!claimed) continue;
      await notify({
        teamId: svc.teamId,
        serviceId: svc._id,
        kind: 'warning',
        category: 'usage',
        title: kind === 'ram' ? 'High memory usage' : 'Storage almost full',
        body: `${svc.name} reached ${Math.round(ratio * 100)}% of its ${kind === 'ram' ? 'memory' : 'storage'} limit.`,
        dedupeKey: `usage:${svc._id}:${kind}:${Math.floor(now.getTime() / ALERT_DEBOUNCE_MS)}`,
      });
    }
  }

  async function tick() {
    const now = Date.now();
    for (const { server, driver } of leased.values()) {
      const services = await Service.find({ lifecycle: 'active', status: 'running', 'runtime.serverId': server._id }).lean<ServiceDoc[]>();
      let cpuMillis = 0;
      let ramMb = 0;
      for (const svc of services) {
        const a = attached.get(svc._id);
        if (a && (a.containerId !== svc.runtime!.containerId || a.envVersion !== svc.envVersion)) detach(svc._id);
        if (!attached.has(svc._id)) await attach(svc, driver).catch((err: unknown) => c.log.warn({ err, serviceId: svc._id }, 'log attach failed'));
        const s = await sample(svc, driver, now).catch(() => null);
        if (s) {
          cpuMillis += s.cpuMillis;
          ramMb += s.ramMb;
        }
      }
      for (const id of [...attached.keys()]) if (!services.some((s) => s._id === id)) detach(id);
      const minute = Math.floor(now / 60_000) * 60_000;
      if (now - minute < TICK_MS) {
        const cores = server.hardware.cores || server.capacity.cpuMillis / 1000 || 1;
        const memMb = (server.hardware.memoryGb || server.capacity.memoryMb / 1024) * 1024 || 1;
        await ServerMetricSample.updateOne(
          { serverId: server._id, ts: new Date(minute) },
          { $set: { cpu: round1(Math.min(100, (cpuMillis / (cores * 1000)) * 100)), ram: round1(Math.min(100, (ramMb / memMb) * 100)), storage: null, containers: services.length } },
          { upsert: true },
        ).catch(() => {});
      }
    }
  }

  await claimServers();
  await heartbeat();
  const leaseTimer = setInterval(() => void claimServers().catch((err: unknown) => c.log.warn({ err }, 'lease renewal failed')), LEASE_MS / 3);
  const beatTimer = setInterval(() => void heartbeat(), HEARTBEAT_MS);
  const loop = (async () => {
    while (running) {
      const t0 = Date.now();
      await tick().catch((err: unknown) => c.log.warn({ err }, 'collector tick failed'));
      await new Promise((r) => setTimeout(r, Math.max(100, TICK_MS - (Date.now() - t0))));
    }
  })();

  return {
    async close() {
      running = false;
      clearInterval(leaseTimer);
      clearInterval(beatTimer);
      await loop;
      for (const id of [...attached.keys()]) detach(id);
      for (const { server, stopEvents } of leased.values()) {
        stopEvents();
        await Server.updateOne({ _id: server._id, 'collectorLease.owner': owner }, { $set: { collectorLease: null } });
      }
    },
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
