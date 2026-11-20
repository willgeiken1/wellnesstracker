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

  test("two phones moving one log to different days keep one live log", () => {
    signIn("2026-11-19");
    const item = addDose(blockId("Morning routine"));
    assert.equal(logRoutineItem(app.state, item.id), true);
    const log = liveLogs(app.state.dailyRoutines, item.id)[0];
    const base = structuredClone(app.state.dailyRoutines);
    pin("2026-11-19", 9, 0);
    const phoneA = onPhone(base, () => assert.equal(editRoutineLog(app.state, log.id, { amount: "250", day: "2026-11-18" }), true));
    pin("2026-11-19", 9, 5);
    const phoneB = onPhone(base, () => assert.equal(editRoutineLog(app.state, log.id, { amount: "250", day: "2026-11-17" }), true));
    const merged = converge(phoneA, phoneB);
    const live = liveLogs(merged, item.id);
    assert.equal(live.length, 1);
    assert.equal(liveLogs(phoneA, item.id)[0].id, log.id);
    assert.equal(liveLogs(phoneB, item.id)[0].id, log.id);
    assert.equal(live[0].id, log.id);
    assert.equal(live[0].day, "2026-11-17");
  });

  test("a check-off on the old day does not take the moved log's id", () => {
    signIn("2026-11-19");
    const item = addDose(blockId("Morning routine"));
    assert.equal(logRoutineItem(app.state, item.id), true);
    const log = liveLogs(app.state.dailyRoutines, item.id)[0];
    assert.equal(log.id, routineLogId(item.id, "2026-11-19"));
    pin("2026-11-19", 9, 0);
    assert.equal(editRoutineLog(app.state, log.id, { amount: "250", day: "2026-11-18" }), true);
    const base = structuredClone(app.state.dailyRoutines);
    pin("2026-11-19", 9, 10);
    const phoneA = onPhone(base, () => assert.equal(logRoutineItem(app.state, item.id), true));
    pin("2026-11-19", 9, 20);
    const phoneB = onPhone(base, () => assert.equal(skipRoutineItem(app.state, item.id), true));
    const freshA = liveLogs(phoneA, item.id, "2026-11-19")[0];
    const freshB = liveLogs(phoneB, item.id, "2026-11-19")[0];
    assert.notEqual(freshA.id, log.id);
    assert.equal(freshA.id, freshB.id);
    assert.equal(phoneA.logs.find((row) => row.id === log.id).day, "2026-11-18");
    const merged = converge(phoneA, phoneB);
    assert.equal(liveLogs(merged, item.id, "2026-11-18").length, 1);
    assert.equal(liveLogs(merged, item.id, "2026-11-19").length, 1);
    assert.equal(liveLogs(merged, item.id, "2026-11-19")[0].status, "skipped");
    app.state = { dailyRoutines: structuredClone(merged) };
    pin("2026-11-19", 9, 30);
    assert.equal(undoRoutineLog(app.state, log.id), true);
    assert.equal(restoreRoutineLog(app.state, log.id), true);
    const back = app.state.dailyRoutines.logs.find((row) => row.id === log.id);
    assert.equal(isLive(back), true);
    assert.equal(back.day, "2026-11-18");
    assert.equal(liveLogs(app.state.dailyRoutines, item.id, "2026-11-19").length, 1);
  });

  test("a moved log and a fresh check-off on the same day merge to one live log", () => {
    signIn("2026-11-19");
    const item = addDose(blockId("Morning routine"));
    assert.equal(logRoutineItem(app.state, item.id), true);
    const log = liveLogs(app.state.dailyRoutines, item.id)[0];
    pin("2026-11-20");
    const base = structuredClone(app.state.dailyRoutines);
    pin("2026-11-20", 9, 0);
    const phoneA = onPhone(base, () => assert.equal(editRoutineLog(app.state, log.id, { amount: "250", day: "2026-11-20" }), true));
    pin("2026-11-20", 9, 5);
    const phoneB = onPhone(base, () => assert.equal(logRoutineItem(app.state, item.id), true));
    const merged = converge(phoneA, phoneB);
    assert.equal(liveLogs(merged, item.id, "2026-11-20").length, 1);
    assert.equal(liveLogs(merged, item.id).length, 1);
  });

  test("a block deleted on one phone and renamed later on the other keeps its items", () => {
    signIn("2026-11-19");
    const morning = blockId("Morning routine");
    const item = addCheck(morning);
    const base = structuredClone(app.state.dailyRoutines);
    pin("2026-11-19", 9, 0);
    const phoneA = onPhone(base, () => assert.equal(deleteRoutineBlock(app.state, morning), true));
    pin("2026-11-19", 9, 30);
    const phoneB = onPhone(base, () => assert.equal(renameRoutineBlock(app.state, morning, "Early routine"), true));
    const merged = converge(phoneA, phoneB);
    const block = merged.blocks.find((row) => row.id === morning);
    assert.equal(isLive(block), true);
    assert.equal(block.name, "Early routine");
    assert.equal(merged.placements.filter((row) => isLive(row) && row.blockId === morning && row.itemId === item.id).length, 1);
    app.state = { dailyRoutines: merged };
    assert.match(dailyRoutinesHTML(), new RegExp(`data-item-id="${item.id}"`));
  });

  test("an item deleted on one phone and renamed later on the other keeps its placement", () => {
    signIn("2026-11-19");
    const morning = blockId("Morning routine");
    const item = addCheck(morning);
    const base = structuredClone(app.state.dailyRoutines);
    pin("2026-11-19", 9, 0);
    const phoneA = onPhone(base, () => assert.equal(deleteRoutineItem(app.state, item.id), true));
    pin("2026-11-19", 9, 30);
    const phoneB = onPhone(base, () => assert.equal(renameRoutineItem(app.state, item.id, "Example Check C"), true));
    const merged = converge(phoneA, phoneB);
    assert.equal(isLive(merged.items.find((row) => row.id === item.id)), true);
    assert.equal(merged.placements.filter((row) => isLive(row) && row.blockId === morning && row.itemId === item.id).length, 1);
  });

  test("a later delete still wins over an earlier rename", () => {
    signIn("2026-11-19");
    const morning = blockId("Morning routine");
    addCheck(morning);
    const base = structuredClone(app.state.dailyRoutines);
    pin("2026-11-19", 9, 0);
    const phoneB = onPhone(base, () => assert.equal(renameRoutineBlock(app.state, morning, "Early routine"), true));
    pin("2026-11-19", 9, 30);
    const phoneA = onPhone(base, () => assert.equal(deleteRoutineBlock(app.state, morning), true));
    const merged = converge(phoneA, phoneB);
    assert.equal(isLive(merged.blocks.find((row) => row.id === morning)), false);
    assert.equal(merged.placements.filter((row) => isLive(row) && row.blockId === morning).length, 0);
  });

  test("editing the day of a dose logged before the item became a check keeps the amount", () => {
    signIn("2026-11-19");
    const morning = blockId("Morning routine");
    const item = addDose(morning);
    assert.equal(logRoutineItem(app.state, item.id), true);
    const log = liveLogs(app.state.dailyRoutines, item.id)[0];
    pin("2026-11-19", 9, 0);
    assert.equal(saveRoutineItem(app.state, { itemId: item.id, name: item.name, kind: "check", blockId: morning, blockIds: [morning] }), true);
    const draft = routineLogDraft(app.state, log.id);
    assert.equal(draft.amount, "250");
    pin("2026-11-19", 9, 10);
    assert.equal(editRoutineLog(app.state, log.id, { amount: draft.amount, day: "2026-11-18" }), true);
    const moved = app.state.dailyRoutines.logs.find((row) => row.day === "2026-11-18" && row.itemId === item.id);
    assert.equal(moved.amount, 250);
    assert.equal(moved.unit, "mcg");
    assert.equal(moved.status, "done");
    assert.equal(draft.kind, "dose");
  });

  test("editing the day of a check logged before the item became a dose needs no amount", () => {
    signIn("2026-11-19");
    const morning = blockId("Morning routine");
    const item = addCheck(morning);
    assert.equal(logRoutineItem(app.state, item.id), true);
    const log = liveLogs(app.state.dailyRoutines, item.id)[0];
    pin("2026-11-19", 9, 0);
    assert.equal(saveRoutineItem(app.state, { itemId: item.id, name: item.name, kind: "dose", amount: 250, unit: "mcg", blockId: morning, blockIds: [morning] }), true);
    const draft = routineLogDraft(app.state, log.id);
    pin("2026-11-19", 9, 10);
    assert.equal(editRoutineLog(app.state, log.id, { amount: "", day: "2026-11-18" }), true);
    const moved = app.state.dailyRoutines.logs.find((row) => row.day === "2026-11-18" && row.itemId === item.id);
    assert.equal(moved.amount, null);
    assert.equal(moved.unit, "");
    assert.equal(draft.kind, "check");
  });
});
