import { displayWeight, type Unit } from '../../core/workout/rules';
import type { WorkoutStore } from '../../data/workout/store';

export interface LiftRecord { exercise: string; weight: number; unit: Unit; day: string }
/**
 * The heaviest working set for each exercise across finished workouts, newest first.
 * Read-only: it reads the same sets the workout summary reads and saves nothing.
 */
export function liftRecords(store: WorkoutStore): LiftRecord[] {
  const best = new Map<string, { kg: number; day: string; entryId: string }>();
  for (const session of store.trainingHistory()) {
    const day = String(session.data.day ?? '');
    for (const entry of store.entries(session.id)) {
      const exercise = String(entry.data.exercise);
      for (const set of store.working(entry)) {
        if (set.warmup || !(set.reps >= 1) || !Number.isFinite(set.weight) || set.weight <= 0) continue;
        const held = best.get(exercise);
        // A tie keeps the earlier day: that is when the record was first set.
        if (!held || set.weight > held.kg + 1e-7 || (Math.abs(set.weight - held.kg) <= 1e-7 && day < held.day)) best.set(exercise, { kg: set.weight, day, entryId: entry.id });
      }
    }
  }
  return [...best].map(([exercise, record]) => {
    const unit = store.unit(record.entryId);
    return { exercise, weight: displayWeight(record.kg, unit), unit, day: record.day };
  }).sort((a, b) => b.day.localeCompare(a.day) || a.exercise.localeCompare(b.exercise));
}

export interface Lifetime { workouts: number; sets: number; volume: number; unit: Unit }
/** Totals across every finished workout that has at least one working set. Volume is in the profile unit. */
export function lifetime(store: WorkoutStore): Lifetime {
  let sets = 0, volume = 0;
  const sessions = store.trainingHistory();
  for (const session of sessions) {
    const summary = store.summary(session.id);
    sets += summary.count;
    volume += summary.volume;
  }
  return { workouts: sessions.length, sets, volume: Math.round(volume), unit: store.unit() };
}
