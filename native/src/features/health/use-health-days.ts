import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { appleHealth } from './apple';
import { lastDays, readHealthDays, type HealthDays } from './days';
import { mergeHealthDays, oura, readOuraDays, type OuraSource } from './oura';
import type { HealthSource } from './source';

/** Steps and sleep for the last `count` days ending today, read fresh from Apple Health and Oura whenever the screen
 * comes to the front: on arrival, on returning from another screen, and when the app is reopened. "Today" is
 * worked out at each read, so an app left open overnight shows the new day. Kept in memory for this screen
 * only. Null until one of them is connected. */
export function useHealthDays(focused = true, injected?: HealthSource | null, count = 7, injectedRing?: OuraSource | null): HealthDays | null {
  const source = useMemo(() => injected !== undefined ? injected : appleHealth(), [injected]);
  const ring = useMemo(() => injectedRing !== undefined ? injectedRing : oura(), [injectedRing]);
  const [read, setRead] = useState<{ source: HealthSource | null; ring: OuraSource | null; value: HealthDays | null } | null>(null);
  useEffect(() => {
    if ((!source && !ring) || !focused) return;
    // Only the newest read may land: a slow earlier one must not overwrite it.
    let latest = 0, live = true;
    const load = () => {
      const mine = ++latest, current = () => live && mine === latest, now = new Date(), days = lastDays(now, count);
      // Each source stands alone: one failing or being off never hides the other.
      Promise.all([readHealthDays(source, days, now).catch(() => null), readOuraDays(ring, days, now).catch(() => null)])
        .then(([apple, worn]) => { if (current()) setRead({ source, ring, value: mergeHealthDays(apple, worn) }); });
    };
    load();
    const sub = AppState.addEventListener('change', state => { if (state === 'active') load(); });
    return () => { live = false; sub?.remove(); };
  }, [source, ring, focused, count]);
  return read && read.source === source && read.ring === ring ? read.value : null;
}
