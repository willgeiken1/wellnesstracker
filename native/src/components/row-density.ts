import { useSyncExternalStore } from 'react';
import { useAuth } from '@/auth/provider';

/**
 * List density (Settings, Appearance): how tall every list row in the app is. The choice is kept with the other Settings
 * choices (`settings-prefs`, `look.density`); rows read it here so the kit does not depend on the Settings screens.
 */
export type RowDensity = 'airy' | 'balanced' | 'dense';
/** `.row` under each density: minimum height and the space above and below. */
export const ROW_DENSITY: Record<RowDensity, { minHeight: number; paddingVertical: number }> = {
  airy: { minHeight: 62, paddingVertical: 13 }, balanced: { minHeight: 56, paddingVertical: 10 }, dense: { minHeight: 46, paddingVertical: 5 },
};
type Source = { localGet<T>(key: string): T | undefined; subscribe?(listener: () => void): () => void };

export function readRowDensity(source: Source | null | undefined): RowDensity {
  try {
    const d = source?.localGet<{ look?: { density?: unknown } }>('settings-prefs')?.look?.density;
    return d === 'airy' || d === 'dense' ? d : 'balanced';
  } catch { return 'balanced'; }
}
/* One read per change of the data, however many rows are on screen. */
const seen = new WeakMap<object, { revision: unknown; density: RowDensity }>();
function current(source: Source | null): RowDensity {
  if (!source) return 'balanced';
  const revision = (source as { getRevision?: () => unknown }).getRevision?.();
  const hit = seen.get(source);
  if (hit && revision !== undefined && hit.revision === revision) return hit.density;
  const density = readRowDensity(source);
  seen.set(source, { revision, density });
  return density;
}
const idle = () => () => {};

/** The density rows draw at now; it follows the Settings choice as it changes. Balanced outside the app's providers. */
export function useRowDensity(): RowDensity {
  let source: Source | null = null;
  try { source = useAuth().repository ?? null; } catch { source = null; }
  return useSyncExternalStore(source?.subscribe ? l => source.subscribe!(l) : idle, () => current(source), () => current(source));
}
