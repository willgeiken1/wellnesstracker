import assert from "node:assert/strict";
import test from "node:test";
import { app } from "../logger/js/runtime.js";
import {
  addRoutineItem,
  dailyRoutinesHTML,
  editRoutineLog,
  logAllRoutineBlock,
  logRoutineItem,
  parseRoutineAmount,
  saveRoutineItem,
  saveRoutineItemNote,
} from "../logger/js/pages/daily-routines.js";
import { reconstitutionNoteText, reconstitutionResult } from "../logger/js/pages/reconstitution.js";
import { freshMoveLogId, mergeDailyRoutines, purgeDailyRoutineRange, routineEarlyWindow } from "../logger/js/shared/daily-routines-store.js";
import { applyPurges, notePurge, unionPurges } from "../logger/js/shared/purge.js";
import { routineHistoryView } from "../logger/js/shared/routine-history.js";
import { routineDaysLeft } from "../logger/js/shared/routine-supply.js";
import { stripRange } from "../supabase/functions/_shared/strip.ts";

function signIn() {
  app.ROUTINES_ENABLED = true;
  app.session = { user: { id: "synthetic-user" } };
  app.sb = null;
  app.cloudPullOk = true;
  app.state = { dailyRoutines: null };
  app.save = () => {};
  app.render = () => {};
  app.today = () => "2026-11-19";
  app.routineNow = () => new Date(2026, 10, 19, 8, 30, 0);
  dailyRoutinesHTML();
}

test("a thousands comma is refused and a saved calculator note follows the new dose", () => {
  assert.equal(parseRoutineAmount("1,000"), null);
  assert.equal(parseRoutineAmount("5,000"), null);
  assert.equal(parseRoutineAmount("0,25"), 0.25);
  const zero = reconstitutionResult({ vialAmount: 5000, waterMl: 1, doseAmount: 1, vialUnit: "mg", doseUnit: "mcg" });
  assert.equal(reconstitutionNoteText(zero), "");

  signIn();
  const morning = app.state.dailyRoutines.blocks.find((block) => block.name === "Morning routine");
  assert.equal(saveRoutineItem(app.state, { name: "Example Compound A", kind: "dose", amount: "250", unit: "mcg", blockId: morning.id, blockIds: [morning.id] }), true);
  const item = app.state.dailyRoutines.items.find((row) => row.name === "Example Compound A");
  const first = reconstitutionResult({ vialAmount: 5, waterMl: 2, doseAmount: 250, vialUnit: "mg", doseUnit: "mcg" });
  assert.equal(saveRoutineItemNote(app.state, item.id, reconstitutionNoteText(first), {
    vialAmount: 5, waterMl: 2, doseAmount: 250, vialUnit: "mg", doseUnit: "mcg",
  }), true);
  assert.match(dailyRoutinesHTML(), /10 U-100 units/);
  assert.equal(saveRoutineItem(app.state, { itemId: item.id, name: "Example Compound A", kind: "dose", amount: "500", unit: "mcg", blockId: morning.id, blockIds: [morning.id] }), true);
  const html = dailyRoutinesHTML();
  assert.match(html, /20 U-100 units/);
  assert.doesNotMatch(html, /10 U-100 units/);
});

test("log all uses the shared check-off id so two phones keep one live dose", () => {
  signIn();
  const morning = app.state.dailyRoutines.blocks.find((block) => block.name === "Morning routine");
  assert.equal(saveRoutineItem(app.state, { name: "Example Compound A", kind: "dose", amount: "250", unit: "mcg", blockId: morning.id, blockIds: [morning.id] }), true);
  const bare = structuredClone(app.state.dailyRoutines);
  const ids = logAllRoutineBlock(app.state, morning.id);
  assert.equal(ids.length, 1);
  assert.match(ids[0], /2026-11-19$/);
  const phoneA = structuredClone(app.state.dailyRoutines);
  app.state.dailyRoutines = structuredClone(bare);
  const item = app.state.dailyRoutines.items.find((row) => row.name === "Example Compound A");
  assert.equal(logRoutineItem(app.state, item.id), true);
  const phoneB = structuredClone(app.state.dailyRoutines);
  const live = (store) => (store.logs || []).filter((row) => row.itemId === item.id && !(row.deletedAt > 0));
  for (const [left, right] of [[phoneA, phoneB], [phoneB, phoneA]]) {
    const merged = mergeDailyRoutines(left, right, Date.parse("2026-11-19T16:00:00Z"));
    assert.equal(live(merged).length, 1);
  }
  const view = routineHistoryView(phoneA, { month: "2026-11", day: "2026-11-19", today: "2026-11-19", tab: "logged" });
  const doubled = mergeDailyRoutines(
    { ...phoneA, logs: phoneA.logs.concat({ ...phoneA.logs[0], id: "log_extra" }) },
    phoneA,
    Date.parse("2026-11-19T16:00:00Z"),
  );
  const counted = routineHistoryView(doubled, { month: "2026-11", day: "2026-11-19", today: "2026-11-19", tab: "logged" });
  assert.equal(counted.graph.points.find((row) => row.day === "2026-11-19").count, 1);
  assert.equal(view.graph.points.find((row) => row.day === "2026-11-19").count, 1);
});

