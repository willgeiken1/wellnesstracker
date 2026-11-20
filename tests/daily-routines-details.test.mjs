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
  lastDoseLabel,
  logRoutineItem,
  logRoutineRest,
  parseRoutineTime,
  routineClockTime,
  routineRestLog,
  toggleRoutineReveal,
} = await import("../logger/js/pages/daily-routines.js");
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
const { commitRoutineLogSheet, openRoutineLogEditor, routineLogSheetHTML } = await import("../logger/js/pages/daily-routines-dose.js");
const { normalizeDailyRoutines } = await import("../logger/js/shared/daily-routines-store.js");
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

function liveLog(itemId) {
  return app.state.dailyRoutines.logs.find((row) => row.itemId === itemId && !(row.deletedAt > 0));
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
    assert.equal(routineDetailsHeld(), false);
    t.mock.timers.tick(500);
    assert.equal(app.ui.sheet, null);

    assert.equal(pressRoutineDetails({ pointerId: 3, x: 8, y: 8, itemId: item.id, logId: log.id }), true);
    t.mock.timers.tick(500);
    assert.equal(app.ui.sheet, "routines-details");
    assert.equal(app.eatClick, true);
    assert.equal(releaseRoutineDetails(3), false);
    assert.equal(app.ui.sheet, "routines-details");
    assert.equal(closeRoutineDetails("back"), false);
    assert.equal(app.ui.sheet, "routines-details");
    assert.equal(closeRoutineDetails("x"), true);
    assert.equal(app.ui.sheet, null);
    assert.equal(app.state.dailyRoutines.logs.length, logsBefore);
  });

  test("edit mode keeps long-press rename and does not open details", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    t.after(() => t.mock.timers.reset());
    signIn();
    const morning = blockId("Morning routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" }), true);
    const item = itemNamed("Example Compound A");
    app.ui.dailyRoutineEdit = true;
    const html = dailyRoutinesHTML();
    assert.match(html, /data-rename="item"/);
    assert.doesNotMatch(html, /data-details="row"/);
    assert.equal(pressRoutineDetails({ pointerId: 4, x: 0, y: 0, itemId: item.id }), false);
    t.mock.timers.tick(500);
    assert.equal(app.ui.sheet, null);
    assert.equal(app.eatClick, false);

    const edit = readFileSync(new URL("../logger/js/pages/daily-routines-edit.js", import.meta.url), "utf8");
    const down = edit.slice(edit.indexOf("function onDown"), edit.indexOf("function downInEdit"));
    const gate = down.indexOf('target.dataset.rename === "item"');
    const prompt = down.indexOf("promptRoutineRename");
    assert.ok(gate > down.indexOf('closest("[data-rename]")'));
    assert.ok(prompt > gate);
    assert.match(down, /app\.eatClick = true/);
    assert.match(edit, /dailyRoutineEdit === true/);
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
      const item = itemNamed("Example Compound A");
      assert.equal(openRoutineDetails(item.id), true);
      assert.equal(app.ui.sd.motion, "reduce");
      assert.match(routineDetailsSheetHTML(), /data-motion="reduce"/);
    } finally {
      if (previous) globalThis.matchMedia = previous;
      else delete globalThis.matchMedia;
    }
    const css = readFileSync(new URL("../logger/css/routines.css", import.meta.url), "utf8");
    const full = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: no-preference)"));
    assert.match(full, /@keyframes dr-details-in/);
    assert.match(full, /#sheet\[data-routines-details="open"\] \.sheet-card\.dr-details/);
    const reduce = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    assert.match(reduce, /#sheet\[data-routines-details="open"\] \.sheet-card\.dr-details \{ animation: none; \}/);
  });

  test("backdating can set the time, a same-day edit leaves it, and a future day is refused", () => {
    signIn();
    const morning = blockId("Morning routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" }), true);
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound B", kind: "dose", amount: 1, unit: "mg" }), true);
    const item = itemNamed("Example Compound A");
    const other = itemNamed("Example Compound B");
    assert.equal(logRoutineItem(app.state, item.id), true);
    assert.equal(logRoutineItem(app.state, other.id), true);
    const log = liveLog(item.id);
    const originalAt = log.at;
    assert.equal(editRoutineLog(app.state, log.id, { amount: 250, day: "2026-11-19", time: "01:00" }), true);
    assert.equal(liveLog(item.id).at, originalAt);
    assert.equal(liveLog(item.id).day, "2026-11-19");

    assert.equal(editRoutineLog(app.state, log.id, { amount: "0.25", day: "2026-11-18", time: "15:05" }), true);
    const moved = app.state.dailyRoutines.logs.find((row) => row.id === log.id);
    assert.equal(moved.day, "2026-11-18");
    assert.equal(moved.amount, 0.25);
    assert.equal(routineClockTime(moved.at), "15:05");
    assert.equal(lastDoseLabel(moved), "last: 3:05 PM");
    assert.equal(parseRoutineTime("8:02").hour, 8);

    assert.equal(editRoutineLog(app.state, log.id, { amount: 250, day: "2026-11-20", time: "08:00" }), false);
    assert.equal(app.state.dailyRoutines.logs.find((row) => row.id === log.id).day, "2026-11-18");
    assert.equal(editRoutineLog(app.state, log.id, { amount: "0.25", day: "2026-02-31", time: "08:00" }), false);
    assert.equal(editRoutineLog(app.state, log.id, { amount: "", day: "2026-11-17", time: "08:00" }), false);
    assert.equal(editRoutineLog(app.state, log.id, { amount: "-1", day: "2026-11-17", time: "08:00" }), false);
    assert.equal(editRoutineLog(app.state, log.id, { amount: "0.25", day: "2026-11-17", time: "25:00" }), false);
    assert.equal(app.state.dailyRoutines.logs.find((row) => row.id === log.id).day, "2026-11-18");
    assert.equal(routineClockTime(app.state.dailyRoutines.logs.find((row) => row.id === log.id).at), "15:05");

    const kept = moved.at;
    assert.equal(editRoutineLog(app.state, log.id, { amount: "0.25", day: "2026-11-17", time: "   " }), true);
    const earlier = app.state.dailyRoutines.logs.find((row) => row.id === log.id);
    assert.equal(earlier.day, "2026-11-17");
    assert.equal(earlier.at, kept);

    const otherLog = liveLog(other.id);
    assert.equal(editRoutineLog(app.state, otherLog.id, { amount: 1, day: "2026-11-18", time: "09:00" }), true);
    assert.equal(logRoutineItem(app.state, other.id), true);
    const second = app.state.dailyRoutines.logs.find((row) => row.itemId === other.id && row.day === "2026-11-19" && !(row.deletedAt > 0));
    assert.equal(editRoutineLog(app.state, second.id, { amount: 1, day: "2026-11-18", time: "10:00" }), false);
    assert.equal(second.day, "2026-11-19");

    assert.equal(logRoutineRest(app.state), true);
    const rest = routineRestLog(app.state.dailyRoutines.logs, "2026-11-19");
    assert.equal(editRoutineLog(app.state, rest.id, { amount: 1, day: "2026-11-16", time: "08:00", note: SENTINEL }), false);
    assert.equal(openRoutineDetails(item.id, rest.id), false);
    assert.equal(rest.note, undefined);
  });

  test("a note is optional, stays off the day list, and adds no feeling fields", () => {
    signIn();
    const morning = blockId("Morning routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" }), true);
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Check", kind: "check" }), true);
    const item = itemNamed("Example Compound A");
    const check = itemNamed("Example Check");
    assert.equal(openRoutineDetails(item.id), true);
    const before = routineDetailsSheetHTML();
    assert.match(before, /Log this dose with a tap/);
    assert.doesNotMatch(before, /dr-details-note|data-action="routines-details-save"|mood|energy|stress|feeling/);
    assert.match(before, /How you felt/);
    assert.match(before, /stays open until you tap the X/);
    assert.equal(app.state.dailyRoutines.logs.length, 0);
    closeRoutineDetails("x");

    assert.equal(logRoutineItem(app.state, item.id), true);
    const log = liveLog(item.id);
    assert.equal(editRoutineLog(app.state, log.id, { amount: 250, day: "2026-11-19" }), true);
    assert.equal(liveLog(item.id).note, undefined);

    const long = `${"q".repeat(500)}TRAILING`;
    assert.equal(editRoutineLog(app.state, log.id, {
      amount: 250,
      day: "2026-11-19",
      note: `  ${SENTINEL}  `,
      mood: 4,
      energy: 3,
      stress: 2,
      feeling: "low",
    }), true);
    assert.equal(liveLog(item.id).note, SENTINEL);
    assert.equal(liveLog(item.id).mood, undefined);
    assert.equal(liveLog(item.id).energy, undefined);
    assert.equal(liveLog(item.id).stress, undefined);
    assert.equal(liveLog(item.id).feeling, undefined);
    assert.equal(editRoutineLog(app.state, log.id, { amount: 250, day: "2026-11-19", note: 12 }), false);
    assert.equal(liveLog(item.id).note, SENTINEL);
    assert.equal(editRoutineLog(app.state, log.id, { amount: 250, day: "2026-11-19", note: long }), true);
    assert.equal(liveLog(item.id).note.length, 500);
    assert.equal(editRoutineLog(app.state, log.id, { amount: 250, day: "2026-11-19", note: "" }), true);
    assert.equal(liveLog(item.id).note, undefined);
    assert.equal(editRoutineLog(app.state, log.id, { amount: 250, day: "2026-11-19", note: SENTINEL }), true);

    assert.equal(toggleRoutineReveal(app.state, morning), true);
    const page = dailyRoutinesHTML();
    assert.match(page, /data-details="row"/);
    assert.match(page, new RegExp(`data-log-id="${log.id}"`));
    assert.match(page, /data-action="routines-log"/);
    assert.doesNotMatch(page, new RegExp(SENTINEL));

    assert.equal(openRoutineDetails(item.id, log.id), true);
    const sheet = routineDetailsSheetHTML();
    assert.match(sheet, /id="dr-details-time-wrap" hidden/);
    assert.match(sheet, /id="dr-details-note"/);
    assert.match(sheet, new RegExp(SENTINEL));
    assert.match(sheet, /data-action="routines-checkin"/);
    assert.doesNotMatch(sheet, /mood|energy|stress|feeling/);
    app.ui.sd.day = "2026-11-18";
    assert.doesNotMatch(routineDetailsSheetHTML(), /id="dr-details-time-wrap" hidden/);

    assert.equal(openRoutineDetails(check.id), true);
    const checkSheet = routineDetailsSheetHTML();
    assert.match(checkSheet, /This is a check/);
    assert.doesNotMatch(checkSheet, /dr-details-note|mood|energy|stress|feeling/);

    const stored = normalizeDailyRoutines(structuredClone(app.state.dailyRoutines));
    const withFeeling = normalizeDailyRoutines({
      ...stored,
      logs: stored.logs.map((row) => row.id === log.id ? { ...row, note: `  ${SENTINEL}  `, mood: 1, energy: 2, stress: 3, feeling: "low", felt: "low" } : row),
    });
    const kept = withFeeling.logs.find((row) => row.id === log.id);
    assert.equal(kept.note, SENTINEL);
    assert.equal(kept.mood, undefined);
    assert.equal(kept.energy, undefined);
    assert.equal(kept.stress, undefined);
    assert.equal(kept.feeling, undefined);
    assert.equal(kept.felt, undefined);
  });

  test("saving from the details page writes the note and the backdated time", () => {
    signIn();
    const morning = blockId("Morning routine");
    addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" });
    const item = itemNamed("Example Compound A");
    assert.equal(logRoutineItem(app.state, item.id), true);
    const log = liveLog(item.id);
    const originalAt = log.at;
    const captures = [];
    const fetches = [];
    const saves = [];
    app.capture = (...args) => captures.push(args);
    app.save = () => saves.push("save");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (...args) => { fetches.push(args); return Promise.resolve({ ok: true }); };
    try {
      assert.equal(openRoutineDetails(item.id, log.id), true);
      app.$ = (sel) => {
        const id = String(sel).replace(/^#/, "");
        const values = {
          "dr-details-amount": "250",
          "dr-details-day": "2026-11-19",
          "dr-details-time": "01:00",
          "dr-details-note": SENTINEL,
        };
        return Object.prototype.hasOwnProperty.call(values, id) ? { value: values[id] } : null;
      };
      assert.equal(commitRoutineDetails(), true);
      assert.equal(liveLog(item.id).at, originalAt);
      assert.equal(liveLog(item.id).note, SENTINEL);
      assert.equal(app.ui.routineAnnounce, "Log updated.");
      assert.doesNotMatch(app.ui.routineAnnounce, /qq4419|scribble/);
      assert.equal(app.ui.sheet, null);

      assert.equal(openRoutineDetails(item.id, log.id), true);
      app.$ = (sel) => {
        const id = String(sel).replace(/^#/, "");
        const values = {
          "dr-details-amount": "0.25",
          "dr-details-day": "2026-11-18",
          "dr-details-time": "08:02",
          "dr-details-note": SENTINEL,
        };
        return Object.prototype.hasOwnProperty.call(values, id) ? { value: values[id] } : null;
      };
      assert.equal(commitRoutineDetails(), true);
      const moved = app.state.dailyRoutines.logs.find((row) => row.id === log.id);
      assert.equal(moved.day, "2026-11-18");
      assert.equal(moved.amount, 0.25);
      assert.equal(routineClockTime(moved.at), "08:02");
      assert.equal(lastDoseLabel(moved), "last: 8:02 AM");
      assert.equal(moved.note, SENTINEL);
      assert.equal(moved.mood, undefined);

      assert.equal(openRoutineLogEditor(log.id), true);
      const oldSheet = routineLogSheetHTML();
      assert.doesNotMatch(oldSheet, new RegExp(SENTINEL));
      app.$ = () => null;
      assert.equal(commitRoutineLogSheet(), true);
      assert.equal(app.state.dailyRoutines.logs.find((row) => row.id === log.id).note, SENTINEL);

      assert.equal(openRoutineDetails(item.id, log.id), true);
      app.$ = (sel) => {
        const id = String(sel).replace(/^#/, "");
        const values = { "dr-details-amount": "0.25", "dr-details-day": "2026-11-20", "dr-details-time": "08:02", "dr-details-note": "other text" };
        return Object.prototype.hasOwnProperty.call(values, id) ? { value: values[id] } : null;
      };
      assert.equal(commitRoutineDetails(), false);
      assert.equal(app.ui.sheet, "routines-details");
      assert.match(app.ui.sd.error, /day up to today/);
      assert.equal(app.state.dailyRoutines.logs.find((row) => row.id === log.id).day, "2026-11-18");
      assert.equal(app.state.dailyRoutines.logs.find((row) => row.id === log.id).note, SENTINEL);
    } finally {
      globalThis.fetch = originalFetch;
    }
    assert.equal(captures.length, 0);
    assert.equal(fetches.length, 0);
    assert.ok(saves.length >= 1);
  });

  test("how you felt opens the check-in and does not store a feeling on the dose", () => {
    signIn();
    const morning = blockId("Morning routine");
    addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" });
    const item = itemNamed("Example Compound A");
    assert.equal(logRoutineItem(app.state, item.id), true);
    assert.equal(editRoutineLog(app.state, liveLog(item.id).id, { amount: 250, day: "2026-11-19", note: SENTINEL }), true);
    const before = JSON.stringify(app.state.dailyRoutines);
    let opened = 0;
    app.openCheckin = () => {
      opened += 1;
      app.ui.sheet = "checkin";
      app.ui.sd = { mood: 2, energy: 2, stress: 2, note: "check-in note" };
    };
    assert.equal(openRoutineCheckin(), true);
    assert.equal(opened, 1);
    assert.equal(app.ui.sheet, "checkin");
    assert.equal(JSON.stringify(app.state.dailyRoutines), before);
    assert.equal(liveLog(item.id).mood, undefined);
    assert.equal(app.state.checkins, null);
  });

  test("a dose note does not reach PostHog, Sentry, or a routines network call", () => {
    const event = sanitizePosthogEvent({
      event: "tab_viewed",
      properties: {
        tab: "home",
        note: SENTINEL,
        routineNote: SENTINEL,
        dailyRoutines: { logs: [{ note: SENTINEL, amount: 250 }] },
      },
      $set: { note: SENTINEL },
      $set_once: { routineNote: SENTINEL },
    });
    assert.equal(event.event, "tab_viewed");
    assert.equal(event.properties.tab, "home");
    assert.equal(JSON.stringify(event).includes(SENTINEL), false);
    assert.equal(JSON.stringify(sanitizeCapture("tab_viewed", { tab: "home", note: SENTINEL, routineNote: SENTINEL })).includes(SENTINEL), false);

    const scrubbed = scrubEvent({
      message: SENTINEL,
      extra: { note: SENTINEL, routineNote: SENTINEL, dailyRoutines: { note: SENTINEL } },
      request: { url: `https://example.invalid/routines?note=${SENTINEL}` },
      exception: { values: [{ type: "Error", value: SENTINEL, mechanism: { type: "generic", handled: true, data: { note: SENTINEL } } }] },
      breadcrumbs: [{ category: "console", message: SENTINEL, data: { note: SENTINEL } }],
    });
    assert.equal(JSON.stringify(scrubbed).includes(SENTINEL), false);
    assert.equal(JSON.stringify(scrubBreadcrumb({ category: "ui.click", message: SENTINEL, data: { note: SENTINEL } })).includes(SENTINEL), false);

    const details = readFileSync(new URL("../logger/js/pages/daily-routines-details.js", import.meta.url), "utf8");
    const page = readFileSync(new URL("../logger/js/pages/daily-routines.js", import.meta.url), "utf8");
    const cloud = readFileSync(new URL("../logger/js/shared/cloud.js", import.meta.url), "utf8");
    for (const src of [details, page]) {
      assert.doesNotMatch(src, /\bfetch\s*\(/);
      assert.doesNotMatch(src, /XMLHttpRequest/);
      assert.doesNotMatch(src, /sendBeacon/);
      assert.doesNotMatch(src, /posthog/i);
      assert.doesNotMatch(src, /Sentry/);
      assert.doesNotMatch(src, /capture\(/);
      assert.doesNotMatch(src, /routines-flag/);
    }
    assert.match(cloud, /dailyRoutines: app\.state\.dailyRoutines/);
    assert.doesNotMatch(page, /addEventListener\(\s*["']pointer/);

    const flag = readFileSync(new URL("../logger/js/shared/routines-flag.js", import.meta.url), "utf8");
    const sw = readFileSync(new URL("../logger/sw.js", import.meta.url), "utf8");
    const sentry = readFileSync(new URL("../logger/js/sentry.js", import.meta.url), "utf8");
    const actions = readFileSync(new URL("../logger/js/shell/actions.js", import.meta.url), "utf8");
    assert.match(flag, /ROUTINES_ENABLED = false/);
    assert.match(sw, /const CACHE = "insight-shell-v59"/);
    assert.match(sw, /daily-routines-details\.js/);
    assert.match(sentry, /insight-shell-v59/);
    const closeCase = actions.slice(actions.indexOf('case "sheet-close"'), actions.indexOf('case "start"'));
    assert.match(closeCase, /routines-details/);
    assert.match(closeCase, /sheet-x/);
    assert.match(actions, /case "routines-checkin"/);
  });
});
