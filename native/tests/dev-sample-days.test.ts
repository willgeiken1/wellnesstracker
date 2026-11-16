import { WorkoutStore } from '../src/data/workout/store';
import { createSampleDays, SAMPLE_DAYS } from '../src/features/workout/devSampleDays';
import { dailyWeights } from '../src/features/body/model';
import { memoryRepository } from './workout-repository';

const NOW = new Date(2026, 4, 12, 15, 0, 0).getTime();
const dev = { isDev: true, demo: true, signedIn: false };
const rows = (repo: ReturnType<typeof memoryRepository>) => (['food_entries', 'sessions', 'weigh_ins', 'routines', 'food_targets'] as const).flatMap(table => repo.list(table));

test('fills the example account with two made-up weeks and records every row as a sample', () => {
  const repo = memoryRepository(), store = new WorkoutStore(repo);
  expect(createSampleDays(store, dev, NOW)).toBe(true);
  const days = new Set(repo.list('food_entries').map(row => String(row.data.day)));
  expect(days.size).toBe(SAMPLE_DAYS);
  expect(new WorkoutStore(repo).trainingHistory().length).toBe(9);
  expect(dailyWeights(repo.list('weigh_ins')).length).toBe(SAMPLE_DAYS);
  expect(repo.list('routines').map(row => row.data.name)).toEqual(expect.arrayContaining(['Push day', 'Pull day', 'Leg day']));
  expect(new WorkoutStore(repo).active()).toBeFalsy();
  // Nothing made here can be carried into a real account: every row is on the samples list.
  const samples = new Set(repo.localGet<string[]>('demoSamples'));
  for (const row of rows(repo)) expect(samples.has(row.id)).toBe(true);
});

test('runs once', () => {
  const repo = memoryRepository(), store = new WorkoutStore(repo);
  createSampleDays(store, dev, NOW);
  const before = rows(repo).length;
  expect(createSampleDays(new WorkoutStore(repo), dev, NOW)).toBe(true);
  expect(rows(repo).length).toBe(before);
});

test.each([
  ['a release build', { ...dev, isDev: false }],
  ['outside the example account', { ...dev, demo: false }],
  ['signed in', { ...dev, signedIn: true }],
])('does nothing in %s', (_name, context) => {
  const repo = memoryRepository();
  expect(createSampleDays(new WorkoutStore(repo), context, NOW)).toBe(false);
  expect(rows(repo)).toHaveLength(0);
});

test('does nothing when the build is not a development build, whatever it is told', () => {
  const original = __DEV__, repo = memoryRepository();
  try {
    Object.defineProperty(globalThis, '__DEV__', { value: false, configurable: true, writable: true });
    expect(createSampleDays(new WorkoutStore(repo), dev, NOW)).toBe(false);
    expect(rows(repo)).toHaveLength(0);
  } finally { Object.defineProperty(globalThis, '__DEV__', { value: original, configurable: true, writable: true }); }
});
