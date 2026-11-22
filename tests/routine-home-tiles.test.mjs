import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { app } from "../logger/js/runtime.js";
import { applyHomeMigration, migrateHomeLayout, pickHomeV2, seedRoutineNextUp } from "../logger/js/shared/home-migrate.js";
import { commitHomeEditor, getHomeLayout, renderHomeWidgets, setHomeLayout } from "../logger/js/shared/home-widgets.js";
import { addToDraft, removeFromDraft } from "../logger/js/shared/home-edit.js";
import {
  NEXT_UP_TILE_ID,
  ROUTINE_TILE_STACK_CAP,
  addRoutineTile,
  clampRoutineTileStack,
  forgetRoutineTrayQuery,
  hideLegacyNextUp,
  isRoutineTileId,
  openRoutineTile,
  legacyNextUpHTML,
  legacyNextUpWanted,
  refreshHomeRoutineGates,
  renderRoutineTileHTML,
  routineGateRefresh,
  routineBlockTileId,
  routineHaptic,
  routineItemTileId,
  routineMotionOn,
  routineStacksEnabled,
  routineTileDropEffect,
  routineTilePreview,
  routineTrayEntries,
  routineTrayHTML,
  showLegacyNextUp,
  tileGateVisible,
  trayHeightAfterDrag,
} from "../logger/js/shared/routine-home-tiles.js";

/* The customized Home fixture from the migrate harness. Flag off, this output
   is the whole migration. A change that inserts a routine tile fails here. */
const CUSTOM = {
  settingsAt: 200,
  muscleMode: "basic",
  layout: { home: { order: ["today", "brief", "cardio", "readiness", "week"], hidden: ["map-adv"] } },
  brief: { order: ["weight", "oura", "train", "food", "week"], hidden: ["food"], size: "compact", updatedAt: 150 },
};
const MIGRATED_ITEMS = ["today", "weight-trend", "readiness", "sleep-score", "weekly-goal", "pattern", "cardio", "hrv", "this-week", "muscles"];
const MIGRATED_HIDDEN = ["food-yesterday"];

const MORNING = new Date(2026, 10, 20, 6, 0);
const AFTER = new Date(2026, 10, 20, 6, 30);

function sampleStore() {
  return {
    updatedAt: 10,
    blocks: [
      { id: "block-m", name: "Sample morning check", color: "citrus", order: 0, updatedAt: 10, deletedAt: null },
      { id: "block-n", name: "Sample night check", color: "pink", order: 1, updatedAt: 10, deletedAt: null },
    ],
    items: [
      { id: "item-a", name: "Sample morning check", kind: "check", compoundId: null, updatedAt: 10, deletedAt: null },
      { id: "item-b", name: "Sample dose row", kind: "dose", compoundId: "compound-a", updatedAt: 10, deletedAt: null },
    ],
    placements: [
      { id: "place-a", blockId: "block-m", itemId: "item-a", order: 0, updatedAt: 10, deletedAt: null },
      { id: "place-b", blockId: "block-n", itemId: "item-b", order: 0, updatedAt: 10, deletedAt: null },
    ],
    compounds: [
      { id: "compound-a", name: "Example Compound A", amount: 250, unit: "mcg", startDate: "2026-11-01", archivedAt: null, updatedAt: 10, deletedAt: null },
    ],
    logs: [],
    prefs: { lastBlockId: null, updatedAt: 10 },
  };
}

function sampleState() {
  return { dailyRoutines: sampleStore() };
}

function editState() {
  return { layout: { homeV2: { v: 2, items: ["today", "cardio"], hidden: ["steps"], updatedAt: 50, sizes: { today: "small" } } } };
}

test.afterEach(() => {
  app.ROUTINES_ENABLED = false;
  app.session = null;
  app.sb = null;
  app.cloudPullOk = null;
  app.ui = {};
});