test("supply days left counts down from the day the count was saved", () => {
  assert.equal(routineDaysLeft(10, [], "item-a", "2026-11-19", "2026-11-19"), 10);
  assert.equal(routineDaysLeft(10, [], "item-a", "2026-11-22", "2026-11-19"), 7);
  const weekly = [
    { id: "a", itemId: "item-a", day: "2026-10-01", status: "done", deletedAt: null },
    { id: "b", itemId: "item-a", day: "2026-10-08", status: "done", deletedAt: null },
    { id: "c", itemId: "item-a", day: "2026-10-15", status: "done", deletedAt: null },
    { id: "d", itemId: "item-a", day: "2026-10-22", status: "done", deletedAt: null },
  ];
  assert.equal(routineDaysLeft(4, weekly, "item-a", "2026-11-05", "2026-10-22"), 14);
});

test("a calculator note disappears when the dose unit changes or the amount is cleared", () => {
  signIn();
  const morning = app.state.dailyRoutines.blocks.find((block) => block.name === "Morning routine");
  assert.equal(saveRoutineItem(app.state, { name: "Example Compound A", kind: "dose", amount: "250", unit: "mcg", blockId: morning.id, blockIds: [morning.id] }), true);
  const item = app.state.dailyRoutines.items.find((row) => row.name === "Example Compound A");
  assert.equal(saveRoutineItemNote(app.state, item.id, "0.1 mL · 10 U-100 units. What you entered. Not a recommendation.", {
    vialAmount: 5, waterMl: 2, doseAmount: 250, vialUnit: "mg", doseUnit: "mcg",
  }), true);
  assert.equal(saveRoutineItem(app.state, { itemId: item.id, name: "Example Compound A", kind: "dose", amount: "100", unit: "IU", blockId: morning.id, blockIds: [morning.id] }), true);
  assert.doesNotMatch(dailyRoutinesHTML(), /10 U-100 units/);
  const compound = app.state.dailyRoutines.compounds.find((row) => row.id === item.compoundId);
  compound.amount = null;
  assert.doesNotMatch(dailyRoutinesHTML(), /10 U-100 units/);
});

function liveDays(store, itemId) {
  return (store.logs || []).filter((row) => row && row.itemId === itemId && !(row.deletedAt > 0)).map((row) => row.day).sort();
}

function liveIds(store, itemId, day) {
  return (store.logs || []).filter((row) => row && row.itemId === itemId && row.day === day && !(row.deletedAt > 0)).map((row) => row.id);
}

