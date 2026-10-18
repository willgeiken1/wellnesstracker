import { exerciseLibrary, exerciseFor } from '../src/core/workout/library';
import { displayWeight, suggestion, step, plates, detectPR, attribute, localDay, weekOf, validateSet, validateDate, cardKey, shouldShowCard, keypad } from '../src/core/workout/rules';
const done = (weight: number, reps = 8) => ({
  weight,
  reps,
  done: true
});
describe('equipment progression and keypad', () => {
  test.each(['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other'] as const)('%s, both units and one miss', equipment => {
    for (const unit of ['lb', 'kg'] as const) {
      const jump = equipment === 'bodyweight' || equipment === 'other' ? 0 : equipment === 'machine' || equipment === 'cable' ? unit === 'lb' ? 10 : 5 : unit === 'lb' ? 5 : 2.5;
      expect(step(equipment, unit)).toBe(jump);
      expect(suggestion([done(100), done(100)], equipment, unit, 8).weight).toBe(100 + jump);
      expect(suggestion([done(100), done(100, 7)], equipment, unit, 8).weight).toBe(100);
    }
  });
  test('no history, excludes warmups and undone; uses each last rep target', () => {
    expect(suggestion([], 'barbell', 'lb').weight).toBeNull();
    expect(suggestion([done(100), {
      ...done(200, 1),
      warmup: true
    }, {
      ...done(300, 1),
      done: false
    }], 'barbell', 'lb', 8).weight).toBe(105);
    expect(suggestion([done(100, 6), done(100, 8)], 'barbell', 'lb').weight).toBe(105);
  });
  test('jump card key persists across sessions; unchanged weight never explains', () => {
    const s = suggestion([done(185), done(185)], 'barbell', 'lb', 8);
    expect(shouldShowCard('Bench', s, 'lb', [])).toBe(true);
    expect(shouldShowCard('Bench', s, 'lb', [cardKey('Bench', 190, 'lb')])).toBe(false);
    expect(shouldShowCard('Bench', {
      ...s,
      jump: false
    }, 'lb', [])).toBe(false);
  });
  test('keypad blank stays blank, one decimal, rep decimal rejected', () => {
    expect(keypad('', 'backspace', false)).toBe('');
    expect(keypad('', '.', true)).toBe('0.');
    expect(keypad('1.2', '.', true)).toBe('1.2');
    expect(keypad('8', '.', false)).toBe('8');
  });
  test('standard bars, per-side plates and impossible residual', () => {
    expect(plates(190, 'lb')).toEqual({
      bar: 45,
      plates: [45, 25, 2.5],
      remainder: 0
    });
    expect(plates(100, 'kg')).toEqual({
      bar: 20,
      plates: [25, 15],
      remainder: 0
    });
    expect(plates(21, 'kg').remainder).toBe(.5);
    expect(plates(10, 'kg').remainder).toBeLessThan(0);
  });
});
describe('records, attribution and validation', () => {
  test('weight and Epley records, ties and first ever excluded', () => {
    expect(detectPR([done(190)], [done(185)])).toEqual({
      weight: true,
      e1rm: true,
      bestWeight: 190,
      bestE1rm: 190 * (1 + 8 / 30)
    });
    expect(detectPR([done(185, 10)], [done(190, 5)]).e1rm).toBe(true);
    expect(detectPR([done(185)], [done(185)]).weight).toBe(false);
    expect(detectPR([done(190)], []).weight).toBe(false);
    expect(detectPR([{
      ...done(200),
      done: false
    }, {
      ...done(300),
      warmup: true
    }], [done(185)]).weight).toBe(false);
  });
  test('main 1, helper .5, excludes undone and warmup', () => {
    expect(attribute([{
      main: 'chest',
      helpers: ['triceps'],
      sets: [done(100), done(100), {
        ...done(100),
        done: false
      }, {
        ...done(100),
        warmup: true
      }]
    }])).toEqual({
      chest: 2,
      triceps: 1
    });
  });
  test('local Monday week across year boundary', () => {
    expect(weekOf(new Date(2027, 0, 3, 23, 59))).toBe('2026-12-28');
    expect(weekOf(new Date(2027, 0, 4))).toBe('2027-01-04');
    expect(localDay(new Date(2026, 9, 18))).toBe('2026-10-18');
  });
  test('hard bounds and soft warnings', () => {
    expect(validateSet('', '8', 'kg').valid).toBe(false);
    expect(validateSet('0', '0', 'kg').valid).toBe(true);
    expect(validateSet('1000', '100', 'kg').valid).toBe(true);
    expect(validateSet('1001', '8', 'kg').valid).toBe(false);
    expect(validateSet('50', '101', 'kg').valid).toBe(false);
    expect(validateSet('50', '8.5', 'kg').valid).toBe(false);
    expect(validateSet('50', '51', 'kg').warning).toBe('highReps');
    expect(validateSet('100', '8', 'kg', 40).warning).toBe('weightJump');
    expect(validateDate(Date.now() + 10000)).toBe(false);
  });
});
test('display rounds half lb/quarter kg without changing canonical weight', () => {
  expect(displayWeight(80, 'lb')).toBe(176.5);
  expect(displayWeight(80.12, 'kg')).toBe(80);
  expect(displayWeight(80.13, 'kg')).toBe(80.25);
});

test.each([
  ['Close-Grip Bench Press', 'barbell'], ['Bench Press', 'barbell'],
  ['Overhead Press', 'barbell'], ['Cable Fly', 'cable'],
  ['Incline Dumbbell Press', 'dumbbell'], ['Smith Machine Squat', 'machine'],
  ['EZ Bar Preacher Curl', 'barbell'], ['Bodyweight Curl', 'bodyweight'],
  ['Cable Close Grip Seated Row', 'cable'], ['Dumbbell Row', 'dumbbell'],
  ['Goblet Squat', 'dumbbell'], ['Inverted Row', 'bodyweight'],
])('bundled %s resolves to %s', (name, equipment) => {
  expect(exerciseFor(name).equipment).toBe(equipment);
});
test('bundled equipment coverage stays below 40 percent other; custom names stay other', () => {
  const other = exerciseLibrary.filter(e => e.equipment === 'other');
  expect(other.length / exerciseLibrary.length).toBeLessThan(.4);
  expect(exerciseFor('Custom Bench Press from fixture').equipment).toBe('other');
});


test.each([
  ['1000', '1', true, 'kg'], ['2204.6', '3', true, 'lb'],
  ['100', '1', false, 'lb'], ['1.2', '3', true, 'lb'],
  ['1.25', '3', true, 'kg'],
] as const)('keypad rejects range/precision overflow: %s + %s (%s, %s)', (value, key, decimal, unit) => {
  expect(keypad(value, key, decimal, unit)).toBe(value);
});
test('keypad accepts boundary values and kg quarter plates', () => {
  expect(keypad('100', '0', true, 'kg')).toBe('1000');
  expect(keypad('2204.', '6', true, 'lb')).toBe('2204.6');
  expect(keypad('10', '0', false, 'lb')).toBe('100');
  expect(keypad('1.2', '5', true, 'kg')).toBe('1.25');
});
test.each([['lb', 2204.7], ['kg', 1000.01], ['lb', 135135], ['kg', Infinity]] as const)('no plate calculation above maximum in %s', (unit, weight) => {
  expect(plates(weight, unit).plates).toEqual([]);
});


test('a main muscle repeated in helpers counts only one set', () => {
  expect(attribute([{ main: 'chest', helpers: ['chest'], sets: [done(100)] }])).toEqual({ chest: 1 });
});