test("flag off, the Home migrate fixture is unchanged", () => {
  app.ROUTINES_ENABLED = false;
  const migrated = migrateHomeLayout(CUSTOM);
  assert.deepEqual(Object.keys(migrated).sort(), ["hidden", "items", "updatedAt", "v"]);
  assert.deepEqual(migrated.items, MIGRATED_ITEMS);
  assert.deepEqual(migrated.hidden, MIGRATED_HIDDEN);
  assert.equal(migrated.updatedAt, 200);
  assert.equal(JSON.stringify(migrated).includes("routine-"), false);

  app.ROUTINES_ENABLED = true;
  assert.deepEqual(migrateHomeLayout(CUSTOM), migrated);

  const off = structuredClone(CUSTOM);
  const on = structuredClone(CUSTOM);
  app.ROUTINES_ENABLED = false;
  applyHomeMigration(off, 1000);
  app.ROUTINES_ENABLED = true;
  applyHomeMigration(on, 1000);
  assert.deepEqual(on.layout.homeV2, off.layout.homeV2);
  assert.equal(off.layout.homeV2.migrated, true);
  assert.equal(JSON.stringify(off.layout.homeV2).includes(NEXT_UP_TILE_ID), false);

  const edit = editState();
  const before = JSON.stringify(edit);
  app.ROUTINES_ENABLED = false;
  applyHomeMigration(edit, 1000);
  seedRoutineNextUp(edit);
  assert.equal(JSON.stringify(edit), before);
});

function withRoutines(state) {
  app.session = { user: { id: "synthetic-user" } };
  state.dailyRoutines = sampleStore();
  return state;
}

test("flag on, Next up is added once and does not reshuffle a real edit", () => {
  app.ROUTINES_ENABLED = true;
  const state = withRoutines(editState());
  applyHomeMigration(state, 5000);
  const home = state.layout.homeV2;
  assert.deepEqual(home.items, ["today", "cardio", NEXT_UP_TILE_ID]);
  assert.deepEqual(home.hidden, ["steps"]);
  assert.equal(home.updatedAt, 50);
  assert.equal(home.sizes.today, "small");
  assert.equal(home.routineNextSeeded, true);
  assert.equal(home.routineNextAside, undefined);
  const stamped = home.updatedAt;
  applyHomeMigration(state, 9000);
  assert.deepEqual(state.layout.homeV2.items, ["today", "cardio", NEXT_UP_TILE_ID]);
  assert.equal(state.layout.homeV2.updatedAt, stamped);

  const hidden = withRoutines({ layout: { homeV2: { v: 2, items: ["today"], hidden: [NEXT_UP_TILE_ID], updatedAt: 40 } } });
  seedRoutineNextUp(hidden);
  assert.deepEqual(hidden.layout.homeV2.items, ["today"]);
  assert.deepEqual(hidden.layout.homeV2.hidden, [NEXT_UP_TILE_ID]);
  assert.equal(hidden.layout.homeV2.updatedAt, 40);

  const decided = withRoutines({ layout: { homeV2: { v: 2, items: ["today"], hidden: [], updatedAt: 40, routineNextSeeded: true } } });
  seedRoutineNextUp(decided);
  assert.deepEqual(decided.layout.homeV2.items, ["today"]);

  const empty = withRoutines({ layout: { homeV2: { v: 2, items: [], hidden: [], updatedAt: 9 } } });
  seedRoutineNextUp(empty);
  assert.deepEqual(empty.layout.homeV2.items, []);
  assert.equal(empty.layout.homeV2.routineNextAside, undefined);
  assert.equal(empty.layout.homeV2.routineNextSeeded, true);
  assert.equal(empty.layout.homeV2.updatedAt, 9);
  const picked = pickHomeV2(empty.layout, { homeV2: { v: 2, items: ["today"], hidden: [], updatedAt: 1 } }, 1000);
  assert.ok(picked);
  assert.deepEqual(picked.items, []);

  const local = { homeV2: { v: 2, items: ["today", NEXT_UP_TILE_ID], hidden: [], updatedAt: 50 } };
  const remote = { homeV2: { v: 2, items: ["today"], hidden: [], updatedAt: 50 } };
  const tie = pickHomeV2(local, remote, 1000);
  assert.ok(tie.items.includes(NEXT_UP_TILE_ID));
});

