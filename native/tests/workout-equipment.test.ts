import { exerciseLibrary } from '../src/core/workout/library';
import { filterExercises, validCustomExercise } from '../src/core/workout/exercise-rules';
import { WorkoutStore } from '../src/data/workout/store';
import { memoryRepository } from './workout-repository';
import { plates, step, suggestion } from '../src/core/workout/rules';

test.each([
  ['lb', 155, 35, [45, 10, 5], [45, 10, 5], 0],
  ['kg', 55, 15, [20, 5], [20], 0],
  ['lb', 60, 30, [10], [10], 5],
  ['kg', 10, 15, [5], [], -2.5],
  ['kg', 12, 0, [4, 3], [3, 3], 0],
  ['lb', 45, 45, [], [], 0],
] as const)('plate math %s load %s bar %s', (unit, weight, bar, sizes, expected, remainder) => {
  expect(plates(weight, unit, bar, [...sizes])).toEqual({ bar, plates: [...expected], remainder });
});
test.each(['lb', 'kg'] as const)('Step defaults and override affect suggestions in %s', unit => {
  const expected = unit === 'lb' ? 10 : 5;
  expect(step('machine', unit)).toBe(expected);
  expect(suggestion([{ weight: 100, reps: 8, done: true }], 'machine', unit).weight).toBe(100 + expected);
  expect(suggestion([{ weight: 100, reps: 8, done: true }], 'barbell', unit, 8, 7).weight).toBe(107);
});
test('custom exercise requires known main muscle and explicit equipment; helpers optional', () => {
  expect(validCustomExercise({ name: 'Fixture lift', main: 'quads', helpers: [], equipment: 'other' })).toBe(true);
  for (const patch of [{ main: '' }, { equipment: '' }, { name: ' ' }, { main: 'unknown' }])
    expect(validCustomExercise({ name: 'Fixture lift', main: 'quads', helpers: [], equipment: 'barbell', ...patch })).toBe(false);
});
test('filters combine with typo search and recent-first ordering', () => {
  const rows = filterExercises(exerciseLibrary, 'bench pres', 'chest', 'barbell', ['Incline Bench Press']);
  expect(rows[0].name).toBe('Incline Bench Press');
  expect(rows.some(e => e.name === 'Bench Press')).toBe(true);
  expect(rows.every(e => (e.main === 'chest' || e.helpers.includes('chest')) && e.equipment === 'barbell')).toBe(true);
  expect(filterExercises(exerciseLibrary, 'bnch press').some(e => e.name === 'Bench Press')).toBe(true);
});
test('picker matches the PWA transposed-letter cable query', () => {
  expect(filterExercises(exerciseLibrary, 'cabel').some(e => e.name === 'Cable Fly')).toBe(true);
});
test.each(['bodyweight', 'other'] as const)('%s ignores a saved Step', equipment => {
  expect(step(equipment, 'lb', 10)).toBe(0);
  expect(step(equipment, 'kg', 5)).toBe(0);
  expect(suggestion([{ weight: 0, reps: 8, done: true }], equipment, 'lb', 8, 10))
    .toMatchObject({ weight: 0, jump: false });
});
test.each([
  ['barbell', 'lb', 5],
  ['barbell', 'kg', 2.5],
  ['dumbbell', 'lb', 5],
  ['dumbbell', 'kg', 2.5],
  ['machine', 'lb', 10],
  ['machine', 'kg', 5],
  ['cable', 'lb', 10],
  ['cable', 'kg', 5],
] as const)('%s defaults to %s Step %s without a saved Step', (equipment, unit, expected) => {
  const preferences = new WorkoutStore(memoryRepository()).preferences();
  const saved = preferences.increment('Fixture lift', unit);
  expect(saved).toBeUndefined();
  expect(step(equipment, unit, saved)).toBe(expected);
});
test.each(['Leg Extension', 'Bench Press'])('%s honours a saved Step in store suggestions', name => {
  const store = new WorkoutStore(memoryRepository());
  const start = Date.now() - 120000, prior = store.start(undefined, start);
  const entry = store.addExercise(prior.id, name, 1);
  store.editDraft(entry.id, 0, { weight: '100', reps: '8' });
  store.toggleDone(entry.id, 0);
  store.finish(prior.id, { startedAt: start, finishedAt: start + 60000, notes: '' });
  store.preferences().saveMachine(name, { text: '', step: 7 });
  expect(store.preferences().increment(name, 'lb')).toBe(7);
  expect(store.suggestion(store.addExercise(store.start().id, name)))
    .toMatchObject({ weight: 107, jump: true });
});
