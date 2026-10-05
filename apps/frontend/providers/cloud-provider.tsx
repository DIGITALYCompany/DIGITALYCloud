'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { CatalogResponse, CreateServiceInput, DeployRequest, EnvVarInput, PlanId, UpdateServiceInput } from '@digitalycloud/shared';
import { api, errorMessage, toService } from '@/lib/api';
import { events } from '@/lib/api/events';
import type { Deployment, Notification, Service } from '@/lib/types';
import { useAuth } from './auth-provider';
import { useToast } from './toast-provider';

interface CloudValue {
  services: Service[];
  deployments: Deployment[];
  notifications: Notification[];
  /** Plans, regions with live availability, Node versions and whether paid plans can be bought. */
  catalog: CatalogResponse | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  refreshService: (serviceId: string) => Promise<Service>;
  createService: (input: CreateServiceInput, idempotencyKey: string) => Promise<{ service: Service; deployment: Deployment }>;
  /** Starts a deployment. Its result arrives over the event stream (toast + state). */
  deploy: (serviceId: string, input?: DeployRequest) => Promise<Deployment>;
  start: (serviceId: string) => Promise<Service>;
  restart: (serviceId: string) => Promise<Service>;
  stop: (serviceId: string) => Promise<Service>;
  remove: (serviceId: string) => Promise<void>;
  update: (serviceId: string, patch: UpdateServiceInput) => Promise<Service>;
  /** Billed: rejects with a 402 `ApiError` carrying `details.checkoutUrl` when payment is needed. */
  changePlan: (serviceId: string, plan: PlanId) => Promise<Service>;
  setEnv: (serviceId: string, env: EnvVarInput[]) => Promise<void>;
  markNotificationsRead: () => Promise<void>;
  /** Marks a deployment started in this tab so its result is announced with a toast. */
  watchDeployment: (deploymentId: string) => void;
}

const CloudContext = createContext<CloudValue | null>(null);

const newer = (a: Deployment, b: Deployment) => b.createdAt - a.createdAt;

async function loadAll() {
  const [services, deployments, notifications, catalog] = await Promise.all([api.services.list(), api.deployments.list(), api.notifications.list(), api.catalog()]);
  return { services, deployments, notifications, catalog };
}

/** Services, deployments and notifications of the tab's team. Mounted by the dashboard layout. */
export function CloudProvider({ children }: { children: ReactNode }) {
  const { user, team, refreshTeams, refreshUser } = useAuth();
  const onAccessChanged = useCallback(async () => {
    await refreshUser();
    await refreshTeams().catch(() => {});
  }, [refreshUser, refreshTeams]);
  // A different user or team gets a fresh provider: no data from the previous one can flash.
  return (
    <CloudState key={`${user?.id ?? 'anon'}:${team?.id ?? 'none'}`} teamId={team?.id ?? null} onAccessChanged={onAccessChanged}>
      {children}
    </CloudState>
  );
}

