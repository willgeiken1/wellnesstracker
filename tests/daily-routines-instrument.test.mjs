import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { readFileSync } from "node:fs";

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
await import("../logger/js/pages/daily-routines-details.js");
const plan = await import("../logger/js/pages/daily-routines-plan.js");
const { liveOf, mergeDailyRoutines, projectDailyRoutines, seedDefaultBlocks, DEFAULT_BLOCK_STAMP } = await import("../logger/js/shared/daily-routines-store.js");
const types = await import("../logger/js/shared/routine-types.js");
const { nextDoseCountdown, nextItemCountdown, routineBlockDays, routineBlockRunsOn, routineBlockWindow } = await import("../logger/js/shared/routine-dose.js");

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

describe("next times follow days and logs", () => {
  const dose = { id: "item_d", kind: "dose", deletedAt: null };
  const place = { id: "p1", itemId: "item_d", blockId: "b1", deletedAt: null };

  test("a dose in a weekday routine counts down to its next weekday, not Sunday", () => {
    /* 2026-11-22 is a Sunday. The routine runs Monday, Wednesday and Friday at 8. */
    const blocks = [{ id: "b1", name: "Example", startMin: 8 * 60, endMin: 9 * 60, days: [0, 2, 4], deletedAt: null }];
    const date = new Date(2026, 10, 22, 7, 0, 0);
    const result = nextDoseCountdown({ item: dose, blocks, placements: [place], logs: [], date, day: "2026-11-22" });
    assert.equal(result.waitMin, 25 * 60, "Monday at 8 is 25 hours away");
    assert.equal(result.tomorrow, true);
  });

  test("a dose's own time keeps its routine's days, and runs daily with no routine", () => {
    const blocks = [{ id: "b1", name: "Example", startMin: 8 * 60, endMin: 9 * 60, days: [5], deletedAt: null }];
    const date = new Date(2026, 10, 22, 7, 0, 0);
    const timed = { ...dose, timeMin: 10 * 60 };
    assert.equal(nextDoseCountdown({ item: timed, blocks, placements: [place], logs: [], date, day: "2026-11-22" }).waitMin, 6 * 24 * 60 + 3 * 60, "next Saturday at 10");
    assert.equal(nextDoseCountdown({ item: timed, blocks: [], placements: [], logs: [], date, day: "2026-11-22" }).waitMin, 3 * 60, "today at 10");
  });

  test("a peptide logged early shows its next day, not later today", () => {
    signIn(8, 0);
    assert.ok(addRoutineItem(app.state, "", { name: "Example Compound C", kind: "dose", amount: 1, unit: "mg", type: "peptide", time: "10:00", blockIds: [] }));
    const id = item("Example Compound C").id;
    app.ui.routineView = "peptide";
    assert.match(dailyRoutinesHTML(), /Next <b>10:00<\/b>/, "before the dose, it is due at 10:00");
    assert.ok(app.logRoutineItem(app.state, id, "done"));
    const after = dailyRoutinesHTML();
    assert.doesNotMatch(after, /Next <b>10:00<\/b>/, "a logged dose does not ask again later today");
    assert.match(after, /Next <b>Mon<\/b>/, "it moves on to tomorrow");
  });

  test("Focus mode skips a routine that does not run today", () => {
    signIn(6, 0);
    assert.ok(saveRoutineBlock(app.state, { name: "Example weekdays", startMin: 9 * 60, endMin: 10 * 60, days: [0, 1, 2, 3, 4] }));
    const weekdays = liveOf(app.state.dailyRoutines.blocks).find((row) => row.name === "Example weekdays");
    assert.ok(addRoutineItem(app.state, weekdays.id, { name: "Example one", kind: "check" }));
    assert.ok(addRoutineItem(app.state, "block_default_night", { name: "Example two", kind: "check" }));
    assert.ok(moveRoutineBlock(app.state, weekdays.id, -1));
    assert.deepEqual(liveOrder(), ["Morning routine", "Example weekdays", "Night routine"]);
    const projected = projectDailyRoutines(app.state.dailyRoutines);
    /* Sunday: Morning is empty and the weekday routine is off, so Night is next. */
    assert.equal(routines.routineFocusBlockId(projected, new Date(2026, 10, 22, 6, 0, 0)), "block_default_night");
  });
});

