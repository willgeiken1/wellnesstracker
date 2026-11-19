import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

/* Synthetic routines only. Names are Example Compound A and Example Compound B.
   The day a log keeps is the day string the user picked. The clock's UTC
   instant must not replace it. The calculator repeats entered numbers and
   does not call the network. */

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
  compoundDoseHistory,
  dailyRoutinesHTML,
  doseCountdownText,
  editRoutineLog,
  logRoutineItem,
  loggedAmountText,
  loggedTodayCount,
  parseRoutineAmount,
  renameRoutineBlock,
  routineLogDraft,
  saveRoutineItem,
  skipRoutineItem,
  toggleRoutineReveal,
} = await import("../logger/js/pages/daily-routines.js");
const {
  commitRoutineLogSheet,
  openReconstitution,
  openRoutineHistory,
  openRoutineLogEditor,
  reconstitutionLiveHTML,
  reconstitutionSheetHTML,
  routineHistorySheetHTML,
  routineLogSheetHTML,
} = await import("../logger/js/pages/daily-routines-dose.js");
const { formatCalcNumber, reconstitutionResult, reconstitutionResultHTML } = await import("../logger/js/pages/reconstitution.js");
const { nextDoseCountdown, localCalendarDay } = await import("../logger/js/shared/routine-dose.js");
const { putDailyRoutines, upsertEntity } = await import("../logger/js/shared/daily-routines-store.js");

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function pin(day, utcIso) {
  app.today = () => day;
  app.routineNow = () => (utcIso ? new Date(utcIso) : new Date(2026, 10, 19, 8, 30, 0));
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
  app.$ = () => null;
  pin(day);
  dailyRoutinesHTML();
}

function blockId(name) {
  const block = app.state.dailyRoutines.blocks.find((row) => row.name === name);
  assert.ok(block, name);
  return block.id;
}

function addDose(block, name = "Example Compound A", amount = 250) {
  return addRoutineItem(app.state, block, { name, kind: "dose", amount, unit: "mcg" });
}

function liveLog(itemId) {
  return app.state.dailyRoutines.logs.find((row) => row.itemId === itemId && !(row.deletedAt > 0));
}

function doseItem() {
  const item = app.state.dailyRoutines.items.find((row) => row.name === "Example Compound A");
  assert.ok(item);
  return item;
}

