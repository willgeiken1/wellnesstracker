import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/* Synthetic routines only. The calculator repeats numbers the user typed.
   U-100 units are that volume times 100. Saving writes a note on the item.
   It does not add a log, and it does not call the network. */

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
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { app } = await import("../logger/js/runtime.js");
const {
  addRoutineItem,
  dailyRoutinesHTML,
  deleteRoutineItem,
  editRoutineLog,
  logRoutineItem,
  renameRoutineItem,
  restoreRoutineItem,
  routinesSettingsSheetHTML,
  saveRoutineItemNote,
  toggleRoutineReveal,
} = await import("../logger/js/pages/daily-routines.js");
const {
  openReconstitution,
  reconstitutionLiveHTML,
  reconstitutionSheetHTML,
  routineHistorySheetHTML,
  saveReconstitutionNote,
} = await import("../logger/js/pages/daily-routines-dose.js");
const { openRoutineDetails, routineDetailsSheetHTML } = await import("../logger/js/pages/daily-routines-details.js");
const {
  formatCalcNumber,
  reconstitutionNoteText,
  reconstitutionResult,
  reconstitutionResultHTML,
} = await import("../logger/js/pages/reconstitution.js");
const { mergeDailyRoutines, normalizeDailyRoutines } = await import("../logger/js/shared/daily-routines-store.js");
const { sanitizeCapture, sanitizePosthogEvent } = await import("../logger/js/usage-events.js");
const { scrubBreadcrumb, scrubEvent } = await import("../logger/js/sentry-scrub.js");

const LOG_NOTE = "qq4419-scribble-text";
const ADVICE = /recommended dose|should take|prescrib|typical dose|suggested dose|you should/i;

function pin(day = "2026-11-19") {
  app.today = () => day;
  app.routineNow = () => new Date(2026, 10, 19, 8, 30, 0);
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
  app.renderSheet = () => {};
  app.$ = () => null;
  app.capture = () => {};
  app.eatClick = false;
  pin();
  dailyRoutinesHTML();
}

function blockId(name) {
  const block = app.state.dailyRoutines.blocks.find((row) => row.name === name);
  assert.ok(block, name);
  return block.id;
}

function itemNamed(name) {
  const item = app.state.dailyRoutines.items.find((row) => row.name === name && !(row.deletedAt > 0));
  assert.ok(item, name);
  return item;
}

function liveLog(itemId) {
  return app.state.dailyRoutines.logs.find((row) => row.itemId === itemId && !(row.deletedAt > 0));
}

function fillCalc(itemId) {
  assert.equal(openReconstitution(itemId), true);
  app.ui.sd.vial = "5";
  app.ui.sd.water = "2";
  app.ui.sd.dose = "250";
  app.ui.sd.vialUnit = "mg";
  app.ui.sd.doseUnit = "mcg";
}

