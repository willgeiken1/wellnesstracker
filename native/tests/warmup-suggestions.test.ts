import { WorkoutStore } from '../src/data/workout/store';
import { checkSet, loggerView } from '../src/features/workout/logger/model';
import { DEFAULT_PREFS, SETTINGS_PREFS_KEY, withPref } from '../src/features/settings/prefs';
import { startTraining } from '../src/features/workout/start-workout';
import { warmRamp } from '../src/features/workout/warmups';
import { memoryRepository } from './workout-repository';

/** Made-up sample: last week's squat at 225 × 5 for three sets, and a template with squat then bench. */
function sample(prefs?: (p: typeof DEFAULT_PREFS) => typeof DEFAULT_PREFS, superset = false) {
  const repo = memoryRepository();
  if (prefs) repo.localSave(SETTINGS_PREFS_KEY, prefs(DEFAULT_PREFS));
  const store = new WorkoutStore(repo);
  const past = store.start(undefined, Date.now() - 7 * 86_400_000);
  const old = store.addExercise(past.id, 'Squat', 3);
  for (const i of [0, 1, 2]) { store.editDraft(old.id, i, { weight: '225', reps: '5' }); store.toggleDone(old.id, i); }
  store.finish(past.id, { startedAt: Date.now() - 7 * 86_400_000, finishedAt: Date.now() - 7 * 86_400_000 + 3_600_000, notes: '' });
  const group = superset ? 'a' : null;
  const routine = store.saveTemplate('Legs', [
    { exercise: 'Squat', target_sets: 3, target_reps: 5, superset_group: group },
    { exercise: 'Bench Press', target_sets: 3, target_reps: 5, superset_group: group },
  ]);
  return { repo, store, routine };
}
const start = (repo: ReturnType<typeof memoryRepository>, id: string) => startTraining(repo, id, () => {})!;

describe('warm-up suggestions', () => {
  test('the ramp follows the mockup: shares of the top set, rounded, never under the bar', () => {
    expect(warmRamp(2, 225, 'lb', 45).map(r => [r.weight, r.reps])).toEqual([[115, 8], [170, 3]]);
    expect(warmRamp(4, 100, 'kg', 20).map(r => [r.weight, r.reps])).toEqual([[40, 8], [55, 5], [70, 3], [85, 1]]);
    expect(warmRamp(1, 50, 'lb', 45)[0].weight).toBe(45);
  });
  test('a workout from a template opens with the set number of warm-ups before the first exercise, ramping to its top set', () => {
    const plain = sample(p => withPref(p, 'work.warm', false));
    const without = loggerView(plain.store, start(plain.repo, plain.routine.id)).exercises[0];
    expect(without.sets.some(s => s.warm)).toBe(false);

    const { repo, store, routine } = sample();
    const session = start(repo, routine.id);
    const [squat, bench] = loggerView(store, session).exercises;
    expect(squat.sets.map(s => s.warm)).toEqual([true, true, false, false, false]);
    expect(bench.sets.some(s => s.warm)).toBe(false);
    // The working sets keep last time's hints, as they would without the warm-ups in front.
    const work = squat.sets.filter(s => !s.warm);
    expect(work.map(s => [s.weightHint, s.repsHint])).toEqual(without.sets.map(s => [s.weightHint, s.repsHint]));
    const ramp = warmRamp(2, Number(work[0].weightHint), 'lb', 45);
    expect(squat.sets.slice(0, 2).map(s => [s.weightHint, s.repsHint])).toEqual(ramp.map(r => [String(r.weight), String(r.reps)]));
    expect(squat.total).toBe(3);
    // Checking a blank warm-up off logs the suggested numbers as a warm-up.
    expect(checkSet(store, squat, squat.sets[0])).toBe('done');
    const logged = store.sets(squat.entry.id)[0];
    expect(Number(logged.data.reps)).toBe(8);
    expect(store.setTag(squat.entry.id, logged)).toBe('warmup');
    expect(loggerView(store, session).exercises[0].done).toBe(0);
  });
  test('the count comes from Settings, and nothing is added for an empty workout or a first exercise in a superset', () => {
    const three = sample(p => withPref(p, 'work.warmN', 3));
    expect(loggerView(three.store, start(three.repo, three.routine.id)).exercises[0].sets.filter(s => s.warm)).toHaveLength(3);

    const empty = sample();
    const s = start(empty.repo, '');
    expect(empty.store.entries(s.id)).toHaveLength(0);

    const grouped = sample(undefined, true);
    const view = loggerView(grouped.store, start(grouped.repo, grouped.routine.id));
    expect(view.exercises.flatMap(e => e.sets).some(x => x.warm)).toBe(false);
  });
});
