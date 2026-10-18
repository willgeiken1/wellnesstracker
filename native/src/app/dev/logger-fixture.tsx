import { useEffect, useRef, useState } from "react";
import { router, useIsFocused, useLocalSearchParams } from "expo-router";
import { WorkoutStore } from "@/data/workout/store";
import { ActiveWorkout } from "@/features/workout/active";
import { WorkoutSummary } from "@/features/workout/summary";
import type { LoggerFixtureState } from "@/features/workout/devFixture";
import { useWorkout } from "@/features/workout/use-workout";

/** insight://dev/logger-fixture?state=logger|keypad|rest|summary&offline=1
 * The dynamic import is unreachable in release builds and for account sessions. */
export default function LoggerFixtureRoute() {
  const { store, auth } = useWorkout();
  const repository = store?.repo;
  const focused = useIsFocused();
  const { state, offline, request } = useLocalSearchParams<{
    state?: string;
    offline?: string;
    request?: string;
  }>();
  const handled = useRef<string | null>(null);
  const [fixture, setFixture] = useState<{
    sessionId: string; state: LoggerFixtureState; requestKey: string;
  } | null>(null);
  const requestKey = `${state}:${offline}:${request}`;
  useEffect(() => {
    if (handled.current === requestKey || !auth.ready) return;
    handled.current = requestKey;
    if (
      !__DEV__ ||
      !auth.demo ||
      auth.session ||
      !repository ||
      repository.owner !== "demo"
    ) {
      router.replace("/");
      return;
    }
    let cancelled = false;
    void import("@/features/workout/devFixture")
      .then(({ createLoggerFixture, fixtureState }) => {
        if (cancelled) return;
        const selected = fixtureState(state);
        if (!selected) {
          router.replace("/");
          return;
        }
        const result = createLoggerFixture(
          new WorkoutStore(repository),
          { isDev: __DEV__, demo: auth.demo, signedIn: !!auth.session },
          selected,
          offline !== "0",
        );
        if (!result) {
          router.replace("/");
          return;
        }
        // Own the presentation here: replacing an already-present native workout
        // stack can leave its index/modal above the requested summary screen.
        setFixture({ ...result, requestKey });
      })
      .catch(() => {
        if (!cancelled) router.replace("/");
      });
    return () => {
      cancelled = true;
      handled.current = null;
    };
  }, [repository, auth.ready, auth.demo, auth.session, state, offline, requestKey]);
  if (!focused || !__DEV__ || !auth.demo || auth.session || !store || !fixture || fixture.requestKey !== requestKey) return null;
  return fixture.state === "summary" ? (
    <WorkoutSummary key={fixture.sessionId} store={store} id={fixture.sessionId} />
  ) : (
    <ActiveWorkout key={fixture.sessionId} fixtureState={fixture.state} />
  );
}
