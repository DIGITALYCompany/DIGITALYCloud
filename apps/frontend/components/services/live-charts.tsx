'use client';

import { AreaSeriesChart, CHART_COLORS } from '@/components/charts/charts';
import { useLiveSeries } from '@/hooks/use-live-series';
import type { Service } from '@/lib/types';

/** Live CPU/RAM/network samples around the service's current usage. */
export function useLiveServiceMetrics(service: Service) {
  return useLiveSeries(
    `metrics-${service.id}`,
    (random) => {
      if (service.status !== 'running') return { cpu: 0, ram: 0, netIn: 0, netOut: 0 };
      return {
        cpu: +Math.max(0.1, service.cpu + (random() - 0.5) * Math.max(1, service.cpu * 0.4)).toFixed(1),
        ram: Math.round(service.ramMb + (random() - 0.5) * service.ramMb * 0.04),
        netIn: +(20 + random() * 80).toFixed(1),
        netOut: +(10 + random() * 50).toFixed(1),
      };
    },
    40,
    2000
  );
}

export function LiveCpuRamCharts({ service, height = 200 }: { service: Service; height?: number }) {
  const data = useLiveServiceMetrics(service);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">CPU usage</p>
            <p className="text-xs text-ink-400">Live · updated every 2s</p>
          </div>
          <span className="font-mono text-lg text-white">{Number(data[data.length - 1].cpu).toFixed(1)}%</span>
        </div>
        <AreaSeriesChart data={data} height={height} yUnit="%" animate={false} series={[{ key: 'cpu', name: 'CPU', color: CHART_COLORS.primary, unit: '%' }]} />
      </div>
      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Memory usage</p>
            <p className="text-xs text-ink-400">Limit {service.ramLimitMb} MB</p>
          </div>
          <span className="font-mono text-lg text-white">{data[data.length - 1].ram} MB</span>
        </div>
        <AreaSeriesChart data={data} height={height} animate={false} series={[{ key: 'ram', name: 'Memory', color: CHART_COLORS.secondary, unit: ' MB' }]} />
      </div>
    </div>
  );
}
