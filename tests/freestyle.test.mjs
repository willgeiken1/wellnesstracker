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
