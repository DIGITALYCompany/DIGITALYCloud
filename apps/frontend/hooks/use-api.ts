import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '@/lib/api';

/**
 * Loads data on mount (and when `deps` change) and exposes loading/error/reload.
 * Stale responses from an earlier `deps` value are ignored.
 */
export function useApi<T>(load: () => Promise<T>, deps: readonly unknown[] = [], opts: { enabled?: boolean } = {}) {
  const enabled = opts.enabled ?? true;
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: enabled });
  const loader = useRef(load);
  useEffect(() => {
    loader.current = load;
  });
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const n = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await loader.current();
      if (n === seq.current) setState({ data, error: null, loading: false });
      return data;
    } catch (e) {
      if (n === seq.current) setState((s) => ({ ...s, error: errorMessage(e), loading: false }));
      return null;
    }
  }, []);

  useEffect(() => {
    if (enabled) void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callers pass the values `load` depends on
  }, [enabled, reload, ...deps]);

  const setData = useCallback((update: T | ((prev: T | null) => T)) => setState((s) => ({ ...s, data: typeof update === 'function' ? (update as (p: T | null) => T)(s.data) : update })), []);
  return { ...state, reload, setData };
}
