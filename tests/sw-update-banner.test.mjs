import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SW_SRC = readFileSync(new URL("../logger/sw.js", import.meta.url), "utf8");
const PLATFORM_SRC = readFileSync(new URL("../logger/js/shared/platform.js", import.meta.url), "utf8");
const CSS = readFileSync(new URL("../logger/css/platform.css", import.meta.url), "utf8");
const HTML = readFileSync(new URL("../logger/index.html", import.meta.url), "utf8");
const LABEL = "Update available, tap to refresh";
const WORKOUT_KEY = "insight-workout-reload";

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

function ensureWorkoutModel() {
  if (!app.state) {
    app.state = {
      workouts: [
        { id: "push", name: "Push", exercises: [
          { name: "Pec Fly Machine", muscles: ["chest"] },
          { name: "Cable Lateral Raise", muscles: ["sideDelts"] },
        ] },
        { id: "pull", name: "Pull", exercises: [
          { name: "Pull Ups", muscles: ["lats"] },
          { name: "Lat Pulldown Machine", muscles: ["lats"] },
        ] },
        { id: "legs", name: "Legs", exercises: [{ name: "Seated Leg Press Machine", muscles: ["quads"] }] },
      ],
      sessions: [],
    };
  }
  if (!Array.isArray(app.state.sessions)) app.state.sessions = [];
  if (!Array.isArray(app.state.workouts) || !app.state.workouts.length) {
    app.state.workouts = [{ id: "push", name: "Push", exercises: [{ name: "Pec Fly Machine", muscles: ["chest"] }] }];
  }
  if (!app.ui) app.ui = { workoutOpen: false, open: null, drafts: {} };
  if (typeof app.activeSession !== "function") {
    app.activeSession = () => app.state.sessions.find((s) => s && !s.finishedAt);
  }
  if (typeof app.liveExercises !== "function") {
    app.liveExercises = (session) => {
      const workout = app.state.workouts.find((item) => item && item.id === session.workoutId);
      return (workout && workout.exercises) || [];
    };
  }
}

