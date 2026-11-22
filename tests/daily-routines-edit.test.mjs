import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/* Synthetic routines only. Editing changes blocks, items, and placements.
   A log row is compared before and after every layout write. */

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
  addRoutineBlock,
  addRoutineItem,
  dailyRoutinesHTML,
  deleteRoutineBlock,
  deleteRoutineItem,
  duplicateRoutineBlock,
  logRoutineItem,
  restoreRoutineLog,
  undoRoutineLog,
  parseRoutineAmount,
  renameRoutineBlock,
  renameRoutineItem,
  reorderRoutineBlocks,
  reorderRoutinePlacements,
  restoreRoutineBlock,
  restoreRoutineItem,
  routineItemDraft,
  saveRoutineItem,
  setRoutineBlockColor,
  toggleRoutineCollapsed,
} = await import("../logger/js/pages/daily-routines.js");
const { routineItemSheetHTML } = await import("../logger/js/pages/daily-routines-edit.js");
const { dedupePlacementPairs, emptyDailyRoutines, isLive, mergeDailyRoutines, normalizeDailyRoutines, projectDailyRoutines, routinePlacementId, seedDefaultBlocks } = await import("../logger/js/shared/daily-routines-store.js");

function pin(day = "2026-11-19") {
  app.today = () => day;
  app.routineNow = () => new Date(2026, 10, 19, 8, 30);
}

function signIn() {
  app.ROUTINES_ENABLED = true;
  app.session = { user: { id: "synthetic-user" } };
  app.sb = null;
  app.cloudPullOk = true;
  app.state = { dailyRoutines: null };
  app.ui = { tab: "daily-routines", sheet: null, sd: {}, dailyRoutineEdit: false };
  app.save = () => {};
  pin();
  dailyRoutinesHTML();
}

function blockId(name) {
  const block = app.state.dailyRoutines.blocks.find((row) => row.name === name && isLive(row));
  assert.ok(block, name);
  return block.id;
}

function logsSnapshot() {
  return structuredClone(app.state.dailyRoutines.logs);
}

