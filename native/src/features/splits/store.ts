import { localDay } from '../../core/workout/rules';
import type { Repository } from '../../data/repository';
import type { Row } from '../../data/rows';
import { WorkoutStore, type TemplateExercise } from '../../data/workout/store';
import { PlanStore } from '../plans/store';
import { MUSCLE_GROUPS, muscleGroup, type MuscleGroup } from '../workout/training-data';
import {
  cleanState, dayFocus, estimateMin, finishDay, freshState, mondayOf, perWeekOf, plusDays, reconcile, sequence, sessionCells,
  skipToday, splitToday, swapNext, swapToday, timesPerWeek, trainToday, weekdayCells, weeklySets,
  type Coverage, type ExerciseMuscles, type FinishedSplit, type SplitDef, type SplitMode, type SplitState, type SplitToday, type WeekCell,
} from './model';
import { defaultWeek, splitPreset, suggestFor, type SplitPreset } from './presets';

/*
 * Where a split lives (local first, through the app's own repository):
 * - Each split day is a workout template: the synced `routines` and `routine_exercises` rows, so its exercises reach the
 *   account like every other template and the logger loads them as it always has.
 * - How it runs (Rotate in order or Set weekdays) and the weekly target go through the plan store, which keeps them in the
 *   synced `plans` row when that table is switched on, and on this phone until then.
 * - The split itself (its name, the preset it came from, the order of its days, each day's muscles and weekday) and where
 *   it has got to (the day up, a day that waits, today's swap or skip) stay on this phone, as the plan's membership does
 *   (IN-M209). The plan store is kept in step, so every other Training tile reads the same days.
 */
const DEF = 'split:def', STATE = 'split:state';

export interface DayDraft { name: string; focus: MuscleGroup[] | null; exercises: TemplateExercise[]; /** An existing template to keep. */ routineId?: string }
export interface SplitDayView {
  index: number; routineId: string; name: string; focus: MuscleGroup[];
  exercises: { name: string; sets: number; repMin: number; repMax: number }[];
  sets: number; min: number; weekdays: number[];
}
export interface SplitView {
  def: SplitDef; state: SplitState; today: string; days: SplitDayView[]; now: SplitToday;
  live: { id: string; name: string; routineId: string | null } | null;
  /** Rotate in order: sessions this week against the target. Set weekdays: split days done against the weekdays set. */
  week: { done: number; target: number; cells: WeekCell[] };
  coverage: Coverage[];
}
export type Undo = () => void;

const exercisesOf = (e: readonly (readonly [string, number, number, number])[]): TemplateExercise[] =>
  e.map(([exercise, sets, lo, hi]) => ({ exercise, target_sets: sets, target_reps: hi, rep_min: lo, rep_max: hi }));
const validDay = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

export class SplitStore {
  readonly workout: WorkoutStore;
  readonly plans: PlanStore;
  constructor(readonly repo: Repository) { this.workout = new WorkoutStore(repo); this.plans = new PlanStore(repo); }

