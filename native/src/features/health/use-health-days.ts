import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { appleHealth } from './apple';
import { lastDays, readHealthDays, type HealthDays } from './days';
import type { HealthSource } from './source';

/** Steps and sleep for the last `count` days ending today, read fresh from Apple Health whenever the screen
 * comes to the front: on arrival, on returning from another screen, and when the app is reopened. "Today" is
 * worked out at each read, so an app left open overnight shows the new day. Kept in memory for this screen
 * only. Null until connected, and wherever Apple Health is not available. */
export function useHealthDays(focused = true, injected?: HealthSource | null, count = 7): HealthDays | null {
  const source = useMemo(() => injected !== undefined ? injected : appleHealth(), [injected]);
  const [read, setRead] = useState<{ source: HealthSource; value: HealthDays | null } | null>(null);
  useEffect(() => {
    if (!source || !focused) return;
    // Only the newest read may land: a slow earlier one must not overwrite it.
    let latest = 0, live = true;
    const load = () => {
      const mine = ++latest, current = () => live && mine === latest, now = new Date();
      readHealthDays(source, lastDays(now, count), now).then(value => { if (current()) setRead({ source, value }); }).catch(() => { if (current()) setRead({ source, value: null }); });
    };
    load();
    const sub = AppState.addEventListener('change', state => { if (state === 'active') load(); });
    return () => { live = false; sub?.remove(); };
  }, [source, focused, count]);
  return read && read.source === source ? read.value : null;
}
