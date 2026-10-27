import type { Repository } from '../../data/repository';
import { compareRows } from '../../data/rows';
import { exerciseFor, exerciseLibrary, type Exercise } from '../../core/workout/library';
import { defaultPlates, displayWeight, toKg, type Unit } from '../../core/workout/rules';
import { validCustomExercise } from '../../core/workout/exercise-rules';
export interface MachineNote { text: string; step?: number; bar_weight?: number; unit_override?: Unit }
const parse = <T,>(value: unknown, fallback: T): T => { try { return typeof value === 'string' ? JSON.parse(value) as T : fallback; } catch { return fallback; } };
/** Feature preferences use repository APIs only. OFF keeps new values owner-local. */
export class WorkoutPreferences {
  constructor(readonly repo: Repository) {}
  private get enabled() { return this.repo.syncFlags?.syncedV1Columns === true; }
  private noteRow(name: string) { return this.repo.list('machine_notes').filter(r => String(r.data.exercise).toLowerCase() === name.toLowerCase()).sort(compareRows).at(-1); }
  /** Consume each OFF value with its repository write so restarts cannot replay it
   * over later ON edits. A later OFF save creates a fresh value to promote. */
  private promoteMachine(name: string) {
    if (!this.enabled || !this.repo.canPromotePreferences('machine_notes')) return;
    const key = `machineSetup:${name.toLowerCase()}`;
    const note = this.repo.localGet<MachineNote>(key);
    if (!note) return;
    this.repo.atomic(() => {
      const row = this.noteRow(name);
      this.repo.save('machine_notes', { ...row?.data, exercise: name, text: row?.data.text ?? note.text,
        ...(note.step !== undefined ? { step: note.step } : {}),
        ...(note.bar_weight !== undefined ? { bar_weight: note.bar_weight } : {}),
        ...(note.unit_override !== undefined ? { unit_override: note.unit_override } : {}) }, row?.id);
      this.repo.localSave(key, null);
    });
  }
  private promotePlates() {
    if (!this.enabled || !this.repo.canPromotePreferences('settings')) return;
    const plates = this.repo.localGet<Partial<Record<Unit, number[]>>>('gymPlates');
    if (!plates) return;
    this.repo.atomic(() => {
      const row = this.repo.list('settings').sort(compareRows).at(-1);
      const saved = parse<Partial<Record<Unit, number[]>> | number[]>(row?.data.plate_set, {});
      this.repo.save('settings', { ...row?.data, plate_set: JSON.stringify({ ...(!Array.isArray(saved) ? saved : {}), ...plates }) }, row?.id);
      this.repo.localSave('gymPlates', null);
    });
  }
  machine(name: string): MachineNote {
    this.promoteMachine(name);
    const row = this.noteRow(name);
    if (!this.enabled) return { ...this.repo.localGet<MachineNote>(`machineSetup:${name.toLowerCase()}`), text: String(row?.data.text ?? '') };
    return { ...(Number(row?.data.step) > 0 ? { step: Number(row!.data.step) } : {}),
      ...(row?.data.bar_weight != null ? { bar_weight: Number(row.data.bar_weight) } : {}),
      ...(row?.data.unit_override === 'kg' || row?.data.unit_override === 'lb' ? { unit_override: row.data.unit_override } : {}),
      ...(!this.repo.canPromotePreferences('machine_notes') ? this.repo.localGet<MachineNote>(`machineSetup:${name.toLowerCase()}`) : {}),
      text: String(row?.data.text ?? '') };
  }
  unit(name: string, fallback: Unit): Unit { return this.machine(name).unit_override ?? fallback; }
  increment(name: string, _unit: Unit): number | undefined { return this.machine(name).step; }
  saveMachine(name: string, note: MachineNote, fallback: Unit = 'lb') {
    if ((note.step !== undefined && (!Number.isFinite(note.step) || note.step <= 0 || note.step > 1000)) || (note.bar_weight !== undefined && (!Number.isFinite(note.bar_weight) || note.bar_weight < 0 || note.bar_weight > 1000))) throw Error('Invalid setup.');
    const oldUnit = this.unit(name, fallback), nextUnit = note.unit_override ?? fallback;
    this.repo.atomic(() => {
      const row = this.noteRow(name);
      this.repo.save('machine_notes', { exercise: name, text: note.text, ...(this.enabled ? { step: note.step ?? null, bar_weight: note.bar_weight ?? null, unit_override: note.unit_override ?? null } : {}) }, row?.id);
      if (!this.enabled) this.repo.localSave(`machineSetup:${name.toLowerCase()}`, note);
      if (oldUnit !== nextUnit) for (const entry of this.repo.list('entries').filter(e => String(e.data.exercise).toLowerCase() === name.toLowerCase())) {
        const drafts = this.repo.localGet<{ weight: string; rightWeight?: string; reps: string; setId?: string }[]>(`draft:${entry.id}`);
        if (drafts) this.repo.localSave(`draft:${entry.id}`, drafts.map(d => ({
          ...d,
          weight: d.weight ? String(displayWeight(toKg(Number(d.weight), oldUnit), nextUnit)) : '',
          ...(d.rightWeight !== undefined ? { rightWeight: d.rightWeight ? String(displayWeight(toKg(Number(d.rightWeight), oldUnit), nextUnit)) : '' } : {})
        })));
        for (let i = 0; i < (drafts?.length ?? 0); i++) {
          this.repo.localSave(`input:${entry.id}:${i}:weight`, null);
          this.repo.localSave(`input:${entry.id}:${i}:right:weight`, null);
        }
      }
    });
  }
  plateSet(unit: Unit): number[] {
    this.promotePlates();
    const settings = this.repo.list('settings').sort(compareRows).at(-1);
    const local = !this.enabled || !this.repo.canPromotePreferences('settings') ? this.repo.localGet<Partial<Record<Unit, number[]>>>('gymPlates') : undefined;
    const saved = local ?? (this.enabled ? parse<Partial<Record<Unit, number[]>> | number[]>(settings?.data.plate_set, {}) : {});
    const sizes = Array.isArray(saved) ? saved : saved?.[unit];
    return Array.isArray(sizes) && sizes.every(p => typeof p === 'number' && Number.isFinite(p) && p > 0 && p <= 1000) ? sizes : defaultPlates(unit);
  }
  savePlates(unit: Unit, sizes: number[]) {
    if (sizes.some(p => !Number.isFinite(p) || p <= 0 || p > 1000 || Math.abs(Math.round(p * 100) - p * 100) > 1e-8)) throw Error('Invalid plates.');
    this.promotePlates();
    const row = this.repo.list('settings').sort(compareRows).at(-1);
    const saved = this.enabled ? parse<Partial<Record<Unit, number[]>>>(row?.data.plate_set, {}) : this.repo.localGet<Partial<Record<Unit, number[]>>>('gymPlates') ?? {};
    const value = { ...(!Array.isArray(saved) ? saved : {}), [unit]: [...new Set(sizes)].sort((a, b) => b - a) };
    if (this.enabled) this.repo.save('settings', { ...row?.data, plate_set: JSON.stringify(value) }, row?.id);
    else this.repo.localSave('gymPlates', value);
  }
  customs(): Exercise[] {
    if (!this.enabled) return this.repo.localGet<Exercise[]>('customLifts') ?? [];
    const local = this.repo.localGet<Exercise[]>('customLifts');
    if (local && this.repo.canPromotePreferences('custom_exercises')) this.repo.atomic(() => {
      const rows = new Map(this.repo.list('custom_exercises').sort(compareRows).map(r => [String(r.data.name).toLowerCase(), r]));
      // Invalid legacy definitions are intentionally discarded; only validated fields enter sync.
      for (const exercise of local.filter(validCustomExercise)) {
        const name = exercise.name.trim();
        const row = rows.get(name.toLowerCase());
        const fields = { name, main_muscle: exercise.main!, helpers: JSON.stringify(exercise.helpers), equipment: exercise.equipment };
        if (row) {
          // Only active rows participate. Preserve server choices, filling absent fields.
          const missing = Object.fromEntries(Object.entries(fields).filter(([key]) => row.data[key] == null || row.data[key] === ''));
          if (Object.keys(missing).length) rows.set(name.toLowerCase(), this.repo.save('custom_exercises', { ...row.data, ...missing }, row.id));
        } else rows.set(name.toLowerCase(), this.repo.save('custom_exercises', fields));
      }
      this.repo.localSave('customLifts', null);
    });
    const synced = this.repo.list('custom_exercises').map(r => ({ name: String(r.data.name), main: String(r.data.main_muscle ?? ''), helpers: parse<string[]>(r.data.helpers, []), equipment: r.data.equipment as Exercise['equipment'] })).filter(validCustomExercise);
    return this.repo.canPromotePreferences('custom_exercises') ? synced : [...synced, ...(local ?? []).filter(e => validCustomExercise(e) && !synced.some(s => s.name.toLowerCase() === e.name.toLowerCase()))];
  }
  library() {
    // Consume known OFF setups even when their exercise is never opened. Retrying
    // library reads after replay/failure is safe: each successful key is consumed atomically.
    if (this.enabled && this.repo.canPromotePreferences('machine_notes')) {
      for (const [key, value] of Object.entries(this.repo.localSnapshot())) {
        if (value && key.startsWith('machineSetup:')) this.promoteMachine(key.slice('machineSetup:'.length));
      }
    }
    return [...exerciseLibrary, ...this.customs().filter(c => !exerciseLibrary.some(e => e.name.toLowerCase() === c.name.toLowerCase()))];
  }
  exercise(name: string) { return this.customs().find(e => e.name.toLowerCase() === name.toLowerCase()) ?? exerciseFor(name); }
  saveCustom(exercise: Exercise) {
    if (!validCustomExercise(exercise)) throw Error('Invalid exercise.');
    const e = { ...exercise, name: exercise.name.trim(), helpers: [...new Set(exercise.helpers)].filter(m => m !== exercise.main) };
    if (this.library().some(x => x.name.toLowerCase() === e.name.toLowerCase())) throw Error('Duplicate exercise.');
    if (this.enabled) this.repo.save('custom_exercises', { name: e.name, main_muscle: e.main!, helpers: JSON.stringify(e.helpers), equipment: e.equipment });
    else this.repo.localSave('customLifts', [...this.customs(), e]);
  }
  recent() { return [...this.repo.list('entries')].sort((a, b) => -compareRows(a, b)).map(e => String(e.data.exercise)); }
}
