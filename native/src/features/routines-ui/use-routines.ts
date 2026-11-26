import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/auth/provider';
import type { Repository } from '@/data/repository';
import { routineDayKey } from '@/features/routines/model/dose';
import { emptyRoutineStore, projectRoutineStore, type RoutineStore, type RoutineView } from '@/features/routines/model/shape';
import type { RoutineClock } from '@/features/routines/model/write';
import { commitRoutineStore, readRoutineStore, seedDefaultRoutines } from '@/features/routines/data/sqlite';

/* Routines as a screen reads them. Everything stays on the phone: this file
   reads and writes the routine tables through the store and sends nothing
   anywhere. No routine name, amount, unit, note or site is logged or reported. */

/** The clock, to the minute. It steps at the top of each minute while `running`, stops while the app is in the
 * background, and catches up the moment the app comes back. */
export function useMinuteClock(running = true): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!running) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => { if (timer) clearTimeout(timer); timer = undefined; };
    const tick = () => {
      stop();
      const date = new Date();
      setNow(date);
      timer = setTimeout(tick, Math.max(1000, 60_000 - (date.getSeconds() * 1000 + date.getMilliseconds())));
    };
    if (AppState.currentState !== 'background') tick();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') tick(); else if (state === 'background') stop(); });
    return () => { stop(); subscription.remove(); };
  }, [running]);
  return now;
}

/** What a change is handed: the stored shape and the clock it happens at. It returns the next shape, or null
 * when the rules refuse the change. */
export type RoutineChange = (store: RoutineStore, clock: RoutineClock) => RoutineStore | null;

export interface Routines {
  /** False when there is nowhere to read from or the read failed. The screen still draws, empty. */
  ready: boolean;
  store: RoutineStore;
  view: RoutineView;
  /** The routine day `date` falls on, by the hour the day starts at. */
  dayOf: (date: Date) => string;
  /** Applies one change and saves it. False when it was refused or could not be saved. */
  apply: (change: RoutineChange) => boolean;
  /** How many times the phone's data has changed. A new number means everything here was read again. */
  revision: number;
}

/* The repository is one object for as long as the owner is the same, so its revision is what says the rows
   changed. Each read names the revision it is for; without it a cached read would be handed back. */
function read(repository: Repository | null, revision: number): RoutineStore | null {
  if (!repository || revision < 0) return null;
  try { return readRoutineStore(repository); } catch { return null; }
}

/** The phone's data when the app has it, or null (signed out of data, or a screen drawn outside the app's providers). */
function useOptionalRepository(): Repository | null {
  try { return useAuth().repository ?? null; } catch { return null; }
}

/** The routines of whoever is using the app, re-read whenever the phone's data changes. A screen that only shows
 * routines beside its own things (Home, a chart) passes `seed: false`, so opening it writes nothing. */
export function useRoutines({ seed = true }: { seed?: boolean } = {}): Routines {
  const repository = useOptionalRepository();
  const subscribe = useCallback((listener: () => void) => (repository ? repository.subscribe(listener) : () => {}), [repository]);
  const revision = useSyncExternalStore(subscribe, () => (repository ? repository.getRevision() : 0));
  // Morning and Night are added once, the first time Routines is opened.
  useEffect(() => {
    if (!repository || !seed) return;
    try { seedDefaultRoutines(repository); } catch { /* The page still opens; it only starts without the two defaults. */ }
  }, [repository, seed]);
  return useMemo(() => {
    const stored = read(repository, revision);
    const store = stored ?? emptyRoutineStore();
    const view = projectRoutineStore(store) ?? { ...emptyRoutineStore(), hiddenBlocks: [] };
    const dayOf = (date: Date) => routineDayKey(date, store.settings.dayRolloverHour);
    const apply = (change: RoutineChange) => {
      const current = read(repository, repository ? repository.getRevision() : 0);
      if (!repository || !current) return false;
      const now = new Date();
      const next = change(current, { now: now.getTime(), day: routineDayKey(now, current.settings.dayRolloverHour) });
      if (!next) return false;
      try { commitRoutineStore(repository, next, now.getTime()); return true; } catch { return false; }
    };
    return { ready: !!stored, store, view, dayOf, apply, revision };
  }, [repository, revision]);
}
