import type { Repository } from '@/data/repository';
import type { Row } from '@/data/rows';
import type { WorkoutStore } from '@/data/workout/store';
import { foodTargets, totals } from '@/features/food/model';
import { PlanStore } from '@/features/plans/store';
import { dayPillars, dayScore, type DayPillars } from './day';
import type { FoodDay } from './model';

const KJ = 4.184;
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (day: string) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d); };
const back = (day: string, n: number) => { const d = parse(day); return key(new Date(d.getFullYear(), d.getMonth(), d.getDate() - n)); };

/** What was eaten on each day against that day's targets, as the day score reads it. */
export function foodDays(repo: Repository, days: readonly string[]): FoodDay[] {
  const byDay = new Map<string, Row[]>();
  for (const r of repo.list('food_entries')) { const k = String(r.data.day); byDay.set(k, [...(byDay.get(k) ?? []), r]); }
  return days.map(day => {
    const rows = byDay.get(day) ?? [];
    if (!rows.length) return { logged: false, kcal: null, protein: null, goalKcal: null, goalProtein: null };
    const s = totals(rows);
    let targets: ReturnType<typeof foodTargets>['targets'] = null;
    try { targets = foodTargets(repo, day).targets; } catch { /* a day without a target still counts */ }
    return { logged: true, kcal: s.energy_kj == null ? null : s.energy_kj / KJ, protein: s.protein_g,
      goalKcal: targets ? targets.energy_kj / KJ : null, goalProtein: targets ? targets.protein_g : null };
  });
}

export interface ScoreDaysInput {
  store: Pick<WorkoutStore, 'repo' | 'trainingHistory' | 'active'>;
  /** Local days, oldest first; the last one is today. */
  days: readonly string[];
  /** Steps and hours slept on those same days, or null with no reading. */
  steps?: readonly (number | null | undefined)[] | null;
  sleepHours?: readonly (number | null | undefined)[] | null;
  /** Already worked out by the caller for the same days, to save reading food twice. */
  foods?: readonly FoodDay[];
}

/**
 * The day score's pillars for each of `days`, from what is logged on this phone plus steps and sleep held in memory.
 * The one place Home's hero and Progress get a day's score from, so both always show the same number for a day.
 * Saves nothing.
 */
export function scoreDays({ store, days, steps, sleepHours, foods }: ScoreDaysInput): DayPillars[] {
  const today = days[days.length - 1];
  const sessions = store.trainingHistory(), active = store.active();
  const trained = new Set(sessions.map(s => String(s.data.day)));
  if (active && today) trained.add(today);
  const firstDay = sessions.map(s => String(s.data.day)).sort()[0] ?? (active ? today : null);
  let perWeek = 3;
  try { perWeek = new PlanStore(store.repo as Repository).read().daysPerWeek; } catch { perWeek = 3; }
  const food = foods ?? foodDays(store.repo as Repository, days);
  const at = (list: ScoreDaysInput['steps'], i: number) => { const v = list?.[i]; return finite(v) ? v : null; };
  return days.map((day, i) => {
    let week = 0;
    for (let b = 0; b < 7; b++) if (trained.has(back(day, b))) week++;
    return dayPillars({ trained: trained.has(day), weekWorkouts: week, perWeek, steps: at(steps, i), food: food[i],
      sleepHours: at(sleepHours, i), logsTraining: !!firstDay && day >= firstDay });
  });
}

/** One day score for each of `days` (see `scoreDays`), or null for a day with nothing to go on. */
export const dayScores = (input: ScoreDaysInput): (number | null)[] => scoreDays(input).map(dayScore);

/**
 * The day score for each of the 7 days ending on `now`'s day, oldest first, from steps and sleep read for days ending
 * today (any length). What Home's hero shows, and the last week of Progress's score history.
 */
export function weekScores(store: ScoreDaysInput['store'], now: Date, health: { steps?: readonly (number | null)[] | null; sleepHours?: readonly (number | null)[] | null } | null) {
  const days = Array.from({ length: 7 }, (_, i) => key(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + i)));
  return dayScores({ store, days, steps: lastOf(health?.steps, 7), sleepHours: lastOf(health?.sleepHours, 7) });
}

/** The last `n` values of a list read for days ending today, lined up with `n` days ending today. */
export function lastOf<T>(list: readonly T[] | null | undefined, n: number): (T | null)[] {
  const l = list ?? [];
  return Array.from({ length: n }, (_, i) => { const j = l.length - n + i; return j >= 0 ? l[j] : null; });
}
