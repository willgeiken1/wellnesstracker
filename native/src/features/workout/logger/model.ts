import { exerciseFor, exerciseLibrary } from '@/core/workout/library';
import { displayWeight, fromKg, plates, toKg, validateSet, type Unit } from '@/core/workout/rules';
import type { Row } from '@/data/rows';
import type { Draft, WorkoutStore } from '@/data/workout/store';
import { loadSettingsPrefs } from '@/features/settings/prefs-model';
import { clock, epley, muscleGroup } from '../training-data';
import { tr, trCount } from '../tr';

/** The effort scale the logger offers, as on the mockup. */
export const RPE = [6, 7, 8, 9, 10] as const;
/** RPE stays on this phone for now: the synced sets table has no column for it. */
export const rpeKey = (entryId: string, index: number) => `rpe:${entryId}:${index}`;
/** An exercise's note field is shown once the person asks for it, even while it is still empty. */
export const noteOpenKey = (entryId: string) => `noteOpen:${entryId}`;

const LIBRARY = new Set(exerciseLibrary.map(e => e.name.toLowerCase()));
/** Library names read in sentence case ("Romanian deadlift"); a person's own names stay as typed. Short capitals (EZ, DB) stay. */
export function exLabel(name: string) {
  if (!LIBRARY.has(name.trim().toLowerCase())) return name;
  return name.split(' ').map((w, i) => i === 0 || /^[A-Z0-9]{2,}$/.test(w) ? w : w.toLowerCase()).join(' ');
}
/** "Quads, glutes": the exercise's main muscle group and the first helper group, in a sentence. */
export function exMuscles(name: string) {
  const ex = exerciseFor(name);
  const groups = [...new Set([ex.main, ...ex.helpers].map(m => muscleGroup(m)).filter((g): g is NonNullable<typeof g> => !!g))].slice(0, 2);
  return groups.map((g, i) => i ? g.toLowerCase() : g).join(', ');
}
/** The bar chosen in Settings › Workout › Plates for this unit, used when the exercise has no bar of its own. */
export function settingsBar(repo: Parameters<typeof loadSettingsPrefs>[0], unit: Unit): number | undefined {
  const w = loadSettingsPrefs(repo).work, v = Number(unit === 'kg' ? w.barKg : w.bar);
  return Number.isFinite(v) && v > 0 ? v : undefined;
}
/** The bar for an exercise: its own bar from its machine setup, or the one chosen in Settings. */
export function barFor(store: Pick<WorkoutStore, 'preferences' | 'repo'>, name: string, unit: Unit): number | undefined {
  return store.preferences().machine(name).bar_weight ?? settingsBar(store.repo, unit);
}
/** "45 + 10 each side, 45 lb bar" for the weight on a barbell. */
export function plateText(weight: number, unit: Unit, bar?: number, available?: number[]) {
  const result = plates(weight, unit, bar, available);
  const num = (n: number) => String(Math.round(n * 100) / 100);
  const barText = `${num(result.bar)} ${unit} bar`;
  if (!result.plates.length) return tr('trainingJustTheBar', { bar: barText });
  const groups: string[] = [];
  for (let i = 0; i < result.plates.length;) {
    let j = i;
    while (j < result.plates.length && result.plates[j] === result.plates[i]) j++;
    groups.push(`${j - i > 1 ? `${j - i} × ` : ''}${num(result.plates[i])}`);
    i = j;
  }
  return `${groups.join(' + ')} ${tr('trainingEachSide')}, ${barText}`;
}

/** The fields of a set the logger edits: weight and reps, and for a one-side-at-a-time exercise the right side's too. */
export type SetField = 'weight' | 'reps' | 'rightWeight' | 'rightReps';
export const SET_FIELDS: readonly SetField[] = ['weight', 'reps', 'rightWeight', 'rightReps'];
export interface SetView {
  index: number; draft: Draft; done: boolean; warm: boolean; failure: boolean;
  /** The working set's number (1, 2, 3); warm-ups have none. */ num: number;
  weightHint: string; repsHint: string; rpe: number | null; lastRpe: number | null; pr: boolean;
}
export interface ExerciseView {
  entry: Row; name: string; label: string; unit: Unit; sets: SetView[];
  /** Logged one side at a time: each set has its own right-side weight and reps. */ unilateral: boolean;
  /** Working sets, and how many of them are checked off. */ total: number; done: number;
  all: boolean; best: { w: number; r: number; rpe: number | null } | null; prev: { w: number; r: number } | null;
  rest: number; note: string | null; barbell: boolean;
}
export interface LoggerView {
  exercises: ExerciseView[]; current: { entryId: string; index: number } | null;
  done: number; total: number; volume: number; unit: Unit;
}

const warmOf = (d: Draft) => d.tag === 'warmup' || !!d.warmup;

