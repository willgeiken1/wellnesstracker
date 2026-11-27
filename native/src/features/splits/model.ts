import { MUSCLE_GROUPS, type MuscleGroup } from '../workout/training-data';

/*
 * The split model, with no storage and no clock of its own: what today is, what comes next, and the week, from a split's
 * definition, its saved state and the split workouts finished so far. Everything here is a pure function so the rules are
 * tested on their own (tests/splits-model.test.ts).
 *
 * The rules (Insight Mockup v21, splits.js, and Will's answers):
 * - Rotate in order: any day, finishing the split day that is up moves the next one up. Rest days never throw it off.
 * - Set weekdays: each day has its weekday. A planned weekday that passes with no split workout is missed.
 * - A skipped or missed day waits: it is the next session either way, then the week carries on.
 * - Swap: another day today; the day it replaces waits and comes next.
 * - Freestyle is a workout outside the split: it never moves the rotation.
 */

export type SplitMode = 'rotate' | 'weekdays';
export interface SplitDayDef { routineId: string; /** The muscles the day was given; none means its exercises' main muscles. */ focus?: MuscleGroup[] | null }
export interface SplitDef {
  v: 1;
  /** The preset it came from ('ppl', 'ul' ...) or 'custom'. */
  key: string;
  name: string;
  mode: SplitMode;
  /** The weekly target in Rotate in order. */
  perWeek: number;
  days: SplitDayDef[];
  /** Monday first, seven entries: the day index trained that weekday, or -1 for rest. */
  week: number[];
  /** The day the split was chosen: nothing before it counts as missed. */
  since: string;
}
export interface SplitState {
  /** Rotate in order: the day that is up. */
  ptr: number;
  /** A day that waits (skipped, missed or swapped out): it is the next session. */
  carry: number | null;
  /** The newest split workout (by the launch sequence) already folded in. */
  seq: number;
  /** The day the missed-day check has reached. */
  checked: string;
  /** The day `swap` and `skipped` are for; they lapse at midnight. */
  day: string | null;
  /** Another day picked for today (Swap, or Train today on a rest day). */
  swap: number | null;
  skipped: boolean;
}
/** A finished split workout: its launch sequence, its day and the split day it was. */
export interface FinishedSplit { seq: number; routineId: string; day: string }

export const WEEKDAYS = 7;
const noon = (day: string) => new Date(`${day}T12:00:00`);
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const plusDays = (day: string, n: number) => { const d = noon(day); d.setDate(d.getDate() + n); return ymd(d); };
/** Monday 0 ... Sunday 6. */
export const weekdayOf = (day: string) => (noon(day).getDay() + 6) % 7;
export const mondayOf = (day: string) => plusDays(day, -weekdayOf(day));

export function freshState(def: Pick<SplitDef, 'since'>, start = 0, seq = 0, carry: number | null = null): SplitState {
  return { ptr: start, carry, seq, checked: def.since, day: null, swap: null, skipped: false };
}
const clampIndex = (i: number | null | undefined, n: number) => i == null || !Number.isInteger(i) || i < 0 || i >= n ? null : i;

/** A saved state made safe for the split as it is now (days may have been added or removed since). */
export function cleanState(def: SplitDef, raw: Partial<SplitState> | undefined): SplitState {
  const n = def.days.length, base = freshState(def);
  if (!raw || typeof raw !== 'object') return base;
  return {
    ptr: n && Number.isInteger(raw.ptr) ? ((raw.ptr as number) % n + n) % n : 0,
    carry: clampIndex(raw.carry, n),
    seq: Number.isFinite(raw.seq) ? Number(raw.seq) : 0,
    checked: typeof raw.checked === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.checked) ? raw.checked : def.since,
    day: typeof raw.day === 'string' ? raw.day : null,
    swap: clampIndex(raw.swap, n),
    skipped: raw.skipped === true,
  };
}

/** Finishing split day i: the rotation moves on if it was the day up, a waiting day stops waiting, today's swap is used. */
export function finishDay(def: SplitDef, s: SplitState, i: number): SplitState {
  const n = def.days.length;
  if (i < 0 || !n) return s;
  const out = { ...s };
  if (def.mode === 'rotate' && i === out.ptr % n) out.ptr = (out.ptr + 1) % n;
  if (out.carry === i) out.carry = null;
  if (out.swap === i) out.swap = null;
  return out;
}

