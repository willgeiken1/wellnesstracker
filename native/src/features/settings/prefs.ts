import { useCallback, useSyncExternalStore } from 'react';
import { useAuth } from '@/auth/provider';
import { memoryStore, snapshot, withPref, SETTINGS_PREFS_KEY, type PrefsStorage, type SettingsPrefs } from './prefs-model';

export * from './prefs-model';

function useStorage(): PrefsStorage {
  let repo: PrefsStorage | null = null;
  // eslint-disable-next-line react-hooks/rules-of-hooks -- useAuth runs on every render; the catch only covers its missing-provider throw, which comes after its one useContext.
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
