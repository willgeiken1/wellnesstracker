/* Keeps the phone's scheduled reminders in step with everything they depend on, from launch, not only while Settings
 * is open: the Settings choices, the training plan, routines with Remind me on, the meals logged today and the rest
 * timer. It only ever reads what iOS allows and never asks; asking happens when the person turns a reminder on. */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import Constants from 'expo-constants';
import type { Repository } from '@/data/repository';
import { useSettingsPrefs, type SettingsPrefs } from '@/features/settings/prefs';
import { dayKey, normalize, type RoutinesState } from '@/features/routines/model';
import { ROUTINES_KEY } from '@/features/routines/store';
import { MEAL_REMINDERS, planReminders, plannedWorkoutDays, type MealKey, type PlannedReminder } from './plan';
import { askedCount, subscribeAsked, syncReminders } from './notifier';

/** The Food tab's own meals (see food/model defaultMeals): breakfast, lunch and dinner. */
const MEAL_IDS: Record<MealKey, string> = {
  breakfast: 'fd000000-0000-4000-8000-000000000000', lunch: 'fd000000-0000-4000-8000-000000000001', dinner: 'fd000000-0000-4000-8000-000000000002',
};
/** The rest timer the workout logger keeps (data/workout/store.ts, TimerState). */
interface RestTimer { endAt: number; ended?: boolean }

/** The meals with something logged on a day ('YYYY-MM-DD'). Only whether a meal has an entry is read, never what. */
export function mealsLoggedOn(repo: Repository, day: string): MealKey[] {
  const ids = new Set(repo.list('food_entries').filter(r => r.data.day === day).map(r => String(r.data.meal_id ?? '')));
  return MEAL_REMINDERS.map(m => m.key).filter(key => ids.has(MEAL_IDS[key]));
}

/** Today's plan for this account. Anything that cannot be read leaves out only the reminders that depend on it. */
export function reminderPlan(repo: Repository | null | undefined, rem: SettingsPrefs['rem'], now = Date.now()): PlannedReminder[] {
  const read = <T,>(f: () => T, none: T): T => { if (!repo) return none; try { return f(); } catch { return none; } };
  // Look around first's sample routines come with Remind me on, as a sample; they never go on the phone.
  const routines = repo?.owner === 'demo' ? null : read<RoutinesState | null>(() => normalize(repo!.localGet(ROUTINES_KEY)), null);
  const mealsLogged = rem.food ? read<MealKey[]>(() => mealsLoggedOn(repo!, dayKey(new Date(now))), []) : [];
  const timer = rem.rest ? read<RestTimer | null>(() => repo!.localGet<RestTimer | null>('timer') ?? null, null) : null;
  return planReminders(rem, rem.workout ? plannedWorkoutDays(repo) : [], { now, routines, mealsLogged, timer });
}

const noRevision = () => 0, noSubscribe = () => () => {};
/** Changes that happen without the data changing: the app coming back to the front, and a new day starting. */
function useWakeups() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => { if (s === 'active') setTick(x => x + 1); });
    const d = new Date(), midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 5).getTime();
    const timer = setTimeout(() => setTick(x => x + 1), Math.max(1000, midnight - d.getTime()));
    return () => { sub.remove(); clearTimeout(timer); };
  }, [tick]);
  return tick;
}

/** Plans again and puts the plan on the phone whenever any input changes, while `enabled`. */
export function useReminderSync(repository: Repository | null, rem: SettingsPrefs['rem'], enabled: boolean) {
  const subscribe = useCallback((l: () => void) => (repository ? repository.subscribe(l) : noSubscribe()), [repository]);
  const revisionOf = repository ? repository.getRevision : noRevision;
  const revision = useSyncExternalStore(subscribe, revisionOf, revisionOf);
  const answered = useSyncExternalStore(subscribeAsked, askedCount, askedCount);
  const tick = useWakeups(), remKey = JSON.stringify(rem);
  useEffect(() => {
    if (!enabled) return;
    // A burst of changes (a set ticked off saves several things) is planned once.
    const timer = setTimeout(() => { void syncReminders(reminderPlan(repository, JSON.parse(remKey) as SettingsPrefs['rem'])); }, 150);
    return () => clearTimeout(timer);
  }, [enabled, repository, remKey, revision, answered, tick]);
}

/** Mounted once at the app's root, with the signed-in account's repository (none signed in: every reminder of Insight's
 * comes off the phone). The phone-only build cannot send notifications, so it does nothing there. */
export function ReminderSync({ repository, limited = Constants.expoConfig?.extra?.phoneOnly === true }: { repository: Repository | null | undefined; limited?: boolean }) {
  const [p] = useSettingsPrefs();
  useReminderSync(repository ?? null, p.rem, !limited);
  return null;
}
