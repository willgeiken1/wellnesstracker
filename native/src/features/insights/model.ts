import { localDay } from '@/core/workout/rules';
import type { WorkoutStore } from '@/data/workout/store';
import { foodTargets, totals } from '@/features/food/model';
import { entryVolumeKg } from '@/features/workout/volume';

export interface DayPoint {
  day: string;
  /** Calories and protein logged that day; null when nothing with a value was logged. */
  kcal: number | null; protein: number | null;
  /** How many foods were filed under the day, with or without calories. */
  foods: number;
  /** That day's own targets; null when none were set or could be estimated. */
  targetKcal: number | null; targetProtein: number | null;
  workouts: number; volumeKg: number;
}
/** The `count` calendar days ending today, oldest first. */
export function lastDays(count: number, now = new Date()): string[] {
  return Array.from({ length: count }, (_, i) => localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (count - 1) + i)));
}
/** Monday to today of the current week, oldest first. */
export function weekDays(now = new Date()): string[] {
  const sinceMonday = (now.getDay() + 6) % 7;
  return lastDays(sinceMonday + 1, now);
}
/**
 * What was logged on each day, read-only. Food is counted under the day it was filed; workouts under their day.
 * `_revision` is the food revision: passing it makes compiled memoization re-read after a food save.
 */
export function dayPoints(store: WorkoutStore, days: string[], _revision = 0): DayPoint[] {
  const food = store.repo.list('food_entries'), out = new Map<string, DayPoint>();
  for (const day of days) {
    const rows = food.filter(row => row.data.day === day), sum = totals(rows), targets = foodTargets(store.repo, day).targets;
    out.set(day, { day, foods: rows.length, kcal: sum.energy_kj === null ? null : sum.energy_kj / 4.184, protein: sum.protein_g,
      targetKcal: targets ? targets.energy_kj / 4.184 : null, targetProtein: targets ? targets.protein_g : null, workouts: 0, volumeKg: 0 });
  }
  // Only workouts with a counted set: a past-day draft that was opened and left empty is not a workout.
  for (const session of store.trainingHistory()) {
    const point = out.get(String(session.data.day));
    if (!point) continue;
    point.workouts += 1;
    for (const entry of store.entries(session.id)) point.volumeKg += entryVolumeKg(store, entry);
  }
  return days.map(day => out.get(day)!);
}
export const hasAny = (points: DayPoint[]) => points.some(p => p.foods > 0 || p.workouts > 0);
const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
/** A day is on target when its calories land between 80% and 115% of that day's target. */
export const onTarget = (p: DayPoint) => p.kcal !== null && p.targetKcal !== null && p.kcal >= p.targetKcal * 0.8 && p.kcal <= p.targetKcal * 1.15;
export interface WeekReport { workouts: number; volumeKg: number; foodDays: number; onTargetDays: number; targetDays: number; avgKcal: number | null; avgProtein: number | null; days: number }
export function weekReport(points: DayPoint[]): WeekReport {
  const logged = points.filter(p => p.kcal !== null);
  return {
    days: points.length, workouts: points.reduce((n, p) => n + p.workouts, 0), volumeKg: points.reduce((n, p) => n + p.volumeKg, 0),
    // A day with food counts even when none of it has calories entered.
    foodDays: points.filter(p => p.foods > 0).length, targetDays: logged.filter(p => p.targetKcal !== null).length, onTargetDays: points.filter(onTarget).length,
    avgKcal: mean(logged.map(p => p.kcal!)), avgProtein: mean(points.filter(p => p.protein !== null).map(p => p.protein!)),
  };
}
export const average = mean;
