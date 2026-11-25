import { useCallback, useSyncExternalStore } from 'react';
import { useAuth } from '@/auth/provider';
import { ACTIONS, MAX_ACTIONS, PAGE_KEYS, type PageKey } from './pages';

/** The shell's saved choices, on the phone with the person's other local settings: the tabs hidden from the bar, and each page's
 * own quick actions in order. Home is never hidden. */
export interface ShellPrefs { hidden: Partial<Record<PageKey, true>>; actions: Partial<Record<PageKey, string[]>> }
export const SHELL_PREFS_KEY = 'shell';
export const EMPTY_PREFS: ShellPrefs = { hidden: {}, actions: {} };
export interface ShellStorage { localGet<T>(key: string): T | undefined; localSave(key: string, value: unknown): void; subscribe?(listener: () => void): () => void }

/** A saved value back to a clean shape: unknown pages and actions drop out, a set keeps five at most, an empty set reads as the defaults. */
export function readPrefs(saved: unknown): ShellPrefs {
  const out: ShellPrefs = { hidden: {}, actions: {} };
  if (!saved || typeof saved !== 'object') return out;
  const { hidden, actions } = saved as { hidden?: unknown; actions?: unknown };
  if (hidden && typeof hidden === 'object')
    for (const key of PAGE_KEYS) if (key !== 'home' && (hidden as Record<string, unknown>)[key] === true) out.hidden[key] = true;
  if (actions && typeof actions === 'object')
    for (const key of PAGE_KEYS) {
      const ids = (actions as Record<string, unknown>)[key];
      if (!Array.isArray(ids)) continue;
      const known = [...new Set(ids.filter((id): id is string => typeof id === 'string' && ACTIONS[key].some(a => a.id === id)))].slice(0, MAX_ACTIONS);
      if (known.length) out.actions[key] = known;
    }
  return out;
}
export function loadPrefs(storage: ShellStorage | null | undefined): ShellPrefs {
  try { return readPrefs(storage?.localGet<unknown>(SHELL_PREFS_KEY)); } catch { return { ...EMPTY_PREFS }; }
}
export const withHidden = (prefs: ShellPrefs, key: PageKey, hide: boolean): ShellPrefs => {
  if (key === 'home') return prefs;
  const hidden = { ...prefs.hidden };
  if (hide) hidden[key] = true; else delete hidden[key];
  return { ...prefs, hidden };
};
export const withActions = (prefs: ShellPrefs, key: PageKey, ids: string[]): ShellPrefs => ({ ...prefs, actions: { ...prefs.actions, [key]: ids } });

/* Without a repository (a guest before the phone's store opens, or a screen drawn on its own) the choices live in memory. */
let memory: ShellPrefs = EMPTY_PREFS;
const memoryListeners = new Set<() => void>();
const memoryStore: ShellStorage = {
  localGet: <T,>() => memory as T,
  localSave: (_key, value) => { memory = value as ShellPrefs; memoryListeners.forEach(l => l()); },
  subscribe: listener => { memoryListeners.add(listener); return () => { memoryListeners.delete(listener); }; },
};
/** Test hook: forget the in-memory choices. */
export function resetMemoryPrefs() { memory = EMPTY_PREFS; }

function useRepository(): ShellStorage | null { try { return useAuth().repository ?? null; } catch { return null; } }
function useStorage(): ShellStorage { return useRepository() ?? memoryStore; }
/** Cached reads per storage, so the snapshot is stable until the storage changes. */
const cache = new WeakMap<ShellStorage, { raw: unknown; prefs: ShellPrefs }>();
function snapshot(storage: ShellStorage): ShellPrefs {
  let raw: unknown;
  try { raw = storage.localGet<unknown>(SHELL_PREFS_KEY); } catch { raw = undefined; }
  const hit = cache.get(storage);
  if (hit && hit.raw === raw) return hit.prefs;
  // A repository parses a fresh object on each read, so compare by content before replacing the snapshot.
  const prefs = readPrefs(raw);
  if (hit && JSON.stringify(hit.prefs) === JSON.stringify(prefs)) { cache.set(storage, { raw, prefs: hit.prefs }); return hit.prefs; }
  cache.set(storage, { raw, prefs });
  return prefs;
}

/** The shell's saved choices and a way to change them. Changes save at once and every reader redraws. */
export function useShellPrefs(): [ShellPrefs, (next: ShellPrefs) => void] {
  const storage = useStorage();
  const subscribe = useCallback((listener: () => void) => storage.subscribe ? storage.subscribe(listener) : () => {}, [storage]);
  const prefs = useSyncExternalStore(subscribe, () => snapshot(storage), () => snapshot(storage));
  const save = useCallback((next: ShellPrefs) => {
    try { storage.localSave(SHELL_PREFS_KEY, next); } catch { /* not kept: the bar stays as last saved */ }
  }, [storage]);
  return [prefs, save];
}
