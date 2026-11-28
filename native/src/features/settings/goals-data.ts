import type { Repository } from '@/data/repository';
import type { Row } from '@/data/rows';
import { lastWeight, dailyWeights } from '@/features/body/model';
import { KJ, dayView, goalsFor } from '@/features/food/day';
import { setTargets } from '@/features/food/model';
import { readWater, setWaterGoal } from '@/features/food/water';
import { today } from '@/features/onboarding/model';

/** Goals and targets on the app's own data: food targets (food_targets), the water goal, and the weight goal (goals, kind weight). */
export interface GoalsData { kcal: number; protein: number; set: boolean; waterL: number; drankL: number; /** Null when food was logged without its energy. */ eaten: number | null; proteinSoFar: number | null;
  goalKg: number | null; currentKg: number | null; currentDay: string | null; startKg: number | null }

const LB = 2.2046226218487757;

/** The saved weight goal in kilograms, from the newest goals row of kind weight; null when none is set. */
export function weightGoalKg(repo: Pick<Repository, 'list'>): number | null {
  const goal = repo.list('goals').filter(r => r.deleted_at === null && r.data.kind === 'weight' && typeof r.data.target_value === 'number')
    .sort((a, b) => b.updated_at - a.updated_at)[0];
  if (!goal) return null;
  const kg = goal.data.target_unit === 'lb' ? Number(goal.data.target_value) / LB : Number(goal.data.target_value);
  return Number.isFinite(kg) && kg > 0 ? kg : null;
}

export function readGoalsData(repo: Repository, day = today()): GoalsData {
  const g = goalsFor(repo, day), v = dayView(repo, day, { today: day }), water = readWater(repo);
  const weighs = repo.list('weigh_ins'), daily = dailyWeights(weighs);
  const goalKg = weightGoalKg(repo);
  const drank = (water.log[day] ?? []).reduce((a, d) => a + (Number(d.oz) || 0), 0) / 33.814;
  return { kcal: Math.round(g.kcal), protein: Math.round(g.p), set: g.set, waterL: water.goal, drankL: drank, eaten: v.eaten == null ? null : Math.round(v.eaten), proteinSoFar: v.p == null ? null : Math.round(v.p),
    goalKg, currentKg: lastWeight(weighs), currentDay: daily.at(-1)?.day ?? null, startKg: daily[0]?.kg ?? null };
}

/** Sets today's calorie or protein target; the other targets stay as they are. */
export function saveFoodTarget(repo: Repository, which: 'kcal' | 'protein', value: number, day = today()) {
  const g = goalsFor(repo, day);
  const kcal = which === 'kcal' ? value : g.kcal, protein = which === 'protein' ? value : g.p;
  setTargets(repo, day, { energy_kj: kcal * KJ, protein_g: protein, carbs_g: g.c, fat_g: g.f });
}
export function saveWaterGoal(repo: Repository, litres: number) { setWaterGoal(repo, litres); }

/** The weight goal, kept as the person typed it (pounds or kilograms) in the goals table that Progress reads. */
export function saveGoalWeight(repo: Repository, value: number, unit: 'lb' | 'kg') {
  if (!Number.isFinite(value) || value <= 0) throw new Error('Invalid goal weight.');
  const row = repo.list('goals').find(r => r.deleted_at === null && r.data.kind === 'weight');
  repo.save('goals', { kind: 'weight', target_value: value, target_unit: unit, target_day: null }, row?.id);
}

/** How the weight goal and today's food targets are stored, so a change made to try something can be undone exactly,
 * including a goal that was never set or targets that were still estimated. */
type Stored = { id: string; data: Row['data'] };
export interface StoredGoals { weight: Stored | null; food: Stored | null; basis: string | undefined; day: string }
export function readStoredGoals(repo: Repository, day = today()): StoredGoals {
  const w = repo.list('goals').find(r => r.deleted_at === null && r.data.kind === 'weight');
  const f = repo.list('food_targets').find(r => r.deleted_at === null && r.data.day === day);
  return { weight: w ? { id: w.id, data: { ...w.data } } : null, food: f ? { id: f.id, data: { ...f.data } } : null,
    basis: repo.localGet<Record<string, string>>('foodTargetBasis')?.[day], day };
}
/** Puts the weight goal or today's food targets back as readStoredGoals found them. */
export function restoreStoredGoals(repo: Repository, was: StoredGoals, which: 'weight' | 'food') {
  repo.atomic(() => {
    if (which === 'weight') {
      if (was.weight) repo.save('goals', was.weight.data, was.weight.id);
      else for (const r of repo.list('goals')) if (r.deleted_at === null && r.data.kind === 'weight') repo.remove('goals', r.id);
      return;
    }
    if (was.food) repo.save('food_targets', was.food.data, was.food.id);
    else for (const r of repo.list('food_targets')) if (r.deleted_at === null && r.data.day === was.day) repo.remove('food_targets', r.id);
    const map = { ...(repo.localGet<Record<string, string>>('foodTargetBasis') ?? {}) };
    if (was.basis === undefined) delete map[was.day]; else map[was.day] = was.basis;
    repo.localSave('foodTargetBasis', map);
  });
}
/** Whether the weight goal or today's food targets are stored differently from how readStoredGoals found them. */
export function storedGoalsChanged(repo: Repository, was: StoredGoals, which: 'weight' | 'food'): boolean {
  const now = readStoredGoals(repo, was.day);
  const part = (g: StoredGoals) => JSON.stringify(which === 'weight' ? g.weight : [g.food, g.basis ?? null]);
  return part(now) !== part(was);
}