describe("making and editing routines", () => {
  test("a duplicated routine keeps its window and days", () => {
    signIn();
    assert.ok(saveRoutineBlock(app.state, { name: "Example MWF", startMin: 8 * 60, endMin: 9 * 60, days: [0, 2, 4] }));
    const source = liveOf(app.state.dailyRoutines.blocks).find((row) => row.name === "Example MWF");
    assert.ok(routines.duplicateRoutineBlock(app.state, source.id));
    const copy = liveOf(app.state.dailyRoutines.blocks).find((row) => row.name === "Example MWF copy");
    assert.equal(copy.startMin, 8 * 60);
    assert.equal(copy.endMin, 9 * 60);
    assert.deepEqual(copy.days, [0, 2, 4]);
  });

  test("the routine sheet offers no library link that would drop the draft", async () => {
    const plan = await import("../logger/js/pages/daily-routines-plan.js");
    signIn();
    app.ui.sd = { name: "Example draft", itemIds: [] };
    assert.doesNotMatch(plan.routineBlockSheetHTML(), /data-action="routines-discover"/);
  });

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
  test("a timed item in no routine gets its own pin", () => {
    signIn(7, 0);
    assert.ok(routines.saveRoutineItem(app.state, { name: "Example Compound P", kind: "dose", amount: 1, unit: "mg", type: "peptide", blockIds: [], time: "04:00" }));
    const id = item("Example Compound P").id;
    const html = routines.routineSunPathHTML(projectDailyRoutines(app.state.dailyRoutines), new Date(2026, 10, 22, 7, 0, 0), "2026-11-22");
    assert.match(html, new RegExp(`class="dr-sp-pin" data-loose="true" data-item-id="${id}" data-done="false"`));
    assert.match(html, /Sun path from 04:00/, "the path stretches to reach it");
  });

  test("an item timed outside its routine's window stretches the path too", () => {
    signIn(7, 0);
    assert.ok(addRoutineItem(app.state, "block_default_morning", { name: "Example early dose", kind: "check", time: "01:00" }));
    const html = routines.routineSunPathHTML(projectDailyRoutines(app.state.dailyRoutines), new Date(2026, 10, 22, 7, 0, 0), "2026-11-22");
    assert.match(html, /Sun path from 01:00/);
  });

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

  test("an item synced into a hidden or removed old block later still gets a type", () => {
    const once = types.migrateRoutineTypes(legacyStore(), 1000);
    once.items.push(
      { id: "item_c", name: "Example mineral", kind: "check", updatedAt: 30, deletedAt: null },
      { id: "item_d", name: "Example tablet", kind: "check", updatedAt: 30, deletedAt: null },
    );
    once.placements.push(
      { id: "place_c", blockId: "block_default_stack", itemId: "item_c", order: 2, updatedAt: 30, deletedAt: null },
      { id: "place_d", blockId: "block_setup_meds", itemId: "item_d", order: 0, updatedAt: 30, deletedAt: null },
    );
    const again = types.migrateRoutineTypes(once, 2000);
    const byId = new Map(again.items.map((row) => [row.id, row]));
    assert.equal(byId.get("item_c").type, "supplement");
    assert.equal(byId.get("item_c").timeMin, 12 * 60, "it keeps the old block's start like the rest");
    assert.equal(byId.get("item_d").type, "medication");
    assert.equal(again.blocks.find((row) => row.id === "block_default_stack").hidden, true);
    assert.equal(types.migrateRoutineTypes(again, 3000), null, "nothing left to type");
  });

  test("a restored old block is left as the user set it", () => {
    const once = types.migrateRoutineTypes(legacyStore(), 1000);
    once.blocks = once.blocks.map((row) => (row.id === "block_default_stack" ? { ...row, hidden: false, updatedAt: 1500 } : row));
    once.items.push({ id: "item_c", name: "Example mineral", kind: "check", updatedAt: 1600, deletedAt: null });
    once.placements.push({ id: "place_c", blockId: "block_default_stack", itemId: "item_c", order: 2, updatedAt: 1600, deletedAt: null });
    assert.equal(types.migrateRoutineTypes(once, 2000), null);
  });

  test("a newer delete or edit from a phone that has not moved yet still wins", () => {
    const other = legacyStore();
    other.items = other.items.map((row) => (row.id === "item_a" ? { ...row, updatedAt: 40, deletedAt: 40 } : { ...row, name: "Example Compound B2", updatedAt: 40 }));
    other.placements = other.placements.map((row) => (row.itemId === "item_a" ? { ...row, updatedAt: 40, deletedAt: 40, removedWith: "item_a" } : row));
    const moved = types.migrateRoutineTypes(legacyStore(), 5000);
    for (const merged of [mergeDailyRoutines(moved, other, 6000), mergeDailyRoutines(other, moved, 6000)]) {
      const itemA = merged.items.find((row) => row.id === "item_a");
      assert.ok(itemA.deletedAt > 0, "the delete stays");
      assert.ok(merged.placements.find((row) => row.id === "place_a").deletedAt > 0, "its placement stays gone");
      assert.equal(merged.items.find((row) => row.id === "item_b").name, "Example Compound B2", "the rename stays");
      assert.ok(types.routineTypesMigrated(merged.prefs), "the move's marker survives the merge");
      const settled = types.migrateRoutineTypes(merged, 7000);
      assert.equal(settled.items.find((row) => row.id === "item_b").type, "enhancer", "the renamed copy gets its type again");
    }
  });

  test("a newer prefs save without the marker keeps it", () => {
    const moved = types.migrateRoutineTypes(legacyStore(), 1000);
    const other = legacyStore();
    other.prefs = { ...other.prefs, lastBlockId: "block_default_stack", updatedAt: 9000 };
    const merged = mergeDailyRoutines(other, moved, 9500);
    assert.equal(merged.prefs.lastBlockId, "block_default_stack");
    assert.ok(types.routineTypesMigrated(merged.prefs));
  });
});

