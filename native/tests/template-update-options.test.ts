import { WorkoutStore } from '../src/data/workout/store';
import { templateFrom } from '../src/features/workout/screens/detail';
import { memoryRepository } from './workout-repository';

/** Made-up template: squat with an 8 to 12 rep range, then bench and rows as a superset. */
function sample() {
  const repo = memoryRepository(), store = new WorkoutStore(repo);
  const routine = store.saveTemplate('Full body', [
    { exercise: 'Squat', target_sets: 3, target_reps: 12, rep_min: 8, rep_max: 12 },
    { exercise: 'Bench Press', target_sets: 3, target_reps: 8, superset_group: 'a' },
    { exercise: 'Barbell Row', target_sets: 3, target_reps: 8, superset_group: 'a' },
  ]);
  const session = store.start(routine.id);
  const log = (entryId: string, n: number) => { for (let i = 0; i < n; i++) { store.editDraft(entryId, i, { weight: '100', reps: '8' }); store.toggleDone(entryId, i); } };
  return { store, routine, session, log };
}

describe('Update template keeps the template’s own options', () => {
  test('the rep range and the superset survive a set-count update', () => {
    const { store, routine, session, log } = sample();
    const [squat, bench, row] = store.entries(session.id);
    log(squat.id, 2); log(bench.id, 3); log(row.id, 3);
    store.saveTemplate('Full body', templateFrom(store, session.id, routine.id), routine.id);
    const saved = store.templateExercises(routine.id);
    expect(saved.map(e => [e.data.exercise, e.data.target_sets])).toEqual([['Squat', 2], ['Bench Press', 3], ['Barbell Row', 3]]);
    expect([saved[0].data.rep_min, saved[0].data.rep_max]).toEqual([8, 12]);
    expect(saved[1].data.superset_group).toBeTruthy();
    expect(saved[1].data.superset_group).toBe(saved[2].data.superset_group);
  });
  test('a superset with only one exercise logged is saved without the superset', () => {
    const { store, routine, session, log } = sample();
    const [squat, bench] = store.entries(session.id);
    log(squat.id, 3); log(bench.id, 3);
    const rows = templateFrom(store, session.id, routine.id);
    expect(rows.map(r => r.superset_group)).toEqual([null, null]);
    expect(() => store.saveTemplate('Full body', rows, routine.id)).not.toThrow();
  });
});
