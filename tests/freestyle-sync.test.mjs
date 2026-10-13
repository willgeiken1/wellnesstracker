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
    ghost.date = "1999-01-02";
    ghost.startedAt = "1999-01-02T08:00:00";
    ghost.entries = [];
    ghost.extra = [];
    tombA.sessions = [ghost];
    app.state = tombA;
    assert.equal(app.discardEmptyFreestyle(), true);
    assert.equal(sessionById(tombA, ghost.id), undefined);
    assert.equal(tombA.deleted.some((m) => app.deletedId(m) === ghost.id), false);
    const tombB = fresh();
    const logged = clone(ghost);
    logged.entries = [{ exercise: "Squat", muscles: ["quads"], sets: [{ w: 60, r: 5 }] }];
    logged.mod = Date.now();
    tombB.sessions = [logged];
    pull(tombB, blobOf(tombA));
    const survived = sessionById(tombB, ghost.id);
    assert.ok(survived, "sets were lost because the other phone discarded an empty copy");
    assert.equal(survived.entries[0].sets[0].w, 60);

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

/* Phone A starts a freestyle and syncs it while it is still empty. Phone B opens
   and may discard that copy. Phone A then logs sets and pulls. The sets must remain,
   even if B still publishes the old string deletion marker. */
test("a seeded two-device race keeps sets logged after an empty discard", () => {
  console.log(`FREESTYLE_SYNC_SEED=${SEED}`);
  const rnd = mulberry32(SEED);
  const prev = app.state;
  try {
    for (let trial = 0; trial < 24; trial++) {
      const where = `FREESTYLE_SYNC_SEED=${SEED} race ${trial}`;
      const kind = Math.floor(rnd() * 4);
      const id = `race-${trial}`;
      const session = app.freestyleSession();
      session.id = id;
      session.workoutId = "fs:" + id;
      session.entries = [];
      session.extra = [];
      session.order = [];
      if (kind === 1) {
        session.date = "1999-01-01";
        session.startedAt = "1999-01-01T08:00:00";
      } else if (kind === 2) {
        session.extra = [{ name: "Bench Press", muscles: ["chest"] }];
      } else if (kind === 3) {
        session.mod = Date.now() - app.EMPTY_FREESTYLE_STALE_MS - 60_000;
        session.startedAt = new Date(session.mod).toISOString();
      }
      const phoneB = fresh();
      phoneB.sessions = [clone(session)];
      app.state = phoneB;
      const dropped = app.discardEmptyFreestyle();
      const stillThere = !!sessionById(phoneB, id);
      if (kind === 0 || kind === 2) {
        assert.equal(dropped, false, where);
        assert.equal(stillThere, true, where);
      } else {
        assert.equal(dropped, true, where);
        assert.equal(stillThere, false, where);
      }
      assert.equal(phoneB.deleted.some((m) => app.deletedId(m) === id), false, where + " wrote a synced deletion marker");

      const weight = 40 + trial;
      const phoneA = fresh();
      const logged = clone(session);
      logged.entries = [{ exercise: "Squat", muscles: ["quads"], sets: [{ w: weight, r: 5 }] }];
      logged.mod = Date.now() + 10_000;
      phoneA.sessions = [logged];
      const buggy = blobOf(phoneB);
      buggy.deleted = [...(buggy.deleted || []), id];
      pull(phoneA, buggy);
      const kept = sessionById(phoneA, id);
      assert.ok(kept, where + " lost the session");
      assert.equal(kept.entries[0].sets[0].w, weight, where + " lost the sets");
      assert.equal(phoneA.deleted.some((m) => app.deletedId(m) === id), false, where + " kept the empty-session marker");
    }

    const cancelled = fresh();
    const live = app.freestyleSession();
    live.id = "cancel-live";
    live.entries = [{ exercise: "Squat", muscles: ["quads"], sets: [{ w: 100, r: 5 }] }];
    live.mod = Date.now() - 10_000;
    cancelled.sessions = [live];
    const cancelBlob = fresh();
    cancelBlob.deleted = [{ id: live.id, at: Date.now() }];
    pull(cancelled, blobOf(cancelBlob));
    assert.equal(sessionById(cancelled, live.id), undefined, "a newer delete lost to sets");
    assert.equal(cancelled.deleted.some((m) => app.deletedId(m) === live.id), true);

    const later = fresh();
    const grew = app.freestyleSession();
    grew.id = "grew";
    grew.entries = [{ exercise: "Squat", muscles: ["quads"], sets: [{ w: 80, r: 5 }] }];
    grew.mod = Date.now();
    later.sessions = [grew];
    const earlyDelete = fresh();
    earlyDelete.deleted = [{ id: grew.id, at: Date.now() - 60_000 }];
    pull(later, blobOf(earlyDelete));
    assert.equal(sessionById(later, grew.id).entries[0].sets[0].w, 80, "sets logged after a delete were dropped");
    assert.equal(later.deleted.some((m) => app.deletedId(m) === grew.id), false);

    const finished = fresh();
    finished.sessions = [{
      id: "done-1", date: "2020-01-01", workoutId: "push", name: "Push", origin: "freestyle",
      finishedAt: "2020-01-01T12:00:00", mod: 50,
      entries: [{ exercise: "Squat", muscles: ["quads"], sets: [{ w: 100, r: 5 }] }],
    }];
    const doneBlob = fresh();
    doneBlob.deleted = ["done-1"];
    pull(finished, blobOf(doneBlob));
    assert.equal(sessionById(finished, "done-1"), undefined, "a finished workout came back");
  } finally {
    app.state = prev;
  }
});
