import type { Row } from '@/data/rows';
import type { WorkoutStore } from '@/data/workout/store';

/** Load lifted in one logged set, in kg. A one-arm or one-leg set counts both sides, as the workout summary does. */
export function setVolumeKg(set: Row): number { return setVolume(set); }
/** The same load with each weight first put in another unit by `w` (a display unit, say), so it adds up as the sets read. */
export function setVolume(set: Row, w: (kg: number) => number = kg => kg): number {
  const d = set.data;
  const volume = d.left_weight_kg != null && d.right_weight_kg != null
    ? w(Number(d.left_weight_kg)) * Number(d.left_reps) + w(Number(d.right_weight_kg)) * Number(d.right_reps)
    : w(Number(d.weight_kg)) * Number(d.reps);
  return Number.isFinite(volume) ? volume : 0;
}
/** Working volume for one exercise in a workout, in kg. Warm-ups and skipped exercises count for nothing. */
export function entryVolumeKg(store: WorkoutStore, entry: Row): number { return entryVolume(store, entry); }
/** An exercise's working volume with each weight put in another unit by `w` first. */
export function entryVolume(store: WorkoutStore, entry: Row, w: (kg: number) => number = kg => kg): number {
  if (store.skipped(entry.id)) return 0;
  const working = store.working(entry);
  return store.sets(entry.id).reduce((sum, set, index) => sum + (working[index]?.warmup ? 0 : setVolume(set, w)), 0);
}
