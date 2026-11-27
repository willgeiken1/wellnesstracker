import type { Unit } from '@/features/onboarding/model';

/**
 * What the Progress tab, its tiles and its screens read: one plain object, worked out on the phone from what is logged here
 * and what Apple Health and Oura send (see source.ts), or the sample set in Look around first (sample.ts).
 * Units are canonical: kilograms, centimetres, kcal, minutes. Every daily list runs oldest first and ends today; a day with
 * nothing to show is null, never 0. Held in memory only: nothing here is saved, synced or sent anywhere.
 */
export type Range = 'week' | 'month' | 'year';
export const RANGES: readonly Range[] = ['week', 'month', 'year'];
export type MetricKey = 'weight' | 'sleep' | 'hrv' | 'rhr' | 'steps' | 'kcal' | 'training' | 'score';
export type Daily = (number | null)[];
/** How many days of history each daily list holds. */
export const HISTORY = 365;
export type Stage = 'awake' | 'rem' | 'core' | 'deep';
export interface Night {
  /** Minutes in bed, and of each stage. */
  min: number; deep: number; rem: number; core: number; awake: number;
  /** Minutes after midnight (bed may be negative: before midnight). Null when the source gives no times. */
  bed: number | null; wake: number | null;
  source: 'Oura' | 'Apple Health';
  /** The night in order, as [stage, minutes], when the source gives it. */
  segments: (readonly [Stage, number])[] | null;
}
export type MeasureKey = 'chest' | 'waist' | 'hips' | 'neck' | 'arm' | 'thigh';
export const MEASURE_KEYS: readonly MeasureKey[] = ['chest', 'waist', 'hips', 'neck', 'arm', 'thigh'];
export interface Measured { day: string; cm: Partial<Record<MeasureKey, number>> }
export type Pose = 'Front' | 'Side' | 'Back';
export interface ProgressPhoto { id: string; day: string; kg: number | null; pose: Pose; uri: string | null; /** Silhouette width for the sample photos. */ fig?: number }
export interface LiftBest { name: string; kg: number; reps: number; day: string; unit: Unit }
export type Pillars = { training: number | null; food: number | null; sleep: number | null };

export interface ProgressData {
  /** Today, YYYY-MM-DD, and the moment the data was read. */
  today: string; now: number;
  demo: boolean;
  unit: Unit;
  days: Record<MetricKey, Daily>;
  /** Today's pillars and the last 7 days' (oldest first, today last). */
  pillars: Pillars;
  /** Yesterday's day score, the gauge's comparison mark. */
  yesterdayScore: number | null;
  weekPillars: Pillars[];
  /** The usual from the 28 days before today. */
  baseline: { score: number | null; training: number | null; food: number | null; sleep: number | null };
  /** A plain line for each of the last 7 days (what was logged). */
  dayNotes: string[];
  night: Night | null;
  /** Wake time for the last 7 nights, minutes after midnight. */
  wake: Daily;
  hrvBand: readonly [number, number] | null; rhrBand: readonly [number, number] | null;
  sleepGoalMin: number; stepGoal: number;
  /** heart: where the HRV and resting heart rate shown came from, which can be Apple Health even with Oura connected. */
  sources: { oura: boolean; apple: boolean; ouraSynced: string | null; heart: 'Oura' | 'Apple Health' | null };
  weight: { kg: number | null; day: string | null; time: string | null; startKg: number | null; startDay: string | null; goalKg: number | null };
  /** Body fat readings, oldest first; `health` marks one from a smart scale through Apple Health. */
  bodyFat: { day: string; pct: number; health?: boolean }[];
  measures: Measured[];
  photos: ProgressPhoto[];
  training: {
    goalMin: number | null; weekVolumeKg: number; lastWeekVolumeKg: number; sessions: number;
    active: { name: string; min: number } | null;
    plan: { name: string | null; perWeek: number; done: number };
    next: { name: string; exercises: number; estMin: number; when: string } | null;
    records: LiftBest[]; streak: number;
  };
  food: { goalKcal: number | null; eatenKcal: number | null; proteinG: number | null; proteinGoal: number | null };
}

/* ---------- numbers ---------- */
export const LB = 2.2046226218487757, IN = 2.54;
export const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
export function avg(list: readonly (number | null | undefined)[]): number | null {
  const n = list.filter(finite);
  return n.length ? n.reduce((a, b) => a + b, 0) / n.length : null;
}
export const sum = (list: readonly (number | null | undefined)[]) => list.reduce<number>((a, b) => a + (finite(b) ? b : 0), 0);
export const r1 = (v: number) => Math.round(v * 10) / 10;
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export function lastIndex(v: Daily) { let i = v.length - 1; while (i > 0 && v[i] == null) i--; return i; }