function CloudState({ teamId, onAccessChanged, children }: { teamId: string | null; onAccessChanged: () => Promise<void>; children: ReactNode }) {
  const toast = useToast();
  const router = useRouter();
  const [services, setServices] = useState<Service[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const watched = useRef(new Set<string>());
  const servicesRef = useRef<Service[]>([]);
  useEffect(() => {
    servicesRef.current = services;
  }, [services]);

  const patchService = useCallback((s: Service) => setServices((list) => (list.some((x) => x.id === s.id) ? list.map((x) => (x.id === s.id ? s : x)) : [s, ...list])), []);
  const upsertDeployment = useCallback(
    (d: Deployment) =>
      setDeployments((list) => {
        const old = list.find((x) => x.id === d.id);
        if (!old) return [d, ...list].sort(newer);
        return list.map((x) => (x.id === d.id ? { ...d, logs: d.logs ?? x.logs } : x));
      }),
    []
  );

  const apply = useCallback((r: Awaited<ReturnType<typeof loadAll>>) => {
    setServices(r.services);
    setDeployments(r.deployments);
    setNotifications(r.notifications);
    setCatalog(r.catalog);
    setError(null);
  }, []);
  const fail = useCallback((e: unknown) => setError(errorMessage(e, 'Could not load your infrastructure.')), []);

  const fetchAll = useCallback(
    () =>
      loadAll()
        .then(apply, fail)
        .finally(() => setLoading(false)),
    [apply, fail]
  );

  const reload = useCallback(async () => {
    setError(null);
    await fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!teamId) return;
    let alive = true;
    loadAll()
      .then((r) => alive && apply(r), (e: unknown) => alive && fail(e))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [teamId, apply, fail]);

  // Live updates for this team over one shared stream per tab.
  useEffect(() => {
    if (!teamId) return;
    events.connect(teamId);
    const offs = [
      events.on('service.updated', (s) => {
        const current = servicesRef.current.find((x) => x.id === s.id);
        if (current) patchService(toService(s, current.env));
        // Created elsewhere (another tab, the API): load it with its environment.
        else api.services.get(s.id).then(patchService, () => patchService(toService(s)));
      }),
      events.on('service.deleted', ({ id }) => {
        setServices((list) => list.filter((x) => x.id !== id));
        setDeployments((list) => list.filter((d) => d.serviceId !== id));
      }),
      events.on('service.metrics', (m) =>
        setServices((list) => list.map((s) => (s.id === m.serviceId ? { ...s, cpu: m.cpu, ramMb: m.ramMb, storageMb: m.storageMb, metricsAt: m.ts } : s)))
      ),
      events.on('deployment.created', upsertDeployment),
      events.on('deployment.updated', (d) => {
        upsertDeployment(d);
        if (d.status === 'building' || !watched.current.has(d.id)) return;
        watched.current.delete(d.id);
        const name = servicesRef.current.find((s) => s.id === d.serviceId)?.name ?? d.serviceId;
        if (d.status === 'success') toast({ kind: 'success', title: 'Deployment successful', description: `${name} #${d.number} is now live.` });
        else
          toast({
            kind: 'error',
            title: `Deployment #${d.number} failed`,
            description: d.failureReason ?? 'Check the deployment logs for details.',
            action: { label: 'View deployment logs', onClick: () => router.push(`/services/${d.serviceId}/deployments`) },
          });
      }),
      events.on('notification.created', (n) => setNotifications((list) => (list.some((x) => x.id === n.id) ? list : [n, ...list].slice(0, 50)))),
      events.onControl((kind) => {
        if (kind === 'resync') void fetchAll();
        // Access may have changed (signed out elsewhere, removed from the team).
        if (kind === 'revoked' || kind === 'closed') onAccessChanged().catch(() => {});
      }),
    ];
    return () => {
      offs.forEach((off) => off());
      events.disconnect();
    };
  }, [teamId, fetchAll, onAccessChanged, patchService, upsertDeployment, toast, router]);

  const watchDeployment = useCallback((id: string) => void watched.current.add(id), []);

  const refreshService = useCallback(
    async (id: string) => {
      const s = await api.services.get(id);
      patchService(s);
      return s;
    },
    [patchService]
  );

  const createService = useCallback(
    async (input: CreateServiceInput, key: string) => {
      const res = await api.services.create(input, key);
      patchService(res.service);
      upsertDeployment(res.deployment);
      watched.current.add(res.deployment.id);
      return res;
    },
    [patchService, upsertDeployment]
  );

  const deploy = useCallback(
    async (serviceId: string, input: DeployRequest = {}) => {
      const { service, deployment } = await api.services.deploy(serviceId, input, `deploy-${serviceId}-${crypto.randomUUID()}`);
      if (service) patchService({ ...service, env: servicesRef.current.find((s) => s.id === serviceId)?.env ?? service.env });
      upsertDeployment(deployment);
      watched.current.add(deployment.id);
      toast({ kind: 'info', title: `Deploying ${service?.name ?? serviceId}`, description: `Deployment #${deployment.number} has started.` });
      return deployment;
    },
    [patchService, upsertDeployment, toast]
  );

  const control = useCallback(
    (fn: (id: string) => Promise<Service>) => async (id: string) => {
      const s = await fn(id);
      patchService(s);
      return s;
    },
    [patchService]
  );

  const remove = useCallback(async (id: string) => {
    await api.services.remove(id);
    setServices((list) => list.filter((s) => s.id !== id));
    setDeployments((list) => list.filter((d) => d.serviceId !== id));
  }, []);

  const setEnv = useCallback(async (id: string, env: EnvVarInput[]) => {
    const saved = await api.services.setEnv(id, env);
    setServices((list) => list.map((s) => (s.id === id ? { ...s, env: saved } : s)));
  }, []);

  const markNotificationsRead = useCallback(async () => setNotifications(await api.notifications.markAllRead()), []);

  const value = useMemo<CloudValue>(
    () => ({
      services,
      deployments,
      notifications,
      catalog,
      loading,
      error,
      reload,
      refreshService,
      createService,
      deploy,
      start: control(api.services.start),
      restart: control(api.services.restart),
      stop: control(api.services.stop),
      remove,
      update: (id: string, patch: UpdateServiceInput) => control((x) => api.services.update(x, patch))(id),
      changePlan: (id: string, plan: PlanId) => control((x) => api.services.changePlan(x, plan))(id),
      setEnv,
      markNotificationsRead,
      watchDeployment,
    }),
    [services, deployments, notifications, catalog, loading, error, reload, refreshService, createService, deploy, control, remove, setEnv, markNotificationsRead, watchDeployment]
  );

  return <CloudContext.Provider value={value}>{children}</CloudContext.Provider>;
}

export function useCloud() {
  const ctx = useContext(CloudContext);
  if (!ctx) throw new Error('useCloud must be used within CloudProvider');
  return ctx;
}