test("Next up stays off Home without a signed-in routine, and Remove sticks", () => {
  app.ROUTINES_ENABLED = true;
  const edit = editState();
  seedRoutineNextUp(edit);
  assert.equal(edit.layout.homeV2.items.includes(NEXT_UP_TILE_ID), false);
  app.session = { user: { id: "synthetic-user" } };
  seedRoutineNextUp(edit);
  assert.equal(edit.layout.homeV2.items.includes(NEXT_UP_TILE_ID), false);
  assert.equal(legacyNextUpWanted(edit), false);

  const home = withRoutines(editState());
  seedRoutineNextUp(home);
  assert.equal(home.layout.homeV2.items.includes(NEXT_UP_TILE_ID), true);
  delete home.dailyRoutines;
  assert.equal(hideLegacyNextUp(home), true);
  assert.equal(home.layout.homeV2.items.includes(NEXT_UP_TILE_ID), false);
  assert.equal(home.layout.homeV2.hidden.includes(NEXT_UP_TILE_ID), true);
  assert.equal(home.layout.homeV2.routineNextSeeded, true);
  seedRoutineNextUp(home);
  assert.equal(home.layout.homeV2.items.includes(NEXT_UP_TILE_ID), false);
});

test("flag off, a routine tile id follows the unknown-id rules", () => {
  app.ROUTINES_ENABLED = false;
  const state = {
    layout: { homeV2: { v: 2, items: ["today", NEXT_UP_TILE_ID, "cardio"], hidden: ["future-widget"], updatedAt: 4, sizes: { [NEXT_UP_TILE_ID]: "small" } } },
  };
  const painted = getHomeLayout(state);
  assert.deepEqual(painted.items, ["today", "cardio"]);
  assert.equal(painted.hidden.includes(NEXT_UP_TILE_ID), false);
  assert.equal(renderHomeWidgets(state.layout.homeV2, {}).includes(NEXT_UP_TILE_ID), false);

  const written = setHomeLayout(state, { items: ["muscles"], hidden: ["hrv"] });
  assert.ok(written.items.includes(NEXT_UP_TILE_ID));
  assert.ok(written.hidden.includes("future-widget"));
  assert.equal(written.sizes[NEXT_UP_TILE_ID], "small");

  const again = { layout: { homeV2: { v: 2, items: ["today", NEXT_UP_TILE_ID], hidden: [], updatedAt: 4 } } };
  commitHomeEditor(again, { items: ["cardio"], hidden: ["today"], sizes: {} });
  assert.ok(again.layout.homeV2.items.includes(NEXT_UP_TILE_ID));
  assert.equal(removeFromDraft({ items: ["today", NEXT_UP_TILE_ID], hidden: [], sizes: {} }, NEXT_UP_TILE_ID).items.includes(NEXT_UP_TILE_ID), false);
  assert.deepEqual(addRoutineTile({ items: ["today"], hidden: [], sizes: {} }, NEXT_UP_TILE_ID, "medium").items, ["today"]);
  assert.equal(legacyNextUpWanted(sampleState()), false);
  assert.equal(legacyNextUpHTML(sampleState()), "");
  assert.equal(routineTrayHTML({ items: [] }, sampleState()), "");
});

test("flag on, the tile paints, checks off, and jumps", () => {
  app.ROUTINES_ENABLED = true;
  app.session = { user: { id: "synthetic-user" } };
  app.today = () => "2026-11-20";
  const state = sampleState();
  const big = renderRoutineTileHTML(NEXT_UP_TILE_ID, { state, size: "medium", date: MORNING });
  assert.match(big, /Next up/);
  assert.match(big, /Sample morning check/);
  assert.match(big, /data-action="routines-log"/);
  assert.match(big, /data-item-id="item-a"/);
  assert.doesNotMatch(big, /data-stack|rt-stack|preview/);

  const small = renderRoutineTileHTML(NEXT_UP_TILE_ID, { state, size: "small" });
  assert.match(small, /data-action="routine-tile-open"/);
  assert.match(small, /Sample morning check/);

  const block = renderRoutineTileHTML(routineBlockTileId("block-n"), { state, size: "medium" });
  assert.match(block, /Sample night check/);
  assert.match(block, /Sample dose row · 250 mcg/);
  assert.match(block, /data-item-id="item-b"/);

  const logged = sampleState();
  logged.dailyRoutines.logs.push({
    id: "log-a", itemId: "item-a", compoundId: null, day: "2026-11-20", status: "done",
    amount: null, unit: "", at: 10, updatedAt: 10, deletedAt: null,
  });
  const next = renderRoutineTileHTML(NEXT_UP_TILE_ID, { state: logged, size: "medium" });
  assert.match(next, /Sample dose row/);
  assert.doesNotMatch(next, /data-item-id="item-a"/);

  assert.equal(legacyNextUpWanted(state), true);
  assert.match(legacyNextUpHTML(state), /data-hw="routine-next"/);
  const layout = { items: ["today", NEXT_UP_TILE_ID], hidden: [], routineGates: { [NEXT_UP_TILE_ID]: { start: "05:30", end: "06:30" } } };
  const shown = renderHomeWidgets(layout, { date: MORNING, routinesState: state, day: "2026-11-20" });
  assert.match(shown, /data-hw="routine-next"/);
  const hidden = renderHomeWidgets(layout, { date: AFTER, routinesState: state, day: "2026-11-20" });
  assert.equal(hidden.includes(NEXT_UP_TILE_ID), false);
  assert.equal(tileGateVisible({ start: "22:00", end: "06:30" }, new Date(2026, 10, 20, 23, 0)), true);
  assert.equal(tileGateVisible({ start: "22:00", end: "06:30" }, MORNING), true);
  assert.equal(tileGateVisible(null, MORNING), true);

  app.session = null;
  const signedOut = renderRoutineTileHTML(NEXT_UP_TILE_ID, { state, size: "medium", date: MORNING });
  assert.match(signedOut, /data-action="routine-tile-open"/);
  assert.doesNotMatch(signedOut, /data-action="routines-log"/);
});

