import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/* Synthetic items only. Every amount, unit and time here is a typed example.
   The sheet and the calculator must never fill one in by themselves. */

const listeners = { click: [], input: [], change: [] };

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
    if (listeners[type]) listeners[type].push(fn);
  },
  removeEventListener() {},
  documentElement: { dataset: {}, classList: { add() {}, remove() {} } },
  body: el(),
  head: el(),
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  createElement: () => el(),
};
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { app } = await import("../logger/js/runtime.js");
const { addRoutineItem, dailyRoutinesHTML, routineItemDraft } = await import("../logger/js/pages/daily-routines.js");
const {
  clearRoutineItemAmount,
  clearRoutineItemTime,
  noteRoutineItemField,
  routineItemSheetHTML,
  stepRoutineItemAmount,
} = await import("../logger/js/pages/daily-routines-edit.js");
const {
  clearReconstitutionField,
  closeReconstitution,
  openReconstitution,
  openReconstitutionFromItem,
  reconstitutionLiveHTML,
  reconstitutionSheetHTML,
  saveReconstitutionNote,
  stepReconstitutionField,
} = await import("../logger/js/pages/daily-routines-dose.js");
const {
  AMOUNT_STEP_SETS,
  ARC,
  amountDraftText,
  amountFieldText,
  amountSteps,
  arcMinutesAt,
  arcPoint,
  arcReadout,
  arcSegmentPath,
  arcSegments,
  clockMinutes,
  doseReadback,
  parseSheetAmount,
  plainAmount,
  prettyAmount,
  stepAllowed,
  stepAmount,
  stepButtonsHTML,
  syringeFillWidth,
  syringeHTML,
} = await import("../logger/js/pages/daily-routines-sheet-parts.js");
const { reconstitutionNoteText, reconstitutionResult } = await import("../logger/js/pages/reconstitution.js");
app.$ = () => el();
await import("../logger/js/shell/actions.js");

const MORNING = "block_default_morning";
const NIGHT = "block_default_night";
const HELP = "The amount and unit are what you type. Nothing here suggests a dose.";
const EVIDENCE = "Custom item. No evidence is attached.";
const NOTE = "This is the arithmetic of what you entered. It is not a recommendation.";
const INTRO = "Enter a vial amount, a water volume, and a desired amount. The lines below are the arithmetic of what you entered, including U-100 units (mL × 100). What you type stays on this screen.";
const SAVE_SUB = "Saves the volume and U-100 units on this item. It does not log a dose, and it does not suggest an amount.";

let fields = {};

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
  app.eatClick = false;
  app.today = () => "2026-11-19";
  app.routineNow = () => new Date(2026, 10, 19, 8, 30);
  fields = {};
  app.$ = (sel) => fields[sel] || null;
  dailyRoutinesHTML();
}

function itemNamed(name) {
  return app.state.dailyRoutines.items.find((row) => row.name === name && !row.deletedAt);
}

function openSaved(name) {
  const item = itemNamed(name);
  app.openRoutineItemEditor(MORNING, item.id);
  return item;
}

async function tap(dataset) {
  const button = { dataset, closest(sel) { return sel === "[data-action]" ? button : null; } };
  const ev = { target: button, preventDefault() {} };
  for (const fn of listeners.click) await fn(ev);
}

function stepDeltas(html, action) {
  return [...html.matchAll(new RegExp(`data-action="${action}"[^>]*data-delta="([^"]+)"[^>]*?( disabled)?>`, "g"))].map((m) => [Number(m[1]), Boolean(m[2])]);
}

function dosePart(html) {
  const from = html.indexOf('id="dr-item-dose"');
  const to = html.indexOf('id="dr-arc-label"');
  assert.ok(from > 0 && to > from);
  return html.slice(from, to);
}