/** The best estimated one rep max for this exercise before this session, in the display unit. */
function priorBest(store: WorkoutStore, name: string, session: Row, unit: Unit) {
  const started = Number(session.data.started_at);
  let best = 0;
  for (const s of store.history()) {
    if (s.id === session.id || Number(s.data.started_at) >= started) continue;
    for (const e of store.entries(s.id)) if (e.data.exercise === name) for (const set of store.sets(e.id)) {
      best = Math.max(best, epley(displayWeight(Number(set.data.weight_kg), unit), Number(set.data.reps)));
    }
  }
  return best;
}

/** Everything the logger draws for one session, read from the workout store. */
export function loggerView(store: WorkoutStore, session: Row): LoggerView {
  const entries = store.entries(session.id).filter(e => !store.skipped(e.id));
  const next = store.pastMode(session.id) ? null : store.nextSet(session.id) ?? null;
  let done = 0, total = 0, volume = 0;
  const totalUnit = store.unit();
  const exercises = entries.map((entry): ExerciseView => {
    const name = String(entry.data.exercise), unit = store.unit(entry.id), drafts = store.drafts(entry.id);
    const previous = store.previous(entry), suggestion = store.suggestion(entry), range = store.repRange(entry);
    const prevAt = (i: number) => previous.find(s => Number(s.data.position) === i);
    let n = 0;
    const sets = drafts.map((draft, index): SetView => {
      const warm = warmOf(draft), p = prevAt(index);
      const preceding = drafts.slice(0, index).reverse().find(d => d.weight !== '');
      const weightHint = suggestion.jump && suggestion.weight !== null ? String(suggestion.weight)
        : p ? String(displayWeight(Number(p.data.weight_kg), unit))
          : preceding?.weight ?? (suggestion.weight === null ? '' : String(suggestion.weight));
      const target = range ? suggestion.target : store.repo.localGet<number>(`target:${entry.id}`) ?? (p ? Number(p.data.reps) : null);
      const repsHint = target == null ? '' : String(target);
      const lastRpe = p ? store.repo.localGet<number>(rpeKey(String(p.data.entry_id), Number(p.data.position))) ?? null : null;
      return { index, draft, done: !!draft.setId, warm, failure: draft.tag === 'failure', num: warm ? 0 : ++n,
        weightHint, repsHint, rpe: store.repo.localGet<number>(rpeKey(entry.id, index)) ?? null, lastRpe, pr: false };
    });
    const work = sets.filter(s => !s.warm), checked = work.filter(s => s.done), one = store.isUnilateral(entry.id);
    // A one-side set is judged by its weaker side, as it is saved and as earlier sessions' records were, so an unchanged set is never a record.
    const result = (s: SetView) => {
      const l = { w: +s.draft.weight, r: +s.draft.reps };
      if (!one) return l;
      const rt = { w: +(s.draft.rightWeight || s.draft.weight), r: +(s.draft.rightReps || s.draft.reps) };
      return epley(rt.w, rt.r) < epley(l.w, l.r) ? rt : l;
    };
    let best: SetView | null = null;
    for (const s of checked) if (!best || epley(result(s).w, result(s).r) > epley(result(best).w, result(best).r)) best = s;
    const before = checked.length ? priorBest(store, name, session, unit) : 0;
    if (best && before > 0 && epley(result(best).w, result(best).r) > before + 0.5) best.pr = true;
    let prev: ExerciseView['prev'] = null;
    for (const p of previous) {
      const w = displayWeight(Number(p.data.weight_kg), unit), r = Number(p.data.reps);
      if (!prev || epley(w, r) > epley(prev.w, prev.r)) prev = { w, r };
    }
    done += checked.length; total += work.length;
    // Drafts are in this exercise's unit; the total is in the workout's, so convert before adding.
    const toTotal = (w: number) => unit === totalUnit ? w : fromKg(toKg(w, unit), totalUnit);
    // A one-side set counts both sides, as Progress and the workout summary do.
    volume += checked.reduce((v, s) => v + toTotal(+s.draft.weight || 0) * (+s.draft.reps || 0)
      + (one ? toTotal(+(s.draft.rightWeight || s.draft.weight) || 0) * (+(s.draft.rightReps || s.draft.reps) || 0) : 0), 0);
    const opened = store.repo.localGet<boolean>(noteOpenKey(entry.id)) === true;
    return { entry, name, label: exLabel(name), unit, sets, unilateral: one, total: work.length, done: checked.length,
      all: sets.length > 0 && sets.every(s => s.done),
      best: best ? { ...result(best), rpe: best.rpe } : null, prev,
      rest: store.rest(name).seconds, note: entry.data.notes != null ? String(entry.data.notes) : opened ? '' : null,
      barbell: store.preferences().exercise(name).equipment === 'barbell' };
  });
  return { exercises, current: next ? { entryId: next.entryId, index: next.index } : null, done, total, volume, unit: totalUnit };
}

