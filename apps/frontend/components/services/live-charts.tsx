'use client';

import { useEffect, useState } from 'react';
import type { MetricPointDto } from '@digitalycloud/shared';
import { AreaSeriesChart, CHART_COLORS, type Point } from '@/components/charts/charts';
import { api } from '@/lib/api';
import { events } from '@/lib/api/events';
import { formatClock } from '@/lib/format';
import type { Service } from '@/lib/types';

const WINDOW = 40;

const toPoint = (m: MetricPointDto): Point => ({ t: formatClock(m.ts), ts: m.ts, cpu: m.cpu, ram: m.ram, netIn: m.netIn, netOut: m.netOut, disk: m.disk });

/**
 * Live samples (every ~2 s while the service runs): the last 40 from `range=live`, then
 * `service.metrics` events. Nothing is generated client-side; no samples means an empty chart.
 */
export function useLiveServiceMetrics(serviceId: string) {
  const [points, setPoints] = useState<Point[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    const off = events.on('service.metrics', (m) => {
      if (m.serviceId !== serviceId) return;
      setPoints((list) => (list.some((p) => p.ts === m.ts) ? list : [...list, toPoint({ ts: m.ts, cpu: m.cpu, ram: m.ramMb, netIn: m.netIn, netOut: m.netOut, disk: m.storageMb })].slice(-WINDOW)));
    });
    api.metrics
      .service(serviceId, 'live')
      .then((r) => {
        if (!alive) return;
        // Merge with events that arrived while the backfill was loading.
        setPoints((live) => {
          const byTs = new Map<number, Point>();
          for (const p of [...r.data.map(toPoint), ...live]) byTs.set(p.ts as number, p);
          return [...byTs.values()].sort((a, b) => (a.ts as number) - (b.ts as number)).slice(-WINDOW);
        });
      })
      .catch(() => {})
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
      off();
    };
  }, [serviceId]);

  return { points, loaded, latest: points.at(-1) ?? null };
}

function NoSamples({ height, running }: { height: number; running: boolean }) {
  return (
    <div style={{ height }} className="flex items-center justify-center text-center text-sm text-ink-400">
      {running ? 'Waiting for the first measurements…' : 'No live data while the service is not running.'}
    </div>
  );
}

export function LiveCpuRamCharts({ service, height = 200 }: { service: Service; height?: number }) {
  const { points, latest } = useLiveServiceMetrics(service.id);
  const running = service.status === 'running';
  const num = (v: unknown) => (typeof v === 'number' ? v : null);
  const cpu = num(latest?.cpu);
  const ram = num(latest?.ram);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">CPU usage</p>
            <p className="text-xs text-ink-400">Live · updated every 2s</p>
          </div>
          <span className="font-mono text-lg text-white">{cpu === null ? '—' : `${cpu.toFixed(1)}%`}</span>
        </div>
        {points.length === 0 ? (
          <NoSamples height={height} running={running} />
        ) : (
          <AreaSeriesChart data={points} height={height} yUnit="%" animate={false} series={[{ key: 'cpu', name: 'CPU', color: CHART_COLORS.primary, unit: '%' }]} />
        )}
      </div>
      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Memory usage</p>
            <p className="text-xs text-ink-400">Limit {service.ramLimitMb} MB</p>
          </div>
          <span className="font-mono text-lg text-white">{ram === null ? '—' : `${ram} MB`}</span>
        </div>
        {points.length === 0 ? (
          <NoSamples height={height} running={running} />
        ) : (
          <AreaSeriesChart data={points} height={height} animate={false} series={[{ key: 'ram', name: 'Memory', color: CHART_COLORS.secondary, unit: ' MB' }]} />
        )}
      </div>
    </div>
  );
}
