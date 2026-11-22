import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/* Whole-day rest. Synthetic names only. A rest day pauses the streak:
   it does not add a day and it does not break the run. A skip still adds
   a day. A day with no log is a miss. One rest covers the day. */

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
  logAllRoutineBlock,
  logRoutineItem,
  logRoutineRest,
  restoreRoutineLog,
  routineRestLog,
  routineStreak,
  shiftRoutineDay,
  skipRoutineItem,
  undoRoutineLog,
} = await import("../logger/js/pages/daily-routines.js");
const { isLive, mergeDailyRoutines } = await import("../logger/js/shared/daily-routines-store.js");

const TODAY = "2026-11-19";

function pin(day = TODAY) {
  app.today = () => day;
  app.routineNow = () => new Date(2026, 10, 19, 8, 30, 0, 0);
}

function signIn() {
  app.ROUTINES_ENABLED = true;
  app.session = { user: { id: "synthetic-user" } };
  app.sb = null;
  app.cloudPullOk = true;
  app.state = { dailyRoutines: null };
  app.ui = { sheet: null, sd: {}, dailyRoutineEdit: false, tab: "daily-routines" };
  app.save = () => {};
  app.render = () => {};
  pin();
  dailyRoutinesHTML();
}

function blockId(name) {
  const block = app.state.dailyRoutines.blocks.find((row) => row.name === name);
  assert.ok(block, name);
  return block.id;
}

function itemNamed(name) {
  const item = app.state.dailyRoutines.items.find((row) => row.name === name);
  assert.ok(item, name);
  return item;
}

function liveLogs() {
  return app.state.dailyRoutines.logs.filter((log) => isLive(log));
}

function row(day, status, extra = {}) {
  return {
    id: extra.id || `log-${day}-${status}`,
    itemId: extra.itemId == null ? "item-a" : extra.itemId,
    compoundId: extra.compoundId || null,
    day,
    status,
    amount: Object.prototype.hasOwnProperty.call(extra, "amount") ? extra.amount : null,
    unit: extra.unit || "",
    updatedAt: extra.updatedAt || 10,
    deletedAt: extra.deletedAt == null ? null : extra.deletedAt,
    rest: extra.rest === true,
  };
}

function logsFrom(marks) {
  const logs = [];
  marks.forEach((mark, index) => {
    const [day, name] = mark;
    const n = index + 1;
    if (name === "empty") return;
    if (name === "rest" || name === "rest-skip" || name === "tomb") {
      logs.push(row(day, name === "rest-skip" ? "skipped" : "done", {
        id: `rest-${day}-${n}`,
        itemId: null,
        rest: true,
        amount: null,
        updatedAt: 30 + n,
        deletedAt: name === "tomb" ? 80 : null,
      }));
      return;
    }
    const status = name === "skip" ? "skipped" : name === "partial" ? "partial" : "done";
    logs.push(row(day, status, { id: `log-${day}-${n}`, rest: false, updatedAt: 10 + n }));
  });
  return logs;
}

/* Independent of routineStreak. Rest pauses. Increment treats a rest as a
   counted day. Reset treats a rest as an empty day. An empty today does
   not stop the walk; an empty earlier day does. */
function oracle(marks, today, mode) {
  const kind = new Map();
  for (const [day, name] of marks) {
    if (name === "empty" || name === "tomb") continue;
    if (name === "rest" || name === "rest-skip") {
      if (kind.get(day) !== "count") kind.set(day, "rest");
    } else kind.set(day, "count");
  }
  let earliest = "";
  for (const day of kind.keys()) if (!earliest || day < earliest) earliest = day;
  if (!earliest || typeof today !== "string") return 0;
  let streak = 0;
  let cursor = today;
  let guard = 0;
  while (cursor && cursor >= earliest && guard < 4000) {
    let here = kind.get(cursor) || "empty";
    if (here === "rest" && mode === "increment") here = "count";
    if (here === "rest" && mode === "reset") here = "empty";
    if (here === "count") streak += 1;
    else if (here !== "rest" && cursor !== today) break;
    cursor = shiftRoutineDay(cursor, -1);
    guard += 1;
  }
  return streak;
}

