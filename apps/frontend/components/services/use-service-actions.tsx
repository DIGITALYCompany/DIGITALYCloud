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

  const run = async (kind: Exclude<ActionBusy, null>, fn: () => Promise<unknown>, success: string) => {
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

  // The API answers once the worker finished, or with the operation still in progress.
  const settled = (s: Service, done: string, pending: string) => (s.operation ? pending : done);
  const restart = () => service && run('restart', async () => toast({ kind: 'success', title: settled(await cloud.restart(service.id), `${service.name} restarted`, `Restarting ${service.name}…`) }), '');
  const start = () => service && run('start', async () => toast({ kind: 'success', title: settled(await cloud.start(service.id), `${service.name} is running`, `Starting ${service.name}…`) }), '');
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
          const s = await cloud.stop(service.id);
          toast(s.operation ? { kind: 'info', title: `Stopping ${service.name}…` } : { kind: 'warning', title: `${service.name} stopped`, description: 'The service is now offline.' });
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

  // Work running on the server (possibly started from another tab) also counts as busy.
  const op = service?.operation?.kind;
  const serverBusy: ActionBusy = op === 'restart' ? 'restart' : op === 'stop' ? 'stop' : op === 'start' ? 'start' : op === 'deploy' ? 'deploy' : null;
  return { restart, start, deploy, askStop, askDelete, busy: busy ?? serverBusy, dialogs };
}
