import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/* Synthetic routines only. The note sentinel is fake text, not a person
   and not a dose. It must not leave the phone except inside the account blob. */

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
  getElementById: () => null,
  createElement: () => el(),
};
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem(key) { return key === "insight-share-analytics" ? "1" : null; },
  setItem() {},
  removeItem() {},
};

const { app } = await import("../logger/js/runtime.js");
const {
  addRoutineItem,
  dailyRoutinesHTML,
  editRoutineLog,
  logRoutineItem,
  logRoutineRest,
  parseRoutineTime,
  routineClockTime,
  saveRoutineItem,
  toggleRoutineReveal,
  undoRoutineLog,
} = await import("../logger/js/pages/daily-routines.js");
const { routineLogId } = await import("../logger/js/shared/daily-routines-store.js");
const {
  closeRoutineDetails,
  commitRoutineDetails,
  detailsMotionMs,
  openRoutineCheckin,
  openRoutineDetails,
  prefersReducedMotion,
  pressRoutineDetails,
  releaseRoutineDetails,
  routineDetailsHeld,
  routineDetailsSheetHTML,
  ROUTINE_DETAILS_HOLD_MS,
  ROUTINE_DETAILS_MOTION_MS,
  moveRoutineDetails,
} = await import("../logger/js/pages/daily-routines-details.js");
const { openRoutineHistory, routineHistorySheetHTML } = await import("../logger/js/pages/daily-routines-dose.js");
const { sanitizeCapture, sanitizePosthogEvent } = await import("../logger/js/usage-events.js");
const { scrubBreadcrumb, scrubEvent } = await import("../logger/js/sentry-scrub.js");

const SENTINEL = "qq4419-scribble-text";

function pin(day) {
  app.today = () => day;
  app.routineNow = () => new Date(2026, 10, 19, 8, 30, 0);
}