  /** The split, with any day whose template has gone left out; null until one is chosen. */
  def(): SplitDef | null {
    const raw = this.repo.localGet<SplitDef | null>(DEF);
    if (!raw || raw.v !== 1 || !Array.isArray(raw.days)) return null;
    const live = new Set(this.workout.templates().filter(r => r.deleted_at === null).map(r => r.id));
    const keep = raw.days.map((d, i) => ({ d, i })).filter(x => x.d && live.has(x.d.routineId));
    const remap = new Map(keep.map((x, j) => [x.i, j]));
    const week = Array.from({ length: 7 }, (_, i) => { const w = Array.isArray(raw.week) ? raw.week[i] : -1; return remap.get(w) ?? -1; });
    const def: SplitDef = { v: 1, key: String(raw.key ?? 'custom'), name: String(raw.name ?? ''), mode: raw.mode === 'weekdays' ? 'weekdays' : 'rotate',
      perWeek: Math.max(1, Math.min(7, Math.round(Number(raw.perWeek)) || 3)), days: keep.map(x => ({ routineId: x.d.routineId, focus: x.d.focus ?? null })),
      week, since: validDay(raw.since) ? raw.since : localDay(new Date()) };
    // Another phone may have changed how it runs: the synced plan row wins once that table is on.
    if (this.repo.syncFlags?.syncedV1Columns && this.repo.list('plans').length) {
      const p = this.plans.read();
      def.mode = p.mode === 'fixed' ? 'weekdays' : 'rotate';
      if (def.mode === 'rotate') def.perWeek = p.daysPerWeek;
    }
    return def;
  }
  chosen() { return this.def() !== null; }
  private sequenceNow() { return this.repo.localGet<number>('plans:sequence') ?? 0; }
  /** Split workouts finished so far: each one's launch sequence (written when a split day starts) and its day. */
  finished(def: SplitDef): FinishedSplit[] {
    const ids = new Set(def.days.map(d => d.routineId));
    return this.repo.list('sessions').filter(s => s.data.finished_at != null && ids.has(String(s.data.routine_id ?? '')))
      .map(s => ({ s, seq: this.repo.localGet<number>(`plans:session:${s.id}`) }))
      .filter((x): x is { s: Row; seq: number } => typeof x.seq === 'number')
      .map(({ s, seq }) => ({ seq, routineId: String(s.data.routine_id), day: String(s.data.day) }));
  }
  /** Where the split has got to today, with every split workout finished since folded in (read only). */
  state(def: SplitDef, today = localDay(new Date())): SplitState {
    return reconcile(def, cleanState(def, this.repo.localGet<SplitState>(STATE)), this.finished(def), today);
  }
  muscles = (name: string): ExerciseMuscles => {
    const ex = this.workout.preferences().exercise(name), main = muscleGroup(ex.main);
    return { main, helpers: [...new Set(ex.helpers.map(muscleGroup).filter((g): g is MuscleGroup => !!g && g !== main))] };
  };
  dayName(routineId: string) { return String(this.repo.get('routines', routineId)?.data.name ?? ''); }
  days(def: SplitDef): SplitDayView[] {
    return def.days.map((d, index) => {
      const exercises = this.workout.templateExercises(d.routineId).map(e => {
        const target = Number(e.data.target_reps) || 8, repMin = Number(e.data.rep_min ?? target) || target;
        return { name: String(e.data.exercise), sets: Number(e.data.target_sets) || 3, repMin, repMax: Number(e.data.rep_max ?? target) || repMin };
      });
      const sets = exercises.reduce((n, e) => n + e.sets, 0);
      return { index, routineId: d.routineId, name: this.dayName(d.routineId), focus: dayFocus(d.focus, exercises, this.muscles), exercises, sets,
        min: estimateMin(sets), weekdays: def.week.map((w, i) => w === index ? i : -1).filter(i => i >= 0) };
    });
  }

