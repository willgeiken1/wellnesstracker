import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

/* Synthetic routines only. The day key is the phone's local clock plus the
   rollover hour. Old log.day values stay put when the hour changes. */

const listeners = [];
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
  addEventListener(type, fn) { listeners.push([type, fn]); },
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
  doseCountdownText,
  editRoutineLog,
  logRoutineItem,
  loggedTodayCount,
  routineDayRolloverControlHTML,
  routineLogDraft,
  routineStreak,
  routinesSettingsSheetHTML,
  setRoutineDayRollover,
  skipRoutineItem,
  toggleRoutineReveal,
  undoRoutineLog,
} = await import("../logger/js/pages/daily-routines.js");
const { isLive, mergeDailyRoutines, normalizeDailyRoutines, purgeDailyRoutineRange } = await import("../logger/js/shared/daily-routines-store.js");
const { routineDayKey, routineDayRolloverHour } = await import("../logger/js/shared/routine-dose.js");

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function at(year, month, day, hour, minute, second = 0) {
  return new Date(year, month - 1, day, hour, minute, second);
}

function pin(date) {
  app.routineNow = () => date;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  app.today = () => `${y}-${m}-${d}`;
}

function signIn(date = at(2026, 11, 20, 8, 30)) {
  app.ROUTINES_ENABLED = true;
  app.session = { user: { id: "synthetic-user" } };
  app.sb = null;
  app.cloudPullOk = true;
  app.state = { dailyRoutines: null };
  app.save = () => {};
  app.render = () => {};
  pin(date);
  dailyRoutinesHTML();
}

function blockId(name) {
  const block = app.state.dailyRoutines.blocks.find((row) => row.name === name);
  assert.ok(block, name);
  return block.id;
}

function addCheck(name = "Example check") {
  return addRoutineItem(app.state, blockId("Morning routine"), { name, kind: "check" });
}

function addDose(name = "Example Compound A") {
  return addRoutineItem(app.state, blockId("Morning routine"), { name, kind: "dose", amount: 250, unit: "mcg" });
}

function liveLog(itemId) {
  return app.state.dailyRoutines.logs.find((row) => row.itemId === itemId && isLive(row));
}

function snapshot(logs) {
  return (logs || []).map((log) => ({
    id: log.id,
    itemId: log.itemId,
    day: log.day,
    status: log.status,
    amount: log.amount,
    unit: log.unit,
    at: log.at,
    updatedAt: log.updatedAt,
    deletedAt: log.deletedAt,
  }));
}

