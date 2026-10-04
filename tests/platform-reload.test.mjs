import assert from "node:assert/strict";
import test from "node:test";

// platform.js touches browser globals at import; stub the few it needs.
const define = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
define("window", { addEventListener() {} });
define("navigator", { userAgent: "node", platform: "Linux", maxTouchPoints: 0 });
define("location", { protocol: "http:", hostname: "example.test" });
const { app } = await import("../logger/js/runtime.js");
await import("../logger/js/shared/platform.js");

const doc = (over = {}) => ({ activeElement: { tagName: "BODY" }, querySelector: () => null, ...over });
const idle = { sessions: [{ finishedAt: "2026-10-04T10:00:00" }] };

test("safe when nothing is focused, open, or in progress", () => {
  assert.equal(app.reloadSafeNow(doc(), { sheet: null }, idle), true);
  assert.equal(app.reloadSafeNow(doc(), undefined, undefined), true);
});

test("focused input, textarea, select and contenteditable block the reload", () => {
  for (const tagName of ["INPUT", "textarea", "SELECT"]) {
    assert.equal(app.reloadSafeNow(doc({ activeElement: { tagName } }), {}, idle), false, tagName);
  }
  assert.equal(app.reloadSafeNow(doc({ activeElement: { tagName: "DIV", isContentEditable: true } }), {}, idle), false);
  assert.equal(app.reloadSafeNow(doc({ activeElement: { tagName: "BUTTON" } }), {}, idle), true);
});

test("an open sheet or dialog blocks the reload", () => {
  assert.equal(app.reloadSafeNow(doc(), { sheet: "food-add" }, idle), false);
  assert.equal(app.reloadSafeNow(doc({ querySelector: (q) => (q.includes(".sheet-card") ? {} : null) }), {}, idle), false);
});

test("a workout in progress blocks the reload; finished ones do not", () => {
  assert.equal(app.reloadSafeNow(doc(), {}, { sessions: [{ finishedAt: "x" }, { startedAt: "y" }] }), false);
  assert.equal(app.reloadSafeNow(doc(), {}, { sessions: [] }), true);
});
