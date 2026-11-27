import type { Unit } from '@/core/workout/rules';

/** Share of the top working weight for each warm-up, by how many warm-ups there are (Settings › Workout › Warm-up sets). */
export const WARM_PCT: Record<number, readonly number[]> = { 1: [0.6], 2: [0.5, 0.75], 3: [0.4, 0.6, 0.8], 4: [0.4, 0.55, 0.7, 0.85] };
/** Reps for each warm-up, falling as the weight climbs. */
export const WARM_REPS: Record<number, readonly number[]> = { 1: [5], 2: [8, 3], 3: [8, 5, 2], 4: [8, 5, 3, 1] };
/** Warm-ups suggested before the first exercise: one to four. */
export const warmCount = (n: unknown) => Math.min(4, Math.max(1, Math.round(Number(n)) || 2));

/**
 * The warm-up ramp toward a top working weight: each step a share of it, rounded to 2.5 kg or 5 lb and never under the bar
 * (or the smallest step for a lift without one). As on the mockup's `warmSets`.
 */
export function warmRamp(count: number, top: number, unit: Unit, bar?: number) {
  const k = warmCount(count), rnd = unit === 'kg' ? 2.5 : 5, floor = bar && bar > 0 ? bar : rnd;
  return WARM_PCT[k].map((p, i) => ({ pct: p, weight: Math.max(floor, Math.round(top * p / rnd) * rnd), reps: WARM_REPS[k][i] }));
}
