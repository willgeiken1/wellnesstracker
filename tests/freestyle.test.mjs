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
await import("../logger/js/shared/cloud.js");

test("a freestyle workout becomes one routine and can be updated in place", () => {
  const s = app.freestyleSession();
  assert.equal(s.origin, "freestyle");
  assert.equal(s.name, "Freestyle");
  assert.equal(s.workoutId, "fs:" + s.id);
  assert.equal(app.workoutById(s.workoutId), undefined);
  assert.equal(app.commitFreestyleRoutine(s, "  "), null);
  assert.equal(app.commitFreestyleRoutine(s, "Upper"), null);

  s.extra = [{ name: "Bench Press", muscles: ["chest"], adv: ["pecUpper"] }];
  const created = app.commitFreestyleRoutine(s, "Upper");
  assert.ok(created);
  assert.equal(created.name, "Upper");
  assert.equal(created.exercises.length, 1);
  assert.equal(created.exercises[0].name, "Bench Press");
  assert.deepEqual(created.exercises[0].adv, ["pecUpper"]);
  assert.equal(s.workoutId, created.id);
  assert.equal(s.name, "Upper");
  assert.equal(s.origin, "freestyle");
  assert.deepEqual(s.extra, []);
  assert.deepEqual(s.swaps, {});
  assert.equal(app.slugRoutineId("Push"), "push-2");

  s.extra = [{ name: "Row", muscles: ["lats"] }];
  const updated = app.commitFreestyleRoutine(s, "Upper 2");
  assert.equal(updated.id, created.id);
  assert.equal(updated.name, "Upper 2");
  assert.deepEqual(updated.exercises.map((e) => e.name), ["Bench Press", "Row"]);
  assert.equal(app.state.workouts.filter((w) => w.id === created.id).length, 1);
  assert.deepEqual(s.extra, []);

  app.state.sessions.push(s);
  app.save();
  const raw = JSON.parse(localStorage.getItem(app.KEY));
  assert.ok(raw.workouts.some((w) => w.id === created.id && w.name === "Upper 2" && w.exercises.some((e) => e.name === "Bench Press")));
  assert.ok(raw.sessions.some((x) => x.id === s.id && x.origin === "freestyle" && x.workoutId === created.id));
  const blob = app.userDataBlob();
  assert.ok(blob.workouts.some((w) => w.id === created.id && w.exercises.some((e) => e.name === "Row")));
  assert.ok(blob.sessions.some((x) => x.origin === "freestyle" && x.name === "Upper 2"));
});