const HAND = [
  {
    title: "rest between counts pauses and is not a skip or a miss",
    marks: [["2026-11-17", "done"], ["2026-11-18", "rest"], ["2026-11-19", "done"]],
    streak: 2,
    wrong: [3, 1, 0],
  },
  {
    title: "a full miss still resets",
    marks: [["2026-11-17", "done"], ["2026-11-19", "done"]],
    streak: 1,
    wrong: [2, 0, 3],
  },
  {
    title: "a skip still counts",
    marks: [["2026-11-17", "done"], ["2026-11-18", "skip"], ["2026-11-19", "done"]],
    streak: 3,
    wrong: [2, 1, 0],
  },
  {
    title: "an open today keeps the count through a rest",
    marks: [["2026-11-17", "done"], ["2026-11-18", "rest"]],
    streak: 1,
    wrong: [2, 0],
  },
  {
    title: "an open today does not cross a miss",
    marks: [["2026-11-17", "done"]],
    streak: 0,
    wrong: [1, 2],
  },
  {
    title: "rest today does not increment",
    marks: [["2026-11-18", "done"], ["2026-11-19", "rest"]],
    streak: 1,
    wrong: [2, 0],
  },
  {
    title: "rest today does not reset the days before it",
    marks: [["2026-11-17", "done"], ["2026-11-18", "done"], ["2026-11-19", "rest"]],
    streak: 2,
    wrong: [3, 1, 0],
  },
  {
    title: "a rest with no earlier count stays at zero",
    marks: [["2026-11-19", "rest"]],
    streak: 0,
    wrong: [1],
  },
  {
    title: "rest does not bridge a miss",
    marks: [["2026-11-17", "done"], ["2026-11-19", "rest"]],
    streak: 0,
    wrong: [1, 2],
  },
  {
    title: "several rest days add nothing",
    marks: [["2026-11-16", "done"], ["2026-11-17", "rest"], ["2026-11-18", "rest"], ["2026-11-19", "done"]],
    streak: 2,
    wrong: [4, 3, 1, 0],
  },
  {
    title: "a skip and a partial still count around a rest",
    marks: [["2026-11-17", "skip"], ["2026-11-18", "rest"], ["2026-11-19", "partial"]],
    streak: 2,
    wrong: [3, 1, 0],
  },
  {
    title: "a done log on a rest day still counts, and the rest does not add a day",
    marks: [["2026-11-17", "done"], ["2026-11-18", "done"], ["2026-11-18", "rest"], ["2026-11-19", "done"]],
    streak: 3,
    wrong: [4, 2, 1, 0],
  },
  {
    title: "a rest row stored as skipped is not a skip",
    marks: [["2026-11-17", "done"], ["2026-11-18", "rest-skip"], ["2026-11-19", "done"]],
    streak: 2,
    wrong: [3, 1, 0],
  },
  {
    title: "two rest rows still cover one day",
    marks: [["2026-11-17", "done"], ["2026-11-18", "rest"], ["2026-11-18", "rest"], ["2026-11-19", "done"]],
    streak: 2,
    wrong: [4, 3, 1, 0],
  },
  {
    title: "a tombstoned rest is a miss",
    marks: [["2026-11-17", "done"], ["2026-11-18", "tomb"], ["2026-11-19", "done"]],
    streak: 1,
    wrong: [2, 3, 0],
  },
  {
    title: "a partial yesterday pauses on rest today",
    marks: [["2026-11-18", "partial"], ["2026-11-19", "rest"]],
    streak: 1,
    wrong: [2, 0],
  },
  {
    title: "a future rest does not change today",
    marks: [["2026-11-19", "done"], ["2026-11-20", "rest"]],
    streak: 1,
    wrong: [2, 0],
  },
];

function sweepMarks() {
  const days = [4, 3, 2, 1, 0].map((steps) => {
    let day = TODAY;
    for (let i = 0; i < steps; i += 1) day = shiftRoutineDay(day, -1);
    return day;
  });
  const kinds = ["empty", "done", "skip", "rest"];
  const total = kinds.length ** days.length;
  const cases = [];
  for (let n = 0; n < total; n += 1) {
    let value = n;
    const marks = days.map((day) => {
      const name = kinds[value % kinds.length];
      value = Math.floor(value / kinds.length);
      return [day, name];
    });
    cases.push(marks);
  }
  return cases;
}