test("the tray adds and removes by title, and the search is not kept", () => {
  app.ROUTINES_ENABLED = true;
  const state = sampleState();
  const placed = [routineBlockTileId("block-m")];
  const titles = routineTrayEntries(state, placed, "");
  assert.equal(titles.some((row) => row.id === NEXT_UP_TILE_ID), true);
  assert.equal(titles.some((row) => row.id === routineBlockTileId("block-m")), false);
  assert.equal(titles.some((row) => row.id === routineBlockTileId("block-n")), true);
  assert.deepEqual(routineTrayEntries(state, [], "mcg"), []);
  assert.deepEqual(routineTrayEntries(state, [], "250"), []);
  assert.equal(routineTrayEntries(state, [], "dose").length, 1);
  assert.equal(routineTrayEntries(state, [], "dose")[0].title, "Sample dose row");
  assert.equal(routineTrayEntries(state, [], "NIGHT").length, 1);

  let draft = { items: ["today"], hidden: [], sizes: {}, gates: {} };
  draft = addRoutineTile(draft, NEXT_UP_TILE_ID, "medium", { start: "05:30", end: "06:30" });
  assert.deepEqual(draft.items, ["today", NEXT_UP_TILE_ID]);
  assert.deepEqual(draft.gates[NEXT_UP_TILE_ID], { start: "05:30", end: "06:30" });
  const removed = removeFromDraft(draft, NEXT_UP_TILE_ID);
  assert.deepEqual(removed.items, ["today"]);
  assert.deepEqual(removed.hidden, [NEXT_UP_TILE_ID]);
  const back = addRoutineTile({ ...draft, ...removed }, NEXT_UP_TILE_ID, "small");
  assert.ok(back.items.includes(NEXT_UP_TILE_ID));
  assert.equal(back.sizes[NEXT_UP_TILE_ID], "small");

  for (let i = 0; i < 6; i += 1) draft = addRoutineTile(draft, routineItemTileId(`sample-item-${i}`), "small");
  const routineIds = draft.items.filter(isRoutineTileId);
  assert.equal(routineIds.length, 7);
  assert.equal(ROUTINE_TILE_STACK_CAP, 5);
  assert.equal(clampRoutineTileStack(routineIds).length, 5);
  assert.equal(clampRoutineTileStack(routineIds).includes(routineItemTileId("sample-item-5")), false);
  assert.equal(routineStacksEnabled(), false);
  assert.equal(routineTilePreview(), null);
  assert.equal(routineTileDropEffect(), "reorder");

  const html = renderHomeWidgets({ items: draft.items, hidden: [], sizes: draft.sizes }, { routinesState: state, date: MORNING, day: "2026-11-20" });
  routineIds.forEach((id) => assert.match(html, new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
  assert.doesNotMatch(html, /data-stack|rt-stack|rt-pages/);

  app.ui = { routineTrayQuery: "night", sd: { q: "gallery" } };
  assert.match(routineTrayHTML(draft, state), /value="night"/);
  forgetRoutineTrayQuery();
  assert.equal(app.ui.routineTrayQuery, "");
  assert.equal(app.ui.sd.q, "gallery");
  assert.match(routineTrayHTML({ items: [] }, state), /value=""/);
  assert.match(routineTrayHTML({ items: [] }, state), /Search tiles/);
  assert.doesNotMatch(routineTrayHTML({ items: [] }, state), /data-stack/);

  const saved = { layout: { homeV2: { v: 2, items: ["today", "future-widget"], hidden: [], updatedAt: 1 } } };
  commitHomeEditor(saved, draft);
  assert.equal(saved.layout.homeV2.routineGates[NEXT_UP_TILE_ID].start, "05:30");
  assert.ok(saved.layout.homeV2.items.includes("today"));
  assert.ok(saved.layout.homeV2.items.includes(routineItemTileId("sample-item-5")));
  assert.ok(saved.layout.homeV2.items.includes("future-widget"));
  const known = commitHomeEditor(saved, { items: ["today"], hidden: [NEXT_UP_TILE_ID], sizes: {}, gates: {} });
  assert.equal(known.items.includes(NEXT_UP_TILE_ID), false);
  assert.ok(known.hidden.includes(NEXT_UP_TILE_ID));
  assert.ok(known.items.includes("future-widget"));
});

test("removing a tile returns it to the tray and does not delete the routine", () => {
  app.ROUTINES_ENABLED = true;
  app.session = { user: { id: "synthetic-user" } };
  app.today = () => "2026-11-20";
  const state = sampleState();
  assert.equal(hideLegacyNextUp(state), true);
  assert.equal(state.dailyRoutines.prefs.homeNextHidden, true);
  assert.equal(legacyNextUpWanted(state), false);
  assert.equal(state.dailyRoutines.blocks.length, 2);
  showLegacyNextUp(state);
  assert.equal(state.dailyRoutines.prefs.homeNextHidden, false);
  assert.equal(legacyNextUpWanted(state), true);

  const pending = sampleState();
  app.sb = {};
  app.cloudPullOk = false;
  app.ui = {};
  let pendingSaves = 0;
  app.save = () => { pendingSaves += 1; };
  hideLegacyNextUp(pending);
  assert.equal(pending.dailyRoutines.prefs.homeNextHidden, undefined);
  assert.equal(pendingSaves, 0);
  assert.equal(app.ui.homeNextHidden, true);
  assert.equal(legacyNextUpWanted(pending), false);

  const live = sampleState();
  app.sb = null;
  app.cloudPullOk = null;
  app.state = live;
  let liveSaves = 0;
  app.save = () => { liveSaves += 1; };
  hideLegacyNextUp(live);
  assert.equal(live.dailyRoutines.prefs.homeNextHidden, true);
  assert.equal(liveSaves, 1);

  const pulses = [];
  const nav = globalThis.navigator;
  const previousVibrate = nav && nav.vibrate;
  if (nav) Object.defineProperty(nav, "vibrate", { configurable: true, writable: true, value: (value) => { pulses.push(value); } });
  routineHaptic();
  assert.deepEqual(pulses, [10]);
  if (nav) Object.defineProperty(nav, "vibrate", { configurable: true, writable: true, value: previousVibrate });

  const previousWindow = globalThis.window;
  globalThis.window = { matchMedia: () => ({ matches: true }) };
  assert.equal(routineMotionOn(), false);
  assert.equal(trayHeightAfterDrag(220, -80, { reduce: true }), 280);
  assert.equal(trayHeightAfterDrag(220, 80, { reduce: true }), 64);
  globalThis.window = previousWindow;
  assert.equal(trayHeightAfterDrag(220, -30, { reduce: false }), 250);
  assert.equal(addToDraft({ items: [], hidden: [], sizes: {} }, NEXT_UP_TILE_ID, "medium").items.length, 0);
});

test("a Home made only of routine tiles survives save, sync, and reload", () => {
  app.ROUTINES_ENABLED = true;
  const saved = { layout: { homeV2: { v: 2, items: ["today"], hidden: [], updatedAt: 20 } } };
  commitHomeEditor(saved, { items: ["routine-block:block-m", "routine-item:item-a"], hidden: [], sizes: {}, gates: {} });
  assert.deepEqual(saved.layout.homeV2.items, ["routine-block:block-m", "routine-item:item-a"]);
  assert.equal(saved.layout.homeV2.migrated, undefined);

  const older = { homeV2: { v: 2, items: ["today"], hidden: [], updatedAt: 10 } };
  const synced = pickHomeV2(saved.layout, older, 1000);
  assert.deepEqual(synced.items, ["routine-block:block-m", "routine-item:item-a"]);
  const unknownOnly = pickHomeV2(
    { homeV2: { v: 2, items: ["today"], hidden: [], updatedAt: 5 } },
    { homeV2: { v: 2, items: ["future-widget"], hidden: [], updatedAt: 90 } },
    1000,
  );
  assert.deepEqual(unknownOnly.items, ["today"]);

  const reloaded = {
    settingsAt: 500,
    brief: { order: ["weight"], hidden: [], updatedAt: 400 },
    layout: {
      home: { order: ["today", "brief"], hidden: [], updatedAt: 400 },
      homeV2: { v: 2, items: ["routine-block:block-m"], hidden: [], updatedAt: 80 },
    },
  };
  applyHomeMigration(reloaded, 1000);
  assert.deepEqual(reloaded.layout.homeV2.items, ["routine-block:block-m"]);
  assert.equal(reloaded.layout.homeV2.updatedAt, 80);
  assert.equal(reloaded.layout.homeV2.migrated, undefined);

  app.ROUTINES_ENABLED = false;
  const parked = {
    layout: { homeV2: { v: 2, items: ["routine-next"], hidden: [], updatedAt: 70 } },
  };
  applyHomeMigration(parked, 1000);
  assert.deepEqual(parked.layout.homeV2.items, ["routine-next"]);
});

test("a hidden Next up tile is not seeded onto a later Home edit", () => {
  app.ROUTINES_ENABLED = true;
  const state = {
    dailyRoutines: { prefs: { homeNextHidden: true, updatedAt: 3 } },
    layout: { homeV2: { v: 2, items: ["today", "cardio"], hidden: ["steps"], updatedAt: 50, sizes: { today: "small" } } },
  };
  applyHomeMigration(state, 5000);
  assert.deepEqual(state.layout.homeV2.items, ["today", "cardio"]);
  assert.deepEqual(state.layout.homeV2.hidden, ["steps"]);
  assert.equal(state.layout.homeV2.updatedAt, 50);
  assert.equal(state.layout.homeV2.sizes.today, "small");
  assert.equal(state.layout.homeV2.routineNextSeeded, true);
  assert.equal(state.layout.homeV2.routineNextAside, undefined);
  seedRoutineNextUp(state);
  assert.deepEqual(state.layout.homeV2.items, ["today", "cardio"]);
});

test("a tile jump opens a collapsed routine before the tab renders", () => {
  app.ROUTINES_ENABLED = true;
  app.session = { user: { id: "synthetic-user" } };
  app.today = () => "2026-11-20";
  const state = sampleState();
  state.dailyRoutines.prefs.collapsedBlocks = ["block-m", "block-n"];
  state.dailyRoutines.logs.push({
    id: "log-b", itemId: "item-b", compoundId: "compound-a", day: "2026-11-20", status: "done",
    amount: 250, unit: "mcg", at: 10, updatedAt: 10, deletedAt: null,
  });
  app.state = state;
  const seen = [];
  let saves = 0;
  app.save = () => { saves += 1; };
  app.goTab = () => { seen.push({
    collapsed: state.dailyRoutines.prefs.collapsedBlocks.slice(),
    revealed: (state.dailyRoutines.prefs.revealBlocks || []).slice(),
  }); };
  assert.equal(openRoutineTile(routineItemTileId("item-a")), true);
  assert.deepEqual(seen, [{ collapsed: ["block-n"], revealed: [] }]);
  assert.equal(saves, 1);

  openRoutineTile(routineItemTileId("item-b"));
  assert.deepEqual(seen[1].collapsed, []);
  assert.deepEqual(seen[1].revealed, ["block-n"]);
  assert.equal(saves, 2);

  const again = saves;
  openRoutineTile(routineItemTileId("item-a"));
  assert.equal(saves, again);

  app.sb = {};
  app.cloudPullOk = false;
  state.dailyRoutines.prefs.collapsedBlocks = ["block-m"];
  openRoutineTile(NEXT_UP_TILE_ID);
  assert.deepEqual(state.dailyRoutines.prefs.collapsedBlocks, ["block-m"]);
  assert.equal(saves, again);
});

test("a tile jump scrolls the routine row, not the Home log button", () => {
  app.ROUTINES_ENABLED = true;
  app.session = { user: { id: "synthetic-user" } };
  app.today = () => "2026-11-20";
  app.state = sampleState();
  app.goTab = () => {};
  const scrolled = [];
  const pane = {
    querySelector(selector) {
      scrolled.push(selector);
      return { scrollIntoView() { scrolled.push("pane"); } };
    },
  };
  const previous = globalThis.document;
  globalThis.document = {
    querySelector(selector) {
      if (selector === "#pane-daily-routines") return pane;
      if (selector.includes("item-a")) scrolled.push("home");
      return null;
    },
  };
  try {
    assert.equal(openRoutineTile(routineItemTileId("item-a")), true);
    assert.deepEqual(scrolled, [`.dr-row[data-item-id="item-a"], .dr-pep[data-item-id="item-a"]`, "pane"]);
  } finally {
    globalThis.document = previous;
  }
});

test("gated Home tiles recheck a pinned clock while Home stays open", () => {
  const layout = {
    v: 2,
    items: [NEXT_UP_TILE_ID, "today"],
    hidden: [],
    routineGates: { [NEXT_UP_TILE_ID]: { start: "05:30", end: "06:30" } },
  };
  const at = (hour, minute) => new Date(2026, 10, 20, hour, minute);
  const open = routineGateRefresh(null, layout, at(6, 0));
  assert.equal(open.changed, false);
  assert.equal(open.signature, NEXT_UP_TILE_ID);
  const still = routineGateRefresh(open.signature, layout, at(6, 29));
  assert.equal(still.changed, false);
  const closed = routineGateRefresh(still.signature, layout, at(6, 30));
  assert.equal(closed.changed, true);
  assert.equal(closed.signature, "");
  const again = routineGateRefresh(closed.signature, layout, at(6, 45));
  assert.equal(again.changed, false);
  const reopened = routineGateRefresh(again.signature, layout, at(5, 30));
  assert.equal(reopened.changed, true);
  assert.equal(reopened.signature, NEXT_UP_TILE_ID);
  const overnight = routineGateRefresh("", { ...layout, routineGates: { [NEXT_UP_TILE_ID]: { start: "22:00", end: "06:30" } } }, at(22, 0));
  assert.equal(overnight.changed, true);
  assert.equal(overnight.signature, NEXT_UP_TILE_ID);

  app.ROUTINES_ENABLED = true;
  app.ui = { tab: "home" };
  app.state = { layout: { homeV2: layout } };
  app.routineGateShown = undefined;
  let renders = 0;
  app.render = () => { renders += 1; };
  app.routineNow = () => at(6, 0);
  assert.equal(refreshHomeRoutineGates(), false);
  assert.equal(renders, 0);
  app.routineNow = () => at(6, 30);
  assert.equal(refreshHomeRoutineGates(), true);
  assert.equal(renders, 1);
  app.routineNow = () => at(6, 31);
  assert.equal(refreshHomeRoutineGates(), false);
  assert.equal(renders, 1);
  app.ui.tab = "food";
  app.routineNow = () => at(5, 30);
  assert.equal(refreshHomeRoutineGates(), false);
  assert.equal(renders, 1);
  app.ROUTINES_ENABLED = false;
  app.ui.tab = "home";
  app.routineNow = () => at(6, 0);
  assert.equal(refreshHomeRoutineGates(), false);
  assert.equal(renders, 1);
  const timer = readFileSync(new URL("../logger/js/shell/timer.js", import.meta.url), "utf8");
  assert.match(timer, /refreshHomeRoutineGates/);
  const sw = readFileSync(new URL("../logger/sw.js", import.meta.url), "utf8");
  const sentry = readFileSync(new URL("../logger/js/sentry.js", import.meta.url), "utf8");
  assert.match(sw, /const CACHE = "insight-shell-v88"/);
  assert.match(sentry, /insight-shell-v88/);
  app.routineNow = undefined;
  app.routineGateShown = undefined;
  app.render = undefined;
});

test("stacks and the long-press preview are not wired, and the shell cache is unchanged", () => {
  const root = new URL("../logger/", import.meta.url);
  const read = (path) => readFileSync(new URL(path, root), "utf8");
  for (const path of ["js/shared/home-drag.js", "js/shared/home-edit.js", "js/shared/home-widgets.js", "js/shared/home-migrate.js", "js/pages/home.js"]) {
    const src = read(path);
    assert.equal(src.includes("clampRoutineTileStack"), false, path);
    assert.equal(src.includes("routineTilePreview"), false, path);
    assert.doesNotMatch(src, /data-stack|tile-preview/);
  }
  const tiles = read("js/shared/routine-home-tiles.js");
  assert.equal(tiles.includes("routines-flag"), false);
  assert.equal(tiles.includes("localStorage"), false);
  assert.equal(tiles.includes("clampRoutineTileStack("), true);
  const actions = read("js/shell/actions.js");
  assert.match(actions, /case "routine-tray-add"/);
  assert.match(actions, /case "routine-tile-open"/);
  assert.match(actions, /case "routine-tile-hide"/);
  const sw = read("sw.js");
  const sentry = read("js/sentry.js");
  assert.match(sw, /const CACHE = "insight-shell-v88"/);
  assert.match(sentry, /insight-shell-v88/);
  assert.match(sw, /js\/shared\/routine-home-tiles\.js/);
});

test("flag on, removing the last catalog tile leaves a routine-only Home that survives a pull", () => {
  app.ROUTINES_ENABLED = true;
  const block = routineBlockTileId("block-m");
  const item = routineItemTileId("item-b");
  const state = { layout: { homeV2: { v: 2, items: ["today", block, item], hidden: [], updatedAt: 10, routineNextSeeded: true } } };
  let draft = { items: ["today", block, item], hidden: [], sizes: {}, gates: {} };
  draft = { ...draft, ...removeFromDraft(draft, "today") };
  assert.deepEqual(draft.items, [block, item]);
  assert.deepEqual(draft.hidden, ["today"]);
  assert.deepEqual(addRoutineTile({ items: [], hidden: [], sizes: {} }, NEXT_UP_TILE_ID).items, [NEXT_UP_TILE_ID]);
  const saved = commitHomeEditor(state, draft);
  assert.deepEqual(saved.items, [block, item]);
  assert.ok(saved.hidden.includes("today"));
  const at = state.layout.homeV2.updatedAt;
  assert.ok(at > 10);

  const remote = { homeV2: { v: 2, items: ["today", "cardio"], hidden: [], updatedAt: 10 } };
  const picked = pickHomeV2(state.layout, remote, at + 1);
  assert.deepEqual(picked.items, [block, item]);
  assert.equal(picked.updatedAt, at);

  const reloaded = structuredClone({ layout: { ...state.layout, homeV2: picked } });
  applyHomeMigration(reloaded, at + 2);
  assert.deepEqual(reloaded.layout.homeV2.items, [block, item]);
  assert.equal(reloaded.layout.homeV2.updatedAt, at);

  app.ROUTINES_ENABLED = false;
  assert.deepEqual(removeFromDraft({ items: ["today", item], hidden: [], sizes: {} }, "today").items, []);
});

test("flag on, Next up removed through the routines pref is not seeded back", () => {
  app.ROUTINES_ENABLED = true;
  const state = { ...editState(), dailyRoutines: { ...sampleStore(), prefs: { lastBlockId: null, homeNextHidden: true, updatedAt: 20 } } };
  applyHomeMigration(state, 5000);
  assert.deepEqual(state.layout.homeV2.items, ["today", "cardio"]);
  assert.equal(state.layout.homeV2.routineNextSeeded, true);
  assert.equal(state.layout.homeV2.updatedAt, 50);
  state.dailyRoutines.prefs.homeNextHidden = false;
  applyHomeMigration(state, 6000);
  assert.deepEqual(state.layout.homeV2.items, ["today", "cardio"]);

  app.ROUTINES_ENABLED = false;
  const off = { ...editState(), dailyRoutines: { ...sampleStore(), prefs: { homeNextHidden: true, updatedAt: 20 } } };
  const before = JSON.stringify(off);
  applyHomeMigration(off, 5000);
  assert.equal(JSON.stringify(off), before);
});
