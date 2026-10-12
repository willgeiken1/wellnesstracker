import assert from "node:assert/strict";
import test from "node:test";

const store = {};
globalThis.localStorage = {
  getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
globalThis.window = globalThis;
globalThis.document = {
  addEventListener() {},
  documentElement: { dataset: {} },
  querySelector: () => ({ addEventListener() {} }),
};

const { app } = await import("../logger/js/runtime.js");
await import("../logger/js/data/state.js");
await import("../logger/js/pages/workouts.js");
await import("../logger/js/pages/session.js");
await import("../logger/js/shared/cloud.js");

test("a freestyle workout becomes one routine and can be updated in place", () => {
  const s = app.freestyleSession();
  assert.equal(s.origin, "freestyle");
  assert.equal(s.name, "Freestyle");
  assert.equal(s.workoutId, "fs:" + s.id);
  assert.equal(app.workoutById(s.workoutId), undefined);
  assert.equal(app.commitFreestyleRoutine(s, "  "), null);
  assert.equal(app.commitFreestyleRoutine(s, "Upper"), null);

  s.extra = [
    { name: "Bench Press", muscles: ["chest"], adv: ["pecUpper"] },
    { name: "Row", muscles: ["lats"] },
  ];
  s.entries = [
    { exercise: "Row", muscles: ["lats"], sets: [{ w: 60, r: 10, tag: "warmup" }, { w: 80, r: 8 }] },
    { exercise: "Bench Press", muscles: ["chest"], sets: [{ w: 100, r: 8 }, { w: 100, r: 6 }] },
  ];
  const created = app.commitFreestyleRoutine(s, "Upper");
  assert.ok(created);
  assert.equal(created.name, "Upper");
  assert.deepEqual(created.exercises.map((e) => e.name), ["Bench Press", "Row"]);
  assert.deepEqual(created.exercises[0].adv, ["pecUpper"]);
  assert.deepEqual(created.exercises[0].sets, [{ w: 100, r: 8 }, { w: 100, r: 6 }]);
  assert.deepEqual(created.exercises[1].sets, [{ w: 80, r: 8 }]);
  assert.equal(s.workoutId, created.id);
  assert.equal(s.name, "Upper");
  assert.equal(s.origin, "freestyle");
  assert.deepEqual(s.extra, []);
  assert.deepEqual(s.swaps, {});
  assert.equal(app.slugRoutineId("Push"), "push-2");

  s.entries.find((e) => e.exercise === "Bench Press").sets.push({ w: 105, r: 5 });
  const updated = app.commitFreestyleRoutine(s, "Upper 2");
  assert.equal(updated.id, created.id);
  assert.equal(updated.name, "Upper 2");
  assert.deepEqual(updated.exercises.map((e) => e.name), ["Bench Press", "Row"]);
  assert.deepEqual(updated.exercises[0].sets, [{ w: 100, r: 8 }, { w: 100, r: 6 }, { w: 105, r: 5 }]);
  assert.equal(app.state.workouts.filter((w) => w.id === created.id).length, 1);
  assert.deepEqual(s.extra, []);

  const kept = app.workoutById(created.id).exercises.map((e) => e.name);
  const copy = app.commitFreestyleRoutine(s, "Upper copy", { copy: true });
  assert.ok(copy);
  assert.notEqual(copy.id, created.id);
  assert.equal(copy.name, "Upper copy");
  assert.equal(s.workoutId, copy.id);
  assert.deepEqual(copy.exercises.map((e) => e.name), ["Bench Press", "Row"]);
  assert.deepEqual(copy.exercises[0].sets.map((x) => x.w), [100, 100, 105]);
  assert.equal(app.workoutById(created.id).name, "Upper 2");
  assert.deepEqual(app.workoutById(created.id).exercises.map((e) => e.name), kept);
  assert.equal(app.state.workouts.filter((w) => w.name === "Upper 2" || w.name === "Upper copy").length, 2);

  app.state.sessions.push(s);
  app.save();
  const raw = JSON.parse(localStorage.getItem(app.KEY));
  assert.ok(raw.workouts.some((w) => w.id === created.id && w.name === "Upper 2" && w.exercises.some((e) => e.name === "Bench Press")));
  assert.ok(raw.sessions.some((x) => x.id === s.id && x.origin === "freestyle" && x.workoutId === copy.id));
  const blob = app.userDataBlob();
  assert.ok(blob.workouts.some((w) => w.id === created.id && w.exercises.some((e) => e.name === "Row")));
  assert.ok(blob.workouts.some((w) => w.id === copy.id && w.name === "Upper copy"));
  assert.ok(blob.sessions.some((x) => x.origin === "freestyle" && x.name === "Upper copy"));

  const next = { id: "next", workoutId: created.id, name: "Upper 2", entries: [], finishedAt: null };
  app.state.sessions.push(next);
  assert.deepEqual(app.setFieldHints(next, "Bench Press"), { w: "100", r: "8", wR: "100", rR: "8" });
  let sg = app.suggestion("Bench Press", next.id);
  assert.equal(sg.w, 100);
  assert.equal(sg.r, 8);
  assert.equal(sg.sets, 3);
  assert.match(sg.why, /100 × 8/);
  next.entries = [{ exercise: "Bench Press", sets: [{ w: 100, r: 8 }, { w: 100, r: 6 }] }];
  assert.deepEqual(app.setFieldHints(next, "Bench Press"), { w: "105", r: "5", wR: "105", rR: "5" });
  sg = app.suggestion("Bench Press", next.id);
  assert.equal(sg.w, 105);
  assert.equal(sg.r, 5);
});

test("live order, removal, and a linked routine survive a reload", () => {
  const s = app.freestyleSession();
  s.extra = [
    { name: "Bench Press", muscles: ["chest"] },
    { name: "Row", muscles: ["lats"] },
  ];
  s.entries = [{ exercise: "Bench Press", muscles: ["chest"], sets: [{ w: 100, r: 8 }] }];
  app.state.sessions.push(s);
  app.reorderLive(1, 0, s);
  assert.deepEqual(app.liveExercises(s).map((e) => e.name), ["Row", "Bench Press"]);
  const cut = app.applyLiveRemoval(s, 0);
  assert.equal(cut.name, "Row");
  assert.deepEqual(app.liveExercises(s).map((e) => e.name), ["Bench Press"]);
  app.restoreLive(s, cut.snap);
  assert.deepEqual(app.liveExercises(s).map((e) => e.name), ["Row", "Bench Press"]);
  app.applyLiveRemoval(s, 0);
  const routine = app.commitFreestyleRoutine(s, "Order Lift");
  assert.deepEqual(routine.exercises.map((e) => e.name), ["Bench Press"]);
  assert.equal(s.workoutId, routine.id);
  assert.equal(s.name, "Order Lift");
  app.save();

  const loaded = app.migrate(JSON.parse(localStorage.getItem(app.KEY)));
  const back = loaded.sessions.find((x) => x.id === s.id);
  assert.equal(back.origin, "freestyle");
  assert.equal(back.workoutId, routine.id);
  assert.equal(back.name, "Order Lift");
  assert.deepEqual(back.order, ["Bench Press"]);
  assert.equal(back.entries.find((e) => e.exercise === "Bench Press").sets[0].w, 100);
  assert.equal(back.entries.some((e) => e.exercise === "Row"), false);

  const prev = app.state;
  app.replaceState(loaded);
  try {
    assert.deepEqual(app.liveExercises(back).map((e) => e.name), ["Bench Press"]);
    back.finishedAt = new Date().toISOString();
    const unsaved = app.freestyleSession();
    unsaved.finishedAt = new Date().toISOString();
    unsaved.entries = [{ exercise: "Squat", muscles: ["quads"], sets: [{ w: 40, r: 5 }] }];
    app.state.sessions.push(unsaved);
    const hist = app.historyHTML(true);
    assert.match(hist, /Order Lift/);
    assert.match(hist, /Squat/);
    assert.doesNotMatch(hist, /Freestyle/);

    const stale = app.freestyleSession();
    stale.date = "1999-01-01";
    stale.entries = [{ exercise: "Squat", muscles: ["quads"], sets: [{ w: 20, r: 5 }] }];
    const oldPush = { id: "old-push-resume", date: "1999-01-01", workoutId: "push", name: "Push", finishedAt: null, entries: [], startedAt: "1999-01-01T10:00:00" };
    app.state.sessions.push(stale, oldPush);
    app.closeStaleSessions();
    assert.equal(stale.finishedAt, null);
    assert.ok(app.state.sessions.some((x) => x.id === stale.id));
    assert.ok(oldPush.finishedAt);
    app.ui.workoutOpen = false;
    app.resumeOpenWorkout();
    assert.equal(app.ui.workoutOpen, true);
    assert.equal(app.logsStartRest({ origin: "freestyle" }), false);
    assert.equal(app.logsStartRest({ origin: undefined, name: "Push" }), true);
  } finally {
    app.replaceState(prev);
  }
});

test("an abandoned empty freestyle is discarded locally and a live one stays", () => {
  const prev = app.state;
  const base = JSON.parse(JSON.stringify(prev));
  base.sessions = (base.sessions || []).filter((s) => s.finishedAt);
  base.deleted = [...(base.deleted || [])];
  app.replaceState(base);
  const live = app.freestyleSession();
  const withExtra = app.freestyleSession();
  withExtra.extra = [{ name: "Bench Press", muscles: ["chest"] }];
  const oldEmpty = app.freestyleSession();
  oldEmpty.date = "1999-01-01";
  oldEmpty.startedAt = "1999-01-01T08:00:00";
  oldEmpty.extra = [];
  const stale = app.freestyleSession();
  stale.mod = Date.now() - app.EMPTY_FREESTYLE_STALE_MS - 60_000;
  stale.startedAt = new Date(stale.mod).toISOString();
  stale.extra = [];
  const kept = app.freestyleSession();
  kept.date = "1999-01-01";
  kept.entries = [{ exercise: "Squat", muscles: ["quads"], sets: [{ w: 40, r: 5 }] }];
  const routine = {
    id: "old-push-empty", date: "1999-01-01", workoutId: "push", name: "Push",
    finishedAt: null, entries: [], startedAt: "1999-01-01T10:00:00",
  };
  app.state.sessions.push(live, withExtra, oldEmpty, stale, kept, routine);
  app.ui.workoutOpen = false;
  try {
    app.closeStaleSessions();
    assert.ok(app.state.sessions.some((s) => s.id === live.id));
    assert.ok(app.state.sessions.some((s) => s.id === withExtra.id));
    assert.equal(app.state.sessions.some((s) => s.id === oldEmpty.id), false);
    assert.equal(app.state.sessions.some((s) => s.id === stale.id), false);
    assert.equal(app.state.deleted.some((m) => app.deletedId(m) === oldEmpty.id), false);
    assert.equal(app.state.deleted.some((m) => app.deletedId(m) === stale.id), false);
    assert.equal(kept.finishedAt, null);
    assert.ok(routine.finishedAt);
    app.ui.workoutOpen = false;
    app.resumeOpenWorkout();
    assert.equal(app.ui.workoutOpen, true);
    assert.equal(app.activeSession().id, live.id);
    app.resumeOpenWorkout();
    assert.equal(app.state.deleted.some((m) => app.deletedId(m) === oldEmpty.id), false);
    assert.equal(app.state.sessions.filter((s) => s.id === live.id).length, 1);
  } finally {
    app.replaceState(prev);
  }
});

test("the deleted list expires old markers and stays under a cap", () => {
  const now = 1_800_000_000_000;
  const many = [
    { id: "old", at: now - app.DELETED_TTL_MS - 1000 },
    "legacy",
    { id: "fresh", at: now },
  ];
  for (let i = 0; i < app.DELETED_CAP + 10; i++) many.push({ id: "k" + i, at: now - 10_000 - i });
  const pruned = app.pruneDeleted(many, now);
  assert.equal(pruned.some((m) => app.deletedId(m) === "old"), false);
  assert.equal(pruned.some((m) => app.deletedId(m) === "legacy"), false);
  assert.equal(pruned.some((m) => app.deletedId(m) === "fresh"), true);
  assert.equal(pruned.length, app.DELETED_CAP);
  assert.equal(app.deletedAt(pruned[0]) >= app.deletedAt(pruned[pruned.length - 1]), true);
  const strings = app.pruneDeleted(["a", "b", "a"], now);
  assert.deepEqual(strings, ["a", "b"]);
  assert.deepEqual(app.pruneDeleted(["a", { id: "a", at: 5 }, { id: "a", at: 9 }], 100), [{ id: "a", at: 9 }]);
});

test("stored targets still show add weight and step back until the setting is off", () => {
  const prev = app.state;
  const prevUnits = app.units;
  const prevW = app.wUnit;
  app.units = () => "imperial";
  app.wUnit = () => "lb";
  const base = JSON.parse(JSON.stringify(prev));
  const routine = {
    id: "prog-upper", name: "Upper",
    exercises: [
      { name: "Bench Press", muscles: ["chest"], sets: [{ w: 90, r: 5 }, { w: 90, r: 5 }, { w: 90, r: 5 }] },
      { name: "Row", muscles: ["lats"], sets: [{ w: 80, r: 8 }] },
    ],
  };
  base.workouts = [...(base.workouts || []), routine];
  const hit = {
    id: "prog-hit", date: "2026-01-01", workoutId: routine.id, name: "Upper",
    startedAt: "2026-01-01T11:00:00", finishedAt: "2026-01-01T12:00:00",
    entries: [{ exercise: "Bench Press", sets: [{ w: 100, r: 8 }, { w: 100, r: 8 }] }],
  };
  const live = {
    id: "prog-live", date: app.today(), workoutId: routine.id, name: "Upper",
    startedAt: new Date().toISOString(), finishedAt: null, entries: [],
  };
  base.sessions = [hit, live];
  delete base.showProgression;
  app.replaceState(base);
  try {
    assert.match(app.progressionSettingHTML(), /Show progression suggestions/);
    assert.match(app.progressionSettingHTML(), /aria-checked="true"/);
    const up = app.suggestion("Bench Press", live.id);
    assert.equal(up.kind, "up");
    assert.equal(up.w, 105);
    assert.equal(up.sets, 2);
    const upHtml = app.liveSuggestionHTML("Bench Press", live.id, 0, 0);
    assert.match(upHtml, /Add weight/);
    assert.doesNotMatch(upHtml, /Target from this routine/);
    const row = app.suggestion("Row", live.id);
    assert.match(row.why, /Target from this routine/);
    assert.match(app.liveSuggestionHTML("Row", live.id, 1, 0), /Repeat/);

    base.sessions.push(
      {
        id: "prog-miss-a", date: "2026-01-08", workoutId: routine.id, name: "Upper",
        startedAt: "2026-01-08T11:00:00", finishedAt: "2026-01-08T12:00:00",
        entries: [{ exercise: "Bench Press", sets: [{ w: 100, r: 4 }, { w: 100, r: 4 }] }],
      },
      {
        id: "prog-miss-b", date: "2026-01-15", workoutId: routine.id, name: "Upper",
        startedAt: "2026-01-15T11:00:00", finishedAt: "2026-01-15T12:00:00",
        entries: [{ exercise: "Bench Press", sets: [{ w: 100, r: 5 }, { w: 100, r: 5 }] }],
      },
    );
    const down = app.suggestion("Bench Press", live.id);
    assert.equal(down.kind, "down");
    assert.match(app.liveSuggestionHTML("Bench Press", live.id, 0, 0), /Step back/);
    assert.doesNotMatch(app.liveSuggestionHTML("Bench Press", live.id, 0, 0), /Target from this routine/);

    const before = app.state.settingsAt || 0;
    app.toggleProgressionSuggestions();
    assert.equal(app.state.showProgression, false);
    assert.ok(app.state.settingsAt > before);
    assert.equal(app.suggestion("Bench Press", live.id), null);
    assert.equal(app.suggestion("Row", live.id), null);
    assert.equal(app.liveSuggestionHTML("Bench Press", live.id, 0, 0), "");
    assert.equal(app.liveSuggestionHTML("Row", live.id, 1, 0), "");
    assert.equal(app.liveSuggestionHTML("Bench Press", live.id, 0, 1), "");
    assert.deepEqual(app.setFieldHints(live, "Bench Press"), { w: "90", r: "5", wR: "90", rR: "5" });
    assert.match(app.progressionSettingHTML(), /aria-checked="false"/);
    app.save();
    const raw = JSON.parse(localStorage.getItem(app.KEY));
    assert.equal(raw.showProgression, false);
    assert.equal(app.userDataBlob().showProgression, false);

    app.mergeRemote({ settingsAt: app.state.settingsAt + 10, showProgression: true, sessions: [] });
    assert.equal(app.state.showProgression, true);
    assert.equal(app.suggestion("Bench Press", live.id).kind, "down");
    app.mergeRemote({ settingsAt: 1, showProgression: false, sessions: [] });
    assert.equal(app.state.showProgression, true);
    const keptAt = app.state.settingsAt;
    app.mergeRemote({ settingsAt: keptAt + 5, sessions: [] });
    assert.equal(app.state.showProgression, true);
    app.state.showProgression = false;
    app.mergeRemote({ settingsAt: app.state.settingsAt + 5, showProgression: false, sessions: [] });
    assert.equal(app.state.showProgression, false);

    app.toggleProgressionSuggestions();
    assert.equal(app.state.showProgression, true);
    assert.match(app.liveSuggestionHTML("Bench Press", live.id, 0, 0), /Step back/);

    const migratedOff = app.migrate({ version: 2, sessions: [], workouts: [], showProgression: false });
    assert.equal(migratedOff.showProgression, false);
    const migratedOn = app.migrate({ version: 2, sessions: [], workouts: [] });
    assert.equal(migratedOn.showProgression, true);
  } finally {
    app.units = prevUnits;
    app.wUnit = prevW;
    app.replaceState(prev);
  }
});

test("removing an exercise during a routine workout does not change the routine", () => {
  const template = app.workoutById("push").exercises.map((e) => e.name);
  const s = {
    id: "live-push", date: app.today(), workoutId: "push", name: "Push",
    startedAt: new Date().toISOString(), finishedAt: null,
    entries: [{ exercise: "Dips", muscles: ["chest"], sets: [{ w: 0, r: 8 }] }],
  };
  const i = app.liveExercises(s).findIndex((e) => e.name === "Dips");
  assert.ok(i >= 0);
  app.applyLiveRemoval(s, i);
  assert.equal(app.liveExercises(s).some((e) => e.name === "Dips"), false);
  assert.deepEqual(app.workoutById("push").exercises.map((e) => e.name), template);
});
