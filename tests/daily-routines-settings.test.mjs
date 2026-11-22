import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

/* Synthetic session only. Settings and the FAQ are in the gear sheet.
   A pull reloads the account copy. Routines never asks to alert the user. */

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const listeners = [];
const alertCalls = [];

function note(kind) {
  alertCalls.push(kind);
}

function SpyNote() {
  note("construct");
}
SpyNote.requestPermission = () => {
  note("requestPermission");
  return Promise.resolve("denied");
};
SpyNote.permission = "default";

const sheet = {
  id: "sheet",
  hidden: true,
  innerHTML: "",
  dataset: {},
  classList: { add() {}, remove() {} },
  querySelector() { return null; },
};
globalThis.Notification = SpyNote;
Object.defineProperty(globalThis.navigator, "serviceWorker", {
  configurable: true,
  value: {
    showNotification() { note("showNotification"); },
    ready: Promise.resolve({ showNotification() { note("showNotification"); } }),
  },
});
globalThis.document = {
  body: { classList: { add() {}, remove() {} } },
  addEventListener(type, fn, options) { listeners.push({ type, fn, options }); },
  removeEventListener() {},
  querySelector() { return null; },
  querySelectorAll() { return []; },
  getElementById(id) { return id === "sheet" ? sheet : null; },
};
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { app } = await import("../logger/js/runtime.js");
const {
  ROUTINE_PULL_PX,
  dailyRoutinesHTML,
  doseCountdownText,
  onRoutinePullCancel,
  onRoutinePullEnd,
  onRoutinePullMove,
  onRoutinePullStart,
  routinesFaqHTML,
  routinesSettingsSheetHTML,
} = await import("../logger/js/pages/daily-routines.js");
await import("../logger/js/shell/workout.js");

const QUESTIONS = [
  "What is Routines?",
  "Who can use it?",
  "How do I log an item?",
  "What does the number at the top count?",
  "When does a streak reset?",
  "Can I change a logged amount or day?",
  "What does the calculator show?",
  "Does Routines send reminders?",
  "How do I refresh?",
  "Where is Discover?",
];

const BANNED_COPY = /Notification|showNotification|requestPermission|snooze|lock screen|permission prompt|home screen|coming later|discreet/i;
const BANNED_CODE = [
  ["Notification", /\bNotification\b/],
  ["showNotification", /showNotification/],
  ["requestPermission", /requestPermission/],
  ["serviceWorker.showNotification", /serviceWorker\s*\.\s*showNotification/],
  ["PushManager", /\bPushManager\b/],
];

function codeWithoutComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function walk(dir, out) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules") continue;
      walk(path, out);
    } else out.push(path);
  }
}

function routineSources() {
  const files = [];
  walk(join(ROOT, "logger/js"), files);
  walk(join(ROOT, "logger/css"), files);
  const matched = files.filter((path) => /routine|reconstitut/i.test(path));
  matched.push(join(ROOT, "logger/js/shell/actions.js"));
  matched.push(join(ROOT, "logger/js/shell/workout.js"));
  return matched;
}

function nodeMatches(node, part) {
  if (part.startsWith("#")) return node.id === part.slice(1);
  if (part.startsWith(".")) return (node.className || "").split(/\s+/).includes(part.slice(1));
  if (part.startsWith("[")) {
    const found = part.match(/^\[([^\]=]+)="([^"]*)"\]$/);
    return !!(found && node.attrs && node.attrs[found[1]] === found[2]);
  }
  return node.tag === part;
}

function closestOf(node, sel) {
  const parts = sel.split(",").map((part) => part.trim());
  let cur = node;
  while (cur) {
    if (parts.some((part) => nodeMatches(cur, part))) return cur;
    cur = cur.parent || null;
  }
  return null;
}

