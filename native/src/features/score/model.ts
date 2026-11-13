/**
 * The Insight Score: one number from 0 to 100 for the last 7 days, built from three pillars.
 * Everything here is worked out on the phone each time it is shown. The score and its pillars are never
 * saved, synced, exported, logged or sent anywhere. Only the person's chosen weights are kept, on this phone.
 */
export const BASELINE_DAYS = 7;
export const WINDOW_DAYS = 7;
export const STEP_GOAL = 8000;
/** Sleep earns nothing at or under 4 hours and full marks from 7 hours. */
export const SLEEP_FLOOR = 4, SLEEP_FULL = 7;
/** Calories count in full within 10% of the target and reach zero 40% away from it. */
export const KCAL_NEAR = 0.1, KCAL_FAR = 0.4;
export const KCAL_SHARE = 0.6, PROTEIN_SHARE = 0.4, STEPS_SHARE = 0.25;
export const SCORE_PILLARS = ['training', 'food', 'recovery'] as const;
export type ScorePillar = typeof SCORE_PILLARS[number];
export type Weights = Record<ScorePillar, number>;
export const DEFAULT_WEIGHTS: Weights = { training: 40, food: 35, recovery: 25 };
export const WEIGHT_STEP = 5, WEIGHT_MAX = 100;
export const SCORE_WEIGHTS_KEY = 'scoreWeights';

