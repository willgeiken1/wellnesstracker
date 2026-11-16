import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { appleHealth } from '../health/apple';
import type { HealthSource, HealthWorkout } from '../health/source';

/** Local midnight on the Monday of `now`'s week. */
export function mondayOf(now: Date): Date {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  return monday;
}

/** This week's Apple Health workouts, read fresh whenever the screen is shown and when the app is reopened.
 * Kept in memory for this screen only: never saved, synced or sent. Null until Apple Health is connected,
 * when a read fails, and wherever Apple Health is not available. Never shows Apple's permission sheet. */
export function useHealthWorkouts(focused = true, injected?: HealthSource | null): HealthWorkout[] | null {
  const source = useMemo(() => injected !== undefined ? injected : appleHealth(), [injected]);
  const [read, setRead] = useState<{ source: HealthSource; value: HealthWorkout[] | null } | null>(null);
  useEffect(() => {
    if (!source || !focused) return;
    // Only the newest read may land: a slow earlier one must not overwrite it.
    let latest = 0, live = true;
    const load = () => {
      const mine = ++latest, current = () => live && mine === latest, now = new Date();
      (async () => {
        const value = await source.access() === 'asked' ? await source.workouts(mondayOf(now), now) : null;
        if (current()) setRead({ source, value });
      })().catch(() => { if (current()) setRead({ source, value: null }); });
    };
    load();
    const sub = AppState.addEventListener('change', state => { if (state === 'active') load(); });
    return () => { live = false; sub?.remove(); };
  }, [source, focused]);
  return read && read.source === source ? read.value : null;
}
