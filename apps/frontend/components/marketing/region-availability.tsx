import { Check, Minus } from 'lucide-react';
import { REGION_AREAS, REGIONS, isRegionAllowed } from '@/data/regions';
import { PLAN_LEVELS } from '@/lib/catalog';

const DEFAULT_NAMES = ['Free', 'Starter', 'Pro', 'Business'];

/** Region × plan-tier availability matrix. */
export function RegionAvailability({ planNames = DEFAULT_NAMES }: { planNames?: string[] }) {
  return (
    <div className="overflow-x-auto rounded-3xl border border-white/[0.07] bg-ink-900/50">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-white/[0.06] text-left">
            <th className="px-5 py-4 font-medium text-ink-300">Region</th>
            {PLAN_LEVELS.map((id, i) => (
              <th key={id} className="px-3 py-4 text-center font-medium text-white">
                {planNames[i] ?? DEFAULT_NAMES[i]}
              </th>
            ))}
          </tr>
        </thead>
        {REGION_AREAS.map((area) => (
          <tbody key={area}>
            <tr>
              <td colSpan={PLAN_LEVELS.length + 1} className="bg-white/[0.02] px-5 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-400">
                {area}
              </td>
            </tr>
            {REGIONS.filter((r) => r.area === area).map((r) => (
              <tr key={r.id} className="border-t border-white/[0.04] transition hover:bg-white/[0.02]">
                <td className="px-5 py-3">
                  <span className="text-white">{r.city}</span>
                  <span className="ml-2 font-mono text-[11px] text-ink-400">{r.code}</span>
                </td>
                {PLAN_LEVELS.map((id) => (
                  <td key={id} className="px-3 py-3 text-center">
                    {isRegionAllowed(r, id) ? <Check className="mx-auto h-4 w-4 text-success-400" aria-label="Included" /> : <Minus className="mx-auto h-4 w-4 text-ink-500" aria-label="Not included" />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
