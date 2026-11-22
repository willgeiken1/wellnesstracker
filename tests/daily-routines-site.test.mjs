import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/* Synthetic routines only. Site ids are the fixed list. They are not a
   person, a dose amount, or a real injection record. */

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
  toggleRoutineReveal,
  undoRoutineLog,
} = await import("../logger/js/pages/daily-routines.js");
const {
  commitRoutineDetails,
  dismissRoutineSiteWarning,
  openRoutineDetails,
  routineDetailsSheetHTML,
  setRoutineDetailsSite,
} = await import("../logger/js/pages/daily-routines-details.js");
const { commitRoutineLogSheet, openRoutineHistory, openRoutineLogEditor, routineHistorySheetHTML, routineLogSheetHTML } = await import("../logger/js/pages/daily-routines-dose.js");
const {
  lastRoutineSite,
  mergeDailyRoutines,
  normalizeDailyRoutines,
  ROUTINE_SITES,
} = await import("../logger/js/shared/daily-routines-store.js");
const { sanitizeCapture, sanitizePosthogEvent } = await import("../logger/js/usage-events.js");
const { scrubBreadcrumb, scrubEvent } = await import("../logger/js/sentry-scrub.js");

const SITE_LABELS = ROUTINE_SITES.map((site) => site.label);
const SENTINEL = "left-belly";

function pin(day) {
  app.today = () => day;
  app.routineNow = () => new Date(2026, 10, 19, 8, 30, 0);
}

