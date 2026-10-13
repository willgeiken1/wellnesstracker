import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SW_SRC = readFileSync(new URL("../logger/sw.js", import.meta.url), "utf8");
const PLATFORM_SRC = readFileSync(new URL("../logger/js/shared/platform.js", import.meta.url), "utf8");
const HTML = readFileSync(new URL("../logger/index.html", import.meta.url), "utf8");
const LABEL = "Update available, tap to refresh";

const define = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
define("window", { addEventListener() {} });
define("navigator", { userAgent: "node", platform: "Linux", maxTouchPoints: 0 });
define("location", { protocol: "http:", hostname: "example.test", reload() {} });
const { app } = await import("../logger/js/runtime.js");
await import("../logger/js/shared/platform.js");

function bannerDoc() {
  const el = {
    id: "sw-update",
    type: "button",
    className: "shell-update",
    hidden: true,
    textContent: "",
    dataset: {},
    listeners: {},
    addEventListener(type, fn) {
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type].push(fn);
    },
    click() {
      for (const fn of this.listeners.click || []) fn();
    },
  };
  const doc = {
    activeElement: { tagName: "BODY" },
    querySelector: () => null,
    body: { appendChild() {} },
    getElementById: (id) => (id === "sw-update" ? el : null),
    createElement: () => el,
  };
  return { doc, el };
}

function worker(posts) {
  return { state: "installed", postMessage: (message) => posts.push(message) };
}

function loadWorker(active) {
  let skips = 0;
  const handlers = {};
  const self = {
    registration: { active },
    location: { origin: "https://app.test" },
    skipWaiting() { skips += 1; return Promise.resolve(); },
    clients: { claim: () => Promise.resolve() },
    addEventListener(type, fn) {
      handlers[type] = handlers[type] || [];
      handlers[type].push(fn);
    },
  };
  const caches = {
    open: async () => ({ addAll: async () => {} }),
    keys: async () => [],
    delete: async () => true,
  };
  vm.runInContext(SW_SRC, vm.createContext({
    self, caches, URL, Promise, Map, setTimeout, clearTimeout,
    Request: class Request { constructor(url, init) { this.url = url; this.cache = init && init.cache; } },
  }));
  return {
    handlers,
    skips: () => skips,
    async install() {
      const waits = [];
      for (const fn of handlers.install || []) fn({ waitUntil: (p) => waits.push(p) });
      await Promise.all(waits);
    },
    message(data) {
      for (const fn of handlers.message || []) fn({ data });
    },
  };
}

test("the shell names the update banner and does not track it", () => {
  assert.match(HTML, /id="sw-update"/);
  assert.match(HTML, new RegExp(LABEL));
  assert.match(PLATFORM_SRC, new RegExp(LABEL));
  assert.match(PLATFORM_SRC, /SKIP_WAITING/);
  assert.doesNotMatch(PLATFORM_SRC, /\bcapture\s*\(/);
  assert.doesNotMatch(PLATFORM_SRC, /posthog/i);
  assert.match(SW_SRC, /const CACHE = "insight-shell-v49"/);
  assert.match(SW_SRC, /SKIP_WAITING/);
  assert.match(SW_SRC, /self\.registration\.active/);
  assert.doesNotMatch(SW_SRC, /\bcapture\s*\(/);
});

test("a first install takes control and an update waits for SKIP_WAITING", async () => {
  const first = loadWorker(null);
  await first.install();
  assert.equal(first.skips(), 1);

  const update = loadWorker({});
  await update.install();
  assert.equal(update.skips(), 0);
  update.message({ type: "refresh" });
  update.message(null);
  assert.equal(update.skips(), 0);
  update.message({ type: "SKIP_WAITING" });
  assert.equal(update.skips(), 1);
  update.message("SKIP_WAITING");
  assert.equal(update.skips(), 2);
});

test("a waiting worker is an update only when another worker already controls the page", () => {
  const waiting = { state: "installed" };
  const controller = {};
  assert.equal(app.waitingShellWorker({ waiting }, null, null), null);
  assert.equal(app.waitingShellWorker({ waiting, active: waiting }, null, controller), null);
  assert.equal(app.waitingShellWorker({}, controller, controller), null);
  assert.equal(app.waitingShellWorker({ waiting }, null, controller), waiting);
  assert.equal(app.waitingShellWorker({}, waiting, controller), waiting);
});

test("an in-progress session keeps the banner until the user taps", () => {
  app.resetShellUpdate();
  const { doc, el } = bannerDoc();
  const posts = [];
  const next = worker(posts);
  const controller = {};
  const state = { sessions: [{ finishedAt: null, startedAt: "y" }] };
  let reloads = 0;
  location.reload = () => { reloads += 1; };

  assert.equal(app.sessionInProgress(state), true);
  assert.equal(app.reloadSafeNow(doc, {}, state), false);
  assert.equal(app.presentShellUpdate(next, controller, doc), true);
  assert.equal(el.hidden, false);
  assert.equal(el.textContent, LABEL);
  assert.deepEqual(posts, []);
  assert.equal(app.shellReloadArmed(), false);
  assert.equal(app.onShellControllerChange(), false);
  assert.equal(reloads, 0);

  app.presentShellUpdate(next, controller, doc);
  state.sessions[0].finishedAt = "2026-10-13T00:00:00";
  assert.equal(app.sessionInProgress(state), false);
  assert.equal(el.hidden, false);
  assert.equal(app.onShellControllerChange(), false);
  assert.deepEqual(posts, []);

  state.sessions[0].finishedAt = null;
  el.click();
  assert.deepEqual(posts, [{ type: "SKIP_WAITING" }]);
  assert.equal(app.shellReloadArmed(), true);
  assert.equal(app.onShellControllerChange(), true);
  assert.equal(reloads, 1);
  assert.equal(app.onShellControllerChange(), false);
  assert.equal(reloads, 1);
  assert.equal(el.listeners.click.length, 1);
});

test("a controller change reloads once and does not loop", () => {
  app.resetShellUpdate();
  const posts = [];
  const next = worker(posts);
  let reloads = 0;
  location.reload = () => { reloads += 1; };
  const store = new Map();
  globalThis.sessionStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
  try {
    assert.equal(app.applyShellUpdate(next), true);
    store.set("insight-reloaded", "1");
    assert.equal(app.onShellControllerChange(), false);
    assert.equal(reloads, 0);

    app.resetShellUpdate();
    assert.equal(app.applyShellUpdate(next), true);
    store.delete("insight-reloaded");
    assert.equal(app.onShellControllerChange(), true);
    assert.equal(reloads, 1);
    assert.equal(store.get("insight-reloaded"), "1");
    assert.equal(app.onShellControllerChange(), false);
    assert.equal(reloads, 1);
  } finally {
    delete globalThis.sessionStorage;
  }
});

test("no controller and a dismissed worker hide the banner", () => {
  app.resetShellUpdate();
  const { doc, el } = bannerDoc();
  const posts = [];
  const next = worker(posts);
  assert.equal(app.presentShellUpdate(next, null, doc), false);
  assert.equal(el.hidden, true);
  assert.equal(app.presentShellUpdate(next, {}, doc), true);
  assert.equal(app.presentShellUpdate(null, {}, doc), false);
  assert.equal(el.hidden, true);
  assert.equal(app.applyShellUpdate(), false);
  assert.deepEqual(posts, []);
});
