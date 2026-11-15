import { liveReads } from '../src/data/read-cache';
import type { Repository } from '../src/data/repository';
import { WorkoutStore } from '../src/data/workout/store';
import { memoryRepository } from './workout-repository';

const DAY = 86400000, start = Date.UTC(2026, 0, 5, 12);
const lifts = ['Bench Press', 'Squat', 'Deadlift', 'Overhead Press', 'Barbell Row', 'Pull Up'];

/** Made-up history written straight into the tables, the way sync or the importer fills them. */
function seeded(sessions: number) {
  const repo = memoryRepository();
  for (let s = 0; s < sessions; s++) {
    const at = start + s * DAY;
    const session = repo.save('sessions', { origin: 'empty', routine_id: null, name: 'Workout', day: new Date(at).toISOString().slice(0, 10), started_at: at, finished_at: at + 3600000, duration_ms: 3600000, notes: null });
    lifts.forEach((exercise, position) => {
      const entry = repo.save('entries', { session_id: session.id, exercise, position });
      const drafts = [];
      for (let k = 0; k < 4; k++) {
        const weight = 40 + position * 10 + ((s * 7 + k * 3) % 11) * 2.5, reps = 5 + ((s + k) % 4);
        const set = repo.save('sets', { entry_id: entry.id, position: k, weight_kg: weight, reps, entered_unit: 'kg', entered_value: weight });
        drafts.push({ weight: String(weight), reps: String(reps), setId: set.id, warmup: k === 0 && s % 3 === 0 });
      }
      repo.localSave(`draft:${entry.id}`, drafts);
      repo.localSave(`entryUnit:${entry.id}`, 'kg');
    });
  }
  return repo;
}
/** What every workout's summary says its records are: the definition the stored milestones must match. */
const fromSummaries = (store: WorkoutStore) => store.history().flatMap(s =>
  store.summary(s.id).prs.map(pr => ({ sessionId: s.id, exercise: pr.exercise, weight: pr.bestWeight, e1rm: pr.bestE1rm })));

test('stored milestones match each workout summary, with warm-ups, skipped lifts and workouts that started together', () => {
  const repo = seeded(24);
  const store = new WorkoutStore(repo);
  const [newest, second] = store.history();
  // Two workouts that started at the same moment are not "earlier" than each other.
  repo.save('sessions', { ...second.data, started_at: newest.data.started_at }, second.id);
  repo.localSave(`skipped:${store.entries(store.history()[5].id)[1].id}`, true);
  store.recompute();
  const expected = fromSummaries(store);
  expect(expected.length).toBeGreaterThan(10);
  expect(store.milestones()).toEqual(expected);
});

test('weekly totals still count only working sets of finished workouts', () => {
  const store = new WorkoutStore(seeded(3));
  store.recompute();
  const week = store.weekly(new Date(start));
  expect(Object.keys(week).length).toBeGreaterThan(0);
  expect(Object.values(week).every(n => Number.isFinite(n) && n > 0)).toBe(true);
});

test('finishing a workout stays quick with a year of history behind it', () => {
  const repo = seeded(300);
  const store = new WorkoutStore(liveReads(repo as Repository & { getRevision(): number }));
  let at = Date.now();
  store.recompute();
  // Before the one-pass rewrite this took minutes on a desktop at 300 workouts.
  expect(Date.now() - at).toBeLessThan(4000);
  at = Date.now();
  store.trainingHistory();
  store.summary(store.history()[0].id);
  expect(Date.now() - at).toBeLessThan(2000);
  expect(store.milestones().length).toBeGreaterThan(0);
});

test('removing a set from a live workout leaves the saved weekly totals alone', () => {
  const repo = seeded(2);
  const store = new WorkoutStore(repo);
  store.recompute();
  const before = JSON.stringify(repo.localGet('weekly'));
  const live = store.start();
  const entry = store.addExercise(live.id, 'Squat', 2);
  store.editDraft(entry.id, 0, { weight: '100', reps: '5' });
  store.toggleDone(entry.id, 0);
  repo.localSave('weekly', { marker: { x: 1 } });
  store.removeSet(entry.id, 0);
  expect(repo.localGet('weekly')).toEqual({ marker: { x: 1 } });
  expect(before).not.toBe('');
});
