import { displayWeight, fromKg, localDay, weekOf, type Unit } from '../../core/workout/rules';
import type { Repository } from '../../data/repository';
import type { Row } from '../../data/rows';
import { WorkoutOptions } from '../../data/workout/options';
import { WorkoutStore, type Draft } from '../../data/workout/store';
import { PlanStore } from '../plans/store';

/** The ten muscle groups the Training tab counts, and the library muscles each one gathers. */
export const MUSCLE_GROUPS = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core'] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
const GROUP_OF: Record<string, MuscleGroup> = {
  chest: 'Chest', lats: 'Back', upperBack: 'Back', traps: 'Back', lowerBack: 'Back',
  frontDelts: 'Shoulders', sideDelts: 'Shoulders', rearDelts: 'Shoulders', biceps: 'Biceps', forearms: 'Biceps',
  triceps: 'Triceps', quads: 'Quads', adductors: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes', abductors: 'Glutes',
  calves: 'Calves', abs: 'Core', obliques: 'Core',
};
export const muscleGroup = (muscle: string | undefined): MuscleGroup | null => (muscle && GROUP_OF[muscle]) || null;
const EQUIPMENT: Record<string, string> = { barbell: 'Barbell', dumbbell: 'Dumbbell', machine: 'Machine', cable: 'Cable', bodyweight: 'Bodyweight', other: 'Other' };
export const equipmentName = (e: string | undefined) => EQUIPMENT[e ?? 'other'] ?? 'Other';

