import { Resolver } from 'node:dns/promises';
import { domainToASCII } from 'node:url';
import { MAX_CUSTOM_DOMAINS, MESSAGES, isApexDomain, normalizeHostname, planAllowsCustomDomains, type CustomDomainDto } from '@digitalycloud/shared';
import { ctx } from '../../context';
import { CustomDomain, Service, type CustomDomainDoc, type ServiceDoc } from '../../db/models';
import type { Tenant } from '../../http/principal';
import { registerProcessor } from '../../jobs/registry';
import { audit } from '../../lib/audit';
import { conflict, forbidden, isDuplicateKey, notFound, validation } from '../../lib/errors';
import { newId, randomString } from '../../lib/ids';
import type { Actor } from '../deployments/deployments.service';
import { notify } from '../notifications/notifications.service';
import { publishService } from '../services/publish';
import { getService } from '../services/services.service';

/** TXT record label that proves control of a domain: `_digitaly-verify.<hostname>`. */
export const VERIFY_LABEL = '_digitaly-verify';
/** Pending domains are checked for a week, every minute for the first hour, then every 10 minutes. */
const PENDING_FOR_MS = 7 * 24 * 3600_000;
const FAST_PHASE_MS = 3600_000;
const RECHECK_ACTIVE_MS = 6 * 3600_000;
const MANUAL_COOLDOWN_MS = 5_000;

const resolver = new Resolver({ timeout: 4000, tries: 2 });

/** The platform hostname a custom domain must point to. */
export const serviceHost = (serviceId: string) => `${serviceId}.${ctx().config.PUBLIC_RUNTIME_DOMAIN}`.toLowerCase();

function routingRecord(d: Pick<CustomDomainDoc, 'hostname' | 'serviceId'>) {
  const { edgeIps } = ctx().config;
  if (!isApexDomain(d.hostname)) return { type: 'CNAME' as const, value: serviceHost(d.serviceId) };
  // A CNAME is not allowed at the zone apex: A records to the edge, or the provider's ALIAS/ANAME.
  return edgeIps.length ? { type: 'A' as const, value: edgeIps.join(', ') } : { type: 'ALIAS' as const, value: serviceHost(d.serviceId) };
}

export function domainDto(d: CustomDomainDoc): CustomDomainDto {
  const routing = routingRecord(d);
  return {
    id: d._id,
    serviceId: d.serviceId,
    hostname: d.hostname,
    status: d.status,
    apex: isApexDomain(d.hostname),
    records: [
      { purpose: 'routing', type: routing.type, name: d.hostname, value: routing.value, ok: d.checks.routing },
      { purpose: 'ownership', type: 'TXT', name: `${VERIFY_LABEL}.${d.hostname}`, value: `dgc-verify=${d.verificationToken}`, ok: d.checks.ownership },
    ],
    message: d.checks.message,
    createdAt: d.createdAt.getTime(),
    verifiedAt: d.verifiedAt?.getTime() ?? null,
    checkedAt: d.checkedAt?.getTime() ?? null,
  };
}

/** A DNS answer, `missing` (NXDOMAIN/no data) or `error` (timeout, SERVFAIL: try again later). */
async function lookup<T>(fn: () => Promise<T>): Promise<T | 'missing' | 'error'> {
  try {
    return await fn();
  } catch (e) {
    const code = (e as { code?: string }).code;
    return code === 'ENOTFOUND' || code === 'ENODATA' ? 'missing' : 'error';
  }
}

/**
 * Ownership: the TXT record holds this domain's token. Routing: the hostname is a CNAME to the
 * service's platform hostname, or resolves only to the edge (its IPs or PUBLIC_EDGE_IPS), which
 * also covers ALIAS/ANAME and flattened CNAMEs. `null` means the check could not run.
 */
