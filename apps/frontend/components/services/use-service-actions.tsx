'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@/components/ui/modal';
import { useCloud } from '@/providers/cloud-provider';
import { useToast } from '@/providers/toast-provider';
import type { Service } from '@/lib/types';

type Pending = 'stop' | 'delete' | null;
export type ActionBusy = 'restart' | 'stop' | 'start' | 'deploy' | null;

/** Start/stop/restart/deploy/delete for a service, with toasts and confirmation dialogs (render `dialogs`). */
export function useServiceActions(service: Service | undefined) {
  const cloud = useCloud();
  const toast = useToast();
  const router = useRouter();
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState<ActionBusy>(null);

  const run = async (kind: Exclude<ActionBusy, null>, fn: () => Promise<void>, success: string) => {
    if (!service) return;
    setBusy(kind);
    try {
      await fn();
      if (success) toast({ kind: 'success', title: success });
    } catch (e) {
      toast({ kind: 'error', title: 'Action failed', description: e instanceof Error ? e.message : 'Please try again.' });
    } finally {
      setBusy(null);
    }
  };

  const restart = () => service && run('restart', () => cloud.restart(service.id), `${service.name} restarted`);
  const start = () => service && run('start', () => cloud.restart(service.id), `${service.name} is starting`);
  const deploy = () => service && run('deploy', () => cloud.deploy(service.id), '');
  const askStop = () => setPending('stop');
  const askDelete = () => setPending('delete');

  const dialogs = service ? (
    <>
      <ConfirmDialog
        open={pending === 'stop'}
        onClose={() => setPending(null)}
        title={`Stop ${service.name}?`}
        description={<>The service will go offline immediately{service.type === 'discord' ? ' and your bot will disconnect from Discord' : ''}. You can start it again at any time.</>}
        confirmLabel="Stop service"
        onConfirm={async () => {
          await cloud.stop(service.id);
          toast({ kind: 'warning', title: `${service.name} stopped`, description: 'The service is now offline.' });
        }}
      />
      <ConfirmDialog
        open={pending === 'delete'}
        onClose={() => setPending(null)}
        title={`Delete ${service.name}?`}
        description="This permanently deletes the service, its deployments, logs and environment variables. This cannot be undone."
        confirmLabel="Delete service"
        confirmText={service.name}
        onConfirm={async () => {
          await cloud.remove(service.id);
          toast({ kind: 'success', title: `${service.name} deleted` });
          router.push('/services');
        }}
      />
    </>
  ) : null;

  return { restart, start, deploy, askStop, askDelete, busy, dialogs };
}
