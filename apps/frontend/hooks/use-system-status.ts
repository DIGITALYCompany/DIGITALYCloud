import { useEffect, useState } from 'react';
import type { StatusResponse } from '@digitalycloud/shared';
import { api } from '@/lib/api';

let cached: { at: number; promise: Promise<StatusResponse | null> } | null = null;

/** Current platform state from `GET /status` (shared by every badge on the page, refreshed each minute). */
export function useSystemStatus() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  useEffect(() => {
    let alive = true;
    if (!cached || Date.now() - cached.at > 60_000) cached = { at: Date.now(), promise: api.status().catch(() => null) };
    cached.promise.then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, []);
  return status;
}

export const STATUS_COPY: Record<StatusResponse['current'], { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  ok: { label: 'All systems operational', tone: 'success' },
  maintenance: { label: 'Scheduled maintenance', tone: 'warning' },
  degraded: { label: 'Degraded performance', tone: 'warning' },
  outage: { label: 'Service disruption', tone: 'danger' },
  unknown: { label: 'System status', tone: 'neutral' },
};
