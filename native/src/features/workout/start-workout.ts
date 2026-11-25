import type { Repository } from '@/data/repository';
import { WorkoutStore } from '@/data/workout/store';
import { t } from '@/i18n/en';
import { PlanStore } from '../plans/store';
import { actionSheet } from './action-sheet';
import { trainingNav } from './nav';
import { tr } from './tr';

/**
 * Start a workout from Training: a plan day (counted toward the rotation), another template, or an empty one.
 * While another workout is going, it offers to resume that one instead of starting a second.
 */
export function startTraining(repo: Repository, routineId?: string, go: (sessionId: string) => void = () => trainingNav.logger()) {
  const workout = new WorkoutStore(repo), live = workout.active();
  if (live) {
    const name = String(live.data.name ?? '') || t('workoutName');
    actionSheet({ title: tr('trainingInProgressTitle', { name }), message: t('trainingInProgressBody'),
      actions: [{ label: tr('trainingResumeName', { name }), run: () => go(live.id) }] });
    return null;
  }
  const plans = new PlanStore(repo);
  const session = routineId && plans.read().days.some(d => d.routineId === routineId) ? plans.startDay(routineId) : workout.start(routineId);
  go(session.id);
  return session;
}

/** Start a finished workout again: from its template when it had one, otherwise with the same exercises and set counts. */
export function repeatSession(repo: Repository, sessionId: string) {
  const w = new WorkoutStore(repo), last = repo.get('sessions', sessionId);
  if (!last) return startTraining(repo);
  const routine = last.data.routine_id ? String(last.data.routine_id) : undefined;
  if (routine && repo.get('routines', routine)?.deleted_at === null) return startTraining(repo, routine);
  const s = startTraining(repo, undefined, () => {});
  if (s) {
    for (const e of w.entries(sessionId)) w.addExercise(s.id, String(e.data.exercise), w.drafts(e.id).length || 3);
    trainingNav.logger();
  }
  return s;
}