describe("peptide details, hidden routines and the dose count", () => {
  test("a logged peptide card opens its dose details", () => {
    signIn(8, 0);
    assert.ok(addRoutineItem(app.state, "", { name: "Example Compound D", kind: "dose", amount: 1, unit: "mg", type: "peptide", blockIds: [] }));
    const id = item("Example Compound D").id;
    app.ui.routineView = "peptide";
    assert.doesNotMatch(dailyRoutinesHTML(), /data-action="routines-details-open"/, "nothing to open before a dose");
    assert.ok(app.logRoutineItem(app.state, id, "done"));
    const html = dailyRoutinesHTML();
    const log = liveOf(app.state.dailyRoutines.logs).find((row) => row.itemId === id);
    assert.match(html, new RegExp(`data-action="routines-details-open" data-item-id="${id}" data-log-id="${log.id}"`));
    assert.match(html, new RegExp(`class="dr-pep" data-item-id="${id}" data-details="card" data-log-id="${log.id}"`), "a long press on the card opens it too");
    assert.ok(app.openRoutineDetails(id, log.id));
    assert.equal(app.ui.sheet, "routines-details");
  });

  test("saving an item keeps its place in a hidden routine", () => {
    signIn();
    assert.ok(saveRoutineBlock(app.state, { name: "Example later", startMin: 13 * 60, endMin: 14 * 60 }));
    const later = liveOf(app.state.dailyRoutines.blocks).find((row) => row.name === "Example later");
    assert.ok(addRoutineItem(app.state, later.id, { name: "Example both", kind: "check", type: "supplement", blockIds: [later.id, "block_default_morning"] }));
    assert.ok(addRoutineItem(app.state, later.id, { name: "Example only", kind: "check", blockIds: [later.id] }));
    assert.ok(hideRoutineBlock(app.state, later.id));
    const both = item("Example both");
    const only = item("Example only");
    assert.ok(routines.saveRoutineItem(app.state, { itemId: both.id, name: "Example both", kind: "check", type: "supplement", blockIds: ["block_default_morning"] }));
    assert.ok(routines.saveRoutineItem(app.state, { itemId: only.id, name: "Example only renamed", kind: "check", blockIds: [] }), "its hidden routine still holds it");
    const places = (id) => liveOf(app.state.dailyRoutines.placements).filter((row) => row.itemId === id).map((row) => row.blockId).sort();
    assert.deepEqual(places(both.id), [later.id, "block_default_morning"].sort());
    assert.deepEqual(places(only.id), [later.id]);
    assert.ok(showRoutineBlock(app.state, later.id));
    const shown = projectDailyRoutines(app.state.dailyRoutines);
    assert.ok(shown.placements.some((row) => row.blockId === later.id && row.itemId === both.id));
  });

  test("a typed item in no shown routine counts toward the day", () => {
    signIn(8, 0);
    assert.ok(addRoutineItem(app.state, "block_default_morning", { name: "Example morning check", kind: "check" }));
    assert.ok(routines.saveRoutineItem(app.state, { name: "Example Compound L", kind: "dose", amount: 1, unit: "mg", type: "peptide", blockIds: [] }));
    assert.ok(app.logRoutineItem(app.state, item("Example morning check").id, "done"));
    const view = projectDailyRoutines(app.state.dailyRoutines);
    assert.equal(app.routineDayComplete(view, "2026-11-22"), false, "the peptide is still due");
    assert.deepEqual(app.routineDoseProgress(view, "2026-11-22"), { logged: 0, due: 1 });
    assert.equal(app.routineNextItem(view, new Date(2026, 10, 22, 8, 0, 0), "2026-11-22").item.id, item("Example Compound L").id);
    assert.ok(app.logRoutineItem(app.state, item("Example Compound L").id, "done"));
    assert.equal(app.routineDayComplete(projectDailyRoutines(app.state.dailyRoutines), "2026-11-22"), true);
  });

  test("clearing the type of an item only a hidden routine holds is refused", () => {
    signIn();
    assert.ok(saveRoutineBlock(app.state, { name: "Example later", startMin: 13 * 60, endMin: 14 * 60 }));
    const later = liveOf(app.state.dailyRoutines.blocks).find((row) => row.name === "Example later");
    assert.ok(addRoutineItem(app.state, later.id, { name: "Example typed", kind: "check", type: "supplement", blockIds: [later.id] }));
    assert.ok(hideRoutineBlock(app.state, later.id));
    const typed = item("Example typed");
    assert.equal(routines.saveRoutineItem(app.state, { itemId: typed.id, name: "Example typed", kind: "check", type: "", blockIds: [] }), false);
    assert.equal(item("Example typed").type, "supplement", "it stays on its tab");
    assert.ok(routines.saveRoutineItem(app.state, { itemId: typed.id, name: "Example typed", kind: "check", type: "", blockIds: ["block_default_morning"] }), "a visible routine lets the type go");
  });

  test("a dose logged after the count is typed comes off it", () => {
    signIn(8, 0);
    assert.ok(addRoutineItem(app.state, "", { name: "Example Compound E", kind: "dose", amount: 1, unit: "mg", type: "peptide", blockIds: [], onHand: "10" }));
    const made = item("Example Compound E");
    assert.equal(made.onHandDay, "2026-11-22");
    assert.equal(typeof made.onHandAt, "number");
    pin(8, 5);
    assert.ok(app.logRoutineItem(app.state, made.id, "done"));
    const after = projectDailyRoutines(app.state.dailyRoutines);
    assert.deepEqual(types.routineDosesLeft(after.items.find((row) => row.id === made.id), after.logs), { left: 9, total: 10 });
  });

  test("a dose logged before the count is typed is already in it", () => {
    const logs = [{ id: "l1", itemId: "i1", day: "2026-11-22", status: "done", at: 100, deletedAt: null }];
    assert.equal(types.routineDosesLeft({ id: "i1", onHand: 10, onHandDay: "2026-11-22", onHandAt: 200 }, logs).left, 10);
    assert.equal(types.routineDosesLeft({ id: "i1", onHand: 10, onHandDay: "2026-11-22", onHandAt: 50 }, logs).left, 9);
    assert.equal(types.routineDosesLeft({ id: "i1", onHand: 10, onHandDay: "2026-11-22" }, logs).left, 10, "an older count with no time keeps the day's doses in it");
    assert.equal(types.routineDosesLeft({ id: "i1", onHand: 10, onHandDay: "2026-11-21" }, logs).left, 9);
    assert.deepEqual(types.routineDosesLeft({ id: "i1", onHand: 0, onHandDay: "2026-11-21" }, logs), { left: 0, total: 0 }, "a typed 0 means out, not unset");
    assert.equal(types.routineDosesLeft({ id: "i1" }, logs), null);
  });
});