describe("reconstitution calculator upgrades", { concurrency: false }, () => {
  test("U-100 units are the entered milliliters times 100", () => {
    const drawn = reconstitutionResult({ vialAmount: 5, waterMl: 2, doseAmount: 250, vialUnit: "mg", doseUnit: "mcg" });
    assert.equal(drawn.ok, true);
    assert.ok(Math.abs(drawn.volumeMl - 0.1) < 1e-9);
    assert.equal(drawn.syringeUnits, 10);
    assert.ok(drawn.lines.includes("Volume to draw: 0.25 mg ÷ 2.5 mg/mL = 0.1 mL"));
    assert.ok(drawn.lines.includes("U-100 units for what you entered: 0.1 mL × 100 = 10"));
    assert.match(drawn.note, /what you entered/i);
    assert.match(drawn.note, /not a recommendation/);
    assert.equal(reconstitutionNoteText(drawn), "0.1 mL · 10 U-100 units. What you entered. Not a recommendation.");
    const html = reconstitutionResultHTML(drawn);
    assert.match(html, /U-100 units for what you entered: 0\.1 mL × 100 = 10/);
    assert.match(html, /what you entered/i);
    assert.match(html, /not a recommendation/);
    assert.doesNotMatch(html, ADVICE);

    const quarter = reconstitutionResult({ vialAmount: 1, waterMl: 1, doseAmount: 0.25, vialUnit: "mg", doseUnit: "mg" });
    assert.equal(quarter.syringeUnits, 25);
    assert.ok(quarter.lines.includes("U-100 units for what you entered: 0.25 mL × 100 = 25"));

    const same = reconstitutionResult({ vialAmount: 13.25, waterMl: 2.5, doseAmount: 0.25, vialUnit: "mg", doseUnit: "mg" });
    assert.equal(formatCalcNumber(same.volumeMl), "0.04717");
    assert.equal(same.syringeUnits, 4.717);
    assert.ok(same.lines.includes("U-100 units for what you entered: 0.04717 mL × 100 = 4.717"));

    const iu = reconstitutionResult({ vialAmount: 10, waterMl: 2, doseAmount: 2.5, vialUnit: "IU", doseUnit: "IU" });
    assert.equal(iu.volumeMl, 0.5);
    assert.equal(iu.syringeUnits, 50);

    const mismatch = reconstitutionResult({ vialAmount: 5, waterMl: 2, doseAmount: 250, vialUnit: "IU", doseUnit: "mcg" });
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.syringeUnits, undefined);
    assert.equal(reconstitutionNoteText(mismatch), "");
    assert.doesNotMatch(mismatch.detail, /U-100|Volume to draw/);
    assert.match(reconstitutionResultHTML(mismatch), /what you entered/i);
    assert.doesNotMatch(reconstitutionResultHTML(mismatch), /U-100|Volume to draw/);

    const empty = reconstitutionResult({ vialAmount: null, waterMl: 2, doseAmount: 1, vialUnit: "mg", doseUnit: "mg" });
    assert.equal(empty.ok, false);
    assert.equal(empty.syringeUnits, undefined);
    const zeroWater = reconstitutionResult({ vialAmount: 5, waterMl: 0, doseAmount: 1, vialUnit: "mg", doseUnit: "mg" });
    assert.equal(zeroWater.ok, false);
  });

  test("save as note writes the item, shows on the row, and does not log", () => {
    signIn();
    const morning = blockId("Morning routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" }), true);
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Check", kind: "check" }), true);
    const item = itemNamed("Example Compound A");
    const check = itemNamed("Example Check");
    assert.equal(app.state.dailyRoutines.logs.length, 0);

    fillCalc(item.id);
    app.ui.sd.vial = "";
    app.ui.sd.water = "";
    app.ui.sd.dose = "";
    app.$ = (sel) => {
      const values = { "#dr-calc-vial": "5", "#dr-calc-water": "2", "#dr-calc-dose": "250" };
      return Object.prototype.hasOwnProperty.call(values, sel) ? { value: values[sel] } : null;
    };
    let saves = 0;
    app.save = () => { saves += 1; };
    assert.equal(saveReconstitutionNote(), true);
    assert.equal(saves, 1);
    assert.equal(app.ui.sheet, null);
    assert.equal(app.ui.routineAnnounce, "Note saved.");
    assert.doesNotMatch(app.ui.routineAnnounce, /0\.1|U-100|10/);
    assert.equal(app.state.dailyRoutines.logs.length, 0);
    const noted = itemNamed("Example Compound A");
    assert.equal(noted.note, "0.1 mL · 10 U-100 units. What you entered. Not a recommendation.");
    const openPage = dailyRoutinesHTML();
    assert.match(openPage, /class="dr-item-note"/);
    assert.match(openPage, /0\.1 mL · 10 U-100 units\. What you entered\. Not a recommendation\./);
    assert.doesNotMatch(openPage, ADVICE);

    assert.equal(logRoutineItem(app.state, item.id), true);
    const log = liveLog(item.id);
    assert.equal(editRoutineLog(app.state, log.id, { amount: 250, day: "2026-11-19", note: LOG_NOTE }), true);
    const logged = structuredClone(liveLog(item.id));
    assert.equal(toggleRoutineReveal(app.state, morning), true);
    const donePage = dailyRoutinesHTML();
    assert.match(donePage, /class="dr-item-note"/);
    assert.match(donePage, /10 U-100 units/);
    assert.doesNotMatch(donePage, new RegExp(LOG_NOTE));
    app.ui.dailyRoutineEdit = true;
    const editPage = dailyRoutinesHTML();
    assert.match(editPage, /class="dr-item-note"/);
    assert.match(editPage, /10 U-100 units/);
    assert.doesNotMatch(editPage, new RegExp(LOG_NOTE));
    app.ui.dailyRoutineEdit = false;

    fillCalc(item.id);
    app.ui.sd.dose = "500";
    app.$ = () => null;
    assert.equal(saveReconstitutionNote(), true);
    assert.equal(itemNamed("Example Compound A").note, "0.2 mL · 20 U-100 units. What you entered. Not a recommendation.");
    assert.deepEqual(liveLog(item.id), logged);

    fillCalc(item.id);
    app.ui.sd.vial = "";
    assert.equal(saveReconstitutionNote(), false);
    assert.equal(app.ui.sheet, "routines-calc");
    assert.match(reconstitutionSheetHTML(), /Enter a vial amount/);
    assert.equal(itemNamed("Example Compound A").note, "0.2 mL · 20 U-100 units. What you entered. Not a recommendation.");
    assert.deepEqual(liveLog(item.id), logged);

    assert.equal(saveRoutineItemNote(app.state, check.id, "1 < 2"), false);
    assert.equal(itemNamed("Example Check").note, undefined);
    assert.equal(saveRoutineItemNote(app.state, item.id, "  1 < 2 & 3  "), true);
    const escaped = dailyRoutinesHTML();
    assert.match(escaped, /1 &lt; 2 &amp; 3/);
    assert.doesNotMatch(escaped, /1 < 2/);
    const long = `${"q".repeat(500)}TRAILING`;
    assert.equal(saveRoutineItemNote(app.state, item.id, long), true);
    assert.equal(itemNamed("Example Compound A").note.length, 500);
    assert.equal(saveRoutineItemNote(app.state, item.id, "   "), true);
    assert.equal(itemNamed("Example Compound A").note, undefined);
    assert.equal(saveRoutineItemNote(app.state, item.id, 10), false);

    assert.equal(saveRoutineItemNote(app.state, item.id, "0.1 mL · 10 U-100 units. What you entered. Not a recommendation."), true);
    assert.equal(renameRoutineItem(app.state, item.id, "Example Compound A"), true);
    assert.equal(itemNamed("Example Compound A").note, "0.1 mL · 10 U-100 units. What you entered. Not a recommendation.");
    assert.equal(deleteRoutineItem(app.state, item.id), true);
    const tombstone = app.state.dailyRoutines.items.find((row) => row.id === item.id);
    assert.ok(tombstone.deletedAt > 0);
    assert.equal(tombstone.note, "0.1 mL · 10 U-100 units. What you entered. Not a recommendation.");
    assert.equal(restoreRoutineItem(app.state, item.id), true);
    assert.equal(itemNamed("Example Compound A").note, "0.1 mL · 10 U-100 units. What you entered. Not a recommendation.");
    assert.deepEqual(liveLog(item.id), logged);

    const older = structuredClone(app.state.dailyRoutines);
    const remoteItem = older.items.find((row) => row.id === item.id);
    remoteItem.note = "older note";
    remoteItem.updatedAt = 1;
    const merged = mergeDailyRoutines(app.state.dailyRoutines, older);
    assert.equal(merged.items.find((row) => row.id === item.id).note, itemNamed("Example Compound A").note);
    assert.equal(merged.logs.find((row) => row.id === logged.id).note, LOG_NOTE);
    assert.equal(merged.logs.find((row) => row.id === logged.id).amount, 250);

    const raw = structuredClone(app.state.dailyRoutines);
    const rawItem = raw.items.find((row) => row.id === item.id);
    rawItem.note = "  kept note  ";
    rawItem.mood = 4;
    rawItem.energy = 3;
    rawItem.stress = 2;
    rawItem.feeling = "low";
    rawItem.felt = "low";
    const normalized = normalizeDailyRoutines(raw);
    const clean = normalized.items.find((row) => row.id === item.id);
    assert.equal(clean.note, "kept note");
    assert.equal(clean.mood, undefined);
    assert.equal(clean.energy, undefined);
    assert.equal(clean.stress, undefined);
    assert.equal(clean.feeling, undefined);
    assert.equal(clean.felt, undefined);

    app.ui.sheet = "routines-history";
    app.ui.sd = { compoundId: item.compoundId, itemId: item.id };
    assert.doesNotMatch(routineHistorySheetHTML(), /U-100|kept note/);
  });

  test("the details page opens the calculator for that dose item", () => {
    signIn();
    const morning = blockId("Morning routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" }), true);
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Check", kind: "check" }), true);
    const item = itemNamed("Example Compound A");
    const check = itemNamed("Example Check");

    assert.equal(openRoutineDetails(item.id), true);
    const details = routineDetailsSheetHTML();
    assert.match(details, new RegExp(`data-action="routines-calc" data-item-id="${item.id}"`));
    assert.match(details, /Reconstitution calculator/);
    assert.match(details, /what you entered/i);
    assert.match(details, /does not suggest an amount/);
    assert.equal(openReconstitution(item.id), true);
    assert.equal(app.ui.sheet, "routines-calc");
    assert.equal(app.ui.sd.itemId, item.id);
    const linked = reconstitutionSheetHTML();
    assert.match(linked, /Save as note on this item/);
    assert.match(linked, /U-100 units/);
    assert.match(linked, /what you entered/i);
    assert.match(linked, /does not suggest an amount/);
    assert.match(linked, /data-calc="empty"/);
    assert.doesNotMatch(linked, /<form[\s>]/i);
    assert.doesNotMatch(linked, /Volume to draw/);
    assert.doesNotMatch(reconstitutionLiveHTML(), ADVICE);

    assert.equal(openRoutineDetails(check.id), true);
    assert.doesNotMatch(routineDetailsSheetHTML(), /routines-calc|Reconstitution calculator|Save as note/);
    const before = structuredClone(app.state.dailyRoutines);
    assert.equal(openReconstitution(check.id), true);
    assert.equal(app.ui.sd.itemId, "");
    assert.doesNotMatch(reconstitutionSheetHTML(), /Save as note on this item/);
    assert.equal(saveReconstitutionNote(), false);
    assert.deepEqual(app.state.dailyRoutines, before);

    assert.equal(openReconstitution(), true);
    assert.equal(app.ui.sd.itemId, "");
    assert.doesNotMatch(reconstitutionSheetHTML(), /Save as note/);
    const page = dailyRoutinesHTML();
    assert.match(page, /data-action="routines-calc"/);
    const settings = routinesSettingsSheetHTML();
    assert.match(settings, /data-action="routines-calc"/);
    assert.match(settings, /what you entered/i);
    assert.doesNotMatch(settings, /Save as note on this item/);
  });

  test("the calculator sends no values on the network or to analytics", () => {
    const calls = [];
    const originalFetch = globalThis.fetch;
    const OriginalXHR = globalThis.XMLHttpRequest;
    const originalBeacon = globalThis.navigator && globalThis.navigator.sendBeacon;
    globalThis.fetch = (...args) => {
      calls.push(["fetch", JSON.stringify(args)]);
      return Promise.resolve({ ok: true, text: async () => "", json: async () => ({}) });
    };
    globalThis.XMLHttpRequest = class {
      open(...args) { calls.push(["xhr", JSON.stringify(args)]); }
      send(body) { calls.push(["xhr-send", String(body)]); }
      setRequestHeader() {}
    };
    if (!globalThis.navigator) globalThis.navigator = {};
    globalThis.navigator.sendBeacon = (url, body) => {
      calls.push(["beacon", String(url), String(body)]);
      return true;
    };
    globalThis.Sentry = {
      captureMessage(msg) { calls.push(["sentry", String(msg)]); },
      captureException(err) { calls.push(["sentry", String(err)]); },
    };
    globalThis.posthog = { capture(...args) { calls.push(["posthog", JSON.stringify(args)]); } };

    signIn();
    const morning = blockId("Morning routine");
    addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" });
    const item = itemNamed("Example Compound A");
    const captures = [];
    app.capture = (...args) => captures.push(args);
    let saves = 0;
    app.save = () => { saves += 1; };
    const before = structuredClone(app.state.dailyRoutines);
    assert.equal(openReconstitution(), true);
    reconstitutionSheetHTML();
    reconstitutionLiveHTML();
    assert.equal(saves, 0);
    assert.deepEqual(app.state.dailyRoutines, before);

    fillCalc(item.id);
    const shown = reconstitutionLiveHTML();
    assert.match(shown, /10/);
    assert.match(shown, /what you entered/);
    assert.equal(saveReconstitutionNote(), true);
    assert.equal(saves, 1);
    assert.equal(calls.length, 0);
    assert.equal(captures.length, 0);
    const leaked = JSON.stringify(calls) + JSON.stringify(captures) + String(app.ui.routineAnnounce);
    for (const sentinel of ["13.25", "0.04717", "5", "2", "250", "0.1", "10"]) {
      assert.equal(leaked.includes(sentinel), false, sentinel);
    }
    assert.equal(app.state.dailyRoutines.logs.length, 0);
    assert.match(itemNamed("Example Compound A").note, /10 U-100 units/);

    const files = [
      "../logger/js/pages/reconstitution.js",
      "../logger/js/pages/daily-routines-dose.js",
      "../logger/js/pages/daily-routines-details.js",
    ];
    for (const file of files) {
      const src = readFileSync(new URL(file, import.meta.url), "utf8");
      assert.doesNotMatch(src, /\bfetch\s*\(/);
      assert.doesNotMatch(src, /XMLHttpRequest/);
      assert.doesNotMatch(src, /sendBeacon/);
      assert.doesNotMatch(src, /posthog/i);
      assert.doesNotMatch(src, /Sentry/);
      assert.doesNotMatch(src, /captureMessage|captureException/);
      assert.doesNotMatch(src, /routines-flag/);
      assert.doesNotMatch(src, ADVICE);
    }

    const note = itemNamed("Example Compound A").note;
    const event = sanitizePosthogEvent({
      event: "tab_viewed",
      properties: { tab: "home", note, syringeUnits: 10, reconstitution: note },
    });
    assert.equal(JSON.stringify(event).includes(note), false);
    assert.equal(JSON.stringify(event).includes("U-100"), false);
    assert.equal(JSON.stringify(sanitizeCapture("tab_viewed", { tab: "home", note })).includes(note), false);
    const scrubbed = scrubEvent({
      message: note,
      extra: { note, syringeUnits: 10, dailyRoutines: { note } },
      request: { url: `https://example.invalid/routines?note=${encodeURIComponent(note)}` },
      breadcrumbs: [{ category: "ui.click", message: note, data: { note } }],
    });
    assert.equal(JSON.stringify(scrubbed).includes("U-100"), false);
    assert.equal(JSON.stringify(scrubBreadcrumb({ category: "ui.click", message: note, data: { note } })).includes("U-100"), false);

    globalThis.fetch = originalFetch;
    globalThis.XMLHttpRequest = OriginalXHR;
    if (originalBeacon) globalThis.navigator.sendBeacon = originalBeacon;
    else delete globalThis.navigator.sendBeacon;
    delete globalThis.Sentry;
    delete globalThis.posthog;
  });

  test("a note is refused without a signed-in pull, and the shell stays put", () => {
    signIn();
    const morning = blockId("Morning routine");
    addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" });
    const item = itemNamed("Example Compound A");
    fillCalc(item.id);
    const seeded = structuredClone(app.state.dailyRoutines);
    app.session = null;
    assert.equal(saveReconstitutionNote(), false);
    assert.equal(openReconstitution(item.id), false);
    assert.equal(saveRoutineItemNote(app.state, item.id, "0.1 mL · 10 U-100 units. What you entered. Not a recommendation."), false);
    app.session = { user: { id: "synthetic-user" } };
    app.ROUTINES_ENABLED = false;
    assert.equal(saveRoutineItemNote(app.state, item.id, "0.1 mL · 10 U-100 units. What you entered. Not a recommendation."), false);
    assert.equal(dailyRoutinesHTML(), "");
    app.ROUTINES_ENABLED = true;
    app.sb = { from() {} };
    app.cloudPullOk = false;
    assert.equal(saveRoutineItemNote(app.state, item.id, "0.1 mL · 10 U-100 units. What you entered. Not a recommendation."), false);
    assert.equal(saveReconstitutionNote(), false);
    assert.deepEqual(app.state.dailyRoutines, seeded);

    const sw = readFileSync(new URL("../logger/sw.js", import.meta.url), "utf8");
    const sentry = readFileSync(new URL("../logger/js/sentry.js", import.meta.url), "utf8");
    const flag = readFileSync(new URL("../logger/js/shared/routines-flag.js", import.meta.url), "utf8");
    const main = readFileSync(new URL("../logger/js/main.js", import.meta.url), "utf8");
    const actions = readFileSync(new URL("../logger/js/shell/actions.js", import.meta.url), "utf8");
    const page = readFileSync(new URL("../logger/js/pages/daily-routines.js", import.meta.url), "utf8");
    assert.match(flag, /ROUTINES_ENABLED = true/);
    assert.match(sw, /const CACHE = "insight-shell-v87"/);
    assert.match(sentry, /insight-shell-v87/);
    assert.equal(main.match(/routines-flag/g).length, 1);
    assert.doesNotMatch(page, /routines-flag/);
    assert.doesNotMatch(page, /\bfetch\s*\(/);
    assert.match(actions, /app\.openReconstitution\(b\.dataset\.itemId\)/);
    assert.match(actions, /case "routines-calc-save"/);
  });
});
