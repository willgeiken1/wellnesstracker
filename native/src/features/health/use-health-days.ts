import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { appleHealth } from './apple';
import { lastDays, readHealthDays, type HealthDays } from './days';
import { mergeHealthDays, readOuraDays, type OuraSource } from './oura';
import { oura } from './oura-client';
import type { HealthSource } from './source';

type Read = { source: HealthSource | null; ring: OuraSource | null; days: string; apple?: HealthDays | null; worn?: HealthDays | null };

/** Steps and sleep for the last `count` days ending today, read fresh from Apple Health and Oura whenever the screen
 * comes to the front: on arrival, on returning from another screen, and when the app is reopened. "Today" is
 * worked out at each read, so an app left open overnight shows the new day. Kept in memory for this screen
 * only. Null until one of them is connected.
 * Each source lands on its own as soon as it answers, so a slow Oura never holds back Apple Health or the other way
 * round. When a refresh from Oura lands, its days are read again. */
export function useHealthDays(focused = true, injected?: HealthSource | null, count = 7, injectedRing?: OuraSource | null): HealthDays | null {
  const source = useMemo(() => injected !== undefined ? injected : appleHealth(), [injected]);
  const ring = useMemo(() => injectedRing !== undefined ? injectedRing : oura(), [injectedRing]);
  const [read, setRead] = useState<Read | null>(null);
  useEffect(() => {
    if ((!source && !ring) || !focused) return;
    // Only the newest read may land: a slow earlier one must not overwrite it.
    let latest = 0, live = true;
    const load = () => {
      const mine = ++latest, current = () => live && mine === latest, now = new Date(), days = lastDays(now, count), key = days.join();
      // The other source's last answer stays until its new one lands, unless it is for a different run of days.
      const land = (part: 'apple' | 'worn', value: HealthDays | null) => { if (current()) setRead(prev => ({
        ...(prev && prev.source === source && prev.ring === ring && prev.days === key ? prev : { source, ring, days: key }), [part]: value })); };
      // Each source stands alone: one failing or being off never hides the other.
      readHealthDays(source, days, now).catch(() => null).then(value => land('apple', value));
      readOuraDays(ring, days, now, () => { if (live) load(); }).catch(() => null).then(value => land('worn', value));
    };
    load();
    const sub = AppState.addEventListener('change', state => { if (state === 'active') load(); });
    return () => { live = false; sub?.remove(); };
  }, [source, ring, focused, count]);
  // One object per answer, so screens that work things out from it only do so when it changes.
  const mine = read && read.source === source && read.ring === ring ? read : null;
  return useMemo(() => mine && (mine.apple !== undefined || mine.worn !== undefined) ? mergeHealthDays(mine.apple ?? null, mine.worn ?? null) : null, [mine]);
}
