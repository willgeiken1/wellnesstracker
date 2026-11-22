import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/* Loads the real cloud and timer modules with an in-memory localStorage and a bare document. */
const store = {};
globalThis.localStorage = {
  getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
globalThis.window = globalThis;
globalThis.document = { addEventListener() {}, documentElement: { dataset: {}, style: { setProperty() {} } }, querySelector: () => null };
const { app } = await import("../logger/js/runtime.js");
await import("../logger/js/data/state.js");
const { cloudStatusText } = await import("../logger/js/shared/cloud.js");
/* timer.js starts the 500 ms tick on import; keep it from holding the test process open. */
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = () => 0;
const { keyboardInset } = await import("../logger/js/shell/timer.js");
globalThis.setInterval = realSetInterval;
app.schedulePush = () => {};

const toasts = [];
app.toast = (m) => toasts.push(m);

function failingServer(error) {
  app.session = { user: { id: "11111111-1111-4111-8111-111111111111" } };
  app.sb = { rpc: async () => ({ data: null, error }) };
}

test("a failed backup says so once, and a second failure within half an hour stays quiet", async () => {
  toasts.length = 0; app.resetCloudFailToast(); app.cloudFailAt = 0;
  failingServer({ code: "500", message: "server error" });
  await app.cloudPush();
  assert.equal(toasts.length, 1);
  assert.match(toasts[0], /Couldn't back up just now/);
  assert.ok(app.cloudFailAt > 0);
  await app.cloudPush();
  assert.equal(toasts.length, 1);
});

test("a thrown push counts as a failure too", async () => {
  toasts.length = 0; app.resetCloudFailToast(); app.cloudFailAt = 0;
  app.session = { user: { id: "11111111-1111-4111-8111-111111111111" } };
  app.sb = { rpc: async () => { throw new Error("Load failed"); } };
  await app.cloudPush();
  assert.equal(toasts.length, 1);
  assert.ok(app.cloudFailAt > 0);
});

test("an offline phone gets no notice, because offline saves are expected and retried", async () => {
  toasts.length = 0; app.resetCloudFailToast(); app.cloudFailAt = 0;
  const desc = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value: { onLine: false }, configurable: true });
  try {
    failingServer({ code: "500", message: "server error" });
    await app.cloudPush();
    assert.equal(toasts.length, 0);
    assert.ok(app.cloudFailAt > 0);
  } finally {
    if (desc) Object.defineProperty(globalThis, "navigator", desc); else delete globalThis.navigator;
  }
});

test("a good backup clears the failure", async () => {
  app.cloudFailAt = Date.now();
  app.session = { user: { id: "11111111-1111-4111-8111-111111111111" } };
  app.sb = { rpc: async () => ({ data: {}, error: null }) };
  await app.cloudPush();
  assert.equal(app.cloudFailAt, 0);
  assert.ok(app.state.lastCloud > 0);
});

test("the Settings line says when a backup failed, with the day when it isn't today", () => {
  const now = new Date(2026, 10, 22, 15, 0).getTime();
  const earlier = new Date(2026, 10, 22, 9, 30).getTime();
  const yesterday = new Date(2026, 10, 21, 20, 5).getTime();
  assert.equal(cloudStatusText(null, 0, now), "On");
  assert.match(cloudStatusText(earlier, 0, now), /^On · saved 9:30/);
  assert.match(cloudStatusText(earlier, now, now), /^Couldn't back up · last saved 9:30/);
  assert.match(cloudStatusText(yesterday, now, now), /^Couldn't back up · last saved Nov 21, 8:05/);
  assert.equal(cloudStatusText(null, now, now), "Couldn't back up yet");
  assert.match(cloudStatusText(now, earlier, now), /^On · saved/);
});

test("the keyboard lift ignores the address bar and follows a real keyboard", () => {
  assert.equal(keyboardInset(844, 844, 0), 0);
  assert.equal(keyboardInset(844, 790, 0), 0);
  assert.equal(keyboardInset(844, 508, 0), 336);
  assert.equal(keyboardInset(844, 508, 40), 296);
});

test("an open sheet sits above the keyboard and fits the visible height", () => {
  const css = readFileSync(new URL("../logger/css/polish.css", import.meta.url), "utf8");
  assert.match(css, /#sheet \{ bottom: var\(--kb, 0px\);/);
  assert.match(css, /\.sheet-card \{ max-height: min\(88vh, calc\(var\(--vvh, 100vh\) - 24px\)\); \}/);
  const timer = readFileSync(new URL("../logger/js/shell/timer.js", import.meta.url), "utf8");
  assert.match(timer, /visualViewport\.addEventListener\("resize", \(\) => \{ syncKeyboard\(\);/);
  assert.match(timer, /scrollIntoView\(\{ block: "nearest" \}\)/);
});

test("the fallback upsert counts its failures too", async () => {
  toasts.length = 0; app.resetCloudFailToast(); app.cloudFailAt = 0;
  app.session = { user: { id: "11111111-1111-4111-8111-111111111111" } };
  app.sb = {
    rpc: async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } }),
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      upsert: async () => ({ error: { code: "500", message: "server error" } }),
    }),
  };
  await app.cloudPush();
  assert.ok(app.cloudFailAt > 0);
  assert.equal(toasts.length, 1);
});

test("a failed backup leaves a live Undo toast alone, and the next failure can still say so", async () => {
  toasts.length = 0; app.resetCloudFailToast(); app.cloudFailAt = 0;
  failingServer({ code: "500", message: "server error" });
  app.toastUndo = () => {};
  try {
    await app.cloudPush();
    assert.equal(toasts.length, 0);
    assert.ok(app.cloudFailAt > 0);
  } finally { app.toastUndo = null; }
  await app.cloudPush();
  assert.equal(toasts.length, 1);
});

test("signing out clears the backup failure, so the next account starts clean", async () => {
  toasts.length = 0; app.resetCloudFailToast();
  failingServer({ code: "500", message: "server error" });
  await app.cloudPush();
  assert.ok(app.cloudFailAt > 0);
  const keep = { renderOnboard: app.renderOnboard, render: app.render, save: app.save };
  app.renderOnboard = () => {}; app.render = () => {}; app.save = () => {};
  app.ui = app.ui || {};
  try { await app.signOut({ skipPush: true, quiet: true }); } finally { Object.assign(app, keep); }
  assert.equal(app.cloudFailAt, 0);
  failingServer({ code: "500", message: "server error" });
  await app.cloudPush();
  assert.equal(toasts.length, 2);
});

test("Settings shows the backup status line, and the keyboard lift follows panning as well as resizing", () => {
  const settings = readFileSync(new URL("../logger/js/pages/settings.js", import.meta.url), "utf8");
  assert.match(settings, /Cloud backup<\/span><span class="sub" data-cloud-status>\$\{app\.esc\(app\.cloudStatusText \? app\.cloudStatusText\(app\.state\.lastCloud, app\.cloudFailAt\)/);
  const timer = readFileSync(new URL("../logger/js/shell/timer.js", import.meta.url), "utf8");
  assert.match(timer, /visualViewport\.addEventListener\("scroll", syncKeyboard\)/);
});