/** Folds in every split workout finished since the state was saved, day by day, and marks set weekdays that passed with
 * none as missed (the first missed day waits). Today's swap and skip lapse once the day is over. */
export function reconcile(def: SplitDef, state: SplitState, finished: readonly FinishedSplit[], today: string): SplitState {
  const n = def.days.length, idx = (rid: string) => def.days.findIndex(x => x.routineId === rid);
  let s: SplitState = { ...state };
  if (!n) return { ...s, checked: today, day: today, swap: null, skipped: false };
  const fresh = finished.filter(f => f.seq > s.seq).sort((a, b) => a.seq - b.seq);
  const trained = new Set(finished.map(f => f.day));
  // Only the last two weeks are walked: a split left alone for months starts again from where it was.
  let day = s.checked < plusDays(today, -14) ? plusDays(today, -14) : s.checked;
  if (day < def.since) day = def.since;
  for (const f of fresh) if (f.day < day) s = finishDay(def, s, idx(f.routineId));
  for (; day <= today; day = plusDays(day, 1)) {
    if (s.day !== null && s.day < day) s = { ...s, swap: null, skipped: false, day: null };
    for (const f of fresh) if (f.day === day) s = finishDay(def, s, idx(f.routineId));
    if (day < today && def.mode === 'weekdays' && !trained.has(day) && s.carry === null) {
      const planned = def.week[weekdayOf(day)] ?? -1;
      if (planned >= 0 && planned < n) s = { ...s, carry: planned };
    }
  }
  for (const f of fresh) if (f.day > today) s = finishDay(def, s, idx(f.routineId));
  const seq = fresh.reduce((m, f) => Math.max(m, f.seq), s.seq);
  return { ...s, seq, checked: today, day: s.day === today ? today : null, swap: s.day === today ? s.swap : null, skipped: s.day === today ? s.skipped : false };
}

/** Today's planned day: a swap wins, then a day that waits, then the rotation's day up or today's weekday (-1: rest). */
export function plannedIndex(def: SplitDef, s: SplitState, day: string): number {
  if (!def.days.length) return -1;
  if (s.day === day && s.swap !== null) return s.swap;
  if (s.carry !== null) return s.carry;
  return def.mode === 'rotate' ? s.ptr % def.days.length : def.week[weekdayOf(day)] ?? -1;
}

/** The sessions that come in order from `from` (a day), up to n of them, as day indexes. */
export function sequence(def: SplitDef, s: SplitState, from: string, n: number): number[] {
  const L = def.days.length, out: number[] = [];
  if (!L || n <= 0) return out;
  let sim: SplitState = { ...s, swap: null, skipped: false, day: null };
  if (def.mode === 'rotate') {
    while (out.length < n) { const i = sim.carry ?? sim.ptr % L; out.push(i); sim = finishDay(def, sim, i); }
    return out;
  }
  let day = from;
  if (sim.carry !== null) { out.push(sim.carry); sim = { ...sim, carry: null }; day = plusDays(day, 1); }
  if (!def.week.some(x => x >= 0 && x < L)) return out;
  for (let k = 0; out.length < n && k < 7 * (n + 1); k++, day = plusDays(day, 1)) {
    const i = def.week[weekdayOf(day)] ?? -1;
    if (i >= 0 && i < L) out.push(i);
  }
  return out;
}
/** The date each of the next sessions falls on in Set weekdays (null in Rotate in order, which never names a weekday). */
export function nextSessionDay(def: SplitDef, s: SplitState, from: string): string | null {
  if (def.mode === 'rotate' || !def.days.length) return null;
  if (s.carry !== null) return from;
  for (let k = 0; k < 7; k++) { const day = plusDays(from, k), i = def.week[weekdayOf(day)] ?? -1; if (i >= 0) return day; }
  return null;
}