function signIn(day = "2026-11-19") {
  app.ROUTINES_ENABLED = true;
  app.session = { user: { id: "synthetic-user" } };
  app.sb = null;
  app.cloudPullOk = true;
  app.state = { dailyRoutines: null };
  app.ui = { sheet: null, sd: {}, dailyRoutineEdit: false, tab: "daily-routines" };
  app.save = () => {};
  app.render = () => {};
  app.renderSheet = () => {};
  app.$ = () => null;
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

function liveLogs(itemId) {
  return app.state.dailyRoutines.logs.filter((row) => row.itemId === itemId && !(row.deletedAt > 0));
}

function logOn(itemId, day) {
  const log = liveLogs(itemId).find((row) => row.day === day);
  assert.ok(log, day);
  return log;
}

function dose(name, amount, unit) {
  const morning = blockId("Morning routine");
  assert.equal(addRoutineItem(app.state, morning, { name, kind: "dose", amount, unit }), true);
  return itemNamed(name);
}

function sheetHas(label) {
  return routineDetailsSheetHTML().includes(label);
}

describe("routine injection site", { concurrency: false }, () => {
  test("a dose can be logged and saved with no site", () => {
    signIn();
    const item = dose("Example Compound A", 250, "mcg");
    assert.equal(logRoutineItem(app.state, item.id), true);
    assert.equal(app.ui.sheet, null);
    const log = logOn(item.id, "2026-11-19");
    assert.equal(log.site, undefined);
    assert.equal(Object.prototype.hasOwnProperty.call(log, "site"), false);

    assert.equal(openRoutineDetails(item.id, log.id), true);
    const before = routineDetailsSheetHTML();
    assert.match(before, /Injection site, optional/);
    assert.match(before, /No site logged yet/);
    assert.match(before, /A site is optional/);
    assert.match(before, /aria-pressed="true">No site/);
    assert.doesNotMatch(before, /data-site-warn/);
    for (const site of ROUTINE_SITES) {
      assert.match(before, new RegExp(`data-site="${site.id}"`));
      assert.match(before, new RegExp(site.label));
    }
    assert.equal(commitRoutineDetails(), true);
    assert.equal(logOn(item.id, "2026-11-19").site, undefined);
    assert.equal(app.ui.routineAnnounce, "Log updated.");
  });

  test("the last site is shown the next time and stays on that item", () => {
    signIn();
    const item = dose("Example Compound A", 250, "mcg");
    const other = dose("Example Compound B", 1, "mg");
    assert.equal(logRoutineItem(app.state, item.id), true);
    assert.equal(editRoutineLog(app.state, logOn(item.id, "2026-11-19").id, { amount: 250, day: "2026-11-17", site: "right-arm" }), true);
    assert.equal(logRoutineItem(app.state, item.id), true);
    assert.equal(editRoutineLog(app.state, logOn(item.id, "2026-11-19").id, { amount: "0.25", day: "2026-11-18", site: "left-thigh" }), true);
    assert.equal(logOn(item.id, "2026-11-18").status, "partial");
    assert.equal(logRoutineItem(app.state, item.id), true);
    const today = logOn(item.id, "2026-11-19");
    assert.equal(today.site, undefined);
    assert.equal(lastRoutineSite(app.state.dailyRoutines, item.id, today.id), "left-thigh");

    assert.equal(openRoutineDetails(item.id, today.id), true);
    assert.match(routineDetailsSheetHTML(), /Last site: Left thigh/);
    assert.match(routineDetailsSheetHTML(), /data-last-site="left-thigh"/);
    assert.doesNotMatch(routineDetailsSheetHTML(), /data-site-warn/);
    assert.equal(app.ui.sd.site, "");

    assert.equal(logRoutineItem(app.state, other.id), true);
    assert.equal(editRoutineLog(app.state, logOn(other.id, "2026-11-19").id, { amount: 1, day: "2026-11-18", site: "right-glute" }), true);
    assert.equal(logRoutineItem(app.state, other.id), true);
    assert.equal(openRoutineDetails(other.id, logOn(other.id, "2026-11-19").id), true);
    assert.match(routineDetailsSheetHTML(), /Last site: Right glute/);
    assert.match(routineDetailsSheetHTML(), /data-last-site="right-glute"/);
    assert.doesNotMatch(routineDetailsSheetHTML(), /data-last-site="left-thigh"/);

    assert.equal(openRoutineDetails(item.id, logOn(item.id, "2026-11-18").id), true);
    assert.match(routineDetailsSheetHTML(), /Last site: Right arm/);
    assert.match(routineDetailsSheetHTML(), /data-site="left-thigh"[^>]*aria-pressed="true"|aria-pressed="true"[^>]*>Left thigh/);
  });

  test("picking the same site warns until dismissed, and a different site does not", () => {
    signIn();
    const item = dose("Example Compound A", 250, "mcg");
    assert.equal(logRoutineItem(app.state, item.id), true);
    const first = logOn(item.id, "2026-11-19");
    assert.equal(editRoutineLog(app.state, first.id, { amount: 250, day: "2026-11-18", site: "left-thigh" }), true);
    assert.equal(logRoutineItem(app.state, item.id), true);
    const today = logOn(item.id, "2026-11-19");
    const todayAt = today.at;
    assert.equal(openRoutineDetails(item.id, today.id), true);

    assert.equal(setRoutineDetailsSite("not-a-site"), false);
    assert.equal(app.ui.sd.site, "");
    assert.equal(setRoutineDetailsSite("left-thigh"), true);
    assert.match(routineDetailsSheetHTML(), /data-site-warn="same"/);
    assert.match(routineDetailsSheetHTML(), /Same site as last time/);
    assert.match(routineDetailsSheetHTML(), /You can dismiss this and still save/);
    assert.equal(sheetHas("Left thigh"), true);
    assert.equal(commitRoutineDetails(), false);
    assert.equal(app.ui.sheet, "routines-details");
    assert.equal(logOn(item.id, "2026-11-19").site, undefined);
    assert.equal(dismissRoutineSiteWarning(), true);
    assert.doesNotMatch(routineDetailsSheetHTML(), /data-site-warn/);
    assert.equal(commitRoutineDetails(), true);
    const saved = logOn(item.id, "2026-11-19");
    assert.equal(saved.site, "left-thigh");
    assert.equal(saved.at, todayAt);
    assert.equal(app.ui.routineAnnounce, "Log updated.");
    assert.doesNotMatch(app.ui.routineAnnounce, /thigh|belly|glute|left-|right-/);

    assert.equal(openRoutineDetails(item.id, saved.id), true);
    assert.match(routineDetailsSheetHTML(), /data-site-warn="same"/);
    assert.equal(setRoutineDetailsSite("right-arm"), true);
    assert.doesNotMatch(routineDetailsSheetHTML(), /data-site-warn/);
    assert.equal(commitRoutineDetails(), true);
    assert.equal(logOn(item.id, "2026-11-19").site, "right-arm");

    assert.equal(openRoutineDetails(item.id, saved.id), true);
    assert.equal(setRoutineDetailsSite("left-thigh"), true);
    assert.match(routineDetailsSheetHTML(), /data-site-warn/);
    assert.equal(dismissRoutineSiteWarning(), true);
    assert.equal(setRoutineDetailsSite(""), true);
    assert.equal(setRoutineDetailsSite("left-thigh"), true);
    assert.match(routineDetailsSheetHTML(), /data-site-warn="same"/);
    assert.equal(dismissRoutineSiteWarning(), true);
    assert.equal(dismissRoutineSiteWarning(), false);
    assert.doesNotMatch(routineDetailsSheetHTML(), /data-site-warn/);
  });

  test("a site is optional to clear, refused when unknown, and kept by the old amount editor", () => {
    signIn();
    const item = dose("Example Compound A", 250, "mcg");
    assert.equal(addRoutineItem(app.state, blockId("Morning routine"), { name: "Example Check", kind: "check" }), true);
    const checkItem = itemNamed("Example Check");
    assert.equal(logRoutineItem(app.state, item.id), true);
    const log = logOn(item.id, "2026-11-19");
    assert.equal(editRoutineLog(app.state, log.id, { amount: 250, day: "2026-11-19", site: " left-belly " }), true);
    assert.equal(logOn(item.id, "2026-11-19").site, "left-belly");
    assert.equal(editRoutineLog(app.state, log.id, { amount: 125, day: "2026-11-19" }), true);
    assert.equal(logOn(item.id, "2026-11-19").site, "left-belly");
    assert.equal(logOn(item.id, "2026-11-19").amount, 125);
    assert.equal(editRoutineLog(app.state, log.id, { amount: 125, day: "2026-11-19", site: "belly" }), false);
    assert.equal(editRoutineLog(app.state, log.id, { amount: 125, day: "2026-11-19", site: 12 }), false);
    assert.equal(editRoutineLog(app.state, log.id, { amount: 125, day: "2026-11-20", site: "left-arm" }), false);
    assert.equal(logOn(item.id, "2026-11-19").site, "left-belly");
    assert.equal(logOn(item.id, "2026-11-19").day, "2026-11-19");

    assert.equal(openRoutineLogEditor(log.id), true);
    assert.doesNotMatch(routineLogSheetHTML(), /left-belly|Left belly|dr-sites|Injection site/);
    assert.equal(commitRoutineLogSheet(), true);
    assert.equal(logOn(item.id, "2026-11-19").site, "left-belly");

    assert.equal(openRoutineDetails(item.id, log.id), true);
    assert.match(routineDetailsSheetHTML(), /Last site: Left belly/);
    assert.equal(setRoutineDetailsSite(""), true);
    assert.equal(commitRoutineDetails(), true);
    assert.equal(logOn(item.id, "2026-11-19").site, undefined);

    assert.equal(logRoutineItem(app.state, checkItem.id), true);
    const checkLog = logOn(checkItem.id, "2026-11-19");
    assert.equal(editRoutineLog(app.state, checkLog.id, { amount: 1, day: "2026-11-19", site: "left-thigh" }), false);
    assert.equal(checkLog.site, undefined);
    assert.equal(openRoutineDetails(checkItem.id, checkLog.id), true);
    assert.doesNotMatch(routineDetailsSheetHTML(), /dr-sites|Injection site|data-site=/);

    assert.equal(logRoutineRest(app.state), true);
    const rest = app.state.dailyRoutines.logs.find((row) => row.rest === true && !(row.deletedAt > 0));
    assert.equal(editRoutineLog(app.state, rest.id, { amount: 1, day: "2026-11-18", site: "left-glute" }), false);
    assert.equal(rest.site, undefined);

    const fresh = dose("Example Compound C", 1, "mL");
    assert.equal(openRoutineDetails(fresh.id), true);
    const unlogged = routineDetailsSheetHTML();
    assert.match(unlogged, /A site is not required to log/);
    assert.doesNotMatch(unlogged, /data-action="routines-details-site"|dr-sites/);
  });

  test("the day list, history sheet, and announce do not show a site, and there is no body map", () => {
    signIn();
    const item = dose("Example Compound A", 250, "mcg");
    assert.equal(logRoutineItem(app.state, item.id), true);
    assert.equal(editRoutineLog(app.state, logOn(item.id, "2026-11-19").id, { amount: 250, day: "2026-11-19", site: "left-glute" }), true);
    assert.equal(toggleRoutineReveal(app.state, blockId("Morning routine")), true);
    const page = dailyRoutinesHTML();
    for (const site of ROUTINE_SITES) {
      assert.equal(page.includes(site.id), false, site.id);
      assert.equal(page.includes(site.label), false, site.label);
    }
    assert.doesNotMatch(page, /Injection site|body map/);
    assert.equal(openRoutineHistory(item.compoundId, item.id), true);
    const history = routineHistorySheetHTML();
    assert.doesNotMatch(history, /left-glute|Left glute|Injection site/);
    assert.equal(openRoutineDetails(item.id, logOn(item.id, "2026-11-19").id), true);
    const details = routineDetailsSheetHTML();
    assert.match(details, /Last site: Left glute/);
    assert.doesNotMatch(details, /<svg|body map|recommend|rotate/i);
    const source = readFileSync(new URL("../logger/js/pages/daily-routines-details.js", import.meta.url), "utf8");
    assert.doesNotMatch(source, /<svg/);
    assert.doesNotMatch(source, /routines-flag/);
  });

  test("a skip, a rest, and a tombstone are not the last site, and unknown ids are dropped", () => {
    const base = {
      id: "log-1",
      itemId: "item-a",
      compoundId: null,
      day: "2026-11-18",
      status: "done",
      amount: 1,
      unit: "mcg",
      at: 2,
      updatedAt: 2,
      deletedAt: null,
    };
    const kept = normalizeDailyRoutines({
      updatedAt: 2,
      logs: ROUTINE_SITES.map((site, index) => ({ ...base, id: `log-${index}`, day: `2026-11-${String(10 + index).padStart(2, "0")}`, site: site.id })),
    });
    assert.deepEqual(kept.logs.map((row) => row.site), ROUTINE_SITES.map((site) => site.id));
    const dropped = normalizeDailyRoutines({
      updatedAt: 2,
      logs: [
        { ...base, site: "left belly" },
        { ...base, id: "log-skip", status: "skipped", site: "left-thigh" },
        { ...base, id: "log-rest", rest: true, site: "right-arm" },
      ],
    });
    assert.equal(dropped.logs.find((row) => row.id === "log-1").site, undefined);
    assert.equal(dropped.logs.find((row) => row.id === "log-skip").site, undefined);
    assert.equal(dropped.logs.find((row) => row.id === "log-rest").site, undefined);

    const store = {
      updatedAt: 9,
      blocks: [],
      items: [{ id: "item-a", name: "Example Compound A", kind: "dose", compoundId: null, updatedAt: 1, deletedAt: null }],
      placements: [],
      compounds: [],
      logs: [
        { ...base, id: "older", day: "2026-11-17", at: 1, updatedAt: 1, site: "right-arm" },
        { ...base, id: "skipped", day: "2026-11-18", status: "skipped", site: "left-thigh" },
        { ...base, id: "dead", day: "2026-11-19", at: 4, updatedAt: 9, deletedAt: 9, site: "left-glute" },
        { ...base, id: "today", day: "2026-11-19", at: 5, updatedAt: 5, site: "right-belly" },
      ],
      prefs: { lastBlockId: null, updatedAt: 1 },
    };
    assert.equal(lastRoutineSite(store, "item-a", "today"), "right-arm");
    assert.equal(lastRoutineSite(store, "item-b", "today"), "");
    const merged = mergeDailyRoutines(
      { ...store, logs: [{ ...base, site: "left-thigh", updatedAt: 8 }] },
      { ...store, logs: [{ ...base, site: "right-arm", updatedAt: 3 }] },
    );
    assert.equal(merged.logs.find((row) => row.id === "log-1").site, "left-thigh");

    signIn();
    const item = dose("Example Compound A", 250, "mcg");
    assert.equal(logRoutineItem(app.state, item.id), true);
    const logged = logOn(item.id, "2026-11-19");
    assert.equal(editRoutineLog(app.state, logged.id, { amount: 250, day: "2026-11-18", site: "left-thigh" }), true);
    const moved = logOn(item.id, "2026-11-18");
    assert.equal(undoRoutineLog(app.state, moved.id), true);
    assert.equal(logRoutineItem(app.state, item.id), true);
    const today = logOn(item.id, "2026-11-19");
    assert.equal(lastRoutineSite(app.state.dailyRoutines, item.id, today.id), "");
    assert.equal(openRoutineDetails(item.id, today.id), true);
    assert.match(routineDetailsSheetHTML(), /No site logged yet/);
    assert.equal(setRoutineDetailsSite("left-thigh"), true);
    assert.doesNotMatch(routineDetailsSheetHTML(), /data-site-warn/);
  });

  test("a site does not reach PostHog, Sentry, or a routines network call", () => {
    const event = sanitizePosthogEvent({
      event: "tab_viewed",
      properties: {
        tab: "home",
        site: SENTINEL,
        lastSite: "Left belly",
        injectionSite: "left-thigh",
        siteId: "right-glute",
        dailyRoutines: { logs: [{ site: SENTINEL }] },
        $current_url: `https://example.invalid/routines?site=${SENTINEL}#lastSite=Left%20belly`,
      },
      $set: { site: SENTINEL, injectionSite: "Left thigh" },
      $set_once: { lastSite: "left-arm" },
    });
    assert.equal(event.event, "tab_viewed");
    assert.equal(event.properties.tab, "home");
    const encoded = JSON.stringify(event);
    for (const needle of [SENTINEL, "Left belly", "left-thigh", "right-glute", "Left thigh", "left-arm"]) {
      assert.equal(encoded.includes(needle), false, needle);
    }
    assert.equal(JSON.stringify(sanitizeCapture("tab_viewed", { tab: "home", site: SENTINEL, injectionSite: "Left belly" })).includes(SENTINEL), false);
    assert.equal(sanitizeCapture("dose_logged", { site: SENTINEL }), null);

    const scrubbed = scrubEvent({
      message: "Left belly",
      extra: { site: SENTINEL, lastSite: "aa11bb22cc33dd50", injectionSite: "Left thigh" },
      contexts: { app: { site: "aa11bb22cc33dd4f", lastSite: "aa11bb22cc33dd50", browser: "Chrome" }, browser: { name: "Chrome" } },
      tags: { site: "aa11bb22cc33dd4f" },
      request: { url: `https://example.invalid/routines?site=${SENTINEL}`, data: { site: SENTINEL } },
      exception: { values: [{ type: "Error", value: "Left belly", mechanism: { type: "generic", handled: true, data: { site: "aa11bb22cc33dd4f", injection_site: "aa11bb22cc33dd53" } } }] },
      breadcrumbs: [{ category: "console", message: "Left belly", data: { site: SENTINEL } }, { category: "ui.click", message: "Left thigh", data: { site: "left-thigh" } }],
    });
    const crashed = JSON.stringify(scrubbed);
    for (const needle of [SENTINEL, "Left belly", "Left thigh", "left-thigh", "aa11bb22cc33dd4f", "aa11bb22cc33dd50", "aa11bb22cc33dd53"]) {
      assert.equal(crashed.includes(needle), false, needle);
    }
    assert.equal(JSON.stringify(scrubBreadcrumb({ category: "ui.click", message: "Left glute", data: { site: "left-glute" } })).includes("glute"), false);

    const files = ["daily-routines-details.js", "daily-routines.js", "daily-routines-store.js"].map((name) => {
      const folder = name.includes("store") ? "shared" : "pages";
      return readFileSync(new URL(`../logger/js/${folder}/${name}`, import.meta.url), "utf8");
    });
    for (const src of files) {
      assert.doesNotMatch(src, /\bfetch\s*\(/);
      assert.doesNotMatch(src, /XMLHttpRequest/);
      assert.doesNotMatch(src, /sendBeacon/);
      assert.doesNotMatch(src, /posthog/i);
      assert.doesNotMatch(src, /Sentry/);
      assert.doesNotMatch(src, /capture\(/);
      assert.doesNotMatch(src, /routines-flag/);
    }
    const flag = readFileSync(new URL("../logger/js/shared/routines-flag.js", import.meta.url), "utf8");
    const sw = readFileSync(new URL("../logger/sw.js", import.meta.url), "utf8");
    const sentry = readFileSync(new URL("../logger/js/sentry.js", import.meta.url), "utf8");
    const actions = readFileSync(new URL("../logger/js/shell/actions.js", import.meta.url), "utf8");
    const css = readFileSync(new URL("../logger/css/routines.css", import.meta.url), "utf8");
    assert.match(flag, /ROUTINES_ENABLED = true/);
    assert.match(sw, /const CACHE = "insight-shell-v87"/);
    assert.match(sentry, /insight-shell-v87/);
    assert.match(actions, /case "routines-details-site"/);
    assert.match(actions, /case "routines-details-site-dismiss"/);
    assert.match(css, /\.dr-sites \{/);
    assert.match(css, /\.dr-site-warn \{/);
    assert.equal(SITE_LABELS.length, 8);
  });
});
