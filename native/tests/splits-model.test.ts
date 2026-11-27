// The split model: rotation order, a skipped day that waits and comes next, swap, freestyle, set weekdays, the week
// against its target and weekly sets per muscle (Insight Mockup v21, splits.js). Made-up days only.
import {
  freshState, mondayOf, perWeekOf, plusDays, reconcile, sequence, sessionCells, skipToday, splitToday, swapNext, swapToday, timesLabel,
  timesPerWeek, trainToday, weekdayOf, weekdayCells, weeklySets, type FinishedSplit, type SplitDef, type SplitState,
} from '../src/features/splits/model';
import { SPLIT_PRESETS, defaultWeek, dayKinds, spreadWeek, suggestFor } from '../src/features/splits/presets';
import { exerciseFor } from '../src/core/workout/library';
import { muscleGroup, type MuscleGroup } from '../src/features/workout/training-data';

const MON = '2026-11-23', TUE = '2026-11-24', WED = '2026-11-25', THU = '2026-11-26';
const def = (over: Partial<SplitDef> = {}): SplitDef => ({ v: 1, key: 'test', name: 'Test split', mode: 'rotate', perWeek: 4,
  days: [{ routineId: 'a' }, { routineId: 'b' }, { routineId: 'c' }], week: [0, -1, 1, -1, 2, -1, -1], since: plusDays(MON, -7), ...over });
const today = (d: SplitDef, s: SplitState, day: string, live: { routineId: string | null } | null = null, doneToday = false) => splitToday(d, s, { today: day, live, doneToday });
const done = (seq: number, routineId: string, day: string): FinishedSplit => ({ seq, routineId, day });

test('dates: weekdays count from Monday, and Monday of the week', () => {
  expect(weekdayOf(MON)).toBe(0);
  expect(weekdayOf('2026-11-29')).toBe(6);
  expect(mondayOf(THU)).toBe(MON);
  expect(plusDays(MON, 7)).toBe('2026-11-30');
});

