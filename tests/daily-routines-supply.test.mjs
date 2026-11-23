import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/* Synthetic supply only. Counts and mix dates are fake. They stay on the
   item in the account blob and must not reach PostHog or Sentry. */

const sheetListeners = { click: [], input: [], change: [] };

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
  addEventListener(type, fn) {
    if (sheetListeners[type]) sheetListeners[type].push(fn);
  },
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
  deleteRoutineItem,
  logRoutineItem,
  renameRoutineItem,
  restoreRoutineItem,
  saveRoutineItem,
  routineItemDraft,
} = await import("../logger/js/pages/daily-routines.js");
const { commitRoutineItemSheet, routineItemSheetHTML } = await import("../logger/js/pages/daily-routines-edit.js");
app.$ = (sel) => document.querySelector(sel);
await import("../logger/js/shell/actions.js");
const { openRoutineDetails, routineDetailsSheetHTML } = await import("../logger/js/pages/daily-routines-details.js");
const { isLive, normalizeDailyRoutines, putDailyRoutines } = await import("../logger/js/shared/daily-routines-store.js");
const {
  LOW_SUPPLY_DAYS,
  mixedAgoLabel,
  parseSupplyCount,
  routineDaysLeft,
  routineSupplyView,
  supplyDraftError,
  supplyFromDraft,
} = await import("../logger/js/shared/routine-supply.js");
const { sanitizeCapture, sanitizePosthogEvent } = await import("../logger/js/usage-events.js");
const { scrubEvent } = await import("../logger/js/sentry-scrub.js");

const BANNED = /\b(buy|vendor|vendors|price|pricing|shop|purchase|reorder|pharmacy|\$)\b|https?:\/\//i;
const SENTINEL_COUNT = "86420";
const SENTINEL_DAY = "2019-03-17";

function pin(day = "2026-11-19") {
  app.today = () => day;
  app.routineNow = () => new Date(2026, 10, 19, 8, 30);
}

function signIn() {
  app.ROUTINES_ENABLED = true;
  app.session = { user: { id: "synthetic-user" } };
  app.sb = null;
  app.cloudPullOk = true;
  app.state = { dailyRoutines: null };
  app.ui = { tab: "daily-routines", sheet: null, sd: {}, dailyRoutineEdit: false };
  app.save = () => {};
  app.render = () => {};
  app.renderSheet = () => {};
  app.toast = () => {};
  app.$ = () => null;
  pin();
  dailyRoutinesHTML();
}

function blockId(name) {
  const block = app.state.dailyRoutines.blocks.find((row) => row.name === name && isLive(row));
  assert.ok(block, name);
  return block.id;
}

function itemNamed(name) {
  return app.state.dailyRoutines.items.find((row) => row.name === name && isLive(row));
}

function doseLog(id, itemId, day, extra = {}) {
  return {
    id,
    itemId,
    compoundId: null,
    day,
    status: extra.status || "done",
    amount: extra.amount == null ? 250 : extra.amount,
    unit: "mcg",
    at: extra.at || 1,
    updatedAt: extra.updatedAt || 1,
    deletedAt: extra.deletedAt == null ? null : extra.deletedAt,
    rest: extra.rest === true,
  };
}

function writeLogs(rows) {
  const store = structuredClone(app.state.dailyRoutines);
  store.logs = rows;
  assert.equal(putDailyRoutines(app.state, store), true);
}

function viewOf(item, logs, today = "2026-11-19") {
  return routineSupplyView({ item, logs, today });
}