/* ---------- days ---------- */
const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function parseDay(day: string) { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(day: string, n: number) { const d = parseDay(day); return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)); }
/** The `count` days ending on `today`, oldest first. */
export function daysEnding(today: string, count: number) { return Array.from({ length: count }, (_, i) => addDays(today, i - count + 1)); }
export const DN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DNL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MNL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "Nov 22" */
export const dShort = (day: string | Date) => { const d = typeof day === 'string' ? parseDay(day) : day; return `${MN[d.getMonth()]} ${d.getDate()}`; };
/** "Sun, Nov 22" */
export const dLong = (day: string | Date) => { const d = typeof day === 'string' ? parseDay(day) : day; return `${DN[d.getDay()]}, ${dShort(d)}`; };
/** "Sunday, November 22" */
export const dFull = (day: string | Date) => { const d = typeof day === 'string' ? parseDay(day) : day; return `${DNL[d.getDay()]}, ${MNL[d.getMonth()]} ${d.getDate()}`; };
export const weekday = (day: string) => DN[parseDay(day).getDay()];
export const daysBetween = (a: string, b: string) => Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86400000);

/* ---------- metrics ---------- */
export interface MetricInfo {
  key: MetricKey; kind: 'line' | 'bar'; mini?: 'dots' | 'heat'; color: string; icon: string; best: 'min' | 'max';
  dec: number; line: boolean; partialToday: boolean; yearSum?: boolean;
}
export const METRICS: Record<MetricKey, MetricInfo> = {
  weight: { key: 'weight', kind: 'line', color: 'recovery', icon: 'weight', best: 'min', dec: 1, line: true, partialToday: false },
  sleep: { key: 'sleep', kind: 'bar', color: 'sleep', icon: 'sleep', best: 'max', dec: 2, line: false, partialToday: false },
  hrv: { key: 'hrv', kind: 'line', color: 'recovery', icon: 'heart', best: 'max', dec: 0, line: true, partialToday: false },
  rhr: { key: 'rhr', kind: 'line', mini: 'dots', color: 'recovery', icon: 'heart', best: 'min', dec: 0, line: true, partialToday: false },
  steps: { key: 'steps', kind: 'bar', mini: 'heat', color: 'training', icon: 'steps', best: 'max', dec: 0, line: false, partialToday: true },
  kcal: { key: 'kcal', kind: 'bar', mini: 'dots', color: 'food', icon: 'calories', best: 'max', dec: 0, line: false, partialToday: true },
  training: { key: 'training', kind: 'bar', color: 'training', icon: 'workouts', best: 'max', dec: 0, line: false, partialToday: true, yearSum: true },
  score: { key: 'score', kind: 'bar', color: 'accent', icon: 'score', best: 'max', dec: 0, line: false, partialToday: false },
};
export const TREND_KEYS: readonly Exclude<MetricKey, 'score'>[] = ['weight', 'sleep', 'hrv', 'rhr', 'steps', 'kcal', 'training'];

/** A metric's value in what the person sees: weight in their unit, the rest as stored. */
export const shown = (key: MetricKey, v: number | null, unit: Unit) => v == null ? null : key === 'weight' && unit === 'lb' ? v * LB : v;

export interface Series {
  v: Daily;
  /** Spoken label per point ("Today", "Sat, Nov 21", "November 2026"), the axis tick, and the short label in the bubble. */
  labels: string[]; ticks: string[]; sl: string[];
  /** The point still going (today), drawn lighter, or -1. */
  partial: number;
  /** The first day (or month) of each point. */
  keys: string[];
}
/** A metric over a range, in display units. Week is the last 7 days, month the last 30, year the last 12 months
 * (each month's average; training adds up the month). */
export function series(d: ProgressData, key: MetricKey, range: Range): Series {
  const m = METRICS[key], all = d.days[key], n = range === 'week' ? 7 : 30;
  if (range !== 'year') {
    const days = daysEnding(d.today, n), v = all.slice(-n).map(x => shown(key, x, d.unit));
    while (v.length < n) v.unshift(null);
    return {
      v, keys: days,
      labels: days.map((day, i) => i === n - 1 ? 'Today' : dLong(day)),
      sl: days.map(day => range === 'week' ? weekday(day) : dShort(day)),
      ticks: days.map((day, i) => range === 'week' ? weekday(day) : (n - 1 - i) % 7 === 0 ? (i === n - 1 ? 'Today' : dShort(day)) : ''),
      partial: m.partialToday ? n - 1 : -1,
    };
  }
  const t = parseDay(d.today), all365 = daysEnding(d.today, all.length);
  const months = Array.from({ length: 12 }, (_, i) => new Date(t.getFullYear(), t.getMonth() - 11 + i, 1));
  const v = months.map(mo => {
    const vals = all.filter((x, i) => { const day = parseDay(all365[i]); return day.getFullYear() === mo.getFullYear() && day.getMonth() === mo.getMonth(); });
    const got = vals.filter(finite);
    if (!got.length) return null;
    return shown(key, m.yearSum ? sum(got) : avg(got), d.unit);
  });
  return {
    v, keys: months.map(dayKey),
    labels: months.map(mo => `${MNL[mo.getMonth()]} ${mo.getFullYear()}`),
    ticks: months.map(mo => MN[mo.getMonth()].charAt(0)), sl: months.map(mo => MN[mo.getMonth()]), partial: -1,
  };
}
export function stats(v: Daily) {
  const n = v.filter(finite);
  return { avg: avg(v), max: n.length ? Math.max(...n) : null, min: n.length ? Math.min(...n) : null, n: n.length };
}