describe("whole-day rest", { concurrency: false }, () => {
  test("rest pauses the streak and the wrong rules do not match", () => {
    assert.equal(routineStreak([], TODAY), 0);
    assert.equal(routineStreak(null, TODAY), 0);
    assert.equal(routineStreak([row(TODAY, "done", { rest: true, itemId: null })], "not-a-day"), 0);
    for (const spec of HAND) {
      const logs = logsFrom(spec.marks);
      const actual = routineStreak(logs, TODAY);
      assert.equal(oracle(spec.marks, TODAY, "pause"), spec.streak, `oracle ${spec.title}`);
      assert.equal(actual, spec.streak, spec.title);
      for (const value of spec.wrong) assert.notEqual(actual, value, `${spec.title} must not be ${value}`);
      const incremented = oracle(spec.marks, TODAY, "increment");
      const reset = oracle(spec.marks, TODAY, "reset");
      if (incremented !== spec.streak) assert.notEqual(actual, incremented, `${spec.title} must not increment`);
      if (reset !== spec.streak) assert.notEqual(actual, reset, `${spec.title} must not reset`);
    }
  });

  test("a sweep of rest, skip, done, and empty days kills increment and reset", () => {
    let incrementKills = 0;
    let resetKills = 0;
    for (const marks of sweepMarks()) {
      const actual = routineStreak(logsFrom(marks), TODAY);
      const paused = oracle(marks, TODAY, "pause");
      const incremented = oracle(marks, TODAY, "increment");
      const reset = oracle(marks, TODAY, "reset");
      assert.equal(actual, paused, marks.map((mark) => mark.join(" ")).join(", "));
      if (incremented !== paused) {
        assert.notEqual(actual, incremented);
        incrementKills += 1;
      }
      if (reset !== paused) {
        assert.notEqual(actual, reset);
        resetKills += 1;
      }
    }
    assert.ok(incrementKills > 0);
    assert.ok(resetKills > 0);
  });

  test("one live rest covers the day", () => {
    const logs = [
      row(TODAY, "done", { id: "older", itemId: null, rest: true, updatedAt: 4 }),
      row(TODAY, "skipped", { id: "newer", itemId: "item-a", rest: true, updatedAt: 9, amount: 250 }),
      row(TODAY, "done", { id: "gone", itemId: null, rest: true, updatedAt: 20, deletedAt: 21 }),
      row("2026-11-18", "done", { id: "other-day", itemId: null, rest: true, updatedAt: 30 }),
    ];
    assert.equal(routineRestLog(logs, TODAY).id, "newer");
    assert.equal(routineRestLog(logs, "2026-11-18").id, "other-day");
    assert.equal(routineRestLog(logs, "2026-11-17"), null);
    assert.equal(routineRestLog(logs, "bad"), null);
    const tied = [
      row(TODAY, "done", { id: "b", itemId: null, rest: true, updatedAt: 5 }),
      row(TODAY, "done", { id: "a", itemId: null, rest: true, updatedAt: 5 }),
    ];
    assert.equal(routineRestLog(tied, TODAY).id, "a");
    assert.equal(routineStreak(logs, TODAY), 0);
  });

  test("one rest covers the day, and undo removes only that row", () => {
    signIn();
    const morning = blockId("Morning routine");
    const night = blockId("Night routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" }), true);
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound B", kind: "dose", amount: 1, unit: "mg" }), true);
    assert.equal(addRoutineItem(app.state, night, { name: "Example Check", kind: "check" }), true);
    const item = itemNamed("Example Compound A");
    app.state.dailyRoutines.logs.push(
      row("2026-11-17", "done", { id: "past-17", itemId: item.id, updatedAt: 1 }),
      row("2026-11-18", "done", { id: "past-18", itemId: item.id, updatedAt: 2 }),
    );
    let html = dailyRoutinesHTML();
    assert.match(html, /data-rest-day="false"/);
    assert.match(html, /data-action="routines-rest"/);
    assert.match(html, />Log rest</);
    assert.match(html, /data-streak="2"/);
    assert.equal(logRoutineRest(app.state), true);
    assert.equal(logRoutineRest(app.state), false);
    const rests = liveLogs().filter((log) => log.rest === true);
    assert.equal(rests.length, 1);
    const rest = rests[0];
    assert.equal(rest.itemId, null);
    assert.equal(rest.compoundId, null);
    assert.equal(rest.day, TODAY);
    assert.equal(rest.status, "done");
    assert.notEqual(rest.status, "skipped");
    assert.equal(rest.amount, null);
    assert.equal(rest.unit, "");
    assert.equal(rest.deletedAt, null);
    assert.equal(routineRestLog(app.state.dailyRoutines.logs, TODAY).id, rest.id);
    assert.equal(routineStreak(app.state.dailyRoutines.logs, TODAY), 2);
    assert.notEqual(routineStreak(app.state.dailyRoutines.logs, TODAY), 3);
    assert.notEqual(routineStreak(app.state.dailyRoutines.logs, TODAY), 0);
    html = dailyRoutinesHTML();
    assert.match(html, /data-rest-day="true"/);
    assert.match(html, /data-streak="2"/);
    assert.match(html, /dr-streak-mark/);
    assert.match(html, /Rest logged/);
    assert.match(html, new RegExp(`data-log-id="${rest.id}"`));
    assert.doesNotMatch(html, /data-action="routines-log-all"/);
    assert.doesNotMatch(html, /enjoy|nice rest|rest day|good job|keep it up/i);
    const before = app.state.dailyRoutines.logs.length;
    assert.equal(logAllRoutineBlock(app.state, morning), false);
    assert.equal(logAllRoutineBlock(app.state, night), false);
    assert.equal(app.state.dailyRoutines.logs.length, before);
    assert.equal(logRoutineItem(app.state, item.id), true);
    assert.equal(routineStreak(app.state.dailyRoutines.logs, TODAY), 3);
    assert.notEqual(routineStreak(app.state.dailyRoutines.logs, TODAY), 4);
    const remote = structuredClone(app.state.dailyRoutines);
    assert.equal(undoRoutineLog(app.state, rest.id), true);
    const tomb = app.state.dailyRoutines.logs.find((log) => log.id === rest.id);
    assert.equal(isLive(tomb), false);
    assert.ok(tomb.deletedAt > rest.updatedAt);
    assert.equal(tomb.rest, true);
    assert.equal(routineRestLog(app.state.dailyRoutines.logs, TODAY), null);
    assert.equal(routineStreak(app.state.dailyRoutines.logs, TODAY), 3);
    assert.notEqual(routineStreak(app.state.dailyRoutines.logs, TODAY), 2);
    const merged = mergeDailyRoutines(app.state.dailyRoutines, remote);
    assert.equal(isLive(merged.logs.find((log) => log.id === rest.id)), false);
    html = dailyRoutinesHTML();
    assert.match(html, /data-rest-day="false"/);
    assert.match(html, /data-action="routines-log-all"/);
    assert.match(html, /data-streak="3"/);
    const ids = logAllRoutineBlock(app.state, morning);
    assert.deepEqual(ids.map((id) => app.state.dailyRoutines.logs.find((log) => log.id === id).itemId), [itemNamed("Example Compound B").id]);
    assert.ok(ids.every((id) => id !== rest.id));
    assert.equal(restoreRoutineLog(app.state, rest.id), true);
    assert.equal(routineRestLog(app.state.dailyRoutines.logs, TODAY).id, rest.id);
    assert.equal(routineStreak(app.state.dailyRoutines.logs, TODAY), 3);
    assert.notEqual(routineStreak(app.state.dailyRoutines.logs, TODAY), 4);
    assert.equal(logAllRoutineBlock(app.state, night), false);
    assert.equal(liveLogs().filter((log) => log.rest === true).length, 1);
  });

  test("undo of a past rest removes the pause and leaves a miss", () => {
    signIn();
    const morning = blockId("Morning routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" }), true);
    const item = itemNamed("Example Compound A");
    app.state.dailyRoutines.logs.push(
      row("2026-11-17", "done", { id: "past-17", itemId: item.id, updatedAt: 1 }),
      row("2026-11-18", "skipped", { id: "rest_2026-11-18", itemId: null, rest: true, amount: 40, updatedAt: 2 }),
    );
    assert.equal(logRoutineItem(app.state, item.id), true);
    assert.equal(routineStreak(app.state.dailyRoutines.logs, TODAY), 2);
    assert.notEqual(routineStreak(app.state.dailyRoutines.logs, TODAY), 3);
    assert.equal(undoRoutineLog(app.state, "rest_2026-11-18"), true);
    assert.equal(isLive(app.state.dailyRoutines.logs.find((log) => log.id === "rest_2026-11-18")), false);
    assert.equal(routineStreak(app.state.dailyRoutines.logs, TODAY), 1);
    assert.equal(restoreRoutineLog(app.state, "rest_2026-11-18"), true);
    assert.equal(routineStreak(app.state.dailyRoutines.logs, TODAY), 2);
    assert.equal(skipRoutineItem(app.state, item.id), false);
  });

  test("the flag and the shell cache stay where the integrator left them", () => {
    const page = readFileSync(new URL("../logger/js/pages/daily-routines.js", import.meta.url), "utf8");
    const flag = readFileSync(new URL("../logger/js/shared/routines-flag.js", import.meta.url), "utf8");
    const sw = readFileSync(new URL("../logger/sw.js", import.meta.url), "utf8");
    const sentry = readFileSync(new URL("../logger/js/sentry.js", import.meta.url), "utf8");
    assert.doesNotMatch(page, /routines-flag/);
    assert.match(flag, /ROUTINES_ENABLED = true/);
    assert.equal(flag.match(/ROUTINES_ENABLED = true/g).length, 1);
    assert.match(sw, /const CACHE = "insight-shell-v89"/);
    assert.match(sentry, /insight-shell-v89/);
  });
});