export async function checkDns(d: Pick<CustomDomainDoc, 'hostname' | 'serviceId' | 'verificationToken'>) {
  const target = serviceHost(d.serviceId);
  const record = routingRecord(d);
  const txt = await lookup(() => resolver.resolveTxt(`${VERIFY_LABEL}.${d.hostname}`));
  const ownership = Array.isArray(txt) ? txt.some((chunks) => chunks.join('').trim() === `dgc-verify=${d.verificationToken}`) : txt === 'missing' ? false : null;

  let routing: boolean | null;
  let pointsTo: string[] = [];
  const cname = await lookup(() => resolver.resolveCname(d.hostname));
  if (Array.isArray(cname) && cname.some((c) => c.replace(/\.$/, '').toLowerCase() === target)) routing = true;
  else {
    const [mine, edge] = await Promise.all([lookup(() => resolver.resolve4(d.hostname)), lookup(() => resolver.resolve4(target))]);
    const allowed = new Set([...ctx().config.edgeIps, ...(Array.isArray(edge) ? edge : [])]);
    if (Array.isArray(mine)) {
      pointsTo = mine;
      routing = allowed.size ? mine.every((ip) => allowed.has(ip)) : null;
    } else routing = mine === 'missing' ? false : null;
  }

  const notes: string[] = [];
  if (routing === false) {
    notes.push(
      pointsTo.length
        ? `${d.hostname} points to ${pointsTo.join(', ')}, not to DIGITALYCloud. Update its ${record.type} record and remove other A records.`
        : `${d.hostname} doesn’t point anywhere yet. Add the ${record.type} record.`,
    );
  } else if (routing === null) notes.push(`We couldn’t check where ${d.hostname} points right now. We’ll keep trying.`);
  if (ownership === false) notes.push(`Add the TXT record ${VERIFY_LABEL}.${d.hostname} so we know the domain is yours.`);
  else if (ownership === null) notes.push('We couldn’t read the TXT record right now. We’ll keep trying.');
  return { ownership, routing, message: notes.length ? notes.join(' ') : null };
}

/** Runs the DNS check and records the result; a domain goes live once both records are found. */
async function runCheck(d: CustomDomainDoc): Promise<CustomDomainDoc> {
  const checks = await checkDns(d);
  const now = new Date();
  const ok = checks.ownership === true && checks.routing === true;
  const set: Partial<CustomDomainDoc> = { checks, checkedAt: now };
  if (ok && d.status !== 'active') {
    set.status = 'active';
    set.verifiedAt = now;
    set.checks = { ...checks, message: 'DNS is set up. The HTTPS certificate is issued automatically within a few minutes.' };
  } else if (!ok && d.status === 'pending' && now.getTime() - d.pendingSince.getTime() > PENDING_FOR_MS) {
    set.status = 'failed';
    set.checks = { ...checks, message: `${checks.message ?? ''} We stopped checking after 7 days: fix the records, then press Verify.`.trim() };
  }
  // Conditional on the status read, so a concurrent check or removal is never overwritten.
  const updated = await CustomDomain.findOneAndUpdate({ _id: d._id, status: d.status }, { $set: set }).lean<CustomDomainDoc>();
  if (!updated) return (await CustomDomain.findById(d._id).lean<CustomDomainDoc>()) ?? d;
  if (set.status === 'active') {
    await publishService(d.serviceId).catch(() => {});
    await notify({
      teamId: d.teamId,
      serviceId: d.serviceId,
      kind: 'success',
      category: 'deploySuccess',
      title: `${d.hostname} is connected`,
      body: `Your domain now points to your service. HTTPS is set up automatically within a few minutes.`,
      dedupeKey: `domain-active:${d._id}:${now.getTime()}`,
    }).catch(() => {});
  }
  return updated;
}

/** Hostnames of the platform itself can never be claimed. */
function isPlatformHost(hostname: string) {
  const { PUBLIC_RUNTIME_DOMAIN, API_PUBLIC_URL, FRONTEND_URL } = ctx().config;
  const own = [PUBLIC_RUNTIME_DOMAIN.toLowerCase(), new URL(API_PUBLIC_URL).hostname, new URL(FRONTEND_URL).hostname];
  return own.some((h) => hostname === h || hostname.endsWith(`.${h}`));
}

async function domainOf(teamId: string, serviceId: string, domainId: string) {
  const d = typeof domainId === 'string' && /^dom_[a-z0-9]{16}$/.test(domainId) ? await CustomDomain.findOne({ _id: domainId, serviceId, teamId }).lean<CustomDomainDoc>() : null;
  if (!d) throw notFound('Domain');
  return d;
}

export async function listDomains(teamId: string, serviceId: string) {
  await getService(teamId, serviceId);
  return CustomDomain.find({ serviceId, teamId }).sort({ createdAt: 1 }).lean<CustomDomainDoc[]>();
}