/* ---------- body ---------- */
/** When the weight goal is reached at the 30-day pace, or null when it is not heading there. */
export function goalEta(d: ProgressData): string | null {
  const w = d.weight, list = d.days.weight.slice(-30), first = list.findIndex(finite), lastI = lastIndex(list);
  if (w.kg == null || w.goalKg == null || first < 0 || !finite(list[lastI]) || lastI <= first) return null;
  // The 30-day pace: the change across the weigh-ins in the last 30 days, per day of that span.
  const rate = ((list[first] as number) - (list[lastI] as number)) / (lastI - first + 1);
  const toGo = w.kg - w.goalKg;
  if (!(rate > 0) || toGo <= 0) return null;
  return addDays(d.today, Math.round(toGo / rate));
}
/** Change over the last 30 days of weigh-ins, kg. */
export function change30(d: ProgressData) {
  const list = d.days.weight.slice(-30), a = list.find(finite), b = list[lastIndex(list)];
  return finite(a) && finite(b) ? b - a : null;
}
export const latestMeasures = (d: ProgressData) => d.measures[d.measures.length - 1] ?? null;
export function measureValue(d: ProgressData, key: MeasureKey): number | null {
  for (let i = d.measures.length - 1; i >= 0; i--) { const v = d.measures[i].cm[key]; if (finite(v)) return v; }
  return null;
}

/* ---------- the week ---------- */
export interface WeekReport {
  avgScore: number | null; workouts: number; volPct: number | null; sleepAvg: number | null; kcalAvg: number | null;
  onTarget: number; logged: number; wDeltaKg: number | null; shortNights: string[]; lowSteps: number; stepsAvg: number | null;
  prs: LiftBest[]; minutes: number; from: string; to: string;
}
/** This week's numbers: the last 7 days, today last. */
export function weekReport(d: ProgressData): WeekReport {
  const days = daysEnding(d.today, 7), score = d.days.score.slice(-7), sleep = d.days.sleep.slice(-7), food = d.days.kcal.slice(-7, -1);
  const goal = d.food.goalKcal, w = d.days.weight.slice(-8);
  const loggedFood = food.filter(finite);
  const onTarget = goal ? loggedFood.filter(k => k >= goal * 0.8 && k <= goal * 1.15).length : 0;
  const steps = d.days.steps.slice(-7, -1);
  const wa = w.find(finite), wb = w[lastIndex(w)];
  const t = d.training;
  return {
    avgScore: avg(score) == null ? null : Math.round(avg(score)!),
    workouts: t.sessions, volPct: t.lastWeekVolumeKg > 0 ? Math.round((t.weekVolumeKg / t.lastWeekVolumeKg - 1) * 100) : null,
    sleepAvg: avg(sleep), kcalAvg: avg(food) == null ? null : Math.round(avg(food)!), onTarget, logged: loggedFood.length,
    wDeltaKg: finite(wa) && finite(wb) && w.indexOf(wa) !== lastIndex(w) ? wb - wa : null,
    shortNights: sleep.map((h, i) => finite(h) && h < 7 ? weekday(days[i]) : null).filter((x): x is string => !!x),
    lowSteps: steps.filter(s => finite(s) && s < d.stepGoal).length, stepsAvg: avg(d.days.steps.slice(-7)),
    prs: t.records.filter(r => r.day >= days[0]), minutes: sum(d.days.training.slice(-7)), from: days[0], to: days[6],
  };
}

/** An empty data set: what a brand new person sees before anything is logged. */
export function emptyProgress(today: string, unit: Unit, now = Date.now()): ProgressData {
  const blank = (): Daily => Array(HISTORY).fill(null);
  return {
    today, now, demo: false, unit,
    days: { weight: blank(), sleep: blank(), hrv: blank(), rhr: blank(), steps: blank(), kcal: blank(), training: blank(), score: blank() },
    pillars: { training: null, food: null, sleep: null }, yesterdayScore: null, weekPillars: Array.from({ length: 7 }, () => ({ training: null, food: null, sleep: null })),
    baseline: { score: null, training: null, food: null, sleep: null }, dayNotes: Array(7).fill(''),
    night: null, wake: Array(7).fill(null), hrvBand: null, rhrBand: null, sleepGoalMin: 480, stepGoal: 8000,
    sources: { oura: false, apple: false, ouraSynced: null, heart: null },
    weight: { kg: null, day: null, time: null, startKg: null, startDay: null, goalKg: null },
    bodyFat: [], measures: [], photos: [],
    training: { goalMin: null, weekVolumeKg: 0, lastWeekVolumeKg: 0, sessions: 0, active: null, plan: { name: null, perWeek: 3, done: 0 }, next: null, records: [], streak: 0 },
    food: { goalKcal: null, eatenKcal: null, proteinG: null, proteinGoal: null },
  };
}
