import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { initialServiceLogs, randomLogLine } from '@/lib/simulation';
import type { LogLine, Service } from '@/lib/types';

/** Simulated log stream for a service. The buffer resets whenever the service or its status changes. */
export function useServiceLogs(service: Service) {
  const key = `${service.id}:${service.status}`;
  const [buffer, setBuffer] = useState<{ key: string; lines: LogLine[] }>(() => ({ key, lines: initialServiceLogs(service) }));
  const counter = useRef(100);

  if (buffer.key !== key) {
    setBuffer({ key, lines: initialServiceLogs(service) });
  }

  const append = useEffectEvent(() => {
    const line = randomLogLine(service, counter.current++);
    setBuffer((b) => ({ ...b, lines: [...b.lines.slice(-400), line] }));
  });

  const running = service.status === 'running';
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => append(), 2200);
    return () => clearInterval(t);
  }, [key, running]);

  return { lines: buffer.key === key ? buffer.lines : [], clear: () => setBuffer((b) => ({ ...b, lines: [] })) };
}
