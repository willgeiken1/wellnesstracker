import { localDay } from '@/core/workout/rules';
import type { WorkoutStore } from '@/data/workout/store';
import { attributedDay, foodTargets, totals } from '@/features/food/model';
import { PlanStore } from '@/features/plans/store';
import type { HealthDays } from '../health/days';
import type { Row } from '@/data/rows';
import { BASELINE_DAYS, SCORE_WEIGHTS_KEY, WINDOW_DAYS, cleanWeights, insightScore, type FoodDay, type Score, type Weights } from './model';

const KJ = 4.184;
export function readWeights(store: WorkoutStore): Weights {
  try { return cleanWeights(store.repo.localGet<unknown>(SCORE_WEIGHTS_KEY)); } catch { return cleanWeights(null); }
}
/** Saves the person's weights on this phone. Only the three weights: never a score or a health value. */
export function saveWeights(store: WorkoutStore, weights: Weights): void {
  try { store.repo.localSave(SCORE_WEIGHTS_KEY, weights); } catch { /* the screen keeps the change for this visit */ }
}
function workoutGoal(store: WorkoutStore): number {
  try { return new PlanStore(store.repo).read().daysPerWeek; } catch { return 3; }
}

/** Works the score out from what is logged on this phone plus, when given, steps and sleep held in memory. Saves nothing. */
export function readScore(store: WorkoutStore, now: Date, health: HealthDays | null, weights: Weights = readWeights(store)): Score {
  const days = Array.from({ length: WINDOW_DAYS }, (_, i) => localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (WINDOW_DAYS - 1) + i)));
  // Food follows the Food tab's day, which runs until 4 a.m. Until then "today" for food is still yesterday,
  // so the day that is still open is the one left out of the average, and nothing shifts at midnight.
  const foodEnd = attributedDay(now), [fy, fm, fd] = foodEnd.split('-').map(Number);
  const foodDays = Array.from({ length: WINDOW_DAYS }, (_, i) => localDay(new Date(fy, fm - 1, fd - (WINDOW_DAYS - 1) + i)));
  return store.reading(() => {
    const recent = new Set(days), logged = new Set<string>(), trained = new Set<string>();
    const entries = store.repo.list('food_entries'), byDay = new Map<string, Row[]>(foodDays.map(day => [day, []]));
    for (const row of entries) {
      const day = String(row.data.day);
      logged.add(day);
      byDay.get(day)?.push(row);
    }
    // Only this week's workouts are opened for the training pillar. Older ones only matter to the count of days
    // logged, and only until it reaches the baseline: past that the score is the same however many days there are,
    // so the walk stops instead of opening a whole history of workouts on every change.
    for (const session of store.history()) {
      const day = String(session.data.day), inWindow = recent.has(day);
      if (!inWindow && (logged.size >= BASELINE_DAYS || logged.has(day))) continue;
      if (!store.trained(session)) continue;
      logged.add(day);
      if (inWindow) trained.add(session.id);
    }
    const food: FoodDay[] = foodDays.map(day => {
      const rows = byDay.get(day)!, sum = totals(rows);
      let targets: ReturnType<typeof foodTargets>['targets'] = null;
      try { targets = foodTargets(store.repo, day).targets; } catch { /* a day without a target still counts when logged */ }
      return { logged: rows.length > 0, kcal: sum.energy_kj === null ? null : sum.energy_kj / KJ, protein: sum.protein_g,
        goalKcal: targets ? targets.energy_kj / KJ : null, goalProtein: targets ? targets.protein_g : null };
    });
    return insightScore({ daysLogged: logged.size, workouts: trained.size, workoutGoal: workoutGoal(store), food,
      steps: health?.steps ?? null, sleepHours: health?.sleepHours ?? null, sleepOpen: now.getHours() < 12, weights });
  });
}
