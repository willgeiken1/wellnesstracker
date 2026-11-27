/**
 * What Home's tiles read: one shared set so every tile agrees. Series are oldest to newest, 30 entries, the last entry is
 * today (or last night). Energy in kcal, weight in lb, water in litres, volume in lb, clock times as "h:mm AM"; the tiles
 * convert for display. Built from the app's own data in ./data.ts. Held in memory only.
 */
/** A meal's energy is null when none of its foods gives it: drawn as nothing and labelled with a dash, never 0. */
export interface MealTime { name: string; kcal: number | null; time: string | null }
export interface HomeTileData {
  now: Date;
  days: Date[];
  dayLabels: string[];
  calories: { unit: 'kcal'; goal: number; today: number; series: number[]; meals: MealTime[]; macros: { protein: number; carbs: number; fat: number } };
  protein: { unit: 'g'; goal: number; today: number; series: number[]; byMeal: (number | null)[] };
  water: {
    unit: string; goal: number; today: number; series: number[]; hourly: number[];
    log?: { t: string; oz: number }[] | null; containers?: { id: string; name: string; oz: number; icon?: string; quick?: boolean }[] | null;
  };
  weight: { unit: 'lb'; goal: number; today: number; series: number[]; lastWeighIn: string };
  bodyFat: { unit: '%'; today: number; series: number[]; lastReading: string };
  volume: { unit: 'lb'; week: number; lastWeek: number; daily: number[]; byGroup: Record<string, number>; workouts: number };
  exercise: { unit: 'min'; goal: number; today: number; series: number[]; hourly: number[] };
  active: { unit: 'kcal'; goal: number; today: number; series: number[]; hourly: number[] };
  steps: { unit: 'steps'; goal: number; today: number; series: number[]; hourly: number[]; source?: string };
  sleep: {
    unit: 'h'; need: number;
    last: { minutes: number; bed: string; wake: string; stages: [stage: 'awake' | 'core' | 'deep' | 'rem', from: number, to: number][] };
    series: number[]; bedtimes: number[]; source: string;
    score: { today: number; parts: { duration: number; stages: number; consistency: number }; source: string; series: number[] };
  };
  mindful: { unit: 'min'; goal: number; today: number; sessions: { at: string; min: number }[]; series: number[]; source: string };
  hrv: { unit: 'ms'; today: number; band: [number, number]; series: number[]; source: string };
  rhr: { unit: 'bpm'; today: number; band: [number, number]; series: number[]; source: string };
  score: { today: number; yesterday: number; series: number[]; pillars: { training: number | null; food: number | null; recovery: number | null } };
  week: { label: string; date: number; training: number | null; food: number | null; recovery: number | null; today: boolean }[];
  next: {
    mode: 'food' | 'workout'; title: string; sub: string; workoutTomorrow: string;
    activeWorkout: { name: string; elapsed: string; setsDone: number; setsTotal: number } | null;
  };
  nextup: {
    routine: string; window: string; item: string; amount: string; due: string; doneToday: number; totalToday: number;
    routineDone: number; routineTotal: number; upcoming: string[]; justLogged?: boolean;
  };
  mealLog?: {
    goal: number; eaten: number; pGoal: number; pEaten: number; next: string;
    meals: { id: string; name: string; time: string | null; kcal: number | null; p: number | null; n: number }[];
    recent?: { n: string; q: string; kcal: number; p: number }[];
    saved?: { id: string; n: string; q: string; kcal: number; p: number }[];
  };
}
