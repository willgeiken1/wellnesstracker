import type { WorkoutStore } from "@/data/workout/store";

export type LoggerFixtureState = "logger" | "keypad" | "rest" | "summary";
export interface FixtureContext {
  isDev: boolean;
  demo: boolean;
  signedIn: boolean;
}
export function fixtureState(value: unknown): LoggerFixtureState | null {
  return value === "logger" ||
    value === "keypad" ||
    value === "rest" ||
    value === "summary"
    ? value
    : null;
}
/** Only called through a development-only dynamic import. All rows are synthetic and
 * use the normal repository/outbox path. No synced schema or progression rule changes. */
export function createLoggerFixture(
  store: WorkoutStore,
  context: FixtureContext,
  state: LoggerFixtureState,
  offline = true,
  now = Date.now(),
) {
  if (
    !__DEV__ ||
    !context.isDev ||
    !context.demo ||
    context.signedIn ||
    store.repo.owner !== "demo"
  )
    return null;
  return store.repo.atomic(() => {
    const repo = store.repo;
    const cached = repo.localGet<{ sessionId: string; benchId: string }>(
      "loggerFixture",
    );
    // Remove our previous presentation before finishing any unrelated demo workout.
    if (cached) {
      for (const e of store.entries(cached.sessionId)) store.removeExercise(e.id);
      repo.remove("sessions", cached.sessionId);
    }
    if (store.active()) {
      const active = store.active()!;
      store.finish(active.id, { startedAt: Number(active.data.started_at), finishedAt: now, notes: "" }, now);
    }
    const startedAt = now - (state === "summary" ? 3492000 : 2538000);
      const log = (
        entryId: string,
        index: number,
        weight: number,
        reps: number,
        stamp: number,
      ) => {
        store.editDraft(entryId, index, {
          weight: String(weight),
          reps: String(reps),
        });
        store.toggleDone(entryId, index, stamp);
      };
    let routine = store
      .templates()
      .find((r) => r.id === repo.localGet<string>("loggerFixtureRoutine"));
    if (!routine) {
      routine = store.saveTemplate("Push Day A", [
        { exercise: "Overhead Press", target_sets: 3, target_reps: 10 },
        { exercise: "Cable Fly", target_sets: 3, target_reps: 10 },
        { exercise: "Bench Press", target_sets: 4, target_reps: 8 },
        { exercise: "Incline Dumbbell Press", target_sets: 3, target_reps: 10 },
      ]);
      repo.localSave("loggerFixtureRoutine", routine.id);
      // Baseline + six actual, increasing PRs make the shelf count reproducible.
      for (let i = 0; i < 7; i++) {
        const start = now - (20 - i) * 86400000;
        const s = store.start(undefined, start),
          e = store.addExercise(s.id, "Bench Press", 1);
        log(e.id, 0, 155 + i * 5, 8, start);
        store.finish(
          s.id,
          { startedAt: start, finishedAt: start + 3600000, notes: "" },
          now,
        );
      }
    }
    // Rebuild only the previous session owned by this fixture routine. Anchor it
    // immediately before the live fixture so unrelated demo history cannot win.
    // This also repairs cached round-1 fixtures without changing production rules.
    for (const prior of store.history().filter((row) => row.data.routine_id === routine.id)) {
      for (const entry of store.entries(prior.id)) store.removeExercise(entry.id);
      repo.remove("sessions", prior.id);
    }
    const previousStart = startedAt - 1;
    const previous = store.start(routine.id, previousStart);
    for (const entry of store.entries(previous.id)) {
      const name = String(entry.data.exercise);
      const weights = name === "Bench Press" ? [185,185,185,185] : name === "Overhead Press" ? [105,105,105] : [60,60,60];
      const reps = name === "Bench Press" ? [8,8,7,6] : [10,10,10];
      weights.forEach((weight, i) => log(entry.id, i, weight, reps[i], previousStart));
    }
    store.finish(previous.id, {startedAt: previousStart, finishedAt: startedAt, notes: ""}, now);
    const s = store.start(routine.id, startedAt),
      entries = store.entries(s.id),
      bench = entries[2];
    for (const [ei, e] of entries.entries()) {
      const count =
        state === "summary"
          ? store.drafts(e.id).length
          : ei === 0
            ? 3
            : ei === 1
              ? 2
              : ei === 2
                ? state === "rest"
                  ? 3
                  : 2
                : 0;
      for (let i = 0; i < count; i++) {
        const weight = ei === 0 ? 105 : ei === 2 ? (i < 2 ? 185 : 190) : 60;
        store.editDraft(e.id, i, {
          weight: String(weight),
          reps: String(ei === 2 ? 8 : 10),
        });
        store.toggleDone(e.id, i, now);
      }
    }
    store.skipTimer();
    if (state === "rest") {
      // Set 4 remains unlogged; text is an upcoming target, not a saved set.
      store.editDraft(bench.id, 3, { weight: "190", reps: "" });
      const d = store.drafts(bench.id)[2];
      repo.localSave("timer", {
        sessionId: s.id,
        entryId: bench.id,
        setId: d.setId!,
        duration: 90,
        endAt: now + 65000,
        minimized: false,
        ended: false,
      });
    }
    repo.localSave("loggerFixtureOffline", offline);
    repo.localSave("loggerFixture", { sessionId: s.id, benchId: bench.id });
    // A presentation-only hint is needed: the specified previous 8/8/7/6
    // session does not qualify for the production all-working-sets progression rule.
    repo.localSave("loggerFixtureHint", {
      entryId: bench.id,
      weight: 190,
      target: 8,
      previous: 185,
      count: 2,
      jump: true,
    });
    if (state === "summary")
      store.finish(s.id, { startedAt, finishedAt: now, notes: "" }, now);
    return { sessionId: s.id, benchId: bench.id, state };
  });
}
