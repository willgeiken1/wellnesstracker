import { DEFAULT_WEIGHTS, calorieCloseness, cleanWeights, foodDayScore, insightScore, nudgeWeight, shares, sleepScore, stepsScore, todayCounts, type FoodDay, type ScoreInput } from '../src/features/score/model';

// Made-up sample numbers only.
const onTarget: FoodDay = { logged: true, kcal: 2000, goalKcal: 2000, protein: 150, goalProtein: 150 };
const none: FoodDay = { logged: false, kcal: null, goalKcal: 2000, protein: null, goalProtein: 150 };
const week = (day: FoodDay) => Array.from({ length: 7 }, () => day);
const base: ScoreInput = { daysLogged: 7, workouts: 3, workoutGoal: 3, food: week(onTarget), steps: null, sleepHours: null, weights: DEFAULT_WEIGHTS };

describe('the pieces', () => {
  test('calories count in full within 10% of the target and fall to nothing 40% away, over or under', () => {
    expect(calorieCloseness(2000, 2000)).toBe(1);
    expect(calorieCloseness(1800, 2000)).toBe(1);
    expect(calorieCloseness(2200, 2000)).toBe(1);
    expect(calorieCloseness(1500, 2000)).toBeCloseTo(0.5);
    expect(calorieCloseness(2500, 2000)).toBeCloseTo(0.5);
    expect(calorieCloseness(1200, 2000)).toBe(0);
    expect(calorieCloseness(4000, 2000)).toBe(0);
  });
  test('a food day is 60% calories and 40% protein; unlogged is 0; logged with no target counts in full', () => {
    expect(foodDayScore(onTarget)).toBe(1);
    expect(foodDayScore(none)).toBe(0);
    expect(foodDayScore({ ...onTarget, protein: 75 })).toBeCloseTo(0.8);
    expect(foodDayScore({ ...onTarget, protein: 300 })).toBe(1);
    expect(foodDayScore({ ...onTarget, kcal: 1500, protein: 0 })).toBeCloseTo(0.3);
    expect(foodDayScore({ logged: true, kcal: 900, goalKcal: null, protein: 10, goalProtein: null })).toBe(1);
    expect(foodDayScore({ ...onTarget, goalProtein: null, kcal: 1500 })).toBeCloseTo(0.5);
  });
  test('today joins once logged and at 90% of its calorie target', () => {
    expect(todayCounts(undefined)).toBe(false);
    expect(todayCounts(none)).toBe(false);
    expect(todayCounts({ ...onTarget, kcal: 600 })).toBe(false);
    expect(todayCounts({ ...onTarget, kcal: 1800 })).toBe(true);
    expect(todayCounts({ ...onTarget, goalKcal: null })).toBe(true);
  });
  test('sleep runs from 4 to 7 hours and steps up to 8,000', () => {
    expect(sleepScore(3)).toBe(0); expect(sleepScore(5.5)).toBeCloseTo(0.5); expect(sleepScore(7)).toBe(1); expect(sleepScore(10)).toBe(1);
    expect(stepsScore(0)).toBe(0); expect(stepsScore(4000)).toBe(0.5); expect(stepsScore(20000)).toBe(1);
  });
});

