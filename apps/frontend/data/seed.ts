import type { ApiKey, Deployment, Invoice, Notification, Server, Service, User } from '@/lib/types';

const HOUR = 3600_000;
const DAY = 24 * HOUR;

export function seedUser(email = 'mehdi@digitaly.fr'): User {
  return {
    id: 'usr_mehdi',
    name: 'Mehdi Forhrani',
    firstName: 'Mehdi',
    email,
    plan: 'pro',
    role: 'admin',
    avatarInitials: 'MF',
  };
}

export function seedServices(now = Date.now()): Service[] {
  return [
    {
      id: 'syncbot',
      name: 'SyncBot',
      type: 'discord',
      status: 'running',
      cpu: 2.4,
      ramMb: 186,
      ramLimitMb: 1024,
      storageMb: 420,
      storageLimitMb: 5120,
      startedAt: now - (14 * DAY + 8 * HOUR + 23 * 60_000),
      createdAt: now - 62 * DAY,
      lastDeployAt: now - 2 * 60_000,
      region: 'France — Lyon',
      server: 'Lyon-01',
      runtime: 'Node.js',
      nodeVersion: '22 LTS',
      startCommand: 'node index.js',
      port: null,
      plan: 'starter',
      source: 'github',
      repo: 'mehdi-f/syncbot',
      branch: 'main',
      env: [
        { id: 'e1', key: 'DISCORD_TOKEN', value: 'MTI4NzQ1Njc4OTAxMjM0NTY3OA.GhX2kL.q9vPz-7sYtR3mN8wL4bC1dE6fA0', secret: true },
        { id: 'e2', key: 'DATABASE_URL', value: 'postgres://syncbot:Xk92@db.digitaly.internal:5432/syncbot', secret: true },
        { id: 'e3', key: 'NODE_ENV', value: 'production', secret: false },
        { id: 'e4', key: 'API_KEY', value: 'dgc_live_8f3a91c2e7b44d0f', secret: true },
      ],
    },
    {
      id: 'communityapi',
      name: 'CommunityAPI',
      type: 'api',
      status: 'running',
      cpu: 8.1,
      ramMb: 412,
      ramLimitMb: 2048,
      storageMb: 1840,
      storageLimitMb: 15360,
      startedAt: now - (5 * DAY + 13 * HOUR + 7 * 60_000),
      createdAt: now - 41 * DAY,
      lastDeployAt: now - 5 * DAY - 13 * HOUR,
      region: 'France — Paris',
      server: 'Paris-01',
      runtime: 'Node.js',
      nodeVersion: '20 LTS',
      startCommand: 'npm run start',
      port: 3000,
      plan: 'pro',
      source: 'github',
      repo: 'digitaly/community-api',
      branch: 'main',
      env: [
        { id: 'e5', key: 'DATABASE_URL', value: 'postgres://community:Pa55@db.digitaly.internal:5432/community', secret: true },
        { id: 'e6', key: 'NODE_ENV', value: 'production', secret: false },
        { id: 'e7', key: 'PORT', value: '3000', secret: false },
        { id: 'e8', key: 'JWT_SECRET', value: 'b7c2f9e1a4d8...k3', secret: true },
      ],
    },
    {
      id: 'discordnotifier',
      name: 'DiscordNotifier',
      type: 'worker',
      status: 'stopped',
      cpu: 0,
      ramMb: 0,
      ramLimitMb: 512,
      storageMb: 96,
      storageLimitMb: 1024,
      startedAt: null,
      createdAt: now - 18 * DAY,
      lastDeployAt: now - 2 * DAY,
      region: 'France — Lyon',
      server: 'Lyon-01',
      runtime: 'Node.js',
      nodeVersion: '22 LTS',
      startCommand: 'node worker.js',
      port: null,
      plan: 'free',
      source: 'upload',
      repo: 'notifier.zip',
      branch: '—',
      env: [
        { id: 'e9', key: 'WEBHOOK_URL', value: 'https://discord.com/api/webhooks/1234/abcd', secret: true },
        { id: 'e10', key: 'NODE_ENV', value: 'production', secret: false },
      ],
    },
  ];
}

const AUTHORS = ['Mehdi Forhrani', 'Sarah Lemoine', 'Mehdi Forhrani', 'Yanis B.'];
const MESSAGES = [
  'feat: add /sync slash command',
  'fix: handle reconnect on gateway timeout',
  'chore: bump discord.js to 14.16',
  'perf: cache guild settings in memory',
  'feat: rate-limit middleware',
  'fix: null check on member roles',
  'refactor: split command handlers',
  'feat: add healthcheck endpoint',
];

export function buildDeployLogs(serviceName: string, ok: boolean) {
  const lines = [
    '==> Preparing build environment (node:22-alpine)',
    '==> Cloning repository...',
    '==> Checked out commit',
    '==> Running npm ci',
    'added 214 packages, and audited 215 packages in 6s',
    'found 0 vulnerabilities',
  ];
  if (!ok) {
    return [
      ...lines,
      `==> Starting ${serviceName}`,
      "Error: Cannot find module './config/settings.json'",
      '    at Module._resolveFilename (node:internal/modules/cjs/loader:1225:15)',
      '    at Object.<anonymous> (/app/index.js:4:18)',
      '==> Health check failed after 30s',
      '==> Deployment failed. Previous version kept running.',
    ];
  }
  return [...lines, `==> Starting ${serviceName}`, '==> Health check passed', '==> Deployment successful'];
}