describe('Rotate in order', () => {
  const d = def();
  test('the first day is up, then the rest in order, round again', () => {
    const t = today(d, freshState(d), MON);
    expect(t).toMatchObject({ kind: 'planned', focus: 0, carried: false, nextDay: MON });
    expect(t.then).toEqual([1, 2, 0]);
    expect(sequence(d, freshState(d, 1), MON, 5)).toEqual([1, 2, 0, 1, 2]);
  });
  test('finishing the day up moves the next one up, whatever day of the week it is', () => {
    const s = reconcile(d, freshState(d), [done(1, 'a', MON)], MON);
    expect(s.ptr).toBe(1);
    expect(today(d, s, MON, null, true)).toMatchObject({ kind: 'done', focus: 1, then: [2, 0, 1] });
    // Rest days never throw it off: two days later the same day is still up.
    const later = reconcile(d, s, [done(1, 'a', MON)], WED);
    expect(today(d, later, WED)).toMatchObject({ kind: 'planned', focus: 1 });
  });
  test('a finish is folded in once, by its launch order', () => {
    const once = reconcile(d, freshState(d), [done(1, 'a', MON)], MON);
    expect(reconcile(d, once, [done(1, 'a', MON)], MON).ptr).toBe(1);
    const two = reconcile(d, freshState(d), [done(2, 'b', TUE), done(1, 'a', MON)], TUE);
    expect(two).toMatchObject({ ptr: 2, seq: 2 });
  });
  test('workouts finished before the split was chosen do not count', () => {
    const s = freshState(d, 0, 5);
    expect(reconcile(d, s, [done(4, 'a', MON), done(5, 'b', MON)], MON).ptr).toBe(0);
  });
  test('a skipped day waits: it is the next session, then the order carries on', () => {
    const skipped = skipToday(d, freshState(d), MON);
    expect(today(d, skipped, MON)).toMatchObject({ kind: 'skipped', focus: 0, carried: true, then: [1, 2, 0] });
    const tue = reconcile(d, skipped, [], TUE);
    expect(tue).toMatchObject({ skipped: false, carry: 0, day: null });
    expect(today(d, tue, TUE)).toMatchObject({ kind: 'planned', focus: 0, carried: true });
    const after = reconcile(d, tue, [done(1, 'a', TUE)], TUE);
    expect(after).toMatchObject({ ptr: 1, carry: null });
  });
  test('Swap: another day today, and the day it replaces waits and comes next', () => {
    const s = swapToday(d, freshState(d), MON, 2);
    const t = today(d, s, MON);
    expect(t).toMatchObject({ kind: 'planned', focus: 2, carried: false });
    expect(t.then).toEqual([0, 1, 2]);
    const after = reconcile(d, s, [done(1, 'c', MON)], MON);
    expect(after).toMatchObject({ carry: 0, swap: null, ptr: 0 });
    expect(today(d, after, MON, null, true)).toMatchObject({ kind: 'done', focus: 0, then: [1, 2, 0] });
    // A swap left unused lapses at midnight; the day it replaced still waits.
    expect(reconcile(d, s, [], TUE)).toMatchObject({ swap: null, carry: 0 });
  });
  test('Change next day while one is going: the picked day comes next, the one it replaces after it', () => {
    const s = swapNext(freshState(d, 1), 2);
    expect(sequence(d, s, TUE, 3)).toEqual([2, 1, 2]);
  });
  test('freestyle is a workout outside the split: it never moves the rotation', () => {
    const s = freshState(d);
    const live = today(d, s, MON, { routineId: null });
    expect(live).toMatchObject({ kind: 'live', focus: -1, then: [0, 1, 2] });
    // A freestyle workout has no split day, so nothing is folded in when it ends.
    expect(reconcile(d, s, [], MON).ptr).toBe(0);
    expect(today(d, s, MON)).toMatchObject({ kind: 'planned', focus: 0 });
  });
  test('a split day going now shows the days after it', () => {
    expect(today(d, freshState(d), MON, { routineId: 'a' })).toMatchObject({ kind: 'live', focus: 0, then: [1, 2, 0] });
  });
  test('Train today after today\'s day is done puts the next session on today', () => {
    const s = reconcile(d, freshState(d), [done(1, 'a', MON)], MON);
    const again = trainToday(d, s, MON);
    expect(today(d, again, MON, null, true)).toMatchObject({ kind: 'planned', focus: 1 });
  });
});

describe('Set weekdays', () => {
  const d = def({ mode: 'weekdays' });
  test('each weekday has its day, and the others are rest', () => {
    expect(today(d, freshState(d), MON)).toMatchObject({ kind: 'planned', focus: 0 });
    const tue = today(d, freshState(d), TUE);
    expect(tue).toMatchObject({ kind: 'rest', focus: 1, nextDay: WED });
    expect(sequence(d, freshState(d), MON, 4)).toEqual([0, 1, 2, 0]);
  });
  test('a weekday missed with no split workout waits for the next session, then the week carries on', () => {
    const tue = reconcile(d, freshState(d), [], TUE);
    expect(tue.carry).toBe(0);
    expect(today(d, tue, TUE)).toMatchObject({ kind: 'planned', focus: 0, carried: true });
    const wed = reconcile(d, tue, [done(1, 'a', TUE)], WED);
    expect(wed.carry).toBeNull();
    expect(today(d, wed, WED)).toMatchObject({ kind: 'planned', focus: 1 });
  });
  test('the week shows done, skipped, today and the days to come, Monday first', () => {
    const cells = weekdayCells(d, MON, WED, new Map([[MON, 'Day A']]), i => ['Day A', 'Day B', 'Day C'][i], { kind: 'plan', name: 'Day B' });
    expect(cells.map(c => c.kind)).toEqual(['done', 'rest', 'plan', 'rest', 'plan', 'rest', 'rest']);
    expect(cells[2]).toMatchObject({ now: true, name: 'Day B' });
    const missed = weekdayCells(d, MON, WED, new Map(), i => ['Day A', 'Day B', 'Day C'][i], { kind: 'plan', name: 'Day A' });
    expect(missed[0].kind).toBe('skip');
  });
  test('the weekly count is the weekdays set', () => {
    expect(perWeekOf(d)).toBe(3);
    expect(perWeekOf(def())).toBe(4);
  });
});

