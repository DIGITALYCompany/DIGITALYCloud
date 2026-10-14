import { getRegion, planAllowsCustomDomains, planAllowsCustomSubdomain, planLimits, regionLabel, type EnvVarDto, type ServiceDto } from '@digitalycloud/shared';
import { ctx } from '../context';
import { CustomDomain, EnvVar, Server, type CustomDomainDoc, type EnvVarDoc, type ServerDoc, type ServiceDoc } from '../db/models';
import { envAad, envDto, redactAll } from '../modules/services/env.service';

/** Latest live sample written by the metrics collector (`svc:<id>:live`). */
export interface LiveSample {
  ts: number;
  cpu: number;
  ramMb: number;
  netIn: number;
  netOut: number;
  storageMb: number | null;
}

/** Live values older than this are treated as missing, not as measured zeros. */
const LIVE_STALE_MS = 60_000;

export const liveKey = (serviceId: string) => `${ctx().config.REDIS_PREFIX}:svc:${serviceId}:live`;

/** The label a service is reached at: its chosen subdomain while the plan includes it, else its id. */
export const publicLabel = (s: Pick<ServiceDoc, '_id' | 'plan' | 'subdomain'>) => (s.subdomain && planAllowsCustomSubdomain(s.plan) ? s.subdomain : s._id);

export function serviceUrl(s: Pick<ServiceDoc, '_id' | 'plan' | 'subdomain' | 'port'>) {
  if (s.port === null) return null;
  const { PUBLIC_RUNTIME_SCHEME: scheme, PUBLIC_RUNTIME_DOMAIN: domain, PUBLIC_RUNTIME_PORT: p } = ctx().config;
  return `${scheme}://${publicLabel(s)}.${domain}${p ? `:${p}` : ''}`;
}

export type EnvMode = 'plain' | 'redacted' | 'omit';

interface SerializeContext {
  live: Map<string, LiveSample>;
  servers: Map<string, string>;
  env: Map<string, EnvVarDto[]>;
  domains: Map<string, string[]>;
}

export function serializeService(s: ServiceDoc, c: SerializeContext, envMode: EnvMode): ServiceDto {
  const region = getRegion(s.regionId);
  const limits = planLimits(s.type, s.plan);
  const running = s.status === 'running';
  const sample = running ? c.live.get(s._id) : undefined;
  const fresh = sample && Date.now() - sample.ts < LIVE_STALE_MS ? sample : undefined;
  const dto: ServiceDto = {
    id: s._id,
    name: s.name,
    type: s.type,
    status: s.status,
    cpu: fresh ? Math.round(fresh.cpu * 10) / 10 : 0,
    ramMb: fresh ? Math.round(fresh.ramMb) : 0,
    ramLimitMb: limits.ramLimitMb,
    storageMb: Math.round(fresh?.storageMb ?? s.storageMb),
    storageLimitMb: limits.storageLimitMb,
    metricsAt: fresh?.ts ?? null,
    startedAt: running && s.startedAt ? s.startedAt.getTime() : null,
    createdAt: s.createdAt.getTime(),
    lastDeployAt: s.lastDeployAt.getTime(),
    region: region ? regionLabel(region) : s.regionId,
    regionId: s.regionId,
    server: (s.runtime?.serverId && c.servers.get(s.runtime.serverId)) || '',
    runtime: s.type === 'static' ? 'Static' : s.source === 'docker' ? 'Docker' : 'Node.js',
    nodeVersion: s.nodeVersion,
    startCommand: s.startCommand,
    port: s.port,
    publishDir: s.type === 'static' ? (s.publishDir ?? null) : null,
    subdomain: s.port !== null ? (s.subdomain ?? null) : null,
    url: serviceUrl(s),
    // Domains of a service moved to the free plan stay saved but receive no traffic.
    domains: planAllowsCustomDomains(s.plan) ? (c.domains.get(s._id) ?? []) : [],
    plan: s.plan,
    source: s.source,
    repo: s.repo,
    branch: s.source === 'github' ? s.branch : null,
    autoDeploy: s.source === 'github' && s.autoDeploy,
    autoRestart: s.autoRestart,
    pendingChanges: {
      settings: Boolean(s.runtime && s.runtime.settingsVersion < s.settingsVersion),
      env: Boolean(s.runtime && s.runtime.envVersion < s.envVersion),
      resources: s.resourceState?.status !== 'applied' || Boolean(s.runtime && s.runtime.plan !== s.plan),
      resourceError: s.resourceState?.status === 'failed' ? s.resourceState.error : null,
    },
    operation: s.activeOperation && s.activeOperation.leaseUntil.getTime() > Date.now() ? { kind: s.activeOperation.kind, startedAt: s.activeOperation.startedAt.getTime() } : null,
  };
  if (envMode !== 'omit') dto.env = c.env.get(s._id) ?? [];
  return dto;
}

/** Loads everything needed to serialize a batch of services with one query per source. */
export async function serializeServices(services: ServiceDoc[], envMode: EnvMode): Promise<ServiceDto[]> {
  if (services.length === 0) return [];
  const c: SerializeContext = { live: new Map(), servers: new Map(), env: new Map(), domains: new Map() };
  const { redis } = ctx();
  try {
    const raw = await redis.mget(...services.map((s) => liveKey(s._id)));
    raw.forEach((v, i) => {
      if (v) c.live.set(services[i]!._id, JSON.parse(v) as LiveSample);
    });
  } catch {
    // Without Redis, live values are simply missing (metricsAt: null).
  }
  const serverIds = [...new Set(services.map((s) => s.runtime?.serverId).filter((x): x is string => Boolean(x)))];
  if (serverIds.length) for (const sv of await Server.find({ _id: { $in: serverIds } }, { name: 1 }).lean<Pick<ServerDoc, '_id' | 'name'>[]>()) c.servers.set(sv._id, sv.name);
  const http = services.filter((s) => s.port !== null).map((s) => s._id);
  if (http.length) {
    const rows = await CustomDomain.find({ serviceId: { $in: http }, status: 'active' }, { serviceId: 1, hostname: 1 }).sort({ createdAt: 1 }).lean<Pick<CustomDomainDoc, 'serviceId' | 'hostname'>[]>();
    for (const d of rows) c.domains.set(d.serviceId, [...(c.domains.get(d.serviceId) ?? []), d.hostname]);
  }
  if (envMode !== 'omit') {
    const docs = await EnvVar.find({ serviceId: { $in: services.map((s) => s._id) } }).sort({ position: 1 }).lean<EnvVarDoc[]>();
    const cipher = ctx().cipher;
    const byService = new Map<string, { doc: EnvVarDoc; value: string }[]>();
    for (const doc of docs) {
      const list = byService.get(doc.serviceId) ?? [];
      list.push({ doc, value: cipher.decrypt(doc.valueEnc, envAad(doc.serviceId, doc._id, doc.key)) });
      byService.set(doc.serviceId, list);
    }
    for (const [id, rows] of byService) c.env.set(id, envMode === 'plain' || envMode === 'redacted' ? envDto(rows, envMode) : redactAll(rows));
  }
  return services.map((s) => serializeService(s, c, envMode));
}

export async function serializeOne(s: ServiceDoc, envMode: EnvMode) {
  return (await serializeServices([s], envMode))[0]!;
}
