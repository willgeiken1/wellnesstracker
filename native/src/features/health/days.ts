import type { HealthSource, SleepSpan } from './source';

/** Steps and hours asleep for a run of days, oldest first. Held in memory only: never saved, synced or sent. */
export type HealthDays = { steps: number[]; sleepHours: number[] };
const HOUR = 3_600_000;
/** Local midnight at the start of a `YYYY-MM-DD` day. */
export const dayStart = (day: string) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d); };
/** A night belongs to the day you wake up on: from 6 pm the evening before to noon. */
export const nightOf = (day: string) => { const start = dayStart(day); return { from: new Date(start.getTime() - 6 * HOUR), to: new Date(start.getTime() + 12 * HOUR) }; };

/** Hours asleep inside a window. Overlapping stretches (a watch and a phone both tracking) count once. */
export function hoursAsleep(spans: readonly SleepSpan[], from: Date, to: Date): number {
  const clipped = spans.map(span => [Math.max(span.start.getTime(), from.getTime()), Math.min(span.end.getTime(), to.getTime())] as const)
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start).sort((a, b) => a[0] - b[0]);
  let total = 0, reach = -Infinity;
  for (const [start, end] of clipped) {
    if (end <= reach) continue;
    total += end - Math.max(start, reach); reach = end;
  }
  return total / HOUR;
}

/** Reads the given days if the person has already been asked. Never prompts. A day that cannot be read counts as none. */
export async function readHealthDays(source: HealthSource | null, days: readonly string[], now = new Date()): Promise<HealthDays | null> {
  if (!source || !days.length || await source.access() !== 'asked') return null;
  const steps = await Promise.all(days.map(async day => {
    const from = dayStart(day), to = new Date(Math.min(from.getTime() + 24 * HOUR, now.getTime()));
    if (to <= from) return 0;
    try { const count = await source.steps(from, to); return Number.isFinite(count) && count > 0 ? Math.round(count) : 0; } catch { return 0; }
  }));
  let spans: SleepSpan[] = [];
  try { spans = await source.sleep(nightOf(days[0]).from, nightOf(days[days.length - 1]).to); } catch { spans = []; }
  const sleepHours = days.map(day => { const night = nightOf(day); return Math.min(18, hoursAsleep(spans, night.from, night.to)); });
  return { steps, sleepHours };
}
