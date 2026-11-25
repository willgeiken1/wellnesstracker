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
