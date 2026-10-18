import { useEffect, useMemo, useReducer } from 'react';
import { useAuth } from '@/auth/provider';
import { WorkoutStore } from '@/data/workout/store';
export function useWorkout() {
  const auth = useAuth(),
    [, refresh] = useReducer(n => n + 1, 0);
  const store = useMemo(() => auth.repository ? new WorkoutStore(auth.repository) : null, [auth.repository]);
  useEffect(() => auth.repository?.subscribe(refresh), [auth.repository]);
  return {
    store,
    auth
  };
}
