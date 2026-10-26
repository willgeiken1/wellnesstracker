import { t } from '../../i18n/en';
import { Repository } from '../repository';
import type { Row } from '../rows';
import { compareRows } from '../rows';
import { WorkoutPreferences } from '../../features/workout/preferences';
import { attribute, cardKey, detectPR, displayWeight, fromKg, localDay, shouldShowCard, suggestion, toKg, validateDate, validateSet, weekOf, type Unit, type WorkingSet } from '../../core/workout/rules';
export interface Draft {
  weight: string;
  reps: string;
  setId?: string;
  warmup?: boolean;
  tag?: 'warmup' | 'failure' | 'drop' | null;
  rightWeight?: string;
  rightReps?: string;
}
export interface TimerState {
  sessionId: string;
  setId: string;
  entryId: string;
  endAt: number;
  duration: number;
  minimized: boolean;
  ended: boolean;
  restChanged?: boolean;
}
export interface TemplateExercise {
  id?: string;
  exercise: string;
  target_sets: number;
  target_reps: number;
  restSeconds?: number;
  restStyle?: 'unwind' | 'converge';
}
const order = (rows: Row[]) => rows.sort((a, b) => Number(a.data.position) - Number(b.data.position) || a.id.localeCompare(b.id));
export class WorkoutStore {
  constructor(readonly repo: Repository, readonly viewRevision = 0) {}
  unit(entryId?: string): Unit {
    const fallback = this.repo.list('profile').sort(compareRows).at(-1)?.data.weight_unit === 'kg' ? 'kg' : 'lb';
    const entry = entryId ? this.repo.get('entries', entryId) : undefined;
    return entry ? this.preferences().unit(String(entry.data.exercise), fallback) : fallback;
  }
  preferences() { return new WorkoutPreferences(this.repo); }
  hapticsEnabled() { return this.repo.localGet<boolean>('haptics') !== false; }
  toggleHaptics() { this.repo.localSave('haptics', !this.hapticsEnabled()); }
  private settings() { return this.repo.list('settings').sort(compareRows).at(-1); }
  private restMap(): Record<string, number> {
    if (!this.repo.syncFlags?.syncedV1Columns) return {};
    try {
      const value: unknown = JSON.parse(String(this.settings()?.data.rest_per_exercise ?? '{}'));
      return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, number> : {};
    } catch { return {}; }
  }
  rest(name: string) {
    const key = name.trim().toLowerCase();
    const stored = this.repo.syncFlags?.syncedV1Columns ? this.restMap()[key] : this.repo.localGet<number>(`rest:${key}`);
    const seconds = Number(stored ?? this.settings()?.data.rest_seconds ?? 90);
    return { seconds: Number.isInteger(seconds) && seconds >= 15 && seconds <= 3600 ? seconds : 90,
      style: this.repo.localGet<'unwind' | 'converge'>(`restStyle:${key}`) ?? this.defaultRestStyle() };
  }
  defaultRestStyle(): 'unwind' | 'converge' {
    const style = this.repo.syncFlags?.syncedV1Columns ? this.settings()?.data.rest_style : this.repo.localGet('restStyle');
    return style === 'converge' ? 'converge' : 'unwind';
  }
  setDefaultRestStyle(style: 'unwind' | 'converge') {
    if (this.repo.syncFlags?.syncedV1Columns) {
      const row = this.settings(); this.repo.save('settings', { ...row?.data, rest_style: style }, row?.id);
    } else this.repo.localSave('restStyle', style);
  }
  setRest(name: string, rest: {seconds: number; style: 'unwind' | 'converge'}) {
    if (!Number.isInteger(rest.seconds) || rest.seconds < 15 || rest.seconds > 3600 || !['unwind','converge'].includes(rest.style)) throw Error('Invalid rest.');
    const key = name.trim().toLowerCase();
    this.repo.atomic(() => {
      if (this.repo.syncFlags?.syncedV1Columns) {
        const row = this.settings();
        this.repo.save('settings', { ...row?.data, rest_per_exercise: JSON.stringify({...this.restMap(), [key]: rest.seconds}) }, row?.id);
      }
      // Keep a phone-local fallback when a later launch turns the v1 flag off.
      this.repo.localSave(`rest:${key}`, rest.seconds);
      // No per-exercise style column exists in v1; never overload the wire map.
      this.repo.localSave(`restStyle:${key}`, rest.style);
    });
  }
  isUnilateral(entryId: string) {
    return this.repo.localGet<boolean>(`unilateral:${entryId}`) === true || this.sets(entryId).some(s => s.data.left_reps != null && s.data.right_reps != null);
  }
  setUnilateral(entryId: string, enabled: boolean) {
    this.repo.localSave(`unilateral:${entryId}`, enabled);
  }
  skipped(entryId: string) { return this.repo.localGet<boolean>(`skipped:${entryId}`) === true; }
  skipExercise(entryId: string, skipped = true) {
    if (skipped && this.sets(entryId).length > 0) throw Error('Cannot skip completed sets.');
    this.repo.atomic(() => {
      this.repo.localSave(`skipped:${entryId}`, skipped);
      if (skipped && this.timer()?.entryId === entryId) this.skipTimer();
      this.recompute();
    });
  }
  trainingHistory() { return this.history().filter(s => this.entries(s.id).some(e => this.working(e).some(s => !s.warmup && s.reps > 0))); }
  replaceExercise(entryId: string, name: string, mode: 'swap' | 'replace' = 'replace') {
    const entry = this.repo.get('entries', entryId);
    if (!entry || !name.trim() || !['swap','replace'].includes(mode)) throw Error('Invalid exercise.');
    return this.repo.atomic(() => {
      const drafts = this.drafts(entryId), completed = drafts.filter(d => d.setId), pending = drafts.filter(d => !d.setId);
      if (!completed.length) {
        const updated = this.repo.save('entries', {...entry.data, exercise: name.trim()}, entryId);
        this.repo.localSave(`draft:${entryId}`, pending.map(() => ({weight:'',reps:''})));
        this.repo.localSave(`skipped:${entryId}`, false);
        return updated;
      }
      const replacement = this.addExercise(String(entry.data.session_id), name, Math.max(1,pending.length));
      this.repo.localSave(`draft:${replacement.id}`, pending.length ? pending.map(() => ({weight:'',reps:''})) : [{weight:'',reps:''}]);
      // Compact completed rows without changing their IDs or exercise attribution.
      completed.forEach((draft, position) => {
        const set = this.repo.get('sets', draft.setId!)!;
        this.repo.save('sets', {...set.data, position}, set.id);
      });
      this.repo.localSave(`draft:${entryId}`, completed);
      const entries = this.entries(String(entry.data.session_id)).filter(e => e.id !== replacement.id);
      entries.splice(entries.findIndex(e => e.id === entryId) + 1, 0, replacement);
      entries.forEach((e, position) => this.repo.save('entries', {...e.data, position}, e.id));
      if (this.timer()?.entryId === entryId) this.skipTimer();
      return replacement;
    });
  }
  templates() {
    return order(this.repo.list('routines'));
  }
  templateExercises(id: string) {
    return order(this.repo.list('routine_exercises').filter(e => e.data.routine_id === id));
  }
  saveTemplate(name: string, exercises: TemplateExercise[], id?: string) {
    if (!name.trim() || exercises.some(e => !e.exercise.trim() || !Number.isInteger(e.target_sets) || e.target_sets < 1 || e.target_sets > 100 || !Number.isInteger(e.target_reps) || e.target_reps < 0 || e.target_reps > 100)) throw Error('Invalid template.');
    return this.repo.atomic(() => {
      const current = id ? this.repo.get('routines', id) : undefined;
      const routine = this.repo.save('routines', {
        name: name.trim(),
        position: current?.data.position ?? this.templates().length
      }, id);
      const prior = this.templateExercises(routine.id);
      for (const e of prior) if (!exercises.some(x => x.id === e.id)) this.repo.remove('routine_exercises', e.id);
      exercises.forEach((e, position) => {
        const currentRest = this.rest(e.exercise);
        const rest = {seconds: e.restSeconds ?? currentRest.seconds, style: e.restStyle ?? currentRest.style};
        if (rest.seconds !== currentRest.seconds || rest.style !== currentRest.style) this.setRest(e.exercise, rest);
        this.repo.save('routine_exercises', {
        routine_id: routine.id,
        exercise: e.exercise.trim(),
        target_sets: e.target_sets,
        target_reps: e.target_reps,
        position
      }, e.id); });
      return routine;
    });
  }
  deleteTemplate(id: string) {
    const rows = [this.repo.get('routines', id), ...this.templateExercises(id)].filter((r): r is Row => !!r);
    this.repo.atomic(() => rows.forEach(r => this.repo.remove(r.table, r.id)));
    return () => this.repo.atomic(() => rows.forEach(r => this.repo.save(r.table, r.data, r.id)));
  }
  moveTemplate(id: string, direction: number) {
    this.reorder('routines', this.templates(), id, direction);
  }
  private reorder(table: 'routines' | 'entries', rows: Row[], id: string, direction: number) {
    const index = rows.findIndex(r => r.id === id),
      next = index + direction;
    if (index < 0 || next < 0 || next >= rows.length) return;
    [rows[index], rows[next]] = [rows[next], rows[index]];
    this.repo.atomic(() => rows.forEach((r, position) => this.repo.save(table, {
      ...r.data,
      position
    }, r.id)));
  }
  active() {
    return this.repo.list('sessions').filter(s => s.data.finished_at === null).sort((a, b) => Number(b.data.started_at) - Number(a.data.started_at))[0];
  }
  history() {
    return this.repo.list('sessions').filter(s => s.data.finished_at !== null).sort((a, b) => Number(b.data.started_at) - Number(a.data.started_at));
  }
  start(routineId?: string, now = Date.now()) {
    const active = this.active();
    if (active) return active;
    if (!validateDate(now)) throw Error('Invalid date.');
    const routine = routineId ? this.repo.get('routines', routineId) : undefined;
    if (routineId && (!routine || routine.deleted_at !== null)) throw Error('Template unavailable.');
    return this.repo.atomic(() => {
      const s = this.repo.save('sessions', {
        origin: routine ? 'template' : 'empty',
        routine_id: routine?.id ?? null,
        name: routine?.data.name ?? null,
        day: localDay(new Date(now)),
        started_at: now,
        finished_at: null,
        duration_ms: null,
        notes: null
      });
      this.repo.localSave(`sessionMeta:${s.id}`, {
        timezoneOffset: new Date(now).getTimezoneOffset()
      });
      for (const e of routine ? this.templateExercises(routine.id) : []) {
        const entry = this.addExercise(s.id, String(e.data.exercise), Number(e.data.target_sets) || 3);
        this.repo.localSave(`target:${entry.id}`, Number(e.data.target_reps));
      }
      return s;
    });
  }
  entries(sessionId: string) {
    return order(this.repo.list('entries').filter(e => e.data.session_id === sessionId));
  }
  sets(entryId: string) {
    return order(this.repo.list('sets').filter(s => s.data.entry_id === entryId));
  }
  addExercise(sessionId: string, name: string, count = 3) {
    if (!name.trim()) throw Error('Invalid exercise.');
    return this.repo.atomic(() => {
      const e = this.repo.save('entries', {
        session_id: sessionId,
        exercise: name.trim(),
        position: this.entries(sessionId).length,
        notes: null
      });
      this.repo.localSave(`draft:${e.id}`, Array.from({
        length: Math.min(100, Math.max(1, count))
      }, () => ({
        weight: '',
        reps: ''
      })));
      return e;
    });
  }
  moveEntry(id: string, direction: number) {
    const entry = this.repo.get('entries', id);
    if (entry) this.reorder('entries', this.entries(String(entry.data.session_id)), id, direction);
  }
  removeExercise(id: string) {
    this.repo.atomic(() => {
      for (const s of this.sets(id)) this.repo.remove('sets', s.id);
      this.repo.remove('entries', id);
      this.repo.localSave(`draft:${id}`, []);
      const t = this.timer();
      if (t?.entryId === id) this.repo.localSave('timer', null);
      this.recompute();
    });
  }
  drafts(entryId: string): Draft[] {
    const saved = this.repo.localGet<Draft[]>(`draft:${entryId}`),
      sets = this.sets(entryId);
    // Match synced done rows by identity/position; local typed blanks never become done rows.
    const result = saved ? saved.map(d => ({
      ...d
    })) : Array.from({
      length: Math.max(3, ...sets.map(s => Number(s.data.position) + 1))
    }, () => ({
      weight: '',
      reps: ''
    }) as Draft);
    sets.forEach(s => {
      const i = Number(s.data.position);
      if (i < 0 || i >= 100) return;
      while (result.length <= i) result.push({
        weight: '',
        reps: ''
      });
      result[i] = {
        ...result[i],
        setId: s.id,
        weight: String(displayWeight(Number(s.data.weight_kg), this.unit(entryId))),
        reps: String(s.data.left_reps ?? s.data.reps),
        ...(s.data.left_weight_kg != null ? {weight: String(displayWeight(Number(s.data.left_weight_kg), this.unit(entryId)))} : {}),
        ...(s.data.right_weight_kg != null ? {rightWeight: String(displayWeight(Number(s.data.right_weight_kg), this.unit(entryId))), rightReps: String(s.data.right_reps)} : {}),
        ...(this.repo.syncFlags?.syncedV1Columns ? {tag: this.tag(s.data.tag), warmup: s.data.tag === 'warmup'} : {})
      };
    });
    return result.map(d => d.setId && !sets.some(s => s.id === d.setId) ? {
      ...d,
      setId: undefined
    } : d);
  }
  editDraft(entryId: string, index: number, patch: Partial<Pick<Draft, 'weight' | 'reps' | 'warmup' | 'tag' | 'rightWeight' | 'rightReps'>>) {
    const drafts = this.drafts(entryId),
      d = drafts[index];
    if (!d) return;
    drafts[index] = {
      ...d,
      ...patch,
      ...(patch.tag !== undefined ? {warmup: patch.tag === 'warmup'} : {})
    };
    this.repo.atomic(() => {
      if (d.setId) {
        const previous = this.repo.get('sets', d.setId)!;
        const values = this.setData(entryId, index, drafts[index]);
        // Preserve canonical kg when editing only reps/tags, avoiding display rounding.
        if (patch.weight === undefined && !this.isUnilateral(entryId)) {
          values.weight_kg = previous.data.weight_kg;
          values.entered_value = previous.data.entered_value;
          values.entered_unit = previous.data.entered_unit;
        }
        if (this.isUnilateral(entryId)) {
          for (const [side, field] of [['left','weight'],['right','rightWeight']] as const) {
            if (patch[field] === undefined && previous.data[`${side}_weight_kg`] != null) {
              for (const suffix of ['weight_kg','entered_value','entered_unit']) values[`${side}_${suffix}`] = previous.data[`${side}_${suffix}`];
            }
          }
          const side = Number(values.left_weight_kg) * (1 + Number(values.left_reps) / 30) <= Number(values.right_weight_kg) * (1 + Number(values.right_reps) / 30) ? 'left' : 'right';
          values.weight_kg = values[`${side}_weight_kg`]; values.reps = values[`${side}_reps`];
          values.entered_value = values[`${side}_entered_value`]; values.entered_unit = values[`${side}_entered_unit`];
        }
        this.repo.save('sets', {...previous.data, ...values}, d.setId);
      }
      this.repo.localSave(`draft:${entryId}`, drafts);
    });
    const session = this.repo.get('entries', entryId)?.data.session_id;
    if (session && this.repo.get('sessions', String(session))?.data.finished_at !== null) this.recompute();
  }
  addSet(entryId: string) {
    const drafts = this.drafts(entryId);
    if (drafts.length >= 100) return;
    this.repo.localSave(`draft:${entryId}`, [...drafts, {
      weight: '',
      reps: ''
    }]);
  }
  removeSet(entryId: string, index: number) {
    this.repo.atomic(() => {
      const drafts = this.drafts(entryId),
        [removed] = drafts.splice(index, 1);
      if (removed?.setId) this.repo.remove('sets', removed.setId);
      drafts.forEach((d, i) => {
        if (d.setId) {
          const s = this.repo.get('sets', d.setId);
          if (s) this.repo.save('sets', {
            ...s.data,
            position: i
          }, s.id);
        }
      });
      this.repo.localSave(`draft:${entryId}`, drafts);
    });
    this.recompute();
  }
  private tag(value: unknown): Draft['tag'] { return value === 'warmup' || value === 'failure' || value === 'drop' ? value : null; }
  private setData(entryId: string, index: number, d: Draft): Row['data'] {
    if (!validateSet(d.weight, d.reps, this.unit(entryId)).valid) throw Error('Invalid set.');
    const left = {weight: toKg(Number(d.weight), this.unit(entryId)), reps: Number(d.reps)};
    const unilateral = this.isUnilateral(entryId);
    if (unilateral && !validateSet(d.rightWeight ?? '', d.rightReps ?? '', this.unit(entryId)).valid) throw Error('Invalid set.');
    const right = {weight: toKg(Number(d.rightWeight), this.unit(entryId)), reps: Number(d.rightReps)};
    const weak = unilateral && right.weight * (1 + right.reps / 30) < left.weight * (1 + left.reps / 30) ? right : left;
    return { entry_id: entryId, position: index, weight_kg: weak.weight, reps: weak.reps,
      entered_value: unilateral ? fromKg(weak.weight, this.unit(entryId)) : Number(d.weight), entered_unit: this.unit(entryId),
      ...(unilateral ? {left_weight_kg:left.weight,left_reps:left.reps,left_entered_value:Number(d.weight),left_entered_unit:this.unit(entryId),
        right_weight_kg:right.weight,right_reps:right.reps,right_entered_value:Number(d.rightWeight),right_entered_unit:this.unit(entryId)} : {}),
      ...(this.repo.syncFlags?.syncedV1Columns ? {tag: d.tag ?? (d.warmup ? 'warmup' : null)} : {}) };
  }
  private writeSet(entryId: string, index: number, d: Draft, id?: string) {
    return this.repo.save('sets', this.setData(entryId, index, d), id);
  }
  toggleDone(entryId: string, index: number, now = Date.now()) {
    return this.repo.atomic(() => {
      const drafts = this.drafts(entryId),
        d = drafts[index];
      if (!d || this.skipped(entryId)) throw Error('Missing set.');
      if (d.setId) {
        if (this.timer()?.setId === d.setId) this.skipTimer();
        this.repo.remove('sets', d.setId);
        d.setId = undefined;
      } else {
        if (!validateSet(d.weight, d.reps, this.unit(entryId)).valid) throw Error('Invalid set.');
        d.setId = this.writeSet(entryId, index, d).id;
        this.persistTimerRest();
        const entry = this.repo.get('entries', entryId)!;
        const seconds = this.rest(String(entry.data.exercise)).seconds;
        this.repo.localSave('timer', {
          sessionId: String(entry.data.session_id),
          setId: d.setId,
          entryId,
          endAt: now + Math.max(15, seconds) * 1000,
          duration: Math.max(15, seconds),
          minimized: false,
          ended: false
        } satisfies TimerState);
      }
      this.repo.localSave(`draft:${entryId}`, drafts);
      const sessionId = this.repo.get('entries', entryId)?.data.session_id;
      if (sessionId && this.repo.get('sessions', String(sessionId))?.data.finished_at !== null) {
        this.skipTimer();
        this.recompute();
      }
      return !!d.setId;
    });
  }
  previous(entry: Row) {
    const session = this.repo.get('sessions', String(entry.data.session_id));
    const prior = this.history().filter(s => s.id !== session?.id && Number(s.data.started_at) < Number(session?.data.started_at));
    for (const s of prior) {
      const matches = this.entries(s.id).filter(e => e.data.exercise === entry.data.exercise && !this.skipped(e.id));
      const sets = matches.flatMap(e => this.sets(e.id));
      if (sets.length) return order(sets);
    }
    return [];
  }
  working(entry: Row): WorkingSet[] {
    if (this.skipped(entry.id)) return [];
    return this.sets(entry.id).map(s => ({
      weight: Number(s.data.weight_kg),
      reps: Number(s.data.reps),
      done: true,
      warmup: this.repo.syncFlags?.syncedV1Columns ? s.data.tag === 'warmup' : this.drafts(entry.id)[Number(s.data.position)]?.warmup
    }));
  }
  suggestion(entry: Row) {
    const unit = this.unit(entry.id),
      equipment = this.preferences().exercise(String(entry.data.exercise)).equipment;
    const previous = this.previous(entry).map(s => ({
      weight: displayWeight(Number(s.data.weight_kg), unit),
      reps: Number(s.data.reps),
      done: true,
      warmup: this.repo.syncFlags?.syncedV1Columns ? s.data.tag === 'warmup' : this.repo.localGet<Draft[]>(`draft:${String(s.data.entry_id)}`)?.[Number(s.data.position)]?.warmup
    }));
    return suggestion(previous, equipment, unit, this.repo.localGet<number>(`target:${entry.id}`), this.preferences().increment(String(entry.data.exercise), unit));
  }
  showCard(entry: Row) {
    return shouldShowCard(String(entry.data.exercise), this.suggestion(entry), this.unit(entry.id), this.repo.localGet<string[]>('suggestions') ?? []);
  }
  markCard(entry: Row) {
    const s = this.suggestion(entry);
    if (s.weight !== null) this.repo.localSave('suggestions', [...new Set([...(this.repo.localGet<string[]>('suggestions') ?? []), cardKey(String(entry.data.exercise), s.weight, this.unit(entry.id))])]);
  }
  timer() {
    return this.repo.localGet<TimerState | null>('timer');
  }
  updateTimer(patch: Partial<TimerState>) {
    if (patch.ended) this.persistTimerRest();
    const t = this.timer();
    if (t) this.repo.localSave('timer', {
      ...t,
      ...patch
    });
  }
  adjustTimer(delta: number) {
    const t = this.timer();
    if (!t) return;
    const now = Date.now(),
      duration = Math.max(15, t.duration + delta);
    this.updateTimer({
      endAt: Math.max(now, Math.max(now, t.endAt) + delta * 1000),
      duration,
      ended: false,
      restChanged: true
    });
  }
  private persistTimerRest() {
    const timer = this.timer();
    if (!timer?.restChanged) return;
    this.repo.atomic(() => {
      const entry = this.repo.get('entries', timer.entryId);
      if (entry) {
        const name = String(entry.data.exercise);
        this.setRest(name, {...this.rest(name), seconds: Math.min(3600, timer.duration)});
      }
      this.repo.localSave('timer', {...timer, restChanged: false});
    });
  }
  skipTimer() {
    this.persistTimerRest();
    this.repo.localSave('timer', null);
  }
  finish(id: string, input: {
    startedAt: number;
    finishedAt: number;
    notes: string;
    name?: string;
    saveTemplate?: boolean;
  }, now = Date.now()) {
    const s = this.repo.get('sessions', id);
    if (!s || s.deleted_at !== null || !validateDate(input.startedAt, now) || !validateDate(input.finishedAt, now) || input.finishedAt < input.startedAt) throw Error('Invalid date.');
    this.repo.atomic(() => {
      this.repo.save('sessions', {
        ...s.data,
        name: input.name?.trim() || s.data.name || t('workoutName'),
        started_at: input.startedAt,
        finished_at: input.finishedAt,
        day: localDay(new Date(input.startedAt)),
        duration_ms: input.finishedAt - input.startedAt,
        notes: input.notes.trim().slice(0, 2000) || null
      }, id);
      if (input.saveTemplate && s.data.origin === 'empty') this.saveTemplate(input.name?.trim() || t('workoutName'), this.entries(id).map(e => ({
        exercise: String(e.data.exercise),
        target_sets: this.drafts(e.id).length || 1,
        target_reps: Number(this.drafts(e.id).find(d => d.setId)?.reps) || 8
      })));
      this.repo.localSave(`sessionMeta:${id}`, {
        timezoneOffset: new Date(input.startedAt).getTimezoneOffset()
      });
      this.skipTimer();
      this.recompute();
    });
  }
  summary(id: string) {
    const s = this.repo.get('sessions', id)!,
      entries = this.entries(id).filter(e => !this.skipped(e.id)),
      sets = entries.flatMap(e => this.sets(e.id));
    const prs = [...new Set(entries.map(e => String(e.data.exercise)))].map(name => {
      const matches = entries.filter(e => e.data.exercise === name);
      const prior = this.history().filter(p => p.id !== id && Number(p.data.started_at) < Number(s.data.started_at)).flatMap(p => this.entries(p.id).filter(x => x.data.exercise === name).flatMap(x => this.working(x)));
      const current = matches.flatMap(e => this.working(e)),
        record = detectPR(current, prior),
        best = current.filter(s => s.done && !s.warmup && s.reps >= 1).sort((a, b) => b.weight * (1 + b.reps / 30) - a.weight * (1 + a.reps / 30))[0];
      return {
        exercise: name,
        previousE1rm: Math.max(0, ...prior.filter(s => s.done && !s.warmup && s.reps >= 1).map(s => s.weight * (1 + s.reps / 30))),
        bestReps: best?.reps ?? 0,
        displayWeight: best?.weight ?? 0,
        ...record
      };
    }).filter(p => p.weight || p.e1rm);
    return {
      session: s,
      count: sets.length,
      volume: sets.reduce((n, s) => {
        const volume = s.data.left_weight_kg != null && s.data.right_weight_kg != null
          ? fromKg(Number(s.data.left_weight_kg), this.unit()) * Number(s.data.left_reps) + fromKg(Number(s.data.right_weight_kg), this.unit()) * Number(s.data.right_reps)
          : fromKg(Number(s.data.weight_kg), this.unit()) * Number(s.data.reps);
        return n + (Number.isFinite(volume) ? volume : 0);
      }, 0),
      prs
    };
  }
  recompute() {
    const weeks: Record<string, Record<string, number>> = {},
      milestones: {
        sessionId: string;
        exercise: string;
        weight: number;
        e1rm: number;
      }[] = [];
    for (const s of this.history()) {
      const week = weekOf(new Date(`${String(s.data.day)}T12:00:00`)),
        totals = attribute(this.entries(s.id).map(e => {
          const ex = this.preferences().exercise(String(e.data.exercise));
          return {
            ...ex,
            sets: this.working(e)
          };
        }));
      weeks[week] ??= {};
      for (const [muscle, count] of Object.entries(totals)) weeks[week][muscle] = (weeks[week][muscle] ?? 0) + count;
      for (const pr of this.summary(s.id).prs) milestones.push({
        sessionId: s.id,
        exercise: pr.exercise,
        weight: pr.bestWeight,
        e1rm: pr.bestE1rm
      });
    }
    this.repo.localSave('weekly', weeks);
    this.repo.localSave('milestones', milestones);
  }
  weekly(now = new Date()) {
    return this.repo.localGet<Record<string, Record<string, number>>>('weekly')?.[weekOf(now)] ?? {};
  }
  milestones() {
    return this.repo.localGet<{
      sessionId: string;
      exercise: string;
      weight: number;
      e1rm: number;
    }[]>('milestones') ?? [];
  }
}