describe("Focus order and history follow the routine's days and times", () => {
  test("Focus mode moves on by time of day, not by place on the page", () => {
    signIn(14, 0);
    assert.ok(saveRoutineBlock(app.state, { name: "Example midday", startMin: 12 * 60, endMin: 15 * 60 }));
    assert.deepEqual(liveOrder(), ["Morning routine", "Night routine", "Example midday"], "a new routine goes after Night on the page");
    assert.ok(addRoutineItem(app.state, "block_default_night", { name: "Example later", kind: "check" }));
    const projected = projectDailyRoutines(app.state.dailyRoutines);
    assert.equal(routines.routineFocusBlockId(projected, new Date(2026, 10, 22, 14, 0, 0)), "block_default_night", "the empty midday routine leads on to Night");
  });

  test("History marks an item missed only on its routine's days", async () => {
    const { routineHistoryView } = await import("../logger/js/shared/routine-history.js");
    /* Mon, Wed and Fri only. 2026-11-21 is a Saturday and 2026-11-20 a Friday. */
    const view = {
      blocks: [{ id: "b1", name: "Example", startMin: 8 * 60, endMin: 9 * 60, days: [0, 2, 4], order: 0, deletedAt: null }],
      items: [{ id: "i1", name: "Example check", kind: "check", startDate: "2026-11-16", deletedAt: null }],
      placements: [{ id: "p1", itemId: "i1", blockId: "b1", order: 0, deletedAt: null }],
      compounds: [],
      logs: [{ id: "l1", itemId: "i1", day: "2026-11-21", status: "done", at: 1, deletedAt: null }],
    };
    const history = routineHistoryView(view, { month: "2026-11", day: "2026-11-22", today: "2026-11-22", tab: "logged" });
    const marks = (day) => (history.days.find((row) => row.day === day) || { items: [] }).items.map((row) => row.mark);
    assert.deepEqual(marks("2026-11-20"), ["missed"], "Friday is a routine day");
    assert.deepEqual(marks("2026-11-19"), [], "Thursday is not");
    assert.deepEqual(marks("2026-11-21"), ["logged"], "a log on an off day still shows");
    assert.deepEqual(marks("2026-11-22"), [], "nothing is open on Sunday");
  });

  test("History marks a typed item in no routine missed on each day since its start", async () => {
    const { routineHistoryView } = await import("../logger/js/shared/routine-history.js");
    const view = {
      blocks: [],
      items: [
        { id: "i1", name: "Example peptide", kind: "dose", type: "peptide", startDate: "2026-11-20", deletedAt: null },
        { id: "i2", name: "Example untyped", kind: "check", startDate: "2026-11-20", deletedAt: null },
      ],
      placements: [],
      compounds: [],
      logs: [{ id: "l1", itemId: "i1", day: "2026-11-20", status: "done", at: 1, deletedAt: null }],
      prefs: {},
    };
    const history = routineHistoryView(view, { month: "2026-11", day: "2026-11-22", today: "2026-11-22", tab: "logged" });
    const marks = (day) => (history.days.find((row) => row.day === day) || { items: [] }).items.map((row) => `${row.itemId}:${row.mark}`);
    assert.deepEqual(marks("2026-11-19"), [], "nothing before its start");
    assert.deepEqual(marks("2026-11-20"), ["i1:logged"]);
    assert.deepEqual(marks("2026-11-21"), ["i1:missed"], "a gap shows as missed");
    assert.deepEqual(marks("2026-11-22"), ["i1:open"]);
  });
});

