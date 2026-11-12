import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { appleHealth } from './apple';
import { readHealthDays, type HealthDays } from './days';
import type { HealthSource } from './source';

/** Steps and sleep for the days on screen, read fresh from Apple Health whenever the screen comes to the front:
 * on arrival, on returning from another screen, and when the app is reopened. Kept in memory for this screen
 * only. Null until connected, and wherever Apple Health is not available. */
export function useHealthDays(days: readonly string[], focused = true, injected?: HealthSource | null): HealthDays | null {
  const source = useMemo(() => injected !== undefined ? injected : appleHealth(), [injected]);
  const key = days.join(',');
  const [read, setRead] = useState<{ key: string; value: HealthDays | null }>({ key: '', value: null });
  useEffect(() => {
    if (!source || !key || !focused) return;
    // Only the newest read may land: a slow earlier one must not overwrite it.
    let latest = 0, live = true;
    const load = () => {
      const mine = ++latest, current = () => live && mine === latest;
      readHealthDays(source, key.split(',')).then(value => { if (current()) setRead({ key, value }); }).catch(() => { if (current()) setRead({ key, value: null }); });
    };
    load();
    const sub = AppState.addEventListener('change', state => { if (state === 'active') load(); });
    return () => { live = false; sub?.remove(); };
  }, [source, key, focused]);
  return read.key === key ? read.value : null;
}
