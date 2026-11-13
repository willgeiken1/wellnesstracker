import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useAuth } from '@/auth/provider';
import type { Repository } from '@/data/repository';
import { sharedReads } from '@/data/read-cache';
import { WorkoutStore } from '@/data/workout/store';

/** A new read facade per committed repository revision keeps compiler derivations reactive.
 * Store instances own no state; all writes still use the same repository/outbox API.
 * Reads go through one remembering view per repository, so a screen that asks for the same list in a loop
 * reaches the database once; it forgets on every change (see sharedReads). */
export function useWorkoutStore(repository: Repository): WorkoutStore;
export function useWorkoutStore(repository: Repository | null): WorkoutStore | null;
export function useWorkoutStore(repository: Repository | null) {
  const subscribe = useCallback((notify: () => void) => repository?.subscribe(notify) ?? (() => {}), [repository]);
  const snapshot = useCallback(() => repository?.getRevision() ?? 0, [repository]);
  const revision = useSyncExternalStore(subscribe, snapshot, snapshot);
  const reads = useMemo(() => repository ? sharedReads(repository) : null, [repository]);
  return useMemo(() => reads ? new WorkoutStore(reads, revision) : null, [reads, revision]);
}
export function useWorkout() {
  const auth = useAuth();
  const store = useWorkoutStore(auth.repository);
  return { store, auth };
}
