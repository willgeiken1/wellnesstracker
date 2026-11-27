import type { Repository } from '@/data/repository';
import { WorkoutStore } from '@/data/workout/store';
import { t } from '@/i18n/en';
import { loadSettingsPrefs } from '../settings/prefs-model';
import { PlanStore } from '../plans/store';
import { actionSheet } from './action-sheet';
import { trainingNav } from './nav';
import { tr } from './tr';
import { warmCount } from './warmups';

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
  if (session.data.origin === 'template') suggestWarmups(repo, workout, session.id);
  go(session.id);
  return session;
}

/**
 * With Suggest warm-up sets on (Settings › Workout), a workout from a template opens with its warm-ups in front of the
 * first exercise, as on the mockup. A first exercise in a superset is left as it is, since its rounds go set by set.
 */
export function suggestWarmups(repo: Repository, workout: WorkoutStore, sessionId: string) {
  const w = loadSettingsPrefs(repo).work;
  if (!w.warm) return;
  const first = workout.entries(sessionId).find(e => !workout.skipped(e.id));
  if (!first || workout.supersetGroup(first)) return;
  workout.prependWarmups(first.id, warmCount(w.warmN));
}

/** Start a finished workout again: from its template when it had one, otherwise with the same exercises and set counts. */
export function repeatSession(repo: Repository, sessionId: string) {
  const w = new WorkoutStore(repo), last = repo.get('sessions', sessionId);
  if (!last) return startTraining(repo);
  const routine = last.data.routine_id ? String(last.data.routine_id) : undefined;
  // With another workout going, the sheet offers to resume it, and Resume opens the logger.
  if (w.active()) return startTraining(repo);
  if (routine && repo.get('routines', routine)?.deleted_at === null) return startTraining(repo, routine);
  const s = startTraining(repo, undefined, () => {});
  if (s) {
    // Each exercise keeps its set count and which of its sets were warm-ups, so they don't come back as working sets.
    for (const e of w.entries(sessionId)) {
      const was = w.drafts(e.id), entry = w.addExercise(s.id, String(e.data.exercise), was.length || 3);
      was.forEach((d, i) => { if ((d.tag ?? (d.warmup ? 'warmup' : null)) === 'warmup') w.editDraft(entry.id, i, { tag: 'warmup' }); });
    }
    trainingNav.logger();
  }
  return s;
}
