import { memoryRepository } from './workout-repository';
import { WorkoutStore } from '../src/data/workout/store';
import { deleteDateRange } from '../src/features/settings/delete-range';
import { localDay } from '../src/core/workout/rules';

// Made-up workouts only.
const DAY = 86_400_000, T0 = new Date(2026, 9, 5, 9).getTime();
function workout(store: WorkoutStore, at: number, weight: string) {
  const s = store.start(undefined, at), e = store.addExercise(s.id, 'Squat', 1);
  store.editDraft(e.id, 0, { weight, reps: '5' }); store.toggleDone(e.id, 0);
  store.finish(s.id, { startedAt: at, finishedAt: at + 3_600_000, notes: '' });
  return s;
}

test('deleting a date range works the records out again from the workouts left', () => {
  const repo = memoryRepository(), store = new WorkoutStore(repo);
  const first = workout(store, T0, '100');
  workout(store, T0 + 7 * DAY, '80');
  const later = workout(store, T0 + 14 * DAY, '90');
  expect(store.milestones().some(m => m.sessionId === later.id)).toBe(false);
  const day = localDay(new Date(T0));
  expect(String(repo.get('sessions', first.id)!.data.day)).toBe(day);
  deleteDateRange(repo, day, day, ['workouts']);
  expect(store.milestones().some(m => m.sessionId === first.id)).toBe(false);
  expect(store.milestones().some(m => m.sessionId === later.id)).toBe(true);
});
