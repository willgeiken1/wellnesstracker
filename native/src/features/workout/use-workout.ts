import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useAuth } from '@/auth/provider';
import type { Repository } from '@/data/repository';
import { WorkoutStore } from '@/data/workout/store';

/** A new read facade per committed repository revision keeps compiler derivations reactive.
 * Store instances own no state; all writes still use the same repository/outbox API. */
export function useWorkoutStore(repository: Repository): WorkoutStore;
export function useWorkoutStore(repository: Repository | null): WorkoutStore | null;
export function useWorkoutStore(repository: Repository | null) {
  const subscribe = useCallback((notify: () => void) => repository?.subscribe(notify) ?? (() => {}), [repository]);
  const snapshot = useCallback(() => repository?.getRevision() ?? 0, [repository]);
  const revision = useSyncExternalStore(subscribe, snapshot, snapshot);
  return useMemo(() => repository ? new WorkoutStore(repository, revision) : null, [repository, revision]);
}
export function useWorkout() {
  const auth = useAuth();
  const store = useWorkoutStore(auth.repository);
  return { store, auth };
}
