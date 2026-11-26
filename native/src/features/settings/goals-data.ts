import type { Repository } from '@/data/repository';
import { lastWeight, dailyWeights } from '@/features/body/model';
import { KJ, dayView, goalsFor } from '@/features/food/day';
import { setTargets } from '@/features/food/model';
import { readWater, setWaterGoal } from '@/features/food/water';
import { today } from '@/features/onboarding/model';

/** Goals and targets on the app's own data: food targets (food_targets), the water goal, and the weight goal (goals, kind weight). */
export interface GoalsData { kcal: number; protein: number; set: boolean; waterL: number; drankL: number; eaten: number; proteinSoFar: number;
  goalKg: number | null; currentKg: number | null; currentDay: string | null; startKg: number | null }

const LB = 2.2046226218487757;

export function readGoalsData(repo: Repository, day = today()): GoalsData {
  const g = goalsFor(repo, day), v = dayView(repo, day, { today: day }), water = readWater(repo);
  const weighs = repo.list('weigh_ins'), daily = dailyWeights(weighs);
  const goal = repo.list('goals').filter(r => r.deleted_at === null && r.data.kind === 'weight' && typeof r.data.target_value === 'number')
    .sort((a, b) => b.updated_at - a.updated_at)[0];
  const goalKg = goal ? (goal.data.target_unit === 'lb' ? Number(goal.data.target_value) / LB : Number(goal.data.target_value)) : null;
  const drank = (water.log[day] ?? []).reduce((a, d) => a + (Number(d.oz) || 0), 0) / 33.814;
  return { kcal: Math.round(g.kcal), protein: Math.round(g.p), set: g.set, waterL: water.goal, drankL: drank, eaten: Math.round(v.eaten), proteinSoFar: Math.round(v.p),
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
