import { DEFAULT_REGION, REGIONS, type Region } from '@/data/regions';
import { cn } from '@/lib/utils';

const W = 100;
const H = 50;

// Equirectangular projection cropped to the inhabited latitudes we serve.
function project(r: Region) {
  return { x: ((r.lon + 130) / 295) * W, y: ((68 - r.lat) / 113) * H };
}

const AREA_LABELS = [
  { label: 'North America', x: 17, y: 4 },
  { label: 'Europe', x: 45, y: 1.5 },
  { label: 'Asia Pacific', x: 84, y: 14 },
];

const TIER_TONE: Record<Region['minPlan'], string> = {
  free: 'bg-aqua-400',
  starter: 'bg-azure-400',
  pro: 'bg-brand-400',
  business: 'bg-success-400',
};

const LEGEND: [Region['minPlan'], string][] = [
  ['free', 'Free · France'],
  ['starter', 'Starter · + Europe'],
  ['pro', 'Pro · + North America'],
  ['business', 'Business · + Asia Pacific'],
];

export function RegionMap() {
  const home = project(DEFAULT_REGION);
  return (
    <div className="relative w-full overflow-hidden rounded-3xl border border-white/[0.07] bg-ink-900/70">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:14px_14px]" />
      <div className="pointer-events-none absolute left-[38%] top-0 h-1/2 w-1/4 rounded-full bg-brand-500/15 blur-3xl" />
      <div className="relative mx-[4%] my-[6%] aspect-[2/1]">
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          <defs>
            <linearGradient id="infra-link" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#5384FF" />
              <stop offset="100%" stopColor="#4FE3D3" />
            </linearGradient>
          </defs>
          {REGIONS.filter((r) => r.id !== DEFAULT_REGION.id).map((r) => {
            const p = project(r);
            const dist = Math.hypot(p.x - home.x, p.y - home.y);
            const cx = (p.x + home.x) / 2;
            const cy = Math.min(p.y, home.y) - dist * 0.3;
            return (
              <path
                key={r.id}
                d={`M${home.x} ${home.y} Q${cx} ${cy} ${p.x} ${p.y}`}
                fill="none"
                stroke="url(#infra-link)"
                strokeOpacity={0.55}
                strokeWidth="0.25"
                strokeDasharray="1.5 2"
                className="animate-dash"
              />
            );
          })}
        </svg>
        {AREA_LABELS.map((a) => (
          <span
            key={a.label}
            className="absolute -translate-x-1/2 text-[10px] font-medium uppercase tracking-[0.16em] text-ink-400 sm:text-[11px]"
            style={{ left: `${a.x}%`, top: `${(a.y / H) * 100}%` }}
          >
            {a.label}
          </span>
        ))}
        {REGIONS.map((r) => {
          const p = project(r);
          const tone = TIER_TONE[r.minPlan];
          return (
            <div key={r.id} className="group absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%` }}>
              <span className="relative flex h-2 w-2 cursor-default sm:h-2.5 sm:w-2.5">
                <span className={cn('absolute inset-0 animate-ping rounded-full opacity-40', tone)} />
                <span className={cn('relative h-full w-full rounded-full border-2 border-ink-950', tone)} />
              </span>
              <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-ink-950/90 px-2 py-1 text-xs opacity-0 shadow-xl backdrop-blur transition group-hover:opacity-100">
                <span className="font-medium text-white">{r.city}</span>
                <span className="ml-1.5 font-mono text-[10px] text-ink-300">{r.code}</span>
              </span>
            </div>
          );
        })}
      </div>
      <div className="relative flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/[0.06] px-5 py-3 text-[11px] text-ink-300">
        {LEGEND.map(([t, label]) => (
          <span key={t} className="flex items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-full', TIER_TONE[t])} /> {label}
          </span>
        ))}
        <span className="ml-auto hidden items-center gap-2 sm:flex">
          <span className="h-px w-5 bg-linear-to-r/srgb from-brand-400 to-aqua-400" /> Private backbone from Lyon
        </span>
      </div>
    </div>
  );
}
