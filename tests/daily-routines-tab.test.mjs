import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/* Synthetic session only. The flag stays false in source. */

const BASE = ["home", "workouts", "food", "progress", "insights"];
const SIX = ["home", "workouts", "daily-routines", "food", "progress", "insights"];
const LABELS = { home: "Home", workouts: "Workouts", food: "Food", progress: "Progress", insights: "Insights" };

function createNode(tag) {
  const node = {
    tag,
    id: "",
    className: "",
    children: [],
    parent: null,
    attrs: {},
    styleMap: {},
    textContent: "",
    innerHTML: "",
    dataset: {},
    hidden: false,
    clientWidth: 0,
    scrollTop: 0,
  };
  node.style = {
    setProperty(key, value) { node.styleMap[key] = String(value); },
    removeProperty(key) { delete node.styleMap[key]; },
    get width() { return node.styleMap.width || ""; },
    set width(value) { node.styleMap.width = String(value); },
    get transform() { return node.styleMap.transform || ""; },
    set transform(value) { node.styleMap.transform = String(value); },
    get opacity() { return node.styleMap.opacity || ""; },
    set opacity(value) { node.styleMap.opacity = String(value); },
    get transition() { return node.styleMap.transition || ""; },
    set transition(value) { node.styleMap.transition = String(value); },
  };
  node.classList = {
    add(...names) {
      const have = new Set(node.className.split(/\s+/).filter(Boolean));
      names.forEach((name) => have.add(name));
      node.className = [...have].join(" ");
    },
    remove(...names) {
      const drop = new Set(names);
      node.className = node.className.split(/\s+/).filter((name) => name && !drop.has(name)).join(" ");
    },
    contains(name) { return node.className.split(/\s+/).includes(name); },
    toggle(name, on) { if (on) node.classList.add(name); else node.classList.remove(name); },
  };
  node.setAttribute = (key, value) => {
    node.attrs[key] = String(value);
    if (key === "id") node.id = String(value);
    if (key === "class") node.className = String(value);
    if (key.startsWith("data-")) node.dataset[key.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())] = String(value);
  };
  node.getAttribute = (key) => (key in node.attrs ? node.attrs[key] : null);
  node.removeAttribute = (key) => {
    delete node.attrs[key];
    if (key.startsWith("data-")) delete node.dataset[key.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())];
  };
  node.appendChild = (child) => {
    if (child.parent) child.remove();
    child.parent = node;
    node.children.push(child);
    return child;
  };
  node.insertBefore = (child, ref) => {
    if (child.parent) child.remove();
    child.parent = node;
    const at = ref ? node.children.indexOf(ref) : -1;
    if (at < 0) node.children.push(child);
    else node.children.splice(at, 0, child);
    return child;
  };
  node.remove = () => {
    if (!node.parent) return;
    node.parent.children = node.parent.children.filter((child) => child !== node);
    node.parent = null;
  };
  node.querySelectorAll = (sel) => queryAll(node, sel);
  node.querySelector = (sel) => queryAll(node, sel)[0] || null;
  node.getAnimations = () => [];
  node.animate = () => ({ cancel() {}, onfinish: null });
  node.scrollTo = () => {};
  node.scrollBy = () => {};
  return node;
}

