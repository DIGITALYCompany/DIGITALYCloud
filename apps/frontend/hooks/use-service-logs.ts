import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import type { LogLine } from '@/lib/types';

const MAX_LINES = 1000;

/**
 * Runtime log tail for a service over SSE (`/services/:id/logs/stream`): the last 200 lines,
 * then live lines. Reconnects resume with `since=<last id>` so nothing is duplicated or lost;
 * `logs.reset` (cursor too old) restarts from the latest lines. Older history loads on demand.
 * State is per mount: render the consumer with `key={serviceId}`.
 */
export function useServiceLogs(serviceId: string) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [state, setState] = useState<'connecting' | 'live' | 'reconnecting' | 'closed'>('connecting');
  const [hasOlder, setHasOlder] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const last = useRef(0);
  const first = useRef<number | null>(null);

  useEffect(() => {
    let source: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let stopped = false;

    const open = () => {
      if (stopped) return;
      const es = new EventSource(api.logs.streamUrl(serviceId, last.current || undefined), { withCredentials: true });
      source = es;
      es.addEventListener('open', () => {
        attempts = 0;
        setState('live');
        setError(null);
      });
      es.addEventListener('log', (e) => {
        const line = JSON.parse((e as MessageEvent<string>).data) as LogLine;
        if (line.id <= last.current) return;
        last.current = line.id;
        first.current ??= line.id;
        setLines((l) => [...l.slice(-(MAX_LINES - 1)), line]);
      });
      es.addEventListener('logs.reset', () => {
        // Too far behind: the server restarts from its latest lines.
        last.current = 0;
        first.current = null;
        setLines([]);
      });
      es.addEventListener('stream.revoked', () => {
        es.close();
        stopped = true;
        setState('closed');
        setError('Log streaming stopped because access to this service ended.');
      });
      es.addEventListener('error', () => {
        // Reopen ourselves so the cursor (since=) is current; the browser's retry would reuse the old URL.
        es.close();
        if (stopped) return;
        setState('reconnecting');
        timer = setTimeout(open, Math.min(15_000, 1000 * 2 ** attempts++));
      });
    };
    open();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      source?.close();
    };
  }, [serviceId]);

  const loadOlder = useCallback(async () => {
    if (first.current === null) return;
    try {
      const page = await api.logs.history(serviceId, { limit: 200, before: first.current });
      if (page.data.length) first.current = page.data[0]!.id;
      setHasOlder(page.nextCursor !== null);
      setLines((l) => [...page.data.filter((x) => !l.some((y) => y.id === x.id)), ...l]);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [serviceId]);

  // Clearing only hides lines: the stream keeps its position.
  const clear = useCallback(() => setLines([]), []);
  return { lines, clear, state, error, loadOlder, hasOlder };
}
