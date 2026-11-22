import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/* Synthetic rows for the in-row action rail. Skip, History, Edit, and Undo
   sit inside each row. Supply shows once. Names are Example Compound A and
   similar. */

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

const listeners = [];
globalThis.document = {
  addEventListener(type, fn) { listeners.push({ type, fn }); },
  removeEventListener() {},
  documentElement: { dataset: {}, classList: { add() {}, remove() {} } },
  body: el(),
  head: el(),
  querySelector: () => el(),
  querySelectorAll: () => [],
  getElementById: () => el(),
  createElement: () => el(),
};
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { app } = await import("../logger/js/runtime.js");
app.$ = () => el();
const {
  addRoutineItem,
  clearRoutineLogToast,
  dailyRoutinesHTML,
  logRoutineItem,
  skipRoutineItem,
} = await import("../logger/js/pages/daily-routines.js");
await import("../logger/js/shell/actions.js");

const DAY = "2026-11-19";
let clock = new Date(2026, 10, 19, 8, 30, 0, 0).getTime();

function pinAt(ms) {
  clock = ms;
  app.today = () => DAY;
  app.routineNow = () => new Date(clock);
}

function signIn() {
  clearRoutineLogToast();
  app.ROUTINES_ENABLED = true;
  app.session = { user: { id: "synthetic-user" } };
  app.sb = null;
  app.cloudPullOk = true;
  app.state = { dailyRoutines: null };
  app.ui = { sheet: null, sd: {}, dailyRoutineEdit: false, tab: "daily-routines" };
  app.save = () => {};
  app.render = () => {};
  app.eatClick = false;
  pinAt(new Date(2026, 10, 19, 8, 30, 0, 0).getTime());
  dailyRoutinesHTML();
}

function blockId(name) {
  const block = app.state.dailyRoutines.blocks.find((row) => row.name === name);
  assert.ok(block, name);
  return block.id;
}

function itemNamed(name) {
  const item = app.state.dailyRoutines.items.find((row) => row.name === name);
  assert.ok(item, name);
  return item;
}

async function tap(dataset, { eat = false } = {}) {
  const node = {
    dataset,
    closest(sel) {
      if (sel === "[data-action]") return node;
      return null;
    },
  };
  app.eatClick = eat;
  const click = listeners.filter((row) => row.type === "click").pop();
  assert.ok(click, "click listener");
  await click.fn({ target: node, preventDefault() {}, stopPropagation() {} });
}

function rowFor(html, itemId) {
  const at = html.indexOf(`<li class="dr-row" data-item-id="${itemId}"`);
  assert.ok(at >= 0, `open row for ${itemId}`);
  return html.slice(at, html.indexOf("</li>", at) + 5);
}

function doneRowFor(html, itemId) {
  const at = html.indexOf(`<li class="dr-row dr-row-done" data-details="row" data-item-id="${itemId}"`);
  assert.ok(at >= 0, `done row for ${itemId}`);
  return html.slice(at, html.indexOf("</li>", at) + 5);
}

function rail(row) {
  const match = row.match(/<span class="dr-rail" data-action="routines-rail">[\s\S]*<\/span>\s*<\/li>$/);
  return match ? match[0] : "";
}

function reveal(morning) {
  app.state.dailyRoutines.prefs = { ...(app.state.dailyRoutines.prefs || {}), revealBlocks: [morning] };
}