describe("routine day rollover", { concurrency: false }, () => {
  test("the default hour is 4, the setting stops at 6, and an older hour above 6 is clamped", () => {
    assert.equal(routineDayRolloverHour(undefined), 4);
    assert.equal(routineDayRolloverHour(4), 4);
    assert.equal(routineDayRolloverHour(0), 0);
    assert.equal(routineDayRolloverHour(6), 6);
    assert.equal(routineDayRolloverHour(7), 6);
    assert.equal(routineDayRolloverHour(23), 6);
    assert.equal(routineDayRolloverHour(24), 6);
    assert.equal(routineDayRolloverHour(99), 6);
    assert.equal(routineDayRolloverHour(-1), 4);
    assert.equal(routineDayRolloverHour(4.5), 4);
    assert.equal(routineDayRolloverHour("4"), 4);
    assert.equal(routineDayKey(new Date(NaN), 4), "");
    assert.equal(routineDayKey(null, 4), "");
    const stored = normalizeDailyRoutines({
      logs: [{ id: "log-1", itemId: "item-a", day: "2026-11-19", status: "done", amount: 1, unit: "mg", updatedAt: 10, deletedAt: null }],
      settings: { dayRolloverHour: 23, updatedAt: 8 },
    });
    assert.equal(stored.settings.dayRolloverHour, 6);
    assert.equal(stored.settings.updatedAt, 8);
    assert.equal(stored.logs[0].day, "2026-11-19");
  });

  test("3:59 stays on the previous local day and 4:00 starts the new day", () => {
    assert.equal(routineDayKey(at(2026, 11, 20, 3, 59), 4), "2026-11-19");
    assert.equal(routineDayKey(at(2026, 11, 20, 3, 59, 59), 4), "2026-11-19");
    assert.equal(routineDayKey(at(2026, 11, 20, 4, 0), 4), "2026-11-20");
    assert.equal(routineDayKey(at(2026, 11, 20, 4, 0, 0), 4), "2026-11-20");
    assert.equal(routineDayKey(at(2026, 11, 20, 1, 0)), "2026-11-19");
    assert.equal(routineDayKey(at(2026, 3, 1, 3, 59), 4), "2026-02-28");
    assert.equal(routineDayKey(at(2026, 1, 1, 1, 0), 4), "2025-12-31");
    assert.equal(routineDayKey(at(2026, 3, 8, 3, 30), 4), "2026-03-07");
  });

  test("a custom hour moves the boundary and midnight is hour 0", () => {
    assert.equal(routineDayKey(at(2026, 11, 20, 5, 59), 6), "2026-11-19");
    assert.equal(routineDayKey(at(2026, 11, 20, 6, 0), 6), "2026-11-20");
    assert.equal(routineDayKey(at(2026, 11, 20, 0, 0), 0), "2026-11-20");
    assert.equal(routineDayKey(at(2026, 11, 19, 23, 59), 0), "2026-11-19");
    assert.equal(routineDayKey(at(2026, 11, 20, 0, 59), 1), "2026-11-19");
    assert.equal(routineDayKey(at(2026, 11, 20, 1, 0), 1), "2026-11-20");
  });

  test("a log at 1:00 AM is stored on the previous day and 4:00 AM starts the new day", () => {
    signIn(at(2026, 11, 20, 1, 0));
    assert.equal(app.today(), "2026-11-20");
    assert.equal(app.state.dailyRoutines.settings.dayRolloverHour, 4);
    assert.equal(app.state.dailyRoutines.settings.updatedAt, 0);
    assert.equal(addCheck("Example check"), true);
    const item = app.state.dailyRoutines.items.find((row) => row.name === "Example check");
    assert.equal(logRoutineItem(app.state, item.id), true);
    const log = liveLog(item.id);
    assert.equal(log.day, "2026-11-19");
    assert.notEqual(log.day, app.today());
    const html = dailyRoutinesHTML();
    assert.match(html, /page-sub">2026-11-19/);
    assert.match(html, /data-logged="1"/);
    assert.match(html, /data-streak="1"/);
    assert.equal(loggedTodayCount(app.state.dailyRoutines.logs, "2026-11-19"), 1);
    assert.equal(loggedTodayCount(app.state.dailyRoutines.logs, "2026-11-20"), 0);

    pin(at(2026, 11, 20, 4, 0));
    assert.equal(app.today(), "2026-11-20");
    const opened = dailyRoutinesHTML();
    assert.match(opened, /page-sub">2026-11-20/);
    assert.match(opened, /data-logged="0"/);
    assert.match(opened, /data-streak="1"/);
    assert.equal(routineStreak(app.state.dailyRoutines.logs, "2026-11-20"), 1);
    assert.equal(logRoutineItem(app.state, item.id), true);
    const days = app.state.dailyRoutines.logs.filter((row) => row.itemId === item.id).map((row) => row.day).sort();
    assert.deepEqual(days, ["2026-11-19", "2026-11-20"]);
  });

  test("a skip before the boundary stays on the previous day", () => {
    signIn(at(2026, 11, 20, 3, 59));
    assert.equal(addCheck(), true);
    const item = app.state.dailyRoutines.items[0];
    assert.equal(skipRoutineItem(app.state, item.id), true);
    assert.equal(liveLog(item.id).day, "2026-11-19");
    assert.equal(liveLog(item.id).status, "skipped");
    const html = dailyRoutinesHTML();
    assert.match(html, /data-logged="0"/);
    assert.match(html, /data-streak="1"/);
  });

  test("changing the hour updates today and does not rewrite stored days", () => {
    signIn(at(2026, 11, 20, 5, 30));
    assert.equal(addCheck("Example morning"), true);
    assert.equal(addCheck("Example evening"), true);
    const [first, second] = app.state.dailyRoutines.items;
    assert.equal(logRoutineItem(app.state, first.id), true);
    assert.equal(liveLog(first.id).day, "2026-11-20");
    const before = snapshot(app.state.dailyRoutines.logs);
    assert.equal(setRoutineDayRollover(app.state, 6), true);
    assert.equal(app.state.dailyRoutines.settings.dayRolloverHour, 6);
    assert.ok(app.state.dailyRoutines.settings.updatedAt > 0);
    assert.deepEqual(snapshot(app.state.dailyRoutines.logs), before);
    const shifted = dailyRoutinesHTML();
    assert.match(shifted, /page-sub">2026-11-19/);
    assert.match(shifted, /data-logged="0"/);
    assert.equal(logRoutineItem(app.state, second.id), true);
    assert.equal(liveLog(second.id).day, "2026-11-19");
    assert.equal(liveLog(first.id).day, "2026-11-20");
    assert.equal(liveLog(first.id).updatedAt, before[0].updatedAt);
    assert.equal(setRoutineDayRollover(app.state, 7), false);
    assert.equal(setRoutineDayRollover(app.state, 24), false);
    assert.equal(setRoutineDayRollover(app.state, -1), false);
    assert.equal(setRoutineDayRollover(app.state, 6.5), false);
    assert.equal(setRoutineDayRollover(app.state, "6"), false);
    assert.equal(app.state.dailyRoutines.settings.dayRolloverHour, 6);
    assert.deepEqual(snapshot(app.state.dailyRoutines.logs.filter((row) => row.itemId === first.id)), before);
  });

  test("a future routine day is refused and an undo keeps the stored day", () => {
    signIn(at(2026, 11, 18, 12, 0));
    assert.equal(addDose(), true);
    const item = app.state.dailyRoutines.items[0];
    assert.equal(logRoutineItem(app.state, item.id), true);
    const log = liveLog(item.id);
    assert.equal(log.day, "2026-11-18");
    pin(at(2026, 11, 20, 1, 0));
    assert.equal(app.today(), "2026-11-20");
    assert.equal(routineLogDraft(app.state, log.id).maxDay, "2026-11-19");
    assert.equal(editRoutineLog(app.state, log.id, { amount: 250, day: "2026-11-20" }), false);
    assert.equal(liveLog(item.id).day, "2026-11-18");
    assert.equal(editRoutineLog(app.state, log.id, { amount: "0.25", day: "2026-11-18" }), true);
    assert.equal(liveLog(item.id).day, "2026-11-18");
    assert.equal(liveLog(item.id).amount, 0.25);
    const kept = liveLog(item.id).day;
    assert.equal(undoRoutineLog(app.state, log.id), true);
    const tomb = app.state.dailyRoutines.logs.find((row) => row.id === log.id);
    assert.equal(tomb.day, kept);
    assert.ok(tomb.deletedAt > 0);
  });

  test("streak and countdown follow the rollover day", () => {
    signIn(at(2026, 11, 19, 20, 0));
    assert.equal(addDose(), true);
    const item = app.state.dailyRoutines.items[0];
    assert.equal(logRoutineItem(app.state, item.id), true);
    const view = {
      blocks: app.state.dailyRoutines.blocks,
      placements: app.state.dailyRoutines.placements,
      logs: app.state.dailyRoutines.logs,
      items: app.state.dailyRoutines.items,
    };
    const early = at(2026, 11, 20, 3, 59);
    pin(early);
    assert.equal(routineStreak(app.state.dailyRoutines.logs, routineDayKey(early, 4)), 1);
    assert.equal(doseCountdownText(view, item, early, routineDayKey(early, 4)), "Next dose in 1 hr 1 min");
    assert.equal(toggleRoutineReveal(app.state, blockId("Morning routine")), true);
    let html = dailyRoutinesHTML();
    assert.match(html, /data-streak="1"/);
    assert.match(html, /data-logged="1"/);
    assert.match(html, /data-next-dose="61"/);

    const onTime = at(2026, 11, 20, 4, 0);
    pin(onTime);
    assert.equal(routineStreak(app.state.dailyRoutines.logs, routineDayKey(onTime, 4)), 1);
    assert.equal(doseCountdownText(view, item, onTime, routineDayKey(onTime, 4)), "Next dose in 1 hr");
    html = dailyRoutinesHTML();
    assert.match(html, /data-streak="1"/);
    assert.match(html, /data-logged="0"/);
    assert.match(html, /data-next-dose="60"/);
    const openEarly = { ...view, logs: [] };
    assert.equal(doseCountdownText(openEarly, item, early, "2026-11-19"), "Next dose in 1 hr 1 min");
    const custom = at(2026, 11, 20, 5, 30);
    const laterHour = { ...view, settings: { dayRolloverHour: 6 } };
    assert.equal(doseCountdownText(laterHour, item, custom, "2026-11-19"), "Next dose in 23 hr 30 min");

    pin(at(2026, 11, 21, 4, 0));
    html = dailyRoutinesHTML();
    assert.match(html, /data-streak="0"/);
    assert.equal(routineStreak(app.state.dailyRoutines.logs, "2026-11-21"), 0);
  });

  test("purge still matches the stored day after the hour changes", () => {
    const data = {
      dailyRoutines: {
        updatedAt: 10,
        logs: [
          { id: "early", itemId: "item-a", day: "2026-11-18", status: "done", amount: 1, unit: "mg", updatedAt: 10, deletedAt: null, at: 10 },
          { id: "later", itemId: "item-a", day: "2026-11-19", status: "done", amount: 1, unit: "mg", updatedAt: 11, deletedAt: null, at: 11 },
        ],
        settings: { dayRolloverHour: 6, updatedAt: 50 },
      },
    };
    const days = data.dailyRoutines.logs.map((log) => log.day);
    assert.equal(purgeDailyRoutineRange(data, "2026-11-19", "2026-11-19", null, Date.parse("2026-11-20T06:30:00Z")), true);
    assert.deepEqual(data.dailyRoutines.logs.map((log) => log.day), days);
    assert.ok(data.dailyRoutines.logs[0].deletedAt > 0);
    assert.ok(data.dailyRoutines.logs[1].deletedAt > 0);
    assert.equal(data.dailyRoutines.settings.dayRolloverHour, 6);
  });

  test("delete through a calendar day also removes the early-morning dose stored on the previous routine day", () => {
    const morning = at(2026, 11, 20, 1, 30);
    assert.equal(routineDayKey(morning, 4), "2026-11-19");
    assert.equal(routineDayKey(at(2026, 11, 20, 0, 30), 1), "2026-11-19");
    assert.equal(routineDayKey(at(2026, 11, 20, 1, 0), 1), "2026-11-20");
    assert.equal(routineDayKey(at(2026, 11, 20, 5, 30), 6), "2026-11-19");
    assert.equal(routineDayKey(at(2026, 11, 20, 6, 0), 6), "2026-11-20");
    function dose(id, clock, hour) {
      return {
        id,
        itemId: "item-a",
        day: routineDayKey(clock, hour),
        status: "done",
        amount: 1,
        unit: "mg",
        updatedAt: 10,
        deletedAt: null,
        at: clock.getTime(),
      };
    }
    for (const hour of [1, 4, 6]) {
      const early = hour === 1 ? at(2026, 11, 20, 0, 30) : hour === 6 ? at(2026, 11, 20, 5, 30) : morning;
      const onTime = hour === 1 ? at(2026, 11, 20, 1, 0) : hour === 6 ? at(2026, 11, 20, 6, 0) : at(2026, 11, 20, 10, 0);
      const data = {
        dailyRoutines: {
          updatedAt: 10,
          settings: { dayRolloverHour: hour, updatedAt: 1 },
          logs: [
            dose("early", early, hour),
            dose("ontime", onTime, hour),
            dose("before", at(2026, 11, 18, 12, 0), hour),
            dose("after", at(2026, 11, 21, 12, 0), hour),
          ],
        },
      };
      assert.equal(data.dailyRoutines.logs[0].day, "2026-11-19", `hour ${hour}`);
      assert.equal(data.dailyRoutines.logs[1].day, "2026-11-20", `hour ${hour}`);
      assert.equal(purgeDailyRoutineRange(data, "2026-11-20", "2026-11-20", null, 5000), true);
      const byId = Object.fromEntries(data.dailyRoutines.logs.map((log) => [log.id, log]));
      assert.ok(byId.early.deletedAt > 0, `hour ${hour} early`);
      assert.ok(byId.ontime.deletedAt > 0, `hour ${hour} on time`);
      assert.equal(byId.before.deletedAt, null, `hour ${hour} two days earlier`);
      assert.equal(byId.after.deletedAt, null, `hour ${hour} the next day`);
      assert.equal(byId.early.day, "2026-11-19");
      assert.equal(byId.ontime.day, "2026-11-20");
    }
  });

  test("normalize and merge keep log days and take the newer hour", () => {
    const log = {
      id: "log-1", itemId: "item-a", day: "2026-11-18", status: "done",
      amount: 1, unit: "mg", updatedAt: 10, deletedAt: null, at: 10,
    };
    const normalized = normalizeDailyRoutines({
      logs: [log],
      settings: { dayRolloverHour: 99, updatedAt: 5 },
    });
    assert.equal(normalized.settings.dayRolloverHour, 6);
    assert.equal(normalized.settings.updatedAt, 5);
    assert.equal(normalized.logs[0].day, "2026-11-18");
    assert.equal(normalized.logs[0].amount, 1);

    const missing = normalizeDailyRoutines({ logs: [log] });
    assert.equal(missing.settings.dayRolloverHour, 4);
    assert.equal(missing.settings.updatedAt, 0);
    assert.equal(missing.logs[0].day, "2026-11-18");

    const older = {
      updatedAt: 10,
      logs: [log],
      settings: { dayRolloverHour: 4, updatedAt: 0 },
    };
    const newer = {
      updatedAt: 30,
      logs: [{ ...log, id: "log-2", day: "2026-11-19", updatedAt: 20 }],
      settings: { dayRolloverHour: 7, updatedAt: 30 },
    };
    const merged = mergeDailyRoutines(older, newer);
    assert.equal(merged.settings.dayRolloverHour, 6);
    assert.deepEqual(merged.logs.map((row) => row.day).sort(), ["2026-11-18", "2026-11-19"]);
    const tie = mergeDailyRoutines(
      { ...older, settings: { dayRolloverHour: 5, updatedAt: 20 } },
      { ...newer, settings: { dayRolloverHour: 7, updatedAt: 20 } },
    );
    assert.equal(tie.settings.dayRolloverHour, 5);
    assert.equal(tie.logs.find((row) => row.id === "log-1").day, "2026-11-18");
  });

  test("the settings control exposes the hour for the settings sheet", () => {
    signIn(at(2026, 11, 20, 8, 30));
    const sheet = routinesSettingsSheetHTML();
    assert.match(sheet, /id="dr-rollover-hour"/);
    assert.match(sheet, /New day starts/);
    assert.match(sheet, /<option value="4" selected>4:00 AM<\/option>/);
    assert.match(sheet, /The default is 4:00 AM/);
    assert.match(sheet, /Notifications stay off/);
    assert.equal(sheet.match(/<option /g).length, 7);
    assert.doesNotMatch(sheet, /11:00 PM/);
    assert.doesNotMatch(sheet, /showNotification|requestPermission/);
    assert.equal(setRoutineDayRollover(app.state, 6), true);
    const next = routinesSettingsSheetHTML();
    assert.match(next, /<option value="6" selected>6:00 AM<\/option>/);
    assert.doesNotMatch(next, /<option value="4" selected>/);
    const control = routineDayRolloverControlHTML(6);
    assert.match(control, /<option value="6" selected>/);
    assert.match(control, /for="dr-rollover-hour"/);

    const hour = app.state.dailyRoutines.settings.dayRolloverHour;
    const saves = [];
    app.save = () => { saves.push("save"); };
    const renders = [];
    app.render = () => { renders.push("render"); };
    const change = listeners.filter(([type]) => type === "change").map(([, fn]) => fn);
    assert.equal(change.length, 1);
    change[0]({ target: { id: "other", value: "1" } });
    assert.equal(app.state.dailyRoutines.settings.dayRolloverHour, hour);
    change[0]({ target: { id: "dr-rollover-hour", value: "nope" } });
    assert.equal(app.state.dailyRoutines.settings.dayRolloverHour, hour);
    assert.equal(saves.length, 0);
    change[0]({ target: { id: "dr-rollover-hour", value: "1" } });
    assert.equal(app.state.dailyRoutines.settings.dayRolloverHour, 1);
    assert.equal(setRoutineDayRollover(app.state, 0), true);
    assert.equal(app.state.dailyRoutines.settings.dayRolloverHour, 0);
    assert.equal(saves.length, 1);
    assert.equal(renders.length, 1);
    const days = snapshot(app.state.dailyRoutines.logs);
    app.ROUTINES_ENABLED = false;
    change[0]({ target: { id: "dr-rollover-hour", value: "9" } });
    assert.equal(app.state.dailyRoutines.settings.dayRolloverHour, 0);
    assert.deepEqual(snapshot(app.state.dailyRoutines.logs), days);
    assert.equal(setRoutineDayRollover(app.state, 2), false);
    app.session = null;
    app.ROUTINES_ENABLED = true;
    assert.equal(setRoutineDayRollover(app.state, 2), false);
  });

  test("travel uses the phone's current zone, not the UTC date", () => {
    const script = `
      import assert from "node:assert/strict";
      import { routineDayKey } from "./logger/js/shared/routine-dose.js";
      const at = (iso) => new Date(iso);
      if (process.env.TZ === "America/Chicago") {
        const before = at("2026-11-20T09:59:00.000Z");
        assert.equal(before.getHours(), 3);
        assert.equal(before.getMinutes(), 59);
        assert.equal(routineDayKey(before, 4), "2026-11-19");
        assert.equal(before.toISOString().slice(0, 10), "2026-11-20");
        const on = at("2026-11-20T10:00:00.000Z");
        assert.equal(on.getHours(), 4);
        assert.equal(on.getMinutes(), 0);
        assert.equal(routineDayKey(on, 4), "2026-11-20");
        const custom = at("2026-11-20T11:30:00.000Z");
        assert.equal(custom.getHours(), 5);
        assert.equal(routineDayKey(custom, 4), "2026-11-20");
        assert.equal(routineDayKey(custom, 6), "2026-11-19");
      } else if (process.env.TZ === "Pacific/Auckland") {
        const before = at("2026-11-19T14:59:00.000Z");
        assert.equal(before.getHours(), 3);
        assert.equal(before.getMinutes(), 59);
        assert.equal(routineDayKey(before, 4), "2026-11-19");
        const on = at("2026-11-19T15:00:00.000Z");
        assert.equal(on.getHours(), 4);
        assert.equal(on.getMinutes(), 0);
        assert.equal(routineDayKey(on, 4), "2026-11-20");
        assert.notEqual(on.toISOString().slice(0, 10), routineDayKey(on, 4));
      } else {
        throw new Error("unexpected tz " + process.env.TZ);
      }
    `;
    for (const TZ of ["America/Chicago", "Pacific/Auckland"]) {
      const run = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
        cwd: ROOT,
        env: { ...process.env, TZ },
        encoding: "utf8",
      });
      assert.equal(run.status, 0, `${TZ}\n${run.stdout}\n${run.stderr}`);
    }
  });

  test("the flag stays off and this PR does not bump the shell cache", () => {
    const flag = readFileSync(new URL("../logger/js/shared/routines-flag.js", import.meta.url), "utf8");
    const main = readFileSync(new URL("../logger/js/main.js", import.meta.url), "utf8");
    const page = readFileSync(new URL("../logger/js/pages/daily-routines.js", import.meta.url), "utf8");
    const store = readFileSync(new URL("../logger/js/shared/daily-routines-store.js", import.meta.url), "utf8");
    const dose = readFileSync(new URL("../logger/js/shared/routine-dose.js", import.meta.url), "utf8");
    const sw = readFileSync(new URL("../logger/sw.js", import.meta.url), "utf8");
    const sentry = readFileSync(new URL("../logger/js/sentry.js", import.meta.url), "utf8");
    assert.match(flag, /export const ROUTINES_ENABLED = true/);
    assert.equal(main.match(/routines-flag/g).length, 1);
    assert.doesNotMatch(page, /routines-flag/);
    assert.doesNotMatch(store, /routines-flag/);
    assert.doesNotMatch(dose, /routines-flag/);
    assert.match(page, /routineDayKey/);
    assert.match(sw, /const CACHE = "insight-shell-v79"/);
    assert.match(sentry, /insight-shell-v79/);
    assert.doesNotMatch(page, /showNotification|requestPermission/);
  });
});
