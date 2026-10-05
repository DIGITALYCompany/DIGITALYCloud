import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { events } from '@/lib/api/events';
import type { Deployment } from '@/lib/types';

/**
 * Build log of one deployment: the stored lines from `GET /deployments/:id`, then live
 * `deployment.log` events while it builds. Lines are keyed by number, so replays never duplicate.
 */
export function useDeploymentLogs(deployment: Pick<Deployment, 'id' | 'status'>, enabled = true) {
  const [lines, setLines] = useState<Map<number, string>>(() => new Map());
  const { id, status } = deployment;
  // The stored log is (re)loaded per id and status; `loadedFor` says which load finished last.
  const key = `${id}:${status}`;
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loading = enabled && loadedFor !== key;

  // Live lines first, so nothing logged while the history request is in flight is lost.
  useEffect(() => {
    if (!enabled || status !== 'building') return;
    return events.on('deployment.log', (e) => {
      if (e.deploymentId !== id) return;
      setLines((m) => (m.has(e.lineNo) ? m : new Map(m).set(e.lineNo, e.text)));
    });
  }, [id, status, enabled]);

  // (Re)load the stored log when opened and once the deployment finishes.
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    api.deployments
      .get(id)
      .then((d) => {
        if (!alive) return;
        setLines((m) => {
          const next = new Map(m);
          (d.logs ?? []).forEach((text, i) => next.set(i + 1, text));
          return next;
        });
        setError(null);
      })
      .catch((e: unknown) => alive && setError(errorMessage(e)))
      .finally(() => alive && setLoadedFor(`${id}:${status}`));
    return () => {
      alive = false;
    };
  }, [id, status, enabled]);

  const ordered = [...lines.entries()].sort((a, b) => a[0] - b[0]).map(([, t]) => t);
  return { lines: ordered, loading, error };
}
