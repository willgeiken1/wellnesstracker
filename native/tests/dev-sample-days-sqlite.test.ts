import { randomUUID } from 'node:crypto';
import { localDatabase } from './server/sqlite';
import { Repository } from '../src/data/repository';
import { DEVICE_A } from '../fixtures/sync';
import { WorkoutStore } from '../src/data/workout/store';
import { createSampleDays, SAMPLE_DAYS } from '../src/features/workout/devSampleDays';
jest.mock('expo-sqlite', () => require('./server/expo-sqlite-stub'));

// On the phone's real database the first version took minutes: it logged each set into an already finished
// workout, and every such edit recomputes all history. Workouts are now logged live and finished once.
test('fills the real local database quickly, leaving no workout open and no rest timer running', async () => {
  const { db } = await localDatabase();
  const repo = new Repository(db, 'demo', DEVICE_A, randomUUID), recompute = jest.spyOn(WorkoutStore.prototype, 'recompute');
  expect(createSampleDays(new WorkoutStore(repo), { isDev: true, demo: true, signedIn: false }, new Date(2026, 4, 12, 15).getTime())).toBe(true);
  const store = new WorkoutStore(repo);
  expect(store.trainingHistory().length).toBe(9);
  expect(new Set(repo.list('food_entries').map(row => String(row.data.day))).size).toBe(SAMPLE_DAYS);
  expect(store.active()).toBeFalsy();
  expect(store.timer()).toBeFalsy();
  // One recompute per finished workout, not one per set.
  expect(recompute.mock.calls.length).toBeLessThanOrEqual(12);
  recompute.mockRestore();
}, 60000);
