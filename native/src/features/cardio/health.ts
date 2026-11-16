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
/** `counted`: adds to the weekly ring. `logged`: it is the same workout as one Insight session that day (same
 * machine, about as long), so it is counted once, from Insight. `notCardio`: strength, yoga or unnamed. `paused`: in a training pause. */
export type HealthWorkoutStatus = 'counted' | 'logged' | 'notCardio' | 'paused';
export type WeekWorkout = HealthWorkout & { day: string; status: HealthWorkoutStatus };

/** This week's Apple Health workouts (Monday to Sunday, local days), each with whether it counts toward the
 * cardio ring, and the minutes that do. Nothing here is saved: the result is for the screen only. */
export function healthWeek(workouts: HealthWorkout[], sessions: Row[], pauses: Row[], today: string): { minutes: number; workouts: WeekWorkout[] } {
  const { start, end } = weekOf(today);
  const dated = workouts.map(w => ({ ...w, day: localDay(w.start.getTime()) })).filter(w => w.day >= start && w.day < end);
  const logged = sameSessions(dated, sessions.filter(r => r.deleted_at === null));
  const week = dated
    .map((w): WeekWorkout => {
      const status: HealthWorkoutStatus = !CARDIO_KINDS.has(w.kind) ? 'notCardio'
        : paused(w.day, pauses) ? 'paused'
        : logged.has(w.id) ? 'logged'
        : 'counted';
      return { ...w, status };
    })
    .sort((a, b) => b.start.getTime() - a.start.getTime());
  return { minutes: week.filter(w => w.status === 'counted').reduce((sum, w) => sum + w.minutes, 0), workouts: week };
}

/** How far apart two recordings of one session may be, in minutes: a watch starts and stops a little apart from
 * Insight's timer. Anything further apart is a separate workout and counts on its own. */
export const sameSessionSlack = (minutes: number) => Math.max(5, minutes * 0.25);

/** The Health workouts that are the same session as an Insight one: same day, a matching machine and about as long.
 * Each Insight session stands for at most one Health workout and each Health workout for at most one session,
 * closest lengths paired first, so a short treadmill session never hides a separate walk or two workouts. */
function sameSessions(workouts: readonly (HealthWorkout & { day: string })[], sessions: readonly Row[]): Set<string> {
  const pairs: { workout: string; session: string; gap: number }[] = [];
  for (const session of sessions) {
    const kinds = SAME[session.data.kind as Machine] ?? [];
    const minutes = Number(session.data.duration_ms) / 60_000;
    if (!kinds.length || !Number.isFinite(minutes) || minutes <= 0) continue;
    for (const w of workouts) {
      if (w.day !== String(session.data.day) || !kinds.includes(w.kind)) continue;
      const gap = Math.abs(w.minutes - minutes);
      if (gap <= sameSessionSlack(minutes)) pairs.push({ workout: w.id, session: session.id, gap });
    }
  }
  pairs.sort((a, b) => a.gap - b.gap);
  const taken = new Set<string>(), matched = new Set<string>();
  for (const pair of pairs) {
    if (taken.has(pair.session) || matched.has(pair.workout)) continue;
    taken.add(pair.session); matched.add(pair.workout);
  }
  return matched;
}