test('the week in Rotate in order: sessions against the target, numbered, no weekdays', () => {
  const cells = sessionCells(['Push A', 'Pull A'], null, ['Legs A', 'Push B', 'Pull B', 'Legs B'], 5, true);
  expect(cells.map(c => [c.kind, c.n])).toEqual([['done', 1], ['done', 2], ['plan', 3], ['plan', 4], ['plan', 5]]);
  expect(cells[2].now).toBe(true);
  const live = sessionCells(['Push A'], 'Pull A', ['Legs A', 'Push B'], 3, false);
  expect(live.map(c => c.kind)).toEqual(['done', 'live', 'plan']);
  // More done than the target still shows each one, seven at most.
  expect(sessionCells(Array(9).fill('X'), null, [], 3, false)).toHaveLength(7);
});

describe('weekly sets per muscle', () => {
  const muscles = (name: string) => ({ main: (name === 'Bench' ? 'Chest' : name === 'Row' ? 'Back' : null) as MuscleGroup | null,
    helpers: (name === 'Bench' ? ['Triceps'] : []) as MuscleGroup[] });
  test('the main muscle counts a full set and helpers half, times the days come round', () => {
    const cov = weeklySets([[{ name: 'Bench', sets: 4 }], [{ name: 'Row', sets: 3 }]], [2, 1], muscles);
    const of = (m: MuscleGroup) => cov.find(c => c.m === m)!;
    expect(of('Chest')).toMatchObject({ sets: 8, times: 2 });
    expect(of('Triceps')).toMatchObject({ sets: 4, times: 2 });
    expect(of('Back')).toMatchObject({ sets: 3, times: 1 });
    expect(of('Quads')).toMatchObject({ sets: 0, times: 0 });
  });
  test('how often a day comes round: the target spread over the days, or its weekdays', () => {
    expect(timesPerWeek({ mode: 'rotate', perWeek: 4, week: [] }, 2)).toEqual([2, 2]);
    expect(timesPerWeek({ mode: 'weekdays', perWeek: 4, week: [0, -1, 1, -1, 0, -1, -1] }, 2)).toEqual([2, 1]);
    expect([timesLabel(2, 'some weeks'), timesLabel(1, 'some weeks'), timesLabel(0.5, 'some weeks'), timesLabel(0, 'some weeks')]).toEqual(['2×', '1×', 'some weeks', '–']);
  });
});

describe('the presets', () => {
  test('six presets, every one starting in Rotate in order with a weekly target and a typical week', () => {
    expect(SPLIT_PRESETS.map(p => p.name)).toEqual(['Push Pull Legs', 'Upper Lower', 'Full body', 'Arnold split', 'Bro split', 'PHUL']);
    for (const p of SPLIT_PRESETS) {
      expect(p.week).toHaveLength(7);
      expect(p.perWeek).toBeGreaterThanOrEqual(1);
      expect(Math.max(...p.week)).toBe(p.days.length - 1);
    }
  });
  test('every exercise is one of the library\'s, so its muscles and equipment are known', () => {
    const unknown = SPLIT_PRESETS.flatMap(p => p.days.flatMap(d => d.ex.map(e => e[0]))).filter(n => !exerciseFor(n).main);
    expect(unknown).toEqual([]);
  });
  test('the kinds of day and suggested exercises', () => {
    expect(dayKinds(SPLIT_PRESETS[0].days)).toEqual(['Push', 'Pull', 'Legs']);
    expect(suggestFor('Chest', n => muscleGroup(exerciseFor(n).main)).map(e => e[0])).toEqual(['Bench Press', 'Incline Dumbbell Press']);
    expect(spreadWeek([true, false, true, false, true, true, false], 3)).toEqual([0, -1, 1, -1, 2, 0, -1]);
    expect(defaultWeek(3)).toEqual([0, -1, 1, -1, 2, -1, -1]);
  });
});
