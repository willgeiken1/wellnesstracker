import { WorkoutStore } from '../src/data/workout/store';
import { buildCsvs } from '../src/features/progress/export';
import { emptyProgress } from '../src/features/progress/model';
import { DEFAULT_PREFS, SETTINGS_PREFS_KEY, withPref } from '../src/features/settings/prefs';
import { rpeKey } from '../src/features/workout/logger/model';
import { memoryRepository } from './workout-repository';

jest.mock('expo-file-system', () => ({ Directory: jest.fn(), File: jest.fn(), Paths: {} }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'id' }));

// Made-up values only.
function liveSet(repo = memoryRepository()) {
  const store = new WorkoutStore(repo), session = store.start();
  const entry = store.addExercise(session.id, 'Bench Press', 2);
  store.editDraft(entry.id, 0, { weight: '100', reps: '8' });
  return { repo, store, session, entry };
}

test('finishing a set starts the rest timer by default', () => {
  const { store, entry } = liveSet();
  store.toggleDone(entry.id, 0);
  expect(store.timer()).toBeTruthy();
});

test('with Start automatically off, finishing a set starts no rest timer', () => {
  const repo = memoryRepository();
  repo.localSave(SETTINGS_PREFS_KEY, withPref(DEFAULT_PREFS, 'work.auto', false));
  const { store, entry } = liveSet(repo);
  store.toggleDone(entry.id, 0);
  expect(store.timer()).toBeFalsy();
});

test('the workouts CSV carries the RPE the logger keeps beside each set', () => {
  const { repo, store, session, entry } = liveSet();
  store.toggleDone(entry.id, 0);
  repo.localSave(rpeKey(entry.id, 0), 8);
  store.finish(session.id, { startedAt: Date.now() - 60_000, finishedAt: Date.now(), notes: '' });
  const day = String(repo.get('sessions', session.id)!.data.day);
  const csv = buildCsvs(repo, emptyProgress(day, 'kg'), ['work'], 'all')[0].csv.trimEnd().split('\r\n');
  expect(csv).toHaveLength(2);
  expect(csv[1].split(',')[7]).toBe('8');
});
