import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

/* Synthetic routines only. Discover is a coming-soon entry, not a catalog. */

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
globalThis.document = {
  addEventListener() {},
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
const {
  addRoutineItem,
  dailyRoutinesHTML,
  deleteRoutineItem,
  routinesDiscoverSheetHTML,
} = await import("../logger/js/pages/daily-routines.js");
const { isLive } = await import("../logger/js/shared/daily-routines-store.js");

const CATEGORIES = ["Peptides", "GLP-1", "SARMs", "Steroids", "Supplements", "Nootropics", "Skincare actives"];

function read(rel) {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

function signIn() {
  app.ROUTINES_ENABLED = true;
  app.session = { user: { id: "synthetic-user" } };
  app.sb = null;
  app.cloudPullOk = true;
  app.state = { dailyRoutines: null };
  app.ui = { tab: "daily-routines", sheet: null, sd: {}, dailyRoutineEdit: false, routineAnnounce: "" };
  app.today = () => "2026-11-19";
  app.routineNow = () => new Date(2026, 10, 19, 8, 30);
  app.save = () => {};
}

function liveBlock(name) {
  const block = app.state.dailyRoutines.blocks.find((row) => row.name === name && isLive(row));
  assert.ok(block, name);
  return block.id;
}

describe("Discover coming soon", { concurrency: false }, () => {
  test("the top button and the empty state both show coming soon", () => {
    signIn();
    const html = dailyRoutinesHTML();
    const entry = html.indexOf('data-routines-discover="entry"');
    const now = html.indexOf('class="dr-now"');
    const tiles = html.indexOf('class="dr-tiles"');
    const empty = html.indexOf('data-routines-discover="empty"');
    assert.ok(entry >= 0 && entry < now && now < tiles && tiles < empty);
    assert.match(html.slice(entry, now), /Discover/);
    assert.match(html.slice(entry, now), /Coming soon/);
    assert.match(html.slice(empty), /<h2>Coming soon<\/h2>/);
    assert.match(html.slice(empty), /data-action="routines-discover"/);
    assert.equal(html.match(/data-action="routines-discover"/g).length, 2);
    const tileHtml = html.slice(tiles, html.indexOf("dr-add-block"));
    assert.doesNotMatch(tileHtml, /discover|recommend|Coming soon/i);
    for (const name of CATEGORIES) assert.equal(html.includes(name), false, name);
    assert.doesNotMatch(html, /<input|search|compare|Evidence|Studies/i);
  });

  test("an item hides the empty state and leaves the top button", () => {
    signIn();
    dailyRoutinesHTML();
    const morning = liveBlock("Morning routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Sample check", kind: "check" }), true);
    const html = dailyRoutinesHTML();
    assert.match(html, /data-routines-discover="entry"/);
    assert.match(html, /Coming soon/);
    assert.doesNotMatch(html, /data-routines-discover="empty"/);
    assert.match(html, /Sample check/);
    assert.doesNotMatch(html, /recommend/i);
    const item = app.state.dailyRoutines.items.find((row) => row.name === "Sample check");
    assert.equal(deleteRoutineItem(app.state, item.id), true);
    const again = dailyRoutinesHTML();
    assert.match(again, /data-routines-discover="empty"/);
    assert.match(again, /data-routines-discover="entry"/);
  });

  test("the sheet is coming soon and does not open a catalog", () => {
    signIn();
    dailyRoutinesHTML();
    const before = structuredClone(app.state.dailyRoutines);
    const sheet = routinesDiscoverSheetHTML();
    assert.match(sheet, /<h3>Coming soon<\/h3>/);
    assert.match(sheet, /no library/);
    assert.match(sheet, /does not suggest a dose/);
    assert.match(sheet, /data-action="sheet-close"/);
    assert.doesNotMatch(sheet, /<li|<ul|<input|<form|search|recommend/i);
    assert.doesNotMatch(sheet, /mcg|\bmg\b|IU|mL|\d+\s*(?:mcg|mg|IU|mL)/);
    for (const name of CATEGORIES) assert.equal(sheet.includes(name), false, name);
    assert.deepEqual(app.state.dailyRoutines, before);
    assert.equal(app.state.dailyRoutines.items.length, 0);
    assert.equal(app.state.dailyRoutines.compounds.length, 0);
    assert.equal(Object.hasOwn(app.state.dailyRoutines, "library"), false);
    assert.equal(Object.hasOwn(app.state.dailyRoutines, "discover"), false);
  });

  test("a fresh shell seeds no catalog rows", () => {
    signIn();
    dailyRoutinesHTML();
    const store = app.state.dailyRoutines;
    assert.deepEqual(store.blocks.filter(isLive).map((block) => block.name), [
      "Morning routine",
      "Supplement & enhancer stack",
      "Night routine",
    ]);
    assert.deepEqual(store.items, []);
    assert.deepEqual(store.compounds, []);
    assert.deepEqual(store.placements, []);
    assert.deepEqual(store.logs, []);
  });

  test("flag off, signed out, and a pull in flight leave Discover unchanged", () => {
    const state = { dailyRoutines: null };
    app.state = state;
    app.session = { user: { id: "synthetic-user" } };
    app.ROUTINES_ENABLED = false;
    app.sb = null;
    app.cloudPullOk = true;
    app.save = () => { throw new Error("flag off must not save"); };
    assert.equal(dailyRoutinesHTML(), "");
    assert.equal(state.dailyRoutines, null);

    app.ROUTINES_ENABLED = true;
    app.session = null;
    app.save = () => { throw new Error("signed out must not save"); };
    const signedOut = dailyRoutinesHTML();
    assert.match(signedOut, /data-routines-shell="signed-out"/);
    assert.match(signedOut, /Sign in to use Routines/);
    assert.doesNotMatch(signedOut, /routines-discover|Coming soon/);
    assert.equal(state.dailyRoutines, null);

    app.session = { user: { id: "synthetic-user" } };
    app.sb = { from() {} };
    app.cloudPullOk = false;
    app.save = () => { throw new Error("pull in flight must not save"); };
    const waiting = dailyRoutinesHTML();
    assert.match(waiting, /data-routines-shell="syncing"/);
    assert.doesNotMatch(waiting, /routines-discover|Coming soon/);
    assert.equal(state.dailyRoutines, null);
  });

  test("there is no catalog route, seed file, or library migration", () => {
    const index = read("../logger/index.html");
    const pager = read("../logger/js/shell/pager.js");
    const page = read("../logger/js/pages/daily-routines.js");
    const actions = read("../logger/js/shell/actions.js");
    const css = read("../logger/css/routines.css");
    const flag = read("../logger/js/shared/routines-flag.js");
    assert.doesNotMatch(index, /data-pane="discover"|data-tab="discover"/);
    assert.doesNotMatch(pager, /discover/);
    assert.match(flag, /ROUTINES_ENABLED = true/);
    assert.doesNotMatch(page, /routines-flag/);
    assert.doesNotMatch(page, /discoverEntries|DISCOVER_SEED|libraryEntries|placeholderEntries|routineLibrary/);
    assert.match(css, /\.dr-discover \{/);
    assert.doesNotMatch(css, /text-transform\s*:/i);
    const discoverCase = actions.slice(actions.indexOf('case "routines-discover"'), actions.indexOf('case "routines-log"'));
    assert.match(discoverCase, /routines-discover/);
    assert.doesNotMatch(discoverCase, /fetch\(|catalog|location\.|hash/);

    const pages = readdirSync(fileURLToPath(new URL("../logger/js/pages/", import.meta.url)));
    assert.deepEqual(pages.filter((name) => /discover/i.test(name)), []);
    const migrations = readdirSync(fileURLToPath(new URL("../supabase/migrations/", import.meta.url)));
    assert.deepEqual(migrations.filter((name) => /discover|routine_library|library/i.test(name)), []);

    const loggerJs = fileURLToPath(new URL("../logger/js/", import.meta.url));
    const flagHits = walk(loggerJs).filter((path) => readFileSync(path, "utf8").includes("routines-flag"));
    assert.deepEqual(flagHits.map((path) => path.split("/").pop()), ["main.js"]);

    const nativeApp = fileURLToPath(new URL("../native/src/app/", import.meta.url));
    const nativeHits = walk(nativeApp).filter((path) => /discover|reconstitut/i.test(path));
    assert.deepEqual(nativeHits, []);

    const sw = read("../logger/sw.js");
    const sentry = read("../logger/js/sentry.js");
    assert.match(sw, /const CACHE = "insight-shell-v89"/);
    assert.match(sentry, /insight-shell-v89/);
  });
});
