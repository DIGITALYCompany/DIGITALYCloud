import { buildDeployLogs, seedApiKeys, seedDeployments, seedNotifications, seedServices, seedUser } from '@/data/seed';
import { getRegionByLabel, isRegionAllowed, regionLabel, serverFor } from '@/data/regions';
import { getServicePlan } from '@/lib/catalog';
import { slugify, uid } from '@/lib/format';
import type { ApiKey, Deployment, EnvVar, Notification, PlanId, Service, ServiceType, SourceType, User } from '@/lib/types';

// Simulated backend persisted in localStorage. Every function is async so it can be
// swapped for real HTTP calls without touching the UI.

interface Db {
  user: User | null;
  remember: boolean;
  services: Service[];
  deployments: Deployment[];
  apiKeys: ApiKey[];
  notifications: Notification[];
}

export interface CreateServiceInput {
  name: string;
  type: ServiceType;
  source: SourceType;
  repo: string;
  branch: string;
  nodeVersion: string;
  startCommand: string;
  port: number | null;
  plan: PlanId;
  region: string;
  env: EnvVar[];
}

const KEY = 'digitalycloud-db-v1';
const SESSION_KEY = 'digitalycloud-session';

function freshDb(): Db {
  const services = seedServices();
  return {
    user: null,
    remember: true,
    services,
    deployments: seedDeployments(services),
    apiKeys: seedApiKeys(),
    notifications: seedNotifications(),
  };
}

function load(): Db {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const stored = JSON.parse(raw) as Db;
      if (!stored.remember && !sessionStorage.getItem(SESSION_KEY)) stored.user = null;
      return stored;
    }
  } catch {
    /* corrupted storage falls back to seed */
  }
  return freshDb();
}

let state: Db | null = null;

// Loaded on first use (not at import time) so the module can be imported during server rendering.
function db(): Db {
  if (typeof window === 'undefined') throw new Error('The mock API is only available in the browser.');
  state ??= load();
  return state;
}

const save = () => localStorage.setItem(KEY, JSON.stringify(db()));

const wait = (ms = 450) => new Promise((r) => setTimeout(r, ms + Math.random() * 200));
const clone = <T,>(v: T): T => structuredClone(v);

