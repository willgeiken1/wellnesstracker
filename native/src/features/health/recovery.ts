import { dayEnd, dayStart, length, nightOf, overlap, union } from './days';
import type { HealthSource, SleepSpan, SleepStage, Spread } from './source';

/** Minutes of last night by kind. `asleep` is plain asleep from a device that records no stages. */
export type Night = { deep: number; core: number; rem: number; asleep: number; awake: number };
/** What Insights › Recovery shows. Held in memory for the screen only: never saved, synced or sent.
 * Daily lists run oldest first and hold null for a day with no reading. A part is null when it could not be read. */
export type Recovery = {
  night: Night | null;
  restingHeartRate: (number | null)[] | null;
  hrv: (number | null)[] | null;
  heartToday: Spread | null;
  vo2Max: { value: number; at: Date } | null;
};
const MINUTE = 60_000;
const STAGES: readonly SleepStage[] = ['deep', 'core', 'rem'];

/** Last night by stage, inside a window. Each stage counts once across devices, and time any device marked awake
 * is taken out of every stage. Plain asleep counts only where no device recorded a stage. Awake is counted from
 * the first moment asleep to the last, so lying awake before or after sleep is left out. Null with no sleep. */
export function nightStages(spans: readonly SleepSpan[], from: Date, to: Date): Night | null {
  const a = from.getTime(), b = to.getTime();
  const asleep = spans.filter(span => !span.awake), awake = union(spans.filter(span => span.awake), a, b);
  const all = union(asleep, a, b);
  if (!all.length) return null;
  const [first, last] = [all[0][0], all[all.length - 1][1]];
  const minutes = (ranges: readonly (readonly [number, number])[], minus: readonly (readonly [number, number])[]) => Math.round((length(ranges) - overlap(ranges, minus)) / MINUTE);
  const night = { awake: Math.round(length(union(spans.filter(span => span.awake), first, last)) / MINUTE) } as Night;
  for (const stage of STAGES) night[stage] = minutes(union(asleep.filter(span => span.stage === stage), a, b), awake);
  const staged = union(spans.filter(span => span.awake || span.stage), a, b);
  night.asleep = minutes(union(asleep.filter(span => !span.stage), a, b), staged);
  return night;
}

const settle = async <T>(read: () => Promise<T>): Promise<T | null> => { try { return await read(); } catch { return null; } };
const finite = (value: number | undefined) => value !== undefined && Number.isFinite(value) && value > 0;

/** Reads recovery for the given days (oldest first, ending today) if the person has already been asked. Never
 * prompts. Nothing past `now` is counted. Each part stands alone, so one failed read only leaves that part out. */
export async function readRecovery(source: HealthSource | null, days: readonly string[], now = new Date()): Promise<Recovery | null> {
  if (!source || !days.length || await source.access() !== 'asked') return null;
  const cap = (date: Date) => new Date(Math.min(date.getTime(), now.getTime()));
  const today = days[days.length - 1], night = nightOf(today);
  const daily = (metric: 'restingHeartRate' | 'hrv') => settle(() => Promise.all(days.map(async day => {
    const from = dayStart(day), to = cap(dayEnd(day));
    if (to <= from) return null;
    const read = await source.heart(metric, from, to);
    return read && finite(read.average) ? Math.round(read.average) : null;
  })));
  const [spans, restingHeartRate, hrv, heartToday, vo2Max] = await Promise.all([
    settle(() => source.sleep(night.from, cap(night.to))),
    daily('restingHeartRate'),
    daily('hrv'),
    settle(async () => {
      const read = await source.heart('heartRate', dayStart(today), cap(dayEnd(today)));
      return read && finite(read.average) && finite(read.min) && finite(read.max) ? { average: Math.round(read.average), min: Math.round(read.min), max: Math.round(read.max) } : null;
    }),
    settle(async () => { const read = await source.vo2Max(); return read && finite(read.value) && read.at <= now ? { value: Math.round(read.value * 10) / 10, at: read.at } : null; }),
  ]);
  return { night: spans ? nightStages(spans, night.from, cap(night.to)) : null, restingHeartRate, hrv, heartToday, vo2Max };
}
