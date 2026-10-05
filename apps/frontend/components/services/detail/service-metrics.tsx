'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { AreaSeriesChart, CHART_COLORS, type Point } from '@/components/charts/charts';
import { ErrorState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { LiveCpuRamCharts, useLiveServiceMetrics } from '@/components/services/live-charts';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { dayLabelOf, hourLabelOf } from '@/lib/format';
import { useService } from './service-shell';

type Range = 'live' | '24h' | '7d' | '30d';

/** Placeholder for a chart with no samples in the window (an empty chart, never invented data). */
function ChartBody({ data, keys, loading, children }: { data: Point[]; keys: string[]; loading: boolean; children: ReactNode }) {
  if (loading) return <Skeleton className="h-[240px] w-full" />;
  if (!data.some((p) => keys.some((k) => typeof p[k] === 'number')))
    return <div className="flex h-[240px] items-center justify-center text-sm text-ink-400">No data for this period yet.</div>;
  return <>{children}</>;
}

export function ServiceMetrics() {
  const service = useService();
  const [range, setRange] = useState<Range>('live');
  const history = useApi(() => api.metrics.service(service.id, range === 'live' ? '24h' : range), [service.id, range], { enabled: range !== 'live' });
  const live = useLiveServiceMetrics(service.id);
  const hist = useMemo<Point[]>(() => {
    if (range === 'live') return live.points;
    const label = range === '24h' ? hourLabelOf : dayLabelOf;
    return (history.data?.data ?? []).map((p) => ({ t: label(p.ts), ts: p.ts, cpu: p.cpu, ram: p.ram, netIn: p.netIn, netOut: p.netOut, disk: p.disk }));
  }, [range, history.data, live.points]);
  const loading = range !== 'live' && history.loading && !history.data;

  if (range !== 'live' && history.error) return <ErrorState message={history.error} onRetry={history.reload} />;

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
            <ChartBody data={hist} keys={['cpu']} loading={loading}>
              <AreaSeriesChart data={hist} yUnit="%" series={[{ key: 'cpu', name: 'CPU', color: CHART_COLORS.primary, unit: '%' }]} />
            </ChartBody>
          </div>
          <div className="card p-5">
            <p className="mb-3 text-sm font-medium text-white">Memory usage</p>
            <ChartBody data={hist} keys={['ram']} loading={loading}>
              <AreaSeriesChart data={hist} series={[{ key: 'ram', name: 'Memory', color: CHART_COLORS.secondary, unit: ' MB' }]} />
            </ChartBody>
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
          <ChartBody data={hist} keys={['netIn', 'netOut']} loading={loading}>
            <AreaSeriesChart
              data={hist}
              series={[
                { key: 'netIn', name: 'Inbound', color: CHART_COLORS.accent, unit: ' KB/s' },
                { key: 'netOut', name: 'Outbound', color: CHART_COLORS.primary, unit: ' KB/s' },
              ]}
            />
          </ChartBody>
        </div>
        <div className="card p-5">
          <p className="mb-3 text-sm font-medium text-white">Storage</p>
          <ChartBody data={hist} keys={['disk']} loading={loading}>
            <AreaSeriesChart data={hist} series={[{ key: 'disk', name: 'Disk used', color: CHART_COLORS.green, unit: ' MB' }]} />
          </ChartBody>
        </div>
      </div>
    </div>
  );
}