describe("routine doses and reconstitution", { concurrency: false }, () => {
  test("a backdated log stays on the chosen day across a UTC-next-day clock", () => {
    signIn("2026-11-19");
    const morning = blockId("Morning routine");
    assert.equal(addDose(morning), true);
    const item = doseItem();
    pin("2026-11-19", "2026-11-20T04:30:00.000Z");
    assert.equal(logRoutineItem(app.state, item.id), true);
    const created = liveLog(item.id);
    assert.equal(created.day, "2026-11-19");
    assert.equal(created.amount, 250);
    const compoundBefore = structuredClone(app.state.dailyRoutines.compounds.find((row) => row.id === item.compoundId));
    const saves = [];
    app.save = () => saves.push("save");

    assert.equal(editRoutineLog(app.state, created.id, { amount: "1/4", day: "2026-11-18" }), true);
    const moved = app.state.dailyRoutines.logs.find((row) => row.id === created.id);
    assert.equal(moved.day, "2026-11-18");
    assert.notEqual(moved.day, "2026-11-19");
    assert.notEqual(moved.day, "2026-11-20");
    assert.equal(moved.amount, 0.25);
    assert.equal(typeof moved.amount, "number");
    assert.equal(moved.status, "partial");
    assert.equal(moved.unit, "mcg");
    assert.equal(app.state.dailyRoutines.logs.filter((row) => row.itemId === item.id).length, 1);
    assert.equal(loggedTodayCount(app.state.dailyRoutines.logs, "2026-11-19"), 0);
    assert.equal(loggedTodayCount(app.state.dailyRoutines.logs, "2026-11-18"), 1);
    assert.equal(loggedTodayCount(app.state.dailyRoutines.logs, "2026-11-20"), 0);
    const compoundAfter = app.state.dailyRoutines.compounds.find((row) => row.id === item.compoundId);
    assert.equal(compoundAfter.amount, compoundBefore.amount);
    assert.equal(compoundAfter.unit, compoundBefore.unit);
    assert.equal(saves.length, 0);

    assert.equal(editRoutineLog(app.state, created.id, { amount: "¼", day: "2026-11-19" }), true);
    const today = app.state.dailyRoutines.logs.find((row) => row.id === created.id);
    assert.equal(today.day, "2026-11-19");
    assert.notEqual(today.day, new Date("2026-11-20T04:30:00.000Z").toISOString().slice(0, 10));
    assert.equal(today.amount, 0.25);

    assert.equal(editRoutineLog(app.state, created.id, { amount: 250, day: "2026-11-20" }), false);
    assert.equal(app.state.dailyRoutines.logs.find((row) => row.id === created.id).day, "2026-11-19");
    assert.equal(editRoutineLog(app.state, created.id, { amount: "", day: "2026-11-18" }), false);
    assert.equal(editRoutineLog(app.state, created.id, { amount: "-1", day: "2026-11-18" }), false);
    assert.equal(editRoutineLog(app.state, created.id, { amount: "1/4", day: "2026-02-31" }), false);
    assert.equal(app.state.dailyRoutines.logs.find((row) => row.id === created.id).amount, 0.25);
    assert.equal(parseRoutineAmount("1/4"), 0.25);
    assert.equal(parseRoutineAmount("¼"), 0.25);
  });

  test("a backdated log does not land on a day that already has one", () => {
    signIn("2026-11-19");
    const morning = blockId("Morning routine");
    addDose(morning);
    const item = doseItem();
    assert.equal(logRoutineItem(app.state, item.id), true);
    const today = liveLog(item.id);
    assert.equal(editRoutineLog(app.state, today.id, { amount: 250, day: "2026-11-18" }), true);
    assert.equal(logRoutineItem(app.state, item.id), true);
    const second = app.state.dailyRoutines.logs.find((row) => row.itemId === item.id && row.day === "2026-11-19");
    assert.equal(editRoutineLog(app.state, second.id, { amount: "0.25", day: "2026-11-18" }), false);
    assert.equal(second.day, "2026-11-19");
    assert.equal(app.state.dailyRoutines.logs.filter((row) => row.itemId === item.id && row.day === "2026-11-18" && !(row.deletedAt > 0)).length, 1);
  });

  test("history and completed rows show the logged amount after the compound amount changes", () => {
    signIn("2026-11-19");
    app.routineNow = () => new Date(2026, 10, 19, 8, 30, 0);
    const morning = blockId("Morning routine");
    addDose(morning);
    const item = doseItem();
    let html = dailyRoutinesHTML();
    assert.match(html, /Example Compound A<\/span><span class="dr-dose"> · 250 mcg<\/span>/);
    assert.equal(logRoutineItem(app.state, item.id), true);
    assert.equal(saveRoutineItem(app.state, {
      itemId: item.id,
      name: "Example Compound A",
      kind: "dose",
      amount: "500",
      unit: "mg",
      blockId: morning,
      blockIds: [morning],
    }), true);
    const compound = app.state.dailyRoutines.compounds.find((row) => row.id === item.compoundId);
    assert.equal(compound.amount, 500);
    assert.equal(compound.unit, "mg");
    const log = liveLog(item.id);
    assert.equal(log.amount, 250);
    assert.equal(log.unit, "mcg");
    assert.equal(loggedAmountText(log), "250 mcg");
    assert.equal(toggleRoutineReveal(app.state, morning), true);
    html = dailyRoutinesHTML();
    assert.match(html, /Example Compound A<\/span><span class="dr-dose"> · 250 mcg<\/span>/);
    assert.match(html, /data-state="done"/);
    assert.doesNotMatch(html, /500 mcg/);
    assert.doesNotMatch(html, /500 mg/);
    assert.doesNotMatch(html, /250 mg/);

    assert.equal(openRoutineHistory(item.compoundId, item.id), true);
    const history = routineHistorySheetHTML();
    assert.match(history, /Nov 19, 2026/);
    assert.match(history, /250 mcg/);
    assert.match(history, /logged amounts/i);
    assert.doesNotMatch(history, /500 mcg/);
    assert.doesNotMatch(history, /500 mg/);
    assert.equal(compoundDoseHistory(app.state.dailyRoutines, item.compoundId)[0].amount, 250);

    assert.equal(editRoutineLog(app.state, log.id, { amount: "0.25", day: "2026-11-18" }), true);
    const edited = app.state.dailyRoutines.logs.find((row) => row.id === log.id);
    assert.equal(edited.day, "2026-11-18");
    assert.equal(edited.amount, 0.25);
    assert.equal(edited.status, "partial");
    html = dailyRoutinesHTML();
    assert.match(html, /data-action="routines-log"/);
    assert.match(html, /Example Compound A<\/span><span class="dr-dose"> · 500 mg<\/span>/);
    assert.doesNotMatch(html, /data-state="done"/);
    assert.doesNotMatch(html, /0\.25 mcg/);
    const past = routineHistorySheetHTML();
    const recent = past.indexOf("Nov 18, 2026");
    assert.ok(recent >= 0);
    assert.match(past, /Nov 18, 2026[\s\S]{0,180}0\.25 mcg/);
    assert.doesNotMatch(past, /Nov 19, 2026/);
    assert.equal(loggedTodayCount(app.state.dailyRoutines.logs, "2026-11-19"), 0);
    assert.equal(loggedTodayCount(app.state.dailyRoutines.logs, "2026-11-18"), 1);
  });

  test("the log sheet saves the day and quarter amount from the fields", () => {
    signIn("2026-11-19");
    pin("2026-11-19", "2026-11-20T03:15:00.000Z");
    const morning = blockId("Morning routine");
    addDose(morning);
    const item = doseItem();
    assert.equal(logRoutineItem(app.state, item.id), true);
    const log = liveLog(item.id);
    assert.equal(openRoutineLogEditor(log.id), true);
    let sheet = routineLogSheetHTML();
    assert.match(sheet, /id="dr-log-day"[^>]*value="2026-11-19"/);
    assert.match(sheet, /max="2026-11-19"/);
    assert.match(sheet, /does not suggest an amount/);
    app.$ = (sel) => {
      if (sel === "#dr-log-amount") return { value: "1/4" };
      if (sel === "#dr-log-day") return { value: "2026-10-31" };
      return null;
    };
    assert.equal(commitRoutineLogSheet(), true);
    const saved = app.state.dailyRoutines.logs.find((row) => row.id === log.id);
    assert.equal(saved.day, "2026-10-31");
    assert.equal(saved.amount, 0.25);
    assert.equal(saved.status, "partial");
    assert.notEqual(saved.day, "2026-11-20");
    const draft = routineLogDraft(app.state, log.id);
    assert.equal(draft.day, "2026-10-31");
    assert.equal(draft.amount, "0.25");
    sheet = routineLogSheetHTML();
    assert.match(sheet, /value="2026-10-31"/);
  });

  test("the next dose uses the local block time and the pinned day", () => {
    const item = { id: "item-a", kind: "dose" };
    const morning = [{ id: "morning", name: "Morning routine" }];
    const placements = [{ itemId: "item-a", blockId: "morning" }];
    const atFour = new Date(2026, 10, 19, 4, 0, 0);
    const open = nextDoseCountdown({ item, blocks: morning, placements, logs: [], date: atFour, day: "2026-11-19" });
    assert.equal(open.waitMin, 60);
    const logged = nextDoseCountdown({
      item,
      blocks: morning,
      placements,
      logs: [{ itemId: "item-a", day: "2026-11-18", status: "done" }],
      date: atFour,
      day: "2026-11-18",
    });
    assert.equal(logged.waitMin, 1500);
    const skipped = nextDoseCountdown({
      item,
      blocks: morning,
      placements,
      logs: [{ itemId: "item-a", day: "2026-11-19", status: "skipped" }],
      date: atFour,
      day: "2026-11-19",
    });
    assert.equal(skipped.waitMin, 1500);
    const renamed = nextDoseCountdown({
      item,
      blocks: [{ id: "morning", name: "Custom block" }],
      placements,
      logs: [],
      date: atFour,
      day: "2026-11-19",
    });
    assert.equal(renamed, null);

    signIn("2026-11-19");
    const morningId = blockId("Morning routine");
    addDose(morningId);
    const row = doseItem();
    app.routineNow = () => new Date(2026, 10, 19, 4, 0, 0);
    let html = dailyRoutinesHTML();
    assert.match(html, /data-next-dose="60"/);
    assert.match(html, /Next dose in 1 hr/);
    assert.equal(logRoutineItem(app.state, row.id), true);
    assert.equal(toggleRoutineReveal(app.state, morningId), true);
    html = dailyRoutinesHTML();
    assert.match(html, /data-next-dose="1500"/);
    assert.match(html, /Next dose in 25 hr/);
    assert.doesNotMatch(html, /data-next-dose="60"/);

    const loggedId = liveLog(row.id).id;
    app.state.dailyRoutines.logs = app.state.dailyRoutines.logs.map((entry) => entry.id === loggedId ? { ...entry, deletedAt: entry.updatedAt } : entry);
    assert.equal(skipRoutineItem(app.state, row.id), true);
    html = dailyRoutinesHTML();
    assert.match(html, /data-next-dose="1500"/);

    signIn("2026-11-19");
    addDose(blockId("Night routine"), "Example Compound B");
    app.routineNow = () => new Date(2026, 10, 19, 8, 30, 0);
    html = dailyRoutinesHTML();
    assert.match(html, /data-next-dose="510"/);
    assert.match(html, /Next dose in 8 hr 30 min/);
    const nightItem = app.state.dailyRoutines.items.find((entry) => entry.name === "Example Compound B");
    const view = { blocks: app.state.dailyRoutines.blocks, placements: app.state.dailyRoutines.placements, logs: [], items: app.state.dailyRoutines.items };
    assert.equal(doseCountdownText(view, nightItem, new Date(2026, 10, 19, 8, 30, 0), "2026-11-19"), "Next dose in 8 hr 30 min");

    signIn("2026-11-19");
    const bothMorning = blockId("Morning routine");
    const bothNight = blockId("Night routine");
    addDose(bothMorning);
    const both = doseItem();
    const placed = upsertEntity(app.state.dailyRoutines, "placements", {
      id: "place-night-dose", blockId: bothNight, itemId: both.id, order: 3, deletedAt: null,
    }, 80);
    assert.equal(putDailyRoutines(app.state, placed), true);
    app.routineNow = () => new Date(2026, 10, 19, 8, 30, 0);
    html = dailyRoutinesHTML();
    assert.match(html, /data-next-dose="510"/);
    assert.doesNotMatch(html, /data-next-dose="1230"/);

    signIn("2026-11-19");
    addDose(blockId("Morning routine"));
    assert.equal(renameRoutineBlock(app.state, blockId("Morning routine"), "Custom block"), true);
    app.routineNow = () => new Date(2026, 10, 19, 4, 0, 0);
    html = dailyRoutinesHTML();
    assert.doesNotMatch(html, /data-next-dose=/);
    assert.doesNotMatch(html, /Next dose/);
    assert.equal(localCalendarDay(new Date(2026, 10, 19, 4, 0, 0)), "2026-11-19");
  });

  test("local day and countdown follow a non-UTC zone across midnight", () => {
    const script = `
      import assert from "node:assert/strict";
      import { localCalendarDay, nextDoseCountdown } from "./logger/js/shared/routine-dose.js";
      const item = { id: "item-a", kind: "dose" };
      const blocks = [{ id: "morning", name: "Morning routine" }];
      const placements = [{ itemId: "item-a", blockId: "morning" }];
      const countdown = (date, day, logs) => nextDoseCountdown({ item, blocks, placements, logs, date, day }).waitMin;
      if (process.env.TZ === "America/Chicago") {
        const evening = new Date("2026-11-20T05:30:00.000Z");
        assert.equal(localCalendarDay(evening), "2026-11-19");
        assert.equal(countdown(evening, "2026-11-19", []), 330);
        const midnight = new Date("2026-11-20T06:00:00.000Z");
        assert.equal(localCalendarDay(midnight), "2026-11-20");
        assert.equal(midnight.getHours(), 0);
        assert.equal(countdown(midnight, "2026-11-20", []), 300);
      } else if (process.env.TZ === "Pacific/Auckland") {
        const early = new Date("2026-11-18T15:00:00.000Z");
        assert.equal(localCalendarDay(early), "2026-11-19");
        assert.equal(early.getHours(), 4);
        assert.notEqual(early.toISOString().slice(0, 10), "2026-11-19");
        assert.equal(countdown(early, "2026-11-19", []), 60);
        assert.equal(countdown(early, "2026-11-19", [{ itemId: "item-a", day: "2026-11-19", status: "done" }]), 1500);
        assert.equal(countdown(early, "2026-11-19", [{ itemId: "item-a", day: "2026-11-18", status: "done" }]), 60);
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

  test("the calculator shows the arithmetic of the entered numbers", () => {
    const converted = reconstitutionResult({ vialAmount: 5, waterMl: 2, doseAmount: 250, vialUnit: "mg", doseUnit: "mcg" });
    assert.equal(converted.ok, true);
    assert.equal(converted.concentration, 2.5);
    assert.ok(Math.abs(converted.volumeMl - 0.1) < 1e-9);
    assert.ok(converted.lines.includes("250 mcg = 0.25 mg. 1 mg = 1000 mcg."));
    assert.ok(converted.lines.includes("Concentration: 5 mg ÷ 2 mL = 2.5 mg/mL"));
    assert.ok(converted.lines.includes("Volume to draw: 0.25 mg ÷ 2.5 mg/mL = 0.1 mL"));
    assert.match(converted.note, /what you entered/i);
    assert.match(converted.note, /not a recommendation/);

    const same = reconstitutionResult({ vialAmount: 13.25, waterMl: 2.5, doseAmount: 0.25, vialUnit: "mg", doseUnit: "mg" });
    assert.equal(formatCalcNumber(same.concentration), "5.3");
    assert.equal(formatCalcNumber(same.volumeMl), "0.04717");
    assert.ok(same.lines.includes("Concentration: 13.25 mg ÷ 2.5 mL = 5.3 mg/mL"));
    assert.ok(same.lines.includes("Volume to draw: 0.25 mg ÷ 5.3 mg/mL = 0.04717 mL"));

    const iu = reconstitutionResult({ vialAmount: 10, waterMl: 2, doseAmount: 2.5, vialUnit: "IU", doseUnit: "IU" });
    assert.equal(iu.concentration, 5);
    assert.equal(iu.volumeMl, 0.5);
    assert.ok(iu.lines.includes("Volume to draw: 2.5 IU ÷ 5 IU/mL = 0.5 mL"));

    const mismatch = reconstitutionResult({ vialAmount: 5, waterMl: 2, doseAmount: 250, vialUnit: "IU", doseUnit: "mcg" });
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.lines.length, 0);
    assert.doesNotMatch(mismatch.detail, /Volume to draw/);
    assert.match(reconstitutionResultHTML(mismatch), /what you entered/i);
    assert.doesNotMatch(reconstitutionResultHTML(mismatch), /Volume to draw/);

    const empty = reconstitutionResult({ vialAmount: null, waterMl: 2, doseAmount: 1, vialUnit: "mg", doseUnit: "mg" });
    assert.equal(empty.ok, false);
    assert.doesNotMatch(empty.detail, /Volume to draw/);
    const zeroWater = reconstitutionResult({ vialAmount: 5, waterMl: 0, doseAmount: 1, vialUnit: "mg", doseUnit: "mg" });
    assert.equal(zeroWater.ok, false);

    signIn();
    app.ui.sd = { vial: "1", water: "1", dose: "1/4", vialUnit: "mg", doseUnit: "mg" };
    const live = reconstitutionLiveHTML();
    assert.match(live, /what you entered/i);
    assert.match(live, /Volume to draw: 0\.25 mg ÷ 1 mg\/mL = 0\.25 mL/);
    assert.doesNotMatch(live, /recommended|should take|prescrib|typical dose|suggested dose|you should/i);
    assert.match(live, /not a recommendation/);

    assert.equal(openReconstitution(), true);
    const sheet = reconstitutionSheetHTML();
    assert.match(sheet, /Reconstitution calculator/);
    assert.match(sheet, /what you entered/i);
    assert.match(sheet, /data-calc="empty"/);
    assert.doesNotMatch(sheet, /Volume to draw/);
    assert.doesNotMatch(sheet, /<form[\s>]/i);
    const page = dailyRoutinesHTML();
    assert.match(page, /data-action="routines-calc"/);
    const settings = app.routinesSettingsSheetHTML();
    assert.match(settings, /data-action="routines-calc"/);
    assert.match(settings, /what you entered/i);
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
    const before = structuredClone(app.state.dailyRoutines);
    let saves = 0;
    app.save = () => { saves += 1; };
    const result = reconstitutionResult({ vialAmount: 13.25, waterMl: 2.5, doseAmount: 0.25, vialUnit: "mg", doseUnit: "mg" });
    const html = reconstitutionResultHTML(result);
    app.ui.sd = { vial: "13.25", water: "2.5", dose: "0.25", vialUnit: "mg", doseUnit: "mg" };
    const live = reconstitutionLiveHTML();
    assert.equal(openReconstitution(), true);
    const sheet = reconstitutionSheetHTML();
    app.ui.sd = { vial: "13.25", water: "2.5", dose: "0.25", vialUnit: "mg", doseUnit: "mg" };
    const shown = reconstitutionLiveHTML();
    assert.match(shown, /13\.25 mg/);
    assert.match(html, /5\.3 mg\/mL/);
    assert.match(live, /what you entered/);
    assert.match(sheet, /what you entered/);
    assert.equal(calls.length, 0);
    const leaked = JSON.stringify(calls);
    for (const sentinel of ["13.25", "2.5", "0.25", "5.3", "0.04717"]) {
      assert.equal(leaked.includes(sentinel), false);
    }
    assert.equal(saves, 0);
    assert.deepEqual(app.state.dailyRoutines, before);

    const files = [
      "../logger/js/pages/reconstitution.js",
      "../logger/js/pages/daily-routines-dose.js",
      "../logger/js/shared/routine-dose.js",
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
      assert.doesNotMatch(src, /recommended dose|should take|prescrib|typical dose|suggested dose|you should/i);
    }

    globalThis.fetch = originalFetch;
    globalThis.XMLHttpRequest = OriginalXHR;
    if (originalBeacon) globalThis.navigator.sendBeacon = originalBeacon;
    delete globalThis.Sentry;
    delete globalThis.posthog;
  });

  test("writes stay behind the flag, sign-in, and a finished account pull", () => {
    signIn("2026-11-19");
    const morning = blockId("Morning routine");
    addDose(morning);
    const item = doseItem();
    assert.equal(logRoutineItem(app.state, item.id), true);
    const log = liveLog(item.id);
    const seeded = structuredClone(app.state.dailyRoutines);
    app.session = null;
    assert.equal(editRoutineLog(app.state, log.id, { amount: "1", day: "2026-11-18" }), false);
    assert.equal(openReconstitution(), false);
    assert.equal(openRoutineHistory(item.compoundId, item.id), false);
    assert.doesNotMatch(dailyRoutinesHTML(), /routines-calc|Reconstitution|Example Compound A/);
    app.session = { user: { id: "synthetic-user" } };
    app.ROUTINES_ENABLED = false;
    assert.equal(editRoutineLog(app.state, log.id, { amount: "1", day: "2026-11-18" }), false);
    assert.equal(dailyRoutinesHTML(), "");
    app.ROUTINES_ENABLED = true;
    app.sb = { from() {} };
    app.cloudPullOk = false;
    assert.equal(editRoutineLog(app.state, log.id, { amount: "1", day: "2026-11-18" }), false);
    assert.deepEqual(app.state.dailyRoutines.logs.find((row) => row.id === log.id), seeded.logs.find((row) => row.id === log.id));
  });

  test("the shell cache, flag, and native gate stay in place", () => {
    const sw = readFileSync(new URL("../logger/sw.js", import.meta.url), "utf8");
    const sentry = readFileSync(new URL("../logger/js/sentry.js", import.meta.url), "utf8");
    const main = readFileSync(new URL("../logger/js/main.js", import.meta.url), "utf8");
    const flag = readFileSync(new URL("../logger/js/shared/routines-flag.js", import.meta.url), "utf8");
    const actions = readFileSync(new URL("../logger/js/shell/actions.js", import.meta.url), "utf8");
    assert.match(flag, /ROUTINES_ENABLED = false/);
    assert.match(sw, /const CACHE = "insight-shell-v59"/);
    assert.match(sentry, /insight-shell-v59/);
    assert.match(sw, /js\/pages\/daily-routines-dose\.js/);
    assert.match(sw, /js\/pages\/reconstitution\.js/);
    assert.match(sw, /js\/shared\/routine-dose\.js/);
    assert.match(main, /import "\.\/pages\/daily-routines-dose\.js";/);
    assert.equal(main.match(/routines-flag/g).length, 1);
    for (const name of ["routines-history", "routines-log-edit", "routines-log-save", "routines-calc", "routines-calc-vial-unit", "routines-calc-dose-unit"]) {
      assert.match(actions, new RegExp(`case "${name}"`));
    }
  });
});