describe("routine row action rail", { concurrency: false }, () => {
  test("Skip and History sit in the open row's rail, after the log button", () => {
    signIn();
    const morning = blockId("Morning routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" }), true);
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Check", kind: "check" }), true);
    const html = dailyRoutinesHTML();
    const dose = rowFor(html, itemNamed("Example Compound A").id);
    const doseRail = rail(dose);
    assert.ok(doseRail, "dose row has a rail");
    assert.ok(dose.indexOf("dr-rail") > dose.indexOf('class="dr-log"'), "rail follows the log button");
    assert.match(doseRail, /class="dr-history dr-rail-btn" data-action="routines-history"/);
    assert.match(doseRail, /<span class="dr-vh">History for Example Compound A<\/span>/);
    assert.match(doseRail, /class="dr-skip dr-rail-btn dr-rail-labeled" data-action="routines-skip"/);
    assert.match(doseRail, /<span class="dr-rail-label">Skip<\/span><span class="dr-vh"> Example Compound A<\/span>/);
    assert.ok(doseRail.indexOf("dr-history") < doseRail.indexOf("dr-skip"), "Skip is the last action");
    assert.match(dose, /data-kind="dose"/);

    const check = rowFor(html, itemNamed("Example Check").id);
    const checkRail = rail(check);
    assert.match(checkRail, /data-action="routines-skip"/);
    assert.doesNotMatch(checkRail, /routines-history/);
    assert.match(check, /data-kind="check"/);
    assert.doesNotMatch(html, /dr-done-actions/);
  });

  test("a tap in the rail's gap does not log", async () => {
    signIn();
    const morning = blockId("Morning routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Check", kind: "check" }), true);
    const before = app.state.dailyRoutines.logs.length;
    await tap({ action: "routines-rail" });
    assert.equal(app.state.dailyRoutines.logs.length, before);
    const actions = readFileSync(new URL("../logger/js/shell/actions.js", import.meta.url), "utf8");
    assert.doesNotMatch(actions, /case "routines-rail"/);
  });

  test("a skipped row moves to completed with a skipped mark and Undo in its rail", () => {
    signIn();
    const morning = blockId("Morning routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Check", kind: "check" }), true);
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 1, unit: "mg" }), true);
    assert.equal(skipRoutineItem(app.state, itemNamed("Example Check").id), true);
    assert.equal(logRoutineItem(app.state, itemNamed("Example Compound A").id), true);
    reveal(morning);
    const html = dailyRoutinesHTML();
    const skipped = doneRowFor(html, itemNamed("Example Check").id);
    assert.match(skipped, /data-state="skipped"/);
    assert.match(skipped, /<span class="dr-mark dr-mark-skip" aria-hidden="true">–<\/span>/);
    assert.match(skipped, /<span class="dr-state" data-state="skipped">Skipped<\/span>/);
    const skippedRail = rail(skipped);
    assert.match(skippedRail, /class="dr-undo dr-rail-btn dr-rail-labeled" data-action="routines-undo" data-log-id="/);
    assert.match(skippedRail, /<span class="dr-rail-label">Undo<\/span><span class="dr-vh"> Example Check<\/span>/);
    assert.match(skippedRail, /data-action="routines-log-edit"/);

    const logged = doneRowFor(html, itemNamed("Example Compound A").id);
    assert.match(logged, /<span class="dr-state" data-state="done">Logged<\/span>/);
    const loggedRail = rail(logged);
    assert.ok(loggedRail.indexOf("routines-history") < loggedRail.indexOf("routines-log-edit"));
    assert.ok(loggedRail.indexOf("routines-log-edit") < loggedRail.indexOf("routines-undo"));
  });

  test("an open row shows its supply once", () => {
    signIn();
    const morning = blockId("Morning routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg", onHand: "4" }), true);
    const row = rowFor(dailyRoutinesHTML(), itemNamed("Example Compound A").id);
    assert.equal((row.match(/class="dr-supply"/g) || []).length, 1);
  });

  test("rail targets stay 44px, the row keeps one line of actions, and long press skips the rail", () => {
    const css = readFileSync(new URL("../logger/css/routines.css", import.meta.url), "utf8");
    assert.match(css, /\.dr-rail-btn \{[^}]*min-width: 44px;[^}]*min-height: 44px;/);
    assert.match(css, /\.dr-row \{\s*position: relative;\s*flex-wrap: nowrap;/);
    assert.match(css, /\.dr-rail-btn:focus-visible \{[^}]*outline:/);
    assert.match(css, /\.dr-log:focus-visible \{[^}]*outline:/);
    const details = readFileSync(new URL("../logger/js/pages/daily-routines-details.js", import.meta.url), "utf8");
    const skip = details.match(/const PRESS_SKIP = "([^"]+)"/);
    assert.ok(skip);
    for (const cls of [".dr-skip", ".dr-undo", ".dr-history", ".dr-edit-log"]) assert.ok(skip[1].includes(cls), cls);
  });
});
