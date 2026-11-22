import assert from "node:assert/strict";
import test from "node:test";
import { app } from "../logger/js/runtime.js";
import {
  dailyRoutinesHTML,
  logAllRoutineBlock,
  logRoutineItem,
  parseRoutineAmount,
  saveRoutineItem,
  saveRoutineItemNote,
} from "../logger/js/pages/daily-routines.js";
import { reconstitutionNoteText, reconstitutionResult } from "../logger/js/pages/reconstitution.js";
import { mergeDailyRoutines, purgeDailyRoutineRange, routineEarlyWindow } from "../logger/js/shared/daily-routines-store.js";
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
