import { randomBytes } from 'node:crypto';
import { getRegion, normalizeEmail, planLimits } from '@digitalycloud/shared';
import { ctx } from './context';
import { withTransaction } from './db/connection';
import { BillingOperation, Deployment, DeploymentLog, EnvVar, Incident, Maintenance, Notification, OAuthState, Server, Service, SlugReservation, Team, User, type IncidentDoc, type ServerDoc } from './db/models';
import { newId } from './lib/ids';
import { envAad, replaceEnv } from './modules/services/env.service';
import { hashPassword } from './modules/auth/passwords';
import { totpAad } from './modules/auth/totp';
import { createUserWithTeam } from './modules/auth/users.service';
import { driverFor } from './runtime/driver';

/** `--key value` and `--flag` parsing. */
function flags(args: string[]) {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (!a.startsWith('--')) continue;
    const next = args[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      out[a.slice(2)] = next;
      i++;
    } else out[a.slice(2)] = true;
  }
  return out;
}
type Stage = IncidentDoc['updates'][number]['stage'];
const STAGES: Stage[] = ['Investigating', 'Identified', 'Monitoring', 'Resolved', 'Scheduled', 'Completed'];
function stageOf(v: string | true | undefined, fallback: Stage): Stage {
  if (typeof v !== 'string') return fallback;
  if (!STAGES.includes(v as Stage)) throw new Error(`--stage must be one of ${STAGES.join('|')}`);
  return v as Stage;
}
const need = (f: Record<string, string | true>, k: string) => {
  const v = f[k];
  if (typeof v !== 'string' || !v) throw new Error(`--${k} is required`);
  return v;
};

/** Probes a host and fills capacity (minus headroom for the OS and Docker) and capabilities. */
async function probe(server: ServerDoc, headroomPct: number) {
  const d = await driverFor(server);
  await d.ping();
  const info = await d.info();
  const quota = await d.probeStorageQuota(ctx().config.RUNTIME_PROBE_IMAGE);
  const keep = 1 - headroomPct / 100;
  const diskMb = server.hardware.diskTb * 1024 * 1024;
  return {
    capacity: { cpuMillis: Math.floor(info.cpus * 1000 * keep), memoryMb: Math.floor(info.memoryMb * keep), storageMb: Math.floor(diskMb * keep) },
    hardware: { cores: info.cpus, memoryGb: Math.round(info.memoryMb / 1024), diskTb: server.hardware.diskTb },
    capabilities: { storageQuota: quota, ociRuntime: info.runtimes.includes('runsc') ? 'runsc' : null, checkedAt: new Date() },
    info,
  };
}

