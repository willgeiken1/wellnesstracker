import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/* Synthetic routines only. Names are Example Compound A, Example Compound B,
   and Example Check. History places a log on the day string it keeps.
   The graph counts logs and does not add amounts. */

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
const { addRoutineItem, dailyRoutinesHTML, deleteRoutineItem, editRoutineLog, logRoutineItem, renameRoutineItem } = await import("../logger/js/pages/daily-routines.js");
const {
  openRoutineDayHistory,
  rememberRoutineGraphTab,
  routineDayHistorySheetHTML,
  setRoutineHistoryCursor,
} = await import("../logger/js/pages/daily-routines-history.js");
const { normalizeDailyRoutines, putDailyRoutines, upsertEntity } = await import("../logger/js/shared/daily-routines-store.js");
const { routineHistoryView, routineMarkIcon } = await import("../logger/js/shared/routine-history.js");

function pin(day) {
  app.today = () => day;
  const [year, month, date] = day.split("-").map(Number);
  app.routineNow = () => new Date(year, month - 1, date, 12, 0, 0);
}

function signIn(day = "2026-11-19") {
  app.ROUTINES_ENABLED = true;
  app.session = { user: { id: "synthetic-user" } };
  app.sb = null;
  app.cloudPullOk = true;
  app.state = { dailyRoutines: null };
  app.ui = { sheet: null, sd: {}, dailyRoutineEdit: false };
  app.save = () => {};
  app.render = () => {};
  app.renderSheet = () => {};
  pin(day);
  dailyRoutinesHTML();
}

function blockId(name) {
  const block = app.state.dailyRoutines.blocks.find((row) => row.name === name);
  assert.ok(block, name);
  return block.id;
}

function addDose(name, amount, unit) {
  assert.equal(addRoutineItem(app.state, blockId("Morning routine"), { name, kind: "dose", amount, unit }), true);
  const item = app.state.dailyRoutines.items.find((row) => row.name === name);
  assert.ok(item);
  return item;
}

function setStart(name, day) {
  const store = structuredClone(app.state.dailyRoutines);
  const compound = store.compounds.find((row) => row.name === name);
  assert.ok(compound);
  compound.startDate = day;
  compound.updatedAt = (compound.updatedAt || 0) + 1;
  assert.equal(putDailyRoutines(app.state, store), true);
}

function putLog(log) {
  const next = upsertEntity(app.state.dailyRoutines, "logs", { deletedAt: null, amount: null, unit: "", ...log }, Date.now());
  assert.equal(putDailyRoutines(app.state, next), true);
}

function graphSlice(html) {
  const start = html.indexOf("data-history-graph");
  const end = html.indexOf("data-history-calendar");
  assert.ok(start >= 0 && end > start);
  return html.slice(start, end);
}