describe("type rows, early mornings and items taken out of routines", () => {
  test("a row on a type tab opens the item editor, open or done", () => {
    signIn();
    assert.ok(addRoutineItem(app.state, "", { name: "Example magnesium", kind: "check", type: "supplement", blockIds: [] }));
    const id = item("Example magnesium").id;
    app.ui.routineView = "supplement";
    const edit = new RegExp(`class="dr-edit-item" data-action="routines-edit-item" data-item-id="${id}"`);
    assert.match(dailyRoutinesHTML(), edit, "open row");
    assert.ok(app.logRoutineItem(app.state, id, "done"));
    assert.match(dailyRoutinesHTML(), edit, "done row");
  });

  test("Focus mode looks at Morning after the day rolls over but before it starts", () => {
    signIn(4, 30);
    assert.ok(addRoutineItem(app.state, "block_default_morning", { name: "Example early", kind: "check" }));
    const projected = projectDailyRoutines(app.state.dailyRoutines);
    assert.equal(routines.routineFocusBlockId(projected, new Date(2026, 10, 22, 4, 30, 0)), "block_default_morning");
  });

  test("an untyped item taken out of its last routine moves to the Other tab", () => {
    signIn();
    assert.ok(addRoutineItem(app.state, "block_default_morning", { name: "Example stretch", kind: "check" }));
    assert.ok(addRoutineItem(app.state, "block_default_morning", { name: "Example twice", kind: "check", blockIds: ["block_default_morning", "block_default_night"] }));
    const morning = block("block_default_morning");
    const window = routineBlockWindow(morning);
    assert.ok(saveRoutineBlock(app.state, { blockId: morning.id, name: morning.name, startMin: window.startMin, endMin: window.endMin, itemIds: [] }));
    assert.equal(item("Example stretch").type, "other");
    assert.equal(item("Example twice").type, undefined, "it still has Night");
    assert.match(dailyRoutinesHTML(), /data-view="other"/);
  });
});

