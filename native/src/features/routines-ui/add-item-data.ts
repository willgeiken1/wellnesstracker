/* What the sheets read and how they save. Routines live on this phone
   only: nothing here reaches the network, analytics, crash reports or logs,
   and a failed save is reported without the name, amount or anything else
   the user typed. */

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { randomUUID } from 'expo-crypto';
import { useAuth } from '@/auth/provider';
import type { Repository } from '@/data/repository';
import { routineDayKey } from '@/features/routines/model/dose';
import { projectRoutineStore, type RoutineStore, type RoutineView } from '@/features/routines/model/shape';
import type { RoutineClock } from '@/features/routines/model/write';
import { commitRoutineStore, readRoutineStore } from '@/features/routines/store';

export interface RoutinesData {
  repository: Repository | null;
  /** The stored shape, or null when it cannot be read. */
  store: RoutineStore | null;
  /** Live rows only, shown routines in page order. */
  view: RoutineView | null;
}

function read(repository: Repository | null): RoutineStore | null {
  if (!repository) return null;
  try { return readRoutineStore(repository); } catch { return null; }
}

/** The routines on this phone, read again whenever a row changes. */
export function useRoutines(): RoutinesData {
  const repository = useAuth().repository ?? null;
  const subscribe = useCallback((listener: () => void) => (repository ? repository.subscribe(listener) : () => {}), [repository]);
  const revision = useSyncExternalStore(subscribe, () => (repository ? repository.getRevision() : 0));
  return useMemo(() => {
    // The revision is named so that a saved row reads the store again.
    const store = revision >= 0 ? read(repository) : null;
    return { repository, store, view: store ? projectRoutineStore(store) : null };
  }, [repository, revision]);
}

/** Now, and the routine day it falls on. The day turns over at the hour set in Routines settings. */
export function routineClockNow(store: RoutineStore | null, date = new Date()): RoutineClock {
  return { now: date.getTime(), day: routineDayKey(date, store ? store.settings.dayRolloverHour : undefined) };
}

export const newRoutineId = (): string => randomUUID();

/** Saves a changed shape. False when it could not be saved; nothing about the rows is reported. */
export function commitRoutines(repository: Repository | null, next: RoutineStore | null): boolean {
  if (!repository || !next) return false;
  try { commitRoutineStore(repository, next); return true; } catch { return false; }
}
