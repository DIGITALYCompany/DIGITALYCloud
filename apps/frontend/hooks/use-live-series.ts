import { useEffect, useEffectEvent, useState } from 'react';
import { liveSample, liveSeriesHistory, type Point, type RandomSource } from '@/lib/simulation';

/**
 * Rolling live series that appends a sample every `intervalMs`.
 * `seed` makes the backfilled history deterministic so it can be server-rendered.
 */
export function useLiveSeries(seed: string, sample: (random: RandomSource) => Record<string, number>, length = 30, intervalMs = 2000) {
  const [data, setData] = useState<Point[]>(() => liveSeriesHistory(seed, sample, length, intervalMs));

  const append = useEffectEvent(() => {
    setData((d) => [...d.slice(1), liveSample(sample)]);
  });

  useEffect(() => {
    const id = setInterval(() => append(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return data;
}
