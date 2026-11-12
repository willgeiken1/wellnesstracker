import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { appleHealth } from './apple';
import { readHealthDays, type HealthDays } from './days';
import type { HealthSource } from './source';

/** Steps and sleep for the days on screen, read fresh from Apple Health each time the app comes forward.
 * Kept in memory for this screen only. Null until connected, and wherever Apple Health is not available. */
export function useHealthDays(days: readonly string[], injected?: HealthSource | null): HealthDays | null {
  const source = useMemo(() => injected !== undefined ? injected : appleHealth(), [injected]);
  const key = days.join(',');
  const [read, setRead] = useState<{ key: string; value: HealthDays | null }>({ key: '', value: null });
  useEffect(() => {
    if (!source || !key) return;
    let live = true;
    const load = () => { readHealthDays(source, key.split(',')).then(value => { if (live) setRead({ key, value }); }).catch(() => { if (live) setRead({ key, value: null }); }); };
    load();
    const sub = AppState.addEventListener('change', state => { if (state === 'active') load(); });
    return () => { live = false; sub.remove(); };
  }, [source, key]);
  return read.key === key ? read.value : null;
}