export function seedDeployments(services: Service[], now = Date.now()): Deployment[] {
  const out: Deployment[] = [];
  const configs: Record<string, { start: number; count: number; offsets: number[]; failed: number[] }> = {
    syncbot: { start: 42, count: 8, offsets: [2 / 60, 3, 26, 50, 75, 120, 190, 260], failed: [2, 6] },
    communityapi: { start: 18, count: 5, offsets: [133, 160, 210, 300, 420], failed: [3] },
    discordnotifier: { start: 6, count: 3, offsets: [48, 120, 200], failed: [] },
  };
  services.forEach((s) => {
    const c = configs[s.id];
    if (!c) return;
    for (let i = 0; i < c.count; i++) {
      const ok = !c.failed.includes(i);
      out.push({
        id: `${s.id}-dep-${c.start - i}`,
        serviceId: s.id,
        number: c.start - i,
        environment: 'Production',
        status: ok ? 'success' : 'failed',
        createdAt: now - c.offsets[i] * HOUR,
        commit: Math.random().toString(16).slice(2, 9),
        commitMessage: MESSAGES[(i + s.name.length) % MESSAGES.length],
        author: AUTHORS[i % AUTHORS.length],
        durationSec: 28 + ((i * 17) % 60),
        logs: buildDeployLogs(s.name, ok),
      });
    }
  });
  return out;
}

export const SERVERS: Server[] = [
  { id: 'lyon-01', name: 'Lyon-01', status: 'healthy', cpu: 34, ram: 58, storage: 42, containers: 47, region: 'France — Lyon', country: 'FR', ip: '51.178.42.10', cores: 32, memoryGb: 128, diskTb: 4, uptimeDays: 186 },
  { id: 'paris-01', name: 'Paris-01', status: 'healthy', cpu: 21, ram: 46, storage: 31, containers: 31, region: 'France — Paris', country: 'FR', ip: '51.210.88.24', cores: 24, memoryGb: 96, diskTb: 2, uptimeDays: 142 },
  { id: 'lyon-02', name: 'Lyon-02', status: 'maintenance', cpu: 0, ram: 4, storage: 8, containers: 0, region: 'France — Lyon', country: 'FR', ip: '51.178.42.11', cores: 32, memoryGb: 128, diskTb: 4, uptimeDays: 0 },
];

export const INVOICES: Invoice[] = [
  { id: 'inv1', number: 'DGC-2026-0918', date: '2026-09-15', amount: 6.99, status: 'paid', plan: 'Pro' },
  { id: 'inv2', number: 'DGC-2026-0817', date: '2026-08-15', amount: 6.99, status: 'paid', plan: 'Pro' },
  { id: 'inv3', number: 'DGC-2026-0716', date: '2026-07-15', amount: 6.99, status: 'paid', plan: 'Pro' },
  { id: 'inv4', number: 'DGC-2026-0615', date: '2026-06-15', amount: 2.99, status: 'paid', plan: 'Starter' },
  { id: 'inv5', number: 'DGC-2026-0514', date: '2026-05-15', amount: 2.99, status: 'paid', plan: 'Starter' },
  { id: 'inv6', number: 'DGC-2026-0413', date: '2026-04-15', amount: 2.99, status: 'paid', plan: 'Starter' },
];

export function seedApiKeys(now = Date.now()): ApiKey[] {
  return [
    { id: 'k1', name: 'GitHub Actions', prefix: 'dgc_live_8f3a', createdAt: now - 40 * DAY, lastUsed: now - 2 * HOUR, scope: 'full' },
    { id: 'k2', name: 'Grafana read-only', prefix: 'dgc_live_c71e', createdAt: now - 12 * DAY, lastUsed: now - 3 * DAY, scope: 'read' },
  ];
}

export function seedNotifications(now = Date.now()): Notification[] {
  return [
    { id: 'n1', title: 'Deployment #42 succeeded', body: 'SyncBot is live with commit "feat: add /sync slash command".', time: now - 2 * 60_000, read: false, kind: 'success' },
    { id: 'n2', title: 'High memory usage', body: 'CommunityAPI reached 78% of its memory limit.', time: now - 3 * HOUR, read: false, kind: 'warning' },
    { id: 'n3', title: 'Scheduled maintenance', body: 'Lyon-02 is being upgraded. No action needed.', time: now - 9 * HOUR, read: true, kind: 'info' },
    { id: 'n4', title: 'Invoice paid', body: 'Invoice DGC-2026-0918 of €6.99 was paid.', time: now - 18 * DAY, read: true, kind: 'success' },
  ];
}

export const ADMIN_TOP_SERVICES = [
  { name: 'SyncBot', owner: 'Mehdi Forhrani', type: 'Discord Bot', server: 'Lyon-01', cpu: 2.4, ram: 186, plan: 'Starter', status: 'running' },
  { name: 'CommunityAPI', owner: 'Mehdi Forhrani', type: 'API', server: 'Paris-01', cpu: 8.1, ram: 412, plan: 'Pro', status: 'running' },
  { name: 'Quizzly', owner: 'Léa Martin', type: 'Discord Bot', server: 'Lyon-01', cpu: 5.2, ram: 264, plan: 'Pro', status: 'running' },
  { name: 'shop-webhooks', owner: 'Nordwind SAS', type: 'Worker', server: 'Paris-01', cpu: 1.1, ram: 98, plan: 'Business', status: 'running' },
  { name: 'MinecraftLink', owner: 'Hugo Petit', type: 'Node.js', server: 'Lyon-01', cpu: 14.7, ram: 732, plan: 'Business', status: 'running' },
  { name: 'ticket-bot', owner: 'Camille R.', type: 'Discord Bot', server: 'Paris-01', cpu: 0, ram: 0, plan: 'Free', status: 'failed' },
  { name: 'portfolio-api', owner: 'Ines D.', type: 'API', server: 'Lyon-01', cpu: 0.6, ram: 74, plan: 'Starter', status: 'deploying' },
];
