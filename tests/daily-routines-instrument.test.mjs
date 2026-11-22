import assert from "node:assert/strict";
import { describe, test } from "node:test";

/* Synthetic accounts only. Covers the routines restructure: item types and
   their tabs, routine windows and days, the sun path, New routine and Edit
   routines, and the move of old Supplements, Enhancers and Medications
   blocks onto type tabs. */

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
const routines = await import("../logger/js/pages/daily-routines.js");
await import("../logger/js/pages/daily-routines-edit.js");
const plan = await import("../logger/js/pages/daily-routines-plan.js");
const { liveOf, seedDefaultBlocks, DEFAULT_BLOCK_STAMP } = await import("../logger/js/shared/daily-routines-store.js");
const types = await import("../logger/js/shared/routine-types.js");
const { routineBlockDays, routineBlockRunsOn, routineBlockWindow } = await import("../logger/js/shared/routine-dose.js");

const { addRoutineItem, dailyRoutinesHTML, hideRoutineBlock, moveRoutineBlock, routineDraftWindow, routineSunAxis, saveRoutineBlock, showRoutineBlock } = routines;

function pin(hour = 8, minute = 15) {
  app.today = () => "2026-11-22";
  app.routineNow = () => new Date(2026, 10, 22, hour, minute, 0);
}

function signIn(hour = 8, minute = 15) {
  app.ROUTINES_ENABLED = true;
  app.session = { user: { id: "synthetic-user" } };
  app.sb = null;
  app.cloudPullOk = true;
  app.state = { dailyRoutines: null };
  app.ui = { sheet: null, sd: {}, dailyRoutineEdit: false, tab: "daily-routines" };
  app.save = () => {};
  app.render = () => {};
  app.renderSheet = () => {};
  app.toast = () => {};
  app.$ = () => null;
  pin(hour, minute);
  dailyRoutinesHTML();
}

function block(id) {
  return app.state.dailyRoutines.blocks.find((row) => row.id === id);
}

function liveOrder() {
  return liveOf(app.state.dailyRoutines.blocks).filter((row) => row.hidden !== true).sort((a, b) => a.order - b.order).map((row) => row.name);
}

function item(name) {
  return liveOf(app.state.dailyRoutines.items).find((row) => row.name === name);
}

describe("routine windows and days", () => {
  test("a routine's own window wins over its name, and a bad end falls back to an hour", () => {
    assert.deepEqual(routineBlockWindow({ name: "Morning routine", startMin: 300, endMin: 660 }), { startMin: 300, endMin: 660, own: true });
    assert.deepEqual(routineBlockWindow({ name: "Example", startMin: 600, endMin: 500 }), { startMin: 600, endMin: 660, own: true });
    assert.equal(routineBlockWindow({ name: "Example" }), null, "an unknown name with no times has no window");
  });

  test("a window past midnight runs into the next day", () => {
    assert.deepEqual(routineDraftWindow("22:00", "02:00"), { startMin: 22 * 60, endMin: 26 * 60 });
    assert.deepEqual(routineDraftWindow(6 * 60, 9 * 60), { startMin: 360, endMin: 540 });
    assert.equal(routineDraftWindow("", "09:00"), null);
  });

  test("days default to every day and bad values are dropped", () => {
    assert.deepEqual(routineBlockDays({}), [0, 1, 2, 3, 4, 5, 6]);
    assert.deepEqual(routineBlockDays({ days: [4, 0, 0, 9, "x"] }), [0, 4]);
    assert.deepEqual(routineBlockDays({ days: [] }), [0, 1, 2, 3, 4, 5, 6], "no days means every day, never none");
    /* 2026-11-22 is a Sunday, weekday 6. */
    assert.equal(routineBlockRunsOn({ days: [0, 1, 2, 3, 4] }, "2026-11-22"), false);
    assert.equal(routineBlockRunsOn({ days: [5, 6] }, "2026-11-22"), true);
  });

  test("the sun path axis covers every window and stays within a day", () => {
    const axis = routineSunAxis([{ startMin: 300, endMin: 660 }, { startMin: 1020, endMin: 1380 }]);
    assert.equal(axis.start, 5 * 60);
    assert.equal(axis.end, 23 * 60);
    const late = routineSunAxis([{ startMin: 22 * 60, endMin: 26 * 60 }]);
    assert.equal(late.end, 26 * 60);
    assert.equal(late.place(60), 25 * 60, "1 AM after a late window sits past midnight");
    assert.ok(routineSunAxis([{ startMin: 0, endMin: 1440 }, { startMin: 600, endMin: 2000 }]).end - 0 <= 1440);
  });
});