describe("routine supply and mixed-on date", { concurrency: false }, () => {
  test("supply stays off until a count is set, and a mix date stays hidden until one is set", () => {
    assert.equal(parseSupplyCount(""), null);
    assert.equal(parseSupplyCount(null), null);
    assert.equal(LOW_SUPPLY_DAYS, 7);
    const item = { id: "item-a", kind: "dose", name: "Example Compound A" };
    const hidden = viewOf(item, []);
    assert.deepEqual(hidden, { text: "", state: "" });
    assert.equal(mixedAgoLabel("", "2026-11-19"), "");
    assert.equal(mixedAgoLabel("2026-11-20", "2026-11-19"), "");
    const mixedOnly = viewOf({ ...item, mixedOn: "2026-11-10" }, []);
    assert.equal(mixedOnly.text, "Mixed 9 days ago");
    assert.equal(mixedOnly.state, "mixed");
    assert.equal(mixedOnly.text.includes("on hand"), false);
    const check = viewOf({ ...item, kind: "check", mixedOn: "2026-11-10" }, []);
    assert.equal(check.text, "");
  });

  test("days left uses the logged gap, not a summed amount", () => {
    const itemId = "item-a";
    const none = [];
    assert.equal(routineDaysLeft(8, none, itemId), 8);
    assert.equal(routineDaysLeft(7, none, itemId), 7);
    assert.equal(routineDaysLeft(0, none, itemId), 0);
    assert.equal(routineDaysLeft(null, none, itemId), null);
    assert.equal(routineDaysLeft(4, [doseLog("only", itemId, "2026-11-01", { amount: 9000 })], itemId), 4);

    const everyOther = [
      doseLog("a", itemId, "2026-11-01", { amount: 250 }),
      doseLog("b", itemId, "2026-11-03", { amount: 500 }),
      doseLog("c", itemId, "2026-11-05", { amount: 9000 }),
    ];
    assert.equal(routineDaysLeft(4, everyOther, itemId), 8);
    assert.equal(routineDaysLeft(3, everyOther, itemId), 6);
    assert.notEqual(routineDaysLeft(4, everyOther, itemId), 250 + 500 + 9000);

    const skipped = [
      doseLog("d1", itemId, "2026-11-01"),
      doseLog("skip", itemId, "2026-11-02", { status: "skipped", amount: null }),
      doseLog("d3", itemId, "2026-11-03"),
    ];
    assert.equal(routineDaysLeft(4, skipped, itemId), 8);

    const rested = [
      doseLog("r1", itemId, "2026-11-01"),
      doseLog("rest", itemId, "2026-11-02", { rest: true, status: "done" }),
      doseLog("r3", itemId, "2026-11-03"),
    ];
    assert.equal(routineDaysLeft(4, rested, itemId), 8);

    const tombstone = [
      doseLog("t1", itemId, "2026-11-01"),
      doseLog("gone", itemId, "2026-11-02", { deletedAt: 50 }),
      doseLog("t3", itemId, "2026-11-03"),
    ];
    assert.equal(routineDaysLeft(4, tombstone, itemId), 8);

    const partial = [
      doseLog("p1", itemId, "2026-11-01", { status: "partial", amount: 1 }),
      doseLog("p3", itemId, "2026-11-03", { amount: 2 }),
    ];
    assert.equal(routineDaysLeft(4, partial, itemId), 8);

    const other = [
      doseLog("mine-1", itemId, "2026-11-01"),
      doseLog("other", "item-b", "2026-11-02", { amount: 400 }),
      doseLog("mine-3", itemId, "2026-11-03"),
    ];
    assert.equal(routineDaysLeft(4, other, itemId), 8);

    const weekly = [
      doseLog("w1", itemId, "2026-11-01"),
      doseLog("w2", itemId, "2026-11-09"),
    ];
    assert.equal(routineDaysLeft(1, weekly, itemId), 8);

    const half = [
      doseLog("h1", itemId, "2026-11-01"),
      doseLog("h2", itemId, "2026-11-03"),
      doseLog("h3", itemId, "2026-11-06"),
    ];
    assert.equal(routineDaysLeft(1, half, itemId), 3);

    const belowHalf = [
      doseLog("b1", itemId, "2026-11-01"),
      doseLog("b2", itemId, "2026-11-02"),
      doseLog("b3", itemId, "2026-11-03"),
      doseLog("b4", itemId, "2026-11-04"),
      doseLog("b5", itemId, "2026-11-05"),
      doseLog("b6", itemId, "2026-11-08"),
    ];
    assert.equal(routineDaysLeft(3, belowHalf, itemId), 4);
  });

  test("wording names the count, the days left, and how long ago a vial was mixed", () => {
    const item = { id: "item-a", kind: "dose", name: "Example Compound A" };
    const today = "2026-11-19";
    assert.equal(mixedAgoLabel("2026-11-19", today), "Mixed today");
    assert.equal(mixedAgoLabel("2026-11-18", today), "Mixed 1 day ago");
    assert.equal(mixedAgoLabel("2026-11-10", today), "Mixed 9 days ago");

    const steady = viewOf({ ...item, onHand: 8 }, [], today);
    assert.equal(steady.text, "8 on hand · 8 days left");
    assert.equal(steady.state, "set");
    assert.equal(steady.text.includes("Low supply"), false);

    const low = viewOf({ ...item, onHand: 7 }, [], today);
    assert.equal(low.text, "Low supply · 7 on hand · 7 days left");
    assert.equal(low.state, "low");
    assert.equal(viewOf({ ...item, onHand: 0 }, [], today).text, "Low supply · 0 on hand · 0 days left");
    assert.equal(viewOf({ ...item, onHand: 1 }, [], today).text, "Low supply · 1 on hand · 1 day left");

    const rare = viewOf(
      { ...item, onHand: 1 },
      [doseLog("w1", item.id, "2026-11-01"), doseLog("w2", item.id, "2026-11-09")],
      today,
    );
    assert.equal(rare.text, "1 on hand · 8 days left");
    assert.equal(rare.state, "set");

    const both = viewOf(
      { ...item, onHand: 4, mixedOn: "2026-11-10" },
      [
        doseLog("a", item.id, "2026-11-01"),
        doseLog("b", item.id, "2026-11-03"),
        doseLog("c", item.id, "2026-11-05"),
      ],
      today,
    );
    assert.equal(both.text, "4 on hand · 8 days left · Mixed 9 days ago");
    assert.equal(both.state, "set");

    const lowMixed = viewOf({ ...item, onHand: 3, mixedOn: "2026-11-10" }, [], today);
    assert.equal(lowMixed.text, "Low supply · 3 on hand · 3 days left · Mixed 9 days ago");
    assert.equal(lowMixed.state, "low");
    for (const text of [steady.text, low.text, rare.text, both.text, lowMixed.text, "Mixed 9 days ago"]) {
      assert.doesNotMatch(text, BANNED);
    }
  });

  test("optional fields round-trip, a blank clears them, and a bad value is refused", () => {
    const normalized = normalizeDailyRoutines({
      updatedAt: 1,
      blocks: [],
      items: [
        {
          id: "item-dose",
          name: "Example Compound A",
          kind: "dose",
          onHand: "12",
          mixedOn: "2026-11-10",
          vendor: "Example Seller",
          buyUrl: "https://example.invalid/nope",
          price: "9",
          updatedAt: 1,
          deletedAt: null,
        },
        {
          id: "item-check",
          name: "Example Check",
          kind: "check",
          onHand: 4,
          mixedOn: "2026-11-10",
          updatedAt: 1,
          deletedAt: null,
        },
        {
          id: "item-junk",
          name: "Example Junk",
          kind: "dose",
          onHand: "lots",
          mixedOn: "2026-11-31",
          updatedAt: 1,
          deletedAt: null,
        },
      ],
      placements: [],
      compounds: [],
      logs: [],
      prefs: { lastBlockId: null, updatedAt: 1 },
    });
    const dose = normalized.items.find((row) => row.id === "item-dose");
    const check = normalized.items.find((row) => row.id === "item-check");
    const junk = normalized.items.find((row) => row.id === "item-junk");
    assert.equal(dose.onHand, 12);
    assert.equal(dose.mixedOn, "2026-11-10");
    assert.equal(dose.vendor, undefined);
    assert.equal(dose.buyUrl, undefined);
    assert.equal(dose.price, undefined);
    assert.equal(check.onHand, 4);
    assert.equal(check.mixedOn, undefined);
    assert.equal(junk.onHand, undefined);
    assert.equal(junk.mixedOn, undefined);
    assert.equal(JSON.stringify(normalized).includes("example.invalid"), false);
    assert.equal(JSON.stringify(normalized).includes("Example Seller"), false);

    assert.equal(supplyDraftError({ onHand: "1.5", kind: "dose" }, "2026-11-19"), "On hand is a whole number, or leave it blank.");
    assert.equal(supplyDraftError({ onHand: "-1", kind: "check" }, "2026-11-19"), "On hand is a whole number, or leave it blank.");
    assert.equal(supplyDraftError({ mixedOn: "2026-11-20", kind: "dose" }, "2026-11-19"), "Mixed on is a day up to today, or leave it blank.");
    assert.equal(supplyDraftError({ mixedOn: "2026-11-20", kind: "check" }, "2026-11-19"), "");
    assert.equal(supplyDraftError({ onHand: "", mixedOn: "", kind: "dose" }, "2026-11-19"), "");
    assert.equal(supplyFromDraft({ onHand: "12", mixedOn: "2026-11-10" }, "dose", "2026-11-19").onHand, 12);
    assert.equal(supplyFromDraft({ onHand: "nope" }, "dose", "2026-11-19"), null);
    assert.equal(supplyFromDraft({}, "check", "2026-11-19").mixedOn, null);

    signIn();
    const morning = blockId("Morning routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" }), true);
    let item = itemNamed("Example Compound A");
    assert.equal(item.onHand, undefined);
    assert.equal(item.mixedOn, undefined);
    const beforeLogs = structuredClone(app.state.dailyRoutines.logs);
    assert.equal(saveRoutineItem(app.state, {
      itemId: item.id,
      name: "Example Compound A",
      kind: "dose",
      amount: 250,
      unit: "mcg",
      blockId: morning,
      blockIds: [morning],
      onHand: "12",
      mixedOn: "2026-11-10",
    }), true);
    item = itemNamed("Example Compound A");
    assert.equal(item.onHand, 12);
    assert.equal(item.mixedOn, "2026-11-10");
    assert.deepEqual(app.state.dailyRoutines.logs, beforeLogs);

    const kept = structuredClone(app.state.dailyRoutines);
    assert.equal(saveRoutineItem(app.state, {
      itemId: item.id,
      name: "Example Compound A",
      kind: "dose",
      amount: 250,
      unit: "mcg",
      blockId: morning,
      blockIds: [morning],
      onHand: "-3",
      mixedOn: "2026-11-10",
    }), false);
    assert.deepEqual(app.state.dailyRoutines, kept);
    assert.equal(saveRoutineItem(app.state, {
      itemId: item.id,
      name: "Example Compound A",
      kind: "dose",
      amount: 250,
      unit: "mcg",
      blockId: morning,
      blockIds: [morning],
      onHand: "12",
      mixedOn: "2026-12-01",
    }), false);
    assert.deepEqual(app.state.dailyRoutines, kept);

    assert.equal(saveRoutineItem(app.state, {
      itemId: item.id,
      name: "Example Compound A",
      kind: "dose",
      amount: 125,
      unit: "mcg",
      blockId: morning,
      blockIds: [morning],
    }), true);
    item = itemNamed("Example Compound A");
    assert.equal(item.onHand, 12);
    assert.equal(item.mixedOn, "2026-11-10");
    const compound = app.state.dailyRoutines.compounds.find((row) => row.id === item.compoundId);
    assert.equal(compound.amount, 125);
    assert.deepEqual(app.state.dailyRoutines.logs, beforeLogs);

    assert.equal(renameRoutineItem(app.state, item.id, "Example Compound B"), true);
    item = itemNamed("Example Compound B");
    assert.equal(item.onHand, 12);
    assert.equal(item.mixedOn, "2026-11-10");
    assert.equal(deleteRoutineItem(app.state, item.id), true);
    assert.equal(restoreRoutineItem(app.state, item.id), true);
    item = itemNamed("Example Compound B");
    assert.equal(item.onHand, 12);
    assert.equal(item.mixedOn, "2026-11-10");
    assert.equal(renameRoutineItem(app.state, item.id, "Example Compound A"), true);
    assert.equal(logRoutineItem(app.state, item.id), true);
    item = itemNamed("Example Compound A");
    assert.equal(item.onHand, 12);
    assert.equal(item.mixedOn, "2026-11-10");
    const logged = structuredClone(app.state.dailyRoutines.logs);

    assert.equal(saveRoutineItem(app.state, {
      itemId: item.id,
      name: "Example Compound A",
      kind: "dose",
      amount: 125,
      unit: "mcg",
      blockId: morning,
      blockIds: [morning],
      onHand: "",
      mixedOn: "",
    }), true);
    item = itemNamed("Example Compound A");
    assert.equal(item.onHand, undefined);
    assert.equal(item.mixedOn, undefined);
    assert.deepEqual(app.state.dailyRoutines.logs, logged);

    assert.equal(saveRoutineItem(app.state, {
      itemId: item.id,
      name: "Example Check",
      kind: "check",
      blockId: morning,
      blockIds: [morning],
      onHand: "4",
      mixedOn: "2026-11-10",
    }), true);
    const checkItem = itemNamed("Example Check");
    assert.equal(checkItem.kind, "check");
    assert.equal(checkItem.onHand, 4);
    assert.equal(checkItem.mixedOn, undefined);
  });

  test("the day view, the item editor, and the details page show supply and no seller link", () => {
    signIn();
    const morning = blockId("Morning routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" }), true);
    const bare = dailyRoutinesHTML();
    assert.equal(bare.includes("dr-supply"), false);
    assert.doesNotMatch(bare, BANNED);

    let item = itemNamed("Example Compound A");
    assert.equal(saveRoutineItem(app.state, {
      itemId: item.id,
      name: "Example Compound A",
      kind: "dose",
      amount: 250,
      unit: "mcg",
      blockId: morning,
      blockIds: [morning],
      onHand: "4",
      mixedOn: "2026-11-10",
    }), true);
    item = itemNamed("Example Compound A");
    writeLogs([
      doseLog("a", item.id, "2026-11-01", { amount: 250 }),
      doseLog("b", item.id, "2026-11-03", { amount: 500 }),
      doseLog("c", item.id, "2026-11-05", { amount: 9000 }),
    ]);
    const page = dailyRoutinesHTML();
    assert.match(page, /data-supply="set"/);
    assert.match(page, /4 on hand · 8 days left · Mixed 9 days ago/);
    assert.equal(page.includes("Low supply"), false);
    assert.doesNotMatch(page, BANNED);
    assert.doesNotMatch(page, /<a\b|href=/i);
    const chip = page.match(/<span class="dr-supply"[^>]*>[^<]*<\/span>/);
    assert.ok(chip);
    assert.equal(chip[0].includes("data-action"), false);

    app.ui.dailyRoutineEdit = true;
    const editing = dailyRoutinesHTML();
    assert.match(editing, /4 on hand · 8 days left · Mixed 9 days ago/);
    app.ui.dailyRoutineEdit = false;

    app.ui.sd = routineItemDraft(app.state, { blockId: morning, itemId: item.id });
    const doseSheet = routineItemSheetHTML();
    assert.match(doseSheet, /id="dr-item-on-hand"[^>]*value="4"/);
    assert.match(doseSheet, /id="dr-item-mixed-on"[^>]*max="2026-11-19"[^>]*value="2026-11-10"/);
    assert.match(doseSheet, /Leave this blank to hide it/);
    assert.doesNotMatch(doseSheet, BANNED);
    assert.doesNotMatch(doseSheet, /<a\b|href=/i);

    assert.equal(addRoutineItem(app.state, morning, { name: "Example Check", kind: "check", onHand: "2" }), true);
    const check = itemNamed("Example Check");
    app.ui.sd = routineItemDraft(app.state, { blockId: morning, itemId: check.id });
    const checkSheet = routineItemSheetHTML();
    assert.match(checkSheet, /id="dr-item-on-hand"[^>]*value="2"/);
    assert.equal(checkSheet.includes("dr-item-mixed-on"), false);

    assert.equal(openRoutineDetails(item.id), true);
    const details = routineDetailsSheetHTML();
    assert.match(details, /data-supply="set"/);
    assert.match(details, /4 on hand · 8 days left · Mixed 9 days ago/);
    assert.match(details, /This page stays open until you tap the X/);
    assert.doesNotMatch(details, BANNED);
    assert.doesNotMatch(details, /<a\b|href=/i);

    item = itemNamed("Example Compound A");
    const lowStore = structuredClone(app.state.dailyRoutines);
    const lowItem = lowStore.items.find((row) => row.id === item.id);
    lowItem.onHand = 3;
    lowItem.updatedAt += 1;
    assert.equal(putDailyRoutines(app.state, lowStore), true);
    const lowPage = dailyRoutinesHTML();
    assert.match(lowPage, /data-supply="low"/);
    assert.match(lowPage, /Low supply · 3 on hand · 6 days left · Mixed 9 days ago/);
  });

  test("a unit, step, or routine tap keeps a typed count and mix date", async () => {
    signIn();
    const morning = blockId("Morning routine");
    const night = blockId("Night routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" }), true);
    const item = itemNamed("Example Compound A");
    app.ui.sheet = "routines-item";
    app.ui.sd = routineItemDraft(app.state, { blockId: morning, itemId: item.id });
    app.eatClick = false;
    const fields = {
      "#dr-item-name": { value: "Example Compound A" },
      "#dr-item-amount": { value: "250" },
      "#dr-item-on-hand": { value: "9" },
      "#dr-item-mixed-on": { value: "2026-11-10" },
    };
    app.$ = (sel) => fields[sel] || null;
    let html = "";
    app.renderSheet = () => { html = routineItemSheetHTML(); };
    const button = {
      dataset: { action: "routines-item-unit", unit: "mg" },
      closest(sel) { return sel === "[data-action]" ? button : null; },
    };
    const ev = { target: button, preventDefault() {} };
    for (const fn of sheetListeners.click) await fn(ev);
    assert.match(html, /id="dr-item-on-hand"[^>]*value="9"/);
    assert.match(html, /id="dr-item-mixed-on"[^>]*value="2026-11-10"/);
    assert.match(html, /data-unit="mg"[^>]*aria-pressed="true"/);

    button.dataset = { action: "routines-item-step", delta: "50" };
    for (const fn of sheetListeners.click) await fn(ev);
    assert.match(html, /id="dr-item-on-hand"[^>]*value="9"/);
    assert.match(html, /id="dr-item-mixed-on"[^>]*value="2026-11-10"/);
    assert.match(html, /id="dr-item-amount"[^>]*value="300"/);
    assert.equal(app.ui.sd.amount, "300");

    fields["#dr-item-on-hand"].value = "";
    fields["#dr-item-mixed-on"].value = "";
    button.dataset = { action: "routines-item-block", blockId: night };
    for (const fn of sheetListeners.click) await fn(ev);
    assert.match(html, /id="dr-item-on-hand"[^>]*value=""/);
    assert.doesNotMatch(html, /value="2026-11-10"/);
    assert.match(html, new RegExp(`data-block-id="${night}"[^>]*aria-pressed="true"`));

    fields["#dr-item-on-hand"].value = "4";
    fields["#dr-item-mixed-on"].value = "2026-11-12";
    button.dataset = { action: "routines-item-kind", kind: "check" };
    for (const fn of sheetListeners.click) await fn(ev);
    assert.match(html, /id="dr-item-on-hand"[^>]*value="4"/);
    assert.equal(html.includes("dr-item-mixed-on"), false);
    assert.equal(app.ui.sd.mixedOn, "2026-11-12");
    app.$ = (sel) => (sel === "#dr-item-mixed-on" ? null : fields[sel] || null);
    button.dataset = { action: "routines-item-kind", kind: "dose" };
    for (const fn of sheetListeners.click) await fn(ev);
    assert.match(html, /id="dr-item-on-hand"[^>]*value="4"/);
    assert.match(html, /id="dr-item-mixed-on"[^>]*value="2026-11-12"/);
  });

  test("the item sheet saves a count and a mix date, and a bad count does not write", () => {
    signIn();
    const morning = blockId("Morning routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" }), true);
    const item = itemNamed("Example Compound A");
    app.ui.sheet = "routines-item";
    app.ui.sd = routineItemDraft(app.state, { blockId: morning, itemId: item.id });
    app.ui.sd.onHand = "6";
    app.ui.sd.mixedOn = "2026-11-18";
    let toasted = "";
    app.toast = (message) => { toasted = message; };
    assert.equal(commitRoutineItemSheet(), true);
    const saved = itemNamed("Example Compound A");
    assert.equal(saved.onHand, 6);
    assert.equal(saved.mixedOn, "2026-11-18");
    assert.equal(toasted, "Item saved.");

    app.ui.sheet = "routines-item";
    app.ui.sd = routineItemDraft(app.state, { blockId: morning, itemId: saved.id });
    app.ui.sd.onHand = "6.5";
    assert.equal(commitRoutineItemSheet(), false);
    assert.equal(toasted, "On hand is a whole number, or leave it blank.");
    assert.equal(itemNamed("Example Compound A").onHand, 6);
    assert.equal(itemNamed("Example Compound A").mixedOn, "2026-11-18");
  });

  test("a count and a mix date do not reach PostHog or Sentry", () => {
    const event = sanitizePosthogEvent({
      event: "tab_viewed",
      properties: {
        tab: "home",
        onHand: Number(SENTINEL_COUNT),
        mixedOn: SENTINEL_DAY,
        daysLeft: 9,
        lowSupply: true,
      },
      $set: { onHand: Number(SENTINEL_COUNT), mixedOn: SENTINEL_DAY },
      $set_once: { daysLeft: 9 },
    });
    assert.ok(event);
    assert.equal(event.properties.tab, "home");
    const posted = JSON.stringify(event);
    assert.equal(posted.includes(SENTINEL_COUNT), false);
    assert.equal(posted.includes(SENTINEL_DAY), false);
    assert.equal(posted.includes("onHand"), false);
    assert.equal(posted.includes("mixedOn"), false);
    const captured = JSON.stringify(sanitizeCapture("tab_viewed", {
      tab: "home",
      onHand: Number(SENTINEL_COUNT),
      mixedOn: SENTINEL_DAY,
    }));
    assert.equal(captured.includes(SENTINEL_COUNT), false);
    assert.equal(captured.includes(SENTINEL_DAY), false);

    const scrubbed = JSON.stringify(scrubEvent({
      message: `Low supply ${SENTINEL_COUNT} mixed ${SENTINEL_DAY}`,
      extra: { onHand: Number(SENTINEL_COUNT), mixedOn: SENTINEL_DAY, daysLeft: 9 },
      contexts: { app: { onHand: true, mixedOn: true, daysLeft: true, lowSupply: true } },
      breadcrumbs: [{ category: "console", message: `${SENTINEL_COUNT} ${SENTINEL_DAY}`, data: { onHand: Number(SENTINEL_COUNT) } }],
    }));
    assert.equal(scrubbed.includes(SENTINEL_COUNT), false);
    assert.equal(scrubbed.includes(SENTINEL_DAY), false);
    assert.equal(scrubbed.includes("onHand"), false);
    assert.equal(scrubbed.includes("mixedOn"), false);
    assert.equal(scrubbed.includes("daysLeft"), false);
    assert.equal(scrubbed.includes("lowSupply"), false);

    const supply = readFileSync(new URL("../logger/js/shared/routine-supply.js", import.meta.url), "utf8");
    const page = readFileSync(new URL("../logger/js/pages/daily-routines.js", import.meta.url), "utf8");
    const edit = readFileSync(new URL("../logger/js/pages/daily-routines-edit.js", import.meta.url), "utf8");
    const details = readFileSync(new URL("../logger/js/pages/daily-routines-details.js", import.meta.url), "utf8");
    for (const src of [supply, page, edit, details]) {
      assert.doesNotMatch(src, /\bfetch\s*\(/);
      assert.doesNotMatch(src, /XMLHttpRequest/);
      assert.doesNotMatch(src, /sendBeacon/);
      assert.doesNotMatch(src, /posthog/i);
      assert.doesNotMatch(src, /Sentry/);
      assert.doesNotMatch(src, /routines-flag/);
    }
    const flag = readFileSync(new URL("../logger/js/shared/routines-flag.js", import.meta.url), "utf8");
    const sw = readFileSync(new URL("../logger/sw.js", import.meta.url), "utf8");
    const sentry = readFileSync(new URL("../logger/js/sentry.js", import.meta.url), "utf8");
    assert.match(flag, /ROUTINES_ENABLED = true/);
    assert.match(sw, /const CACHE = "insight-shell-v91"/);
    assert.match(sw, /routine-supply\.js/);
    assert.match(sentry, /insight-shell-v91/);
    app.ROUTINES_ENABLED = false;
    assert.equal(dailyRoutinesHTML(), "");
  });
});
