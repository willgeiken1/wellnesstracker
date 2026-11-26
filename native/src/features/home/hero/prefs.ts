import { useCallback, useSyncExternalStore } from 'react';
import { useAuth } from '@/auth/provider';

/**
 * Insight map: every choice about the Home hero, kept on this phone with the person's other local settings.
 * hero: the whole hero (off leaves the greeting); map: the artwork (off keeps the numbers); style: aurora or ridge;
 * detail 0..2 (contour count); labels: values on the map; glow 0..1; motion full or calm (calm skips the opening build);
 * lines: the faint isobars behind Home; week: This week. Settings, Appearance, Insight map edits these.
 */
export type MapStyle = 'aurora' | 'ridge';
export interface MapPrefs { hero: boolean; map: boolean; style: MapStyle; detail: 0 | 1 | 2; labels: boolean; glow: number; motion: 'full' | 'calm'; lines: boolean; week: boolean }
export const MAP_PREFS_KEY = 'insightMap';
export const MAP_DEFAULTS: MapPrefs = { hero: true, map: true, style: 'aurora', detail: 1, labels: true, glow: 1, motion: 'full', lines: true, week: true };
export const MAP_STYLES: readonly MapStyle[] = ['aurora', 'ridge'];
interface Storage { localGet<T>(key: string): T | undefined; localSave(key: string, value: unknown): void; subscribe?(listener: () => void): () => void }

/** A saved value back to a clean shape: anything missing or of the wrong kind takes its default. */
export function readMapPrefs(saved: unknown): MapPrefs {
  const out = { ...MAP_DEFAULTS };
  if (!saved || typeof saved !== 'object') return out;
  const s = saved as Record<string, unknown>;
  for (const k of ['hero', 'map', 'labels', 'lines', 'week'] as const) if (typeof s[k] === 'boolean') out[k] = s[k];
  if (MAP_STYLES.includes(s.style as MapStyle)) out.style = s.style as MapStyle;
  if (s.detail === 0 || s.detail === 1 || s.detail === 2) out.detail = s.detail;
  if (typeof s.glow === 'number' && Number.isFinite(s.glow)) out.glow = Math.min(1, Math.max(0, s.glow));
  if (s.motion === 'full' || s.motion === 'calm') out.motion = s.motion;
  return out;
}

let memory: unknown = undefined;
const memoryListeners = new Set<() => void>();
const memoryStore: Storage = {
  localGet: <T,>() => memory as T,
  localSave: (_k, v) => { memory = v; memoryListeners.forEach(l => l()); },
  subscribe: l => { memoryListeners.add(l); return () => { memoryListeners.delete(l); }; },
};
/** Test hook: forget the in-memory choices. */
export function resetMemoryMapPrefs() { memory = undefined; }
function useStorage(): Storage { try { return useAuth().repository ?? memoryStore; } catch { return memoryStore; } }
const cache = new WeakMap<Storage, { raw: string; prefs: MapPrefs }>();
function snapshot(storage: Storage): MapPrefs {
  let raw: unknown;
  try { raw = storage.localGet<unknown>(MAP_PREFS_KEY); } catch { raw = undefined; }
  const prefs = readMapPrefs(raw), key = JSON.stringify(prefs), hit = cache.get(storage);
  if (hit && hit.raw === key) return hit.prefs;
  cache.set(storage, { raw: key, prefs });
  return prefs;
}

/** The Insight map choices and a way to change them; changes save at once and Home follows. */
export function useMapPrefs(): [MapPrefs, (patch: Partial<MapPrefs> | null) => void] {
  const storage = useStorage();
  const subscribe = useCallback((l: () => void) => storage.subscribe ? storage.subscribe(l) : () => {}, [storage]);
  const prefs = useSyncExternalStore(subscribe, () => snapshot(storage), () => snapshot(storage));
  const set = useCallback((patch: Partial<MapPrefs> | null) => {
    // null resets every choice to its default.
    const next = patch === null ? { ...MAP_DEFAULTS } : readMapPrefs({ ...snapshot(storage), ...patch });
    try { storage.localSave(MAP_PREFS_KEY, next); } catch { /* not kept: Home keeps the last saved choices */ }
  }, [storage]);
  return [prefs, set];
}
