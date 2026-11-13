import { useEffect } from "react";
import { router } from "expo-router";
import { useWorkout } from "@/features/workout/use-workout";

/** insight://dev/sample-data
 * Development only, example account only: fills it with two made-up weeks, then goes Home.
 * The dynamic import is unreachable in release builds and for account sessions. */
export default function SampleDataRoute() {
  const { store, auth } = useWorkout();
  useEffect(() => {
    if (!auth.ready) return;
    if (!__DEV__ || !auth.demo || auth.session || !store || store.repo.owner !== "demo") { router.replace("/"); return; }
    let cancelled = false;
    void import("@/features/workout/devSampleDays")
      .then(({ createSampleDays }) => { if (!cancelled) createSampleDays(store, { isDev: __DEV__, demo: auth.demo, signedIn: !!auth.session }); })
      .catch(() => {})
      .finally(() => { if (!cancelled) router.replace("/"); });
    return () => { cancelled = true; };
    // The store changes on every save; seeding is guarded to run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.ready, auth.demo, auth.session, store?.repo]);
  return null;
}
