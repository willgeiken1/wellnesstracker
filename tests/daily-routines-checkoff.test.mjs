import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/* Synthetic routines only. The flag stays false in source.
   The clock face is app.routineNow(). The routine day follows that local
   clock and the rollover hour. Boundary and time-zone cases live in
   daily-routines-rollover.test.mjs. Do not read the day from toISOString(). */

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
  logRoutineItem,
  logRoutineRest,
  loggedTodayCount,
  restoreRoutineLog,
  routineStreak,
  shiftRoutineDay,
  skipRoutineItem,
  toggleRoutineFocus,
  toggleRoutineReveal,
  undoRoutineLog,
} = await import("../logger/js/pages/daily-routines.js");
const { isLive, mergeDailyRoutines, putDailyRoutines, upsertEntity } = await import("../logger/js/shared/daily-routines-store.js");

function pin(day, utcIso) {
  app.today = () => day;
  app.routineNow = () => (utcIso ? new Date(utcIso) : new Date(`${day}T08:30:00`));
}

function signIn(day = "2026-11-19") {
  app.ROUTINES_ENABLED = true;
  app.session = { user: { id: "synthetic-user" } };
  app.sb = null;
  app.cloudPullOk = true;
  app.state = { dailyRoutines: null };
  app.save = () => {};
  pin(day);
  dailyRoutinesHTML();
}

function blockId(name) {
  const block = app.state.dailyRoutines.blocks.find((row) => row.name === name);
  assert.ok(block, name);
  return block.id;
}

