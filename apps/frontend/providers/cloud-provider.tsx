'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api, type CreateServiceInput } from '@/lib/api';
import type { Deployment, EnvVar, Notification, Service } from '@/lib/types';
import { useAuth } from './auth-provider';
import { useToast } from './toast-provider';

interface CloudValue {
  services: Service[];
  deployments: Deployment[];
  notifications: Notification[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  createService: (input: CreateServiceInput) => Promise<{ service: Service; deployment: Deployment }>;
  completeDeployment: (deploymentId: string, ok: boolean) => Promise<Service>;
  deploy: (serviceId: string) => Promise<void>;
  restart: (serviceId: string) => Promise<void>;
  stop: (serviceId: string) => Promise<void>;
  remove: (serviceId: string) => Promise<void>;
  update: (serviceId: string, patch: Partial<Service>) => Promise<void>;
  setEnv: (serviceId: string, env: EnvVar[]) => Promise<void>;
  markNotificationsRead: () => Promise<void>;
  resetDemo: () => Promise<void>;
}

const CloudContext = createContext<CloudValue | null>(null);

/** Services, deployments and notifications for the signed-in user. Mounted by the dashboard layout. */
export function CloudProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [services, setServices] = useState<Service[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(
    () =>
      Promise.all([api.services.list(), api.deployments.list(), api.notifications.list()])
        .then(([s, d, n]) => {
          setServices(s);
          setDeployments(d);
          setNotifications(n);
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load your infrastructure.'))
        .finally(() => setLoading(false)),
    []
  );

  const reload = useCallback(async () => {
    setError(null);
    await fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (user) fetchAll();
  }, [user, fetchAll]);

  // Simulated live resource usage for running services.
  useEffect(() => {
    const t = setInterval(() => {
      setServices((list) =>
        list.map((s) => {
          if (s.status !== 'running') return s;
          const cpu = Math.max(0.3, Math.min(95, s.cpu + (Math.random() - 0.5) * Math.max(0.6, s.cpu * 0.25)));
          const ramMb = Math.max(32, Math.min(s.ramLimitMb * 0.95, s.ramMb + (Math.random() - 0.5) * s.ramMb * 0.03));
          return { ...s, cpu: +cpu.toFixed(1), ramMb: Math.round(ramMb) };
        })
      );
    }, 3000);
    return () => clearInterval(t);
  }, []);

  const patchService = (s: Service) => setServices((list) => list.map((x) => (x.id === s.id ? s : x)));
  const upsertDeployment = (d: Deployment) =>
    setDeployments((list) => (list.some((x) => x.id === d.id) ? list.map((x) => (x.id === d.id ? d : x)) : [d, ...list]));
  const refreshNotifications = () => api.notifications.list().then(setNotifications);

  const completeDeployment = useCallback(async (deploymentId: string, ok: boolean) => {
    const { service, deployment } = await api.deployments.complete(deploymentId, ok);
    patchService(service);
    upsertDeployment(deployment);
    refreshNotifications();
    return service;
  }, []);

  const createService = useCallback(async (input: CreateServiceInput) => {
    const res = await api.services.create(input);
    setServices((list) => [res.service, ...list]);
    upsertDeployment(res.deployment);
    return res;
  }, []);

  const deploy = useCallback(
    async (serviceId: string) => {
      const { service, deployment } = await api.deployments.trigger(serviceId);
      patchService(service);
      upsertDeployment(deployment);
      toast({ kind: 'info', title: `Deploying ${service.name}`, description: `Deployment #${deployment.number} has started.` });
      setTimeout(async () => {
        const ok = Math.random() > 0.15;
        const s = await completeDeployment(deployment.id, ok);
        if (ok) {
          toast({ kind: 'success', title: 'Deployment successful', description: `${s.name} #${deployment.number} is now live.` });
        } else {
          toast({
            kind: 'error',
            title: `Deployment #${deployment.number} failed`,
            description: 'The health check did not pass. Your previous version is still running.',
            action: { label: 'View deployment logs', onClick: () => router.push(`/services/${s.id}/deployments`) },
          });
        }
      }, 6500);
    },
    [toast, router, completeDeployment]
  );

  const restart = useCallback(async (id: string) => patchService(await api.services.restart(id)), []);
  const stop = useCallback(async (id: string) => patchService(await api.services.stop(id)), []);
  const update = useCallback(async (id: string, patch: Partial<Service>) => patchService(await api.services.update(id, patch)), []);
  const remove = useCallback(async (id: string) => {
    await api.services.remove(id);
    setServices((list) => list.filter((s) => s.id !== id));
    setDeployments((list) => list.filter((d) => d.serviceId !== id));
  }, []);
  const setEnv = useCallback(async (id: string, env: EnvVar[]) => {
    const saved = await api.services.setEnv(id, env);
    setServices((list) => list.map((s) => (s.id === id ? { ...s, env: saved } : s)));
  }, []);
  const markNotificationsRead = useCallback(async () => setNotifications(await api.notifications.markAllRead()), []);
  const resetDemo = useCallback(async () => {
    await api.resetDemo();
    await reload();
  }, [reload]);

  return (
    <CloudContext.Provider
      value={{
        services,
        deployments,
        notifications,
        loading,
        error,
        reload,
        createService,
        completeDeployment,
        deploy,
        restart,
        stop,
        remove,
        update,
        setEnv,
        markNotificationsRead,
        resetDemo,
      }}
    >
      {children}
    </CloudContext.Provider>
  );
}

export function useCloud() {
  const ctx = useContext(CloudContext);
  if (!ctx) throw new Error('useCloud must be used within CloudProvider');
  return ctx;
}