describe("making and editing routines", () => {
  test("New routine saves a name, window, days, color and items", () => {
    signIn();
    assert.ok(addRoutineItem(app.state, "block_default_morning", { name: "Example walk", kind: "check" }));
    const walk = item("Example walk");
    assert.ok(saveRoutineBlock(app.state, { name: "Example midday", startMin: 12 * 60, endMin: 13 * 60, days: [0, 2, 4], color: "lavender", itemIds: [walk.id] }));
    const made = liveOf(app.state.dailyRoutines.blocks).find((row) => row.name === "Example midday");
    assert.equal(made.startMin, 720);
    assert.equal(made.endMin, 780);
    assert.deepEqual(made.days, [0, 2, 4]);
    assert.equal(made.color, "lavender");
    const placed = liveOf(app.state.dailyRoutines.placements).filter((row) => row.itemId === walk.id).map((row) => row.blockId).sort();
    assert.deepEqual(placed, ["block_default_morning", made.id].sort(), "an item can sit in two routines");
  });

  test("a routine needs a name and both times", () => {
    signIn();
    assert.equal(saveRoutineBlock(app.state, { name: " ", startMin: 600, endMin: 660 }), false);
    assert.equal(saveRoutineBlock(app.state, { name: "Example", startMin: 600 }), false);
  });

  test("editing a routine drops only the items left out, and keeps their logs", () => {
    signIn();
    assert.ok(addRoutineItem(app.state, "block_default_morning", { name: "Example one", kind: "check" }));
    assert.ok(addRoutineItem(app.state, "block_default_morning", { name: "Example two", kind: "check" }));
    const one = item("Example one");
    assert.ok(saveRoutineBlock(app.state, { blockId: "block_default_morning", name: "Morning routine", startMin: 300, endMin: 660, itemIds: [one.id] }));
    const inMorning = liveOf(app.state.dailyRoutines.placements).filter((row) => row.blockId === "block_default_morning").map((row) => row.itemId);
    assert.deepEqual(inMorning, [one.id]);
    assert.ok(item("Example two"), "the item itself stays");
  });

  test("hide keeps a routine's items, and Restore brings it back at the end", () => {
    signIn();
    assert.ok(addRoutineItem(app.state, "block_default_morning", { name: "Example one", kind: "check" }));
    assert.ok(hideRoutineBlock(app.state, "block_default_morning"));
    assert.equal(block("block_default_morning").hidden, true);
    assert.deepEqual(liveOrder(), ["Night routine"]);
    assert.ok(liveOf(app.state.dailyRoutines.placements).some((row) => row.blockId === "block_default_morning"));
    assert.ok(showRoutineBlock(app.state, "block_default_morning"));
    assert.deepEqual(liveOrder(), ["Night routine", "Morning routine"]);
    assert.equal(showRoutineBlock(app.state, "block_default_morning"), false, "a routine on the page is not restored twice");
  });

  test("move swaps a routine with its neighbour and stops at the ends", () => {
    signIn();
    assert.ok(moveRoutineBlock(app.state, "block_default_night", -1));
    assert.deepEqual(liveOrder(), ["Night routine", "Morning routine"]);
    assert.equal(moveRoutineBlock(app.state, "block_default_night", -1), false);
    assert.equal(moveRoutineBlock(app.state, "block_default_night", 2), false);
  });

  test("Edit routines lists routines with move buttons and a Hidden section", () => {
    signIn();
    assert.ok(hideRoutineBlock(app.state, "block_default_night"));
    const html = plan.routineBlocksSheetHTML();
    assert.match(html, /data-action="routines-block-new"/);
    assert.match(html, /Hidden/);
    assert.match(html, /data-action="routines-block-show" data-block-id="block_default_night"/);
    assert.match(html, /Morning routine/);
  });

  test("the New routine sheet offers only the three colors and every day", () => {
    signIn();
    plan.openRoutineBlockEditor("");
    const html = plan.routineBlockSheetHTML();
    assert.match(html, /id="dr-block-name"/);
    assert.match(html, /id="dr-block-start"/);
    assert.match(html, /id="dr-block-end"/);
    for (const color of ["citrus", "lavender", "pink"]) assert.match(html, new RegExp(`data-color="${color}"`), color);
    assert.equal((html.match(/data-action="routines-block-day"/g) || []).length, 7);
    assert.match(html, /Save routine/);
  });
});

