import type { HealthSource, SleepSpan } from './source';

/** Steps, active calories, exercise minutes and hours asleep for a run of days, oldest first. Held in memory
 * only: never saved, synced or sent. A list is null when today's reading could not be made, so the tile is left
 * out instead of showing a false 0. */
export type HealthDays = { steps: number[] | null; sleepHours: number[] | null; activeKcal: number[] | null; exerciseMinutes: number[] | null };
const HOUR = 3_600_000;
const parts = (day: string) => day.split('-').map(Number) as [number, number, number];
/** Local midnight at the start of a `YYYY-MM-DD` day. */
export const dayStart = (day: string) => { const [y, m, d] = parts(day); return new Date(y, m - 1, d); };
/** Local midnight at the end of the day. Calendar maths, so a 23 or 25 hour day is still one day. */
export const dayEnd = (day: string) => { const [y, m, d] = parts(day); return new Date(y, m - 1, d + 1); };
/** A night belongs to the day you wake up on: from 6 pm the evening before to noon, by the clock on the wall. */
export const nightOf = (day: string) => { const [y, m, d] = parts(day); return { from: new Date(y, m - 1, d - 1, 18), to: new Date(y, m - 1, d, 12) }; };

/** The last `count` local days ending on the day of `now`, oldest first, as `YYYY-MM-DD`. */
export function lastDays(now: Date, count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (count - 1 - i));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
}

export type Range = readonly [number, number];
/** Clips to the window, drops bad stretches, and merges overlaps into separate ranges in order. */
export function union(spans: readonly SleepSpan[], from: number, to: number): Range[] {
  const clipped = spans.map(span => [Math.max(span.start.getTime(), from), Math.min(span.end.getTime(), to)] as const)
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start).sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of clipped) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end); else merged.push([start, end]);
  }
  return merged;
}
export const length = (ranges: readonly Range[]) => ranges.reduce((sum, [start, end]) => sum + end - start, 0);
export function overlap(a: readonly Range[], b: readonly Range[]): number {
  let total = 0;
  for (const [s1, e1] of a) for (const [s2, e2] of b) total += Math.max(0, Math.min(e1, e2) - Math.max(s1, s2));
  return total;
}

/** Hours asleep inside a window. Overlapping stretches (a watch and a phone both tracking) count once, and
 * time any device marked awake is taken out, even from another device's broad asleep block. */
export function hoursAsleep(spans: readonly SleepSpan[], from: Date, to: Date): number {
  const asleep = union(spans.filter(span => !span.awake), from.getTime(), to.getTime());
  const awake = union(spans.filter(span => span.awake), from.getTime(), to.getTime());
  return (length(asleep) - overlap(asleep, awake)) / HOUR;
}

/** Reads the given days if the person has already been asked. Never prompts. Nothing past `now` is counted. */
export async function readHealthDays(source: HealthSource | null, days: readonly string[], now = new Date()): Promise<HealthDays | null> {
  if (!source || !days.length || await source.access() !== 'asked') return null;
  const last = days.length - 1, cap = (date: Date) => new Date(Math.min(date.getTime(), now.getTime()));
  // One whole number per day from a day total. An earlier day that failed only loses its bar. Today failing
  // means there is no honest number to show.
  const totals = async (read: (from: Date, to: Date) => Promise<number>) => {
    const counts = await Promise.all(days.map(async day => {
      const from = dayStart(day), to = cap(dayEnd(day));
      if (to <= from) return 0;
      try { const count = await read(from, to); return Number.isFinite(count) && count > 0 ? Math.round(count) : 0; } catch { return null; }
    }));
    return counts[last] === null ? null : counts.map(count => count ?? 0);
  };
  const [steps, activeKcal, exerciseMinutes] = await Promise.all([
    totals((from, to) => source.steps(from, to)),
    totals((from, to) => source.activeEnergy(from, to)),
    totals((from, to) => source.exerciseMinutes(from, to)),
  ]);
  let sleepHours: number[] | null;
  try {
    const spans = await source.sleep(nightOf(days[0]).from, cap(nightOf(days[last]).to));
    sleepHours = days.map(day => { const night = nightOf(day), to = cap(night.to); return to > night.from ? hoursAsleep(spans, night.from, to) : 0; });
  } catch { sleepHours = null; }
  return { steps, sleepHours, activeKcal, exerciseMinutes };
}
