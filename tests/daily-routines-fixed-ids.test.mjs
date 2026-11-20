import assert from "node:assert/strict";
import { describe, test } from "node:test";

/* Synthetic routines only. Two phones start from one copy, write on their
   own, then merge in either order and again with each stale copy. Every
   order has to end in the same rows. */

function el() {
  return {
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    appendChild() {},
    remove() {},
    click() {},
    classList: { add() {}, remove() {}, toggle() {} },
    style: {},
    dataset: {},
    hidden: true,
    innerHTML: "",
  };
}
globalThis.document = {
  addEventListener() {},
  removeEventListener() {},
  documentElement: { dataset: {}, classList: { add() {}, remove() {} } },
  body: el(),
  head: el(),
  querySelector: () => el(),
  querySelectorAll: () => [],
  getElementById: () => el(),
  createElement: () => el(),
};
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { app } = await import("../logger/js/runtime.js");
const {
  addRoutineItem,
  dailyRoutinesHTML,
  deleteRoutineBlock,
  deleteRoutineItem,
  editRoutineLog,
  logRoutineItem,
  renameRoutineBlock,
  renameRoutineItem,
  restoreRoutineLog,
  routineLogDraft,
  saveRoutineItem,
  skipRoutineItem,
  undoRoutineLog,
} = await import("../logger/js/pages/daily-routines.js");
const { routineLogSheetHTML } = await import("../logger/js/pages/daily-routines-dose.js");
const { emptyDailyRoutines, isLive, mergeDailyRoutines, routineLogId } = await import("../logger/js/shared/daily-routines-store.js");

function pin(day, hour = 8, minute = 30) {
  const [y, m, d] = day.split("-").map(Number);
  app.today = () => day;
  app.routineNow = () => new Date(y, m - 1, d, hour, minute);
}

function signIn(day = "2026-11-19") {
  app.ROUTINES_ENABLED = true;
  app.session = { user: { id: "synthetic-user" } };
  app.sb = null;
  app.cloudPullOk = true;
  app.state = { dailyRoutines: null };
  app.ui = { tab: "daily-routines", sheet: null, sd: {}, dailyRoutineEdit: false };
  app.save = () => {};
  app.render = () => {};
  app.renderSheet = () => {};
  app.$ = () => null;
  pin(day);
  dailyRoutinesHTML();
}

function blockId(name) {
  const block = app.state.dailyRoutines.blocks.find((row) => row.name === name && isLive(row));
  assert.ok(block, name);
  return block.id;
}

function addDose(block, name = "Example Compound A") {
  assert.equal(addRoutineItem(app.state, block, { name, kind: "dose", amount: 250, unit: "mcg" }), true);
  return app.state.dailyRoutines.items.find((row) => row.name === name);
}

function addCheck(block, name = "Example Check B") {
  assert.equal(addRoutineItem(app.state, block, { name, kind: "check" }), true);
  return app.state.dailyRoutines.items.find((row) => row.name === name);
}

/* Runs one write on a copy of the store, as another phone would. */
function onPhone(store, write) {
  app.state = { dailyRoutines: structuredClone(store) };
  write();
  return structuredClone(app.state.dailyRoutines);
}

function rows(store, collection) {
  return store[collection].slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/* Both merge orders, and each result merged again with both stale copies,
   give the same rows. Returns the converged store. */
function converge(phoneA, phoneB) {
  const ab = mergeDailyRoutines(phoneA, phoneB);
  const ba = mergeDailyRoutines(phoneB, phoneA);
  for (const collection of ["blocks", "items", "placements", "logs"]) {
    assert.deepEqual(rows(ba, collection), rows(ab, collection), `${collection} in either order`);
    for (const stale of [phoneA, phoneB]) {
      for (const again of [mergeDailyRoutines(ab, stale), mergeDailyRoutines(stale, ab)]) {
        assert.deepEqual(rows(again, collection), rows(ab, collection), `${collection} after a stale copy`);
      }
    }
  }
  return ab;
}

function liveLogs(store, itemId, day) {
  return store.logs.filter((row) => isLive(row) && row.itemId === itemId && (day == null || row.day === day));
}

describe("routine fixed ids", { concurrency: false }, () => {
  test("older random-id logs for one item and day merge to one live log", () => {
    const logA = { id: "log_old_phone_a", itemId: "item-a", day: "2026-11-19", status: "done", amount: 250, unit: "mcg", updatedAt: 10, deletedAt: null };
    const logB = { id: "log_old_phone_b", itemId: "item-a", day: "2026-11-19", status: "skipped", amount: null, unit: "", updatedAt: 12, deletedAt: null };
    const restA = { id: "rest_old_a", itemId: null, day: "2026-11-19", status: "done", rest: true, updatedAt: 10, deletedAt: null };
    const restB = { id: "rest_old_b", itemId: null, day: "2026-11-19", status: "done", rest: true, updatedAt: 11, deletedAt: null };
    const phoneA = { ...emptyDailyRoutines(10), logs: [logA, restA] };
    const phoneB = { ...emptyDailyRoutines(12), logs: [logB, restB] };
    const merged = converge(phoneA, phoneB);
    const live = liveLogs(merged, "item-a", "2026-11-19");
    assert.equal(live.length, 1);
    assert.equal(live[0].id, "log_old_phone_b");
    assert.equal(live[0].status, "skipped");
    assert.equal(merged.logs.filter((row) => isLive(row) && row.rest === true).length, 1);
    const loser = merged.logs.find((row) => row.id === "log_old_phone_a");
    assert.equal(isLive(loser), false);
    assert.equal(loser.amount, undefined);
  });
});