describe("rearranging from Edit routines", () => {
  test("Rearrange items closes the sheet and turns rearranging on", () => {
    signIn();
    app.ui.routineView = "supplement";
    assert.ok(app.openRoutineBlocks());
    assert.match(app.routineBlocksSheetHTML(), /data-action="routines-rearrange"/);
    assert.ok(app.startRoutineRearrange());
    assert.equal(app.ui.sheet, null);
    assert.equal(app.ui.dailyRoutineEdit, true);
    assert.equal(app.ui.routineView, "routines");
    assert.ok(app.startRoutineRearrange(), "a second tap keeps it on");
    assert.equal(app.ui.dailyRoutineEdit, true);
  });
});

describe("rollover hour and synced custom types", () => {
  test("a peptide's next day follows the user's rollover hour", () => {
    /* Rollover at midnight. A daily dose at 01:00, taken Monday, is next on Tuesday. */
    const item = { id: "item_r", name: "Example Compound R", kind: "dose", timeMin: 60, deletedAt: null };
    const projected = {
      blocks: [], placements: [], compounds: [], items: [item],
      logs: [{ id: "log_r", itemId: "item_r", day: "2026-11-23", status: "done", at: 1, deletedAt: null }],
      settings: { dayRolloverHour: 0 },
    };
    assert.equal(routines.routineNextText(projected, item, new Date(2026, 10, 23, 12, 0, 0), "2026-11-23"), "Tue");
  });

  test("a dose on a day its routine doesn't run is not shown as due now", () => {
    /* 2026-11-23 is a Monday (0). The routine runs Mondays only. */
    const item = { id: "item_m", name: "Example Compound M", kind: "dose", deletedAt: null };
    const projected = {
      blocks: [{ id: "block_m", name: "Example Monday", startMin: 480, endMin: 600, days: [0], deletedAt: null }],
      placements: [{ id: "place_m", itemId: "item_m", blockId: "block_m", deletedAt: null }],
      compounds: [], items: [item], logs: [], settings: {},
    };
    assert.equal(routines.routineNextText(projected, item, new Date(2026, 10, 24, 12, 0, 0), "2026-11-24"), "Mon", "Tuesday is an off day");
    assert.equal(routines.routineNextText(projected, item, new Date(2026, 10, 23, 12, 0, 0), "2026-11-23"), "Now", "Monday's 08:00 was missed");
  });

  test("an item's own time runs on the days of an untimed routine it is in too", () => {
    /* 2026-11-22 is a Sunday (6). One routine has no time and runs daily, the other is Mon/Wed/Fri. */
    const item = { id: "item_u", name: "Example Compound U", kind: "dose", timeMin: 600, deletedAt: null };
    const blocks = [
      { id: "block_daily", name: "Example renamed", days: [0, 1, 2, 3, 4, 5, 6], deletedAt: null },
      { id: "block_mwf", name: "Example MWF", startMin: 480, endMin: 600, days: [0, 2, 4], deletedAt: null },
    ];
    const placements = [
      { id: "place_u1", itemId: "item_u", blockId: "block_daily", deletedAt: null },
      { id: "place_u2", itemId: "item_u", blockId: "block_mwf", deletedAt: null },
    ];
    const result = nextItemCountdown({ item, blocks, placements, logs: [], date: new Date(2026, 10, 22, 8, 0, 0), day: "2026-11-22" });
    assert.equal(result.waitMin, 120, "due today at 10:00, not Monday");
  });

  test("a check timed after midnight counts in the same routine day", () => {
    /* Default rollover at 04:00, so 01:00 tonight is still Monday's routine day. */
    const item = { id: "item_c", name: "Example late check", kind: "check", timeMin: 60, deletedAt: null };
    const projected = { blocks: [], placements: [], compounds: [], items: [item], logs: [], settings: {} };
    assert.equal(routines.routineNextText(projected, item, new Date(2026, 10, 23, 20, 0, 0), "2026-11-23"), "01:00");
    assert.equal(routines.routineNextText(projected, item, new Date(2026, 10, 24, 2, 0, 0), "2026-11-23"), "Now", "past 01:00, before rollover");
  });

  test("custom types past the limit after a sync all keep their tabs", () => {
    const prefs = { customTypes: Array.from({ length: types.CUSTOM_TYPE_MAX + 1 }, (_, index) => ({ id: `type_example${index}`, name: `Example ${index}` })) };
    const list = types.routineCustomTypes(prefs);
    assert.equal(list.length, types.CUSTOM_TYPE_MAX + 1);
    assert.equal(types.routineItemType({ type: `type_example${types.CUSTOM_TYPE_MAX}` }, prefs), `type_example${types.CUSTOM_TYPE_MAX}`);
  });

  test("making a type still stops at the limit", () => {
    signIn();
    for (let index = 0; index < types.CUSTOM_TYPE_MAX; index += 1) assert.ok(app.addRoutineCustomType(app.state, `Example kind ${index}`));
    assert.equal(app.addRoutineCustomType(app.state, "Example one too many"), "");
  });
});