function signIn(day = "2026-11-19") {
  app.ROUTINES_ENABLED = true;
  app.session = { user: { id: "synthetic-user" } };
  app.sb = null;
  app.cloudPullOk = true;
  app.state = { dailyRoutines: null, checkins: null, checkinDeleted: [] };
  app.ui = { sheet: null, sd: {}, dailyRoutineEdit: false, tab: "daily-routines" };
  app.save = () => {};
  app.render = () => {};
  app.renderSheet = () => {};
  app.$ = () => null;
  app.eatClick = false;
  app.capture = () => {};
  pin(day);
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

function liveLog(itemId, day = "2026-11-19") {
  return app.state.dailyRoutines.logs.find((row) => row.itemId === itemId && row.day === day && !(row.deletedAt > 0));
}

describe("routine details", { concurrency: false }, () => {
  test("a long press stays open after release and a short press does not", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    t.after(() => t.mock.timers.reset());
    signIn();
    const morning = blockId("Morning routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" }), true);
    const item = itemNamed("Example Compound A");
    assert.equal(logRoutineItem(app.state, item.id), true);
    const log = liveLog(item.id);
    const logsBefore = app.state.dailyRoutines.logs.length;

    assert.equal(ROUTINE_DETAILS_HOLD_MS, 500);
    assert.equal(pressRoutineDetails({ pointerId: 1, x: 4, y: 4, itemId: item.id, logId: log.id }), true);
    t.mock.timers.tick(499);
    assert.equal(app.ui.sheet, null);
    assert.equal(routineDetailsHeld(), true);
    assert.equal(releaseRoutineDetails(1), true);
    t.mock.timers.tick(1000);
    assert.equal(app.ui.sheet, null);
    assert.equal(app.eatClick, false);
    assert.equal(app.state.dailyRoutines.logs.length, logsBefore);

    assert.equal(pressRoutineDetails({ pointerId: 2, x: 8, y: 8, itemId: item.id, logId: log.id }), true);
    assert.equal(moveRoutineDetails({ pointerId: 2, x: 30, y: 8 }), true);
    t.mock.timers.tick(500);
    assert.equal(app.ui.sheet, null);

    assert.equal(pressRoutineDetails({ pointerId: 3, x: 8, y: 8, itemId: item.id, logId: log.id }), true);
    t.mock.timers.tick(500);
    assert.equal(app.ui.sheet, "routines-details");
    assert.equal(app.eatClick, true);
    assert.equal(releaseRoutineDetails(3), false);
    assert.equal(closeRoutineDetails("back"), false);
    assert.equal(app.ui.sheet, "routines-details");
    assert.equal(closeRoutineDetails("x"), true);
    assert.equal(app.ui.sheet, null);
  });

  test("edit mode keeps long-press rename and does not open details", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    t.after(() => t.mock.timers.reset());
    signIn();
    const morning = blockId("Morning routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" }), true);
    app.ui.dailyRoutineEdit = true;
    const html = dailyRoutinesHTML();
    assert.match(html, /data-rename="item"/);
    assert.doesNotMatch(html, /data-details="row"/);
    assert.equal(pressRoutineDetails({ pointerId: 4, x: 0, y: 0, itemId: itemNamed("Example Compound A").id }), false);
    t.mock.timers.tick(500);
    assert.equal(app.ui.sheet, null);
    const edit = readFileSync(new URL("../logger/js/pages/daily-routines-edit.js", import.meta.url), "utf8");
    const down = edit.slice(edit.indexOf("function onDown"), edit.indexOf("function downInEdit"));
    assert.ok(down.indexOf('target.dataset.rename === "item"') > down.indexOf('closest("[data-rename]")'));
    assert.ok(down.indexOf("promptRoutineRename") > down.indexOf('target.dataset.rename === "item"'));
  });

  test("reduce motion drops the details animation", () => {
    const previous = globalThis.matchMedia;
    globalThis.matchMedia = (query) => ({ matches: String(query).includes("reduce"), media: String(query) });
    try {
      assert.equal(prefersReducedMotion(), true);
      assert.equal(detailsMotionMs(true), 0);
      assert.equal(detailsMotionMs(false), ROUTINE_DETAILS_MOTION_MS);
      signIn();
      const morning = blockId("Morning routine");
      addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" });
      assert.equal(openRoutineDetails(itemNamed("Example Compound A").id), true);
      assert.equal(app.ui.sd.motion, "reduce");
    } finally {
      if (previous) globalThis.matchMedia = previous;
      else delete globalThis.matchMedia;
    }
    const css = readFileSync(new URL("../logger/css/routines.css", import.meta.url), "utf8");
    assert.match(css.slice(css.lastIndexOf("@media (prefers-reduced-motion: no-preference)")), /@keyframes dr-details-in/);
    assert.match(css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)")), /animation: none/);
  });

  test("backdating can set the time, a same-day edit leaves it, and a future day is refused", () => {
    signIn();
    const morning = blockId("Morning routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" }), true);
    const item = itemNamed("Example Compound A");
    assert.equal(logRoutineItem(app.state, item.id), true);
    const log = liveLog(item.id);
    const originalAt = log.at;
    assert.equal(editRoutineLog(app.state, log.id, { amount: 250, day: "2026-11-19", time: "01:00" }), true);
    assert.equal(liveLog(item.id).at, originalAt);
    assert.equal(liveLog(item.id).id, routineLogId(item.id, "2026-11-19"));

    assert.equal(editRoutineLog(app.state, log.id, { amount: "0.25", day: "2026-11-18", time: "15:05" }), true);
    const moved = liveLog(item.id, "2026-11-18");
    assert.equal(moved.id, routineLogId(item.id, "2026-11-18"));
    assert.equal(moved.amount, 0.25);
    assert.equal(routineClockTime(moved.at), "15:05");
    assert.equal(parseRoutineTime("8:02").hour, 8);
    const marker = app.state.dailyRoutines.logs.find((row) => row.id === log.id);
    assert.ok(marker.deletedAt > 0);
    assert.equal(marker.amount, undefined);
    assert.equal(marker.note, undefined);
    assert.equal(marker.undone, undefined);

    assert.equal(editRoutineLog(app.state, moved.id, { amount: 250, day: "2026-11-20", time: "08:00" }), false);
    assert.equal(editRoutineLog(app.state, moved.id, { amount: "0.25", day: "2026-11-17", time: "25:00" }), false);
    assert.equal(routineClockTime(liveLog(item.id, "2026-11-18").at), "15:05");

    assert.equal(logRoutineRest(app.state), true);
    const rest = app.state.dailyRoutines.logs.find((row) => row.rest === true && row.day === "2026-11-19" && !(row.deletedAt > 0));
    assert.equal(editRoutineLog(app.state, rest.id, { amount: 1, day: "2026-11-16", time: "08:00", note: SENTINEL }), false);
  });

  test("a note is optional, stays off the day list, and undo keeps it", () => {
    signIn();
    const morning = blockId("Morning routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" }), true);
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Check", kind: "check" }), true);
    const item = itemNamed("Example Compound A");
    const check = itemNamed("Example Check");
    assert.equal(openRoutineDetails(item.id), true);
    const before = routineDetailsSheetHTML();
    assert.match(before, /Log this dose with a tap/);
    assert.match(before, /How you felt/);
    assert.match(before, /stays open until you tap the X/);
    assert.doesNotMatch(before, /dr-details-note|mood|energy|stress|feeling/);
    closeRoutineDetails("x");

    assert.equal(logRoutineItem(app.state, item.id), true);
    const log = liveLog(item.id);
    assert.equal(editRoutineLog(app.state, log.id, {
      amount: 250, day: "2026-11-19", note: `  ${SENTINEL}  `, mood: 4, feeling: "low",
    }), true);
    assert.equal(liveLog(item.id).note, SENTINEL);
    assert.equal(liveLog(item.id).mood, undefined);
    assert.equal(editRoutineLog(app.state, log.id, { amount: 250, day: "2026-11-19", note: `${"q".repeat(280)}TRAILING` }), true);
    assert.equal(liveLog(item.id).note.length, 280);
    assert.equal(editRoutineLog(app.state, log.id, { amount: 250, day: "2026-11-19", note: SENTINEL }), true);
    assert.equal(undoRoutineLog(app.state, log.id), true);
    const undone = app.state.dailyRoutines.logs.find((row) => row.id === log.id);
    assert.equal(undone.undone, true);
    assert.equal(undone.note, SENTINEL);
    assert.equal(undone.amount, 250);
    assert.equal(undone.unit, "mcg");
    assert.equal(toggleRoutineReveal(app.state, morning), true);
    assert.doesNotMatch(dailyRoutinesHTML(), new RegExp(SENTINEL));
    assert.equal(openRoutineDetails(check.id), true);
    assert.match(routineDetailsSheetHTML(), /This is a check/);
    assert.doesNotMatch(routineDetailsSheetHTML(), /dr-details-note|mood|energy|stress|feeling/);
  });

  test("saving from the details page writes the note and the backdated time", () => {
    signIn();
    const morning = blockId("Morning routine");
    addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" });
    const item = itemNamed("Example Compound A");
    assert.equal(logRoutineItem(app.state, item.id), true);
    const log = liveLog(item.id);
    const originalAt = log.at;
    const fetches = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (...args) => { fetches.push(args); return Promise.resolve({ ok: true }); };
    try {
      assert.equal(openRoutineDetails(item.id, log.id), true);
      app.$ = (sel) => {
        const id = String(sel).replace(/^#/, "");
        const values = { "dr-details-amount": "250", "dr-details-day": "2026-11-19", "dr-details-time": "01:00", "dr-details-note": SENTINEL };
        return Object.prototype.hasOwnProperty.call(values, id) ? { value: values[id] } : null;
      };
      assert.equal(commitRoutineDetails(), true);
      assert.equal(liveLog(item.id).at, originalAt);
      assert.equal(liveLog(item.id).note, SENTINEL);
      assert.equal(app.ui.routineAnnounce, "Log updated.");
      assert.doesNotMatch(app.ui.routineAnnounce, /qq4419/);

      assert.equal(openRoutineDetails(item.id, log.id), true);
      app.$ = (sel) => {
        const id = String(sel).replace(/^#/, "");
        const values = { "dr-details-amount": "0.25", "dr-details-day": "2026-11-18", "dr-details-time": "08:02", "dr-details-note": SENTINEL };
        return Object.prototype.hasOwnProperty.call(values, id) ? { value: values[id] } : null;
      };
      assert.equal(commitRoutineDetails(), true);
      const moved = liveLog(item.id, "2026-11-18");
      assert.equal(moved.amount, 0.25);
      assert.equal(routineClockTime(moved.at), "08:02");
      assert.equal(moved.note, SENTINEL);
    } finally {
      globalThis.fetch = originalFetch;
    }
    assert.equal(fetches.length, 0);
  });

  test("history opens the details page for a backdated log", () => {
    signIn();
    const morning = blockId("Morning routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" }), true);
    const item = itemNamed("Example Compound A");
    assert.equal(logRoutineItem(app.state, item.id), true);
    const log = liveLog(item.id);
    assert.equal(editRoutineLog(app.state, log.id, { amount: "0.25", day: "2026-11-18", time: "08:02", note: SENTINEL }), true);
    const moved = liveLog(item.id, "2026-11-18");
    assert.equal(openRoutineHistory(item.compoundId, item.id), true);
    const history = routineHistorySheetHTML();
    assert.match(history, new RegExp(`data-action="routines-details-open" data-item-id="${item.id}" data-log-id="${moved.id}"`));
    assert.equal(openRoutineDetails(item.id, moved.id), true);
    const sheet = routineDetailsSheetHTML();
    assert.match(sheet, new RegExp(SENTINEL));
    assert.doesNotMatch(sheet, /id="dr-details-time-wrap" hidden/);
    assert.match(sheet, /value="08:02"/);
  });

  test("a saved dose still opens its editor after the item becomes a check", () => {
    signIn();
    const morning = blockId("Morning routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" }), true);
    const item = itemNamed("Example Compound A");
    assert.equal(logRoutineItem(app.state, item.id), true);
    const log = liveLog(item.id);
    assert.equal(editRoutineLog(app.state, log.id, { amount: 250, day: "2026-11-19", note: SENTINEL }), true);
    assert.equal(saveRoutineItem(app.state, {
      itemId: item.id,
      name: "Example Compound A",
      kind: "check",
      blockId: morning,
      blockIds: [morning],
    }), true);
    assert.equal(app.state.dailyRoutines.items.find((row) => row.id === item.id).kind, "check");
    assert.equal(openRoutineDetails(item.id, log.id), true);
    assert.equal(app.ui.sd.kind, "dose");
    const sheet = routineDetailsSheetHTML();
    assert.match(sheet, /id="dr-details-note"/);
    assert.match(sheet, new RegExp(SENTINEL));
    assert.match(sheet, /data-action="routines-details-save"/);
    assert.doesNotMatch(sheet, /This is a check/);
  });

  test("how you felt opens the check-in and does not store a feeling on the dose", () => {
    signIn();
    const morning = blockId("Morning routine");
    addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" });
    const item = itemNamed("Example Compound A");
    assert.equal(logRoutineItem(app.state, item.id), true);
    assert.equal(editRoutineLog(app.state, liveLog(item.id).id, { amount: 250, day: "2026-11-19", note: SENTINEL }), true);
    const before = JSON.stringify(app.state.dailyRoutines);
    app.openCheckin = () => { app.ui.sheet = "checkin"; app.ui.sd = { mood: 2, note: "check-in note" }; };
    assert.equal(openRoutineCheckin(), true);
    assert.equal(app.ui.sheet, "checkin");
    assert.equal(JSON.stringify(app.state.dailyRoutines), before);
  });

  test("a dose note does not reach PostHog or Sentry", () => {
    const event = sanitizePosthogEvent({
      event: "tab_viewed",
      properties: { tab: "home", note: SENTINEL, routineNote: SENTINEL, dailyRoutines: { logs: [{ note: SENTINEL }] } },
      $set: { note: SENTINEL },
    });
    assert.equal(event.event, "tab_viewed");
    assert.equal(JSON.stringify(event).includes(SENTINEL), false);
    assert.equal(JSON.stringify(sanitizeCapture("tab_viewed", { tab: "home", note: SENTINEL })).includes(SENTINEL), false);
    const scrubbed = scrubEvent({
      message: SENTINEL,
      extra: { note: SENTINEL },
      exception: { values: [{ type: "Error", value: SENTINEL }] },
      breadcrumbs: [{ category: "console", message: SENTINEL }],
    });
    assert.equal(JSON.stringify(scrubbed).includes(SENTINEL), false);
    assert.equal(JSON.stringify(scrubBreadcrumb({ category: "ui.click", message: SENTINEL })).includes(SENTINEL), false);
    const sw = readFileSync(new URL("../logger/sw.js", import.meta.url), "utf8");
    const sentry = readFileSync(new URL("../logger/js/sentry.js", import.meta.url), "utf8");
    assert.match(sw, /const CACHE = "insight-shell-v75"/);
    assert.match(sentry, /insight-shell-v75/);
    assert.match(sw, /daily-routines-details\.js/);
  });
});
