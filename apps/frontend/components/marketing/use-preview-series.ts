import { useEffect, useEffectEvent, useState } from 'react';
import type { Point } from '@/components/charts/charts';
import { formatClock } from '@/lib/format';

/**
 * Decorative animation for the marketing dashboard preview only. It is labelled as an
 * illustration on the page and is never used for customer data.
 */
type RandomSource = () => number;

function seeded(seed: number): RandomSource {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function hashStr(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h) + 1;
}

/** Rolling series; the seeded backfill makes server-rendered markup match the first client render. */
export function usePreviewSeries(seed: string, sample: (random: RandomSource) => Record<string, number>, length = 30, intervalMs = 2000) {
  const [data, setData] = useState<Point[]>(() => {
    const random = seeded(hashStr(seed));
    const now = Date.now();
    return Array.from({ length }, (_, i) => ({ t: formatClock(now - (length - 1 - i) * intervalMs), ...sample(random) }));
  });

  const append = useEffectEvent(() => {
    setData((d) => [...d.slice(1), { t: formatClock(Date.now()), ...sample(Math.random) }]);
  });

  useEffect(() => {
    const id = setInterval(() => append(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return data;
}