describe("Focus mode around the rollover and overlapping windows", () => {
  test("before the rollover, last night's routine stays in focus", () => {
    signIn(1, 0);
    assert.ok(addRoutineItem(app.state, "block_default_morning", { name: "Example morning left", kind: "check" }));
    assert.ok(addRoutineItem(app.state, "block_default_night", { name: "Example night left", kind: "check" }));
    const projected = projectDailyRoutines(app.state.dailyRoutines);
    assert.equal(routines.routineFocusBlockId(projected, new Date(2026, 10, 22, 1, 0, 0)), "block_default_night");
  });

  test("an overlapping routine that started later is the one for now", () => {
    signIn(10, 30);
    assert.ok(saveRoutineBlock(app.state, { name: "Example ten", startMin: 10 * 60, endMin: 11 * 60 }));
    const ten = liveOf(app.state.dailyRoutines.blocks).find((row) => row.name === "Example ten");
    assert.ok(addRoutineItem(app.state, "block_default_morning", { name: "Example morning open", kind: "check" }));
    assert.ok(addRoutineItem(app.state, ten.id, { name: "Example ten open", kind: "check" }));
    const projected = projectDailyRoutines(app.state.dailyRoutines);
    const at = new Date(2026, 10, 22, 10, 30, 0);
    assert.equal(routines.routineNowNext(projected.blocks, at, "2026-11-22").nowBlock.id, ten.id);
    assert.equal(routines.routineFocusBlockId(projected, at), ten.id);
  });
});

describe("Home tile jumps open a later routine", () => {
  test("opening a Night item from Home in the morning paints its row", async () => {
    const tiles = await import("../logger/js/shared/routine-home-tiles.js");
    signIn(8, 0);
    assert.ok(addRoutineItem(app.state, "block_default_night", { name: "Example night check", kind: "check" }));
    const id = item("Example night check").id;
    app.goTab = () => {};
    assert.match(dailyRoutinesHTML(), /data-block-id="block_default_night"[^>]*data-collapsed="true"/, "Night starts closed in the morning");
    assert.equal(tiles.openRoutineTile(tiles.routineItemTileId(id)), true);
    const html = dailyRoutinesHTML();
    assert.match(html, /data-block-id="block_default_night"[^>]*data-collapsed="false"/);
    assert.match(html, new RegExp(`class="dr-row[^"]*"[^>]*data-item-id="${id}"`));
  });

  test("a Home jump leaves a type tab for Routines, or opens the tab of an item in no routine", async () => {
    const tiles = await import("../logger/js/shared/routine-home-tiles.js");
    signIn(8, 0);
    assert.ok(addRoutineItem(app.state, "block_default_night", { name: "Example night check", kind: "check" }));
    assert.ok(routines.saveRoutineItem(app.state, { name: "Example loose peptide", kind: "check", type: "peptide", blockIds: [] }));
    const night = item("Example night check").id;
    const loose = item("Example loose peptide").id;
    app.goTab = () => {};
    app.ui.routineView = "peptide";
    tiles.openRoutineTile(tiles.routineItemTileId(night));
    assert.equal(app.ui.routineView, "routines");
    assert.match(dailyRoutinesHTML(), new RegExp(`data-item-id="${night}"`));
    tiles.openRoutineTile(tiles.routineItemTileId(loose));
    assert.equal(app.ui.routineView, "peptide");
    assert.match(dailyRoutinesHTML(), new RegExp(`data-item-id="${loose}"`));
  });

  test("Focus mode still shows the routine a Home tile opened", async () => {
    const tiles = await import("../logger/js/shared/routine-home-tiles.js");
    signIn(8, 0);
    assert.ok(addRoutineItem(app.state, "block_default_morning", { name: "Example morning check", kind: "check" }));
    assert.ok(addRoutineItem(app.state, "block_default_night", { name: "Example night check", kind: "check" }));
    app.state.dailyRoutines.prefs = { ...app.state.dailyRoutines.prefs, focusMode: true };
    const night = item("Example night check").id;
    app.goTab = () => {};
    assert.doesNotMatch(dailyRoutinesHTML(), new RegExp(`data-item-id="${night}"`), "Focus shows only Morning");
    tiles.openRoutineTile(tiles.routineItemTileId(night));
    const html = dailyRoutinesHTML();
    assert.match(html, new RegExp(`data-item-id="${night}"`));
    assert.match(html, /data-block-id="block_default_morning"/, "the focus routine stays");
  });

  test("leaving Routines ends the visit, so Focus and closed routines come back", async () => {
    const tiles = await import("../logger/js/shared/routine-home-tiles.js");
    signIn(8, 0);
    assert.ok(addRoutineItem(app.state, "block_default_morning", { name: "Example morning check", kind: "check" }));
    assert.ok(addRoutineItem(app.state, "block_default_night", { name: "Example night check", kind: "check" }));
    app.state.dailyRoutines.prefs = { ...app.state.dailyRoutines.prefs, focusMode: true };
    const night = item("Example night check").id;
    app.goTab = () => {};
    tiles.openRoutineTile(tiles.routineItemTileId(night));
    assert.match(dailyRoutinesHTML(), new RegExp(`data-item-id="${night}"`));
    app.endRoutineVisit();
    assert.doesNotMatch(dailyRoutinesHTML(), new RegExp(`data-item-id="${night}"`), "Focus shows only Morning again");
    app.state.dailyRoutines.prefs = { ...app.state.dailyRoutines.prefs, focusMode: false };
    assert.match(dailyRoutinesHTML(), /data-block-id="block_default_night"[^>]*data-collapsed="true"/, "Night is closed again");
    const pager = readFileSync(new URL("../logger/js/shell/pager.js", import.meta.url), "utf8");
    assert.match(pager, /app\.ui\.tab === "daily-routines" && to !== "daily-routines" && typeof app\.endRoutineVisit === "function"\) app\.endRoutineVisit\(\)/, "switching tabs away from Routines ends the visit");
  });
});

