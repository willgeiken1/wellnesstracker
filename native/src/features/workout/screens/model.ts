import type { Unit, WorkingSet } from '@/core/workout/rules';
import type { Row } from '@/data/rows';
import { exLabel } from '../logger/model';
import { epley, muscleGroup, type MuscleGroup, type TrainingData } from '../training-data';

export interface ResultSet { w: number; r: number; pr: boolean }
export interface ResultExercise { name: string; sets: ResultSet[]; warm: number; top: { w: number; r: number }; volume: number }
export interface ResultPr { name: string; w: number; r: number; was: { w: number; r: number } }
/** One finished workout as the summary and the past workout screens show it. Weights are in the display unit. */
export interface SessionResult {
  id: string; name: string; day: string; routineId: string | null; startedAt: number; finishedAt: number;
  min: number; sets: number; volume: number; unit: Unit; notes: string;
  exercises: ResultExercise[]; prs: ResultPr[]; muscles: { m: MuscleGroup; sets: number }[]; also: MuscleGroup[];
  /** Training minutes on that day, before this workout and with it. */ before: number; after: number; goal: number;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "Sunday, November 22". */
export const fullDate = (day: string) => { const d = new Date(`${day}T12:00:00`); return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`; };

const doneWorking = (sets: WorkingSet[]) => sets.filter(s => !s.warmup && s.reps > 0);
const best = <T extends { w: number; r: number }>(list: T[]) => list.reduce<T | null>((p, x) => !p || epley(x.w, x.r) > epley(p.w, p.r) ? x : p, null);

/** The best working set of an exercise in the sessions before this one, in the display unit. */
function priorBestSet(data: TrainingData, name: string, session: Row) {
  const started = Number(session.data.started_at), key = name.toLowerCase();
  let out: { w: number; r: number } | null = null;
  for (const s of data.history()) {
    if (s.id === session.id || Number(s.data.started_at) >= started) continue;
    for (const e of data.workout.entries(s.id)) if (String(e.data.exercise).toLowerCase() === key) {
      const b = best(doneWorking(data.workout.working(e)).map(x => ({ w: data.kg(x.weight), r: x.reps })));
      if (b && (!out || epley(b.w, b.r) > epley(out.w, out.r))) out = b;
    }
  }
  return out;
}

/** Everything about a finished workout: its numbers, records beaten, muscles worked and each exercise. Null if it is gone or still going. */
export function sessionResult(data: TrainingData, id: string): SessionResult | null {
  const s = data.repo.get('sessions', id);
  if (!s || s.deleted_at !== null || s.data.finished_at == null) return null;
  const w = data.workout, prefs = w.preferences();
  const exercises: ResultExercise[] = [], prs: ResultPr[] = [], mus = new Map<MuscleGroup, number>(), also = new Set<MuscleGroup>();
  for (const e of w.entries(id)) {
    const name = String(e.data.exercise), all = w.working(e);
    const sets: ResultSet[] = doneWorking(all).map(x => ({ w: data.kg(x.weight), r: x.reps, pr: false }));
    if (!sets.length) continue;
    const top = best(sets)!, was = priorBestSet(data, name, s);
    if (was && epley(was.w, was.r) > 0 && epley(top.w, top.r) > epley(was.w, was.r) + 0.5) { top.pr = true; prs.push({ name: exLabel(name), w: top.w, r: top.r, was }); }
    exercises.push({ name, sets, warm: all.filter(x => x.warmup).length, top: { w: top.w, r: top.r }, volume: sets.reduce((n, x) => n + x.w * x.r, 0) });
    const ex = prefs.exercise(name), main = muscleGroup(ex.main);
    if (main) mus.set(main, (mus.get(main) ?? 0) + sets.length);
    for (const h of ex.helpers) { const g = muscleGroup(h); if (g) also.add(g); }
  }
  const muscles = [...mus].map(([m, n]) => ({ m, sets: n })).sort((a, b) => b.sets - a.sets);
  const day = String(s.data.day), min = data.minutes(s), after = data.minutesByDay().get(day) ?? min;
  return {
    id, name: String(s.data.name ?? '') || data.fallbackName, day, routineId: s.data.routine_id ? String(s.data.routine_id) : null,
    startedAt: Number(s.data.started_at), finishedAt: Number(s.data.finished_at), min,
    sets: exercises.reduce((n, e) => n + e.sets.length, 0), volume: exercises.reduce((n, e) => n + e.volume, 0), unit: data.unit,
    notes: String(s.data.notes ?? ''), exercises, prs, muscles, also: [...also].filter(m => !mus.has(m)),
    before: Math.max(0, after - min), after, goal: data.goalMin(),
  };
}

/** "Also worked: Glutes, hamstrings" (sentence case, as the mockup writes it). */
export function alsoText(also: MuscleGroup[]) {
  const s = also.join(', ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
