import type { Entitlement, PlusFeature } from './types';

export { FREE_AI_FOOD_LOGS_PER_DAY } from '../food/ai/config';

/** Safety, ownership, trends and plain workout summaries are always free. */
export const ALWAYS_FREE = Object.freeze([
  'crisis988', 'dataExport', 'dataDeletion', 'logging', 'checkins', 'workouts',
  'barcode', 'pwaImport', 'basicTrends', 'advancedTrends', 'workoutSummary', 'widgets', 'liveActivity',
] as const);
export type FreeFeature = typeof ALWAYS_FREE[number];
export type Feature = FreeFeature | PlusFeature;

export const FEATURE_ENTITLEMENTS = Object.freeze({
  crisis988: 'free', dataExport: 'free', dataDeletion: 'free', logging: 'free',
  checkins: 'free', workouts: 'free', barcode: 'free', pwaImport: 'free',
  basicTrends: 'free', advancedTrends: 'free', workoutSummary: 'free', widgets: 'free', liveActivity: 'free',
  aiFoodUnlimited: 'plus', aiHigherCaps: 'plus',
  aiVoiceFoodLog: 'plus', aiRecipeImport: 'plus', aiMenuScan: 'plus',
} satisfies Record<FreeFeature, 'free'> & Record<PlusFeature, 'plus'>);

/** AI food-log quotas use the daily allowance above; enforcement belongs to callers. */
export function isFeatureAvailable(feature: Feature, entitlement: Entitlement): boolean {
  const required = FEATURE_ENTITLEMENTS[feature];
  return required === 'free' || (required === 'plus' && entitlement === 'plus');
}