describe("add item sheet and calculator", () => {
  test("the step set comes from the amount on screen before the tap", () => {
    assert.deepEqual(AMOUNT_STEP_SETS.map((set) => [...set]), [[0.25, 0.5, 1], [1, 5, 10], [10, 50, 100]]);
    for (const amount of [null, undefined, NaN, 0, 0.25, 9.75, 9.999999]) assert.deepEqual([...amountSteps(amount)], [0.25, 0.5, 1], String(amount));
    for (const amount of [10, 10.25, 55, 99.75, 99.999999]) assert.deepEqual([...amountSteps(amount)], [1, 5, 10], String(amount));
    for (const amount of [100, 100.5, 250, 5000]) assert.deepEqual([...amountSteps(amount)], [10, 50, 100], String(amount));

    /* 9.75 uses the quarter set, so +1 lands on 10.75 and the next tap uses the middle set. */
    assert.equal(stepAmount(9.75, 1), 10.75);
    assert.equal(stepAllowed(10.75, 0.25), false);
    assert.equal(stepAmount(10.75, 0.25), 10.75);
    assert.equal(stepAmount(10.75, 5), 15.75);
    assert.equal(stepAmount(95, 10), 105);
    assert.equal(stepAmount(105, 10), 115);
    assert.equal(stepAllowed(105, 1), false);
    assert.equal(stepAmount(100, -10), 90);
    assert.equal(stepAmount(10, -1), 9);
    assert.equal(stepAmount(9, -0.25), 8.75);

    /* An empty amount counts from zero with the quarter set. */
    assert.equal(stepAmount(null, 0.25), 0.25);
    assert.equal(stepAmount(null, 1), 1);
    assert.equal(stepAllowed(null, -0.25), false);
    assert.equal(stepAmount(null, -0.25), null);
    assert.equal(stepAllowed(null, 5), false);
  });

  test("a step rounds to six places, a result at zero clears, and take-away stops at zero", () => {
    assert.equal(stepAmount(0.1, 0.25), 0.35);
    assert.equal(stepAmount(0.3, 0.25), 0.55);
    assert.equal(stepAmount(1.1, -0.25), 0.85);
    assert.equal(stepAmount(0.25, -0.25), null);
    assert.equal(stepAmount(1, -1), null);
    assert.equal(stepAllowed(0.5, -1), false);
    assert.equal(stepAmount(0.5, -1), 0.5);
    assert.equal(stepAllowed(0.5, -0.5), true);
    assert.equal(stepAllowed(5, -5), false, "5 is not in the quarter set");
    assert.equal(stepAllowed(15, -5), true);
    assert.equal(stepAllowed(12, -5), true);
    assert.equal(stepAllowed(104, -50), true);
    for (const bad of [0, NaN, Infinity, "1", null, undefined, 0.3, 2]) assert.equal(stepAllowed(1, bad), false, String(bad));

    assert.deepEqual(stepDeltas(stepButtonsHTML(null, "x"), "x"), [[-1, true], [-0.5, true], [-0.25, true], [0.25, false], [0.5, false], [1, false]]);
    assert.deepEqual(stepDeltas(stepButtonsHTML(0.5, "x"), "x"), [[-1, true], [-0.5, false], [-0.25, false], [0.25, false], [0.5, false], [1, false]]);
    assert.deepEqual(stepDeltas(stepButtonsHTML(12, "x"), "x"), [[-10, false], [-5, false], [-1, false], [1, false], [5, false], [10, false]]);
    assert.deepEqual(stepDeltas(stepButtonsHTML(250, "x"), "x"), [[-100, false], [-50, false], [-10, false], [10, false], [50, false], [100, false]]);
    const labels = stepButtonsHTML(0.5, "x");
    assert.match(labels, /aria-label="Take away ¼"[^>]*>−¼</);
    assert.match(labels, /aria-label="Add ½"[^>]*>\+½</);
    assert.match(labels, /aria-label="Take away 1" disabled>−1</);
  });

  test("amounts read strictly and print the way they were typed", () => {
    assert.equal(parseSheetAmount("250"), 250);
    assert.equal(parseSheetAmount(" 0.25 "), 0.25);
    assert.equal(parseSheetAmount("1/4"), 0.25);
    assert.equal(parseSheetAmount("½"), 0.5);
    assert.equal(parseSheetAmount("2½"), 2.5);
    assert.equal(parseSheetAmount("1¾"), 1.75);
    assert.equal(parseSheetAmount("0,25"), 0.25);
    assert.equal(parseSheetAmount("0"), 0, "zero reads as zero, and Save refuses it");
    for (const bad of ["", " ", "1,000", "1e3", "-1", "abc", "2 ½ mg", "½½", "1/0", null, undefined]) assert.equal(parseSheetAmount(bad), null, String(bad));
    assert.equal(prettyAmount(0.25), "¼");
    assert.equal(prettyAmount(0.5), "½");
    assert.equal(prettyAmount(2.75), "2¾");
    assert.equal(prettyAmount(250), "250");
    assert.equal(prettyAmount(0.35), "0.35");
    assert.equal(prettyAmount(0.047169), "0.047169");
    assert.equal(plainAmount(2.5), "2.5");
    assert.equal(amountDraftText("2½"), "2.5");
    assert.equal(amountDraftText("1,000"), "1,000", "a refused entry stays as typed so Save can refuse it");
    assert.equal(amountFieldText("0.25"), "¼");
    assert.equal(amountFieldText(""), "");
  });

  test("the readback says what will be logged, or what is still missing", () => {
    assert.equal(doseReadback(250, "mcg"), "Logs 250 mcg each time.");
    assert.equal(doseReadback(0.25, "mL"), "Logs ¼ mL each time.");
    assert.equal(doseReadback(2.5, "units"), "Logs 2½ units each time.");
    assert.equal(doseReadback(250, ""), "Pick a unit.");
    assert.equal(doseReadback(null, "mcg"), "Type an amount or use the steps.");
    assert.equal(doseReadback(null, ""), "Type an amount or use the steps.");
    assert.equal(doseReadback(0, "mg"), "Type an amount or use the steps.");
  });

  test("the sun path maps 05:00 to 23:00 onto the arc and back in 5 minute steps", () => {
    assert.deepEqual({ ...ARC }, { startMin: 300, endMin: 1380, cx: 150, rx: 130, hy: 100, ry: 80, width: 300, height: 122 });
    const near = (point, x, y) => assert.ok(Math.abs(point[0] - x) < 1e-6 && Math.abs(point[1] - y) < 1e-6, `${point} vs ${x},${y}`);
    near(arcPoint(300), 20, 100);
    near(arcPoint(840), 150, 20);
    near(arcPoint(1380), 280, 100);
    near(arcPoint(570), 150 + 130 * Math.cos(Math.PI * 0.75), 100 - 80 * Math.sin(Math.PI * 0.75));
    assert.equal(arcMinutesAt(20), 300);
    assert.equal(arcMinutesAt(150), 840);
    assert.equal(arcMinutesAt(280), 1380);
    assert.equal(arcMinutesAt(-40), 300, "left of the arc clamps to 05:00");
    assert.equal(arcMinutesAt(999), 1380, "right of the arc clamps to 23:00");
    assert.equal(arcMinutesAt(NaN), null);
    assert.equal(arcMinutesAt("150"), null);
    for (let minutes = 300; minutes <= 1380; minutes += 5) assert.equal(arcMinutesAt(arcPoint(minutes)[0]), minutes, String(minutes));
    for (let x = 0; x <= 300; x += 7) {
      const minutes = arcMinutesAt(x);
      assert.equal(minutes % 5, 0);
      assert.ok(minutes >= 300 && minutes <= 1380);
    }

    assert.deepEqual(arcSegments({ startMin: 300, endMin: 660 }), [[300, 660]]);
    assert.deepEqual(arcSegments({ startMin: 0, endMin: 420 }), [[300, 420]], "cut to the part of the day the arc shows");
    assert.deepEqual(arcSegments({ startMin: 1260, endMin: 1500 }), [[1260, 1380]]);
    assert.deepEqual(arcSegments({ startMin: 1320, endMin: 1800 }), [[300, 360], [1320, 1380]], "a window past midnight shows both ends");
    assert.deepEqual(arcSegments({ startMin: 60, endMin: 240 }), []);
    assert.deepEqual(arcSegments(null), []);
    assert.equal(arcSegmentPath(300, 1380), "M20 100 A130 80 0 0 1 280 100");

    assert.equal(clockMinutes("07:45"), 465);
    assert.equal(clockMinutes("23:00"), 1380);
    for (const bad of ["", "7:45 am", "24:00", "12:60", null]) assert.equal(clockMinutes(bad), null, String(bad));
  });

  test("the arc readout names the time, the routine, or what to do next", () => {
    const morning = { name: "Morning", window: { startMin: 300, endMin: 660 } };
    const night = { name: "Night", window: { startMin: 1020, endMin: 1380 } };
    const routines = [morning, night];
    assert.deepEqual(arcReadout({ timeMin: 465, routines, picked: [morning] }), { big: "07:45", sub: "in Morning · tap to move" });
    assert.deepEqual(arcReadout({ timeMin: 840, routines, picked: [morning] }), { big: "14:00", sub: "your own time · tap to move" });
    assert.deepEqual(arcReadout({ timeMin: null, routines, picked: [morning] }), { big: "Morning", sub: "at the routine's start, 05:00" });
    assert.deepEqual(arcReadout({ timeMin: null, routines, picked: [morning, night] }), { big: "2 routines", sub: "each at its own start" });
    assert.deepEqual(arcReadout({ timeMin: null, routines, picked: [] }), { big: "No routine", sub: "pick one below, or tap for a time" });
  });

  test("a new item starts with no amount, no unit and no time", () => {
    signIn();
    app.openRoutineItemEditor(MORNING, "");
    assert.equal(app.ui.sheet, "routines-item");
    assert.equal(app.ui.sd.amount, "");
    assert.equal(app.ui.sd.unit, "");
    assert.equal(app.ui.sd.time, "");
    assert.equal(app.ui.sd.kind, "check");
    let html = routineItemSheetHTML();
    assert.match(html, /<h3>Add item<\/h3>/);
    assert.match(html, /id="dr-item-name"[^>]*maxlength="80"[^>]*placeholder="What is it\?"[^>]*value=""/);
    assert.match(html, /id="dr-item-amount"[^>]*placeholder="0"[^>]*value=""/);
    assert.match(html, /id="dr-item-time"[^>]*value=""/);
    assert.match(html, /data-empty="true"/);
    assert.equal(html.includes('data-unit="mcg" aria-pressed="true"'), false);
    assert.equal((html.match(/data-action="routines-item-unit"[^>]*aria-pressed="false"/g) || []).length, 5);
    assert.equal((html.match(/data-action="routines-item-type"[^>]*aria-pressed="true"/g) || []).length, 0);

    /* Picking Dose opens the card and still fills nothing in. */
    app.ui.sd.kind = "dose";
    html = routineItemSheetHTML();
    assert.match(html, /id="dr-item-amount"[^>]*value=""/);
    assert.match(html, /<em class="dr-unit-out dr-unit-none"[^>]*>unit<\/em>/);
    assert.match(html, /Type an amount or use the steps\./);
    assert.match(html, /class="dr-gauge"[^>]*aria-hidden="true">/, "the scale is drawn, with nothing filled");
    assert.match(html, /class="dr-gauge-fill"/);
    assert.match(html, /<rect[^>]*width="0"[^>]*class="dr-gauge-fill"\/>/);
    assert.equal((html.match(/data-action="routines-item-unit"[^>]*aria-pressed="true"/g) || []).length, 0);
    assert.match(html, /data-action="routines-item-amount-clear"[^>]* disabled/);

    /* An amount without a unit asks for the unit, and Save refuses it. */
    app.ui.sd.amount = "250";
    assert.match(routineItemSheetHTML(), /Pick a unit\./);
    fields = { "#dr-item-name": { value: "Example Compound A" }, "#dr-item-amount": { value: "250" } };
    assert.equal(app.commitRoutineItemSheet(), false);
    assert.equal(itemNamed("Example Compound A"), undefined);
    app.ui.sd.unit = "mcg";
    assert.match(routineItemSheetHTML(), /Logs 250 mcg each time\./);
    assert.equal(app.commitRoutineItemSheet(), true);
    const saved = itemNamed("Example Compound A");
    const compound = app.state.dailyRoutines.compounds.find((row) => row.id === saved.compoundId);
    assert.equal(compound.amount, 250);
    assert.equal(compound.unit, "mcg");
  });

  test("the safety lines are word for word, and nothing new is offered", () => {
    signIn();
    assert.equal(addRoutineItem(app.state, MORNING, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg", type: "peptide" }), true);
    openSaved("Example Compound A");
    const html = routineItemSheetHTML();
    assert.ok(html.includes(`<p class="dr-is-help">${HELP}</p>`));
    assert.ok(html.includes(`<span class="dr-evidence">${EVIDENCE}</span>`));
    assert.ok(html.includes("<span>Tick it once when it&#39;s done.</span>") || html.includes("<span>Tick it once when it's done.</span>"));
    assert.ok(html.includes("<span>Log the amount and unit you type.</span>"));
    assert.ok(html.includes("<b>Reconstitution calculator</b><small>Works out mL from your vial and water</small>"));
    assert.ok(html.includes("Optional with a type. It shows on its tab either way."));
    app.ui.sd.type = "";
    assert.ok(routineItemSheetHTML().includes("The same item can sit in more than one routine. Logging it once covers all of them."));
    app.ui.sd.type = "peptide";
    assert.doesNotMatch(html, /From the library|library|suggested|recommended|typical|usual dose|<select|<a\b|href=/i);

    assert.equal(openReconstitutionFromItem(), true);
    const calc = reconstitutionSheetHTML();
    assert.ok(calc.includes(`<p class="dr-is-help">${INTRO}</p>`));
    assert.ok(calc.includes(`<p class="dr-calc-note">${NOTE}</p>`));
    assert.ok(calc.includes(SAVE_SUB));
    assert.ok(calc.includes(">Save as note on this item</button>"));
    assert.ok(calc.includes(">U-100 SYRINGE</text>"));
    assert.doesNotMatch(calc, /From the library|suggested|recommended|typical|usual dose|<select|<a\b|href=|<form[\s>]/i);
    assert.match(calc, /class="dr-rc-res"[^>]*aria-live="polite"/);
  });

  test("Log as is a radio group, and a closed dose card leaves the tab order", () => {
    signIn();
    app.openRoutineItemEditor(MORNING, "");
    let html = routineItemSheetHTML();
    assert.match(html, /class="dr-is-kinds" role="radiogroup" aria-labelledby="dr-kind-label"/);
    assert.match(html, /role="radio"[^>]*data-kind="check" aria-checked="true" tabindex="0"/);
    assert.match(html, /role="radio"[^>]*data-kind="dose" aria-checked="false" tabindex="-1"/);
    assert.match(html, /id="dr-item-dose"[^>]*data-open="false" aria-hidden="true" inert>/);
    let closed = dosePart(html);
    const controls = closed.match(/<(?:button|input)\b[^>]*>/g) || [];
    assert.ok(controls.length >= 13, "amount, clear, five units, six steps and the calculator link");
    for (const control of controls) assert.match(control, /tabindex="-1"/, control);

    app.ui.sd.kind = "dose";
    html = routineItemSheetHTML();
    assert.match(html, /role="radio"[^>]*data-kind="dose" aria-checked="true" tabindex="0"/);
    assert.match(html, /role="radio"[^>]*data-kind="check" aria-checked="false" tabindex="-1"/);
    assert.match(html, /id="dr-item-dose"[^>]*data-open="true" aria-hidden="false">/);
    closed = dosePart(html);
    assert.equal(closed.includes('tabindex="-1"'), false);
    assert.equal(closed.includes(" inert"), false);
    assert.match(closed, /class="dr-useg" role="group" aria-label="Unit"/);
    assert.match(closed, /id="dr-item-sum"[^>]*aria-live="polite"/);
  });

  test("step and clear taps change only the amount the person sees", async () => {
    signIn();
    assert.equal(addRoutineItem(app.state, MORNING, { name: "Example Compound A", kind: "dose", amount: 9.75, unit: "mg" }), true);
    openSaved("Example Compound A");
    fields = { "#dr-item-name": { value: "Example Compound A" }, "#dr-item-amount": { value: "9.75" } };
    let html = "";
    app.renderSheet = () => { html = routineItemSheetHTML(); fields["#dr-item-amount"].value = amountFieldText(app.ui.sd.amount); };

    await tap({ action: "routines-item-step", delta: "1" });
    assert.equal(app.ui.sd.amount, "10.75");
    assert.match(html, /id="dr-item-amount"[^>]*value="10¾"/);
    assert.deepEqual(stepDeltas(html, "routines-item-step").map((row) => row[0]), [-10, -5, -1, 1, 5, 10]);
    assert.match(html, /Logs 10¾ mg each time\./);

    /* A delta from another set does nothing. */
    await tap({ action: "routines-item-step", delta: "0.25" });
    assert.equal(app.ui.sd.amount, "10.75");
    await tap({ action: "routines-item-step", delta: "-10" });
    assert.equal(app.ui.sd.amount, "0.75");
    await tap({ action: "routines-item-step", delta: "-1" });
    assert.equal(app.ui.sd.amount, "0.75", "take-away never goes below zero");
    await tap({ action: "routines-item-step", delta: "-0.5" });
    await tap({ action: "routines-item-step", delta: "-0.25" });
    assert.equal(app.ui.sd.amount, "", "reaching zero clears the amount");
    assert.match(html, /Type an amount or use the steps\./);
    assert.equal(app.ui.sd.unit, "mg");

    /* A typed mixed amount is read before the step. */
    fields["#dr-item-amount"].value = "2½";
    assert.equal(stepRoutineItemAmount(0.25), true);
    assert.equal(app.ui.sd.amount, "2.75");
    assert.equal(clearRoutineItemAmount(), true);
    assert.equal(app.ui.sd.amount, "");
    assert.equal(app.ui.sd.unit, "mg");
    assert.equal(app.ui.sd.name, "Example Compound A");

    /* A check item has no amount to step. */
    app.ui.sd.kind = "check";
    assert.equal(stepRoutineItemAmount(1), false);
    assert.equal(app.ui.sd.amount, "");
    const stored = app.state.dailyRoutines.compounds.find((row) => row.id === itemNamed("Example Compound A").compoundId);
    assert.equal(stored.amount, 9.75, "nothing is written until Save");
  });

  test("the time row and the arc show the same time, and Clear goes back to the routine's start", () => {
    signIn();
    assert.equal(addRoutineItem(app.state, MORNING, { name: "Example zinc", kind: "check", time: "07:45" }), true);
    openSaved("Example zinc");
    let html = routineItemSheetHTML();
    assert.match(html, /id="dr-item-time"[^>]*type="time"[^>]*step="300"[^>]*value="07:45"/);
    assert.match(html, /data-empty="false"/);
    assert.match(html, /data-arc="true"[^>]*role="slider"[^>]*tabindex="0"[^>]*aria-valuemin="300" aria-valuemax="1380" aria-valuenow="465" aria-valuetext="07:45"/);
    assert.match(html, /data-live="arc-big">07:45</);
    assert.match(html, /data-live="arc-sub">in Morning · tap to move</);
    const [x, y] = arcPoint(465);
    assert.match(html, new RegExp(`<circle cx="${Math.round(x * 10) / 10}" cy="${Math.round(y * 10) / 10}" r="8" class="dr-is-pinh"/>`));
    assert.match(html, /data-action="routines-item-time-clear"(?![^>]* hidden)[^>]*>Clear</);

    /* Typing in the time field moves the pin. */
    fields = { "#dr-item-name": { value: "Example zinc" }, "#dr-item-time": { id: "dr-item-time", value: "14:00" } };
    assert.equal(noteRoutineItemField(fields["#dr-item-time"]), true);
    assert.equal(app.ui.sd.time, "14:00");
    html = routineItemSheetHTML();
    assert.match(html, /data-live="arc-big">14:00</);
    assert.match(html, /data-live="arc-sub">your own time · tap to move</);
    assert.match(html, /<circle cx="150" cy="20" r="8" class="dr-is-pinh"\/>/);

    assert.equal(clearRoutineItemTime(), true);
    assert.equal(app.ui.sd.time, "");
    fields["#dr-item-time"].value = "";
    html = routineItemSheetHTML();
    assert.match(html, /data-empty="true"/);
    assert.match(html, /<span class="dr-is-tph" aria-hidden="true">Routine start<\/span>/);
    assert.match(html, /data-live="arc-big">Morning</);
    assert.match(html, /data-live="arc-sub">at the routine&#39;s start, 05:00</);
    assert.equal(html.includes("dr-is-pinh"), false);
    assert.match(html, /data-action="routines-item-time-clear"[^>]* hidden/);
  });

  test("routines draw from the real blocks, picked ones thick, hidden ones left out", () => {
    signIn();
    app.openRoutineItemEditor(MORNING, "");
    let html = routineItemSheetHTML();
    assert.match(html, /class="dr-is-seg"[^>]*data-color="citrus" data-on="true" d="M20 100 A130 80 0 0 1 85 30\.7"/);
    assert.match(html, /class="dr-is-seg"[^>]*data-color="pink" data-on="false"/);
    assert.match(html, new RegExp(`data-action="routines-item-block" data-block-id="${MORNING}" data-color="citrus" aria-pressed="true"`));
    assert.match(html, new RegExp(`data-action="routines-item-block" data-block-id="${NIGHT}" data-color="pink" aria-pressed="false"`));
    assert.match(html, /class="dr-is-legend" role="group" aria-label="Routines"/);

    app.ui.sd.blockIds = [MORNING, NIGHT];
    html = routineItemSheetHTML();
    assert.match(html, /data-color="pink" data-on="true"/);
    assert.match(html, /data-live="arc-big">2 routines</);
    assert.match(html, /data-live="arc-sub">each at its own start</);

    const night = app.state.dailyRoutines.blocks.find((block) => block.id === NIGHT);
    night.hidden = true;
    app.ui.sd.blockIds = [MORNING];
    html = routineItemSheetHTML();
    assert.equal(html.includes(`data-block-id="${NIGHT}"`), false);
    assert.equal(html.includes('data-color="pink"'), false);
  });

  test("the calculator link shows only for a peptide logged as a dose", () => {
    signIn();
    app.openRoutineItemEditor(MORNING, "");
    const link = () => routineItemSheetHTML().match(/<button[^>]*data-action="routines-item-calc"[^>]*>/)[0];
    assert.match(link(), / hidden/);
    app.ui.sd.type = "peptide";
    assert.match(link(), / hidden/, "a peptide logged as a check has no link");
    app.ui.sd.kind = "dose";
    assert.doesNotMatch(link(), / hidden|tabindex/);
    app.ui.sd.type = "supplement";
    assert.match(link(), / hidden/);
    app.ui.sd.type = "";
    assert.match(link(), / hidden/);
  });

  test("the calculator takes the typed amount and unit and nothing else", () => {
    signIn();
    app.openRoutineItemEditor(MORNING, "");
    Object.assign(app.ui.sd, { kind: "dose", type: "peptide" });
    fields = { "#dr-item-name": { value: "Example Compound A" }, "#dr-item-amount": { value: "250" } };
    app.ui.sd.unit = "mcg";
    assert.equal(openReconstitutionFromItem(), true);
    assert.equal(app.ui.sheet, "routines-calc");
    assert.equal(app.ui.sd.dose, "250");
    assert.equal(app.ui.sd.doseUnit, "mcg");
    assert.equal(app.ui.sd.vial, "");
    assert.equal(app.ui.sd.water, "");
    assert.equal(app.ui.sd.itemId, "");
    let html = reconstitutionSheetHTML();
    assert.match(html, /id="dr-calc-dose"[^>]*value="250"/);
    assert.match(html, /data-action="routines-calc-dose-unit" data-unit="mcg" aria-pressed="true"/);
    assert.match(html, /id="dr-calc-vial"[^>]*value=""/);
    assert.match(html, /id="dr-calc-water"[^>]*value=""/);
    assert.match(html, /data-calc="empty"/);
    assert.match(html, /<b data-live="volume">–<\/b>/);
    assert.equal(closeReconstitution(), true);

    /* Each unit the calculator knows is carried as typed. */
    for (const [typed, unit, shown] of [["2½", "mg", "2.5"], ["10", "IU", "10"], ["1/4", "units", "0.25"]]) {
      fields["#dr-item-amount"].value = typed;
      app.ui.sd.unit = unit;
      assert.equal(openReconstitutionFromItem(), true);
      assert.equal(app.ui.sd.dose, shown, typed);
      assert.equal(app.ui.sd.doseUnit, unit);
      assert.equal(closeReconstitution(), true);
    }

    /* mL is not a calculator unit, and a missing or refused amount is not carried. */
    for (const [typed, unit] of [["2", "mL"], ["", "mcg"], ["1,000", "mcg"], ["250", ""]]) {
      fields["#dr-item-amount"].value = typed;
      app.ui.sd.unit = unit;
      assert.equal(openReconstitutionFromItem(), true);
      assert.equal(app.ui.sd.dose, "", `${typed} ${unit}`);
      assert.equal(app.ui.sd.doseUnit, "mcg");
      assert.equal(app.ui.sd.vial, "");
      assert.equal(app.ui.sd.water, "");
      assert.match(reconstitutionSheetHTML(), /id="dr-calc-dose"[^>]*value=""/);
      assert.equal(closeReconstitution(), true);
    }

    /* Outside the item sheet there is nothing to carry. */
    app.ui.sheet = null;
    assert.equal(openReconstitutionFromItem(), false);
  });

  test("Back, Close and the X put every item field back as it was", async () => {
    signIn();
    app.openRoutineItemEditor(MORNING, "");
    Object.assign(app.ui.sd, { kind: "dose", type: "peptide", unit: "mcg", blockIds: [MORNING, NIGHT] });
    fields = {
      "#dr-item-name": { value: "Example Compound A" },
      "#dr-item-amount": { value: "250" },
      "#dr-item-time": { value: "07:45" },
      "#dr-item-on-hand": { value: "20" },
      "#dr-item-mixed-on": { value: "2026-11-10" },
    };
    const typed = { itemId: null, blockId: MORNING, name: "Example Compound A", kind: "dose", amount: "250", unit: "mcg", type: "peptide", time: "07:45", onHand: "20", mixedOn: "2026-11-10", blockIds: [MORNING, NIGHT] };

    for (const leave of [{ action: "routines-calc-back" }, { action: "sheet-close" }]) {
      await tap({ action: "routines-item-calc" });
      assert.equal(app.ui.sheet, "routines-calc", leave.action);
      const calc = reconstitutionSheetHTML();
      assert.match(calc, /class="dr-rc-back" data-action="routines-calc-back"><span aria-hidden="true">‹<\/span> Add item<\/button>/);
      assert.equal(calc.includes("Save as note on this item"), false, "an unsaved item has no note to save to");
      /* Work in the calculator, then leave. */
      fields["#dr-calc-vial"] = { value: "5" };
      fields["#dr-calc-water"] = { value: "2" };
      fields["#dr-calc-dose"] = { value: "500" };
      assert.equal(stepReconstitutionField("dose", 10), true);
      assert.equal(app.ui.sd.dose, "510");
      delete fields["#dr-calc-vial"];
      delete fields["#dr-calc-water"];
      delete fields["#dr-calc-dose"];

      await tap(leave);
      assert.equal(app.ui.sheet, "routines-item", leave.action);
      assert.deepEqual(app.ui.sd, typed, leave.action);
      const html = routineItemSheetHTML();
      assert.match(html, /id="dr-item-name"[^>]*value="Example Compound A"/);
      assert.match(html, /id="dr-item-amount"[^>]*value="250"/, "the calculator does not write the amount back");
      assert.match(html, /data-unit="mcg" aria-pressed="true"/);
      assert.match(html, /id="dr-item-time"[^>]*value="07:45"/);
      assert.match(html, /id="dr-item-on-hand"[^>]*value="20"/);
      assert.match(html, /id="dr-item-mixed-on"[^>]*value="2026-11-10"/);
      assert.match(html, new RegExp(`data-block-id="${NIGHT}"[^>]*aria-pressed="true"`));
      assert.match(html, /data-type="peptide" aria-pressed="true"/);
    }
    assert.equal(itemNamed("Example Compound A"), undefined, "leaving the calculator saves nothing");

    /* A calculator opened on its own still just closes. */
    app.ui.sheet = null;
    assert.equal(openReconstitution(), true);
    assert.equal(reconstitutionSheetHTML().includes("dr-rc-back"), false);
    assert.equal(closeReconstitution(), false);
    await tap({ action: "sheet-close" });
    assert.equal(app.ui.sheet, null);
  });

  test("Save in the calculator shows only for a saved dose item", () => {
    signIn();
    assert.equal(addRoutineItem(app.state, MORNING, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg", type: "peptide" }), true);
    assert.equal(addRoutineItem(app.state, MORNING, { name: "Example Check", kind: "check", type: "peptide" }), true);
    const saveShown = () => reconstitutionSheetHTML().includes('data-action="routines-calc-save"');

    /* Saved dose item: Save and its sub line. */
    const item = openSaved("Example Compound A");
    fields = { "#dr-item-name": { value: "Example Compound A" }, "#dr-item-amount": { value: "250" } };
    assert.equal(openReconstitutionFromItem(), true);
    assert.equal(app.ui.sd.itemId, item.id);
    assert.equal(saveShown(), true);
    assert.ok(reconstitutionSheetHTML().includes(SAVE_SUB));
    assert.match(reconstitutionSheetHTML(), /class="dr-rc-back" data-action="routines-calc-back"><span aria-hidden="true">‹<\/span> Edit item<\/button>/);

    /* Saving the note returns to the item sheet with its fields. */
    fields["#dr-calc-vial"] = { value: "5" };
    fields["#dr-calc-water"] = { value: "2" };
    fields["#dr-calc-dose"] = { value: "250" };
    assert.equal(saveReconstitutionNote(), true);
    assert.equal(app.ui.sheet, "routines-item");
    assert.equal(app.ui.sd.itemId, item.id);
    assert.equal(app.ui.sd.amount, "250");
    const expected = reconstitutionResult({ vialAmount: 5, waterMl: 2, doseAmount: 250, vialUnit: "mg", doseUnit: "mcg" });
    assert.equal(itemNamed("Example Compound A").note, reconstitutionNoteText(expected));
    assert.equal(itemNamed("Example Compound A").note, "0.1 mL · 10 U-100 units. What you entered. Not a recommendation.");
    delete fields["#dr-calc-vial"];
    delete fields["#dr-calc-water"];
    delete fields["#dr-calc-dose"];

    /* A saved check item being switched to Dose is not a saved dose yet. */
    const check = openSaved("Example Check");
    app.ui.sd.kind = "dose";
    fields = { "#dr-item-name": { value: "Example Check" }, "#dr-item-amount": { value: "1" } };
    assert.equal(openReconstitutionFromItem(), true);
    assert.equal(app.ui.sd.itemId, "");
    assert.equal(saveShown(), false);
    assert.equal(reconstitutionSheetHTML().includes(SAVE_SUB), false);
    assert.equal(saveReconstitutionNote(), false);
    assert.equal(itemNamed("Example Check").note, check.note);
    assert.equal(closeReconstitution(), true);

    /* A new item, and the calculator on its own. */
    app.openRoutineItemEditor(MORNING, "");
    Object.assign(app.ui.sd, { kind: "dose", type: "peptide", unit: "mcg" });
    fields = { "#dr-item-name": { value: "" }, "#dr-item-amount": { value: "250" } };
    assert.equal(openReconstitutionFromItem(), true);
    assert.equal(saveShown(), false);
    app.ui.sheet = null;
    assert.equal(openReconstitution(), true);
    assert.equal(saveShown(), false);
    assert.equal(openReconstitution(item.id), true);
    assert.equal(saveShown(), true);
  });

  test("the answer and the syringe show the same numbers as the arithmetic lines", () => {
    signIn();
    assert.equal(openReconstitution(), true);
    Object.assign(app.ui.sd, { vial: "5", water: "2", dose: "250", vialUnit: "mg", doseUnit: "mcg" });
    let html = reconstitutionSheetHTML();
    assert.match(html, /class="dr-rc-res"[^>]*data-calc="ready"/);
    assert.match(html, /<span>Volume to draw<\/span><b data-live="volume">0\.1<small>mL<\/small><\/b>/);
    assert.match(html, /<span>U-100 units<\/span><b data-live="units">10<\/b>/);
    assert.ok(html.includes("<p>Volume to draw: 0.25 mg ÷ 2.5 mg/mL = 0.1 mL</p>"));
    assert.ok(html.includes(`<div id="dr-calc-result" data-live="math">${reconstitutionLiveHTML()}</div>`), "the app's own lines sit under the answer unchanged");
    assert.equal(syringeFillWidth(10), 24);
    assert.match(html, /<rect[^>]*width="24"[^>]*class="dr-syr-liq"/);
    assert.equal(html.includes("OVER 100 UNITS"), false);

    /* Steps and Clear work on one field at a time. */
    assert.equal(stepReconstitutionField("water", 0.5), true);
    assert.equal(app.ui.sd.water, "2.5");
    assert.equal(stepReconstitutionField("water", 5), false, "5 is not a step for 2.5");
    assert.equal(stepReconstitutionField("nope", 1), false);
    assert.equal(clearReconstitutionField("water"), true);
    assert.equal(app.ui.sd.water, "");
    assert.equal(app.ui.sd.vial, "5");
    assert.equal(app.ui.sd.dose, "250");
    assert.match(reconstitutionSheetHTML(), /data-calc="empty"/);

    /* Past the end of a U-100 syringe the bar stays full and says so. */
    assert.equal(syringeFillWidth(100), 240);
    assert.equal(syringeFillWidth(250), 240);
    assert.equal(syringeFillWidth(null), 0);
    assert.equal(syringeFillWidth(-5), 0);
    assert.match(syringeHTML(250), />OVER 100 UNITS<\/text>/);
    assert.equal(syringeHTML(100).includes("OVER 100 UNITS"), false);
    assert.equal((syringeHTML(10).match(/class="dr-syr-tk(?: dr-syr-tk-w)?"/g) || []).length, 51, "a tick every 2 units");
    assert.deepEqual([...syringeHTML(10).matchAll(/text-anchor="middle">(\d+)<\/text>/g)].map((m) => Number(m[1])), [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });

  test("the sheets are wired, cached and styled from theme tokens", () => {
    const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
    const actions = read("../logger/js/shell/actions.js");
    for (const action of ["routines-item-step", "routines-item-amount-clear", "routines-item-time-clear", "routines-item-calc", "routines-calc-back", "routines-calc-step", "routines-calc-clear"]) {
      assert.ok(actions.includes(`case "${action}":`), action);
    }
    assert.equal(actions.includes("routines-item-quarter"), false);
    const sw = read("../logger/sw.js");
    assert.match(sw, /const CACHE = "insight-shell-v91"/);
    assert.equal(sw.split('"./js/pages/daily-routines-sheet-parts.js"').length, 2);
    assert.match(read("../logger/js/sentry.js"), /insight-shell-v91/);

    const css = read("../logger/css/routines.css");
    const start = css.indexOf("/* Add item sheet and reconstitution calculator.");
    assert.ok(start > 0);
    const sheet = css.slice(start).replace(/\/\*[\s\S]*?\*\//g, "");
    /* White is the one fixed color: a highlight over a pastel card. */
    const fixed = (sheet.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/gi) || []).filter((color) => !/^#fff$/i.test(color) && color !== "rgba(255, 255, 255, .42)");
    assert.deepEqual(fixed, []);
    for (const token of ["--green", "--lav", "--dr-c", "--accent-text", "--ink", "--on-pastel", "--bg", "--raised", "--line", "--text", "--muted"]) {
      assert.ok(sheet.includes(`var(${token})`), token);
    }
    assert.doesNotMatch(sheet, /transition|animation|@keyframes/, "motion sits in the no-preference block only");
    const motion = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: no-preference)"), css.indexOf("@media (prefers-reduced-motion: reduce)", css.lastIndexOf("@media (prefers-reduced-motion: no-preference)")));
    for (const rule of [".dr-is-reveal {", ".dr-is-kind {", ".dr-step {", ".dr-is-seg {", ".dr-syr-liq {", "@keyframes dr-bump"]) assert.ok(motion.includes(rule), rule);
    assert.match(sheet, /\.dr-step \{[^}]*min-height: 44px/);
    assert.match(sheet, /\.dr-is-kind \{[^}]*min-height: 44px/);
    assert.match(sheet, /\.dr-is-type i \{[^}]*width: 44px;[^}]*height: 44px/);
    assert.match(sheet, /\.dr-is-arc \{[^}]*touch-action: pan-y/);
  });
});