describe('the score', () => {
  test('counts down to 7 logged days and shows no number until then', () => {
    const early = insightScore({ ...base, daysLogged: 2 });
    expect(early).toMatchObject({ ready: false, daysLeft: 5, value: null });
    expect(early.progress).toBeCloseTo(2 / 7);
    // The pillars are real from day 1, so the rows can show them.
    expect(early.pillars).toEqual({ training: 100, food: 100, recovery: null });
    expect(insightScore({ ...base, daysLogged: 6 }).daysLeft).toBe(1);
    expect(insightScore({ ...base, daysLogged: 40 })).toMatchObject({ ready: true, daysLeft: 0, progress: 1 });
  });
  test('with no sleep data, recovery is left out and the other weights share the score', () => {
    const score = insightScore({ ...base, workouts: 0 });
    expect(score.pillars).toEqual({ training: 0, food: 100, recovery: null });
    expect(score.value).toBe(Math.round(100 * 35 / 75));
    expect(shares(DEFAULT_WEIGHTS, score.pillars)).toEqual({ training: 53, food: 47, recovery: 0 });
  });
  test('training is workouts against the weekly plan, capped, with steps as a quarter when there are any', () => {
    expect(insightScore({ ...base, workouts: 1, workoutGoal: 4 }).pillars.training).toBe(25);
    expect(insightScore({ ...base, workouts: 9, workoutGoal: 4 }).pillars.training).toBe(100);
    expect(insightScore({ ...base, workoutGoal: 0 }).parts.workoutGoal).toBe(3);
    // Today's steps (the last number) are still climbing and are not averaged.
    const walked = insightScore({ ...base, workouts: 2, workoutGoal: 4, steps: [4000, 4000, 4000, 4000, 4000, 4000, 100] });
    expect(walked.pillars.training).toBe(Math.round(100 * (0.75 * 0.5 + 0.25 * 0.5)));
    expect(walked.parts.stepsAverage).toBe(4000);
    expect(insightScore({ ...base, steps: [0, 0, 0, 0, 0, 0, 5000] }).parts.stepsAverage).toBeNull();
  });
  test('food averages the counted days; an unfinished today is left out, not scored as a miss', () => {
    const morning = insightScore({ ...base, food: [...week(onTarget).slice(1), { ...onTarget, kcal: 400, protein: 20 }] });
    expect(morning.pillars.food).toBe(100);
    expect(morning.parts).toMatchObject({ foodDays: 6, foodLogged: 6, todayCounted: false });
    const gaps = insightScore({ ...base, food: [none, none, onTarget, onTarget, onTarget, onTarget, onTarget] });
    expect(gaps.pillars.food).toBe(Math.round(100 * 5 / 7));
    expect(gaps.parts).toMatchObject({ foodDays: 7, foodLogged: 5, todayCounted: true });
    expect(insightScore({ ...base, food: [] }).pillars.food).toBe(0);
  });
  test('recovery is the average night; nights with no data are skipped', () => {
    const score = insightScore({ ...base, sleepHours: [7, 0, 5.5, 8, 0, 0, 5.5] });
    expect(score.pillars.recovery).toBe(75);
    expect(score.parts.nights).toBe(4);
    expect(score.parts.sleepAverage).toBeCloseTo(6.5);
    expect(score.value).toBe(Math.round((100 * 40 + 100 * 35 + 75 * 25) / 100));
    expect(insightScore({ ...base, sleepHours: [0, 0, 0, 0, 0, 0, 0] }).pillars.recovery).toBeNull();
  });
  test('before noon a short last night is left out, since it may not be over; a full one counts at once', () => {
    const six = [7, 7, 7, 7, 7, 7];
    const early = insightScore({ ...base, sleepHours: [...six, 2], sleepOpen: true });
    expect(early.pillars.recovery).toBe(100);
    expect(early.parts).toMatchObject({ nights: 6, lastNightCounted: false });
    expect(insightScore({ ...base, sleepHours: [...six, 7.5], sleepOpen: true }).parts).toMatchObject({ nights: 7, lastNightCounted: true });
    // After noon the night is over, so a short one counts.
    const late = insightScore({ ...base, sleepHours: [...six, 2], sleepOpen: false });
    expect(late.parts.nights).toBe(7);
    expect(late.pillars.recovery).toBe(Math.round(100 * 6 / 7));
    expect(insightScore({ ...base, sleepHours: [0, 0, 0, 0, 0, 0, 3], sleepOpen: true }).pillars.recovery).toBeNull();
  });
  test('the shares always add up to 100', () => {
    const all = { training: 50, food: 50, recovery: 50 };
    for (const weights of [{ training: 40, food: 35, recovery: 30 }, { training: 5, food: 5, recovery: 5 }, { training: 100, food: 95, recovery: 5 }, { training: 15, food: 0, recovery: 30 }]) {
      const share = shares(weights, all);
      expect(share.training + share.food + share.recovery).toBe(100);
    }
    expect(shares({ training: 5, food: 5, recovery: 5 }, all)).toEqual({ training: 34, food: 33, recovery: 33 });
    expect(shares(DEFAULT_WEIGHTS, { training: null, food: null, recovery: null })).toEqual({ training: 0, food: 0, recovery: 0 });
  });
  test('the weights change the score and a zero weight drops a pillar', () => {
    const input = { ...base, workouts: 0, sleepHours: [7, 7, 7, 7, 7, 7, 7] };
    expect(insightScore(input).value).toBe(60);
    expect(insightScore({ ...input, weights: { training: 0, food: 50, recovery: 50 } }).value).toBe(100);
    expect(insightScore({ ...input, weights: { training: 100, food: 0, recovery: 0 } }).value).toBe(0);
  });
});

describe('weights', () => {
  test('damaged saves fall back to the defaults', () => {
    for (const bad of [null, 'x', {}, { training: 40, food: 35 }, { training: -5, food: 35, recovery: 25 }, { training: 400, food: 35, recovery: 25 }, { training: 0, food: 0, recovery: 0 }, { training: NaN, food: 1, recovery: 1 }]) {
      expect(cleanWeights(bad)).toEqual(DEFAULT_WEIGHTS);
    }
    expect(cleanWeights({ training: 50, food: 0, recovery: 22 })).toEqual({ training: 50, food: 0, recovery: 20 });
  });
  test('a nudge moves one weight by 5, stops at the ends, and never leaves every weight at zero', () => {
    expect(nudgeWeight(DEFAULT_WEIGHTS, 'food', 1)).toEqual({ training: 40, food: 40, recovery: 25 });
    expect(nudgeWeight(DEFAULT_WEIGHTS, 'food', -1)).toEqual({ training: 40, food: 30, recovery: 25 });
    const top = { training: 100, food: 0, recovery: 0 };
    expect(nudgeWeight(top, 'training', 1)).toBe(top);
    expect(nudgeWeight(top, 'food', -1)).toBe(top);
    const last = { training: 5, food: 0, recovery: 0 };
    expect(nudgeWeight(last, 'training', -1)).toBe(last);
  });
});