describe("item types and tabs", () => {
  test("a typed item needs no routine, and shows its tab", () => {
    signIn();
    assert.ok(addRoutineItem(app.state, "", { name: "Example vitamin", kind: "check", type: "supplement", blockIds: [] }));
    const vitamin = item("Example vitamin");
    assert.equal(vitamin.type, "supplement");
    assert.ok(!liveOf(app.state.dailyRoutines.placements).some((row) => row.itemId === vitamin.id));
    assert.match(dailyRoutinesHTML(), /data-view="supplement"/);
    assert.doesNotMatch(dailyRoutinesHTML(), /data-view="medication"/, "a type with nothing in it stays hidden");
  });

  test("an untyped item still needs a routine", () => {
    signIn();
    assert.equal(addRoutineItem(app.state, "", { name: "Example check", kind: "check", blockIds: [] }), false);
  });

  test("When do you take it saves the item's own time", () => {
    signIn();
    assert.ok(addRoutineItem(app.state, "block_default_morning", { name: "Example zinc", kind: "check", type: "supplement", time: "07:30" }));
    assert.equal(item("Example zinc").timeMin, 7 * 60 + 30);
    assert.equal(addRoutineItem(app.state, "block_default_morning", { name: "Example bad", kind: "check", time: "not a time" }), false);
  });

  test("the item sheet asks for a type and a time", () => {
    signIn();
    app.openRoutineItemEditor("block_default_morning", "");
    const html = app.routineItemSheetHTML();
    assert.match(html, /When do you take it\?/);
    assert.match(html, /data-action="routines-item-type"/);
    assert.match(html, /\+ New type/);
  });

  test("the Peptides tab shows tools and one card per peptide", () => {
    signIn();
    assert.ok(addRoutineItem(app.state, "block_default_morning", { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg", type: "peptide", time: "07:45" }));
    app.ui.routineView = "peptide";
    const html = dailyRoutinesHTML();
    assert.match(html, /data-routines-view="peptide"/);
    for (const action of ["routines-calc", "routines-sites", "routines-add-typed"]) assert.match(html, new RegExp(`data-action="${action}"`), action);
    assert.equal((html.match(/class="dr-pep"/g) || []).length, 1);
    assert.match(html, /Example Compound A/);
    assert.match(html, /07:45/);
    assert.match(html, /class="dr-week"/);
  });

  test("a tab that no longer shows falls back to Routines", () => {
    signIn();
    app.ui.routineView = "medication";
    assert.match(dailyRoutinesHTML(), /data-routines-view="routines"/);
  });

  test("a custom type gets its own tab", () => {
    signIn();
    const id = app.addRoutineCustomType(app.state, "Example care");
    assert.ok(id);
    assert.equal(app.addRoutineCustomType(app.state, "example care"), id, "the same name is not added twice");
    assert.ok(addRoutineItem(app.state, "", { name: "Example serum", kind: "check", type: id, blockIds: [] }));
    assert.match(dailyRoutinesHTML(), new RegExp(`data-view="${id}"[^>]*>Example care<`));
  });
});

describe("the sun path", () => {
  test("Routines draws the sun path with windows, pins, ticks and the readout", () => {
    signIn(7, 42);
    assert.ok(addRoutineItem(app.state, "block_default_morning", { name: "Example one", kind: "check" }));
    assert.ok(addRoutineItem(app.state, "block_default_night", { name: "Example two", kind: "check" }));
    const html = dailyRoutinesHTML();
    assert.match(html, /<svg class="dr-sun"/);
    assert.match(html, /class="dr-sp-win" data-color="citrus"/);
    assert.match(html, /class="dr-sp-win" data-color="pink"/);
    assert.equal((html.match(/class="dr-sp-pin"/g) || []).length, 2);
    assert.match(html, />07:42</);
    assert.match(html, />2 LEFT TODAY</);
    assert.match(html, /class="dr-sp-sun"/);
    assert.match(html, /aria-label="Sun path from 05:00 to 23:00/);
  });

  test("a done item fills its pin", () => {
    signIn(7, 42);
    assert.ok(addRoutineItem(app.state, "block_default_morning", { name: "Example one", kind: "check" }));
    assert.ok(app.logRoutineItem(app.state, item("Example one").id, "done"));
    const html = dailyRoutinesHTML();
    assert.match(html, /class="dr-sp-pin" data-color="citrus" data-done="true"/);
    assert.match(html, />ALL DONE TODAY</);
  });

  test("only real routines are on the main view, with quiet links to add and edit", () => {
    signIn();
    const html = dailyRoutinesHTML();
    assert.match(html, /data-action="routines-block-new"/);
    assert.match(html, /data-action="routines-blocks"/);
    assert.doesNotMatch(html, /Supplement &amp; enhancer stack/);
  });
});

describe("which routines open", () => {
  test("the routine that starts within two hours opens, a later one stays shut", () => {
    signIn(13, 0);
    assert.ok(addRoutineItem(app.state, "block_default_morning", { name: "Example one", kind: "check" }));
    assert.ok(addRoutineItem(app.state, "block_default_night", { name: "Example two", kind: "check" }));
    assert.match(dailyRoutinesHTML(), /data-block-id="block_default_night"[^>]*data-collapsed="true"/, "Night starts at 5 PM, four hours away");
    pin(15, 30);
    assert.match(dailyRoutinesHTML(), /data-block-id="block_default_night"[^>]*data-collapsed="false"/, "Night starts in an hour and a half");
  });

  test("a routine opened by hand stays open", () => {
    signIn(13, 0);
    assert.ok(addRoutineItem(app.state, "block_default_night", { name: "Example two", kind: "check" }));
    assert.ok(app.toggleRoutineCollapsed(app.state, "block_default_night"));
    assert.match(dailyRoutinesHTML(), /data-block-id="block_default_night"[^>]*data-collapsed="false"/);
  });
});

describe("moving old blocks onto type tabs", () => {
  function legacyStore() {
    const store = seedDefaultBlocks(null, 10);
    store.blocks.push(
      { id: "block_default_stack", name: "Supplement & enhancer stack", color: "citrus", order: 1, updatedAt: DEFAULT_BLOCK_STAMP, deletedAt: null },
      { id: "block_setup_meds", name: "Medications", color: "pink", order: 3, updatedAt: DEFAULT_BLOCK_STAMP, deletedAt: null },
      { id: "block_setup_enhancers", name: "Enhancers & peptides", color: "citrus", order: 4, updatedAt: 50, deletedAt: null },
    );
    store.items = [
      { id: "item_a", name: "Example vitamin", kind: "check", updatedAt: 20, deletedAt: null },
      { id: "item_b", name: "Example Compound B", kind: "dose", updatedAt: 20, deletedAt: null },
    ];
    store.placements = [
      { id: "place_a", blockId: "block_default_stack", itemId: "item_a", order: 0, updatedAt: 20, deletedAt: null },
      { id: "place_b", blockId: "block_default_stack", itemId: "item_b", order: 1, updatedAt: 20, deletedAt: null },
    ];
    return store;
  }

  test("items get a type, keep their place, and the old block is hidden", () => {
    const next = types.migrateRoutineTypes(legacyStore(), 1000);
    const byId = new Map(next.items.map((row) => [row.id, row]));
    assert.equal(byId.get("item_a").type, "supplement");
    assert.equal(byId.get("item_b").type, "enhancer");
    const stack = next.blocks.find((row) => row.id === "block_default_stack");
    assert.equal(stack.hidden, true);
    assert.equal(stack.deletedAt, null, "hidden, not deleted, so Restore can bring it back");
    assert.equal(next.placements.filter((row) => !row.deletedAt).length, 2, "every placement stays");
    assert.ok(next.blocks.find((row) => row.id === "block_setup_meds").deletedAt > 0, "an untouched old default nobody used goes");
    assert.equal(next.blocks.find((row) => row.id === "block_setup_enhancers").hidden, true, "an old block the user touched is only hidden");
    assert.ok(types.routineTypesMigrated(next.prefs));
  });

  test("items keep the old block's start as their own time", () => {
    const next = types.migrateRoutineTypes(legacyStore(), 1000);
    assert.equal(next.items.find((row) => row.id === "item_a").timeMin, 12 * 60);
  });

  test("it runs once, and a store with nothing old is left alone", () => {
    const once = types.migrateRoutineTypes(legacyStore(), 1000);
    assert.equal(types.migrateRoutineTypes(once, 2000), null);
    assert.equal(types.migrateRoutineTypes(seedDefaultBlocks(null, 10), 1000), null);
  });

  test("a hidden old block says where its items went", () => {
    const next = types.migrateRoutineTypes(legacyStore(), 1000);
    const stack = next.blocks.find((row) => row.id === "block_default_stack");
    assert.equal(types.routineHiddenNote(next, stack), "Its 2 items now live on their tabs");
  });
});
