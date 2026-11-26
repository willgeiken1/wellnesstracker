import { dayEnd, dayStart, nightOf, union } from '@/features/health/days';
import type { HealthSource, SleepSpan } from '@/features/health/source';
import type { HealthDetailIn } from './data';

const HOUR = 3_600_000, MINUTE = 60_000;
type Stage = 'awake' | 'core' | 'deep' | 'rem';

/** Today hour by hour, up to now. An hour with nothing recorded is 0 (the day's own total says whether there was anything);
 * an hour that could not be read is null, and the list is null when no hour could be read. */
async function hours(read: (from: Date, to: Date) => Promise<number | null>, day: string, now: Date): Promise<(number | null)[] | null> {
  const start = dayStart(day).getTime(), until = Math.min(now.getTime(), dayEnd(day).getTime());
  const out = await Promise.all(Array.from({ length: 24 }, async (_, h): Promise<number | null> => {
    const from = start + h * HOUR, to = Math.min(from + HOUR, until);
    if (to <= from) return 0; // an hour still to come has nothing in it yet
    try { return (await read(new Date(from), new Date(to))) ?? 0; } catch { return null; }
  }));
  return out.some(v => v !== null) ? out : null;
}

/**
 * Last night stretch by stretch, in minutes from bedtime: the first moment asleep to the last. Only devices that record
 * stages give a timeline; plain asleep from an older device has none, so the night is null and stage styles say so.
 */
export function nightTimeline(spans: readonly SleepSpan[], from: Date, to: Date): HealthDetailIn['night'] {
  const a = from.getTime(), b = to.getTime();
  const asleep = union(spans.filter(s => !s.awake), a, b);
  if (!asleep.length || !spans.some(s => s.stage)) return null;
  const bed = asleep[0][0], wake = asleep[asleep.length - 1][1];
  // Minute by minute, the first kind that claims it: awake, then core, REM and deep (the same order Insights uses).
  const total = Math.round((wake - bed) / MINUTE), kinds: (Stage | null)[] = Array.from({ length: total }, () => null);
  const paint = (list: readonly SleepSpan[], kind: Stage) => {
    for (const [s, e] of union(list, bed, wake)) for (let m = Math.floor((s - bed) / MINUTE); m < Math.ceil((e - bed) / MINUTE) && m < total; m++) if (!kinds[m]) kinds[m] = kind;
  };
  paint(spans.filter(s => s.awake), 'awake');
  paint(spans.filter(s => !s.awake && s.stage === 'core'), 'core');
  paint(spans.filter(s => !s.awake && s.stage === 'rem'), 'rem');
  paint(spans.filter(s => !s.awake && s.stage === 'deep'), 'deep');
  const stages: [Stage, number, number][] = [];
  kinds.forEach((k, m) => {
    if (!k) return;
    const lastStage = stages[stages.length - 1];
    if (lastStage && lastStage[0] === k && lastStage[2] === m) lastStage[2] = m + 1; else stages.push([k, m, m + 1]);
  });
  return stages.length ? { bed: new Date(bed), wake: new Date(wake), stages } : null;
}

/** Bedtime of each night as decimal hours (23.5 is 11:30 PM, 0.5 is 12:30 AM), or null with no sleep that night. */
async function bedtimes(source: HealthSource, days: readonly string[], now: Date): Promise<(number | null)[] | null> {
  const out = await Promise.all(days.map(async day => {
    const n = nightOf(day), to = new Date(Math.min(n.to.getTime(), now.getTime()));
    if (to <= n.from) return null;
    try {
      const asleep = union((await source.sleep(n.from, to)).filter(s => !s.awake), n.from.getTime(), to.getTime());
      if (!asleep.length) return null;
      const d = new Date(asleep[0][0]);
      return d.getHours() + d.getMinutes() / 60;
    } catch { return null; }
  }));
  return out.some(v => v !== null) ? out : null;
}

/**
 * The finer health readings only some Home styles need: today by the hour, last night's stages, bedtimes and today's
 * mindful sessions. Read from the health source when Home comes to the front; held in memory only, never saved or sent.
 */
export async function readHealthDetail(source: HealthSource | null, days: readonly string[], now = new Date()): Promise<HealthDetailIn | null> {
  if (!source || !days.length || await source.access() !== 'asked') return null;
  const today = days[days.length - 1], night = nightOf(today), cap = new Date(Math.min(night.to.getTime(), now.getTime()));
  const settle = async <T>(read: () => Promise<T>): Promise<T | null> => { try { return await read(); } catch { return null; } };
  const since = dayStart(days[0]);
  const [stepsHourly, activeHourly, exerciseHourly, spans, beds, mindful, bodyFat] = await Promise.all([
    hours((f, t) => source.steps(f, t), today, now),
    hours((f, t) => source.activeEnergy(f, t), today, now),
    hours((f, t) => source.exerciseMinutes(f, t), today, now),
    settle(() => source.sleep(night.from, cap)),
    settle(() => bedtimes(source, days, now)),
    settle(async () => (await source.mindful(dayStart(today), new Date(Math.min(dayEnd(today).getTime(), now.getTime()))))
      .map(s => ({ start: s.start, minutes: (s.end.getTime() - s.start.getTime()) / MINUTE })).filter(s => s.minutes > 0)),
    settle(async () => (await source.bodyFat(since)).filter(r => Number.isFinite(r.percent) && r.percent > 0 && r.at <= now)),
  ]);
  return { stepsHourly, activeHourly, exerciseHourly, night: spans ? nightTimeline(spans, night.from, cap) : null, bedtimes: beds, mindful, bodyFat };
}