function findService(id: string) {
  const s = db().services.find((x) => x.id === id);
  if (!s) throw new Error('Service not found');
  return s;
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  return { firstName: parts[0], avatarInitials: (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase() };
}

export const api = {
  auth: {
    async session() {
      await wait(150);
      const { user } = db();
      return user ? clone(user) : null;
    },
    async login(email: string, password: string, remember: boolean) {
      await wait(700);
      if (!email.includes('@')) throw new Error('Enter a valid email address.');
      if (password.length < 6) throw new Error('Incorrect email or password.');
      const d = db();
      d.user = seedUser(email);
      d.remember = remember;
      sessionStorage.setItem(SESSION_KEY, '1');
      save();
      return clone(d.user);
    },
    async loginWithGoogle() {
      await wait(900);
      const d = db();
      d.user = seedUser();
      d.remember = true;
      sessionStorage.setItem(SESSION_KEY, '1');
      save();
      return clone(d.user);
    },
    async signup(name: string, email: string, password: string) {
      await wait(800);
      if (name.trim().length < 2) throw new Error('Please enter your full name.');
      if (!email.includes('@')) throw new Error('Enter a valid email address.');
      if (password.length < 8) throw new Error('Password must be at least 8 characters.');
      const d = db();
      d.user = { ...seedUser(email), name: name.trim(), ...initialsOf(name) };
      d.remember = true;
      sessionStorage.setItem(SESSION_KEY, '1');
      save();
      return clone(d.user);
    },
    async requestReset(email: string) {
      await wait(700);
      if (!email.includes('@')) throw new Error('Enter a valid email address.');
      return true;
    },
    async updateProfile(patch: Partial<Pick<User, 'name' | 'email'>>) {
      await wait();
      const d = db();
      if (!d.user) throw new Error('Not signed in');
      d.user = { ...d.user, ...patch };
      if (patch.name) Object.assign(d.user, initialsOf(patch.name));
      save();
      return clone(d.user);
    },
    async logout() {
      await wait(200);
      db().user = null;
      sessionStorage.removeItem(SESSION_KEY);
      save();
    },
  },

  services: {
    async list() {
      await wait(500);
      return clone(db().services);
    },
    async create(input: CreateServiceInput) {
      await wait(300);
      const d = db();
      const plan = getServicePlan(input.type, input.plan);
      const region = getRegionByLabel(input.region);
      if (!region) throw new Error('Unknown region.');
      if (!isRegionAllowed(region, input.plan)) throw new Error(`${region.city} isn’t available on the ${plan.name} plan.`);
      let id = slugify(input.name) || uid('svc-');
      if (d.services.some((s) => s.id === id)) id = `${id}-${uid().slice(0, 4)}`;
      const now = Date.now();
      const service: Service = {
        id,
        name: input.name,
        type: input.type,
        status: 'deploying',
        cpu: 0,
        ramMb: 0,
        ramLimitMb: plan.ramMb,
        storageMb: 24,
        storageLimitMb: plan.storageGb * 1024,
        startedAt: null,
        createdAt: now,
        lastDeployAt: now,
        region: regionLabel(region),
        server: serverFor(region),
        runtime: input.source === 'docker' ? 'Docker' : 'Node.js',
        nodeVersion: input.nodeVersion,
        startCommand: input.startCommand,
        port: input.port,
        plan: input.plan,
        source: input.source,
        repo: input.repo,
        branch: input.branch,
        env: input.env,
      };
      const dep = newDeployment(service, 1, 'Initial deployment');
      d.services.unshift(service);
      d.deployments.unshift(dep);
      save();
      return { service: clone(service), deployment: clone(dep) };
    },
    async update(id: string, patch: Partial<Service>) {
      await wait();
      const current = findService(id);
      const region = getRegionByLabel(patch.region ?? current.region);
      if (region && !isRegionAllowed(region, patch.plan ?? current.plan)) throw new Error(`${region.city} isn’t available on this plan.`);
      Object.assign(current, patch);
      save();
      return clone(findService(id));
    },
    async restart(id: string) {
      await wait(1400);
      const s = findService(id);
      s.status = 'running';
      s.startedAt = Date.now();
      s.cpu = 3 + Math.random() * 4;
      s.ramMb = Math.round(s.ramLimitMb * (0.12 + Math.random() * 0.1));
      save();
      return clone(s);
    },
    async stop(id: string) {
      await wait(1000);
      const s = findService(id);
      s.status = 'stopped';
      s.startedAt = null;
      s.cpu = 0;
      s.ramMb = 0;
      save();
      return clone(s);
    },
    async remove(id: string) {
      await wait(900);
      const d = db();
      d.services = d.services.filter((s) => s.id !== id);
      d.deployments = d.deployments.filter((dep) => dep.serviceId !== id);
      save();
    },
    async setEnv(id: string, env: EnvVar[]) {
      await wait(350);
      findService(id).env = env;
      save();
      return clone(env);
    },
  },

  deployments: {
    async list(serviceId?: string) {
      await wait(400);
      const { deployments } = db();
      const list = serviceId ? deployments.filter((d) => d.serviceId === serviceId) : deployments;
      return clone([...list].sort((a, b) => b.createdAt - a.createdAt));
    },
    async trigger(serviceId: string) {
      await wait(300);
      const d = db();
      const s = findService(serviceId);
      const last = d.deployments.filter((dep) => dep.serviceId === serviceId).reduce((m, dep) => Math.max(m, dep.number), 0);
      const dep = newDeployment(s, last + 1, 'chore: redeploy from dashboard');
      s.status = 'deploying';
      d.deployments.unshift(dep);
      save();
      return { service: clone(s), deployment: clone(dep) };
    },
    async complete(deploymentId: string, ok: boolean) {
      await wait(200);
      const d = db();
      const dep = d.deployments.find((x) => x.id === deploymentId);
      if (!dep) throw new Error('Deployment not found');
      const s = findService(dep.serviceId);
      dep.status = ok ? 'success' : 'failed';
      dep.durationSec = Math.round((Date.now() - dep.createdAt) / 1000);
      dep.logs = buildDeployLogs(s.name, ok);
      s.lastDeployAt = Date.now();
      if (ok) {
        s.status = 'running';
        s.startedAt = Date.now();
        s.cpu = 2 + Math.random() * 5;
        s.ramMb = Math.round(s.ramLimitMb * (0.12 + Math.random() * 0.12));
      } else {
        s.status = s.startedAt ? 'running' : 'failed';
      }
      d.notifications.unshift({
        id: uid('n'),
        title: `Deployment #${dep.number} ${ok ? 'succeeded' : 'failed'}`,
        body: ok ? `${s.name} is live.` : `${s.name} failed its health check. Check the logs.`,
        time: Date.now(),
        read: false,
        kind: ok ? 'success' : 'error',
      });
      save();
      return { service: clone(s), deployment: clone(dep) };
    },
  },

  apiKeys: {
    async list() {
      await wait(350);
      return clone(db().apiKeys);
    },
    async create(name: string, scope: ApiKey['scope']) {
      await wait(600);
      const secret = `dgc_live_${uid()}${uid()}${uid()}`;
      const key: ApiKey = { id: uid('k'), name, prefix: secret.slice(0, 13), createdAt: Date.now(), lastUsed: null, scope };
      db().apiKeys.unshift(key);
      save();
      return { key: clone(key), secret };
    },
    async revoke(id: string) {
      await wait(500);
      const d = db();
      d.apiKeys = d.apiKeys.filter((k) => k.id !== id);
      save();
    },
  },

  notifications: {
    async list() {
      await wait(200);
      return clone(db().notifications);
    },
    async markAllRead() {
      const { notifications } = db();
      notifications.forEach((n) => (n.read = true));
      save();
      return clone(notifications);
    },
  },

  async resetDemo() {
    const { user } = db();
    state = freshDb();
    state.user = user;
    save();
  },
};

function newDeployment(s: Service, number: number, message: string): Deployment {
  return {
    id: `${s.id}-dep-${number}-${uid().slice(0, 4)}`,
    serviceId: s.id,
    number,
    environment: 'Production',
    status: 'building',
    createdAt: Date.now(),
    commit: Math.random().toString(16).slice(2, 9),
    commitMessage: message,
    author: db().user?.name ?? 'Mehdi Forhrani',
    durationSec: 0,
    logs: [],
  };
}
