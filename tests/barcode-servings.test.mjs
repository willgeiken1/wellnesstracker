import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { app } from "../logger/js/runtime.js";
import "../logger/js/pages/food.js";

const listeners = new Map();
globalThis.document = {
  addEventListener: (type, handler) => listeners.set(type, handler),
};
// Actions also wires the import-file input when the module loads.
app.$ = () => ({ addEventListener: () => {} });
await import("../logger/js/shell/actions.js");

let entries;
beforeEach(() => {
  entries = [];
  app.ui = {
    sheet: "food-barcode",
    sd: {
      meal: "lunch",
      unit: "serving",
      product: {
        name: "X",
        serving: { kcal: 101, p: 7, c: 13, f: 3 },
        per100: { kcal: 202, p: 14, c: 26, f: 6 },
      },
    },
  };
  app.esc = (value) => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  app.fmtNum = (value) => String(value);
  app.$ = () => null;
  app.renderSheet = () => {};
  app.render = () => {};
  app.toast = () => {};
  app.addEntry = (...args) => entries.push(args);
});

const options = (html) => [...html.matchAll(/<option value="([^"]+)"( selected)?>([^<]+)<\/option>/g)]
  .map(([, value, selected, label]) => ({ value, selected: !!selected, label }));

test("servings renders exactly eight multiplier options and keeps its label", () => {
  const html = app.foodBarcodeSheetHTML();
  assert.match(html, /<select class="text-in" id="bc-amt">/);
  assert.match(html, /<label class="field-label" for="bc-amt">How many servings<\/label>/);
  assert.doesNotMatch(html, /<input[^>]*id="bc-amt"/);
  assert.deepEqual(options(html).map(({ value, label }) => [value, label]), [
    ["0.5", "0.5×"], ["1", "1×"], ["1.5", "1.5×"], ["2", "2×"],
    ["2.5", "2.5×"], ["3", "3×"], ["3.5", "3.5×"], ["4", "4×"],
  ]);
});

for (const amt of [undefined, "7"]) {
  test(`servings defaults to one for ${amt} and previews one serving`, () => {
    if (amt !== undefined) app.ui.sd.amt = amt;
    const html = app.foodBarcodeSheetHTML();
    assert.deepEqual(options(html).filter((option) => option.selected).map((option) => option.value), ["1"]);
    assert.match(html, /<b>101 cal<\/b><span>P 7 · C 13 · F 3<\/span>/);
  });
}

test("serving selection compares amounts numerically", () => {
  app.ui.sd.amt = "2.50";
  const html = app.foodBarcodeSheetHTML();
  assert.deepEqual(options(html).filter((option) => option.selected).map((option) => option.value), ["2.5"]);
  assert.match(html, /<b>253 cal<\/b><span>P 18 · C 33 · F 8<\/span>/);
});

test("grams retains the decimal text input and its amount", () => {
  app.ui.sd.unit = "g";
  assert.match(app.foodBarcodeSheetHTML(), /<input class="text-in" id="bc-amt" inputmode="decimal" value="100">/);
  app.ui.sd.amt = "75.5";
  const html = app.foodBarcodeSheetHTML();
  assert.match(html, /<input class="text-in" id="bc-amt" inputmode="decimal" value="75.5">/);
  assert.doesNotMatch(html, /<select/);
});

for (const tagName of ["SELECT", "INPUT"]) {
  test(`amount input refreshes the preview and restores ${tagName} focus safely`, () => {
    let focused = false, caret, html;
    const replacement = { tagName, focus: () => { focused = true; } };
    if (tagName === "INPUT") replacement.setSelectionRange = (...args) => { caret = args; };
    else replacement.setSelectionRange = () => { throw new Error("Select has no caret"); };
    app.$ = (selector) => selector === "#bc-amt" ? replacement : null;
    app.renderSheet = () => { html = app.foodBarcodeSheetHTML(); };
    listeners.get("input")({ target: { id: "bc-amt", tagName, value: "2.5", dataset: {}, selectionStart: tagName === "INPUT" ? 2 : undefined } });
    assert.equal(app.ui.sd.amt, "2.5");
    assert.match(html, /<b>253 cal<\/b><span>P 18 · C 33 · F 8<\/span>/);
    assert.equal(focused, true);
    assert.deepEqual(caret, tagName === "INPUT" ? [2, 2] : undefined);
  });
}

test("saving 2.5 servings multiplies and rounds each macro and names the entry", async () => {
  app.$ = (selector) => selector === "#bc-amt" ? { tagName: "SELECT", value: "2.5" } : null;
  const button = { dataset: { action: "bc-save" } };
  await listeners.get("click")({ target: { closest: (selector) => selector === "[data-action]" ? button : null } });
  assert.deepEqual(entries, [["lunch", "X (2.5 servings)", {
    kcal: Math.round(101 * 2.5), p: Math.round(7 * 2.5), c: Math.round(13 * 2.5), f: Math.round(3 * 2.5),
  }, 1, "barcode"]]);
  assert.equal(app.ui.sheet, null);
});