async function addServer(f: Record<string, string | true>, local: boolean) {
  const regionId = (f.region as string) ?? 'lyon';
  if (!getRegion(regionId)) throw new Error(`Unknown region ${regionId}`);
  if (local && ctx().config.production) throw new Error('server add-local is for development only');
  const id = (f.id as string) ?? (local ? `${regionId}-local` : need(f, 'id'));
  const doc: ServerDoc = {
    _id: id,
    name: (f.name as string) ?? (local ? `${getRegion(regionId)!.city}-Local` : id),
    regionId,
    status: 'healthy',
    roles: ['runtime', 'build'],
    acceptingWorkloads: true,
    demo: false,
    publicIp: (f['public-ip'] as string) ?? null,
    privateIp: local ? '127.0.0.1' : need(f, 'private-ip'),
    docker: local
      ? { protocol: 'socket', host: null, port: null, socketPath: (f.socket as string) ?? '/var/run/docker.sock', tls: null }
      : { protocol: 'https', host: need(f, 'docker-host'), port: Number(f['docker-port'] ?? 2376), socketPath: null, tls: { caFile: need(f, 'tls-ca'), certFile: need(f, 'tls-cert'), keyFile: need(f, 'tls-key') } },
    capacity: { cpuMillis: 0, memoryMb: 0, storageMb: 0 },
    reserved: { cpuMillis: 0, memoryMb: 0, storageMb: 0 },
    hardware: { cores: 0, memoryGb: 0, diskTb: Number(f['disk-tb'] ?? (local ? 0.05 : 1)) },
    capabilities: { storageQuota: false, ociRuntime: null, checkedAt: null },
    bootedAt: new Date(),
    lastHeartbeatAt: null,
    lastError: null,
    collectorLease: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const p = await probe(doc, Number(f['headroom-pct'] ?? 15));
  Object.assign(doc, { capacity: p.capacity, hardware: p.hardware, capabilities: p.capabilities });
  await Server.findOneAndUpdate({ _id: id }, { $set: doc }, { upsert: true });
  console.log(`Registered ${doc.name} (${regionId}): ${p.info.cpus} CPUs, ${p.info.memoryMb} MB RAM, Docker ${p.info.serverVersion}, storage driver ${p.info.storageDriver}${p.info.backingFilesystem ? ` on ${p.info.backingFilesystem}` : ''}`);
  console.log(`Allocatable: ${doc.capacity.cpuMillis}m CPU, ${doc.capacity.memoryMb} MB RAM, ${doc.capacity.storageMb} MB disk`);
  if (!doc.capabilities.storageQuota) console.log('WARNING: this host cannot enforce per-container disk quotas; deployments will fail unless RUNTIME_ALLOW_UNENFORCED_STORAGE=true (development only).');
}

/** Development data only: refuses production and requires an explicit flag. */
async function seed(f: Record<string, string | true>) {
  const c = ctx().config;
  if (c.production) throw new Error('Refusing to seed a production database.');
  if (!f['confirm-dev']) throw new Error('Seeding writes demo data. Re-run with --confirm-dev on a development database.');
  const email = (f.email as string) ?? 'mehdi@digitaly.fr';
  const password = (f.password as string) ?? process.env.SEED_PASSWORD ?? randomBytes(9).toString('base64url');
  if (await User.exists({ emailNormalized: normalizeEmail(email) })) throw new Error(`${email} already exists; drop the development database to reseed.`);
  const { user, team } = await withTransaction((s) => createUserWithTeam(s, { name: 'Mehdi Forhrani', email, passwordHash: null, emailVerified: true }));
  await User.updateOne({ _id: user._id }, { $set: { passwordHash: await hashPassword(password), role: 'admin' } });

  // Catalog-correct demo services. They are stopped and have no build: nothing runs until you deploy them for real.
  const now = Date.now();
  const services = [
    { id: 'syncbot', name: 'SyncBot', type: 'discord' as const, repo: 'mehdi-f/syncbot', source: 'github' as const, branch: 'main', cmd: 'node index.js', port: null, env: [{ key: 'DISCORD_TOKEN', value: 'replace-with-a-real-token', secret: true }, { key: 'NODE_ENV', value: 'production', secret: false }] },
    { id: 'communityapi', name: 'CommunityAPI', type: 'api' as const, repo: 'digitaly/community-api', source: 'github' as const, branch: 'main', cmd: 'npm run start', port: 3000, env: [{ key: 'NODE_ENV', value: 'production', secret: false }] },
    { id: 'discordnotifier', name: 'DiscordNotifier', type: 'worker' as const, repo: 'ghcr.io/digitaly/notifier:latest', source: 'docker' as const, branch: null, cmd: 'node worker.js', port: null, env: [{ key: 'WEBHOOK_URL', value: 'https://example.invalid/webhook', secret: true }] },
  ];
  for (const [i, s] of services.entries()) {
    await withTransaction(async (session) => {
      const created = new Date(now - (60 - i * 20) * 86400_000);
      await SlugReservation.create([{ _id: s.id, serviceId: s.id, teamId: team._id, state: 'active', createdAt: created, expiresAt: null }], { session });
      await Service.create(
        [
          {
            _id: s.id, teamId: team._id, name: s.name, nameNormalized: s.name.toLowerCase(), type: s.type, plan: 'free', regionId: i === 1 ? 'paris' : 'lyon', source: s.source, repo: s.repo,
            repoNormalized: s.source === 'github' ? s.repo.toLowerCase() : null, branch: s.branch, uploadId: null, githubInstallationId: null, nodeVersion: '24 LTS', startCommand: s.cmd, port: s.port,
            autoDeploy: s.source === 'github', autoRestart: false, status: 'stopped', desiredState: 'stopped', lifecycle: 'active', deploymentSeq: 2, lastDeployAt: new Date(now - (2 + i) * 86400_000),
            activeDeploymentId: null, lastSuccessfulDeploymentId: null, startedAt: null, storageMb: 0, envVersion: 1, settingsVersion: 1, runtime: null, route: null, activeOperation: null, opGeneration: 0,
            pendingPush: null, resourceState: { status: 'applied', error: null, updatedAt: new Date() }, crash: { count: 0, windowStart: null, lastAt: null, backoffUntil: null }, createdBy: user._id, createdAt: created, updatedAt: created, deletingAt: null,
          },
        ],
        { session },
      );
      await replaceEnv(session, s.id, team._id, s.env);
      for (const n of [1, 2]) {
        const id = newId('deployment');
        const at = new Date(now - (n === 1 ? 10 : 2 + i) * 86400_000);
        await Deployment.create(
          [{ _id: id, serviceId: s.id, teamId: team._id, number: n, environment: 'Production', status: n === 1 ? 'success' : 'failed', stage: null, trigger: n === 1 ? 'initial' : 'manual', commit: 'demo000', commitMessage: n === 1 ? 'Initial deployment (demo record)' : 'Redeploy (demo record)', author: user.name, actor: { userId: user._id, apiKeyId: null }, source: { type: s.source, repo: s.repo, branch: s.branch, sha: null, uploadId: null, imageRef: null, archiveSha256: null }, config: { startCommand: s.cmd, nodeVersion: '24 LTS', port: s.port, settingsVersion: 1 }, imageRef: null, imageDigest: null, rollbackOf: null, serverId: null, generation: 0, createdAt: at, startedAt: at, finishedAt: at, durationSec: 0, failureCode: n === 2 ? 'DEMO' : null, failureReason: n === 2 ? 'Demo record: no real build was run.' : null, logLines: 1, imageRetainedUntil: null }],
          { session },
        );
        await DeploymentLog.create([{ deploymentId: id, serviceId: s.id, teamId: team._id, lineNo: 1, text: '==> Demo record created by the development seed. Deploy the service to run a real build.', ts: at, expiresAt: new Date(now + 90 * 86400_000) }], { session });
      }
    });
  }
  await Notification.create({ _id: newId('notification'), userId: user._id, teamId: team._id, serviceId: null, kind: 'info', category: 'product', title: 'Welcome to your development environment', body: 'These demo services are stopped records. Register a local Docker host (npm run cli -- server add-local) and deploy one to see real logs and metrics.', readAt: null, createdAt: new Date(), dedupeKey: 'seed:welcome', expiresAt: new Date(now + 90 * 86400_000) });
  console.log(`Seeded development data for ${email} (platform staff). Password: ${password}`);
  console.log(`Plans: SyncBot ${planLimits('discord', 'free').ramLimitMb} MB, CommunityAPI ${planLimits('api', 'free').ramLimitMb} MB, DiscordNotifier ${planLimits('worker', 'free').ramLimitMb} MB (all Free).`);
}

/** Re-encrypts every stored secret with the primary key (after adding a new key to ENCRYPTION_KEYS). */
async function rotateKeys() {
  const cipher = ctx().cipher;
  let n = 0;
  for await (const e of EnvVar.find().cursor()) {
    if (!cipher.needsRotation(e.valueEnc)) continue;
    const aad = envAad(e.serviceId, e._id, e.key);
    await EnvVar.updateOne({ _id: e._id }, { $set: { valueEnc: cipher.encrypt(cipher.decrypt(e.valueEnc, aad), aad) } });
    n++;
  }
  for await (const u of User.find({ $or: [{ 'twoFactor.secretEnc': { $ne: null } }, { 'twoFactor.pendingSecretEnc': { $ne: null } }] }).cursor()) {
    const set: Record<string, unknown> = {};
    for (const slot of ['active', 'pending'] as const) {
      const field = slot === 'active' ? 'secretEnc' : 'pendingSecretEnc';
      const enc = u.twoFactor[field];
      if (enc && cipher.needsRotation(enc)) set[`twoFactor.${field}`] = cipher.encrypt(cipher.decrypt(enc, totpAad(u._id, slot)), totpAad(u._id, slot));
    }
    if (Object.keys(set).length) {
      await User.updateOne({ _id: u._id }, { $set: set });
      n++;
    }
  }
  for await (const op of BillingOperation.find({ payloadEnc: { $ne: null } }).cursor()) {
    if (!op.payloadEnc || !cipher.needsRotation(op.payloadEnc)) continue;
    const aad = `billing-op:${op._id}`;
    await BillingOperation.updateOne({ _id: op._id }, { $set: { payloadEnc: cipher.encrypt(cipher.decrypt(op.payloadEnc, aad), aad) } });
    n++;
  }
  // OAuth verifiers live for minutes; drop any still encrypted with an old key (that login attempt simply restarts).
  await OAuthState.deleteMany({ codeVerifierEnc: { $ne: null }, 'codeVerifierEnc.kid': { $ne: ctx().config.keyRing.primaryId } });
  console.log(`Re-encrypted ${n} records with key ${ctx().config.keyRing.primaryId}. Old keys can be removed once no record uses them (outbox email payloads expire after 7 days).`);
}

export const COMMANDS: Record<string, (args: string[]) => Promise<void>> = {
  seed: async (args) => seed(flags(args)),
  'server add-local': async (args) => addServer(flags(args), true),
  'server add': async (args) => addServer(flags(args), false),
  'server list': async () => {
    for (const s of await Server.find().sort({ _id: 1 }).lean<ServerDoc[]>())
      console.log(`${s._id.padEnd(14)} ${s.status.padEnd(12)} ${s.regionId.padEnd(10)} reserved ${s.reserved.memoryMb}/${s.capacity.memoryMb} MB  quota:${s.capabilities.storageQuota ? 'yes' : 'NO'}  heartbeat:${s.lastHeartbeatAt?.toISOString() ?? 'never'}${s.demo ? '  (demo)' : ''}`);
  },
  'server probe': async (args) => {
    const s = await Server.findById(args[0]).lean<ServerDoc>();
    if (!s) throw new Error('Unknown server');
    const p = await probe(s, Number(flags(args)['headroom-pct'] ?? 15));
    await Server.updateOne({ _id: s._id }, { $set: { capacity: p.capacity, hardware: p.hardware, capabilities: p.capabilities, lastHeartbeatAt: new Date() } });
    console.log(`Probed ${s.name}: quota ${p.capabilities.storageQuota ? 'enforced' : 'NOT enforced'}, ${p.capacity.memoryMb} MB allocatable`);
  },
  'server set-status': async (args) => {
    const [id, status] = args;
    if (!['healthy', 'degraded', 'maintenance', 'offline'].includes(status ?? '')) throw new Error('status must be healthy|degraded|maintenance|offline');
    await Server.updateOne({ _id: id }, { $set: { status } });
    console.log(`${id} → ${status}`);
  },
  'staff grant': async (args) => {
    const r = await User.updateOne({ emailNormalized: normalizeEmail(args[0] ?? '') }, { $set: { role: 'admin' } });
    console.log(r.matchedCount ? `${args[0]} is now platform staff` : 'No such user');
  },
  'staff revoke': async (args) => {
    const r = await User.updateOne({ emailNormalized: normalizeEmail(args[0] ?? '') }, { $set: { role: 'user' } });
    console.log(r.matchedCount ? `${args[0]} is no longer platform staff` : 'No such user');
  },
  'incident create': async (args) => {
    const f = flags(args);
    const impact = need(f, 'impact') as IncidentDoc['impact'];
    if (!['minor', 'major', 'maintenance'].includes(impact)) throw new Error('--impact must be minor|major|maintenance');
    const id = newId('incident');
    await Incident.create({ _id: id, title: need(f, 'title'), impact, components: String(f.components ?? '').split(',').map((s) => s.trim()).filter(Boolean), startedAt: new Date(), resolvedAt: null, updates: [{ at: new Date(), stage: stageOf(f.stage, 'Investigating'), text: need(f, 'text') }], createdAt: new Date() });
    console.log(`Created ${id}`);
  },
  'incident update': async (args) => {
    const f = flags(args);
    const resolve = f.resolve === true;
    await Incident.updateOne({ _id: args[0] }, { $push: { updates: { at: new Date(), stage: stageOf(f.stage, resolve ? 'Resolved' : 'Monitoring'), text: need(f, 'text') } }, ...(resolve ? { $set: { resolvedAt: new Date() } } : {}) });
    console.log(`Updated ${args[0]}`);
  },
  'maintenance add': async (args) => {
    const f = flags(args);
    const id = newId('maintenance');
    await Maintenance.create({ _id: id, title: need(f, 'title'), body: need(f, 'body'), startsAt: new Date(need(f, 'starts')), endsAt: new Date(need(f, 'ends')), affected: String(f.affected ?? '').split(',').map((s) => s.trim()).filter(Boolean), notifiedAt: null, createdAt: new Date() });
    console.log(`Scheduled ${id}`);
  },
  'keys rotate': async () => rotateKeys(),
  'team show': async (args) => {
    const t = await Team.findById(args[0]).lean();
    console.log(JSON.stringify(t, null, 2));
  },
};