  /** Everything the tile and the Split screen show, for today. */
  view(now = new Date()): SplitView | null {
    const def = this.def();
    if (!def) return null;
    const today = localDay(now), state = this.state(def, today), days = this.days(def);
    const active = this.workout.active();
    const live = active ? { id: active.id, name: String(active.data.name ?? ''), routineId: active.data.routine_id ? String(active.data.routine_id) : null } : null;
    const finished = this.finished(def);
    const doneToday = finished.some(f => f.day === today);
    const t = splitToday(def, state, { today, live: live ? { routineId: live.routineId } : null, doneToday }, 3);
    const name = (i: number) => days[i]?.name ?? '';
    const monday = mondayOf(today);
    let week: SplitView['week'];
    if (def.mode === 'rotate') {
      const done = this.workout.history().filter(s => String(s.data.day) >= monday && String(s.data.day) <= today)
        .sort((a, b) => Number(a.data.started_at) - Number(b.data.started_at)).map(s => String(s.data.name ?? ''));
      const upcoming = this.upcoming(def, state, t, today).map(name);
      week = { done: done.length, target: def.perWeek, cells: sessionCells(done, live ? live.name : null, upcoming, def.perWeek, t.kind === 'planned') };
    } else {
      const trained = new Map<string, string>();
      for (const s of this.workout.history().slice().reverse()) { const d = String(s.data.day); if (d >= monday && !trained.has(d)) trained.set(d, String(s.data.name ?? '')); }
      const todayCell = t.kind === 'live' ? { kind: 'live' as const, name: live?.name ?? '' }
        : t.kind === 'done' ? { kind: 'done' as const, name: trained.get(today) ?? '' }
          : t.kind === 'skipped' ? { kind: 'skip' as const, name: name(t.focus) }
            : t.kind === 'planned' ? { kind: 'plan' as const, name: name(t.focus) } : { kind: 'rest' as const, name: '' };
      week = { done: finished.filter(f => f.day >= monday && f.day <= today).length, target: perWeekOf(def),
        cells: weekdayCells(def, monday, today, trained, name, todayCell) };
    }
    const coverage = weeklySets(days.map(d => d.exercises), timesPerWeek(def, days.length), this.muscles);
    return { def, state, today, days, now: t, live, week, coverage };
  }
  /** The split days still to come, in order, starting with the one front and centre (seven at most). */
  private upcoming(def: SplitDef, s: SplitState, t: SplitToday, today: string): number[] {
    const tomorrow = plusDays(today, 1), base = { ...s, swap: s.day === today ? s.swap : null };
    if (t.kind === 'live') return t.focus >= 0 ? sequence(def, finishDay(def, s, t.focus), tomorrow, 7) : sequence(def, base, today, 7);
    if (t.focus < 0) return [];
    if (t.kind === 'planned') return [t.focus, ...sequence(def, finishDay(def, base, t.focus), tomorrow, 6)];
    return sequence(def, base, tomorrow, 7);
  }