export type TodayKind = 'live' | 'done' | 'skipped' | 'rest' | 'planned';
export interface SplitToday {
  kind: TodayKind;
  /** The day front and centre: today's (planned or going now), otherwise the next session. -1 for a freestyle workout. */
  focus: number;
  /** Today's day is one that waited (skipped or missed before). */
  carried: boolean;
  /** The sessions after the focus, in order. */
  then: number[];
  /** When the next session is, in Set weekdays: its date. */
  nextDay: string | null;
}
export interface TodayInput {
  today: string;
  /** The workout going now, and the split day it is (null: freestyle or a template outside the split). */
  live: { routineId: string | null } | null;
  /** A split workout already finished today. */
  doneToday: boolean;
}
/** What today is for the split, and what follows. */
export function splitToday(def: SplitDef, s: SplitState, input: TodayInput, thenCount = 3): SplitToday {
  const { today } = input, tomorrow = plusDays(today, 1), idx = (rid: string | null) => rid ? def.days.findIndex(x => x.routineId === rid) : -1;
  const after = (st: SplitState, from: string, count: number) => sequence(def, st, from, count);
  if (input.live) {
    const i = idx(input.live.routineId);
    const st = i >= 0 ? finishDay(def, s, i) : s;
    const from = i >= 0 ? tomorrow : today;
    return { kind: 'live', focus: i, carried: false, then: after(st, from, thenCount), nextDay: nextSessionDay(def, st, from) };
  }
  const swapped = s.day === today && s.swap !== null;
  if (input.doneToday && !swapped) {
    const seq = after(s, tomorrow, thenCount + 1);
    return { kind: 'done', focus: seq[0] ?? -1, carried: false, then: seq.slice(1), nextDay: nextSessionDay(def, s, tomorrow) };
  }
  if (s.day === today && s.skipped) {
    const seq = after(s, tomorrow, thenCount + 1);
    return { kind: 'skipped', focus: seq[0] ?? -1, carried: true, then: seq.slice(1), nextDay: nextSessionDay(def, s, tomorrow) };
  }
  const i = plannedIndex(def, s, today);
  if (i < 0) {
    const seq = after(s, tomorrow, thenCount + 1);
    return { kind: 'rest', focus: seq[0] ?? -1, carried: false, then: seq.slice(1), nextDay: nextSessionDay(def, s, tomorrow) };
  }
  const done = finishDay(def, s.carry === i || swapped ? s : s, i);
  // A swap leaves the day it replaced waiting, so it comes straight after.
  return { kind: 'planned', focus: i, carried: !swapped && s.carry === i, then: after(done, tomorrow, thenCount), nextDay: today };
}

/* ---------- changes the Change menu makes ---------- */
/** Swap: another day today. The day it replaces waits and comes next. */
export function swapToday(def: SplitDef, s: SplitState, today: string, to: number): SplitState {
  const cur = plannedIndex(def, s, today);
  return { ...s, day: today, swap: to, skipped: false, carry: cur >= 0 && cur !== to ? cur : s.carry === to ? null : s.carry };
}
/** Change the next session (while today's is going or done): `to` comes next, the day it replaces after it. */
export function swapNext(s: SplitState, to: number): SplitState { return { ...s, carry: to }; }
/** Skip today: the day waits and is the next session. */
export function skipToday(def: SplitDef, s: SplitState, today: string): SplitState {
  const cur = plannedIndex(def, s, today);
  return { ...s, day: today, skipped: true, swap: null, carry: cur >= 0 ? cur : s.carry };
}
/** Train today on a rest day, after a skip, or after today's split day is done: the next session becomes today's. */
export function trainToday(def: SplitDef, s: SplitState, today: string): SplitState {
  const next = sequence(def, s, plusDays(today, 1), 1)[0];
  return next == null ? s : { ...s, day: today, skipped: false, swap: next };
}

/* ---------- the week ---------- */
export type CellKind = 'done' | 'live' | 'plan' | 'skip' | 'rest';
export interface WeekCell { kind: CellKind; name: string; /** Monday 0 in Set weekdays; the session's place in the week in Rotate in order. */ n: number; now: boolean }
/** Rotate in order: this week's sessions against the target, in the order they come, with no weekdays. Done first, then the
 * one going now, then the days still to come, up to the target (or more when more were done). Seven at most. */
