import assert from "node:assert/strict";
import test from "node:test";
import { app } from "../logger/js/runtime.js";
import "../logger/js/pages/food.js";

const listeners = new Map();
globalThis.document = { addEventListener: (type, handler) => listeners.set(type, handler) };
app.$ = () => ({ addEventListener: () => {} });
await import("../logger/js/shell/actions.js");

const click = (action) => listeners.get("click")({
  target: { closest: (sel) => (sel === "[data-action]" ? { dataset: { action } } : null) },
});

test("deleting a food offers Undo, and Undo brings back a copy in the same place", async () => {
  const day = "2026-11-22";
  const food = { days: { [day]: [
    { id: "a", meal: "lunch", name: "Rice", base: { kcal: 200, p: 4, c: 44, f: 1 }, servings: 1 },
    { id: "b", meal: "lunch", name: "Chicken", base: { kcal: 165, p: 31, c: 0, f: 4 }, servings: 2 },
    { id: "c", meal: "dinner", name: "Salad", base: { kcal: 80, p: 2, c: 9, f: 4 }, servings: 1 },
  ] }, deleted: [], saved: [] };
  let undo = null, message = "", n = 0;
  app.food = () => food;
  app.today = () => day;
  app.dayEntries = (d) => food.days[d] || [];
  app.foodTouch = () => {};
  app.render = () => {};
  app.fid = () => "new" + (++n);
  app.toast = (msg, fn) => { message = msg; undo = fn || null; };
  app.ui = { sheet: "food-manual", foodDay: day, sd: { edit: "b" } };

  await click("food-del");
  assert.equal(message, "Deleted.");
  assert.deepEqual(food.days[day].map((e) => e.id), ["a", "c"]);
  assert.deepEqual(food.deleted, ["b"]);
  assert.equal(typeof undo, "function");

  undo();
  const names = food.days[day].map((e) => e.name);
  assert.deepEqual(names, ["Rice", "Chicken", "Salad"]);
  const back = food.days[day][1];
  assert.equal(back.id, "new1", "the copy gets a new id, since the old id's delete may have synced");
  assert.equal(back.servings, 2);
  assert.deepEqual(back.base, { kcal: 165, p: 31, c: 0, f: 4 });
  assert.deepEqual(food.deleted, ["b"]);
});

test("a barcode lookup that hangs gives up with a plain message instead of spinning", async () => {
  const realFetch = globalThis.fetch, realSetTimeout = globalThis.setTimeout;
  let status = "", seenSignal = null;
  app.bcStatus = (m) => { status = m; };
  app.ui = { sheet: "food-barcode", sd: {} };
  globalThis.setTimeout = (fn, ms) => { if (ms === app.BARCODE_TIMEOUT_MS) { queueMicrotask(fn); return 1; } return realSetTimeout(fn, ms); };
  globalThis.fetch = (url, opts) => new Promise((resolve, reject) => {
    seenSignal = opts && opts.signal;
    seenSignal.addEventListener("abort", () => { const e = new Error("aborted"); e.name = "AbortError"; reject(e); });
  });
  try {
    await app.lookupBarcode("0123456789012");
    assert.ok(seenSignal, "the lookup passes an abort signal");
    assert.equal(status, "The food database is taking too long. Try again, or enter it manually.");
  } finally { globalThis.fetch = realFetch; globalThis.setTimeout = realSetTimeout; }
});

test("a lookup with no connection still says to check the connection", async () => {
  const realFetch = globalThis.fetch;
  let status = "";
  app.bcStatus = (m) => { status = m; };
  globalThis.fetch = async () => { throw new TypeError("Load failed"); };
  try {
    await app.lookupBarcode("0123456789012");
    assert.equal(status, "Couldn't reach the food database. Check your connection.");
  } finally { globalThis.fetch = realFetch; }
});