  /* ---------- choosing a split ---------- */
  /** A preset's days, ready to use: templates of the current plan with the same names are kept, with their exercises. */
  presetDrafts(preset: SplitPreset): DayDraft[] {
    const current = this.plans.read().days.map(d => ({ id: d.routineId, name: this.dayName(d.routineId).toLowerCase() }));
    const reuse = preset.days.every(d => current.some(c => c.name === d.name.toLowerCase()));
    return preset.days.map(d => {
      const keep = reuse ? current.find(c => c.name === d.name.toLowerCase()) : undefined;
      return { name: d.name, focus: d.focus ? [...d.focus] : null, routineId: keep?.id,
        exercises: keep ? this.workout.templateExercises(keep.id).map(e => ({ exercise: String(e.data.exercise), target_sets: Number(e.data.target_sets) || 3,
          target_reps: Number(e.data.target_reps) || 8, rep_min: (e.data.rep_min as number | null) ?? undefined, rep_max: (e.data.rep_max as number | null) ?? undefined }))
          : exercisesOf(d.ex) };
    });
  }
  /** Where a preset starts when its days are the plan's own: the plan's next day; otherwise the first. */
  presetStart(drafts: DayDraft[]) {
    if (!drafts.every(d => d.routineId)) return 0;
    const days = this.plans.read().days, next = days[this.plans.nextIndex()]?.routineId;
    const i = drafts.findIndex(d => d.routineId === next);
    return i < 0 ? 0 : i;
  }
  /** A built split's days: each one's muscles, with two suggested exercises per muscle when asked. */
  blankDrafts(days: { name: string; focus: MuscleGroup[] }[], suggest: boolean): DayDraft[] {
    const group = (n: string) => this.muscles(n).main;
    return days.map(d => ({ name: d.name.trim(), focus: d.focus.length ? MUSCLE_GROUPS.filter(m => d.focus.includes(m)) : null,
      exercises: suggest ? exercisesOf(d.focus.flatMap(m => suggestFor(m, group))) : [] }));
  }
  /** Make a split the current one. Its days become templates (or keep the ones given), and it starts on `start`. */
  choose(input: { key: string; name: string; mode: SplitMode; perWeek: number; week?: number[]; days: DayDraft[]; start?: number }, now = new Date()): Undo {
    if (!input.days.length || input.days.some(d => !d.name.trim())) throw Error('Invalid split.');
    const before = this.snapshot(), created: string[] = [];
    const today = localDay(now);
    this.repo.atomic(() => {
      const ids = input.days.map(d => {
        if (d.routineId && this.repo.get('routines', d.routineId)?.deleted_at === null) return d.routineId;
        const id = this.workout.saveTemplate(d.name, d.exercises).id;
        created.push(id);
        return id;
      });
      const n = ids.length, week = input.week && input.week.length === 7 ? input.week.map(w => w >= 0 && w < n ? w : -1) : defaultWeek(n, input.perWeek);
      const def: SplitDef = { v: 1, key: input.key, name: input.name.trim().slice(0, 60), mode: input.mode, perWeek: Math.max(1, Math.min(7, input.perWeek)),
        days: ids.map((routineId, i) => ({ routineId, focus: input.days[i].focus })), week, since: today };
      this.repo.localSave(DEF, def);
      const start = Math.max(0, Math.min(n - 1, input.start ?? 0));
      // In Set weekdays a chosen first day waits for the next session, then the week carries on (v21 `apply`).
      this.repo.localSave(STATE, def.mode === 'rotate' ? freshState(def, start, this.sequenceNow()) : freshState(def, 0, this.sequenceNow(), start > 0 ? start : null));
      this.project(def);
    });
    return () => this.restore(before, created);
  }
  /** Keep the plan's days as they are and call them the split (the Split screen before one is chosen). */
  adoptPlan(name: string): Undo | null {
    const p = this.plans.read();
    if (!p.days.length) return null;
    const week = Array.from({ length: 7 }, (_, wd) => p.days.findIndex(d => d.weekdays.includes(wd)));
    return this.choose({ key: 'custom', name: this.plans.name() || name, mode: p.mode === 'fixed' ? 'weekdays' : 'rotate', perWeek: p.daysPerWeek,
      week: week.some(w => w >= 0) ? week : undefined, days: p.days.map(d => ({ name: this.dayName(d.routineId), focus: null, exercises: [], routineId: d.routineId })),
      start: this.plans.nextIndex() });
  }
  private snapshot() {
    return { def: this.repo.localGet<SplitDef | null>(DEF) ?? null, state: this.repo.localGet<SplitState | null>(STATE) ?? null,
      plan: this.repo.localGet<unknown>('plans:definition') ?? null, planRead: this.plans.read(), name: this.repo.localGet<string>('plans:name') ?? null };
  }
  private restore(s: ReturnType<SplitStore['snapshot']>, created: string[]) {
    this.repo.atomic(() => {
      for (const id of created) this.workout.deleteTemplate(id);
      this.repo.localSave(DEF, s.def);
      this.repo.localSave(STATE, s.state);
      if (s.planRead.days.length && s.planRead.days.every(d => this.repo.get('routines', d.routineId)?.deleted_at === null)) this.plans.save(s.planRead);
      else this.repo.localSave('plans:definition', s.plan ?? { days: [] });
      if (s.name !== null) this.repo.localSave('plans:name', s.name);
    });
  }
  /** Keep the plan store in step with the split, so the Up next, This week and Plan days tiles read the same days. */
  private project(def: SplitDef) {
    const fixed = def.mode === 'weekdays';
    const days = def.days.map((d, i) => ({ routineId: d.routineId, weekdays: def.week.map((w, wd) => w === i ? wd : -1).filter(wd => wd >= 0) }));
    // In Set weekdays a day with no weekday yet simply doesn't run, so it stays out of the plan rather than turning the
    // whole plan into a rotation (the synced plan row decides the mode on every phone).
    this.plans.save({ mode: fixed ? 'fixed' : 'rotation',
      daysPerWeek: Math.max(1, Math.min(7, perWeekOf(def) || 1)), days: fixed ? days.filter(d => d.weekdays.length) : days });
    this.plans.setName(def.name);
  }
  private write(def: SplitDef, state?: SplitState) {
    this.repo.atomic(() => {
      this.repo.localSave(DEF, def);
      if (state) this.repo.localSave(STATE, state);
      this.project(def);
    });
  }
  private change(fn: (def: SplitDef, s: SplitState, today: string) => SplitState, now = new Date()): Undo {
    const def = this.def();
    if (!def) return () => {};
    const today = localDay(now), prior = this.repo.localGet<SplitState>(STATE) ?? null, s = this.state(def, today);
    this.repo.localSave(STATE, fn(def, s, today));
    return () => this.repo.localSave(STATE, prior);
  }

