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

app.applyTheme = () => {};
app.mergeFood = () => {};
app.mergeCardio = () => {};

function syncSeed() {
  const raw = process.env.FREESTYLE_SYNC_SEED;
  if (raw == null || raw === "") return 20261012;
  if (!/^\d+$/.test(raw)) throw new Error(`FREESTYLE_SYNC_SEED must be an unsigned integer, got ${raw}`);
  const seed = Number(raw);
  if (!Number.isSafeInteger(seed)) throw new Error(`FREESTYLE_SYNC_SEED is out of range, got ${raw}`);
  return seed;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MOVES = [
  { name: "Bench Press", muscles: ["chest"], adv: ["pecUpper"] },
  { name: "Row", muscles: ["lats"] },
  { name: "Squat", muscles: ["quads"] },
  { name: "Pull-Up", muscles: ["lats"] },
];

const clone = (v) => JSON.parse(JSON.stringify(v));

/* An older build stores the log and the routine, and drops fields it does not know. */
function oldClientCopy(blob) {
  const copy = clone(blob);
  copy.sessions = (copy.sessions || []).map((s) => {
    const next = { ...s };
    delete next.origin;
    delete next.extra;
    delete next.order;
    delete next.removed;
    delete next.swaps;
    return next;
  });
  return copy;
}

function blobOf(state) {
  const prev = app.state;
  app.state = state;
  try { return clone(app.userDataBlob()); }
  finally { app.state = prev; }
}

function pull(state, remote) {
  const prev = app.state;
  app.state = state;
  try { app.mergeRemote(clone(remote)); }
  finally { app.state = prev; }
}

function shuffle(list, rnd) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const swap = a[i];
    a[i] = a[j];
    a[j] = swap;
  }
  return a;
}

function sessionById(state, id) {
  return (state.sessions || []).find((s) => s && s.id === id);
}

const SEED = syncSeed();
const snapshot = clone(app.state);

function fresh() {
  const s = clone(snapshot);
  s.sessions = [];
  s.deleted = [];
  s.updatedAt = 10;
  return s;
}

test("a seeded freestyle sync round-trips across two devices and an old client", () => {
  console.log(`FREESTYLE_SYNC_SEED=${SEED}`);
  const rnd = mulberry32(SEED);
  const prev = app.state;
  try {
    const tombA = fresh();
    const ghost = app.freestyleSession();
    ghost.id = "ghost-empty";
    ghost.workoutId = "fs:ghost-empty";
    ghost.entries = [];
    ghost.extra = [{ name: "Bench Press", muscles: ["chest"] }];
    tombA.sessions = [ghost];
    app.state = tombA;
    assert.equal(app.discardEmptyFreestyle(), true);
    assert.equal(sessionById(tombA, ghost.id), undefined);
    assert.ok(tombA.deleted.includes(ghost.id));
    const tombB = fresh();
    tombB.sessions = [clone(ghost)];
    pull(tombB, blobOf(tombA));
    assert.equal(sessionById(tombB, ghost.id), undefined, "empty freestyle came back from the other phone");
    assert.ok(tombB.deleted.includes(ghost.id));

    for (let trial = 0; trial < 32; trial++) {
      const where = `FREESTYLE_SYNC_SEED=${SEED} trial ${trial}`;
      app.state = fresh();
      const s = app.freestyleSession();
      s.id = `fs-${trial}`;
      s.workoutId = "fs:" + s.id;
      const count = 2 + Math.floor(rnd() * 3);
      const picked = shuffle(MOVES, rnd).slice(0, count);
      s.extra = picked.map((m) => ({ name: m.name, muscles: [...m.muscles], ...(m.adv ? { adv: [...m.adv] } : {}) }));
      s.entries = picked.map((m) => ({
        exercise: m.name,
        muscles: [...m.muscles],
        sets: Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => ({ w: 20 + Math.floor(rnd() * 180), r: 1 + Math.floor(rnd() * 12) })),
      }));
      const routine = app.commitFreestyleRoutine(s, `Sync ${trial}`);
      assert.ok(routine, where);
      const names = picked.map((m) => m.name);
      s.order = shuffle(names, rnd);
      s.extra = [{ name: "Curl", muscles: ["biceps"] }];
      s.removed = ["Temp"];
      s.swaps = { Row: { name: "Cable Row", muscles: ["lats"] } };
      s.mod = 1000 + trial;
      app.state.sessions = [s];
      app.state.updatedAt = 5000 + trial;
      const richState = clone(app.state);
      const rich = blobOf(richState);
      const old = oldClientCopy(rich);
      const stripped = old.sessions.find((x) => x.id === s.id);
      assert.equal(stripped.origin, undefined, where);
      assert.equal("order" in stripped, false, where);
      assert.equal(rich.sessions.find((x) => x.id === s.id).origin, "freestyle", where);

      const phoneB = fresh();
      phoneB.updatedAt = 1;
      pull(phoneB, old);
      pull(phoneB, rich);
      const onB = sessionById(phoneB, s.id);
      assert.ok(onB, where);
      assert.equal(onB.origin, "freestyle", where);
      assert.deepEqual(onB.order, s.order, where);
      assert.deepEqual(onB.extra, s.extra, where);
      assert.deepEqual(onB.removed, s.removed, where);
      assert.deepEqual(onB.swaps, s.swaps, where);
      assert.deepEqual(onB.entries, s.entries, where);
      assert.equal(onB.workoutId, routine.id, where);
      const routineB = phoneB.workouts.find((w) => w.id === routine.id);
      assert.ok(routineB, where);
      assert.equal(routineB.name, routine.name, where);
      assert.deepEqual(routineB.exercises.map((e) => e.name), routine.exercises.map((e) => e.name), where);

      const phoneC = fresh();
      phoneC.updatedAt = 1;
      pull(phoneC, rich);
      pull(phoneC, old);
      const onC = sessionById(phoneC, s.id);
      assert.equal(onC.origin, "freestyle", where);
      assert.deepEqual(onC.order, s.order, where);
      assert.deepEqual(onC.removed, s.removed, where);
      assert.ok(phoneC.workouts.some((w) => w.id === routine.id), where);

      const extraW = 200 + trial;
      onB.entries[0].sets.push({ w: extraW, r: 3 });
      onB.mod = s.mod + 25;
      phoneB.updatedAt = rich.updatedAt + 50;
      const back = blobOf(phoneB);

      const phoneA = clone(richState);
      pull(phoneA, old);
      const afterOld = sessionById(phoneA, s.id);
      assert.equal(afterOld.origin, "freestyle", where);
      assert.deepEqual(afterOld.order, s.order, where);
      assert.deepEqual(afterOld.extra, s.extra, where);
      assert.deepEqual(afterOld.swaps, s.swaps, where);
      pull(phoneA, back);
      const onA = sessionById(phoneA, s.id);
      assert.equal(onA.origin, "freestyle", where);
      assert.deepEqual(onA.order, s.order, where);
      assert.equal(onA.entries[0].sets.at(-1).w, extraW, where);
      assert.equal(onA.entries[0].sets.length, s.entries[0].sets.length + 1, where);
      assert.equal(onA.workoutId, routine.id, where);
      const routineA = phoneA.workouts.find((w) => w.id === routine.id);
      assert.ok(routineA, where);
      assert.equal(routineA.name, routine.name, where);
      assert.deepEqual(onA.entries[0].sets.slice(0, -1), s.entries[0].sets, where);
    }
  } finally {
    app.state = prev;
  }
});
