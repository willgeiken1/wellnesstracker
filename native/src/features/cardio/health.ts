import { localDay, paused, weekOf, type Machine } from '../../core/cardio/rules';
import type { Row } from '../../data/rows';
import type { HealthWorkout, WorkoutKind } from '../health/source';

/** Kinds that count toward the weekly cardio goal. Strength is logged in Insight itself, and yoga and
 * unnamed workouts are not cardio. */
export const CARDIO_KINDS: ReadonlySet<WorkoutKind> = new Set(['run', 'walk', 'hike', 'cycle', 'row', 'elliptical', 'stairs', 'swim', 'hiit', 'mixed']);
// The Health kinds a watch records for the same session on an Insight machine.
const SAME: Record<Machine, WorkoutKind[]> = {
  treadmill: ['run', 'walk', 'hike'], stair: ['stairs'], elliptical: ['elliptical'], bike: ['cycle'], rower: ['row'],
};
/** `counted`: adds to the weekly ring. `logged`: an Insight session the same day looks like the same workout,
 * so it is counted once, from Insight. `notCardio`: strength, yoga or unnamed. `paused`: in a training pause. */
export type HealthWorkoutStatus = 'counted' | 'logged' | 'notCardio' | 'paused';
export type WeekWorkout = HealthWorkout & { day: string; status: HealthWorkoutStatus };

/** This week's Apple Health workouts (Monday to Sunday, local days), each with whether it counts toward the
 * cardio ring, and the minutes that do. Nothing here is saved: the result is for the screen only. */
export function healthWeek(workouts: HealthWorkout[], sessions: Row[], pauses: Row[], today: string): { minutes: number; workouts: WeekWorkout[] } {
  const { start, end } = weekOf(today);
  const live = sessions.filter(r => r.deleted_at === null);
  const week = workouts.map(w => ({ ...w, day: localDay(w.start.getTime()) })).filter(w => w.day >= start && w.day < end)
    .map((w): WeekWorkout => {
      const status: HealthWorkoutStatus = !CARDIO_KINDS.has(w.kind) ? 'notCardio'
        : paused(w.day, pauses) ? 'paused'
        : live.some(r => String(r.data.day) === w.day && (SAME[r.data.kind as Machine] ?? []).includes(w.kind)) ? 'logged'
        : 'counted';
      return { ...w, status };
    })
    .sort((a, b) => b.start.getTime() - a.start.getTime());
  return { minutes: week.filter(w => w.status === 'counted').reduce((sum, w) => sum + w.minutes, 0), workouts: week };
}