describe("Home tiles follow routine days", () => {
  test("Next up and a routine card leave out a routine that does not run today", async () => {
    const tiles = await import("../logger/js/shared/routine-home-tiles.js");
    signIn();
    /* Mon, Wed and Fri only. 2026-11-22 is a Sunday. */
    assert.ok(saveRoutineBlock(app.state, { name: "Example weekdays", startMin: 8 * 60, endMin: 9 * 60, days: [0, 2, 4] }));
    const weekdays = liveOf(app.state.dailyRoutines.blocks).find((row) => row.name === "Example weekdays");
    assert.ok(addRoutineItem(app.state, weekdays.id, { name: "Example weekday dose", kind: "check" }));
    const id = item("Example weekday dose").id;
    const sunday = tiles.renderRoutineTileHTML(tiles.NEXT_UP_TILE_ID, { state: app.state, size: "medium", day: "2026-11-22" });
    assert.doesNotMatch(sunday, new RegExp(`data-item-id="${id}"`));
    const card = tiles.renderRoutineTileHTML(tiles.routineBlockTileId(weekdays.id), { state: app.state, size: "medium", day: "2026-11-22" });
    assert.doesNotMatch(card, new RegExp(`data-item-id="${id}"`));
    const one = tiles.renderRoutineTileHTML(tiles.routineItemTileId(id), { state: app.state, size: "medium", day: "2026-11-22" });
    assert.doesNotMatch(one, /data-action="routines-log"/);
    const monday = tiles.renderRoutineTileHTML(tiles.NEXT_UP_TILE_ID, { state: app.state, size: "medium", day: "2026-11-23" });
    assert.match(monday, new RegExp(`data-item-id="${id}"`));
  });

  test("Next up and the tile picker include a typed item in no routine", async () => {
    const tiles = await import("../logger/js/shared/routine-home-tiles.js");
    signIn();
    assert.ok(routines.saveRoutineItem(app.state, { name: "Example Compound H", kind: "dose", amount: 1, unit: "mg", type: "peptide", blockIds: [] }));
    const id = item("Example Compound H").id;
    const next = tiles.renderRoutineTileHTML(tiles.NEXT_UP_TILE_ID, { state: app.state, size: "medium", day: "2026-11-22" });
    assert.match(next, new RegExp(`data-item-id="${id}"`), "the peptide is next, not All done");
    assert.ok(tiles.routineTrayEntries(app.state, [], "").some((row) => row.id === tiles.routineItemTileId(id)));
  });
});
