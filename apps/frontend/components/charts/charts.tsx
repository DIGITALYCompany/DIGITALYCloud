'use client';

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

/** One chart row: `t` is the x label; a null value is a gap (no sample), never drawn as zero. */
export interface Point {
  t: string;
  [key: string]: number | string | null;
}

export interface SeriesDef {
  key: string;
  name: string;
  color: string;
  unit?: string;
}

export const CHART_COLORS = { primary: '#2563FF', secondary: '#12A8F0', accent: '#4FE3D3', green: '#22C55E', sky: '#86AAFF' };

interface TooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: readonly { dataKey?: unknown; value?: unknown }[];
  series: SeriesDef[];
}

function ChartTooltip({ active, label, payload, series }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-ink-850/95 px-3 py-2 text-xs shadow-2xl backdrop-blur-xl">
      <p className="mb-1.5 font-mono text-ink-400">{label}</p>
      {payload.map((p) => {
        const s = series.find((x) => x.key === p.dataKey);
        return (
          <div key={String(p.dataKey)} className="flex items-center gap-2 py-0.5">
            <span className="h-2 w-2 rounded-full" style={{ background: s?.color }} />
            <span className="text-ink-300">{s?.name}</span>
            <span className="ml-auto pl-4 font-mono font-medium text-white">
              {typeof p.value === 'number' ? p.value.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(p.value)}
              {s?.unit}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const axis = { stroke: '#66718A', fontSize: 11, tickLine: false, axisLine: false } as const;

export function AreaSeriesChart({
  data,
  series,
  height = 240,
  yDomain,
  yUnit = '',
  animate = true,
}: {
  data: Point[];
  series: SeriesDef[];
  height?: number;
  yDomain?: [number, number];
  yUnit?: string;
  animate?: boolean;
}) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="t" {...axis} minTickGap={28} />
          <YAxis {...axis} domain={yDomain} tickFormatter={(v) => `${v}${yUnit}`} width={52} />
          <Tooltip content={(props) => <ChartTooltip {...props} series={series} />} cursor={{ stroke: 'rgba(255,255,255,0.15)' }} />
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={2}
              fill={`url(#g-${s.key})`}
              isAnimationActive={animate}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BarSeriesChart({ data, series, height = 220, stacked = false }: { data: Point[]; series: SeriesDef[]; height?: number; stacked?: boolean }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="t" {...axis} minTickGap={16} />
          <YAxis {...axis} allowDecimals={false} />
          <Tooltip content={(props) => <ChartTooltip {...props} series={series} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} fill={s.color} radius={stacked && i < series.length - 1 ? 0 : [4, 4, 0, 0]} stackId={stacked ? 'a' : undefined} maxBarSize={22} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Sparkline({ data, dataKey, color = CHART_COLORS.primary, height = 40 }: { data: Point[]; dataKey: string; color?: string; height?: number }) {
  const gradientId = `sp-${dataKey}-${color.slice(1)}`;
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.4} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.6} fill={`url(#${gradientId})`} isAnimationActive={false} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