function mountPull(scrollTop = 0) {
  const pane = {
    id: "pane-daily-routines",
    tag: "section",
    className: "pane",
    attrs: { "data-pane": "daily-routines" },
    scrollTop,
    parent: null,
  };
  const hint = {
    tag: "p",
    className: "dr-pull",
    attrs: { "data-pull": "idle", hidden: "" },
    hidden: true,
    textContent: "Pull to refresh",
    parent: pane,
    setAttribute(key, value) { this.attrs[key] = String(value); },
    removeAttribute(key) { delete this.attrs[key]; },
  };
  const surface = {
    tag: "div",
    className: "",
    attrs: {},
    parent: pane,
    closest(sel) { return closestOf(this, sel); },
  };
  document.querySelector = (sel) => {
    if (sel === ".dr-pull") return hint;
    if (sel === '[data-pane="daily-routines"]') return pane;
    if (sel === "#sheet") return sheet;
    return null;
  };
  return { pane, hint, surface };
}

function touch(target, x, y) {
  return {
    target,
    cancelable: true,
    prevented: false,
    preventDefault() { this.prevented = true; },
    touches: [{ clientX: x, clientY: y }],
  };
}

function readySession() {
  app.ROUTINES_ENABLED = true;
  app.session = { user: { id: "synthetic-user" } };
  app.sb = { from() {} };
  app.cloudPullOk = true;
  app.state = { dailyRoutines: null };
  app.ui = { tab: "daily-routines", sheet: null, sd: {}, dailyRoutineEdit: false };
  app.today = () => "2026-11-19";
  app.routineNow = () => new Date(2026, 10, 19, 8, 30, 0);
  app.save = () => {};
  app.render = () => {};
  app.stopBarcode = () => {};
  app.$ = (sel) => document.querySelector(sel);
  let pulls = 0;
  app.cloudPull = async () => { pulls += 1; };
  return () => pulls;
}