test("a push then a pull keeps one fresh log id on both phones", () => {
  function phones(when) {
    signIn();
    app.routineNow = () => new Date("2026-11-19T14:30:00.000Z");
    const morning = app.state.dailyRoutines.blocks.find((block) => block.name === "Morning routine");
    assert.equal(addRoutineItem(app.state, morning.id, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" }), true);
    const item = app.state.dailyRoutines.items.find((row) => row.name === "Example Compound A");
    const bare = structuredClone(app.state.dailyRoutines);
    assert.equal(logRoutineItem(app.state, item.id), true);
    const logged = app.state.dailyRoutines.logs.find((row) => row.itemId === item.id && !(row.deletedAt > 0));
    app.routineNow = () => new Date("2026-11-19T15:00:00.000Z");
    assert.equal(editRoutineLog(app.state, logged.id, { amount: 250, day: "2026-11-18" }), true);
    const phoneA = structuredClone(app.state.dailyRoutines);
    app.state.dailyRoutines = structuredClone(bare);
    app.routineNow = () => new Date(when);
    assert.equal(logRoutineItem(app.state, item.id), true);
    return { item, phoneA, phoneB: structuredClone(app.state.dailyRoutines) };
  }
  const now = Date.parse("2026-11-19T16:00:00.000Z");
  for (const when of ["2026-11-19T14:45:00.000Z", "2026-11-19T15:00:00.000Z"]) {
    const { item, phoneA, phoneB } = phones(when);
    for (const [first, second] of [[phoneA, phoneB], [phoneB, phoneA]]) {
      let server = mergeDailyRoutines(null, first, now);
      server = mergeDailyRoutines(server, second, now);
      const pulled = mergeDailyRoutines(second, server, now);
      server = mergeDailyRoutines(server, pulled, now);
      assert.deepEqual(liveDays(server, item.id), ["2026-11-18", "2026-11-19"], when);
      assert.deepEqual(liveDays(pulled, item.id), ["2026-11-18", "2026-11-19"], when);
      const original = phoneB.logs.find((row) => row.itemId === item.id && row.day === "2026-11-19" && !(row.deletedAt > 0));
      const expected = freshMoveLogId(original.id, original.at);
      assert.deepEqual(liveIds(server, item.id, "2026-11-19"), [expected]);
      assert.deepEqual(liveIds(pulled, item.id, "2026-11-19"), [expected]);
    }
  }
  const again = phones("2026-11-19T16:00:00.000Z");
  const server = mergeDailyRoutines(again.phoneA, again.phoneB, now);
  const pulled = mergeDailyRoutines(again.phoneB, server, now);
  assert.equal(liveIds(pulled, again.item.id, "2026-11-19").length, 1);
  assert.equal(liveIds(pulled, again.item.id, "2026-11-19")[0], again.phoneB.logs.find((row) => row.itemId === again.item.id && !(row.deletedAt > 0)).id);
  const longBase = `log_${"a".repeat(66)}_2026-11-19`;
  const moved = freshMoveLogId(longBase, Date.parse("2026-11-19T14:45:00.000Z"));
  assert.ok(moved.length <= 80);
  assert.ok(moved.startsWith("mv_"));
});

test("the purge window survives the phone's purge record and stops at the rollover hour", async () => {
  globalThis.document = {
    addEventListener() {},
    removeEventListener() {},
    documentElement: { dataset: {}, classList: { add() {}, remove() {} } },
    body: {},
    head: {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: () => ({}),
  };
  await import("../logger/js/pages/privacy.js");
  signIn();
  app.rememberPurge("2026-11-21", "2026-11-21", false);
  const stored = app.state.purges[0];
  const early = routineEarlyWindow("2026-11-21", 4);
  assert.equal(stored.routineEarlyFrom, early.routineEarlyFrom);
  assert.equal(stored.routineEarlyTo, early.routineEarlyTo);
  const joined = unionPurges([stored], [stored]);
  assert.equal(joined[0].routineEarlyFrom, early.routineEarlyFrom);
  const body = app.routinePurgePayload("2026-11-21", "2026-11-21");
  assert.equal(body.routineEarlyFrom, early.routineEarlyFrom);
  assert.equal(body.routineEarlyTo, early.routineEarlyTo);
  const onHour = new Date(2026, 10, 21, 4, 0).getTime();
  const beforeHour = onHour - 60 * 1000;
  const logs = [
    { id: "before", day: "2026-11-20", status: "done", amount: 1, unit: "mg", at: beforeHour, updatedAt: 1, deletedAt: null },
    { id: "edge", day: "2026-11-20", status: "done", amount: 1, unit: "mg", at: onHour, updatedAt: 1, deletedAt: null },
  ];
  const data = { purges: joined, dailyRoutines: { logs: structuredClone(logs) } };
  applyPurges(data, early.routineEarlyTo + 1000);
  assert.ok(data.dailyRoutines.logs.find((row) => row.id === "before").deletedAt > 0);
  assert.equal(data.dailyRoutines.logs.find((row) => row.id === "edge").deletedAt, null);
  const stripped = stripRange({ dailyRoutines: { logs: structuredClone(logs) } }, "2026-11-21", "2026-11-21", early.routineEarlyTo, early.routineEarlyTo + 1000, body.routineEarlyFrom, body.routineEarlyTo);
  assert.ok(stripped.dailyRoutines.logs.find((row) => row.id === "before").deletedAt > 0);
  assert.equal(stripped.dailyRoutines.logs.find((row) => row.id === "edge").deletedAt, null);
});

test("an old purge keeps the previous afternoon and a new purge drops the early dose", () => {
  const early = routineEarlyWindow("2026-11-21", 4);
  const logs = [
    { id: "evening", day: "2026-11-20", status: "done", amount: 1, unit: "mg", at: new Date(2026, 10, 20, 15, 0).getTime(), updatedAt: 10, deletedAt: null },
    { id: "dawn", day: "2026-11-20", status: "done", amount: 1, unit: "mg", at: new Date(2026, 10, 21, 1, 30).getTime(), updatedAt: 11, deletedAt: null },
    { id: "day", day: "2026-11-21", status: "done", amount: 1, unit: "mg", at: new Date(2026, 10, 21, 12, 0).getTime(), updatedAt: 12, deletedAt: null },
  ];
  const oldData = { dailyRoutines: { logs: structuredClone(logs) } };
  purgeDailyRoutineRange(oldData, "2026-11-21", "2026-11-21", 1000, 5000);
  assert.equal(oldData.dailyRoutines.logs.find((row) => row.id === "evening").deletedAt, null);
  assert.equal(oldData.dailyRoutines.logs.find((row) => row.id === "dawn").deletedAt, null);
  assert.ok(oldData.dailyRoutines.logs.find((row) => row.id === "day").deletedAt > 0);
  const fresh = { dailyRoutines: { logs: structuredClone(logs) } };
  purgeDailyRoutineRange(fresh, "2026-11-21", "2026-11-21", 1000, 5000, early);
  assert.equal(fresh.dailyRoutines.logs.find((row) => row.id === "evening").deletedAt, null);
  assert.ok(fresh.dailyRoutines.logs.find((row) => row.id === "dawn").deletedAt > 0);
  const stripped = stripRange({ dailyRoutines: { logs: structuredClone(logs) } }, "2026-11-21", "2026-11-21", 1000, 5000, early.routineEarlyFrom, early.routineEarlyTo);
  assert.equal(stripped.dailyRoutines.logs.find((row) => row.id === "evening").deletedAt, null);
  assert.ok(stripped.dailyRoutines.logs.find((row) => row.id === "dawn").deletedAt > 0);
});