/** Epley: the estimated one rep max from a set. */
export const epley = (weight: number, reps: number) => reps > 0 ? weight * (1 + reps / 30) : 0;
const DAY_MS = 86_400_000;
const addDays = (day: string, n: number) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() + n); return localDay(d); };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const monthDay = (day: string) => { const d = new Date(`${day}T12:00:00`); return `${MON[d.getMonth()]} ${d.getDate()}`; };
export const dayLabel = (day: string) => { const d = new Date(`${day}T12:00:00`); return `${DOW[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}`; };
export const clockTime = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
/** 25:13 or 1:02:09 */
export function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`;
}
/** A number with thousands separators. */
export const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export interface LiveExercise { entryId: string; name: string; done: number; total: number }
export interface LiveView {
  id: string; name: string; startedAt: number; done: number; total: number;
  /** One cell per working set, in order: 1 done, 0 to do, 'now' the next one. */
  matrix: (0 | 1 | 'now')[];
  groups: number[];
  exercises: LiveExercise[];
  next: { name: string; set: number; weight: number; reps: number; same: boolean } | null;
  volume: number;
}
export interface PlanDayView {
  routineId: string; index: number; name: string;
  exercises: { name: string; sets: number; repMin: number; repMax: number; weight: number }[];
  sets: number; last: string | null; kind: 'live' | 'next' | '';
}
export interface WeekDay { date: string; min: number; volume: number; name: string; today: boolean; future: boolean }
export interface RecentWorkout { id: string; name: string; day: string; min: number; sets: number; volume: number; pr: string | null }
export interface RecordView { exercise: string; weight: number; reps: number; e1rm: number; day: string }
export interface CardioItem { id: string; name: string; day: string; min: number; mi: number; source: 'logged' | 'health' }

const workingDrafts = (drafts: Draft[]) => drafts.filter(d => !d.warmup && d.tag !== 'warmup');
const sessionName = (s: Row, fallback: string) => String(s.data.name ?? '') || fallback;

/**
 * Everything the Training tab and its tiles read, worked out once from the workout, plan and cardio data.
 * Weights come back in the person's unit (lb or kg); minutes count strength sessions and logged cardio.
 */
export class TrainingData {
  readonly workout: WorkoutStore;
  readonly plans: PlanStore;
  readonly unit: Unit;
  readonly today: string;
  readonly monday: string;
  private cache = new Map<string, unknown>();
  constructor(readonly repo: Repository, readonly now = Date.now(), readonly fallbackName = 'Workout') {
    this.workout = new WorkoutStore(repo);
    this.plans = new PlanStore(repo);
    this.unit = this.workout.unit();
    this.today = localDay(new Date(now));
    this.monday = weekOf(new Date(now));
  }
  private memo<T>(key: string, make: () => T): T {
    if (!this.cache.has(key)) this.cache.set(key, make());
    return this.cache.get(key) as T;
  }
  kg(kg: number) { return displayWeight(kg, this.unit); }

  goalMin() { const g = this.repo.localGet<number>('training.goalMin'); return typeof g === 'number' && g > 0 ? g : 60; }
  setGoalMin(min: number) { this.repo.localSave('training.goalMin', Math.max(5, Math.min(600, Math.round(min)))); }
  planName() { return this.repo.localGet<string>('plans:name') || ''; }

  live(): LiveView | null {
    return this.memo('live', () => {
      const s = this.workout.active();
      if (!s) return null;
      const entries = this.workout.entries(s.id).filter(e => !this.workout.skipped(e.id));
      const exercises: LiveExercise[] = [], matrix: LiveView['matrix'] = [], groups: number[] = [];
      let volume = 0;
      for (const e of entries) {
        const w = workingDrafts(this.workout.drafts(e.id));
        if (!w.length) continue;
        const done = w.filter(d => d.setId).length;
        exercises.push({ entryId: e.id, name: String(e.data.exercise), done, total: w.length });
        groups.push(w.length);
        for (const d of w) {
          matrix.push(d.setId ? 1 : 0);
          if (d.setId) volume += (Number(d.weight) || 0) * (Number(d.reps) || 0);
        }
      }
      const at = matrix.indexOf(0);
      if (at >= 0) matrix[at] = 'now';
      const slot = this.workout.nextSet(s.id);
      let next: LiveView['next'] = null;
      if (slot) {
        const entry = entries.find(e => e.id === slot.entryId);
        const d = this.workout.drafts(slot.entryId)[slot.index];
        if (entry && d) {
          const prev = this.workout.previous(entry)[slot.index];
          const pw = prev ? this.kg(Number(prev.data.weight_kg)) : 0, pr = prev ? Number(prev.data.reps) : 0;
          const weight = d.weight !== '' ? Number(d.weight) : pw, reps = d.reps !== '' ? Number(d.reps) : pr;
          const setNo = workingDrafts(this.workout.drafts(slot.entryId).slice(0, slot.index + 1)).length || slot.index + 1;
          next = { name: String(entry.data.exercise), set: setNo, weight, reps, same: !!prev && weight === pw && reps === pr };
        }
      }
      const done = matrix.filter(x => x === 1).length;
      return { id: s.id, name: sessionName(s, this.fallbackName), startedAt: Number(s.data.started_at), done, total: matrix.length, matrix, groups, exercises, next, volume };
    });
  }
  elapsed(now = this.now) { const l = this.live(); return l ? Math.max(0, now - l.startedAt) : 0; }

  /** Finished strength sessions, newest first. */
  history() { return this.memo('history', () => this.workout.history().filter(s => !this.workout.pastMode(s.id) || this.repo.localGet(`pastWorkout:${s.id}`) !== true)); }
  minutes(s: Row) { return Math.round(Number(s.data.duration_ms ?? 0) / 60000); }
  sessionSets(s: Row) { return this.workout.entries(s.id).flatMap(e => this.workout.working(e).filter(w => !w.warmup && w.reps > 0)); }
  sessionVolume(s: Row) { return this.sessionSets(s).reduce((n, w) => n + fromKg(w.weight, this.unit) * w.reps, 0); }
  cardioRows() { return this.memo('cardio', () => this.repo.list('cardio_sessions').sort((a, b) => String(b.data.day).localeCompare(String(a.data.day)) || b.updated_at - a.updated_at)); }

  /** Training minutes by day: finished sessions, logged cardio and, today, the workout going now. */
  minutesByDay(): Map<string, number> {
    return this.memo('minByDay', () => {
      const out = new Map<string, number>();
      const add = (day: string, min: number) => out.set(day, (out.get(day) ?? 0) + min);
      for (const s of this.history()) add(String(s.data.day), this.minutes(s));
      for (const c of this.cardioRows()) add(String(c.data.day), Math.round(Number(c.data.duration_ms ?? 0) / 60000));
      if (this.live()) add(this.today, Math.floor(this.elapsed() / 60000));
      return out;
    });
  }
  todayMin() { return this.minutesByDay().get(this.today) ?? 0; }

  week(): { days: WeekDay[]; min: number; volume: number; lastVolume: number; done: number } {
    return this.memo('week', () => {
      const mins = this.minutesByDay(), byDay = new Map<string, Row[]>();
      for (const s of this.history()) { const d = String(s.data.day); byDay.set(d, [...(byDay.get(d) ?? []), s]); }
      const live = this.live();
      const days: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
        const date = addDays(this.monday, i), list = byDay.get(date) ?? [];
        const today = date === this.today;
        let volume = list.reduce((n, s) => n + this.sessionVolume(s), 0);
        if (today && live) volume += live.volume;
        const name = today && live ? live.name : list[0] ? sessionName(list[0], this.fallbackName) : '';
        return { date, min: mins.get(date) ?? 0, volume, name, today, future: date > this.today };
      });
      const lastMon = addDays(this.monday, -7);
      const lastVolume = this.history().filter(s => String(s.data.day) >= lastMon && String(s.data.day) < this.monday).reduce((n, s) => n + this.sessionVolume(s), 0);
      const done = this.history().filter(s => String(s.data.day) >= this.monday && String(s.data.day) <= this.today).length;
      return { days, min: days.reduce((n, d) => n + d.min, 0), volume: days.reduce((n, d) => n + d.volume, 0), lastVolume, done };
    });
  }

  plan(): { mode: 'rotation' | 'fixed'; perWeek: number; days: PlanDayView[]; next: PlanDayView | null } {
    return this.memo('plan', () => {
      const p = this.plans.read(), live = this.live(), liveRow = live ? this.workout.active() : undefined;
      const templates = this.workout.templates();
      const ids = p.days.length ? p.days.map(d => d.routineId) : templates.map(r => r.id);
      const nextIndex = p.days.length ? this.plans.nextIndex() : 0;
      const days: PlanDayView[] = ids.map((routineId, index) => {
        const r = this.repo.get('routines', routineId);
        const ex = this.workout.templateExercises(routineId).map(e => {
          const o = new WorkoutOptions(this.repo).read(e), target = Number(e.data.target_reps) || 8;
          const repMin = Number(o.rep_min ?? target) || target, repMax = Number(o.rep_max ?? target) || repMin;
          return { name: String(e.data.exercise), sets: Number(e.data.target_sets) || 3, repMin, repMax, weight: this.lastWeight(String(e.data.exercise)) };
        });
        const last = this.history().find(s => s.data.routine_id === routineId);
        const kind = liveRow?.data.routine_id === routineId ? 'live' : index === nextIndex ? 'next' : '';
        return { routineId, index, name: String(r?.data.name ?? ''), exercises: ex, sets: ex.reduce((n, e) => n + e.sets, 0), last: last ? String(last.data.day) : null, kind };
      });
      let next = days.find(d => d.kind === 'next') ?? null;
      if (next && live && next.kind === 'next' && days.length > 1 && liveRow?.data.routine_id === next.routineId) next = days[(next.index + 1) % days.length];
      return { mode: p.mode, perWeek: p.days.length ? p.daysPerWeek : Math.max(1, Math.min(7, p.daysPerWeek)), days, next };
    });
  }
  /** About how long a plan day takes: its own past sessions, or three minutes a set. */
  estimate(day: PlanDayView) {
    const past = this.history().filter(s => s.data.routine_id === day.routineId).slice(0, 3).map(s => this.minutes(s)).filter(m => m > 0);
    const min = past.length ? past.reduce((a, b) => a + b, 0) / past.length : day.sets * 3;
    return Math.max(5, Math.round(min / 5) * 5);
  }
  lastWeight(name: string) {
    for (const s of this.history()) for (const e of this.workout.entries(s.id)) if (String(e.data.exercise).toLowerCase() === name.toLowerCase()) {
      const w = this.workout.working(e).filter(x => !x.warmup && x.reps > 0);
      if (w.length) return this.kg(Math.max(...w.map(x => x.weight)));
    }
    return 0;
  }

  recent(n = 4): RecentWorkout[] {
    const prs = this.workout.milestones();
    return this.history().slice(0, n).map(s => {
      const pr = prs.find(m => m.sessionId === s.id);
      const sets = this.sessionSets(s);
      return { id: s.id, name: sessionName(s, this.fallbackName), day: String(s.data.day), min: this.minutes(s), sets: sets.length, volume: this.sessionVolume(s),
        pr: pr ? pr.exercise : null };
    });
  }
  /** The best set of each exercise that set a record, newest first. */
  records(): RecordView[] {
    return this.memo('records', () => {
      const seen = new Set<string>(), out: RecordView[] = [];
      const hist = this.history(), ms = this.workout.milestones();
      for (const s of hist) for (const m of ms.filter(x => x.sessionId === s.id)) {
        const key = m.exercise.toLowerCase();
        if (seen.has(key)) continue;
        const best = this.workout.entries(s.id).filter(e => String(e.data.exercise).toLowerCase() === key).flatMap(e => this.workout.working(e))
          .filter(w => !w.warmup && w.reps > 0).sort((a, b) => epley(b.weight, b.reps) - epley(a.weight, a.reps))[0];
        if (!best) continue;
        seen.add(key);
        out.push({ exercise: m.exercise, weight: this.kg(best.weight), reps: best.reps, e1rm: this.kg(epley(best.weight, best.reps)), day: String(s.data.day) });
      }
      return out;
    });
  }
  /** One lift's top set and estimated 1RM per session, oldest first. */
  liftHistory(lift: string): { day: string; weight: number; reps: number; est: number; volume: number }[] {
    return this.memo(`lift:${lift}`, () => {
      const names = liftNames(lift), out: { day: string; weight: number; reps: number; est: number; volume: number }[] = [];
      for (const s of this.history().slice().reverse()) {
        const sets = this.workout.entries(s.id).filter(e => names.includes(String(e.data.exercise).toLowerCase())).flatMap(e => this.workout.working(e)).filter(w => !w.warmup && w.reps > 0);
        if (!sets.length) continue;
        const best = sets.slice().sort((a, b) => epley(b.weight, b.reps) - epley(a.weight, a.reps))[0];
        out.push({ day: String(s.data.day), weight: this.kg(best.weight), reps: best.reps, est: this.kg(epley(best.weight, best.reps)),
          volume: sets.reduce((n, w) => n + fromKg(w.weight, this.unit) * w.reps, 0) });
      }
      return out;
    });
  }

  /** Working sets (or volume) per muscle group this week, from finished sessions and the one going now. */
  muscles(measure: 'sets' | 'lb', both: boolean): { m: MuscleGroup; v: number }[] {
    const out = new Map<MuscleGroup, number>(MUSCLE_GROUPS.map(m => [m, 0]));
    const prefs = this.workout.preferences();
    const sessions = this.history().filter(s => String(s.data.day) >= this.monday);
    const live = this.workout.active();
    for (const s of live ? [...sessions, live] : sessions) for (const e of this.workout.entries(s.id)) {
      const ex = prefs.exercise(String(e.data.exercise));
      const sets = this.workout.working(e).filter(w => !w.warmup && w.reps > 0);
      if (!sets.length) continue;
      const v = measure === 'lb' ? sets.reduce((n, w) => n + fromKg(w.weight, this.unit) * w.reps, 0) : sets.length;
      const main = muscleGroup(ex.main);
      if (main) out.set(main, out.get(main)! + v);
      if (both) for (const h of new Set(ex.helpers.map(muscleGroup).filter((g): g is MuscleGroup => !!g && g !== main))) out.set(h, out.get(h)! + v / 2);
    }
    return MUSCLE_GROUPS.map(m => ({ m, v: measure === 'lb' ? Math.round(out.get(m)! / 10) * 10 : Math.round(out.get(m)! * 10) / 10 }));
  }
  /** Strength sessions per week for the last eight weeks, oldest first: [week label, sessions]. */
  weekHits(): [string, number][] {
    return this.memo('hits', () => Array.from({ length: 8 }, (_, i) => {
      const mon = addDays(this.monday, (i - 7) * 7), sun = addDays(mon, 6);
      return [monthDay(mon), this.history().filter(s => String(s.data.day) >= mon && String(s.data.day) <= sun).length] as [string, number];
    }));
  }
  /** Training minutes for the four calendar weeks ending this week, Monday first; days after today are null. */
  days28(): (number | null)[] {
    const mins = this.minutesByDay(), start = addDays(this.monday, -21);
    return Array.from({ length: 28 }, (_, i) => { const d = addDays(start, i); return d > this.today ? null : mins.get(d) ?? 0; });
  }
  cardioWeek(): CardioItem[] {
    return this.cardioRows().filter(c => String(c.data.day) >= this.monday).map(c => ({
      id: c.id, name: cardioName(String(c.data.kind)), day: String(c.data.day), min: Math.round(Number(c.data.duration_ms ?? 0) / 60000),
      mi: c.data.distance_m ? Number(c.data.distance_m) / 1609.344 : 0, source: 'logged' as const,
    }));
  }
}
const CARDIO_NAMES: Record<string, string> = { run: 'Run', walk: 'Walk', cycle: 'Cycle', row: 'Row', elliptical: 'Elliptical', stairs: 'Stairs', treadmill: 'Treadmill', stair: 'Stair climber', bike: 'Bike', rower: 'Rower', hike: 'Hike', swim: 'Swim' };
export const cardioName = (kind: string) => CARDIO_NAMES[kind] ?? 'Cardio';

/** The names a lift goes by in the exercise library and in older logs. */
export function liftNames(lift: string): string[] {
  const l = lift.toLowerCase();
  const alias: Record<string, string[]> = {
    'back squat': ['back squat', 'squat', 'barbell back squat', 'barbell squat'],
    'bench press': ['bench press', 'barbell bench press'],
    'deadlift': ['deadlift', 'conventional deadlift', 'barbell deadlift'],
    'barbell row': ['barbell row', 'bent over row', 'bent over barbell row', 'barbell bent over row'],
    'overhead press': ['overhead press', 'barbell overhead press', 'military press', 'standing overhead press'],
  };
  return alias[l] ?? [l];
}
export const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
export { DAY_MS, addDays };
