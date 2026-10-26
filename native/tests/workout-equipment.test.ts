import { exerciseLibrary } from '../src/core/workout/library';
import { filterExercises, validCustomExercise } from '../src/core/workout/exercise-rules';
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
test('an explicit Step applies to a custom lift with Other equipment', () => {
  expect(suggestion([{ weight: 100, reps: 8, done: true }], 'other', 'lb', 8, 7).weight).toBe(107);
});