function livePlacements(block) {
  return app.state.dailyRoutines.placements
    .filter((row) => isLive(row) && row.blockId === block)
    .slice()
    .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

describe("routine editing", { concurrency: false }, () => {
  test("quarter amounts parse to numbers and bad amounts are refused", () => {
    assert.equal(parseRoutineAmount("0.25"), 0.25);
    assert.equal(parseRoutineAmount("1/4"), 0.25);
    assert.equal(parseRoutineAmount("¼"), 0.25);
    assert.equal(parseRoutineAmount(1.5), 1.5);
    assert.equal(parseRoutineAmount("0"), 0);
    assert.equal(parseRoutineAmount(""), null);
    assert.equal(parseRoutineAmount("-1"), null);
    assert.equal(parseRoutineAmount("1 dose"), null);
  });

  test("reorder and rename survive a reload and do not touch logs", () => {
    signIn();
    const morning = blockId("Morning routine");
    const stack = blockId("Supplement & enhancer stack");
    const night = blockId("Night routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" }), true);
    const item = app.state.dailyRoutines.items[0];
    assert.equal(logRoutineItem(app.state, item.id), true);
    const before = logsSnapshot();
    const order = [night, morning, stack];
    assert.equal(reorderRoutineBlocks(app.state, order, night), true);
    assert.equal(renameRoutineBlock(app.state, morning, "Early routine"), true);
    assert.deepEqual(logsSnapshot(), before);
    const reloaded = normalizeDailyRoutines(JSON.parse(JSON.stringify(app.state.dailyRoutines)));
    const byOrder = reloaded.blocks.filter(isLive).slice().sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : 1));
    assert.deepEqual(byOrder.map((row) => row.id), order);
    assert.equal(reloaded.blocks.find((row) => row.id === morning).name, "Early routine");
    app.state.dailyRoutines = reloaded;
    const html = dailyRoutinesHTML();
    assert.match(html, /Early routine/);
    assert.doesNotMatch(html, /Morning routine/);
    assert.equal(reloaded.logs.length, before.length);
    assert.equal(reloaded.logs[0].amount, 250);
  });

  test("item order changes only the placement order", () => {
    signIn();
    const morning = blockId("Morning routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "check" }), true);
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound B", kind: "check" }), true);
    const item = app.state.dailyRoutines.items[0].id;
    assert.equal(logRoutineItem(app.state, item), true);
    const before = logsSnapshot();
    const places = livePlacements(morning).map((row) => row.id);
    assert.equal(reorderRoutinePlacements(app.state, morning, places.slice().reverse()), true);
    assert.deepEqual(livePlacements(morning).map((row) => row.id), places.slice().reverse());
    assert.deepEqual(logsSnapshot(), before);
    assert.equal(reorderRoutinePlacements(app.state, morning, places.slice(0, 1)), false);
  });

  test("a reorder does not bring back the other phone's deleted item", () => {
    signIn();
    const morning = blockId("Morning routine");
    const stack = blockId("Supplement & enhancer stack");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "check" }), true);
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound B", kind: "check" }), true);
    const item = app.state.dailyRoutines.items.find((row) => row.name === "Example Compound A");
    const shared = structuredClone(app.state.dailyRoutines);
    app.routineNow = () => new Date(2026, 10, 19, 9, 0);
    assert.equal(deleteRoutineItem(app.state, item.id), true);
    const deleted = structuredClone(app.state.dailyRoutines);
    app.state.dailyRoutines = structuredClone(shared);
    app.routineNow = () => new Date(2026, 10, 19, 10, 0);
    const places = livePlacements(morning).map((row) => row.id);
    assert.equal(reorderRoutinePlacements(app.state, morning, places.slice().reverse()), true);
    assert.equal(reorderRoutineBlocks(app.state, [stack, morning, blockId("Night routine")], stack), true);
    const reordered = structuredClone(app.state.dailyRoutines);
    for (const merged of [mergeDailyRoutines(deleted, reordered), mergeDailyRoutines(reordered, deleted)]) {
      assert.equal(isLive(merged.items.find((row) => row.id === item.id)), false);
      assert.equal(merged.placements.filter((row) => isLive(row) && row.itemId === item.id).length, 0);
      const view = projectDailyRoutines(merged);
      assert.equal(view.items.some((row) => row.id === item.id), false);
      assert.equal(view.placements.some((row) => row.itemId === item.id), false);
    }
  });

  test("a deleted block restores with its placements and keeps the log", () => {
    signIn();
    const morning = blockId("Morning routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" }), true);
    const item = app.state.dailyRoutines.items[0];
    assert.equal(logRoutineItem(app.state, item.id), true);
    const before = logsSnapshot();
    const place = livePlacements(morning)[0];
    const older = structuredClone(app.state.dailyRoutines);
    assert.equal(deleteRoutineBlock(app.state, morning), true);
    assert.equal(isLive(app.state.dailyRoutines.blocks.find((row) => row.id === morning)), false);
    const hidden = app.state.dailyRoutines.placements.find((row) => row.id === place.id);
    assert.equal(isLive(hidden), false);
    assert.equal(hidden.removedWith, morning);
    assert.equal(isLive(app.state.dailyRoutines.items.find((row) => row.id === item.id)), true);
    assert.deepEqual(logsSnapshot(), before);
    assert.doesNotMatch(dailyRoutinesHTML(), new RegExp(`data-block-id="${morning}"`));
    const tombstoned = mergeDailyRoutines(app.state.dailyRoutines, older);
    assert.equal(isLive(tombstoned.blocks.find((row) => row.id === morning)), false);
    assert.equal(restoreRoutineBlock(app.state, morning), true);
    const back = app.state.dailyRoutines.placements.find((row) => row.id === place.id);
    assert.equal(isLive(back), true);
    assert.equal(back.itemId, item.id);
    assert.equal(isLive(app.state.dailyRoutines.blocks.find((row) => row.id === morning)), true);
    assert.equal(isLive(mergeDailyRoutines(app.state.dailyRoutines, older).blocks.find((row) => row.id === morning)), true);
    assert.match(dailyRoutinesHTML(), new RegExp(`data-block-id="${morning}"`));
    assert.deepEqual(logsSnapshot(), before);
  });

  test("a deleted item can be restored and its log stays", () => {
    signIn();
    const morning = blockId("Morning routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "check" }), true);
    const item = app.state.dailyRoutines.items[0];
    assert.equal(logRoutineItem(app.state, item.id), true);
    const before = logsSnapshot();
    const place = livePlacements(morning)[0];
    assert.equal(deleteRoutineItem(app.state, item.id), true);
    assert.equal(isLive(app.state.dailyRoutines.items.find((row) => row.id === item.id)), false);
    assert.equal(isLive(app.state.dailyRoutines.placements.find((row) => row.id === place.id)), false);
    assert.deepEqual(logsSnapshot(), before);
    assert.equal(restoreRoutineItem(app.state, item.id), true);
    assert.equal(isLive(app.state.dailyRoutines.items.find((row) => row.id === item.id)), true);
    assert.equal(isLive(app.state.dailyRoutines.placements.find((row) => row.id === place.id)), true);
    assert.deepEqual(logsSnapshot(), before);
  });

  test("duplicating a block copies placements and not items or logs", () => {
    signIn();
    const morning = blockId("Morning routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" }), true);
    const item = app.state.dailyRoutines.items[0];
    assert.equal(logRoutineItem(app.state, item.id), true);
    const beforeLogs = logsSnapshot();
    const beforeItems = app.state.dailyRoutines.items.length;
    assert.equal(duplicateRoutineBlock(app.state, morning), true);
    const copy = app.state.dailyRoutines.blocks.find((row) => row.name === "Morning routine copy" && isLive(row));
    assert.ok(copy);
    assert.notEqual(copy.id, morning);
    const copied = livePlacements(copy.id);
    assert.equal(copied.length, 1);
    assert.equal(copied[0].itemId, item.id);
    assert.notEqual(copied[0].id, livePlacements(morning)[0].id);
    assert.equal(app.state.dailyRoutines.items.filter(isLive).length, beforeItems);
    assert.deepEqual(logsSnapshot(), beforeLogs);
    assert.equal(logRoutineItem(app.state, item.id), false);
    assert.equal(app.state.dailyRoutines.logs.filter(isLive).length, 1);
  });

  test("one item can sit in two blocks and still has one log", () => {
    signIn();
    const morning = blockId("Morning routine");
    const night = blockId("Night routine");
    assert.equal(saveRoutineItem(app.state, {
      name: "Example Compound A",
      kind: "dose",
      amount: 0.25,
      unit: "IU",
      blockId: morning,
      blockIds: [morning, night],
    }), true);
    const items = app.state.dailyRoutines.items.filter(isLive);
    assert.equal(items.length, 1);
    assert.equal(items[0].kind, "dose");
    assert.equal(items[0].evidence, undefined);
    const compound = app.state.dailyRoutines.compounds.find((row) => row.id === items[0].compoundId);
    assert.equal(compound.amount, 0.25);
    assert.equal(typeof compound.amount, "number");
    assert.equal(compound.unit, "IU");
    assert.equal(livePlacements(morning).length, 1);
    assert.equal(livePlacements(night).length, 1);
    assert.equal(livePlacements(morning)[0].itemId, livePlacements(night)[0].itemId);
    assert.equal(logRoutineItem(app.state, items[0].id), true);
    assert.equal(app.state.dailyRoutines.logs.filter(isLive).length, 1);
    const logged = logsSnapshot();
    assert.equal(saveRoutineItem(app.state, {
      itemId: items[0].id,
      name: "Example Compound A",
      kind: "dose",
      amount: 1,
      unit: "mg",
      blockId: morning,
      blockIds: [morning, night],
    }), true);
    assert.equal(app.state.dailyRoutines.compounds.find((row) => row.id === items[0].compoundId).amount, 1);
    assert.equal(app.state.dailyRoutines.compounds.find((row) => row.id === items[0].compoundId).unit, "mg");
    assert.deepEqual(logsSnapshot(), logged);
    assert.equal(toggleRoutineCollapsed(app.state, night), true);
    assert.equal(toggleRoutineCollapsed(app.state, morning), true);
    const html = dailyRoutinesHTML();
    assert.equal(html.match(/Show 1 completed/g).length, 2);
    assert.equal(app.state.dailyRoutines.prefs.lastBlockId, morning);
  });

  test("dose units and a check item store no suggested amount", () => {
    signIn();
    const morning = blockId("Morning routine");
    for (const unit of ["mcg", "mg", "IU", "mL", "units"]) {
      assert.equal(addRoutineItem(app.state, morning, { name: `Example ${unit}`, kind: "dose", amount: "1/4", unit }), true);
      const item = app.state.dailyRoutines.items.find((row) => row.name === `Example ${unit}`);
      const compound = app.state.dailyRoutines.compounds.find((row) => row.id === item.compoundId);
      assert.equal(compound.unit, unit);
      assert.equal(compound.amount, 0.25);
    }
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Check", kind: "check" }), true);
    const check = app.state.dailyRoutines.items.find((row) => row.name === "Example Check");
    assert.equal(check.kind, "check");
    assert.equal(check.compoundId, null);
    assert.equal(check.evidence, undefined);
    const seeded = structuredClone(app.state.dailyRoutines);
    assert.equal(addRoutineItem(app.state, morning, { name: "Nope", kind: "dose", amount: 1, unit: "drops" }), false);
    assert.equal(addRoutineItem(app.state, morning, { name: "Nope", kind: "dose", amount: -1, unit: "mg" }), false);
    assert.deepEqual(app.state.dailyRoutines, seeded);
    app.ui.sd = routineItemDraft(app.state, { blockId: morning, itemId: check.id });
    const checkSheet = routineItemSheetHTML();
    assert.match(checkSheet, /aria-pressed="true">Check/);
    assert.match(checkSheet, /No evidence is attached/);
    assert.doesNotMatch(checkSheet, /<select|evidence strength/i);
    const dose = app.state.dailyRoutines.items.find((row) => row.name === "Example mcg");
    app.ui.sd = routineItemDraft(app.state, { blockId: morning, itemId: dose.id });
    const sheet = routineItemSheetHTML();
    assert.match(sheet, /aria-pressed="true">Dose/);
    assert.match(sheet, /value="0.25"/);
    assert.match(sheet, /for="dr-item-amount"/);
    for (const unit of ["mcg", "mg", "IU", "mL", "units"]) assert.match(sheet, new RegExp(`data-unit="${unit}"`));
    assert.match(sheet, /Quarter amounts/);
    assert.match(sheet, /No evidence is attached/);
    assert.match(sheet, /Nothing here suggests a dose/);
    assert.doesNotMatch(sheet, /<select|evidence strength/i);
  });

  test("there is no item cap", () => {
    signIn();
    const morning = blockId("Morning routine");
    for (let i = 0; i < 12; i += 1) {
      assert.equal(addRoutineItem(app.state, morning, { name: `Example Item ${i}`, kind: "check" }), true);
    }
    assert.equal(app.state.dailyRoutines.items.filter(isLive).length, 12);
    assert.match(dailyRoutinesHTML(), /data-action="routines-add-item"/);
  });

  test("collapsed state and the last block persist across reload", () => {
    signIn();
    const morning = blockId("Morning routine");
    assert.equal(addRoutineBlock(app.state, "Post-workout stack"), true);
    const added = app.state.dailyRoutines.blocks.find((row) => row.name === "Post-workout stack");
    assert.equal(app.state.dailyRoutines.prefs.lastBlockId, added.id);
    assert.equal(setRoutineBlockColor(app.state, added.id, "lavender"), true);
    assert.equal(toggleRoutineCollapsed(app.state, morning), true);
    const reloaded = normalizeDailyRoutines(JSON.parse(JSON.stringify(app.state.dailyRoutines)));
    app.state.dailyRoutines = reloaded;
    const html = dailyRoutinesHTML();
    assert.match(html, new RegExp(`data-block-id="${morning}" data-current="[^"]+" data-collapsed="true"`));
    assert.equal(reloaded.prefs.lastBlockId, morning);
    assert.match(html, new RegExp(`data-block-id="${morning}"[^>]*data-last="true"`));
    assert.equal(reloaded.blocks.find((row) => row.id === added.id).color, "lavender");
    assert.match(readFileSync(new URL("../logger/css/routines.css", import.meta.url), "utf8"), /var\(--green\)/);
    assert.match(readFileSync(new URL("../logger/css/routines.css", import.meta.url), "utf8"), /var\(--lav\)/);
    assert.match(readFileSync(new URL("../logger/css/appearance.css", import.meta.url), "utf8"), /data-accent="sea"/);
  });

  test("edit mode keeps logging on a tap and labels the handles", () => {
    signIn();
    const morning = blockId("Morning routine");
    addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" });
    let html = dailyRoutinesHTML();
    assert.match(html, /data-action="routines-log"/);
    assert.match(html, /aria-label="Edit routines"/);
    app.ui.dailyRoutineEdit = true;
    html = dailyRoutinesHTML();
    assert.equal(html.includes('data-routines-edit="on"'), true);
    assert.doesNotMatch(html, /data-action="routines-log"/);
    assert.match(html, /aria-label="Reorder Morning routine"/);
    assert.match(html, /aria-label="Reorder Example Compound A"/);
    assert.match(html, /aria-label="Remove Example Compound A from all routines"/);
    assert.match(html, /aria-label="Duplicate Morning routine"/);
    assert.match(html, /Long press to rename/);
    assert.match(html, /follows the accent/);
    app.ui.dailyRoutineEdit = false;
    assert.match(dailyRoutinesHTML(), /data-action="routines-log"/);
  });

  test("a tombstoned block is not replaced by the default seed", () => {
    signIn();
    const morning = blockId("Morning routine");
    const night = blockId("Night routine");
    const stack = blockId("Supplement & enhancer stack");
    deleteRoutineBlock(app.state, morning);
    deleteRoutineBlock(app.state, night);
    deleteRoutineBlock(app.state, stack);
    const before = app.state.dailyRoutines.blocks.map((row) => row.id);
    const seeded = seedDefaultBlocks(app.state.dailyRoutines, 50);
    assert.deepEqual(seeded.blocks.map((row) => row.id), before);
    assert.equal(seeded.blocks.filter(isLive).length, 0);
    const html = dailyRoutinesHTML();
    assert.doesNotMatch(html, /data-block-id=/);
    app.ui.dailyRoutineEdit = true;
    assert.match(dailyRoutinesHTML(), /Restore Morning routine/);
  });

  test("two phones adding one item to the same block merge to one placement", () => {
    signIn();
    const morning = blockId("Morning routine");
    const night = blockId("Night routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "check" }), true);
    const item = app.state.dailyRoutines.items.find((row) => row.name === "Example Compound A");
    const before = structuredClone(app.state.dailyRoutines);
    const draft = { itemId: item.id, name: item.name, kind: "check", blockId: night, blockIds: [morning, night] };
    assert.equal(saveRoutineItem(app.state, draft), true);
    const phoneA = structuredClone(app.state.dailyRoutines);
    app.state.dailyRoutines = structuredClone(before);
    assert.equal(saveRoutineItem(app.state, draft), true);
    const phoneB = structuredClone(app.state.dailyRoutines);
    const placeA = phoneA.placements.find((row) => isLive(row) && row.blockId === night);
    const placeB = phoneB.placements.find((row) => isLive(row) && row.blockId === night);
    assert.equal(placeA.id, routinePlacementId(night, item.id));
    assert.equal(placeA.id, placeB.id);
    for (const merged of [mergeDailyRoutines(phoneA, phoneB), mergeDailyRoutines(phoneB, phoneA)]) {
      assert.equal(merged.placements.filter((row) => isLive(row) && row.blockId === night && row.itemId === item.id).length, 1);
    }
    const longBlock = `block_${"x".repeat(70)}`;
    const longItem = `item_${"y".repeat(70)}`;
    const hashed = routinePlacementId(longBlock, longItem);
    assert.equal(hashed.length <= 80, true);
    assert.equal(hashed, routinePlacementId(longBlock, longItem));
    const phoneLeft = {
      ...emptyDailyRoutines(5),
      placements: [{ id: "place_phone_a", blockId: night, itemId: item.id, order: 0, updatedAt: 10, deletedAt: null }],
    };
    const phoneRight = {
      ...emptyDailyRoutines(5),
      placements: [{ id: "place_phone_b", blockId: night, itemId: item.id, order: 1, updatedAt: 30, deletedAt: null }],
    };
    const collapsed = mergeDailyRoutines(phoneLeft, phoneRight);
    const shown = projectDailyRoutines(collapsed).placements.filter((row) => row.blockId === night && row.itemId === item.id);
    assert.equal(shown.length, 1);
    assert.equal(shown[0].id, "place_phone_b");
    const again = mergeDailyRoutines(collapsed, phoneLeft);
    assert.equal(projectDailyRoutines(again).placements.filter((row) => row.blockId === night && row.itemId === item.id).length, 1);
  });

  test("an edit to a row from a phone days ahead stays ahead of that row's original copy", () => {
    for (const edit of ["rename", "delete"]) {
      signIn();
      const morning = blockId("Morning routine");
      assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" }), true);
      const raw = structuredClone(app.state.dailyRoutines);
      const ahead = Date.now() + 3 * 24 * 60 * 60 * 1000;
      const id = raw.items.find((row) => row.name === "Example Compound A").id;
      raw.items = raw.items.map((row) => (row.id === id ? { ...row, updatedAt: ahead } : row));
      raw.compounds = (raw.compounds || []).map((row) => ({ ...row, updatedAt: ahead }));
      raw.blocks = raw.blocks.map((row) => ({ ...row, updatedAt: ahead }));
      app.state.dailyRoutines = normalizeDailyRoutines(raw);
      assert.equal(app.state.dailyRoutines.items.find((row) => row.id === id).sourceAt, ahead);
      // The other phone still holds its own copy with the raw future stamp.
      const original = structuredClone(raw);
      app.routineNow = () => new Date();
      if (edit === "rename") assert.equal(renameRoutineItem(app.state, id, "Renamed Example"), true);
      else assert.equal(deleteRoutineItem(app.state, id), true);
      const edited = structuredClone(app.state.dailyRoutines);
      // A reorder keeps the row's stamp, so it takes no step and a delete still beats it.
      if (edit === "rename") {
        const blockIds = projectDailyRoutines(edited).blocks.map((row) => row.id);
        const steps = new Map(edited.blocks.map((row) => [row.id, row.sourceStep || 0]));
        app.state.dailyRoutines = structuredClone(edited);
        assert.equal(reorderRoutineBlocks(app.state, blockIds.slice().reverse(), blockIds[0]), true);
        for (const row of app.state.dailyRoutines.blocks) assert.equal(row.sourceStep || 0, steps.get(row.id));
        assert.ok(app.state.dailyRoutines.blocks.some((row) => typeof row.sourceAt === "number"));
      }
      const later = Date.now() + 1000;
      for (const merged of [mergeDailyRoutines(original, edited, later), mergeDailyRoutines(edited, original, later)]) {
        const row = merged.items.find((entry) => entry.id === id);
        if (edit === "rename") {
          assert.equal(row.name, "Renamed Example");
          const compound = merged.compounds.find((entry) => entry.id === row.compoundId);
          assert.equal(compound.name, "Renamed Example");
        } else {
          assert.equal(isLive(row), false);
        }
      }
    }
  });

  test("reordering future-dated blocks back and forth does not outrank the other phone's delete", () => {
    signIn();
    const ahead = Date.now() + 3 * 24 * 60 * 60 * 1000;
    const raw = structuredClone(app.state.dailyRoutines);
    raw.blocks = raw.blocks.map((row) => ({ ...row, updatedAt: ahead }));
    app.state.dailyRoutines = normalizeDailyRoutines(raw);
    const shared = structuredClone(app.state.dailyRoutines);
    app.routineNow = () => new Date();
    const ids = projectDailyRoutines(shared).blocks.map((row) => row.id);
    assert.equal(reorderRoutineBlocks(app.state, ids.slice().reverse(), ids[0]), true);
    assert.equal(reorderRoutineBlocks(app.state, ids, ids[0]), true);
    const reordered = structuredClone(app.state.dailyRoutines);
    app.state.dailyRoutines = structuredClone(shared);
    assert.equal(deleteRoutineBlock(app.state, ids[0]), true);
    const deleted = structuredClone(app.state.dailyRoutines);
    const later = Date.now() + 1000;
    for (const merged of [mergeDailyRoutines(deleted, reordered, later), mergeDailyRoutines(reordered, deleted, later)]) {
      assert.equal(isLive(merged.blocks.find((row) => row.id === ids[0])), false);
    }
  });

  test("a dose edit of a future-dated compound and item stays ahead of the original copy", () => {
    signIn();
    const morning = blockId("Morning routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" }), true);
    const ahead = Date.now() + 3 * 24 * 60 * 60 * 1000;
    const raw = structuredClone(app.state.dailyRoutines);
    raw.items = raw.items.map((row) => ({ ...row, updatedAt: ahead }));
    raw.compounds = raw.compounds.map((row) => ({ ...row, updatedAt: ahead }));
    app.state.dailyRoutines = normalizeDailyRoutines(raw);
    const item = app.state.dailyRoutines.items.find((row) => row.name === "Example Compound A");
    app.routineNow = () => new Date();
    assert.equal(saveRoutineItem(app.state, {
      itemId: item.id, name: "Example Compound B", kind: "dose", amount: 500, unit: "mcg", blockId: morning, blockIds: [morning],
    }), true);
    const edited = structuredClone(app.state.dailyRoutines);
    const later = Date.now() + 1000;
    for (const merged of [mergeDailyRoutines(raw, edited, later), mergeDailyRoutines(edited, raw, later)]) {
      const row = merged.items.find((entry) => entry.id === item.id);
      assert.equal(row.name, "Example Compound B");
      const compound = merged.compounds.find((entry) => entry.id === row.compoundId);
      assert.equal(compound.amount, 500);
      assert.equal(compound.name, "Example Compound B");
    }
  });

  test("a newer rename beats the other phone's item delete and keeps the placements", () => {
    signIn();
    const morning = blockId("Morning routine");
    const night = blockId("Night routine");
    assert.equal(saveRoutineItem(app.state, {
      name: "Example Compound A", kind: "check", blockId: morning, blockIds: [morning, night],
    }), true);
    const item = app.state.dailyRoutines.items.find((row) => row.name === "Example Compound A");
    const before = structuredClone(app.state.dailyRoutines);
    app.routineNow = () => new Date(2026, 10, 19, 9, 0);
    assert.equal(deleteRoutineItem(app.state, item.id), true);
    const deleted = structuredClone(app.state.dailyRoutines);
    app.state.dailyRoutines = structuredClone(before);
    app.routineNow = () => new Date(2026, 10, 19, 10, 0);
    assert.equal(renameRoutineItem(app.state, item.id, "Renamed Example"), true);
    const renamed = structuredClone(app.state.dailyRoutines);
    for (const merged of [mergeDailyRoutines(deleted, renamed), mergeDailyRoutines(renamed, deleted)]) {
      const winner = merged.items.find((row) => row.id === item.id);
      assert.equal(isLive(winner), true);
      assert.equal(winner.name, "Renamed Example");
      const view = projectDailyRoutines(merged);
      assert.ok(view.items.some((row) => row.id === item.id));
      assert.equal(view.placements.filter((row) => row.itemId === item.id).length, 2);
      app.state.dailyRoutines = merged;
      assert.equal(restoreRoutineItem(app.state, item.id), false);
      assert.match(dailyRoutinesHTML(), /Renamed Example/);
    }
    app.state.dailyRoutines = structuredClone(renamed);
    app.routineNow = () => new Date(2026, 10, 19, 11, 0);
    assert.equal(deleteRoutineItem(app.state, item.id), true);
    const laterDelete = structuredClone(app.state.dailyRoutines);
    const removed = mergeDailyRoutines(laterDelete, renamed);
    assert.equal(isLive(removed.items.find((row) => row.id === item.id)), false);
    assert.equal(removed.placements.filter((row) => isLive(row) && row.itemId === item.id).length, 0);
  });

  test("a delete-versus-rename merge keeps one row when the pair already had two ids", () => {
    signIn();
    const morning = blockId("Morning routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "check" }), true);
    const item = app.state.dailyRoutines.items.find((row) => row.name === "Example Compound A");
    const canonical = app.state.dailyRoutines.placements.find((row) => row.itemId === item.id && row.blockId === morning);
    const withBoth = structuredClone(app.state.dailyRoutines);
    withBoth.placements.push({ ...canonical, id: "place_legacy" });
    app.state.dailyRoutines = structuredClone(withBoth);
    app.routineNow = () => new Date(2026, 10, 19, 9, 0);
    assert.equal(deleteRoutineItem(app.state, item.id), true);
    const deleted = structuredClone(app.state.dailyRoutines);
    app.state.dailyRoutines = structuredClone(withBoth);
    app.routineNow = () => new Date(2026, 10, 19, 10, 0);
    assert.equal(renameRoutineItem(app.state, item.id, "Renamed Example"), true);
    const renamed = structuredClone(app.state.dailyRoutines);
    for (const merged of [mergeDailyRoutines(deleted, renamed), mergeDailyRoutines(renamed, deleted)]) {
      const view = projectDailyRoutines(merged);
      assert.equal(view.placements.filter((row) => row.itemId === item.id && row.blockId === morning).length, 1);
      const again = mergeDailyRoutines(merged, deleted);
      assert.equal(projectDailyRoutines(again).placements.filter((row) => row.itemId === item.id && row.blockId === morning).length, 1);
    }
  });

  test("deleting and restoring an item after that merge does not bring the duplicate back", () => {
    signIn();
    const morning = blockId("Morning routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "check" }), true);
    const item = app.state.dailyRoutines.items.find((row) => row.name === "Example Compound A");
    const canonical = app.state.dailyRoutines.placements.find((row) => row.itemId === item.id && row.blockId === morning);
    const withBoth = structuredClone(app.state.dailyRoutines);
    withBoth.placements.push({ ...canonical, id: "place_legacy" });
    app.state.dailyRoutines = structuredClone(withBoth);
    app.routineNow = () => new Date(2026, 10, 19, 9, 0);
    assert.equal(deleteRoutineItem(app.state, item.id), true);
    const deleted = structuredClone(app.state.dailyRoutines);
    app.state.dailyRoutines = structuredClone(withBoth);
    app.routineNow = () => new Date(2026, 10, 19, 10, 0);
    assert.equal(renameRoutineItem(app.state, item.id, "Renamed Example"), true);
    const renamed = structuredClone(app.state.dailyRoutines);
    const merged = mergeDailyRoutines(deleted, renamed);
    app.state.dailyRoutines = merged;
    app.routineNow = () => new Date(2026, 10, 19, 11, 0);
    assert.equal(deleteRoutineItem(app.state, item.id), true);
    app.routineNow = () => new Date(2026, 10, 19, 12, 0);
    assert.equal(restoreRoutineItem(app.state, item.id), true);
    const view = projectDailyRoutines(app.state.dailyRoutines);
    assert.equal(view.placements.filter((row) => row.itemId === item.id && row.blockId === morning).length, 1);
  });

  test("a newer block rename beats the other phone's block delete and keeps placements", () => {
    signIn();
    const morning = blockId("Morning routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "check" }), true);
    const item = app.state.dailyRoutines.items.find((row) => row.name === "Example Compound A");
    const before = structuredClone(app.state.dailyRoutines);
    app.routineNow = () => new Date(2026, 10, 19, 9, 0);
    assert.equal(deleteRoutineBlock(app.state, morning), true);
    const deleted = structuredClone(app.state.dailyRoutines);
    app.state.dailyRoutines = structuredClone(before);
    app.routineNow = () => new Date(2026, 10, 19, 10, 0);
    assert.equal(renameRoutineBlock(app.state, morning, "Early routine"), true);
    const renamed = structuredClone(app.state.dailyRoutines);
    for (const merged of [mergeDailyRoutines(deleted, renamed), mergeDailyRoutines(renamed, deleted)]) {
      const block = merged.blocks.find((row) => row.id === morning);
      assert.equal(isLive(block), true);
      assert.equal(block.name, "Early routine");
      const view = projectDailyRoutines(merged);
      assert.equal(view.placements.filter((row) => row.blockId === morning && row.itemId === item.id).length, 1);
      assert.ok(view.items.some((row) => row.id === item.id));
    }
    app.state.dailyRoutines = structuredClone(renamed);
    app.routineNow = () => new Date(2026, 10, 19, 11, 0);
    assert.equal(deleteRoutineBlock(app.state, morning), true);
    const later = mergeDailyRoutines(app.state.dailyRoutines, renamed);
    assert.equal(isLive(later.blocks.find((row) => row.id === morning)), false);
    assert.equal(later.placements.filter((row) => isLive(row) && row.blockId === morning).length, 0);
  });

  test("the later membership edit keeps the blocks it still uses", () => {
    signIn();
    const morning = blockId("Morning routine");
    const night = blockId("Night routine");
    assert.equal(saveRoutineItem(app.state, {
      name: "Example Compound A", kind: "check", blockId: morning, blockIds: [morning, night],
    }), true);
    const item = app.state.dailyRoutines.items.find((row) => row.name === "Example Compound A");
    const before = structuredClone(app.state.dailyRoutines);
    const draft = (kept, blockIds) => ({ itemId: item.id, name: item.name, kind: "check", blockId: kept, blockIds });
    app.routineNow = () => new Date(2026, 10, 19, 9, 0);
    assert.equal(saveRoutineItem(app.state, draft(morning, [morning])), true);
    const keepMorning = structuredClone(app.state.dailyRoutines);
    const morningPlace = keepMorning.placements.find((row) => isLive(row) && row.blockId === morning && row.itemId === item.id);
    assert.ok(morningPlace.updatedAt > before.placements.find((row) => row.blockId === morning && row.itemId === item.id).updatedAt);
    app.state.dailyRoutines = structuredClone(before);
    app.routineNow = () => new Date(2026, 10, 19, 10, 0);
    assert.equal(saveRoutineItem(app.state, draft(night, [night])), true);
    const keepNight = structuredClone(app.state.dailyRoutines);
    for (const merged of [mergeDailyRoutines(keepMorning, keepNight), mergeDailyRoutines(keepNight, keepMorning)]) {
      const view = projectDailyRoutines(merged);
      const places = view.placements.filter((row) => row.itemId === item.id);
      assert.deepEqual(places.map((row) => row.blockId), [night]);
      assert.ok(view.items.some((row) => row.id === item.id));
    }
  });

  test("converting a dose to a check stops new logs from keeping the old amount", () => {
    signIn();
    const morning = blockId("Morning routine");
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "dose", amount: 250, unit: "mcg" }), true);
    const item = app.state.dailyRoutines.items.find((row) => row.name === "Example Compound A");
    assert.equal(logRoutineItem(app.state, item.id), true);
    const first = app.state.dailyRoutines.logs.find((row) => isLive(row) && row.itemId === item.id);
    assert.equal(first.amount, 250);
    assert.equal(first.unit, "mcg");
    const kept = structuredClone(first);
    assert.equal(saveRoutineItem(app.state, {
      itemId: item.id, name: item.name, kind: "check", blockId: morning, blockIds: [morning],
    }), true);
    const converted = app.state.dailyRoutines.items.find((row) => row.id === item.id);
    assert.equal(converted.kind, "check");
    assert.equal(converted.compoundId, null);
    const still = app.state.dailyRoutines.logs.find((row) => row.id === first.id);
    assert.equal(still.amount, kept.amount);
    assert.equal(still.unit, kept.unit);
    pin("2026-11-20");
    app.routineNow = () => new Date(2026, 10, 20, 8, 30);
    assert.equal(logRoutineItem(app.state, item.id), true);
    const next = app.state.dailyRoutines.logs.find((row) => isLive(row) && row.day === "2026-11-20");
    assert.equal(next.amount, null);
    assert.equal(next.unit, "");
    assert.equal(undoRoutineLog(app.state, first.id), true);
    assert.equal(restoreRoutineLog(app.state, first.id), true);
    const restored = app.state.dailyRoutines.logs.find((row) => row.id === first.id);
    assert.equal(isLive(restored), true);
    assert.equal(restored.amount, 250);
    assert.equal(restored.unit, "mcg");
  });

  test("the flag stays off in source and the new file is in the shell", () => {
    const flag = readFileSync(new URL("../logger/js/shared/routines-flag.js", import.meta.url), "utf8");
    const sw = readFileSync(new URL("../logger/sw.js", import.meta.url), "utf8");
    const sentry = readFileSync(new URL("../logger/js/sentry.js", import.meta.url), "utf8");
    const main = readFileSync(new URL("../logger/js/main.js", import.meta.url), "utf8");
    const page = readFileSync(new URL("../logger/js/pages/daily-routines.js", import.meta.url), "utf8");
    const edit = readFileSync(new URL("../logger/js/pages/daily-routines-edit.js", import.meta.url), "utf8");
    const css = readFileSync(new URL("../logger/css/routines.css", import.meta.url), "utf8");
    assert.match(flag, /ROUTINES_ENABLED = true/);
    assert.match(sw, /const CACHE = "insight-shell-v80"/);
    assert.match(sentry, /insight-shell-v80/);
    assert.match(sw, /js\/pages\/daily-routines-edit\.js/);
    assert.match(main, /import "\.\/pages\/daily-routines-edit\.js";/);
    assert.equal(main.match(/routines-flag/g).length, 1);
    assert.doesNotMatch(page, /routines-flag/);
    assert.doesNotMatch(edit, /routines-flag/);
    assert.doesNotMatch(page, /addExampleRoutineItem/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(css, /@media \(prefers-reduced-motion: no-preference\)/);
    assert.match(edit, /translate3d/);
  });

  test("writes refuse a signed-out session and a flag-off session", () => {
    signIn();
    const morning = blockId("Morning routine");
    const seeded = structuredClone(app.state.dailyRoutines);
    app.session = null;
    assert.equal(addRoutineBlock(app.state, "Extra"), false);
    assert.equal(addRoutineItem(app.state, morning, { name: "Example Compound A", kind: "check" }), false);
    assert.equal(renameRoutineBlock(app.state, morning, "Renamed"), false);
    assert.deepEqual(app.state.dailyRoutines, seeded);
    app.session = { user: { id: "synthetic-user" } };
    app.ROUTINES_ENABLED = false;
    assert.equal(dailyRoutinesHTML(), "");
    assert.equal(saveRoutineItem(app.state, { name: "Example Compound A", kind: "check", blockId: morning, blockIds: [morning] }), false);
  });

  test("a dead duplicate cannot tie the live placement on a second pass", () => {
    const live = { id: "place_canon", blockId: "block-1", itemId: "item-a", order: 0, updatedAt: 101, deletedAt: null, removedWith: null };
    const dead = { id: "place_legacy", blockId: "block-1", itemId: "item-a", order: 0, updatedAt: 100, deletedAt: 100, removedWith: null };
    const once = dedupePlacementPairs([live, dead]);
    const twice = dedupePlacementPairs(once);
    const liveIds = (rows) => rows.filter((row) => !(row.deletedAt > 0)).map((row) => row.id);
    assert.deepEqual(liveIds(once), ["place_canon"]);
    assert.deepEqual(liveIds(twice), ["place_canon"]);
  });
});