function matchSimple(node, sel) {
  const parts = sel.split(/(?=[#.\[])/).filter(Boolean);
  return parts.every((part) => {
    if (part.startsWith("#")) return node.id === part.slice(1);
    if (part.startsWith(".")) return node.className.split(/\s+/).includes(part.slice(1));
    if (part.startsWith("[")) {
      const found = part.match(/^\[([^\]=]+)="([^"]*)"\]$/);
      return !!(found && node.attrs[found[1]] === found[2]);
    }
    return node.tag === part;
  });
}

function collect(node, part, out) {
  for (const child of node.children) {
    if (matchSimple(child, part)) out.push(child);
    collect(child, part, out);
  }
}

function queryAll(root, sel) {
  const parts = sel.trim().split(/\s+/);
  let nodes = [root];
  for (const part of parts) {
    const next = [];
    for (const node of nodes) collect(node, part, next);
    nodes = next;
  }
  return nodes;
}

function button(id) {
  const el = createNode("button");
  el.className = "tab";
  el.setAttribute("data-action", "tab");
  el.setAttribute("data-tab", id);
  el.setAttribute("aria-label", LABELS[id]);
  const span = createNode("span");
  span.textContent = LABELS[id];
  el.appendChild(span);
  return el;
}

function slot(id) {
  const el = createNode("div");
  el.className = "pane-slot";
  el.setAttribute("data-slot", id);
  const pane = createNode("section");
  pane.className = "pane";
  pane.id = `pane-${id}`;
  pane.setAttribute("data-pane", id);
  el.appendChild(pane);
  return el;
}

const docRoot = createNode("div");
const stage = createNode("div");
stage.id = "stage";
stage.attrs.id = "stage";
stage.clientWidth = 390;
const nav = createNode("nav");
nav.id = "tabs";
nav.attrs.id = "tabs";
nav.clientWidth = 360;
const bubble = createNode("span");
bubble.id = "tab-bubble";
bubble.attrs.id = "tab-bubble";
nav.appendChild(bubble);
for (const id of BASE) {
  stage.appendChild(slot(id));
  nav.appendChild(button(id));
}
const sheet = createNode("div");
sheet.id = "sheet";
sheet.attrs.id = "sheet";
const view = createNode("main");
view.id = "view";
view.attrs.id = "view";
docRoot.appendChild(stage);
docRoot.appendChild(nav);
docRoot.appendChild(sheet);
docRoot.appendChild(view);
const body = createNode("body");
body.appendChild(docRoot);

const documentStub = {
  body,
  documentElement: createNode("html"),
  addEventListener() {},
  removeEventListener() {},
  getElementById(id) {
    return queryAll(body, `#${id}`)[0] || (body.id === id ? body : null);
  },
  querySelector(sel) { return queryAll(body, sel)[0] || null; },
  querySelectorAll(sel) { return queryAll(body, sel); },
  createElement: (tag) => createNode(tag),
};
globalThis.document = documentStub;
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.scrollTo = () => {};
globalThis.scrollBy = () => {};
globalThis.getComputedStyle = () => ({ transform: "none", overflowX: "visible" });

const { app } = await import("../logger/js/runtime.js");
const {
  dailyRoutinesHTML,
  ensureRoutineShell,
  loggedTodayCount,
  routineNowNext,
  routinesDiscoverSheetHTML,
  routinesSettingsSheetHTML,
} = await import("../logger/js/pages/daily-routines.js");
const { visibleTabOrder } = await import("../logger/js/shell/pager.js");
await import("../logger/js/shell/workout.js");

function tabIds() {
  return nav.children.filter((child) => child.attrs["data-tab"]).map((child) => child.attrs["data-tab"]);
}
function slotIds() {
  return stage.children.filter((child) => child.attrs["data-slot"]).map((child) => child.attrs["data-slot"]);
}
function labels() {
  return nav.children.filter((child) => child.attrs["data-tab"]).map((child) => child.children[0] ? child.children[0].textContent : child.innerHTML);
}

describe("routines tab shell", { concurrency: false }, () => {
test("flag off keeps the five tabs, labels, and bubble math", () => {
  app.ROUTINES_ENABLED = false;
  app.session = null;
  app.ui = { tab: "food", edit: null, briefEdit: false, detail: null };
  app.syncRoutineTabs();
  assert.deepEqual(visibleTabOrder(false), BASE);
  assert.deepEqual(app.TAB_ORDER, BASE);
  assert.deepEqual(tabIds(), BASE);
  assert.deepEqual(slotIds(), BASE);
  assert.deepEqual(labels(), ["Home", "Workouts", "Food", "Progress", "Insights"]);
  assert.equal(nav.querySelector('[data-runtime="routine"]'), null);
  assert.equal(nav.attrs["data-tabs"], undefined);
  assert.equal(nav.styleMap["--tab-count"], undefined);
  app.placeBubble(2, true);
  assert.equal(bubble.style.width, "64px");
  assert.equal(bubble.style.transform, "translate3d(148px,0,0)");
});

test("flag on inserts Routines after Workouts and the bubble uses six slots", () => {
  app.ROUTINES_ENABLED = true;
  app.session = null;
  app.ui = { tab: "food", edit: null, briefEdit: false, detail: null, sheet: null };
  app.syncRoutineTabs();
  app.syncRoutineTabs();
  assert.deepEqual(visibleTabOrder(true), SIX);
  assert.deepEqual(app.TAB_ORDER, SIX);
  assert.deepEqual(tabIds(), SIX);
  assert.deepEqual(slotIds(), SIX);
  const routines = nav.querySelector('[data-tab="daily-routines"]');
  assert.equal(routines.getAttribute("aria-label"), "Routines");
  assert.match(routines.innerHTML, /<span>Routines<\/span>/);
  assert.equal(nav.attrs["data-tabs"], "6");
  assert.equal(nav.styleMap["--tab-count"], "6");
  assert.equal(app.motion.index, 3);
  const food = stage.querySelector('[data-slot="food"]');
  const added = stage.querySelector('[data-slot="daily-routines"]');
  assert.equal(food.style.transform, "translate3d(0px,0,0)");
  assert.equal(added.style.transform, "translate3d(-390px,0,0)");
  app.placeBubble(2, true);
  assert.equal(bubble.style.width, "52px");
  assert.equal(bubble.style.transform, "translate3d(124px,0,0)");
});

test("turning the flag off restores the five-tab pager", () => {
  app.ui.tab = "daily-routines";
  app.ROUTINES_ENABLED = false;
  app.syncRoutineTabs();
  assert.equal(app.ui.tab, "home");
  assert.deepEqual(tabIds(), BASE);
  assert.deepEqual(slotIds(), BASE);
  assert.equal(stage.querySelector('[data-runtime="routine"]'), null);
  assert.equal(nav.attrs["data-tabs"], undefined);
  app.placeBubble(2, true);
  assert.equal(bubble.style.width, "64px");
  assert.equal(bubble.style.transform, "translate3d(148px,0,0)");
});

test("goTab opens Routines only while the flag is on", () => {
  app.workoutsHTML = () => "workouts-page";
  app.ui = { tab: "home", edit: null, briefEdit: false, detail: null, sheet: null, foodDay: null, iseg: "trends" };
  let rendered = "";
  app.render = () => { rendered = app.ui.tab; };
  app.ROUTINES_ENABLED = false;
  app.goTab("daily-routines");
  assert.equal(app.ui.tab, "home");
  assert.equal(rendered, "home");
  app.ROUTINES_ENABLED = true;
  app.syncRoutineTabs();
  app.ui.tab = "home";
  app.motion.index = 0;
  app.goTab("daily-routines");
  assert.equal(app.ui.tab, "daily-routines");
  assert.equal(rendered, "daily-routines");
  assert.equal(app.motion.index, 2);
  const workouts = stage.querySelector('[data-pane="workouts"]');
  assert.equal(workouts.innerHTML, "workouts-page");
});

test("signed out with the flag on asks for sign-in and creates no store", () => {
  const state = { dailyRoutines: null };
  app.state = state;
  app.session = null;
  app.ROUTINES_ENABLED = true;
  app.routineNow = () => new Date(2026, 10, 19, 8, 30);
  let saves = 0;
  app.save = () => { saves += 1; };
  const html = dailyRoutinesHTML();
  assert.match(html, /data-routines-shell="signed-out"/);
  assert.match(html, /Sign in to use Routines/);
  assert.match(html, /data-action="auth-open"/);
  assert.doesNotMatch(html, /Morning routine/);
  assert.equal(state.dailyRoutines, null);
  assert.equal(saves, 0);
  assert.equal(ensureRoutineShell(state, 1), null);
  assert.equal(state.dailyRoutines, null);
});

test("signed in with the flag on paints the shell and seeds the three default blocks", () => {
  const state = { dailyRoutines: null };
  app.state = state;
  app.ROUTINES_ENABLED = true;
  app.session = { user: { id: "synthetic-user" } };
  app.today = () => "2026-11-19";
  app.routineNow = () => new Date(2026, 10, 19, 8, 30);
  let saves = 0;
  app.save = () => { saves += 1; };
  const html = dailyRoutinesHTML();
  assert.match(html, /data-routines-shell="signed-in"/);
  assert.match(html, /Now · Morning · 8:30 AM/);
  assert.match(html, /Morning routine/);
  assert.match(html, /Next · Supplement &amp; enhancer stack<span class="dr-wait">in 3 hr 30 min<\/span>/);
  assert.match(html, /<b>0<\/b> logged today/);
  assert.match(html, /aria-label="Routines settings"/);
  assert.match(html, /data-action="routines-discover"/);
  assert.match(html, /Add the first item/);
  assert.doesNotMatch(html, /check-in/i);
  assert.doesNotMatch(html, /Daily check-in/);
  const names = state.dailyRoutines.blocks.map((block) => block.name);
  assert.deepEqual(names, ["Morning routine", "Supplement & enhancer stack", "Night routine"]);
  assert.equal(saves, 1);
  const ids = state.dailyRoutines.blocks.map((block) => block.id);
  app.save = () => { throw new Error("seeded store should not save again"); };
  const again = dailyRoutinesHTML();
  assert.deepEqual(state.dailyRoutines.blocks.map((block) => block.id), ids);
  assert.match(again, /Morning routine/);

  state.dailyRoutines.logs.push(
    { id: "log-done", itemId: "item-a", day: "2026-11-19", status: "done", amount: 0.25, unit: "mcg", updatedAt: 5, deletedAt: null },
    { id: "log-part", itemId: "item-a", day: "2026-11-19", status: "partial", amount: 1, unit: "mg", updatedAt: 6, deletedAt: null },
    { id: "log-skip", itemId: "item-a", day: "2026-11-19", status: "skipped", amount: 9, unit: "mg", updatedAt: 7, deletedAt: null },
  );
  const counted = dailyRoutinesHTML();
  assert.match(counted, /<b>2<\/b> logged today/);
  assert.doesNotMatch(counted, /0\.25|mcg|>9</);
  assert.equal(loggedTodayCount(state.dailyRoutines.logs, "2026-11-19"), 2);
});

test("a night clock names the night block and the morning that follows", () => {
  app.routineNow = () => new Date(2026, 10, 19, 21, 15);
  const html = dailyRoutinesHTML();
  assert.match(html, /Now · Night · 9:15 PM/);
  assert.match(html, /<h2 class="dr-now-title" id="dr-now-title">Night routine<\/h2>/);
  assert.match(html, /Next · Morning routine<span class="dr-wait">in 7 hr 45 min<\/span>/);
  const moment = routineNowNext(app.state.dailyRoutines.blocks, new Date(2026, 10, 19, 3, 0));
  assert.equal(moment.nowBlock.name, "Night routine");
  assert.equal(moment.nextBlock.name, "Morning routine");
  assert.equal(moment.waitMin, 120);
});

test("a signed-in pull in flight does not seed or save", () => {
  const state = { dailyRoutines: null };
  app.state = state;
  app.ROUTINES_ENABLED = true;
  app.session = { user: { id: "synthetic-user" } };
  app.sb = { from() {} };
  app.cloudPullOk = false;
  app.routineNow = () => new Date(2026, 10, 19, 8, 30);
  app.save = () => { throw new Error("pull in flight must not save"); };
  const html = dailyRoutinesHTML();
  assert.match(html, /data-routines-shell="syncing"/);
  assert.match(html, /Syncing your account/);
  assert.equal(state.dailyRoutines, null);
  assert.equal(ensureRoutineShell(state, 4), null);
  app.cloudPullOk = true;
  let saves = 0;
  app.save = () => { saves += 1; };
  const ready = dailyRoutinesHTML();
  assert.match(ready, /data-routines-shell="signed-in"/);
  assert.equal(state.dailyRoutines.blocks.length, 3);
  assert.equal(saves, 1);
  app.cloudPullOk = false;
  app.save = () => { throw new Error("an existing store must not save during pull"); };
  const held = dailyRoutinesHTML();
  assert.match(held, /data-routines-shell="signed-in"/);
  assert.match(held, /Morning routine/);
  assert.equal(state.dailyRoutines.blocks.length, 3);
  app.sb = null;
  app.cloudPullOk = false;
});

test("flag off does not paint the shell or write a store", () => {
  const state = { dailyRoutines: null };
  app.state = state;
  app.ROUTINES_ENABLED = false;
  app.session = { user: { id: "synthetic-user" } };
  app.save = () => { throw new Error("flag off must not save"); };
  assert.equal(dailyRoutinesHTML(), "");
  assert.equal(state.dailyRoutines, null);
  assert.equal(ensureRoutineShell(state, 10), null);
});

test("settings includes focus mode and Discover stays a placeholder", () => {
  assert.match(routinesSettingsSheetHTML(), /Notifications stay off/);
  assert.match(routinesDiscoverSheetHTML(), /does not suggest a dose/);
  app.$ = (sel) => document.querySelector(sel);
  app.stopBarcode = () => {};
  app.ui.sheet = "routines-settings";
  app.renderSheet();
  assert.equal(sheet.hidden, false);
  assert.match(sheet.innerHTML, /aria-label="Routines settings"/);
  assert.match(sheet.innerHTML, /Focus mode/);
  assert.match(sheet.innerHTML, /aria-checked="false"/);
  assert.match(sheet.innerHTML, /Notifications stay off/);
  app.ui.sheet = "routines-discover";
  app.renderSheet();
  assert.match(sheet.innerHTML, /aria-label="Discover"/);
  assert.match(sheet.innerHTML, /Study-backed entries are not in the app yet/);
});

test("static files keep the flag-off tab bar and cache the new shell", () => {
  const pager = readFileSync(new URL("../logger/js/shell/pager.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("../logger/index.html", import.meta.url), "utf8");
  const sw = readFileSync(new URL("../logger/sw.js", import.meta.url), "utf8");
  const sentry = readFileSync(new URL("../logger/js/sentry.js", import.meta.url), "utf8");
  const main = readFileSync(new URL("../logger/js/main.js", import.meta.url), "utf8");
  const page = readFileSync(new URL("../logger/js/pages/daily-routines.js", import.meta.url), "utf8");
  const css = readFileSync(new URL("../logger/css/routines.css", import.meta.url), "utf8");
  assert.match(pager, /app\.TAB_ORDER = \["home", "workouts", "food", "progress", "insights"\];/);
  const tabs = [...html.matchAll(/class="tab"[^>]*data-tab="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(tabs, BASE);
  assert.match(html, /css\/routines\.css/);
  assert.match(css, /repeat\(var\(--tab-count, 5\)/);
  assert.match(css, /100% \/ var\(--tab-count, 5\) - 8px/);
  assert.doesNotMatch(css, /text-transform\s*:/i);
  assert.match(sw, /const CACHE = "insight-shell-v58"/);
  assert.match(sentry, /insight-shell-v58/);
  assert.match(sw, /js\/pages\/daily-routines\.js/);
  assert.match(sw, /css\/routines\.css/);
  assert.match(main, /import "\.\/pages\/daily-routines\.js";/);
  assert.equal(main.match(/routines-flag/g).length, 1);
  assert.doesNotMatch(page, /routines-flag/);
  assert.doesNotMatch(pager, /routines-flag/);
  assert.match(readFileSync(new URL("../logger/js/shell/actions.js", import.meta.url), "utf8"), /case "routines-settings"/);
});
});