export async function addDomain(tenant: Tenant, actor: Actor, serviceId: string, raw: string) {
  const teamId = tenant.team._id;
  const svc: ServiceDoc = await getService(teamId, serviceId);
  if (svc.port === null) throw validation(MESSAGES.domainNoHttp, 'hostname');
  if (!planAllowsCustomDomains(svc.plan)) throw forbidden(MESSAGES.domainPlan, 'PLAN_UPGRADE_REQUIRED');
  const hostname = normalizeHostname(raw, domainToASCII);
  if (!hostname) throw validation(MESSAGES.domain, 'hostname');
  if (isPlatformHost(hostname)) throw validation('This domain belongs to DIGITALYCloud. Use a domain you own.', 'hostname');
  if ((await CustomDomain.countDocuments({ serviceId })) >= MAX_CUSTOM_DOMAINS) throw validation(MESSAGES.domainLimit, 'hostname');
  const now = new Date();
  const doc = {
    _id: newId('customDomain'),
    serviceId,
    teamId,
    hostname,
    verificationToken: randomString(24),
    status: 'pending' as const,
    checks: { ownership: null, routing: null, message: null },
    pendingSince: now,
    checkedAt: null,
    verifiedAt: null,
  };
  try {
    await CustomDomain.create([doc]);
  } catch (e) {
    if (isDuplicateKey(e, 'custom_domain_hostname_unique')) throw conflict(MESSAGES.domainTaken, 'DOMAIN_TAKEN', { hostname: MESSAGES.domainTaken });
    throw e;
  }
  await audit({ action: 'service.domain_added', actorUserId: actor.userId, actorApiKeyId: actor.apiKeyId, teamId, targetType: 'service', targetId: serviceId, meta: { hostname } });
  // The records may already exist (moving a domain): check right away.
  const created = (await CustomDomain.findById(doc._id).lean<CustomDomainDoc>())!;
  return runCheck(created);
}

export async function verifyDomain(teamId: string, serviceId: string, domainId: string) {
  await getService(teamId, serviceId);
  let d = await domainOf(teamId, serviceId, domainId);
  if (d.checkedAt && Date.now() - d.checkedAt.getTime() < MANUAL_COOLDOWN_MS) return d;
  if (d.status === 'failed') {
    d = (await CustomDomain.findOneAndUpdate({ _id: d._id, status: 'failed' }, { $set: { status: 'pending', pendingSince: new Date() } }).lean<CustomDomainDoc>()) ?? d;
  }
  return runCheck(d);
}

export async function removeDomain(tenant: Tenant, actor: Actor, serviceId: string, domainId: string) {
  const teamId = tenant.team._id;
  await getService(teamId, serviceId);
  const d = await domainOf(teamId, serviceId, domainId);
  await CustomDomain.deleteOne({ _id: d._id });
  await audit({ action: 'service.domain_removed', actorUserId: actor.userId, actorApiKeyId: actor.apiKeyId, teamId, targetType: 'service', targetId: serviceId, meta: { hostname: d.hostname } });
  if (d.status === 'active') await publishService(serviceId);
}

/** Background checks: pending domains until they verify (or the window ends), live ones every 6 h. */
export async function checkDueDomains() {
  const now = Date.now();
  const due = await CustomDomain.find({
    $or: [
      { status: 'pending', $or: [{ checkedAt: null }, { checkedAt: { $lt: new Date(now - 60_000) } }] },
      { status: 'active', $or: [{ checkedAt: null }, { checkedAt: { $lt: new Date(now - RECHECK_ACTIVE_MS) } }] },
    ],
  })
    .sort({ checkedAt: 1 })
    .limit(100)
    .lean<CustomDomainDoc[]>();
  for (const d of due) {
    const slow = d.status === 'pending' && now - d.pendingSince.getTime() > FAST_PHASE_MS;
    if (slow && d.checkedAt && now - d.checkedAt.getTime() < 10 * 60_000) continue;
    if (!(await Service.exists({ _id: d.serviceId, lifecycle: 'active' }))) continue;
    await runCheck(d).catch((err: unknown) => ctx().log.warn({ err, domainId: d._id }, 'custom domain check failed'));
  }
}

export function registerDomainProcessors() {
  registerProcessor('periodic.domains', () => checkDueDomains());
}