export interface FoodDay { logged: boolean; kcal: number | null; goalKcal: number | null; protein: number | null; goalProtein: number | null }
export interface ScoreInput {
  /** Distinct days with a workout or food logged, over all time. */
  daysLogged: number;
  /** Workouts in the last 7 days, today included. */
  workouts: number;
  /** Workouts planned per week. */
  workoutGoal: number;
  /** The last 7 days, oldest first; the last one is today. */
  food: FoodDay[];
  /** Steps per day and hours asleep per night for the same 7 days, or null when there is no source. Held in memory only. */
  steps: number[] | null;
  sleepHours: number[] | null;
  weights: Weights;
}
export interface Score {
  ready: boolean;
  daysLeft: number;
  /** How far along the first 7 days are, 0 to 1. */
  progress: number;
  /** 0 to 100 once ready and at least one weighted pillar has data. */
  value: number | null;
  /** 0 to 100 each. Null means there is nothing to measure yet. */
  pillars: Record<ScorePillar, number | null>;
  /** The numbers behind each pillar, shown on the detail screen. */
  parts: {
    workouts: number; workoutGoal: number; stepsAverage: number | null;
    foodDays: number; foodLogged: number; todayCounted: boolean;
    sleepAverage: number | null; nights: number;
  };
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const mean = (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length;

export function calorieCloseness(kcal: number, goal: number): number {
  const off = Math.abs(kcal - goal) / goal;
  return off <= KCAL_NEAR ? 1 : clamp01(1 - (off - KCAL_NEAR) / (KCAL_FAR - KCAL_NEAR));
}
/** One day of food, 0 to 1. A logged day with no target counts in full: logging is the part the person controls. */
export function foodDayScore(day: FoodDay): number {
  if (!day.logged) return 0;
  if (!finite(day.goalKcal) || day.goalKcal <= 0 || !finite(day.kcal)) return 1;
  const kcal = calorieCloseness(day.kcal, day.goalKcal);
  if (!finite(day.goalProtein) || day.goalProtein <= 0) return kcal;
  return KCAL_SHARE * kcal + PROTEIN_SHARE * clamp01((day.protein ?? 0) / day.goalProtein);
}
/** Today joins the average once it is logged and has reached 90% of its calorie target, so a morning never drags the week down. */
export function todayCounts(day: FoodDay | undefined): boolean {
  if (!day?.logged) return false;
  return !finite(day.goalKcal) || day.goalKcal <= 0 || !finite(day.kcal) || day.kcal >= (1 - KCAL_NEAR) * day.goalKcal;
}
export const sleepScore = (hours: number) => clamp01((hours - SLEEP_FLOOR) / (SLEEP_FULL - SLEEP_FLOOR));
export const stepsScore = (steps: number) => clamp01(steps / STEP_GOAL);

/** Reads saved weights. Anything missing or damaged falls back to the defaults. */
export function cleanWeights(saved: unknown): Weights {
  if (!saved || typeof saved !== 'object') return { ...DEFAULT_WEIGHTS };
  const out = {} as Weights;
  for (const pillar of SCORE_PILLARS) {
    const value = (saved as Record<string, unknown>)[pillar];
    if (!finite(value) || value < 0 || value > WEIGHT_MAX) return { ...DEFAULT_WEIGHTS };
    out[pillar] = Math.round(value / WEIGHT_STEP) * WEIGHT_STEP;
  }
  return SCORE_PILLARS.some(pillar => out[pillar] > 0) ? out : { ...DEFAULT_WEIGHTS };
}
/** Moves one weight a step up or down. The last weight above zero cannot be taken to zero. */
export function nudgeWeight(weights: Weights, pillar: ScorePillar, by: -1 | 1): Weights {
  const next = Math.min(WEIGHT_MAX, Math.max(0, weights[pillar] + by * WEIGHT_STEP));
  if (next === weights[pillar]) return weights;
  const out = { ...weights, [pillar]: next };
  return SCORE_PILLARS.some(key => out[key] > 0) ? out : weights;
}
export const sameWeights = (a: Weights, b: Weights) => SCORE_PILLARS.every(pillar => a[pillar] === b[pillar]);
/** Each pillar's share of the score in whole percent, among the pillars that have data. */
export function shares(weights: Weights, pillars: Record<ScorePillar, number | null>): Record<ScorePillar, number> {
  const total = SCORE_PILLARS.reduce((sum, pillar) => sum + (pillars[pillar] === null ? 0 : weights[pillar]), 0);
  return Object.fromEntries(SCORE_PILLARS.map(pillar => [pillar, pillars[pillar] === null || !total ? 0 : Math.round(100 * weights[pillar] / total)])) as Record<ScorePillar, number>;
}

export function insightScore(input: ScoreInput): Score {
  const daysLogged = Math.max(0, Math.floor(input.daysLogged)), daysLeft = Math.max(0, BASELINE_DAYS - daysLogged);
  const goal = Math.min(7, Math.max(1, Math.round(input.workoutGoal) || 3)), workouts = Math.max(0, input.workouts);

  // Today's steps are still climbing, so only the days before today are averaged.
  const walked = (input.steps ?? []).slice(0, -1).filter(n => finite(n) && n > 0);
  const stepsAverage = walked.length ? mean(walked) : null;
  const lifted = clamp01(workouts / goal);
  const training = 100 * (stepsAverage === null ? lifted : (1 - STEPS_SHARE) * lifted + STEPS_SHARE * mean(walked.map(stepsScore)));

  const today = input.food[input.food.length - 1], todayCounted = todayCounts(today);
  const counted = todayCounted ? input.food : input.food.slice(0, -1);
  const food = counted.length ? 100 * mean(counted.map(foodDayScore)) : 0;

  const nights = (input.sleepHours ?? []).filter(n => finite(n) && n > 0);
  const recovery = nights.length ? 100 * mean(nights.map(sleepScore)) : null;

  const pillars = { training: Math.round(training), food: Math.round(food), recovery: recovery === null ? null : Math.round(recovery) };
  const exact = { training, food, recovery };
  let total = 0, weight = 0;
  for (const pillar of SCORE_PILLARS) {
    const value = exact[pillar];
    if (value === null) continue;
    total += value * input.weights[pillar]; weight += input.weights[pillar];
  }
  return {
    ready: daysLeft === 0, daysLeft, progress: clamp01(daysLogged / BASELINE_DAYS),
    value: daysLeft === 0 && weight > 0 ? Math.round(total / weight) : null, pillars,
    parts: { workouts, workoutGoal: goal, stepsAverage: stepsAverage === null ? null : Math.round(stepsAverage),
      foodDays: counted.length, foodLogged: counted.filter(day => day.logged).length, todayCounted,
      sleepAverage: nights.length ? mean(nights) : null, nights: nights.length },
  };
}
