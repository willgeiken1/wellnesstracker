import { formatNumber } from '@/components/stepper';
import type { Repository } from '@/data/repository';
import { readWater } from '@/features/food/water';
import { readGoalsData, saveFoodTarget, saveGoalWeight, saveWaterGoal } from '@/features/settings/goals-data';
import type { SettingsPrefs } from '@/features/settings/prefs-model';
import { t } from '@/i18n/en';
import type { GoalKey } from '../look';

const LB = 2.20462, KJ = 4.184, FLOZ = 33.814;
/** Where a goal is read from and written to: the same places Settings, Goals uses, so every page that shows it follows. */
export interface GoalCtx { repo: Repository | null; prefs: SettingsPrefs; set: (path: string, value: unknown) => void; units: SettingsPrefs['units'] }
export interface GoalSpec {
  label: string;
  where: string;
  /** The goal in the unit it steps in (kcal, g, min, lb or kg, litres). */
  get: (c: GoalCtx) => number;
  set: (c: GoalCtx, v: number) => void;
  step: (c: GoalCtx) => number;
  min: (c: GoalCtx) => number;
  max: (c: GoalCtx) => number;
  show: (c: GoalCtx, v: number) => string;
}
function goals(repo: Repository | null) { try { return repo ? readGoalsData(repo) : null; } catch { return null; } }
const kg = (c: GoalCtx) => c.units.weight === 'kg';
const ml = (c: GoalCtx) => c.units.water === 'ml';

export const GOALS: Record<GoalKey, GoalSpec> = {
  kcal: {
    label: t('teGKcal'), where: t('teWKcal'),
    get: c => goals(c.repo)?.kcal ?? c.prefs.goals.kcal,
    set: (c, v) => { if (c.repo) saveFoodTarget(c.repo, 'kcal', v); else c.set('goals.kcal', v); },
    step: () => 50, min: () => 1000, max: () => 5000,
    show: (c, v) => c.units.energy === 'kJ' ? `${formatNumber(Math.round(v * KJ / 10) * 10)} kJ` : `${formatNumber(v)} kcal`,
  },
  protein: {
    label: t('teGProtein'), where: t('teWProtein'),
    get: c => goals(c.repo)?.protein ?? c.prefs.goals.protein,
    set: (c, v) => { if (c.repo) saveFoodTarget(c.repo, 'protein', v); else c.set('goals.protein', v); },
    step: () => 5, min: () => 40, max: () => 300, show: (_c, v) => `${v} g`,
  },
  train: {
    label: t('teGTrain'), where: t('teWTrain'),
    get: c => c.prefs.goals.train, set: (c, v) => c.set('goals.train', v),
    step: () => 5, min: () => 10, max: () => 180, show: (_c, v) => `${v} min`,
  },
  sleep: {
    label: t('teGSleep'), where: t('teWSleep'),
    get: c => c.prefs.goals.sleep, set: (c, v) => c.set('goals.sleep', v),
    step: () => 15, min: () => 300, max: () => 660,
    show: (_c, v) => { const h = Math.floor(v / 60), m = v % 60; return `${h}h${m ? ` ${m}m` : ''}`; },
  },
  weight: {
    label: t('teGWeight'), where: t('teWWeight'),
    get: c => {
      const g = goals(c.repo)?.goalKg, lb = g != null ? g * LB : c.prefs.goals.weight;
      return kg(c) ? Math.round(lb / LB * 2) / 2 : Math.round(lb);
    },
    set: (c, v) => {
      c.set('goals.weight', kg(c) ? Math.round(v * LB * 2) / 2 : v);
      if (c.repo) saveGoalWeight(c.repo, v, kg(c) ? 'kg' : 'lb');
    },
    step: c => kg(c) ? 0.5 : 1, min: c => kg(c) ? 36 : 80, max: c => kg(c) ? 180 : 400,
    show: (c, v) => kg(c) ? `${v.toFixed(1)} kg` : `${Math.round(v)} lb`,
  },
  water: {
    label: t('teGWater'), where: t('teWWater'),
    get: c => (c.repo ? readWater(c.repo).goal : 2.5),
    set: (c, v) => { if (c.repo) saveWaterGoal(c.repo, v); },
    step: c => ml(c) ? 0.25 : 8 / FLOZ, min: () => 1, max: () => 6,
    show: (c, v) => ml(c) ? `${formatNumber(Math.round(v * 1000 / 50) * 50)} mL` : `${Math.round(v * FLOZ)} fl oz`,
  },
};
/** One step of a goal up or down, kept inside its range. */
export function stepGoal(spec: GoalSpec, c: GoalCtx, dir: 1 | -1): number {
  const v = spec.get(c), n = Math.round((v + dir * spec.step(c)) * 10000) / 10000;
  return Math.min(spec.max(c), Math.max(spec.min(c), n));
}