describe("routines settings and FAQ", { concurrency: false }, () => {
  test("the gear sheet shows settings and an open FAQ", () => {
    const pulls = readySession();
    const page = dailyRoutinesHTML();
    assert.match(page, /data-routines-shell="signed-in"/);
    assert.match(page, /data-action="routines-settings"/);
    assert.match(page, /aria-label="Routines settings"/);
    assert.match(page, /class="dr-pull" data-pull="idle"/);
    assert.match(page, /Pull to refresh/);
    assert.doesNotMatch(page, BANNED_COPY);
    assert.equal(alertCalls.length, 0);

    const faq = routinesFaqHTML();
    const settings = routinesSettingsSheetHTML();
    assert.match(settings, /<h3>Routines settings<\/h3>/);
    assert.match(settings, /Focus mode/);
    assert.match(settings, /Countdowns stay on the row/);
    assert.match(settings, /does not send reminders/);
    assert.match(settings, /data-action="routines-calc"/);
    assert.match(settings, /what you entered/i);
    assert.match(settings, /does not suggest an amount/);
    assert.ok(settings.includes(faq));
    assert.doesNotMatch(faq, /<details/i);
    assert.match(faq, /id="dr-faq-title">FAQ</);
    for (const question of QUESTIONS) assert.ok(settings.includes(question), question);
    assert.match(settings, /does not add amounts together/);
    assert.match(settings, /A skip does not reset it/);
    assert.match(settings, /not a recommendation/);
    assert.match(settings, /Pull down from the top of Routines/);
    assert.match(settings, /does not suggest an amount/);
    assert.doesNotMatch(settings, BANNED_COPY);
    assert.equal(typeof doseCountdownText, "function");

    document.querySelector = (sel) => (sel === "#sheet" ? sheet : null);
    app.ui.sheet = "routines-settings";
    app.renderSheet();
    assert.equal(sheet.hidden, false);
    assert.match(sheet.innerHTML, /aria-label="Routines settings"/);
    assert.match(sheet.innerHTML, /id="dr-faq-title"/);
    for (const question of QUESTIONS) assert.ok(sheet.innerHTML.includes(question), question);
    assert.doesNotMatch(sheet.innerHTML, BANNED_COPY);
    assert.equal(pulls(), 0);
    assert.equal(alertCalls.length, 0);
    const saved = structuredClone(app.state.dailyRoutines);
    assert.equal(saved.logs.length, 0);
  });

  test("a syncing account can pull, and a signed-out or flag-off page cannot", () => {
    app.ROUTINES_ENABLED = true;
    app.session = { user: { id: "synthetic-user" } };
    app.sb = { from() {} };
    app.cloudPullOk = false;
    app.state = { dailyRoutines: null };
    app.ui = { tab: "daily-routines", sheet: null, sd: {} };
    app.today = () => "2026-11-19";
    app.routineNow = () => new Date(2026, 10, 19, 8, 30, 0);
    app.save = () => { throw new Error("a pull in flight must not save"); };
    const syncing = dailyRoutinesHTML();
    assert.match(syncing, /data-routines-shell="syncing"/);
    assert.match(syncing, /data-pull="idle"/);
    assert.match(syncing, /data-action="routines-settings"/);
    assert.equal(app.state.dailyRoutines, null);

    app.session = null;
    app.sb = null;
    const signedOut = dailyRoutinesHTML();
    assert.match(signedOut, /Sign in to use Routines/);
    assert.doesNotMatch(signedOut, /dr-pull|dr-faq|routines-settings/);

    app.ROUTINES_ENABLED = false;
    app.session = { user: { id: "synthetic-user" } };
    app.save = () => { throw new Error("flag off must not save"); };
    assert.equal(dailyRoutinesHTML(), "");
    assert.equal(alertCalls.length, 0);
  });

  test("pulling down refreshes once, and a short, sideways, or blocked pull does not", async () => {
    const pulls = readySession();
    dailyRoutinesHTML();
    const { pane, hint, surface } = mountPull(0);
    const before = structuredClone(app.state.dailyRoutines);
    assert.ok(before && Array.isArray(before.blocks));

    onRoutinePullStart(touch(surface, 20, 100));
    const nudge = touch(surface, 20, 104);
    onRoutinePullMove(nudge);
    assert.equal(nudge.prevented, false);
    assert.equal(await onRoutinePullEnd(), false);
    assert.equal(pulls(), 0);

    onRoutinePullStart(touch(surface, 20, 100));
    const sideways = touch(surface, 70, 108);
    onRoutinePullMove(sideways);
    assert.equal(sideways.prevented, false);
    assert.equal(await onRoutinePullEnd(), false);
    assert.equal(pulls(), 0);
    assert.equal(hint.hidden, true);

    onRoutinePullStart(touch(surface, 20, 100));
    const short = touch(surface, 22, 130);
    onRoutinePullMove(short);
    assert.equal(short.prevented, true);
    assert.equal(hint.attrs["data-pull"], "pulling");
    assert.equal(hint.textContent, "Pull to refresh");
    assert.equal(await onRoutinePullEnd(), false);
    assert.equal(pulls(), 0);
    assert.equal(hint.hidden, true);
    assert.equal(hint.attrs["data-pull"], "idle");

    let release = null;
    app.cloudPull = () => new Promise((resolve) => { release = resolve; });
    onRoutinePullStart(touch(surface, 20, 100));
    const down = touch(surface, 24, 100 + ROUTINE_PULL_PX + 8);
    onRoutinePullMove(down);
    assert.equal(down.prevented, true);
    assert.equal(hint.hidden, false);
    assert.equal(hint.attrs.hidden, undefined);
    assert.equal(hint.attrs["data-pull"], "ready");
    assert.equal(hint.textContent, "Release to refresh");
    const pending = onRoutinePullEnd();
    assert.equal(hint.attrs["data-pull"], "refreshing");
    assert.equal(hint.textContent, "Refreshing");
    assert.equal(await onRoutinePullEnd(), false);
    release();
    assert.equal(await pending, true);
    assert.equal(hint.hidden, true);
    assert.equal(hint.textContent, "Pull to refresh");
    assert.deepEqual(app.state.dailyRoutines, before);

    app.cloudPull = async () => { throw new Error("offline"); };
    onRoutinePullStart(touch(surface, 20, 100));
    onRoutinePullMove(touch(surface, 20, 100 + ROUTINE_PULL_PX));
    assert.equal(await onRoutinePullEnd(), false);
    assert.equal(hint.hidden, true);
    assert.deepEqual(app.state.dailyRoutines, before);

    pane.scrollTop = 24;
    app.cloudPull = async () => { throw new Error("scrolled pull must not refresh"); };
    onRoutinePullStart(touch(surface, 20, 100));
    onRoutinePullMove(touch(surface, 20, 220));
    assert.equal(await onRoutinePullEnd(), false);

    pane.scrollTop = 0;
    const button = { tag: "button", className: "", attrs: {}, parent: pane, closest(sel) { return closestOf(this, sel); } };
    app.cloudPull = async () => { throw new Error("a control must not refresh"); };
    onRoutinePullStart(touch(button, 20, 100));
    onRoutinePullMove(touch(button, 20, 220));
    assert.equal(await onRoutinePullEnd(), false);

    const outside = { tag: "div", className: "", attrs: {}, parent: null, closest(sel) { return closestOf(this, sel); } };
    onRoutinePullStart(touch(outside, 20, 100));
    onRoutinePullMove(touch(outside, 20, 220));
    assert.equal(await onRoutinePullEnd(), false);

    app.ui.dailyRoutineEdit = true;
    onRoutinePullStart(touch(surface, 20, 100));
    onRoutinePullMove(touch(surface, 20, 220));
    assert.equal(await onRoutinePullEnd(), false);
    app.ui.dailyRoutineEdit = false;
    app.ui.sheet = "routines-settings";
    onRoutinePullStart(touch(surface, 20, 100));
    assert.equal(await onRoutinePullEnd(), false);
    app.ui.sheet = null;

    app.cloudPullOk = true;
    app.session = null;
    app.cloudPull = async () => { app.cloudPullOk = false; };
    onRoutinePullStart(touch(surface, 20, 100));
    onRoutinePullMove(touch(surface, 20, 220));
    assert.equal(await onRoutinePullEnd(), false);
    assert.equal(app.cloudPullOk, true);

    app.session = { user: { id: "synthetic-user" } };
    app.ROUTINES_ENABLED = false;
    app.cloudPull = async () => { throw new Error("flag off must not refresh"); };
    onRoutinePullStart(touch(surface, 20, 100));
    onRoutinePullMove(touch(surface, 20, 220));
    assert.equal(await onRoutinePullEnd(), false);
    onRoutinePullCancel();
    assert.equal(alertCalls.length, 0);
  });

  test("routines files do not register an alert or ask for permission", () => {
    const names = routineSources().map((path) => path.split("/").pop());
    for (const name of [
      "daily-routines.js",
      "daily-routines-edit.js",
      "daily-routines-dose.js",
      "reconstitution.js",
      "routine-dose.js",
      "daily-routines-store.js",
      "routines.css",
      "routines-flag.js",
      "actions.js",
      "workout.js",
    ]) assert.ok(names.includes(name), name);

    for (const path of routineSources()) {
      const code = codeWithoutComments(readFileSync(path, "utf8"));
      for (const [label, pattern] of BANNED_CODE) {
        assert.equal(pattern.test(code), false, `${path} contains ${label}`);
      }
    }

    const types = listeners.map((row) => row.type).sort();
    assert.deepEqual(types, ["change", "touchcancel", "touchend", "touchmove", "touchstart"]);
    assert.equal(listeners.find((row) => row.type === "touchmove").options.passive, false);
    assert.equal(listeners.find((row) => row.type === "touchstart").options.passive, true);
    assert.equal(alertCalls.length, 0);

    const sw = readFileSync(new URL("../logger/sw.js", import.meta.url), "utf8");
    const sentry = readFileSync(new URL("../logger/js/sentry.js", import.meta.url), "utf8");
    const main = readFileSync(new URL("../logger/js/main.js", import.meta.url), "utf8");
    const pager = readFileSync(new URL("../logger/js/shell/pager.js", import.meta.url), "utf8");
    const page = readFileSync(new URL("../logger/js/pages/daily-routines.js", import.meta.url), "utf8");
    assert.match(sw, /const CACHE = "insight-shell-v89"/);
    assert.match(sentry, /insight-shell-v89/);
    assert.equal(main.match(/routines-flag/g).length, 1);
    assert.doesNotMatch(page, /routines-flag/);
    assert.match(pager, /app\.TAB_ORDER = \["home", "workouts", "food", "progress", "insights"\];/);
    assert.match(readFileSync(new URL("../logger/js/shell/actions.js", import.meta.url), "utf8"), /case "routines-settings"[\s\S]*ROUTINES_ENABLED !== true/);
  });
});