/** The exercise's quiet line when closed ("Best 245 lb × 5 · RPE 8") and when open ("Quads, glutes · rest 1:30"). */
export function exerciseLines(e: ExerciseView) {
  const set = (w: number, r: number) => `${w} ${e.unit} × ${r}`;
  const s1 = e.best ? (e.best.rpe != null ? tr('trainingBestRpe', { set: set(e.best.w, e.best.r), rpe: e.best.rpe }) : tr('trainingBest', { set: set(e.best.w, e.best.r) }))
    : e.prev ? tr('trainingLastTime', { set: set(e.prev.w, e.prev.r) }) : trCount('trainingSetCount', e.total);
  const muscles = exMuscles(e.name), rest = tr('trainingRestShort', { time: clock(e.rest * 1000) });
  return { s1, s2: muscles ? `${muscles} · ${rest}` : rest.replace(/^./, c => c.toUpperCase()) };
}

export type CheckResult = 'done' | 'undone' | 'invalid';
/** Check a set off (filling blank fields from last time) or uncheck it. A checked set keeps last time's RPE unless one was picked. */
export function checkSet(store: WorkoutStore, e: ExerciseView, s: SetView): CheckResult {
  const entryId = e.entry.id;
  if (s.done) { store.toggleDone(entryId, s.index); return 'undone'; }
  const weight = s.draft.weight || s.weightHint, reps = s.draft.reps || s.repsHint;
  if (!validateSet(weight, reps, e.unit).valid) return 'invalid';
  const patch: Partial<Draft> = {};
  if (weight !== s.draft.weight) patch.weight = weight;
  if (reps !== s.draft.reps) patch.reps = reps;
  if (store.isUnilateral(entryId)) { patch.rightWeight = s.draft.rightWeight || weight; patch.rightReps = s.draft.rightReps || reps; }
  if (Object.keys(patch).length) store.editDraft(entryId, s.index, patch);
  if (s.rpe == null && s.lastRpe != null) store.repo.localSave(rpeKey(entryId, s.index), s.lastRpe);
  return store.toggleDone(entryId, s.index) ? 'done' : 'undone';
}

/** Remove a set and give back a way to put it back exactly (its saved row, its draft and its RPE). */
export function deleteSet(store: WorkoutStore, entryId: string, index: number) {
  const repo = store.repo, drafts = store.drafts(entryId);
  const rows = store.sets(entryId).map(r => ({ id: r.id, data: { ...r.data } }));
  const rpes = drafts.map((_, i) => repo.localGet<number>(rpeKey(entryId, i)) ?? null);
  store.removeSet(entryId, index);
  rpes.forEach((_, i) => repo.localSave(rpeKey(entryId, i), i < index ? rpes[i] : rpes[i + 1] ?? null));
  return () => repo.atomic(() => {
    for (const r of rows) repo.save('sets', r.data, r.id);
    repo.localSave(`draft:${entryId}`, drafts);
    rpes.forEach((v, i) => repo.localSave(rpeKey(entryId, i), v));
    store.recompute();
  });
}

/** Remove an exercise and give back a way to restore it with its sets and drafts. */
export function removeExercise(store: WorkoutStore, entryId: string) {
  const repo = store.repo, entry = repo.get('entries', entryId);
  if (!entry) return () => {};
  const rows = store.sets(entryId).map(r => ({ id: r.id, data: { ...r.data } })), drafts = store.drafts(entryId);
  store.removeExercise(entryId);
  return () => repo.atomic(() => {
    repo.save('entries', { ...entry.data }, entry.id);
    for (const r of rows) repo.save('sets', r.data, r.id);
    repo.localSave(`draft:${entryId}`, drafts);
    store.recompute();
  });
}

/** Throw the workout away: its sets, exercises and the session itself, and any rest that was running. */
export function discardSession(store: WorkoutStore, sessionId: string) {
  const repo = store.repo;
  repo.atomic(() => {
    for (const e of store.entries(sessionId)) {
      for (const s of store.sets(e.id)) repo.remove('sets', s.id);
      repo.remove('entries', e.id);
    }
    repo.remove('sessions', sessionId);
    if (store.timer()?.sessionId === sessionId) repo.localSave('timer', null);
    store.recompute();
  });
}

/** The weight steppers in focus mode move by 5 lb (2.5 under 100) or 2.5 kg (1.25 under 45). */
export function stepWeight(value: number, unit: Unit, dir: 1 | -1) {
  const step = unit === 'kg' ? (value >= 45 ? 2.5 : 1.25) : (value >= 100 ? 5 : 2.5);
  return Math.max(0, Math.round((value + dir * step) / step) * step);
}
