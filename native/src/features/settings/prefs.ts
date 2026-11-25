import { useCallback, useSyncExternalStore } from 'react';
import { useAuth } from '@/auth/provider';

/**
 * Settings choices that have no column of their own yet: units, targets, reminders, privacy, workout and look
 * (density and app icon). Saved on this phone with the owner's other local settings under `settings-prefs`.
 * Choices only: never a health value. Theme, palette and true black live in the theme provider.
 */
export const SETTINGS_PREFS_KEY = 'settings-prefs';

export const ICON_IDS = ['litPeaks', 'duskGlow', 'clearNight'] as const;
export type AppIconId = (typeof ICON_IDS)[number];
export const DENSITIES = ['airy', 'balanced', 'dense'] as const;
export type Density = (typeof DENSITIES)[number];

export const DEFAULT_PREFS = {
  units: { weight: 'lb' as 'lb' | 'kg', height: 'ftin' as 'ftin' | 'cm', energy: 'kcal' as 'kcal' | 'kJ', water: 'floz' as 'floz' | 'ml',
    distance: 'mi' as 'mi' | 'km', clock: '12' as '12' | '24', week: 'mon' as 'mon' | 'sun' | 'sat' },
  goals: { kcal: 2200, protein: 165, train: 60, sleep: 480, weight: 178, pace: 0.5 },
  look: { density: 'balanced' as Density, icon: 'litPeaks' as AppIconId },
  priv: { lock: true, after: '1', blur: true, hide: false, crash: true, analytics: false },
  rem: { cap: true, workout: true, workoutTime: '5:30 PM', rest: true, weekly: true, food: false, breakfast: true, lunch: true, dinner: true, oura: true },
  work: { rest: 120, auto: true, warm: true, warmN: 2, awake: true, haptics: true, bar: '45', barKg: '20',
    plates: { '55': false, '45': true, '35': true, '25': true, '10': true, '5': true, '2_5': true } as Record<string, boolean>,
    platesKg: { '25': true, '20': true, '15': true, '10': true, '5': true, '2_5': true, '1_25': true } as Record<string, boolean> },
  sync: { on: true },
  later: {} as Record<string, boolean>,
};
export type SettingsPrefs = typeof DEFAULT_PREFS;

const ENUMS: Record<string, readonly string[]> = {
  'units.weight': ['lb', 'kg'], 'units.height': ['ftin', 'cm'], 'units.energy': ['kcal', 'kJ'], 'units.water': ['floz', 'ml'],
  'units.distance': ['mi', 'km'], 'units.clock': ['12', '24'], 'units.week': ['mon', 'sun', 'sat'],
  'look.density': DENSITIES, 'look.icon': ICON_IDS, 'priv.after': ['0', '1', '5', '15'],
};
const isObj = (o: unknown): o is Record<string, unknown> => !!o && typeof o === 'object' && !Array.isArray(o);

/** A saved value over the defaults, key by key: wrong types and unknown choices keep the default, so an old or damaged save still reads. */
export function readSettingsPrefs(saved: unknown): SettingsPrefs {
  const out = JSON.parse(JSON.stringify(DEFAULT_PREFS)) as SettingsPrefs;
  const merge = (into: Record<string, unknown>, from: unknown, path: string, open: boolean) => {
    if (!isObj(from)) return;
    for (const key of Object.keys(from)) {
      const here = path ? `${path}.${key}` : key, value = from[key], current = into[key];
      if (isObj(current)) merge(current, value, here, here === 'later');
      else if (current === undefined ? open && typeof value === 'boolean' : typeof value === typeof current) {
        if (ENUMS[here] && !ENUMS[here].includes(value as string)) continue;
        if (typeof value === 'number' && !Number.isFinite(value)) continue;
        into[key] = value;
      }
    }
  };
  merge(out as unknown as Record<string, unknown>, saved, '', false);
  // Plates are open sets: a saved plate the defaults do not list is still kept.
  for (const set of ['plates', 'platesKg'] as const) {
    const from = isObj(saved) && isObj(saved.work) ? saved.work[set] : undefined;
    if (isObj(from)) for (const [k, v] of Object.entries(from)) if (typeof v === 'boolean') out.work[set][k] = v;
  }
  return out;
}

/** Sets one value by its dotted path ("units.weight") and returns a new object. */
export function withPref(prefs: SettingsPrefs, path: string, value: unknown): SettingsPrefs {
  const next = JSON.parse(JSON.stringify(prefs)) as Record<string, unknown>;
  const keys = path.split('.');
  let node = next;
  for (const key of keys.slice(0, -1)) { if (!isObj(node[key])) node[key] = {}; node = node[key] as Record<string, unknown>; }
  node[keys[keys.length - 1]] = value;
  return readSettingsPrefs(next);
}

export interface PrefsStorage { localGet<T>(key: string): T | undefined; localSave(key: string, value: unknown): void; subscribe?(listener: () => void): () => void }

/* Without a repository (a guest before the phone's store opens) the choices live in memory. */
let memory: unknown;
const memoryListeners = new Set<() => void>();
const memoryStore: PrefsStorage = {
  localGet: <T,>() => memory as T,
  localSave: (_key, value) => { memory = value; memoryListeners.forEach(l => l()); },
  subscribe: listener => { memoryListeners.add(listener); return () => { memoryListeners.delete(listener); }; },
};
/** Test hook: forget the in-memory choices. */
export function resetMemorySettingsPrefs() { memory = undefined; }

const cache = new WeakMap<PrefsStorage, { key: string; prefs: SettingsPrefs }>();
function snapshot(storage: PrefsStorage): SettingsPrefs {
  let raw: unknown;
  try { raw = storage.localGet<unknown>(SETTINGS_PREFS_KEY); } catch { raw = undefined; }
  const prefs = readSettingsPrefs(raw), key = JSON.stringify(prefs), hit = cache.get(storage);
  if (hit && hit.key === key) return hit.prefs;
  cache.set(storage, { key, prefs });
  return prefs;
}
export function loadSettingsPrefs(storage: PrefsStorage | null | undefined): SettingsPrefs { return snapshot(storage ?? memoryStore); }

function useStorage(): PrefsStorage {
  let repo: PrefsStorage | null = null;
  try { repo = useAuth().repository ?? null; } catch { repo = null; }
  return repo ?? memoryStore;
}

/** The settings choices and a setter by dotted path. Changes save at once and every reader redraws. */
export function useSettingsPrefs(): [SettingsPrefs, (path: string, value: unknown) => void] {
  const storage = useStorage();
  const subscribe = useCallback((listener: () => void) => storage.subscribe ? storage.subscribe(listener) : () => {}, [storage]);
  const prefs = useSyncExternalStore(subscribe, () => snapshot(storage), () => snapshot(storage));
  const set = useCallback((path: string, value: unknown) => {
    try { storage.localSave(SETTINGS_PREFS_KEY, withPref(snapshot(storage), path, value)); } catch { /* not kept: the screen stays as last saved */ }
  }, [storage]);
  return [prefs, set];
}
