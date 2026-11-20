import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/* Synthetic log-all and the Logged · Undo toast. Names are Example Compound A
   and similar. Amounts stay on each log. A long press sets eatClick, and that
   click must not log. */

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
  ROUTINE_LOG_TOAST_MS,
  addRoutineItem,
  clearRoutineLogToast,
  dailyRoutinesHTML,
  logAllRoutineBlock,
  logRoutineItem,
  logRoutineRest,
  routineLogToast,
  showRoutineLogToast,
  skipRoutineItem,
  toggleRoutineCollapsed,
  undoRoutineLogToast,
  undoRoutineLogs,
} = await import("../logger/js/pages/daily-routines.js");
await import("../logger/js/shell/actions.js");
const { putDailyRoutines, upsertEntity } = await import("../logger/js/shared/daily-routines-store.js");

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

function liveLogs() {
  return app.state.dailyRoutines.logs.filter((log) => !(log.deletedAt > 0));
}

function liveFor(itemId) {
  return liveLogs().filter((log) => log.itemId === itemId && log.rest !== true);
}

function toastMarkup(html) {
  const match = html.match(/<div class="dr-log-toast"[\s\S]*?<\/div>/);
  return match ? match[0] : "";
}

function toastText(html) {
  return toastMarkup(html).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
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

describe("routine log all and undo toast", { concurrency: false }, () => {
  test("log all writes one log per open item and does not sum amounts", () => {
    signIn();
    const morning = blockId("Morning routine");
    const night = blockId("Night routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" }), true);
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound B", kind: "dose", amount: 0.25, unit: "mg" }), true);
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Check", kind: "check" }), true);
    assert.equal(addRoutineItem(app.state, night, { name: "Example Compound C", kind: "dose", amount: 1, unit: "mg" }), true);
    const shared = itemNamed("Example Compound A");
    const placed = upsertEntity(app.state.dailyRoutines, "placements", {
      id: "place-night-a", blockId: night, itemId: shared.id, order: 1, deletedAt: null,
    }, 80);
    assert.equal(putDailyRoutines(app.state, placed), true);
    const openHTML = dailyRoutinesHTML();
    assert.match(openHTML, new RegExp(`data-action="routines-log-all" data-block-id="${morning}"`));
    assert.match(openHTML, new RegExp(`data-action="routines-log-all" data-block-id="${night}"`));
    assert.match(openHTML, /<li class="dr-row"[^>]*data-action="routines-log">/);
    assert.match(openHTML, /data-action="routines-skip"/);
    const ids = logAllRoutineBlock(app.state, morning);
    assert.equal(Array.isArray(ids) && ids.length, 3);
    assert.equal(new Set(ids).size, 3);
    const logs = ids.map((id) => app.state.dailyRoutines.logs.find((log) => log.id === id));
    assert.deepEqual(logs.map((log) => log.amount).sort((a, b) => (a == null ? 1 : b == null ? -1 : a - b)), [0.25, 250, null]);
    assert.ok(logs.every((log) => log.status === "done" && log.day === DAY && log.rest !== true && log.deletedAt == null));
    assert.ok(logs.every((log) => log.amount !== 250.25));
    assert.equal(logAllRoutineBlock(app.state, morning), false);
    const nightIds = logAllRoutineBlock(app.state, night);
    assert.deepEqual(nightIds.map((id) => app.state.dailyRoutines.logs.find((log) => log.id === id).itemId), [itemNamed("Example Compound C").id]);
    assert.equal(liveFor(shared.id).length, 1);
    const doneHTML = dailyRoutinesHTML();
    assert.match(doneHTML, /data-all-done="true"/);
    assert.doesNotMatch(doneHTML, /data-action="routines-log-all"/);
    assert.doesNotMatch(doneHTML, /data-action="routines-log"/);
  });

  test("undo of log all tombstones only that batch", () => {
    signIn();
    const morning = blockId("Morning routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" }), true);
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Check", kind: "check" }), true);
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound B", kind: "dose", amount: 1, unit: "mg" }), true);
    assert.equal(logRoutineItem(app.state, itemNamed("Example Compound A").id), true);
    const kept = liveFor(itemNamed("Example Compound A").id)[0];
    const ids = logAllRoutineBlock(app.state, morning);
    assert.equal(ids.length, 2);
    assert.ok(!ids.includes(kept.id));
    assert.equal(showRoutineLogToast(ids), true);
    assert.equal(undoRoutineLogToast(app.state), true);
    for (const id of ids) {
      const log = app.state.dailyRoutines.logs.find((row) => row.id === id);
      assert.ok(log.deletedAt > 0);
      assert.equal(log.deletedAt, log.updatedAt);
    }
    const still = liveFor(itemNamed("Example Compound A").id);
    assert.equal(still.length, 1);
    assert.equal(still[0].id, kept.id);
    assert.equal(still[0].amount, 250);
    assert.equal(routineLogToast(), null);
    const html = dailyRoutinesHTML();
    assert.match(html, /Example Check/);
    assert.match(html, /data-action="routines-log-all"/);
    assert.equal(undoRoutineLogs(app.state, ids), false);
  });

  test("skip rows are not included in log all, and a rest day is left alone", () => {
    signIn();
    const morning = blockId("Morning routine");
    const night = blockId("Night routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" }), true);
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound B", kind: "dose", amount: 0.25, unit: "mg" }), true);
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Check", kind: "check" }), true);
    assert.equal(addRoutineItem(app.state, night, { name: "Example Compound C", kind: "dose", amount: 1, unit: "mg" }), true);
    assert.equal(skipRoutineItem(app.state, itemNamed("Example Compound B").id), true);
    const skipped = liveFor(itemNamed("Example Compound B").id)[0];
    assert.equal(skipped.status, "skipped");
    const ids = logAllRoutineBlock(app.state, morning);
    assert.equal(ids.length, 2);
    const written = ids.map((id) => app.state.dailyRoutines.logs.find((log) => log.id === id));
    assert.deepEqual(written.map((log) => log.itemId).sort(), [itemNamed("Example Check").id, itemNamed("Example Compound A").id].sort());
    assert.ok(written.every((log) => log.rest !== true && log.status === "done"));
    assert.ok(!ids.includes(skipped.id));
    assert.equal(logRoutineRest(app.state), true);
    const rest = liveLogs().find((log) => log.rest === true);
    const before = app.state.dailyRoutines.logs.length;
    assert.equal(logAllRoutineBlock(app.state, morning), false);
    assert.equal(logAllRoutineBlock(app.state, night), false);
    assert.equal(app.state.dailyRoutines.logs.length, before);
    assert.equal(liveFor(itemNamed("Example Compound C").id).length, 0);
    const restAfter = app.state.dailyRoutines.logs.find((log) => log.id === rest.id);
    assert.equal(restAfter.deletedAt, null);
    assert.equal(restAfter.rest, true);
    assert.equal(liveFor(itemNamed("Example Compound B").id).length, 1);
    assert.equal(liveFor(itemNamed("Example Compound B").id)[0].status, "skipped");
    assert.doesNotMatch(dailyRoutinesHTML(), /data-action="routines-log-all"/);
    assert.equal(logAllRoutineBlock(app.state, "missing-block"), false);
    app.session = null;
    assert.equal(logAllRoutineBlock(app.state, night), false);
  });

  test("edit mode does not log, and a collapsed block hides Log all", () => {
    signIn();
    const morning = blockId("Morning routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" }), true);
    const item = itemNamed("Example Compound A");
    let html = dailyRoutinesHTML();
    assert.match(html, /data-action="routines-log-all"/);
    assert.match(html, /Log all <span class="dr-vh">in Morning routine/);
    assert.match(html, /data-rename="item"/);
    assert.equal(toggleRoutineCollapsed(app.state, morning), true);
    html = dailyRoutinesHTML();
    assert.doesNotMatch(html, new RegExp(`data-action="routines-log-all" data-block-id="${morning}"`));
    assert.equal(toggleRoutineCollapsed(app.state, morning), true);
    app.ui.dailyRoutineEdit = true;
    const before = app.state.dailyRoutines.logs.length;
    assert.equal(logAllRoutineBlock(app.state, morning), false);
    html = dailyRoutinesHTML();
    assert.match(html, /data-routines-edit="on"/);
    assert.doesNotMatch(html, /data-action="routines-log"/);
    assert.doesNotMatch(html, /Log all/);
    assert.match(html, /data-rename="item"/);
    assert.equal(app.state.dailyRoutines.logs.length, before);
    return tap({ action: "routines-log", itemId: item.id }).then(() => {
      assert.equal(liveFor(item.id).length, 0);
      app.ui.dailyRoutineEdit = false;
    });
  });

  test("the toast lasts 3 seconds and undoes the last tap", async () => {
    signIn();
    const morning = blockId("Morning routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" }), true);
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound B", kind: "dose", amount: 1, unit: "mg" }), true);
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Check", kind: "check" }), true);
    assert.equal(ROUTINE_LOG_TOAST_MS, 3000);
    const start = clock;
    const beforeEat = liveLogs().length;
    await tap({ action: "routines-log", itemId: itemNamed("Example Compound B").id }, { eat: true });
    assert.equal(liveLogs().length, beforeEat);
    assert.equal(app.eatClick, false);
    assert.equal(routineLogToast(), null);
    await tap({ action: "routines-log", itemId: itemNamed("Example Compound A").id });
    const first = liveFor(itemNamed("Example Compound A").id)[0];
    let html = dailyRoutinesHTML();
    assert.equal(toastText(html), "Logged · Undo");
    assert.doesNotMatch(toastMarkup(html), /Example|250|mcg/);
    assert.deepEqual(routineLogToast().ids, [first.id]);
    pinAt(start + 2999);
    assert.equal(toastText(dailyRoutinesHTML()), "Logged · Undo");
    await tap({ action: "routines-skip", itemId: itemNamed("Example Check").id });
    assert.equal(liveFor(itemNamed("Example Check").id)[0].status, "skipped");
    assert.deepEqual(routineLogToast().ids, [first.id]);
    await tap({ action: "routines-log", itemId: itemNamed("Example Compound B").id });
    const second = liveFor(itemNamed("Example Compound B").id)[0];
    assert.deepEqual(routineLogToast().ids, [second.id]);
    await tap({ action: "routines-toast-undo" });
    assert.equal(liveFor(itemNamed("Example Compound B").id).length, 0);
    assert.equal(liveFor(itemNamed("Example Compound A").id).length, 1);
    assert.equal(routineLogToast(), null);
    assert.equal(toastMarkup(dailyRoutinesHTML()), "");
    await tap({ action: "routines-log-all", blockId: morning });
    const batch = liveFor(itemNamed("Example Compound B").id);
    assert.equal(batch.length, 1);
    assert.equal(liveFor(itemNamed("Example Check").id)[0].status, "skipped");
    assert.equal(toastText(dailyRoutinesHTML()), "Logged · Undo");
    const shown = clock;
    pinAt(shown + 3000);
    assert.equal(routineLogToast(), null);
    assert.equal(undoRoutineLogToast(app.state), false);
    assert.equal(batch[0].deletedAt, null);
  });

  test("a row tap logs and a swallowed long press does not", () => {
    const page = readFileSync(new URL("../logger/js/pages/daily-routines.js", import.meta.url), "utf8");
    const edit = readFileSync(new URL("../logger/js/pages/daily-routines-edit.js", import.meta.url), "utf8");
    const actions = readFileSync(new URL("../logger/js/shell/actions.js", import.meta.url), "utf8");
    const css = readFileSync(new URL("../logger/css/routines.css", import.meta.url), "utf8");
    const appearance = readFileSync(new URL("../logger/css/appearance.css", import.meta.url), "utf8");
    const flag = readFileSync(new URL("../logger/js/shared/routines-flag.js", import.meta.url), "utf8");
    const sw = readFileSync(new URL("../logger/sw.js", import.meta.url), "utf8");
    const sentry = readFileSync(new URL("../logger/js/sentry.js", import.meta.url), "utf8");
    assert.match(page, /data-rename="item"/);
    assert.doesNotMatch(page, /addEventListener\(\s*["']pointer/);
    assert.doesNotMatch(page, /preventDefault\(/);
    assert.doesNotMatch(page, /stopPropagation\(/);
    assert.doesNotMatch(page, /routines-flag/);
    assert.match(edit, /closest\("\[data-rename\]"\)/);
    assert.match(edit, /app\.eatClick = true/);
    const eatAt = actions.indexOf("if (app.eatClick)");
    const actionAt = actions.indexOf('closest("[data-action]")');
    assert.ok(eatAt > 0 && actionAt > eatAt);
    assert.match(actions, /case "routines-log-all"/);
    assert.match(actions, /case "routines-toast-undo"/);
    assert.match(css, /\.dr-log-toast \{[^}]*background: var\(--green\);[^}]*color: var\(--green-ink\);/);
    assert.match(css, /\.dr-log-all \{\s*background: var\(--green\);\s*color: var\(--green-ink\);/);
    assert.match(css, /@keyframes dr-toast-in/);
    const reduce = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    assert.match(reduce, /\.dr-log-toast[\s\S]*animation: none/);
    assert.match(appearance, /data-accent="sea"[\s\S]*--green:/);
    assert.match(flag, /ROUTINES_ENABLED = true/);
    assert.match(sw, /const CACHE = "insight-shell-v83"/);
    assert.match(sentry, /insight-shell-v83/);
    assert.equal(flag.match(/ROUTINES_ENABLED = true/g).length, 1);
  });
});
