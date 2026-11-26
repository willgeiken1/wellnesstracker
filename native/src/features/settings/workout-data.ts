import { compareRows } from '@/data/rows';
import type { Repository } from '@/data/repository';

/** Default rest in seconds as a workout reads it (the settings row), or `fallback` when none is saved or it is out of the stepper's range. */
export function workoutRest(repo: Repository | null | undefined, fallback: number): number {
  try {
    const v = Number(repo?.list('settings').sort(compareRows).at(-1)?.data.rest_seconds);
    return Number.isFinite(v) && v >= 30 && v <= 300 ? v : fallback;
  } catch { return fallback; }
}
/** Saves the default rest where a workout reads it, keeping the row's other settings. */
export function saveWorkoutRest(repo: Repository, seconds: number) {
  const row = repo.list('settings').sort(compareRows).at(-1);
  repo.save('settings', { ...row?.data, rest_seconds: seconds }, row?.id);
}
