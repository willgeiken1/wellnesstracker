import { foodDayScore, sleepScore, stepsScore, STEPS_SHARE, type FoodDay } from './model';

/**
 * The day score: one number for how a single day went, the average of three pillars that each count a third
 * (Training, Food and Sleep). A pillar with nothing to go on (no food logged, no sleep reading) is left out rather than scored as 0, and a day with no
 * pillar at all has no score. Worked out on the phone each time it is shown; never saved, synced or exported.
 */
export interface DayInput {
  /** A workout was finished (or is going) that day. */
  trained: boolean;
  /** Workouts in the 7 days ending that day, and the plan's workouts a week. A rest day earns the week's progress. */
  weekWorkouts: number; perWeek: number;
  /** Steps that day, or null with no reading. */
  steps: number | null;
  food: FoodDay;
  sleepHours: number | null;
  /** Training has been logged at least once, so a day without a workout is a rest day and not unknown. */
  logsTraining: boolean;
}
export interface DayPillars { training: number | null; food: number | null; sleep: number | null }
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function dayPillars(d: DayInput): DayPillars {
  const goal = Math.min(7, Math.max(1, Math.round(d.perWeek) || 3));
  const hasSteps = d.steps != null && d.steps > 0;
  let training: number | null = null;
  if (d.logsTraining || d.trained || hasSteps) {
    const lifted = d.trained ? 1 : d.logsTraining ? clamp01(d.weekWorkouts / goal) : null;
    const walk = hasSteps ? stepsScore(d.steps as number) : null;
    training = Math.round(100 * (lifted == null ? walk! : walk == null ? lifted : (1 - STEPS_SHARE) * lifted + STEPS_SHARE * walk));
  }
  const food = d.food.logged ? Math.round(100 * foodDayScore(d.food)) : null;
  const sleep = d.sleepHours != null && d.sleepHours > 0 ? Math.round(100 * sleepScore(d.sleepHours)) : null;
  return { training, food, sleep };
}
/** The average of the pillars that have something to go on, or null. */
export function dayScore(p: DayPillars): number | null {
  const got = [p.training, p.food, p.sleep].filter((n): n is number => n != null);
  return got.length ? Math.round(got.reduce((a, b) => a + b, 0) / got.length) : null;
}