describe("routine history, calendar, and graph", { concurrency: false }, () => {
  test("a backdated log shows on the chosen day", () => {
    signIn("2026-11-19");
    const item = addDose("Example Compound A", 250, "mcg");
    assert.equal(logRoutineItem(app.state, item.id), true);
    const log = app.state.dailyRoutines.logs.find((row) => row.itemId === item.id && !(row.deletedAt > 0));
    pin("2026-11-19");
    assert.equal(editRoutineLog(app.state, log.id, { amount: "0.25", day: "2026-11-15" }), true);
    const moved = app.state.dailyRoutines.logs.find((row) => row.itemId === item.id && !(row.deletedAt > 0));
    assert.equal(moved.day, "2026-11-15");
    assert.notEqual(moved.id, log.id);
    assert.equal(openRoutineDayHistory(), true);
    assert.equal(setRoutineHistoryCursor({ day: "2026-11-15" }), true);
    const html = routineDayHistorySheetHTML();
    assert.match(html, /data-day="2026-11-15"[^>]*data-marks="partial"/);
    assert.match(html, new RegExp(`data-item-id="${item.id}" data-mark="partial"`));
    assert.match(html, /0\.25 mcg/);
    assert.match(html, /data-day="2026-11-19"[^>]*data-marks=""/);
    assert.doesNotMatch(html, new RegExp(`data-day="2026-11-19"[\\s\\S]{0,80}data-item-id="${item.id}" data-mark="logged"`));
  });

  test("missed is an empty ring, skipped is a dash, and rest is a moon", () => {
    assert.deepEqual(routineMarkIcon("missed"), { mark: "missed", label: "Missed", icon: "ring" });
    assert.deepEqual(routineMarkIcon("skipped"), { mark: "skipped", label: "Skipped", icon: "dash" });
    assert.deepEqual(routineMarkIcon("rest"), { mark: "rest", label: "Rest", icon: "moon" });

    signIn("2026-11-19");
    const item = addDose("Example Compound A", 250, "mcg");
    setStart("Example Compound A", "2026-11-17");
    putLog({ id: "skip-1", itemId: item.id, compoundId: item.compoundId, day: "2026-11-18", status: "skipped" });
    putLog({ id: "rest-1", itemId: null, compoundId: null, day: "2026-11-16", status: "done", rest: true });
    assert.equal(openRoutineDayHistory(), true);
    const html = routineDayHistorySheetHTML();
    assert.match(html, /data-day="2026-11-17"[^>]*data-marks="missed"/);
    assert.match(html, /data-mark="missed"><i class="dr-h-ring"/);
    assert.match(html, /data-day="2026-11-18"[^>]*data-marks="skipped"/);
    assert.match(html, /data-mark="skipped"><span aria-hidden="true">–<\/span>/);
    assert.match(html, /data-day="2026-11-16"[^>]*data-marks="rest"/);
    assert.match(html, /data-mark="rest"><span aria-hidden="true">☾<\/span>/);
    assert.match(html, /data-day="2026-11-15"[^>]*data-marks=""/);

    const rested = routineHistoryView({
      blocks: [{ id: "b", name: "Morning routine", order: 0 }],
      items: [{ id: "i", name: "Example Check", kind: "check" }],
      placements: [{ id: "p", blockId: "b", itemId: "i", order: 0 }],
      compounds: [],
      logs: [{ id: "r", day: "2026-11-18", status: "rest", itemId: null }],
      prefs: {},
    }, { month: "2026-11", day: "2026-11-18", today: "2026-11-19", tab: "logged" });
    const day = rested.days.find((row) => row.day === "2026-11-18");
    assert.equal(day.rest, true);
    assert.deepEqual(day.marks, ["rest"]);
    assert.equal(day.items.some((row) => row.mark === "missed"), false);
    assert.equal(rested.graph.points.find((point) => point.day === "2026-11-18").count, 0);

    signIn("2026-11-19");
    addDose("Example Compound A", 250, "mcg");
    setStart("Example Compound A", "2026-11-18");
    const quiet = routineDayHistorySheetHTML();
    assert.doesNotMatch(quiet, /data-mark="rest"|☾/);
  });

  test("the graph counts logs and does not add compound amounts", () => {
    signIn("2026-11-19");
    const first = addDose("Example Compound A", 250, "mcg");
    const second = addDose("Example Compound B", 500, "mg");
    assert.equal(logRoutineItem(app.state, first.id), true);
    assert.equal(logRoutineItem(app.state, second.id), true);
    const logs = app.state.dailyRoutines.logs.filter((row) => !(row.deletedAt > 0));
    for (const log of logs) {
      assert.equal(editRoutineLog(app.state, log.id, { amount: String(log.amount), day: "2026-11-15" }), true);
    }
    putLog({ id: "rest-2", itemId: null, compoundId: null, day: "2026-11-15", status: "done", rest: true });
    assert.equal(openRoutineDayHistory(), true);
    assert.equal(setRoutineHistoryCursor({ day: "2026-11-15" }), true);
    const html = routineDayHistorySheetHTML();
    const graph = graphSlice(html);
    assert.match(graph, /data-graph-unit="count"/);
    assert.match(graph, /data-day="2026-11-15" data-count="2"/);
    assert.match(graph, /does not add amounts/);
    for (const needle of ["250", "500", "750", "mcg", "mg", "combined"]) {
      assert.equal(graph.includes(needle), false, needle);
    }
    const view = app.routineHistoryView(app.state.dailyRoutines, {
      month: "2026-11",
      day: "2026-11-15",
      today: "2026-11-19",
      tab: "logged",
    });
    const point = view.graph.points.find((row) => row.day === "2026-11-15");
    assert.equal(point.count, 2);
    assert.deepEqual(Object.keys(point).sort(), ["count", "day"]);
    assert.equal(JSON.stringify(view.graph).includes("amount"), false);
    const skipped = app.routineHistoryView(app.state.dailyRoutines, {
      month: "2026-11",
      day: "2026-11-15",
      today: "2026-11-19",
      tab: "skipped",
    });
    assert.equal(skipped.graph.points.find((row) => row.day === "2026-11-15").count, 0);
    assert.match(html, /250 mcg/);
    assert.match(html, /500 mg/);
  });

  test("the last graph tab is remembered", () => {
    signIn("2026-11-19");
    addDose("Example Compound A", 250, "mcg");
    const before = structuredClone(app.state.dailyRoutines.logs);
    assert.equal(rememberRoutineGraphTab(app.state, "amounts"), false);
    assert.equal(rememberRoutineGraphTab(app.state, "total"), false);
    assert.equal(rememberRoutineGraphTab(app.state, "skipped"), true);
    assert.equal(app.state.dailyRoutines.prefs.historyGraph, "skipped");
    assert.equal(rememberRoutineGraphTab(app.state, "skipped"), false);
    const reloaded = normalizeDailyRoutines(JSON.parse(JSON.stringify(app.state.dailyRoutines)));
    assert.equal(reloaded.prefs.historyGraph, "skipped");
    assert.deepEqual(reloaded.logs.map((row) => row.id), before.map((row) => row.id));
    app.ui.sd = { month: "2026-11", day: "2026-11-19" };
    const html = routineDayHistorySheetHTML();
    assert.match(html, /data-tab="skipped" aria-selected="true"/);
    assert.match(html, /data-graph-tab="skipped"/);
    assert.match(html, /data-tab="logged" aria-selected="false"/);
    assert.equal(rememberRoutineGraphTab(app.state, "logged"), true);
    assert.equal(routineDayHistorySheetHTML().includes('data-tab="logged" aria-selected="true"'), true);
  });

  test("history keeps the calendar and leaves out the cut views", () => {
    signIn("2026-11-19");
    addDose("Example Compound A", 250, "mcg");
    assert.equal(openRoutineDayHistory(), true);
    assert.equal(setRoutineHistoryCursor({ monthDelta: 1 }), true);
    assert.equal(app.ui.sd.month, "2026-11");
    assert.equal(setRoutineHistoryCursor({ monthDelta: -1 }), true);
    assert.equal(app.ui.sd.month, "2026-10");
    assert.equal(app.ui.sd.day, "2026-10-31");
    const html = routineDayHistorySheetHTML();
    assert.match(html, /October 2026/);
    assert.match(html, /Calendar, October 2026/);
    assert.match(html, /data-history-days/);
    assert.doesNotMatch(html, /week-strip|week strip|adherence|constellation|rising tide|orbit dial|>Past</i);
    const sources = [
      "../logger/js/shared/routine-history.js",
      "../logger/js/pages/daily-routines-history.js",
    ];
    for (const file of sources) {
      const src = readFileSync(new URL(file, import.meta.url), "utf8");
      assert.doesNotMatch(src, /week-strip|weekStrip|adherence|constellation|rising tide|orbit dial/);
      assert.doesNotMatch(src, /routines-flag/);
    }
  });

  test("a removed item's log stays on its day", () => {
    signIn("2026-11-19");
    const item = addDose("Example Compound A", 250, "mcg");
    assert.equal(logRoutineItem(app.state, item.id), true);
    const log = app.state.dailyRoutines.logs.find((row) => row.itemId === item.id && !(row.deletedAt > 0));
    assert.equal(editRoutineLog(app.state, log.id, { amount: "250", day: "2026-11-15" }), true);
    assert.equal(deleteRoutineItem(app.state, item.id), true);
    assert.equal(openRoutineDayHistory(), true);
    assert.equal(setRoutineHistoryCursor({ day: "2026-11-15" }), true);
    const html = routineDayHistorySheetHTML();
    const view = routineHistoryView(app.state.dailyRoutines, {
      month: "2026-11",
      day: "2026-11-15",
      today: "2026-11-19",
      tab: "logged",
    });
    const day = view.days.find((row) => row.day === "2026-11-15");
    assert.equal(day.items.some((row) => row.itemId === item.id && row.name === "Example Compound A" && row.mark === "logged"), true);
    assert.equal(view.graph.points.find((row) => row.day === "2026-11-15").count, 1);
    assert.match(html, /Example Compound A/);
    assert.match(html, /250 mcg/);
    assert.match(html, /data-day="2026-11-15" data-count="1"/);
    assert.doesNotMatch(html, /Nothing logged this day/);
  });

  test("a new check keeps the day it was added", () => {
    signIn("2026-11-16");
    assert.equal(addRoutineItem(app.state, blockId("Morning routine"), { name: "Example Check", kind: "check" }), true);
    const item = app.state.dailyRoutines.items.find((row) => row.name === "Example Check");
    assert.equal(item.startDate, "2026-11-16");
    assert.equal(renameRoutineItem(app.state, item.id, "Example Check"), true);
    assert.equal(app.state.dailyRoutines.items.find((row) => row.id === item.id).startDate, "2026-11-16");
    pin("2026-11-18");
    assert.equal(openRoutineDayHistory(), true);
    const html = routineDayHistorySheetHTML();
    assert.match(html, /data-day="2026-11-16"[^>]*data-marks="missed"/);
    assert.match(html, /data-day="2026-11-17"[^>]*data-marks="missed"/);
    assert.match(html, /data-mark="missed"><i class="dr-h-ring"/);
    assert.match(html, /data-day="2026-11-18"[^>]*data-marks=""/);
    assert.equal(app.state.dailyRoutines.logs.filter((row) => row.itemId === item.id && !(row.deletedAt > 0)).length, 0);
  });

  test("history stays behind the flag, and the shell cache is unchanged", () => {
    signIn("2026-11-19");
    assert.match(dailyRoutinesHTML(), /data-action="routines-history-open"/);
    app.session = null;
    assert.equal(openRoutineDayHistory(), false);
    assert.equal(rememberRoutineGraphTab(app.state, "skipped"), false);
    assert.doesNotMatch(dailyRoutinesHTML(), /routines-history-open/);
    app.session = { user: { id: "synthetic-user" } };
    app.ROUTINES_ENABLED = false;
    assert.equal(dailyRoutinesHTML(), "");
    assert.equal(openRoutineDayHistory(), false);
    app.ROUTINES_ENABLED = true;
    app.sb = { from() {} };
    app.cloudPullOk = false;
    assert.equal(openRoutineDayHistory(), true);
    assert.equal(rememberRoutineGraphTab(app.state, "logged"), false);
    assert.equal(app.state.dailyRoutines.prefs.historyGraph, undefined);

    const sw = readFileSync(new URL("../logger/sw.js", import.meta.url), "utf8");
    const sentry = readFileSync(new URL("../logger/js/sentry.js", import.meta.url), "utf8");
    const main = readFileSync(new URL("../logger/js/main.js", import.meta.url), "utf8");
    assert.match(sw, /const CACHE = "insight-shell-v91"/);
    assert.match(sentry, /insight-shell-v91/);
    assert.match(sw, /js\/pages\/daily-routines-history\.js/);
    assert.match(sw, /js\/shared\/routine-history\.js/);
    assert.match(main, /import "\.\/pages\/daily-routines-history\.js";/);
    assert.equal(main.match(/routines-flag/g).length, 1);
  });
});