function addDose(block) {
  return addRoutineItem(app.state, block, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" });
}

function logRow(day, status, extra = {}) {
  return {
    id: extra.id || `log-${day}-${status}`,
    itemId: extra.itemId == null ? "item-a" : extra.itemId,
    day,
    status,
    amount: Object.prototype.hasOwnProperty.call(extra, "amount") ? extra.amount : null,
    unit: extra.unit || "",
    updatedAt: extra.updatedAt || 10,
    deletedAt: extra.deletedAt == null ? null : extra.deletedAt,
    rest: extra.rest === true,
  };
}

describe("routine check-off", { concurrency: false }, () => {
  test("shiftRoutineDay steps the calendar fields across month and year boundaries", () => {
    assert.equal(shiftRoutineDay("2026-11-01", -1), "2026-10-31");
    assert.equal(shiftRoutineDay("2026-01-01", -1), "2025-12-31");
    assert.equal(shiftRoutineDay("2026-03-08", 1), "2026-03-09");
    assert.equal(shiftRoutineDay("2026-11-19", 0), "2026-11-19");
  });

  test("dose counter counts logs and does not sum amounts", () => {
    const logs = [
      logRow("2026-11-19", "done", { id: "a", amount: 250 }),
      logRow("2026-11-19", "done", { id: "b", amount: 250 }),
      logRow("2026-11-19", "partial", { id: "c", amount: 0.25 }),
      logRow("2026-11-19", "skipped", { id: "d", amount: 999 }),
      logRow("2026-11-19", "done", { id: "e", amount: 50, rest: true, itemId: null }),
      logRow("2026-11-19", "done", { id: "f", amount: 250, deletedAt: 30 }),
      logRow("2026-11-18", "done", { id: "g", amount: 250 }),
    ];
    assert.equal(loggedTodayCount(logs, "2026-11-19"), 3);
    assert.notEqual(loggedTodayCount(logs, "2026-11-19"), 250 + 250 + 0.25);
    assert.equal(loggedTodayCount(logs, "2026-11-18"), 1);
  });

  test("a skip does not reset the streak", () => {
    const logs = [
      logRow("2026-11-17", "done", { id: "d17" }),
      logRow("2026-11-18", "skipped", { id: "d18", amount: 250 }),
      logRow("2026-11-19", "done", { id: "d19" }),
    ];
    assert.equal(routineStreak(logs, "2026-11-19"), 3);
  });

  test("a full miss resets the streak", () => {
    const logs = [
      logRow("2026-11-17", "done", { id: "d17" }),
      logRow("2026-11-19", "done", { id: "d19" }),
    ];
    assert.equal(routineStreak(logs, "2026-11-19"), 1);
    const kept = [
      logRow("2026-11-17", "done", { id: "d17" }),
      logRow("2026-11-18", "done", { id: "d18" }),
      logRow("2026-11-19", "done", { id: "d19" }),
    ];
    assert.equal(routineStreak(kept, "2026-11-19"), 3);
  });

  test("an open today does not wipe a streak that ran through yesterday", () => {
    const logs = [
      logRow("2026-11-17", "done", { id: "d17" }),
      logRow("2026-11-18", "partial", { id: "d18", amount: 0.25 }),
    ];
    assert.equal(routineStreak(logs, "2026-11-19"), 2);
  });

  test("a rest log keeps the streak and is not a dose", () => {
    const logs = [
      logRow("2026-11-18", "done", { id: "d18" }),
      logRow("2026-11-19", "done", { id: "rest", itemId: null, rest: true, amount: 80 }),
    ];
    assert.equal(routineStreak(logs, "2026-11-19"), 2);
    assert.equal(loggedTodayCount(logs, "2026-11-19"), 0);
  });

  test("a late local evening stays on that local day", () => {
    signIn("2026-11-19");
    const morning = blockId("Morning routine");
    assert.equal(addDose(morning), true);
    app.routineNow = () => new Date(2026, 10, 19, 23, 30);
    assert.equal(logRoutineItem(app.state, app.state.dailyRoutines.items[0].id), true);
    const log = app.state.dailyRoutines.logs.find((row) => row.itemId === app.state.dailyRoutines.items[0].id);
    assert.equal(log.day, "2026-11-19");
    assert.equal(log.amount, 250);
    assert.equal(typeof log.amount, "number");
    assert.equal(loggedTodayCount(app.state.dailyRoutines.logs, "2026-11-19"), 1);
    assert.equal(loggedTodayCount(app.state.dailyRoutines.logs, "2026-11-20"), 0);
    const html = dailyRoutinesHTML();
    assert.match(html, /data-logged="1"/);
    assert.match(html, /<b>1<\/b> logged today/);
    assert.doesNotMatch(html, /<b>250<\/b>/);
    assert.match(html, /data-streak="1"/);

    app.today = () => "2026-11-20";
    app.routineNow = () => new Date(2026, 10, 20, 12, 0);
    const nextDay = dailyRoutinesHTML();
    assert.match(nextDay, /data-logged="0"/);
    assert.match(nextDay, /data-streak="1"/);
    assert.equal(routineStreak(app.state.dailyRoutines.logs, "2026-11-20"), 1);

    app.today = () => "2026-11-21";
    app.routineNow = () => new Date(2026, 10, 21, 12, 0);
    const missed = dailyRoutinesHTML();
    assert.match(missed, /data-logged="0"/);
    assert.match(missed, /data-streak="0"/);
    assert.equal(routineStreak(app.state.dailyRoutines.logs, "2026-11-21"), 0);
    assert.doesNotMatch(missed, /yesterday|missed|overdue/i);
  });

  test("tap to log collapses the row, reveal shows undo, and undo drops the dose", () => {
    signIn("2026-11-19");
    const morning = blockId("Morning routine");
    assert.equal(addDose(morning), true);
    const item = app.state.dailyRoutines.items[0];
    let html = dailyRoutinesHTML();
    assert.match(html, /Example Compound A<\/span><span class="dr-dose"> · 250 mcg<\/span>/);
    assert.match(html, /data-action="routines-log"/);
    assert.match(html, /<span class="dr-vh">Log <\/span>/);
    assert.doesNotMatch(html, /data-action="routines-undo"/);

    const older = structuredClone(app.state.dailyRoutines);
    assert.equal(logRoutineItem(app.state, item.id), true);
    assert.equal(logRoutineItem(app.state, item.id), false);
    const live = app.state.dailyRoutines.logs.find((row) => row.itemId === item.id);
    assert.equal(isLive(live), true);
    assert.equal(live.status, "done");
    assert.equal(live.deletedAt, null);
    html = dailyRoutinesHTML();
    assert.match(html, /data-logged="1"/);
    assert.match(html, /data-streak="1"/);
    assert.match(html, /dr-streak-mark/);
    assert.match(html, /All done/);
    assert.match(html, /Show 1 completed/);
    assert.doesNotMatch(html, /data-action="routines-log"/);
    assert.doesNotMatch(html, /data-action="routines-undo"/);
    assert.doesNotMatch(html, /yesterday|missed|overdue/i);

    assert.equal(toggleRoutineReveal(app.state, morning), true);
    html = dailyRoutinesHTML();
    assert.match(html, /aria-expanded="true"/);
    assert.match(html, /data-state="done"/);
    assert.match(html, new RegExp(`data-action="routines-undo" data-log-id="${live.id}"`));
    assert.match(html, /Logged/);

    assert.equal(undoRoutineLog(app.state, live.id), true);
    const undone = app.state.dailyRoutines.logs.find((row) => row.id === live.id);
    assert.equal(isLive(undone), false);
    assert.ok(undone.deletedAt > live.updatedAt);
    assert.equal(loggedTodayCount(app.state.dailyRoutines.logs, "2026-11-19"), 0);
    const merged = mergeDailyRoutines(app.state.dailyRoutines, older);
    const kept = merged.logs.find((row) => row.id === live.id);
    assert.equal(isLive(kept), false);
    html = dailyRoutinesHTML();
    assert.match(html, /data-action="routines-log"/);
    assert.match(html, /data-logged="0"/);
    assert.match(html, /data-streak="0"/);
    assert.doesNotMatch(html, /data-state="done"/);

    assert.equal(restoreRoutineLog(app.state, live.id), true);
    const revived = app.state.dailyRoutines.logs.find((row) => row.id === live.id);
    assert.equal(isLive(revived), true);
    assert.equal(revived.deletedAt, null);
    assert.ok(revived.updatedAt > undone.deletedAt);
    const brought = mergeDailyRoutines(app.state.dailyRoutines, { ...app.state.dailyRoutines, logs: [undone] });
    assert.equal(isLive(brought.logs.find((row) => row.id === live.id)), true);
    assert.equal(loggedTodayCount(app.state.dailyRoutines.logs, "2026-11-19"), 1);
  });

  test("a skip collapses the row, does not count, and does not reset the streak", () => {
    signIn("2026-11-19");
    const morning = blockId("Morning routine");
    addDose(morning);
    const item = app.state.dailyRoutines.items[0];
    app.state.dailyRoutines.logs.push(
      logRow("2026-11-17", "done", { id: "past-17", itemId: item.id, updatedAt: 1 }),
      logRow("2026-11-18", "done", { id: "past-18", itemId: item.id, updatedAt: 2 }),
    );
    assert.equal(skipRoutineItem(app.state, item.id), true);
    const skip = app.state.dailyRoutines.logs.find((row) => row.status === "skipped");
    assert.equal(skip.amount, null);
    assert.equal(loggedTodayCount(app.state.dailyRoutines.logs, "2026-11-19"), 0);
    assert.equal(routineStreak(app.state.dailyRoutines.logs, "2026-11-19"), 3);
    toggleRoutineReveal(app.state, morning);
    const html = dailyRoutinesHTML();
    assert.match(html, /data-state="skipped"/);
    assert.match(html, /Skipped/);
    assert.match(html, /data-streak="3"/);
    assert.match(html, /data-logged="0"/);
    assert.doesNotMatch(html, /<b>250<\/b>/);
  });

  test("a quarter amount stays a number and still counts as one dose", () => {
    signIn("2026-11-19");
    const morning = blockId("Morning routine");
    const at = 40;
    let next = upsertEntity(app.state.dailyRoutines, "compounds", {
      id: "compound-q", name: "Example Compound Q", amount: 0.25, unit: "mcg", startDate: "2026-11-19", deletedAt: null,
    }, at);
    next = upsertEntity(next, "items", {
      id: "item-q", name: "Example Compound Q", kind: "dose", compoundId: "compound-q", deletedAt: null,
    }, at);
    next = upsertEntity(next, "placements", {
      id: "place-q", blockId: morning, itemId: "item-q", order: 0, deletedAt: null,
    }, at);
    assert.equal(putDailyRoutines(app.state, next), true);
    assert.equal(logRoutineItem(app.state, "item-q"), true);
    const log = app.state.dailyRoutines.logs.find((row) => row.itemId === "item-q");
    assert.equal(log.amount, 0.25);
    assert.equal(typeof log.amount, "number");
    assert.equal(loggedTodayCount(app.state.dailyRoutines.logs, "2026-11-19"), 1);
    toggleRoutineReveal(app.state, morning);
    const html = dailyRoutinesHTML();
    assert.match(html, /0\.25 mcg/);
    assert.match(html, /data-logged="1"/);
    assert.doesNotMatch(html, /<b>0\.25<\/b>/);
  });

  test("one log collapses the item in every block that shows it", () => {
    signIn("2026-11-19");
    const morning = blockId("Morning routine");
    const night = blockId("Night routine");
    addDose(morning);
    const item = app.state.dailyRoutines.items[0];
    const next = upsertEntity(app.state.dailyRoutines, "placements", {
      id: "place-night", blockId: night, itemId: item.id, order: 0, deletedAt: null,
    }, 60);
    assert.equal(putDailyRoutines(app.state, next), true);
    assert.equal(logRoutineItem(app.state, item.id), true);
    const html = dailyRoutinesHTML();
    assert.equal(html.match(/Show 1 completed/g).length, 2);
    assert.doesNotMatch(html, /data-action="routines-log"/);
  });

  test("focus mode dims every block except the current one", () => {
    signIn("2026-11-19");
    app.routineNow = () => new Date(2026, 10, 19, 14, 30);
    let html = dailyRoutinesHTML();
    assert.match(html, /data-focus="off"/);
    assert.match(html, /aria-checked="false"/);
    assert.match(html, /Now · Afternoon/);
    assert.doesNotMatch(html, /dr-dim/);
    assert.equal(toggleRoutineFocus(app.state), true);
    assert.equal(app.state.dailyRoutines.prefs.focusMode, true);
    html = dailyRoutinesHTML();
    assert.match(html, /data-focus="on"/);
    assert.match(html, /aria-checked="true"/);
    assert.match(html, /data-block-id="[^"]+" data-current="true"/);
    assert.match(html, /class="dr-tile dr-dim"/);
    const current = html.match(/class="dr-tile" data-color="[^"]+" data-block-id="[^"]+" data-current="true"/);
    assert.ok(current);
    assert.match(current[0], /lavender|citrus|pink/);
    const afternoon = app.state.dailyRoutines.blocks.find((row) => row.name === "Supplement & enhancer stack");
    assert.match(html, new RegExp(`data-block-id="${afternoon.id}" data-current="true"`));
    assert.doesNotMatch(html, new RegExp(`data-block-id="${afternoon.id}"[^>]*dr-dim|dr-dim[^>]*data-block-id="${afternoon.id}"`));
  });

  test("logging a rest is allowed and stays quiet", () => {
    signIn("2026-11-19");
    const morning = blockId("Morning routine");
    addDose(morning);
    let html = dailyRoutinesHTML();
    assert.match(html, /data-action="routines-rest"/);
    assert.match(html, />Log rest</);
    assert.equal(logRoutineRest(app.state), true);
    assert.equal(logRoutineRest(app.state), false);
    const rest = app.state.dailyRoutines.logs.find((row) => row.rest === true);
    assert.equal(rest.status, "done");
    assert.equal(rest.amount, null);
    assert.equal(loggedTodayCount(app.state.dailyRoutines.logs, "2026-11-19"), 0);
    html = dailyRoutinesHTML();
    assert.match(html, /Rest logged/);
    assert.match(html, new RegExp(`data-log-id="${rest.id}"`));
    assert.match(html, /data-action="routines-log"/);
    assert.doesNotMatch(html, /enjoy|nice rest|rest day/i);
    assert.equal(undoRoutineLog(app.state, rest.id), true);
    assert.equal(isLive(app.state.dailyRoutines.logs.find((row) => row.id === rest.id)), false);
    assert.match(dailyRoutinesHTML(), /data-action="routines-rest"/);
  });

  test("writes refuse a signed-out session, a flag-off session, and a pull in flight", () => {
    signIn("2026-11-19");
    const morning = blockId("Morning routine");
    const seeded = structuredClone(app.state.dailyRoutines);
    app.session = null;
    assert.equal(addDose(morning), false);
    assert.equal(logRoutineItem(app.state, "item-x"), false);
    assert.equal(logRoutineRest(app.state), false);
    assert.deepEqual(app.state.dailyRoutines, seeded);
    app.session = { user: { id: "synthetic-user" } };
    app.ROUTINES_ENABLED = false;
    assert.equal(addDose(morning), false);
    assert.equal(dailyRoutinesHTML(), "");
    app.ROUTINES_ENABLED = true;
    app.sb = { from() {} };
    app.cloudPullOk = false;
    assert.equal(addDose(morning), false);
    assert.equal(toggleRoutineFocus(app.state), false);
    assert.equal(app.state.dailyRoutines.blocks.length, 3);
    assert.equal(app.state.dailyRoutines.items.length, 0);
  });

  test("adding a real item leaves the add button and does not invent a stack", () => {
    signIn("2026-11-19");
    const morning = blockId("Morning routine");
    assert.equal(addDose(morning), true);
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound B", kind: "check" }), true);
    const names = app.state.dailyRoutines.items.map((row) => row.name);
    assert.deepEqual(names, ["Example Compound A", "Example Compound B"]);
    assert.equal(app.state.dailyRoutines.items[0].kind, "dose");
    assert.equal(app.state.dailyRoutines.items[1].kind, "check");
    const html = dailyRoutinesHTML();
    assert.match(html, /Example Compound B/);
    assert.match(html, /data-action="routines-add-item"/);
    assert.doesNotMatch(html, /Add the first item/);
    assert.doesNotMatch(readFileSync(new URL("../logger/js/pages/daily-routines.js", import.meta.url), "utf8"), /addExampleRoutineItem/);
    assert.doesNotMatch(readFileSync(new URL("../logger/js/shell/actions.js", import.meta.url), "utf8"), /addExampleRoutineItem/);
  });

  test("the shell wires the actions and keeps motion off unless the user allows it", () => {
    const actions = readFileSync(new URL("../logger/js/shell/actions.js", import.meta.url), "utf8");
    const page = readFileSync(new URL("../logger/js/pages/daily-routines.js", import.meta.url), "utf8");
    const css = readFileSync(new URL("../logger/css/routines.css", import.meta.url), "utf8");
    const flag = readFileSync(new URL("../logger/js/shared/routines-flag.js", import.meta.url), "utf8");
    for (const name of ["routines-log", "routines-skip", "routines-undo", "routines-reveal", "routines-focus", "routines-add-item", "routines-collapse", "routines-rest"]) {
      assert.match(actions, new RegExp(`case "${name}"`));
    }
    assert.doesNotMatch(page, /routines-flag/);
    assert.match(flag, /ROUTINES_ENABLED = false/);
    assert.match(css, /@media \(prefers-reduced-motion: no-preference\)/);
    assert.match(css, /@starting-style/);
    assert.match(css, /\.dr-row \{ display: flex; align-items: center; gap: 8px; opacity: 1; \}/);
    assert.match(css, /\.dr-tiles\[data-focus="on"\] \.dr-tile\.dr-dim \{ opacity: \.38; \}/);
  });
});