describe("shell update banner", { concurrency: false }, () => {
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
  assert.match(CSS, /--shell-update-clear/);
  assert.match(CSS, /body\.in-workout\.shell-update #wo-list/);
  assert.doesNotMatch(CSS, /top:\s*calc\(8px \+ var\(--safe-top\)\)/);
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

function memoryStorage() {
  const store = new Map();
  return {
    store,
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("the update chip is measured below the workout header", () => {
  const props = {};
  const style = {
    setProperty(key, value) { props[key] = value; },
    removeProperty(key) { delete props[key]; },
  };
  const doc = {
    body: { classList: { contains: (name) => name === "in-workout" } },
    documentElement: { style },
    querySelector(sel) {
      if (sel === "#workout") return { hidden: false };
      if (sel === "#workout .wo-top") return { getBoundingClientRect: () => ({ bottom: 120.4 }) };
      if (sel === "#cardio-live") return { hidden: true };
      return null;
    },
  };
  assert.equal(app.placeShellUpdate(doc), true);
  assert.equal(props["--shell-update-clear"], "128px");
  doc.body.classList = { contains: () => false };
  assert.equal(app.placeShellUpdate(doc), false);
  assert.equal(props["--shell-update-clear"], undefined);
});

test("a tap during a routine workout reloads once and restores the half-typed set", () => {
  ensureWorkoutModel();
  app.resetShellUpdate();
  const workout = app.state.workouts.find((item) => item.id === "push");
  const name = workout.exercises[0].name;
  const session = {
    id: "routine-live",
    date: "2026-10-13",
    workoutId: workout.id,
    name: workout.name,
    startedAt: "2026-10-13T01:00:00",
    finishedAt: null,
    entries: [],
  };
  const { doc, el } = bannerDoc();
  doc.querySelectorAll = (sel) => (sel === "#workout [data-field]"
    ? [
      { tagName: "BUTTON", dataset: { i: "0", field: "w" }, value: "" },
      { tagName: "INPUT", dataset: { i: "0", field: "w" }, value: "135." },
      { tagName: "BUTTON", dataset: { i: "0", field: "w" }, value: "" },
      { tagName: "INPUT", dataset: { i: "0", field: "r" }, value: "8" },
    ]
    : []);
  const posts = [];
  const next = worker(posts);
  const prev = {
    sessions: app.state.sessions,
    workoutOpen: app.ui.workoutOpen,
    open: app.ui.open,
    drafts: app.ui.drafts,
    document: globalThis.document,
  };
  const store = memoryStorage();
  globalThis.sessionStorage = store;
  globalThis.document = doc;
  app.state.sessions = [session];
  app.ui.workoutOpen = true;
  app.ui.open = 0;
  app.ui.drafts = { [name]: { w: "13", r: "8", note: "slow", tag: null } };
  let reloads = 0;
  location.reload = () => { reloads += 1; };
  try {
    assert.equal(app.workoutReloadRecord({ workoutOpen: true, open: 0, drafts: {} }, { ...session, finishedAt: "done" }, []), null);
    assert.equal(app.presentShellUpdate(next, {}, doc), true);
    el.click();
    assert.deepEqual(posts, [{ type: "SKIP_WAITING" }]);
    assert.equal(app.onShellControllerChange(), true);
    assert.equal(reloads, 1);
    assert.equal(app.onShellControllerChange(), false);
    assert.equal(reloads, 1);
    const saved = JSON.parse(store.store.get(WORKOUT_KEY));
    assert.equal(saved.sessionId, session.id);
    assert.equal(saved.workoutOpen, true);
    assert.equal(saved.open, 0);
    assert.equal(saved.drafts[name].w, "135.");
    assert.equal(saved.drafts[name].r, "8");
    assert.equal(saved.drafts[name].note, "slow");

    app.resetShellUpdate();
    app.ui.workoutOpen = false;
    app.ui.open = null;
    app.ui.drafts = {};
    assert.equal(app.restoreWorkoutReload(), true);
    assert.equal(app.ui.workoutOpen, true);
    assert.equal(app.ui.open, 0);
    assert.equal(app.ui.drafts[name].w, "135.");
    assert.equal(app.ui.drafts[name].r, "8");
    assert.equal(app.ui.drafts[name].note, "slow");
    assert.equal(app.restoreWorkoutReload(), false);
    assert.equal(app.applyWorkoutReload(app.ui, { id: "other", finishedAt: null }, saved), false);
  } finally {
    app.state.sessions = prev.sessions;
    app.ui.workoutOpen = prev.workoutOpen;
    app.ui.open = prev.open;
    app.ui.drafts = prev.drafts;
    if (prev.document === undefined) delete globalThis.document;
    else globalThis.document = prev.document;
    delete globalThis.sessionStorage;
    app.resetShellUpdate();
  }
});

test("randomized update events reload once and restore an open routine workout", async () => {
  ensureWorkoutModel();
  const seed = Number(process.env.TEST_SEED) || 20261013;
  console.log(`update-event seed: ${seed}`);
  const rand = rng(seed);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const payloads = [
    { type: "SKIP_WAITING" },
    "SKIP_WAITING",
    { type: "refresh" },
    null,
    0,
    "",
    { type: "skip_waiting" },
    { type: "SKIP_WAITING", extra: true },
  ];
  const prev = {
    sessions: app.state.sessions,
    workoutOpen: app.ui.workoutOpen,
    open: app.ui.open,
    drafts: app.ui.drafts,
  };
  const store = memoryStorage();
  globalThis.sessionStorage = store;
  try {
    for (let n = 0; n < 60; n++) {
      const first = rand() < 0.45;
      const sw = loadWorker(first ? null : {});
      await sw.install();
      let skips = first ? 1 : 0;
      const messages = Math.floor(rand() * 5);
      for (let m = 0; m < messages; m++) {
        const payload = payloads[Math.floor(rand() * payloads.length)];
        sw.message(payload);
        if (payload === "SKIP_WAITING" || (payload && payload.type === "SKIP_WAITING")) skips += 1;
      }
      assert.equal(sw.skips(), skips, `case ${n} skipWaiting`);

      const waiting = { state: "installed" };
      const controller = rand() < 0.2 ? null : {};
      const active = rand() < 0.25 ? waiting : {};
      const reg = { waiting: rand() < 0.5 ? waiting : null, active };
      const candidate = rand() < 0.5 ? waiting : null;
      const found = app.waitingShellWorker(reg, candidate, controller);
      const expected = !controller || waiting === controller || waiting === active ? null : (reg.waiting || candidate);
      assert.equal(found, expected, `case ${n} waiting worker`);

      app.resetShellUpdate();
      store.store.clear();
      const routine = app.state.workouts[Math.floor(rand() * app.state.workouts.length)];
      const exercise = routine.exercises[Math.floor(rand() * routine.exercises.length)];
      const session = {
        id: "upd-" + n,
        date: "2026-10-13",
        workoutId: routine.id,
        name: routine.name,
        startedAt: "2026-10-13T02:00:00",
        finishedAt: null,
        entries: [],
      };
      if (rand() < 0.35) session.origin = "freestyle";
      const live = rand() < 0.8;
      const weight = String(Math.floor(rand() * 400));
      const reps = String(1 + Math.floor(rand() * 20));
      app.state.sessions = live ? [session] : [];
      app.ui.workoutOpen = live && rand() < 0.85;
      app.ui.open = live ? Math.floor(rand() * routine.exercises.length) : null;
      app.ui.drafts = live && weight !== "0" ? { [exercise.name]: { w: weight, r: reps, note: "", tag: null } } : {};
      const latest = {
        open: app.ui.workoutOpen,
        finished: false,
        w: app.ui.drafts[exercise.name] ? app.ui.drafts[exercise.name].w : "",
      };

      const posts = [];
      const pageWorker = worker(posts);
      const { doc, el } = bannerDoc();
      let reloads = 0;
      let armed = false;
      location.reload = () => {
        assert.equal(armed, true, `case ${n} reloaded without a tap`);
        armed = false;
        reloads += 1;
        const raw = store.store.get(WORKOUT_KEY) || null;
        const record = raw ? JSON.parse(raw) : null;
        const shouldRestore = !!(latest.open && !latest.finished && live && record);
        app.resetShellUpdate();
        store.store.delete("insight-reloaded");
        app.ui.workoutOpen = false;
        app.ui.open = null;
        app.ui.drafts = {};
        const restored = app.restoreWorkoutReload();
        if (shouldRestore) {
          assert.equal(restored, true, `case ${n} did not reopen ${session.id}`);
          assert.equal(app.ui.workoutOpen, true, `case ${n} routine stayed closed`);
          assert.equal(record.sessionId, session.id, `case ${n} session`);
          if (latest.w) assert.equal(app.ui.drafts[exercise.name] && app.ui.drafts[exercise.name].w, latest.w, `case ${n} weight`);
          latest.open = true;
        } else {
          assert.equal(restored, false, `case ${n} restored ${raw}`);
          assert.equal(app.ui.workoutOpen, false, `case ${n} opened unexpectedly`);
        }
      };

      const steps = 1 + Math.floor(rand() * 7);
      const kinds = ["present", "dismiss", "tap", "change", "finish", "type", "minimize"];
      for (let s = 0; s < steps; s++) {
        const kind = pick(kinds);
        if (kind === "present") app.presentShellUpdate(pageWorker, {}, doc);
        else if (kind === "dismiss") app.presentShellUpdate(null, {}, doc);
        else if (kind === "tap") {
          const before = posts.length;
          el.click();
          if (posts.length > before) armed = true;
        } else if (kind === "change") app.onShellControllerChange();
        else if (kind === "finish") {
          session.finishedAt = new Date().toISOString();
          app.ui.workoutOpen = false;
          app.ui.drafts = {};
          latest.finished = true;
          latest.open = false;
          latest.w = "";
        } else if (kind === "minimize") {
          app.ui.workoutOpen = false;
          latest.open = false;
        } else if (kind === "type" && live && !session.finishedAt && app.ui.workoutOpen) {
          latest.w = String(1 + Math.floor(rand() * 500));
          latest.open = true;
          app.ui.drafts[exercise.name] = { ...(app.ui.drafts[exercise.name] || {}), w: latest.w, r: reps };
        }
        assert.ok(reloads <= s + 1, `case ${n} reload storm`);
      }
      assert.ok(posts.length === 0 || posts.every((message) => message.type === "SKIP_WAITING"), `case ${n} message`);
      assert.ok(reloads <= posts.length, `case ${n} reloads ${reloads} taps ${posts.length}`);
    }
  } finally {
    app.state.sessions = prev.sessions;
    app.ui.workoutOpen = prev.workoutOpen;
    app.ui.open = prev.open;
    app.ui.drafts = prev.drafts;
    delete globalThis.sessionStorage;
    app.resetShellUpdate();
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
});
