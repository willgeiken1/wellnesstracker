import type { Entitlement, PlusFeature } from './types';

/** Free safety, ownership and core logging features. Widgets are never Plus gates. */
export const ALWAYS_FREE = Object.freeze([
  'crisis988', 'dataExport', 'dataDeletion', 'logging', 'checkins', 'workouts',
  'barcode', 'pwaImport', 'basicTrends', 'widgets', 'liveActivity',
] as const);
export type FreeFeature = typeof ALWAYS_FREE[number];
export type Feature = FreeFeature | PlusFeature;

export const FEATURE_ENTITLEMENTS = Object.freeze({
  crisis988: 'free', dataExport: 'free', dataDeletion: 'free', logging: 'free',
  checkins: 'free', workouts: 'free', barcode: 'free', pwaImport: 'free',
  basicTrends: 'free', widgets: 'free', liveActivity: 'free',
  aiFoodUnlimited: 'plus', aiHigherCaps: 'plus', advancedTrends: 'plus',
} satisfies Record<FreeFeature, 'free'> & Record<PlusFeature, 'plus'>);

/** AI gates describe access beyond free tries; quota enforcement belongs to callers. */
export function isFeatureAvailable(feature: Feature, entitlement: Entitlement): boolean {
  const required = FEATURE_ENTITLEMENTS[feature];
  return required === 'free' || (required === 'plus' && entitlement === 'plus');
}
