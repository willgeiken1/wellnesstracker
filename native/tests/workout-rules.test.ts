import { exerciseLibrary, exerciseFor } from '../src/core/workout/library';
import { displayWeight, suggestion, step, plates, detectPR, setMetrics, attribute, localDay, weekOf, validateSet, validateDate, cardKey, shouldShowCard, keypad } from '../src/core/workout/rules';
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

describe('M2-02 logger rules', () => {
  const miss = (day: string, weight = 100) => ({ day, sets: [done(weight, 7)] });

  test.each([
    ['barbell', 'lb', undefined, 95, 85],
    ['dumbbell', 'kg', undefined, 47.5, 42.5],
    ['machine', 'lb', undefined, 95, 90],
    ['cable', 'kg', undefined, 47.5, 45],
    ['machine', 'lb', 15, 100, 90],
    ['cable', 'kg', 4, 50, 44],
  ] as const)('WK-07 two misses step back with %s %s step %s', (equipment, unit, stack, weight, expected) => {
    const sessions = [miss('2026-10-01', weight), miss('2026-10-03', weight)];
    const s = suggestion(sessions[1].sets, equipment, unit, 8, stack, { sessions });
    expect(s.weight).toBe(expected);
    expect(s.jump).toBe(false);
    expect(shouldShowCard('Fixture lift', s, unit, [])).toBe(false);
  });

  test('WK-07 a success breaks the miss streak; no target or working sets cannot miss', () => {
    const sessions = [miss('2026-10-01'), { day: '2026-10-03', sets: [done(100)] }, miss('2026-10-05')];
    expect(suggestion([done(100, 7)], 'barbell', 'lb', 8, undefined, { sessions }).weight).toBe(100);
    expect(suggestion([done(100, 7)], 'barbell', 'lb', undefined, undefined, { sessions: [sessions[0], sessions[2]] }).weight).toBe(105);
    expect(suggestion([], 'barbell', 'lb', 8, undefined, { sessions }).weight).toBeNull();
  });

  test('Pause excludes inclusive dates from misses without storing ranges', () => {
    const sessions = [miss('2026-10-01'), miss('2026-10-03'), miss('2026-10-05')];
    expect(suggestion([done(100, 7)], 'barbell', 'lb', 8, undefined, { sessions }).weight).toBe(90);
    const paused = [{ start: '2026-10-01', end: '2026-10-03' }];
    expect(suggestion([done(100, 7)], 'barbell', 'lb', 8, undefined, { sessions, paused }).weight).toBe(100);
    // An ignored paused date does not erase misses outside the pause.
    expect(suggestion([done(100, 7)], 'barbell', 'lb', 8, undefined, {
      sessions, paused: [{ start: '2026-10-03', end: '2026-10-03' }]
    }).weight).toBe(90);
  });

  test('ease-in sessions break the miss streak and cannot trigger step-back', () => {
    const sessions = [miss('2026-10-01'), { ...miss('2026-10-03'), easedIn: true }];
    expect(suggestion([done(100, 7)], 'barbell', 'lb', 8, undefined, { sessions }).weight).toBe(100);
    expect(suggestion([done(100, 7)], 'barbell', 'lb', 8, undefined, {
      sessions: [...sessions, miss('2026-10-05')]
    }).weight).toBe(100);
  });

  test.each([
    ['lb', '2026-10-07', 105], ['lb', '2026-10-08', 90],
    ['lb', '2026-10-15', 90], ['lb', '2026-10-21', 90],
    ['lb', '2026-10-22', 80], ['kg', '2026-10-08', 90],
    ['kg', '2026-10-22', 80], ['lb', '2026-12-01', 80],
  ] as const)('WK-32 gap ease-in %s on %s', (unit, today, weight) => {
    expect(suggestion([done(100)], 'barbell', unit, 8, undefined, {
      today, lastTrainingDay: '2026-10-01'
    })).toEqual({ weight, jump: weight === 105, previous: 100, target: 8, count: 1 });
  });

  test('WK-32 rounds equipment steps, avoids double reduction and resumes normal climb', () => {
    const context = { today: '2026-10-22', lastTrainingDay: '2026-10-01', sessions: [miss('2026-09-29'), miss('2026-10-01')] };
    expect(suggestion([done(100, 7)], 'machine', 'lb', 8, 15, context).weight).toBe(75);
    expect(suggestion([done(47.5)], 'dumbbell', 'kg', 8, undefined, context).weight).toBe(37.5);
    expect(suggestion([done(80)], 'barbell', 'lb', 8, undefined, {
      today: '2026-10-24', lastTrainingDay: '2026-10-22',
      sessions: [{ day: '2026-10-22', sets: [done(80)], easedIn: true }]
    }).weight).toBe(85);
  });

  test.each(['bodyweight', 'other'] as const)('%s has no invented equipment step or reduction', equipment => {
    expect(suggestion([done(100, 7)], equipment, 'lb', 8, undefined, {
      today: '2026-10-22', lastTrainingDay: '2026-10-01', sessions: [miss('2026-09-29'), miss('2026-10-01')]
    }).weight).toBe(100);
  });

  test.each(['lb', 'kg'] as const)('WK-14 dumbbell volume is both hands; records stay per hand in %s', unit => {
    const weight = unit === 'lb' ? 50 : 22.5;
    expect(setMetrics(done(weight), { equipment: 'dumbbell' })).toEqual({
      reps: 8, volume: weight * 8 * 2, e1rm: weight * (1 + 8 / 30), perHand: true, est: false
    });
    expect(setMetrics(done(weight), { equipment: 'barbell' }).perHand).toBe(false);
    expect(detectPR([done(weight)], [done(weight - 5)], { equipment: 'dumbbell' })).toMatchObject({
      weight: true, e1rm: true, bestWeight: weight, bestE1rm: weight * (1 + 8 / 30)
    });
  });

  test.each(['lb', 'kg'] as const)('WK-15 bodyweight plus added load uses supplied latest weigh-in in %s', unit => {
    const bodyweight = unit === 'lb' ? 180 : 80;
    for (const added of [0, 10]) {
      expect(setMetrics(done(added), { equipment: 'bodyweight', bodyweight })).toEqual({
        reps: 8, volume: (bodyweight + added) * 8, e1rm: (bodyweight + added) * (1 + 8 / 30), perHand: false, est: false
      });
    }
    expect(detectPR([done(10)], [done(5)], { equipment: 'bodyweight', bodyweight })).toMatchObject({
      weight: true, e1rm: true, bestWeight: bodyweight + 10, bestE1rm: (bodyweight + 10) * (1 + 8 / 30)
    });
  });

  test('WK-15 no weigh-in means reps only and est, even with added load', () => {
    for (const bodyweight of [undefined, 0, NaN, Infinity, -1]) {
      expect(setMetrics(done(10), { equipment: 'bodyweight', bodyweight })).toEqual({
        reps: 8, volume: null, e1rm: null, perHand: false, est: true
      });
    }
    expect(detectPR([done(10)], [done(5)], { equipment: 'bodyweight' })).toMatchObject({
      weight: false, e1rm: false, bestWeight: 0, bestE1rm: 0
    });
  });

  test('WK-16 twelve reps counts for e1RM; thirteen counts only for volume and weight PR', () => {
    expect(setMetrics(done(100, 12)).e1rm).toBe(140);
    expect(setMetrics(done(100, 13))).toMatchObject({ volume: 1300, e1rm: null });
    expect(detectPR([done(100, 12)], [done(95, 12)]).e1rm).toBe(true);
    expect(detectPR([done(105, 13)], [done(100, 12)])).toEqual({
      weight: true, e1rm: false, bestWeight: 105, bestE1rm: 0
    });
    expect(detectPR([done(100, 12)], [done(95, 13)]).e1rm).toBe(false);
    expect(detectPR([done(100, 12), done(500, 13)], [done(95, 12)]).bestE1rm).toBe(140);
  });

  test('metrics exclude warmups, undone and zero-rep sets', () => {
    for (const set of [{ ...done(100), warmup: true }, { ...done(100), done: false }, done(100, 0)]) {
      expect(setMetrics(set)).toMatchObject({ reps: 0, volume: 0, e1rm: null });
    }
  });
});
