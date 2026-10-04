'use client';

import { useMemo, useState } from 'react';
import { AreaSeriesChart, CHART_COLORS } from '@/components/charts/charts';
import { Tabs } from '@/components/ui/tabs';
import { LiveCpuRamCharts } from '@/components/services/live-charts';
import { dayLabel, hourLabel, makeSeries } from '@/lib/simulation';
import type { Service } from '@/lib/types';
import { useService } from './service-shell';

type Range = 'live' | '24h' | '7d' | '30d';

/** Deterministic history for a service, seeded by id and range so it is stable across visits. */
function history(service: Service, range: Range) {
  const pts = range === '24h' ? 24 : range === '7d' ? 7 * 4 : 30;
  const label = range === '24h' ? hourLabel(24) : dayLabel(pts);
  const cpuBase = Math.max(2, service.cpu || 3);
  return makeSeries(
    `${service.id}-${range}`,
    pts,
    {
      cpu: { base: cpuBase, spread: cpuBase * 0.9, min: 0.2 },
      ram: { base: service.ramMb || service.ramLimitMb * 0.15, spread: (service.ramMb || 100) * 0.2, min: 20 },
      netIn: { base: 60, spread: 50, min: 2 },
      netOut: { base: 30, spread: 30, min: 1 },
      disk: { base: service.storageMb, spread: 6, min: 0 },
    },
    label
  );
}

export function ServiceMetrics() {
  const service = useService();
  const [range, setRange] = useState<Range>('live');

  // Recomputed only when the service or range changes, not on every live usage tick.
  const key = `${service.id}-${range}`;
  const [snapshot, setSnapshot] = useState({ key, service });
  if (snapshot.key !== key) setSnapshot({ key, service });
  const hist = useMemo(() => history(snapshot.service, range), [snapshot, range]);

  return (
    <div className="space-y-4">
      <Tabs<Range>
        value={range}
        onChange={setRange}
        tabs={[
          { id: 'live', label: 'Live' },
          { id: '24h', label: '24 hours' },
          { id: '7d', label: '7 days' },
          { id: '30d', label: '30 days' },
        ]}
      />

      {range === 'live' ? (
        <LiveCpuRamCharts service={service} height={240} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card p-5">
            <p className="mb-3 text-sm font-medium text-white">CPU usage</p>
            <AreaSeriesChart data={hist} yUnit="%" series={[{ key: 'cpu', name: 'CPU', color: CHART_COLORS.primary, unit: '%' }]} />
          </div>
          <div className="card p-5">
            <p className="mb-3 text-sm font-medium text-white">Memory usage</p>
            <AreaSeriesChart data={hist} series={[{ key: 'ram', name: 'Memory', color: CHART_COLORS.secondary, unit: ' MB' }]} />
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-white">Network</p>
            <div className="flex gap-3 text-xs text-ink-400">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-aqua-500" /> In
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-brand-500" /> Out
              </span>
            </div>
          </div>
          <AreaSeriesChart
            data={hist}
            series={[
              { key: 'netIn', name: 'Inbound', color: CHART_COLORS.accent, unit: ' KB/s' },
              { key: 'netOut', name: 'Outbound', color: CHART_COLORS.primary, unit: ' KB/s' },
            ]}
          />
        </div>
        <div className="card p-5">
          <p className="mb-3 text-sm font-medium text-white">Storage</p>
          <AreaSeriesChart data={hist} series={[{ key: 'disk', name: 'Disk used', color: CHART_COLORS.green, unit: ' MB' }]} />
        </div>
      </div>
    </div>
  );
}