  /* ---------- the Change menu ---------- */
  /** Do another day today: the day it replaces waits and comes next. While today's is going or done, it changes the next session. */
  swap(to: number, now = new Date()) {
    const v = this.view(now);
    if (v && (v.now.kind === 'live' || v.now.kind === 'done')) return this.change((_def, s) => swapNext(s, to), now);
    return this.change((def, s, today) => swapToday(def, s, today, to), now);
  }
  /** Skip today's day: it waits and is the next session. */
  skip(now = new Date()) { return this.change((def, s, today) => skipToday(def, s, today), now); }
  /** Train today on a rest day, after a skip or after today's day is done. */
  trainToday(now = new Date()) { return this.change((def, s, today) => trainToday(def, s, today), now); }

  /** Start a split day: the logger opens with its exercises, and finishing it moves the split on. Freestyle (no day) never does. */
  startDay(routineId: string, now = Date.now()) {
    if (this.workout.active()) throw Error('A workout is going.');
    return this.repo.atomic(() => {
      const session = this.workout.start(routineId, now);
      const seq = this.sequenceNow() + 1;
      this.repo.localSave('plans:sequence', seq);
      this.repo.localSave(`plans:session:${session.id}`, seq);
      return session;
    });
  }

  /* ---------- editing ---------- */
  setMode(mode: SplitMode) {
    const def = this.def();
    if (!def || def.mode === mode) return;
    const week = mode === 'weekdays' && !def.week.some(w => w >= 0) ? defaultWeek(def.days.length, def.perWeek) : def.week;
    this.write({ ...def, mode, week });
  }
  setPerWeek(n: number) { const def = this.def(); if (def) this.write({ ...def, perWeek: Math.max(1, Math.min(7, Math.round(n))) }); }
  /** One weekday's day in Set weekdays (-1: rest). */
  setWeekday(weekday: number, day: number) {
    const def = this.def();
    if (!def || weekday < 0 || weekday > 6) return;
    const week = def.week.slice(); week[weekday] = day >= 0 && day < def.days.length ? day : -1;
    this.write({ ...def, week });
  }
  setWeek(week: number[]) { const def = this.def(); if (def && week.length === 7) this.write({ ...def, week: week.map(w => w >= 0 && w < def.days.length ? w : -1) }); }
  rename(name: string) { const def = this.def(); if (def && name.trim()) this.write({ ...def, name: name.trim().slice(0, 60) }); }
  renameDay(index: number, name: string) {
    const def = this.def(), d = def?.days[index];
    if (!d || !name.trim()) return;
    const rows = this.workout.templateExercises(d.routineId).map(e => ({ id: e.id, exercise: String(e.data.exercise), target_sets: Number(e.data.target_sets) || 3,
      target_reps: Number(e.data.target_reps) || 8, rep_min: (e.data.rep_min as number | null) ?? undefined, rep_max: (e.data.rep_max as number | null) ?? undefined,
      superset_group: (e.data.superset_group as string | null) ?? undefined }));
    this.workout.saveTemplate(name.trim().slice(0, 60), rows, d.routineId);
  }
  setFocus(index: number, focus: MuscleGroup[]) {
    const def = this.def();
    if (!def?.days[index]) return;
    const days = def.days.map((d, i) => i === index ? { ...d, focus: focus.length ? MUSCLE_GROUPS.filter(m => focus.includes(m)) : null } : d);
    this.write({ ...def, days });
  }
  /** A new empty day at the end of the split. */
  addDay(name: string): number {
    const def = this.def();
    if (!def) return -1;
    const id = this.workout.saveTemplate(name, []).id;
    this.write({ ...def, days: [...def.days, { routineId: id, focus: null }] });
    return def.days.length;
  }
}

/** A preset made ready for the setup sheet. */
export function presetFor(store: SplitStore, key: string) {
  const preset = splitPreset(key);
  if (!preset) return null;
  const drafts = store.presetDrafts(preset);
  return { preset, drafts, start: store.presetStart(drafts) };
}
