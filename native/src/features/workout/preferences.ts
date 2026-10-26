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
  machine(name: string): MachineNote {
    const row = this.noteRow(name);
    if (!this.enabled) return { ...this.repo.localGet<MachineNote>(`machineSetup:${name.toLowerCase()}`), text: String(row?.data.text ?? '') };
    return { text: String(row?.data.text ?? ''),
      ...(Number(row?.data.step) > 0 ? { step: Number(row!.data.step) } : {}),
      ...(row?.data.bar_weight != null ? { bar_weight: Number(row.data.bar_weight) } : {}),
      ...(row?.data.unit_override === 'kg' || row?.data.unit_override === 'lb' ? { unit_override: row.data.unit_override } : {}) };
  }
  unit(name: string, fallback: Unit): Unit { return this.machine(name).unit_override ?? fallback; }
  increment(name: string, unit: Unit) { return this.machine(name).step ?? (unit === 'lb' ? 10 : 5); }
  saveMachine(name: string, note: MachineNote, fallback: Unit = 'lb') {
    if ((note.step !== undefined && (!Number.isFinite(note.step) || note.step <= 0 || note.step > 1000)) || (note.bar_weight !== undefined && (!Number.isFinite(note.bar_weight) || note.bar_weight < 0 || note.bar_weight > 1000))) throw Error('Invalid setup.');
    const oldUnit = this.unit(name, fallback), nextUnit = note.unit_override ?? fallback;
    this.repo.atomic(() => {
      const row = this.noteRow(name);
      this.repo.save('machine_notes', { exercise: name, text: note.text, ...(this.enabled ? { step: note.step ?? null, bar_weight: note.bar_weight ?? null, unit_override: note.unit_override ?? null } : {}) }, row?.id);
      if (!this.enabled) this.repo.localSave(`machineSetup:${name.toLowerCase()}`, note);
      if (oldUnit !== nextUnit) for (const entry of this.repo.list('entries').filter(e => String(e.data.exercise).toLowerCase() === name.toLowerCase())) {
        const drafts = this.repo.localGet<{ weight: string; reps: string; setId?: string }[]>(`draft:${entry.id}`);
        if (drafts) this.repo.localSave(`draft:${entry.id}`, drafts.map(d => ({ ...d, weight: d.weight ? String(displayWeight(toKg(Number(d.weight), oldUnit), nextUnit)) : '' })));
        for (let i = 0; i < (drafts?.length ?? 0); i++) this.repo.localSave(`input:${entry.id}:${i}:weight`, null);
      }
    });
  }
  plateSet(unit: Unit): number[] {
    const settings = this.repo.list('settings').sort(compareRows).at(-1);
    const saved = this.enabled ? parse<Partial<Record<Unit, number[]>> | number[]>(settings?.data.plate_set, {}) : this.repo.localGet<Partial<Record<Unit, number[]>>>('gymPlates') ?? {};
    const sizes = Array.isArray(saved) ? saved : saved?.[unit];
    return Array.isArray(sizes) && sizes.every(p => typeof p === 'number' && Number.isFinite(p) && p > 0 && p <= 1000) ? sizes : defaultPlates(unit);
  }
  savePlates(unit: Unit, sizes: number[]) {
    if (sizes.some(p => !Number.isFinite(p) || p <= 0 || p > 1000 || Math.abs(Math.round(p * 100) - p * 100) > 1e-8)) throw Error('Invalid plates.');
    const row = this.repo.list('settings').sort(compareRows).at(-1);
    const saved = this.enabled ? parse<Partial<Record<Unit, number[]>>>(row?.data.plate_set, {}) : this.repo.localGet<Partial<Record<Unit, number[]>>>('gymPlates') ?? {};
    const value = { ...(!Array.isArray(saved) ? saved : {}), [unit]: [...new Set(sizes)].sort((a, b) => b - a) };
    if (this.enabled) this.repo.save('settings', { ...row?.data, plate_set: JSON.stringify(value) }, row?.id);
    else this.repo.localSave('gymPlates', value);
  }
  customs(): Exercise[] {
    if (!this.enabled) return this.repo.localGet<Exercise[]>('customLifts') ?? [];
    return this.repo.list('custom_exercises').map(r => ({ name: String(r.data.name), main: String(r.data.main_muscle ?? ''), helpers: parse<string[]>(r.data.helpers, []), equipment: r.data.equipment as Exercise['equipment'] })).filter(validCustomExercise);
  }
  library() { return [...exerciseLibrary, ...this.customs().filter(c => !exerciseLibrary.some(e => e.name.toLowerCase() === c.name.toLowerCase()))]; }
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
