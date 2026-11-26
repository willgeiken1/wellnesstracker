import type { Repository } from '../../data/repository';
import { t } from '../../i18n/en';
import { loadSettingsPrefs, type PrefsStorage } from '../settings/prefs';
import { num } from './day';
import { useFoodRevision } from './use-food-revision';

/**
 * How food weights read. Amounts are always stored in grams (`amount_g`); only what the person reads changes.
 * Ounces follow the Units setting: US (lb) reads food in ounces, metric (kg) keeps grams.
 */
export type FoodWeightUnit = 'oz' | 'g';
/** One avoirdupois ounce in grams, exactly. */
export const OZ_G = 28.349523125;

export function foodWeightUnit(storage: PrefsStorage | null | undefined, _revision?: number): FoodWeightUnit {
  return loadSettingsPrefs(storage).units.weight === 'kg' ? 'g' : 'oz';
}
/** The unit for the Food screens, redrawn when the setting changes (the revision is passed so the read is never memoized past a change). */
export function useFoodWeightUnit(repo: Repository): FoodWeightUnit {
  const revision = useFoodRevision(repo);
  return foodWeightUnit(repo, revision);
}

/** Grams to ounces, to one place like the water sizes: 170 g reads 6, 150 g reads 5.3. */
export const ozOf = (grams: number) => Math.round(grams / OZ_G * 10) / 10;
export const gramsOfOz = (oz: number) => oz * OZ_G;
/** "6" or "5.3": whole ounces drop the place. */
export const ozNum = (grams: number) => { const v = ozOf(grams); return v % 1 ? v.toFixed(1) : num(v); };
/** A food amount as the person reads it: "6 oz" or "170 g". */
export function weightText(grams: number, unit: FoodWeightUnit) {
  return unit === 'oz' ? `${ozNum(grams)} ${t('foodUnitOz')}` : `${num(grams)} ${t('foodUnitG')}`;
}
