import assert from "node:assert/strict";
import test from "node:test";
import { app } from "../logger/js/runtime.js";
import { routineEarlyWindow } from "../logger/js/shared/daily-routines-store.js";
import { applyPurges, notePurge, unionPurges } from "../logger/js/shared/purge.js";
import { addPurge, stripRange } from "../supabase/functions/_shared/strip.ts";

const store = {};
globalThis.localStorage = {
  getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
globalThis.window = globalThis;
globalThis.document = {
  addEventListener() {},
  removeEventListener() {},
  documentElement: { dataset: {}, classList: { add() {}, remove() {} }, style: { setProperty() {} } },
  body: {},
  head: {},
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  createElement: () => ({}),
};

await import("../logger/js/data/state.js");
await import("../logger/js/shared/cloud.js");
await import("../logger/js/pages/privacy.js");

function dose(id, day, at, updatedAt) {
  return { id, day, status: "done", amount: 1, unit: "mg", at, updatedAt, deletedAt: null };
}

function live(id) {
  return (app.state.dailyRoutines.logs || []).find((row) => row && row.id === id && !(row.deletedAt > 0));
}

function armDelete() {
  app.ui = {};
  app.purgeBusy = false;
  app.ask = async () => true;
  app.fmtDate = (day) => day;
  app.toast = () => {};
  app.render = () => {};
  app.save = () => {};
  app.dropPhotosInRange = async () => {};
  app.session = null;
  app.sb = null;
}

test("a push reply after an account or session switch does not change this phone", async () => {
  const local = { updatedAt: 1, logs: [dose("mine", "2026-11-21", 100, 100)] };
  const foreign = { updatedAt: 50, logs: [dose("theirs", "2026-11-21", 200, 200)] };
  let release;
  let saved = 0;
  app.state = { dailyRoutines: structuredClone(local), machineNotes: {}, layout: {}, lastCloud: 1 };
  app.save = () => { saved += 1; };
  app.render = () => {};
  app.session = { user: { id: "account-a" }, access_token: "session-a" };
  const started = app.session;
  app.sb = {
    rpc: () => new Promise((resolve) => {
      release = () => resolve({ data: { dailyRoutines: structuredClone(foreign), machineNotes: { bench: { text: "other", at: 9 } } }, error: null });
    }),
  };
  const pending = app.cloudPush();
  app.session = { user: { id: "account-b" }, access_token: "session-b" };
  release();
  await pending;
  assert.equal(saved, 0);
  assert.equal(app.state.lastCloud, 1);
  assert.deepEqual(app.state.dailyRoutines, local);

  saved = 0;
  app.state.dailyRoutines = structuredClone(local);
  app.state.lastCloud = 1;
  app.session = started;
  app.sb = {
    rpc: () => new Promise((resolve) => {
      release = () => resolve({ data: { dailyRoutines: structuredClone(foreign) }, error: null });
    }),
  };
  const again = app.cloudPush();
  app.session = { user: { id: "account-a" }, access_token: "session-a-2" };
  release();
  await again;
  assert.equal(saved, 0);
  assert.equal(app.state.lastCloud, 1);
  assert.deepEqual(app.state.dailyRoutines, local);

  let upserts = 0;
  app.session = started;
  app.state.machineNotes = {};
  app.sb = {
    rpc: async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function merge_user_data" } }),
    from() {
      return {
        select() {
          return { eq() { return { maybeSingle: () => new Promise((resolve) => {
            release = () => resolve({ data: { data: { machineNotes: { bench: { text: "other", at: 9 } }, layout: { homeV2: { items: ["x"], updatedAt: 5 } } } }, error: null });
          }) }; } };
        },
        upsert: async () => { upserts += 1; return { error: null }; },
      };
    },
  };
  const fallback = app.cloudPush();
  app.session = null;
  release();
  await fallback;
  assert.equal(upserts, 0);
  assert.deepEqual(app.state.machineNotes, {});
  assert.equal(app.state.lastCloud, 1);
});

test("an offline date-range delete removes the early dose immediately", async () => {
  const from = "2026-11-21";
  const early = routineEarlyWindow(from, 4);
  const dawnAt = early.routineEarlyFrom + 30 * 60 * 1000;
  const newerAt = Date.now() + 10_000;
  armDelete();
  app.state = {
    dailyRoutines: {
      updatedAt: 1,
      settings: { dayRolloverHour: 4, updatedAt: 1 },
      logs: [
        dose("dawn", "2026-11-20", dawnAt, dawnAt),
        dose("kept", from, newerAt, newerAt),
      ],
    },
    purges: [],
    sessions: [],
    deleted: [],
  };
  await app.purgeRange(from, from);
  assert.ok(!live("dawn"));
  assert.ok(live("kept"));
  assert.equal(app.state.purges[0].routineEarlyFrom, early.routineEarlyFrom);
  assert.equal(app.state.purges[0].routineEarlyTo, early.routineEarlyTo);
});

test("deleting the same dates again after the rollover changes keeps the new window", async () => {
  const from = "2026-11-21";
  const first = routineEarlyWindow(from, 4);
  const next = routineEarlyWindow(from, 6);
  const insideNext = next.routineEarlyFrom + 5 * 60 * 60 * 1000;
  armDelete();
  app.state = {
    dailyRoutines: {
      updatedAt: 1,
      settings: { dayRolloverHour: 4, updatedAt: 1 },
      logs: [dose("dawn", "2026-11-20", first.routineEarlyFrom + 30 * 60 * 1000, first.routineEarlyFrom + 30 * 60 * 1000)],
    },
    purges: [],
    sessions: [],
    deleted: [],
  };
  await app.purgeRange(from, from);
  assert.equal(app.state.purges[0].routineEarlyTo, first.routineEarlyTo);
  app.state.dailyRoutines.settings.dayRolloverHour = 6;
  app.state.dailyRoutines.logs.push(dose("five", "2026-11-20", insideNext, insideNext));
  await app.purgeRange(from, from);
  assert.equal(app.state.purges.length, 1);
  assert.equal(app.state.purges[0].routineEarlyFrom, next.routineEarlyFrom);
  assert.equal(app.state.purges[0].routineEarlyTo, next.routineEarlyTo);
  assert.ok(!live("five"));
  const cutoff = app.state.purges[0].deletedAt;
  const after = cutoff + 10_000;
  app.state.dailyRoutines.logs.push(dose("after", "2026-11-20", insideNext, after));
  const ackAt = cutoff + 60_000;
  notePurge(app.state.purges, from, from, true, ackAt, first);
  assert.equal(app.state.purges[0].deletedAt, cutoff);
  assert.equal(app.state.purges[0].routineEarlyTo, next.routineEarlyTo);
  assert.equal(app.state.purges[0].synced, true);
  applyPurges(app.state, ackAt);
  assert.ok(live("after"));
  const merged = unionPurges(
    app.state.purges,
    [{ from, to: from, at: cutoff - 1, deletedAt: cutoff - 1, synced: true, routineEarlyFrom: first.routineEarlyFrom, routineEarlyTo: first.routineEarlyTo }],
    ackAt,
  );
  assert.equal(merged[0].deletedAt, cutoff);
  assert.equal(merged[0].routineEarlyTo, next.routineEarlyTo);
});

test("a newer dose survives the delete and a server replay does not restore the old window", () => {
  const from = "2026-11-21";
  const hour4 = routineEarlyWindow(from, 4);
  const hour6 = routineEarlyWindow(from, 6);
  const hour0 = routineEarlyWindow(from, 0);
  assert.equal(hour0.routineEarlyFrom, hour0.routineEarlyTo);
  const firstCutoff = hour4.routineEarlyTo - 1;
  const secondCutoff = hour6.routineEarlyTo - 1;
  const fiveAt = hour6.routineEarlyFrom + 5 * 60 * 60 * 1000;
  const evening = hour0.routineEarlyFrom - 60 * 60 * 1000;
  let data = {
    dailyRoutines: {
      logs: [
        dose("dawn", "2026-11-20", hour4.routineEarlyFrom + 30 * 60 * 1000, hour4.routineEarlyFrom),
        dose("five", "2026-11-20", fiveAt, fiveAt),
        dose("evening", "2026-11-20", evening, evening),
      ],
    },
    purges: [],
  };
  data = addPurge(
    stripRange(data, from, from, firstCutoff, firstCutoff, hour4.routineEarlyFrom, hour4.routineEarlyTo),
    from, from, firstCutoff, firstCutoff, hour4.routineEarlyFrom, hour4.routineEarlyTo,
  );
  data = addPurge(
    stripRange(data, from, from, secondCutoff, secondCutoff, hour6.routineEarlyFrom, hour6.routineEarlyTo),
    from, from, secondCutoff, secondCutoff, hour6.routineEarlyFrom, hour6.routineEarlyTo,
  );
  assert.equal(data.purges[0].routineEarlyTo, hour6.routineEarlyTo);
  assert.equal(data.purges[0].deletedAt, secondCutoff);
  assert.ok(data.dailyRoutines.logs.find((row) => row.id === "five").deletedAt > 0);
  assert.equal(data.dailyRoutines.logs.find((row) => row.id === "evening").deletedAt, null);
  data = addPurge(data, from, from, secondCutoff, secondCutoff + 1000, hour4.routineEarlyFrom, hour4.routineEarlyTo);
  assert.equal(data.purges[0].deletedAt, secondCutoff);
  assert.equal(data.purges[0].routineEarlyTo, hour6.routineEarlyTo);
  const later = secondCutoff + 10_000;
  data.dailyRoutines.logs.push(dose("fresh", from, later, later));
  data.dailyRoutines.logs.push(dose("lateDawn", "2026-11-20", hour4.routineEarlyFrom + 30 * 60 * 1000, hour4.routineEarlyFrom + 30 * 60 * 1000));
  const third = secondCutoff + 1000;
  data = addPurge(
    stripRange(data, from, from, third, third, hour0.routineEarlyFrom, hour0.routineEarlyTo),
    from, from, third, third, hour0.routineEarlyFrom, hour0.routineEarlyTo,
  );
  assert.equal(data.purges[0].routineEarlyFrom, hour0.routineEarlyFrom);
  assert.equal(data.purges[0].routineEarlyTo, hour0.routineEarlyTo);
  assert.equal(data.dailyRoutines.logs.find((row) => row.id === "evening").deletedAt, null);
  assert.equal(data.dailyRoutines.logs.find((row) => row.id === "lateDawn").deletedAt, null);
  assert.equal(data.dailyRoutines.logs.find((row) => row.id === "fresh").deletedAt, null);
});