export function sessionCells(done: readonly string[], live: string | null, upcoming: readonly string[], perWeek: number, nextIsNow: boolean): WeekCell[] {
  const cells: WeekCell[] = done.map(name => ({ kind: 'done' as const, name, n: 0, now: false }));
  if (live !== null) cells.push({ kind: 'live', name: live, n: 0, now: true });
  const want = Math.max(perWeek, cells.length) - cells.length;
  upcoming.slice(0, want).forEach((name, i) => cells.push({ kind: 'plan', name, n: 0, now: i === 0 && nextIsNow && live === null }));
  return cells.slice(0, 7).map((c, i) => ({ ...c, n: i + 1 }));
}
/** Set weekdays: Monday to Sunday. Days gone by are done or rest (a planned one with nothing done shows skipped). */
export function weekdayCells(def: SplitDef, monday: string, today: string, trainedNames: ReadonlyMap<string, string>, dayName: (i: number) => string,
  todayCell: { kind: CellKind; name: string }): WeekCell[] {
  return Array.from({ length: 7 }, (_, i) => {
    const day = plusDays(monday, i), planned = def.week[i] ?? -1;
    if (day === today) return { ...todayCell, n: i, now: true };
    const done = trainedNames.get(day);
    if (done) return { kind: 'done' as const, name: done, n: i, now: false };
    if (day < today) return planned >= 0 && day >= def.since ? { kind: 'skip' as const, name: dayName(planned), n: i, now: false } : { kind: 'rest' as const, name: '', n: i, now: false };
    return planned >= 0 ? { kind: 'plan' as const, name: dayName(planned), n: i, now: false } : { kind: 'rest' as const, name: '', n: i, now: false };
  });
}
/** How many sessions a week the split asks for: the target in Rotate in order, the weekdays set in Set weekdays. */
export const perWeekOf = (def: Pick<SplitDef, 'mode' | 'perWeek' | 'week'>) => def.mode === 'rotate' ? def.perWeek : def.week.filter(x => x >= 0).length;

/* ---------- muscles ---------- */
export interface ExerciseMuscles { main: MuscleGroup | null; helpers: MuscleGroup[] }
export interface DayExercise { name: string; sets: number }
/** A day's muscles: the ones it was given, or the main muscles of its exercises, most sets first (four at most). */
export function dayFocus(focus: readonly MuscleGroup[] | null | undefined, exercises: readonly DayExercise[], muscles: (name: string) => ExerciseMuscles): MuscleGroup[] {
  if (focus?.length) return MUSCLE_GROUPS.filter(m => focus.includes(m));
  const count = new Map<MuscleGroup, number>();
  for (const e of exercises) { const m = muscles(e.name).main; if (m) count.set(m, (count.get(m) ?? 0) + e.sets); }
  return [...count.entries()].sort((a, b) => b[1] - a[1] || MUSCLE_GROUPS.indexOf(a[0]) - MUSCLE_GROUPS.indexOf(b[0])).slice(0, 4).map(([m]) => m);
}
/** How many times a week each day comes round: the target spread over the days in Rotate in order, its weekdays in Set weekdays. */
export function timesPerWeek(def: Pick<SplitDef, 'mode' | 'perWeek' | 'week'>, dayCount: number): number[] {
  return Array.from({ length: dayCount }, (_, i) => def.mode === 'rotate' ? (dayCount ? def.perWeek / dayCount : 0) : def.week.filter(x => x === i).length);
}
export interface Coverage { m: MuscleGroup; sets: number; times: number }
/** Working sets per muscle each week: the main muscle counts a full set, helpers half; `times` is how many days a week
 * give the muscle two or more sets. */
export function weeklySets(days: readonly (readonly DayExercise[])[], occurrences: readonly number[], muscles: (name: string) => ExerciseMuscles): Coverage[] {
  return MUSCLE_GROUPS.map(m => {
    let sets = 0, times = 0;
    days.forEach((ex, i) => {
      let here = 0;
      for (const e of ex) { const x = muscles(e.name); if (x.main === m) here += e.sets; else if (x.helpers.includes(m)) here += e.sets / 2; }
      sets += here * (occurrences[i] ?? 0);
      if (here >= 2) times += occurrences[i] ?? 0;
    });
    return { m, sets: Math.round(sets), times: Math.round(times * 10) / 10 };
  });
}
/** "2×", "1×", "some weeks" or a dash, for how often a muscle is trained. */
export function timesLabel(t: number, someWeeks: string) { return t >= 1.5 ? `${Math.round(t)}×` : t >= 0.75 ? '1×' : t > 0 ? someWeeks : '–'; }
/** Each muscle about twice a week, or once: the presets' summary line. */
export function frequency(cov: readonly Coverage[]): 1 | 2 {
  const hit = cov.filter(c => c.sets > 0), avg = hit.reduce((a, c) => a + c.times, 0) / (hit.length || 1);
  return avg >= 1.6 ? 2 : 1;
}
/** About how long a day takes from its sets, rounded to five minutes, fifteen at least. */
export const estimateMin = (sets: number) => Math.max(15, Math.round((sets * 2.7 + 4) / 5) * 5);
