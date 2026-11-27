import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/auth/provider';
import { useHealthDays } from '@/features/health/use-health-days';
import { useOuraRecovery } from '@/features/health/use-oura-recovery';
import { useRecovery } from '@/features/health/use-recovery';
import { useFocused } from '@/features/home/use-focused';
import { useSettingsPrefs } from '@/features/settings/prefs';
import { useWorkoutStore } from '@/features/workout/use-workout';
import type { ProgressData } from './model';
import { buildProgress } from './source';
import { publishProgress, useProgressData } from './store';

/** The clock, refreshed each minute and when the app comes back, so a page left open overnight shows the new day. */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 60_000);
    const sub = AppState.addEventListener('change', s => { if (s === 'active') setNow(new Date()); });
    return () => { clearInterval(tick); sub?.remove(); };
  }, []);
  return now;
}
/**
 * Works Progress out while a Progress screen is in front and shares it with the tiles and the other screens. Apple Health
 * and Oura are read only while the screen is in front (never prompting), and not at all in Look around first.
 */
export function useProgress(): ProgressData {
  const auth = useAuth(), store = useWorkoutStore(auth.repository), demo = !!auth.demo, focused = useFocused(), now = useNow();
  const live = focused && !demo && !!store;
  const health = useHealthDays(live, undefined, 30), recovery = useRecovery(live, undefined, 30), ring = useOuraRecovery(live, undefined, 30);
  const minute = Math.floor(now.getTime() / 60_000), [prefs] = useSettingsPrefs(), sleepGoalMin = prefs.goals.sleep, trainGoalMin = prefs.goals.train;
  const built = useMemo(() => store ? buildProgress({ store, now: new Date(minute * 60_000), demo, health, recovery: recovery.recovery, ring, sleepGoalMin, trainGoalMin }) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, minute, demo, health, recovery.recovery, ring, sleepGoalMin, trainGoalMin]);
  useEffect(() => { if (built) publishProgress(built); }, [built]);
  const shared = useProgressData();
  return built ?? shared;
}
