import { localDay } from '@/core/workout/rules';
import { exerciseFor } from '@/core/workout/library';
import type { WorkoutStore } from '@/data/workout/store';
import { dailyWeights } from '@/features/body/model';
import { attributedDay, foodTargets, meals as mealList, recentFoods, totals } from '@/features/food/model';
import type { HealthDays } from '@/features/health/days';
import { PlanStore } from '@/features/plans/store';
import { readScore } from '@/features/score/read';
import { entryVolumeKg } from '@/features/workout/volume';
import { pluralize } from '@/i18n/en';
import { DAYS, type ActiveWorkoutIn, type FoodDayIn, type HomeInput, type ScoreDayIn } from './data';

const KJ = 4.184;
const num = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
/** The `count` local days ending on `now`'s day, oldest first. */
export function windowDays(now: Date, count = DAYS): string[] {
  return Array.from({ length: count }, (_, i) => localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (count - 1 - i))));
}
/** Muscle groups as the Volume tile names them. */
const GROUP: Record<string, string> = {
  chest: 'Chest', lats: 'Back', upperBack: 'Back', lowerBack: 'Back', traps: 'Back',
  quads: 'Legs', hamstrings: 'Legs', glutes: 'Legs', calves: 'Legs', adductors: 'Legs', abductors: 'Legs',
  frontDelts: 'Shoulders', sideDelts: 'Shoulders', rearDelts: 'Shoulders', biceps: 'Arms', triceps: 'Arms', forearms: 'Arms',
  abs: 'Core', obliques: 'Core',
};

/** Food for each day of the window. The last day is the Food tab's own day, which runs until 4 a.m. */
function readFood(store: WorkoutStore, days: string[], now: Date): { food: FoodDayIn[]; nextMeal: HomeInput['nextMeal'] } {
  const repo = store.repo, entries = repo.list('food_entries'), mealsInOrder = mealList(repo);
  const foodToday = attributedDay(now);
  const calendarToday = days[days.length - 1];
  const food = days.map((day, i) => {
    const last = i === days.length - 1, d = last ? foodToday : day;
    // Before 4 a.m. the Food tab still files food under yesterday. Home shows it under today, as the Food tab does, so
    // yesterday's column leaves it out; food filed under the calendar day itself in those hours still counts for today.
    const sources = last ? [...new Set([foodToday, calendarToday])] : day === foodToday && foodToday !== calendarToday ? [] : [day];
    const rows = entries.filter(r => sources.includes(String(r.data.day))), sum = totals(rows);
    let targets: ReturnType<typeof foodTargets>['targets'] = null;
    try { targets = foodTargets(repo, d).targets; } catch { /* a day without targets still shows what was logged */ }
    const meals = i === days.length - 1 ? mealsInOrder.map(m => {
      const mine = rows.filter(r => String(r.data.meal_id) === m.id), s = totals(mine);
      const at = mine.length ? Math.min(...mine.map(r => r.updated_at)) : null;
      return { id: m.id, name: m.name, kcal: s.energy_kj === null ? null : s.energy_kj / KJ, protein: s.protein_g, count: mine.length, loggedAt: at === null ? null : new Date(at) };
    }) : [];
    return {
      kcal: sum.energy_kj === null ? null : sum.energy_kj / KJ, protein: sum.protein_g, carbs: sum.carbs_g, fat: sum.fat_g,
      goalKcal: targets ? targets.energy_kj / KJ : null, goalProtein: targets ? targets.protein_g : null, meals,
    };
  });
  const today = food[food.length - 1].meals;
  const open = today.find(m => m.count === 0) ?? today[today.length - 1];
  return { food, nextMeal: open ? { id: open.id, name: open.name } : null };
}

function readTraining(store: WorkoutStore, days: string[]) {
  const index = new Map(days.map((d, i) => [d, i]));
  const volumeKg = days.map(() => 0), byGroup: Record<string, number> = {};
  let workouts = 0, lastWeek = 0;
  for (const session of store.trainingHistory()) {
    const i = index.get(String(session.data.day));
    if (i === undefined) continue;
    let total = 0;
    for (const entry of store.entries(session.id)) {
      const kg = entryVolumeKg(store, entry);
      total += kg;
      if (i >= days.length - 7) { const g = GROUP[exerciseFor(String(entry.data.exercise)).main ?? ''] ?? 'Other'; byGroup[g] = (byGroup[g] ?? 0) + kg; }
    }
    volumeKg[i] += total;
    if (i >= days.length - 7) workouts++;
    else if (i >= days.length - 14) lastWeek += total;
  }
  return { volumeKg, byGroup, workouts, lastWeek };
}

function readActive(store: WorkoutStore): ActiveWorkoutIn | null {
  const session = store.active();
  if (!session) return null;
  const order = store.loggerOrder(session.id);
  const done = order.filter(slot => !!store.drafts(slot.entryId)[slot.index]?.setId).length;
  const started = num(session.data.started_at);
  return { name: String(session.data.name ?? ''), startedAt: started === null ? null : new Date(started), setsDone: done, setsTotal: order.length };
}

function readUpNext(store: WorkoutStore): string | null {
  try {
    const plans = new PlanStore(store.repo), days = plans.read().days;
    const routine = days.length ? store.templates().find(r => r.id === days[plans.nextIndex()]?.routineId) : undefined;
    if (!routine) return null;
    const n = store.templateExercises(routine.id).length;
    return `${String(routine.data.name ?? '')} · ${pluralize(n, 'exercise')}`;
  } catch { return null; }
}

/** The Insight Score for each day of the window, worked out as it stood at the end of that day. Held in memory only. */
function readScores(store: WorkoutStore, days: string[], now: Date, health: HealthDays | null): ScoreDayIn[] {
  const slice = (list: (number | null)[] | null | undefined, i: number) => list ? list.slice(Math.max(0, i - 6), i + 1) : null;
  return days.map((day, i) => {
    const [y, m, d] = day.split('-').map(Number);
    const at = i === days.length - 1 ? now : new Date(y, m - 1, d, 23, 59);
    const h = health ? { ...health, steps: slice(health.steps, i), sleepHours: slice(health.sleepHours, i) } : null;
    try {
      const s = readScore(store, at, h);
      return { value: s.value, training: s.pillars.training, food: s.pillars.food, recovery: s.pillars.recovery };
    } catch { return { value: null, training: null, food: null, recovery: null }; }
  });
}

/** Everything Home's tiles read from the app's own stores (food, workouts, weigh-ins, plans), for the window ending today. */
export function readAppData(store: WorkoutStore, now: Date, health: HealthDays | null) {
  const days = windowDays(now);
  const { food, nextMeal } = readFood(store, days, now);
  const training = readTraining(store, days);
  const weighIns = dailyWeights(store.repo.list('weigh_ins')).map(w => ({ day: w.day, kg: w.kg, at: null }));
  const recent = recentFoods(store.repo).slice(0, 6).map(f => ({
    name: String(f.name ?? ''), serving: num(f.amount_g) ? `${Math.round(num(f.amount_g)!)} g` : '',
    kcal: (num(f.energy_kj) ?? 0) / KJ, protein: num(f.protein_g) ?? 0,
  })).filter(f => f.name);
  return {
    days, food, nextMeal, recentFoods: recent, weighIns,
    volumeKg: training.volumeKg, volumeByGroupKg: training.byGroup, volumeLastWeekKg: training.lastWeek, workoutsThisWeek: training.workouts,
    active: readActive(store), upNext: readUpNext(store), score: readScores(store, days, now, health),
    weightUnit: store.unit(),
  };
}
