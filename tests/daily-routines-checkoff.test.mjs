import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/* Synthetic routines only. The flag stays false in source.
   The day key is app.today(). The clock face is app.routineNow().
   A UTC instant on the next calendar day must not move the local day. */

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
  addExampleRoutineItem,
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
const { isLive, mergeDailyRoutines, putDailyRoutines, routineLogId, upsertEntity } = await import("../logger/js/shared/daily-routines-store.js");

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
      logRow("2026-11-19", "done", { id: "a", itemId: "item-a", amount: 250 }),
      logRow("2026-11-19", "done", { id: "a2", itemId: "item-a", amount: 100 }),
      logRow("2026-11-19", "done", { id: "b", itemId: "item-b", amount: 250 }),
      logRow("2026-11-19", "partial", { id: "c", itemId: "item-c", amount: 0.25 }),
      logRow("2026-11-19", "skipped", { id: "d", itemId: "item-d", amount: 999 }),
      logRow("2026-11-19", "done", { id: "e", amount: 50, rest: true, itemId: null }),
      logRow("2026-11-19", "done", { id: "f", itemId: "item-f", amount: 250, deletedAt: 30 }),
      logRow("2026-11-18", "done", { id: "g", itemId: "item-g", amount: 250 }),
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

  test("day rollover follows the pinned local day, not the UTC instant", () => {
    signIn("2026-11-19");
    const morning = blockId("Morning routine");
    assert.equal(addExampleRoutineItem(app.state, morning), true);
    pin("2026-11-19", "2026-11-20T04:30:00.000Z");
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

    pin("2026-11-20", "2026-11-21T03:00:00.000Z");
    const nextDay = dailyRoutinesHTML();
    assert.match(nextDay, /data-logged="0"/);
    assert.match(nextDay, /data-streak="1"/);
    assert.equal(routineStreak(app.state.dailyRoutines.logs, "2026-11-20"), 1);

    pin("2026-11-21", "2026-11-21T18:00:00.000Z");
    const missed = dailyRoutinesHTML();
    assert.match(missed, /data-logged="0"/);
    assert.match(missed, /data-streak="0"/);
    assert.equal(routineStreak(app.state.dailyRoutines.logs, "2026-11-21"), 0);
    assert.doesNotMatch(missed, /yesterday|missed|overdue/i);
  });

  test("tap to log collapses the row, reveal shows undo, and undo drops the dose", () => {
    signIn("2026-11-19");
    const morning = blockId("Morning routine");
    assert.equal(addExampleRoutineItem(app.state, morning), true);
    const item = app.state.dailyRoutines.items[0];
    let html = dailyRoutinesHTML();
    assert.match(html, /Example Compound A<\/span><span class="dr-dose"> · 250 mcg<\/span>/);
    assert.match(html, /data-action="routines-log"/);
    assert.match(html, /<span class="dr-vh">Log <\/span>/);
    assert.doesNotMatch(html, /data-action="routines-undo"/);

    assert.equal(logRoutineItem(app.state, item.id), true);
    assert.equal(logRoutineItem(app.state, item.id), false);
    const older = structuredClone(app.state.dailyRoutines);
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

    app.state.dailyRoutines.logs.find((row) => row.id === live.id).note = "keep this note";
    const compound = app.state.dailyRoutines.compounds.find((row) => row.id === item.compoundId);
    assert.equal(undoRoutineLog(app.state, live.id), true);
    const undone = app.state.dailyRoutines.logs.find((row) => row.id === live.id);
    assert.equal(isLive(undone), false);
    assert.ok(undone.deletedAt > live.updatedAt);
    assert.equal(undone.undone, true);
    assert.equal(undone.amount, 250);
    assert.equal(undone.unit, "mcg");
    assert.equal(undone.note, "keep this note");
    assert.notDeepEqual(Object.keys(undone).sort(), ["day", "deletedAt", "id", "status", "updatedAt"]);
    compound.amount = 125;
    assert.equal(loggedTodayCount(app.state.dailyRoutines.logs, "2026-11-19"), 0);
    const merged = mergeDailyRoutines(app.state.dailyRoutines, older);
    const otherWay = mergeDailyRoutines(older, app.state.dailyRoutines);
    const kept = merged.logs.find((row) => row.id === live.id);
    const keptOther = otherWay.logs.find((row) => row.id === live.id);
    assert.equal(isLive(kept), false);
    assert.equal(isLive(keptOther), false);
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
    assert.equal(revived.itemId, item.id);
    assert.equal(revived.amount, 250);
    assert.equal(revived.unit, "mcg");
    assert.equal(revived.note, "keep this note");
    assert.notEqual(revived.undone, true);
    html = dailyRoutinesHTML();
    assert.match(html, /data-logged="1"/);
    assert.match(html, new RegExp(`data-state="done"[^>]*data-item-id="${item.id}"|data-item-id="${item.id}"[^>]*data-state="done"`));
  });

  test("two phones logging the same item merge to one dose", () => {
    signIn("2026-11-19");
    const morning = blockId("Morning routine");
    addExampleRoutineItem(app.state, morning);
    const item = app.state.dailyRoutines.items[0];
    assert.equal(logRoutineItem(app.state, item.id), true);
    const phoneA = structuredClone(app.state.dailyRoutines);
    app.state.dailyRoutines = structuredClone(phoneA);
    app.state.dailyRoutines.logs = [];
    app.state.dailyRoutines.updatedAt = 1;
    assert.equal(logRoutineItem(app.state, item.id), true);
    const phoneB = structuredClone(app.state.dailyRoutines);
    const left = mergeDailyRoutines(phoneA, phoneB);
    const right = mergeDailyRoutines(phoneB, phoneA);
    assert.equal(loggedTodayCount(left.logs, "2026-11-19"), 1);
    assert.equal(loggedTodayCount(right.logs, "2026-11-19"), 1);
    assert.equal(left.logs.filter((row) => row.itemId === item.id).length, 1);
  });

  test("after a two-phone merge one Undo reopens the row, in either merge order", () => {
    signIn("2026-11-19");
    const morning = blockId("Morning routine");
    addExampleRoutineItem(app.state, morning);
    const item = app.state.dailyRoutines.items[0];
    const phoneB = { dailyRoutines: structuredClone(app.state.dailyRoutines) };
    assert.equal(logRoutineItem(app.state, item.id), true);
    const phoneA = app.state;
    app.state = phoneB;
    app.routineNow = () => new Date("2026-11-19T08:31:00");
    assert.equal(logRoutineItem(app.state, item.id), true);
    assert.equal(phoneA.dailyRoutines.logs[0].id, routineLogId(item.id, "2026-11-19"));
    for (const [left, right] of [[phoneA, phoneB], [phoneB, phoneA]]) {
      const merged = mergeDailyRoutines(left.dailyRoutines, right.dailyRoutines);
      assert.equal(merged.logs.filter((row) => isLive(row) && row.itemId === item.id).length, 1);
      app.state = { dailyRoutines: merged };
      assert.match(dailyRoutinesHTML(), /data-logged="1"/);
      const live = merged.logs.find((row) => isLive(row) && row.itemId === item.id);
      assert.equal(undoRoutineLog(app.state, live.id), true);
      assert.equal(loggedTodayCount(app.state.dailyRoutines.logs, "2026-11-19"), 0);
      const html = dailyRoutinesHTML();
      assert.match(html, /data-action="routines-log"/);
      assert.match(html, /data-logged="0"/);
    }
  });

  test("older random-id rows for one item count once, and one Undo removes both", () => {
    signIn("2026-11-19");
    const morning = blockId("Morning routine");
    addExampleRoutineItem(app.state, morning);
    const item = app.state.dailyRoutines.items[0];
    app.state.dailyRoutines.logs.push(
      logRow("2026-11-19", "done", { id: "log_old_phone_a", itemId: item.id, updatedAt: 5 }),
      logRow("2026-11-19", "done", { id: "log_old_phone_b", itemId: item.id, updatedAt: 6 }),
    );
    assert.equal(loggedTodayCount(app.state.dailyRoutines.logs, "2026-11-19"), 1);
    assert.match(dailyRoutinesHTML(), /data-logged="1"/);
    assert.equal(undoRoutineLog(app.state, "log_old_phone_b"), true);
    const logs = app.state.dailyRoutines.logs;
    assert.equal(isLive(logs.find((row) => row.id === "log_old_phone_a")), false);
    assert.equal(isLive(logs.find((row) => row.id === "log_old_phone_b")), false);
    assert.equal(loggedTodayCount(logs, "2026-11-19"), 0);
    assert.match(dailyRoutinesHTML(), /data-action="routines-log"/);
  });

  test("a restored rest stays a rest and does not cover an item row", () => {
    signIn("2026-11-19");
    const morning = blockId("Morning routine");
    addExampleRoutineItem(app.state, morning);
    assert.equal(logRoutineRest(app.state), true);
    const rest = app.state.dailyRoutines.logs.find((row) => row.rest === true);
    assert.equal(rest.id, routineLogId(null, "2026-11-19"));
    assert.equal(undoRoutineLog(app.state, rest.id), true);
    assert.equal(restoreRoutineLog(app.state, rest.id), true);
    const back = app.state.dailyRoutines.logs.find((row) => row.id === rest.id);
    assert.equal(isLive(back), true);
    assert.equal(back.rest, true);
    assert.equal(back.itemId, null);
    assert.equal(loggedTodayCount(app.state.dailyRoutines.logs, "2026-11-19"), 0);
    const html = dailyRoutinesHTML();
    assert.match(html, /Rest logged/);
    assert.match(html, /data-logged="0"/);
    assert.match(html, /data-action="routines-log"/);
  });

  test("a skip collapses the row, does not count, and does not reset the streak", () => {
    signIn("2026-11-19");
    const morning = blockId("Morning routine");
    addExampleRoutineItem(app.state, morning);
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
    assert.match(html, /All skipped/);
    assert.doesNotMatch(html, /All done/);
    assert.match(html, /data-state="skipped"/);
    assert.match(html, /Skipped/);
    assert.match(html, /data-streak="3"/);
    assert.match(html, /data-logged="0"/);
    assert.doesNotMatch(html, /<b>250<\/b>/);
    assert.doesNotMatch(html, /250 mcg/);
  });

  test("a completed row shows the logged amount, not the current compound amount", () => {
    signIn("2026-11-19");
    const morning = blockId("Morning routine");
    addExampleRoutineItem(app.state, morning);
    const item = app.state.dailyRoutines.items[0];
    assert.equal(logRoutineItem(app.state, item.id), true);
    const log = app.state.dailyRoutines.logs.find((row) => row.itemId === item.id);
    log.status = "partial";
    log.amount = 125;
    log.unit = "mcg";
    const compound = app.state.dailyRoutines.compounds.find((row) => row.id === item.compoundId);
    compound.amount = 250;
    toggleRoutineReveal(app.state, morning);
    const html = dailyRoutinesHTML();
    assert.match(html, /data-state="partial"/);
    assert.match(html, / · 125 mcg/);
    assert.doesNotMatch(html, /250 mcg/);
    assert.match(html, /data-logged="1"/);
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
    addExampleRoutineItem(app.state, morning);
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

  test("a preference toggle keeps a newer store stamp, and the next check-off beats the tombstone", () => {
    signIn("2026-11-19");
    const morning = blockId("Morning routine");
    addExampleRoutineItem(app.state, morning);
    const item = app.state.dailyRoutines.items[0];
    const ahead = Date.parse("2026-11-19T18:00:00Z");
    const behind = Date.parse("2026-11-19T08:30:00Z");
    const id = routineLogId(item.id, "2026-11-19");
    app.state.dailyRoutines.updatedAt = ahead;
    app.state.dailyRoutines.prefs = { ...app.state.dailyRoutines.prefs, updatedAt: 10, focusMode: false };
    app.state.dailyRoutines.logs.push({
      id,
      itemId: item.id,
      day: "2026-11-19",
      status: "done",
      amount: null,
      unit: "",
      updatedAt: ahead,
      deletedAt: ahead,
    });
    app.routineNow = () => new Date(behind);
    const otherPhone = structuredClone(app.state.dailyRoutines);
    assert.equal(toggleRoutineFocus(app.state), true);
    assert.equal(app.state.dailyRoutines.prefs.focusMode, true);
    assert.ok(app.state.dailyRoutines.updatedAt > ahead);
    assert.ok(app.state.dailyRoutines.prefs.updatedAt > ahead);
    assert.equal(toggleRoutineReveal(app.state, morning), true);
    assert.ok(app.state.dailyRoutines.updatedAt > ahead);
    app.state.dailyRoutines.updatedAt = behind;
    assert.equal(logRoutineItem(app.state, item.id), true);
    const log = app.state.dailyRoutines.logs.find((row) => row.id === id);
    assert.equal(isLive(log), true);
    assert.ok(log.updatedAt > ahead);
    const merged = mergeDailyRoutines(app.state.dailyRoutines, otherPhone);
    const kept = merged.logs.find((row) => row.id === id);
    assert.equal(isLive(kept), true);
    assert.ok(kept.updatedAt > ahead);
  });

  test("a check-off stays live when a days-ahead tombstone is merged again later", () => {
    signIn("2026-11-19");
    const morning = blockId("Morning routine");
    addExampleRoutineItem(app.state, morning);
    const item = app.state.dailyRoutines.items[0];
    const id = routineLogId(item.id, "2026-11-19");
    const future = Date.now() + 3 * 24 * 60 * 60 * 1000;
    app.state.dailyRoutines.logs.push({
      id,
      itemId: item.id,
      day: "2026-11-19",
      status: "done",
      amount: 250,
      unit: "mcg",
      updatedAt: future,
      deletedAt: future,
    });
    app.state.dailyRoutines.updatedAt = future;
    const remote = structuredClone(app.state.dailyRoutines);
    assert.equal(logRoutineItem(app.state, item.id), true);
    const log = app.state.dailyRoutines.logs.find((row) => row.id === id);
    assert.equal(isLive(log), true);
    const merged = mergeDailyRoutines(app.state.dailyRoutines, remote, Date.now() + 1000);
    const kept = merged.logs.find((row) => row.id === id);
    assert.equal(isLive(kept), true);
    assert.equal(kept.amount, 250);
  });

  test("a later restore outranks an undo that shares its stored stamp", () => {
    const id = "log_item_a_2026-11-19";
    const shared = {
      id,
      itemId: "item_a",
      day: "2026-11-19",
      status: "done",
      amount: 250,
      unit: "mcg",
      updatedAt: 5000,
      sourceAt: 9_000_000_000_000,
    };
    const undone = { ...shared, deletedAt: 5000, undone: true, sourceStep: 2 };
    const restored = { ...shared, deletedAt: null, sourceStep: 3 };
    for (const merged of [mergeDailyRoutines({ logs: [restored] }, { logs: [undone] }), mergeDailyRoutines({ logs: [undone] }, { logs: [restored] })]) {
      const kept = merged.logs.find((row) => row.id === id);
      assert.equal(isLive(kept), true);
      assert.equal(kept.sourceStep, 3);
      assert.equal(kept.amount, 250);
    }
  });

  test("a restore after a far-future undo stays live on the next merge", () => {
    signIn("2026-11-19");
    const morning = blockId("Morning routine");
    addExampleRoutineItem(app.state, morning);
    const item = app.state.dailyRoutines.items[0];
    const id = routineLogId(item.id, "2026-11-19");
    const future = Date.now() + 3 * 24 * 60 * 60 * 1000;
    app.state.dailyRoutines.logs.push({
      id,
      itemId: item.id,
      day: "2026-11-19",
      status: "done",
      amount: 250,
      unit: "mcg",
      updatedAt: future,
      deletedAt: future,
    });
    app.state.dailyRoutines.updatedAt = future;
    assert.equal(logRoutineItem(app.state, item.id), true);
    const checked = structuredClone(app.state.dailyRoutines);
    app.state.dailyRoutines = structuredClone(checked);
    assert.equal(undoRoutineLog(app.state, id), true);
    const undone = structuredClone(app.state.dailyRoutines);
    app.state.dailyRoutines = mergeDailyRoutines(checked, undone);
    assert.equal(isLive(app.state.dailyRoutines.logs.find((row) => row.id === id)), false);
    assert.equal(restoreRoutineLog(app.state, id), true);
    assert.equal(isLive(app.state.dailyRoutines.logs.find((row) => row.id === id)), true);
    for (const merged of [mergeDailyRoutines(app.state.dailyRoutines, undone), mergeDailyRoutines(undone, app.state.dailyRoutines)]) {
      const kept = merged.logs.find((row) => row.id === id);
      assert.equal(isLive(kept), true);
      assert.equal(kept.amount, 250);
    }
  });

  test("an undo of a days-ahead check-off still wins the later merge", () => {
    signIn("2026-11-19");
    const morning = blockId("Morning routine");
    addExampleRoutineItem(app.state, morning);
    const item = app.state.dailyRoutines.items[0];
    const id = routineLogId(item.id, "2026-11-19");
    const future = Date.now() + 3 * 24 * 60 * 60 * 1000;
    app.routineNow = () => new Date(future);
    assert.equal(logRoutineItem(app.state, item.id), true);
    const checked = structuredClone(app.state.dailyRoutines);
    app.routineNow = () => new Date();
    app.state.dailyRoutines = structuredClone(checked);
    assert.equal(undoRoutineLog(app.state, id), true);
    const later = Date.now() + 2 * 24 * 60 * 60 * 1000;
    for (const merged of [mergeDailyRoutines(checked, app.state.dailyRoutines, later), mergeDailyRoutines(app.state.dailyRoutines, checked, later)]) {
      assert.equal(isLive(merged.logs.find((row) => row.id === id)), false);
    }
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
    addExampleRoutineItem(app.state, morning);
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
    assert.equal(addExampleRoutineItem(app.state, morning), false);
    assert.equal(logRoutineItem(app.state, "item-x"), false);
    assert.equal(logRoutineRest(app.state), false);
    assert.deepEqual(app.state.dailyRoutines, seeded);
    app.session = { user: { id: "synthetic-user" } };
    app.ROUTINES_ENABLED = false;
    assert.equal(addExampleRoutineItem(app.state, morning), false);
    assert.equal(dailyRoutinesHTML(), "");
    app.ROUTINES_ENABLED = true;
    app.sb = { from() {} };
    app.cloudPullOk = false;
    assert.equal(addExampleRoutineItem(app.state, morning), false);
    assert.equal(toggleRoutineFocus(app.state), false);
    assert.equal(app.state.dailyRoutines.blocks.length, 3);
    assert.equal(app.state.dailyRoutines.items.length, 0);
  });

  test("the example add stops at four synthetic names and does not invent a stack", () => {
    signIn("2026-11-19");
    const morning = blockId("Morning routine");
    assert.equal(addExampleRoutineItem(app.state, morning), true);
    assert.equal(addExampleRoutineItem(app.state, morning), true);
    assert.equal(addExampleRoutineItem(app.state, morning), true);
    assert.equal(addExampleRoutineItem(app.state, morning), true);
    assert.equal(addExampleRoutineItem(app.state, morning), false);
    const names = app.state.dailyRoutines.items.map((row) => row.name);
    assert.deepEqual(names, ["Example Compound A", "Example Compound B", "Example Compound C", "Example Compound D"]);
    assert.equal(app.state.dailyRoutines.items[0].kind, "dose");
    assert.equal(app.state.dailyRoutines.items[1].kind, "check");
    const html = dailyRoutinesHTML();
    assert.match(html, /Example Compound B/);
    assert.doesNotMatch(html, /data-action="routines-add-item"/);
    assert.doesNotMatch(html, /Add the first item/);
  });

  test("the shell wires the actions and keeps motion off unless the user allows it", () => {
    const actions = readFileSync(new URL("../logger/js/shell/actions.js", import.meta.url), "utf8");
    const page = readFileSync(new URL("../logger/js/pages/daily-routines.js", import.meta.url), "utf8");
    const css = readFileSync(new URL("../logger/css/routines.css", import.meta.url), "utf8");
    const flag = readFileSync(new URL("../logger/js/shared/routines-flag.js", import.meta.url), "utf8");
    for (const name of ["routines-log", "routines-skip", "routines-undo", "routines-reveal", "routines-focus", "routines-add-item", "routines-rest"]) {
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
