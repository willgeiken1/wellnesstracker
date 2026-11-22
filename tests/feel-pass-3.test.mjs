import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/* Loads the real cloud, food and timer modules with an in-memory localStorage and a bare document. */
const store = {};
globalThis.localStorage = {
  getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
globalThis.window = globalThis;
const statusEl = { textContent: "" };
let active = null;
globalThis.document = {
  addEventListener() {},
  documentElement: { dataset: {}, style: { setProperty() {} } },
  querySelector: (sel) => (sel === "[data-cloud-status]" ? statusEl : null),
  get activeElement() { return active; },
};
const { app } = await import("../logger/js/runtime.js");
await import("../logger/js/data/state.js");
await import("../logger/js/shared/cloud.js");
await import("../logger/js/pages/food.js");
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = () => 0;
await import("../logger/js/shell/timer.js");
globalThis.setInterval = realSetInterval;
app.schedulePush = () => {};
app.toast = () => {};

test("an open Settings line changes in place when a backup fails and again when one works", async () => {
  app.resetCloudFailToast(); app.cloudFailAt = 0;
  app.session = { user: { id: "11111111-1111-4111-8111-111111111111" } };
  app.sb = { rpc: async () => ({ data: null, error: { code: "500", message: "server error" } }) };
  await app.cloudPush();
  assert.match(statusEl.textContent, /^Couldn't back up/);
  app.sb = { rpc: async () => ({ data: {}, error: null }) };
  await app.cloudPush();
  assert.match(statusEl.textContent, /^On · saved/);
  const settings = readFileSync(new URL("../logger/js/pages/settings.js", import.meta.url), "utf8");
  assert.match(settings, /<span class="sub" data-cloud-status>/);
});

test("a second barcode lookup drops the first, so a late answer can't replace the newer one", async () => {
  const realFetch = globalThis.fetch;
  const statuses = [];
  app.bcStatus = (m) => statuses.push(m);
  app.ui = { sheet: "food-barcode", sd: {} };
  let renders = 0;
  app.renderSheet = () => { renders++; };
  const pending = [];
  globalThis.fetch = (url, opts) => new Promise((resolve, reject) => {
    pending.push({ url, resolve });
    opts.signal.addEventListener("abort", () => { const e = new Error("aborted"); e.name = "AbortError"; reject(e); });
  });
  const product = (name) => ({ json: async () => ({ status: 1, product: { product_name: name, nutriments: { "energy-kcal_100g": 100 } } }) });
  try {
    const first = app.lookupBarcode("1111111111111");
    const second = app.lookupBarcode("2222222222222");
    await first;
    assert.ok(!statuses.some((m) => /taking too long|Couldn't reach/.test(m)), "the dropped lookup stays quiet");
    pending[1].resolve(product("Newer"));
    await second;
    assert.equal(app.ui.sd.product.name, "Newer");
    assert.equal(renders, 1);
  } finally { globalThis.fetch = realFetch; }
});

test("a slow keyboard brings the focused field back into view once it has resized", () => {
  let scrolled = 0;
  active = { tagName: "INPUT", closest: (s) => (s === ".sheet-card" ? {} : null), scrollIntoView: () => { scrolled++; } };
  app.keepFocusedFieldInView();
  assert.equal(scrolled, 1);
  active = { tagName: "BUTTON", closest: () => ({}), scrollIntoView: () => { scrolled++; } };
  app.keepFocusedFieldInView();
  active = { tagName: "INPUT", closest: () => null, scrollIntoView: () => { scrolled++; } };
  app.keepFocusedFieldInView();
  assert.equal(scrolled, 1);
  active = null;
  const timer = readFileSync(new URL("../logger/js/shell/timer.js", import.meta.url), "utf8");
  assert.match(timer, /addEventListener\("resize", \(\) => \{ syncKeyboard\(\); keepFocusedFieldInView\(\); \}\)/);
});

test("the toast's Undo reads in the toast's own color and is a full-size tap target", () => {
  const css = readFileSync(new URL("../logger/css/base.css", import.meta.url), "utf8");
  const rule = css.match(/#toast button \{[^}]*\}/)[0];
  assert.match(rule, /color: inherit/);
  assert.match(rule, /min-height: 44px/);
  assert.doesNotMatch(rule, /#0A7A3D/);
});
