import type { Row } from '@/data/rows';
import type { WorkoutStore } from '@/data/workout/store';

/** Load lifted in one logged set, in kg. A one-arm or one-leg set counts both sides, as the workout summary does. */
export function setVolumeKg(set: Row): number {
  const d = set.data;
  const volume = d.left_weight_kg != null && d.right_weight_kg != null
    ? Number(d.left_weight_kg) * Number(d.left_reps) + Number(d.right_weight_kg) * Number(d.right_reps)
    : Number(d.weight_kg) * Number(d.reps);
  return Number.isFinite(volume) ? volume : 0;
}
/** Working volume for one exercise in a workout, in kg. Warm-ups and skipped exercises count for nothing. */
export function entryVolumeKg(store: WorkoutStore, entry: Row): number {
  if (store.skipped(entry.id)) return 0;
  const working = store.working(entry);
  return store.sets(entry.id).reduce((sum, set, index) => sum + (working[index]?.warmup ? 0 : setVolumeKg(set)), 0);
}
