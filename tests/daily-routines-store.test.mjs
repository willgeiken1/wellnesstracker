import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

/* Synthetic routines only. No real stack, no network. */
const memory = {};
globalThis.localStorage = {
  getItem: (key) => (Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null),
  setItem: (key, value) => { memory[key] = String(value); },
  removeItem: (key) => { delete memory[key]; },
};
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

const { app } = await import("../logger/js/runtime.js");
await import("../logger/js/data/state.js");
await import("../logger/js/shared/cloud.js");
await import("../logger/js/pages/privacy.js");
await import("../logger/js/shell/actions.js");
const {
  DEFAULT_ROUTINE_BLOCKS,
  clipText,
  emptyDailyRoutines,
  isLive,
  liveOf,
  mergeDailyRoutines,
  normalizeDailyRoutines,
  projectDailyRoutines,
  purgeDailyRoutineRange,
  revisePlanEntity,
  seedDefaultBlocks,
} = await import("../logger/js/shared/daily-routines-store.js");
const { logRoutineItem, undoRoutineLog } = await import("../logger/js/pages/daily-routines.js");
const { readFileSync } = await import("node:fs");
const { applyPurges, buildExportFiles, stripRange } = await import("../logger/js/shared/purge.js");

const USER = "11111111-1111-4111-8111-111111111111";

function signIn() {
  app.ROUTINES_ENABLED = true;
  app.session = { user: { id: USER } };
}

function signOut() {
  app.ROUTINES_ENABLED = false;
  app.session = null;
}

function compound(id, amount, updatedAt, extra = {}) {
  return {
    id, name: "Example Compound A", amount, unit: "mcg", startDate: "2026-11-01",
    archivedAt: null, updatedAt, deletedAt: null, ...extra,
  };
}

function log(id, day, amount, updatedAt, extra = {}) {
  return {
    id, itemId: "item-a", compoundId: "compound-a", day, status: "done",
    amount, unit: "mcg", at: updatedAt, updatedAt, deletedAt: null, ...extra,
  };
}

function item(id, name, updatedAt, extra = {}) {
  return { id, name, kind: "dose", compoundId: "compound-a", updatedAt, deletedAt: null, ...extra };
}

function phoneStore(items, logs = [], compounds = []) {
  return {
    updatedAt: 10,
    blocks: [{ id: "block-morning", name: "Morning routine", color: "citrus", order: 0, updatedAt: 10, deletedAt: null }],
    items,
    placements: [],
    compounds,
    logs,
    prefs: { lastBlockId: "block-morning", updatedAt: 10 },
  };
}

test("migrate does not invent dailyRoutines and the flag stays off", () => {
  assert.equal(app.ROUTINES_ENABLED, undefined);
  const migrated = app.migrate({ version: 2, sessions: [] });
  assert.equal(migrated.dailyRoutines, null);
  assert.equal(app.state.routines, undefined);
});

test("a signed-out session creates no dailyRoutines data", () => {
  app.ROUTINES_ENABLED = true;
  app.session = null;
  app.state.dailyRoutines = null;
  const wrote = app.putDailyRoutines(app.state, phoneStore([item("item-a", "Example Compound A", 10)]));
  assert.equal(wrote, false);
  assert.equal(app.state.dailyRoutines, null);
  signOut();
});

test("the flag off creates no dailyRoutines data even when signed in", () => {
  app.ROUTINES_ENABLED = false;
  app.session = { user: { id: USER } };
  app.state.dailyRoutines = null;
  assert.equal(app.putDailyRoutines(app.state, phoneStore([item("item-a", "Example Compound A", 10)])), false);
  assert.equal(app.state.dailyRoutines, null);
  signOut();
});

test("a synthetic log survives reload, including a quarter dose", () => {
  signIn();
  try {
    const store = phoneStore(
      [item("item-a", "Example Compound A", 10)],
      [log("log-1", "2026-11-19", 250, 10), log("log-quarter", "2026-11-19", 0.25, 11, { status: "partial" })],
      [compound("compound-a", 250, 10)],
    );
    assert.equal(app.putDailyRoutines(app.state, store), true);
    app.save();
    const raw = JSON.parse(localStorage.getItem(app.KEY));
    const again = app.migrate(raw);
    const kept = again.dailyRoutines.logs.find((row) => row.id === "log-1");
    const quarter = again.dailyRoutines.logs.find((row) => row.id === "log-quarter");
    assert.equal(kept.amount, 250);
    assert.equal(kept.unit, "mcg");
    assert.equal(kept.day, "2026-11-19");
    assert.equal(again.dailyRoutines.compounds[0].name, "Example Compound A");
    assert.equal(quarter.amount, 0.25);
    assert.equal(quarter.status, "partial");
    assert.equal(app.userDataBlob().dailyRoutines.logs.find((row) => row.id === "log-1").amount, 250);
  } finally {
    signOut();
  }
});

test("merge keeps items created on two phones", () => {
  const local = phoneStore([item("item-a", "Example Compound A", 10)]);
  const remote = phoneStore([item("item-b", "Example Compound B", 12, { compoundId: null, kind: "check" })]);
  const merged = mergeDailyRoutines(local, remote);
  assert.deepEqual(liveOf(merged.items).map((row) => row.id).sort(), ["item-a", "item-b"]);
  app.state.dailyRoutines = local;
  app.mergeRemote({ dailyRoutines: remote });
  assert.deepEqual(liveOf(app.state.dailyRoutines.items).map((row) => row.id).sort(), ["item-a", "item-b"]);
});

const TOMBSTONE_KEYS = ["day", "deletedAt", "id", "status", "updatedAt"];

function assertBareTombstone(log) {
  assert.deepEqual(Object.keys(log).sort(), TOMBSTONE_KEYS);
  for (const key of ["amount", "unit", "compoundId", "itemId", "at", "note"]) {
    assert.equal(Object.prototype.hasOwnProperty.call(log, key), false, key);
  }
}

test("two phones converge on an equal stamp, a tombstone, and a missing stamp", () => {
  const now = 1_700_000_000_000;
  const alpha = phoneStore([item("item-a", "Alpha", 10)]);
  const zulu = phoneStore([item("item-a", "Zulu", 10)]);
  const left = mergeDailyRoutines(alpha, zulu, now);
  const right = mergeDailyRoutines(zulu, alpha, now);
  assert.equal(left.items[0].name, right.items[0].name);
  const live = phoneStore([item("item-a", "Zulu", 40)]);
  const dead = phoneStore([item("item-a", "Alpha", 40, { deletedAt: 40 })]);
  assert.equal(isLive(mergeDailyRoutines(live, dead, now).items[0]), false);
  assert.equal(isLive(mergeDailyRoutines(dead, live, now).items[0]), false);
  const missing = phoneStore([item("item-a", "Alpha", 0)]);
  delete missing.items[0].updatedAt;
  const malformed = phoneStore([item("item-a", "Zulu", 0)]);
  malformed.items[0].updatedAt = "yesterday";
  const one = mergeDailyRoutines(missing, malformed, now);
  const two = mergeDailyRoutines(malformed, missing, now);
  assert.equal(one.items[0].name, two.items[0].name);
  assert.equal(one.items[0].updatedAt, 0);
  const prefsA = phoneStore([]);
  const prefsB = phoneStore([]);
  prefsA.prefs = { lastBlockId: "morning", updatedAt: 10 };
  prefsB.prefs = { lastBlockId: "night", updatedAt: 10 };
  assert.equal(mergeDailyRoutines(prefsA, prefsB, now).prefs.lastBlockId, mergeDailyRoutines(prefsB, prefsA, now).prefs.lastBlockId);
});

test("a remote tombstone beats an older local log, and deletedAt counts even when updatedAt is older", () => {
  const now = 1_700_000_000_000;
  const local = phoneStore([], [log("log-1", "2026-11-01", 250, 10, { note: "keep me" })]);
  const remote = phoneStore([], [log("log-1", "2026-11-01", 250, 50, { deletedAt: 50, note: "gone", compoundId: "compound-a", itemId: "item-a" })]);
  const merged = mergeDailyRoutines(local, remote, now);
  assertBareTombstone(merged.logs[0]);
  const staleDelete = phoneStore([], [log("log-1", "2026-11-01", 250, 10, { deletedAt: 100 })]);
  const newerLive = phoneStore([], [log("log-1", "2026-11-01", 500, 50)]);
  const keptGone = mergeDailyRoutines(newerLive, staleDelete, now);
  assert.equal(isLive(keptGone.logs[0]), false);
  assert.equal(keptGone.logs[0].updatedAt, 100);
});

test("a duplicate id in one list resolves the same way in either order", () => {
  const now = 1_700_000_000_000;
  const first = log("log-1", "2026-11-01", 250, 5);
  const second = log("log-1", "2026-11-01", 125, 5);
  const forward = normalizeDailyRoutines(phoneStore([], [first, second]), now);
  const backward = normalizeDailyRoutines(phoneStore([], [second, first]), now);
  assert.equal(forward.logs.length, 1);
  assert.equal(forward.logs[0].amount, backward.logs[0].amount);
});

test("a stamp more than a day ahead is pulled back", () => {
  const now = 1_700_000_000_000;
  const future = phoneStore([item("item-a", "Example Compound A", now + 10 * 86400000)]);
  const other = phoneStore([item("item-a", "Other", now)]);
  const merged = mergeDailyRoutines(future, other, now);
  assert.equal(merged.items[0].updatedAt, now + 86400000);
  assert.equal(merged.items[0].name, "Example Compound A");
  assert.equal(mergeDailyRoutines(other, future, now).items[0].name, "Example Compound A");
});

test("a missing remote store does not wipe local routines", () => {
  const local = phoneStore([item("item-a", "Example Compound A", 10)], [log("log-1", "2026-11-19", 250, 10)]);
  app.state.dailyRoutines = normalizeDailyRoutines(local);
  app.mergeRemote({});
  assert.equal(app.state.dailyRoutines.logs[0].id, "log-1");
  app.mergeRemote({ dailyRoutines: null });
  assert.equal(app.state.dailyRoutines.logs[0].amount, 250);
});

test("a tombstone stays gone when an older live copy is merged", () => {
  const local = phoneStore([item("item-a", "Example Compound A", 50, { deletedAt: 50 })]);
  const remote = phoneStore([item("item-a", "Example Compound A", 10)]);
  const merged = mergeDailyRoutines(local, remote);
  assert.equal(isLive(merged.items[0]), false);
  assert.equal(merged.items[0].deletedAt, 50);
  assert.equal(projectDailyRoutines(merged).items.length, 0);
  const again = mergeDailyRoutines(merged, remote);
  assert.equal(isLive(again.items[0]), false);
});

test("a newer edit brings back a tombstoned row", () => {
  const local = phoneStore([item("item-a", "Example Compound A", 80)]);
  const remote = phoneStore([item("item-a", "Example Compound A", 50, { deletedAt: 50 })]);
  const merged = mergeDailyRoutines(local, remote);
  assert.equal(isLive(merged.items[0]), true);
  assert.equal(merged.items[0].name, "Example Compound A");
});

test("a date-range purge tombstones only that day's logs", () => {
  const data = {
    sessions: [{ id: "workout-1", date: "2026-11-02", entries: [] }],
    dailyRoutines: phoneStore(
      [item("item-a", "Example Compound A", 10)],
      [
        log("log-day-1", "2026-11-01", 250, 10),
        log("log-day-2", "2026-11-02", 250, 20),
        log("log-after", "2026-11-01", 125, 5000),
      ],
      [compound("compound-a", 250, 10)],
    ),
  };
  assert.equal(stripRange(data, "2026-11-01", "2026-11-01", { before: 4000, now: 6000 }), true);
  const byId = Object.fromEntries(data.dailyRoutines.logs.map((row) => [row.id, row]));
  assert.equal(byId["log-day-1"].deletedAt, 4000);
  assertBareTombstone(byId["log-day-1"]);
  assert.equal(isLive(byId["log-day-2"]), true);
  assert.equal(byId["log-day-2"].amount, 250);
  assert.equal(isLive(byId["log-after"]), true);
  assert.equal(data.dailyRoutines.blocks[0].name, "Morning routine");
  assert.equal(data.dailyRoutines.compounds[0].amount, 250);
  assert.equal(data.sessions.length, 1);
  assert.equal(stripRange(data, "2026-11-01", "2026-11-01", { before: 4000, now: 6000 }), false);
});

test("an earlier range delete does not strip a later undone log", () => {
  const undone = log("log-undo", "2026-11-01", 250, 1000, {
    note: "extra dose note",
    deletedAt: 5000,
    updatedAt: 5000,
    undone: true,
  });
  const data = { dailyRoutines: phoneStore([], [undone]) };
  assert.equal(purgeDailyRoutineRange(data, "2026-11-01", "2026-11-01", 3000, 8000), false);
  assert.equal(data.dailyRoutines.logs[0].amount, 250);
  assert.equal(data.dailyRoutines.logs[0].unit, "mcg");
  assert.equal(data.dailyRoutines.logs[0].note, "extra dose note");
  assert.equal(data.dailyRoutines.logs[0].undone, true);

  const earlier = log("log-early", "2026-11-01", 250, 1000, {
    note: "extra dose note",
    deletedAt: 2000,
    updatedAt: 2000,
    undone: true,
  });
  const old = { dailyRoutines: phoneStore([], [earlier]) };
  assert.equal(purgeDailyRoutineRange(old, "2026-11-01", "2026-11-01", 3000, 8000), true);
  assert.deepEqual(Object.keys(old.dailyRoutines.logs[0]).sort(), ["day", "deletedAt", "id", "status", "updatedAt"]);

  const stripUrl = new URL("../supabase/functions/_shared/strip.ts", import.meta.url).href;
  const script = `
    import { stripRange } from ${JSON.stringify(stripUrl)};
    const kept = stripRange(${JSON.stringify({ sessions: [], dailyRoutines: phoneStore([], [undone]) })}, "2026-11-01", "2026-11-01", 3000, 8000);
    const stripped = stripRange(${JSON.stringify({ sessions: [], dailyRoutines: phoneStore([], [earlier]) })}, "2026-11-01", "2026-11-01", 3000, 8000);
    console.log(JSON.stringify({
      kept: kept.dailyRoutines.logs[0],
      stripped: Object.keys(stripped.dailyRoutines.logs[0]).sort(),
    }));
  `;
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout.trim().split("\n").pop());
  assert.equal(parsed.kept.amount, 250);
  assert.equal(parsed.kept.note, "extra dose note");
  assert.deepEqual(parsed.stripped, ["day", "deletedAt", "id", "status", "updatedAt"]);
});

test("a purged log is not restored by merging the other phone's older copy", () => {
  const data = {
    sessions: [],
    dailyRoutines: phoneStore([], [log("log-day-1", "2026-11-01", 250, 10), log("log-day-2", "2026-11-02", 250, 20)]),
  };
  stripRange(data, "2026-11-01", "2026-11-01", { now: 4000 });
  const remote = phoneStore([], [log("log-day-1", "2026-11-01", 250, 10), log("log-day-2", "2026-11-02", 250, 20)]);
  const merged = mergeDailyRoutines(data.dailyRoutines, remote);
  const purged = merged.logs.find((row) => row.id === "log-day-1");
  const kept = merged.logs.find((row) => row.id === "log-day-2");
  assertBareTombstone(purged);
  assert.equal(isLive(purged), false);
  assert.ok(purged.deletedAt > 0);
  assert.equal(isLive(kept), true);
  assert.equal(kept.amount, 250);
});

test("applyPurges tombstones only the purged day", () => {
  const data = {
    sessions: [],
    purges: [{ from: "2026-11-01", to: "2026-11-01", at: 4000, deletedAt: 4000 }],
    dailyRoutines: phoneStore([], [log("log-day-1", "2026-11-01", 250, 10), log("log-day-2", "2026-11-02", 500, 20)]),
  };
  applyPurges(data, 6000);
  const byId = Object.fromEntries(data.dailyRoutines.logs.map((row) => [row.id, row]));
  assert.equal(isLive(byId["log-day-1"]), false);
  assert.equal(isLive(byId["log-day-2"]), true);
  assert.equal(byId["log-day-2"].amount, 500);
  assert.equal(data.purges.length, 1);
});

test("a plan edit does not rewrite an existing log", () => {
  const store = phoneStore(
    [item("item-a", "Example Compound A", 10)],
    [log("log-1", "2026-11-01", 250, 10)],
    [compound("compound-a", 250, 10)],
  );
  const beforeLog = JSON.parse(JSON.stringify(store.logs[0]));
  const revised = revisePlanEntity(store, "compounds", "compound-a", { amount: 500, logs: [{ amount: 1 }] }, 90);
  assert.equal(revised.compounds[0].amount, 500);
  assert.equal(revised.compounds[0].updatedAt, 90);
  assert.deepEqual(revised.logs[0], beforeLog);
  const otherPhone = phoneStore(
    [item("item-a", "Example Compound A", 10)],
    [log("log-1", "2026-11-01", 250, 10)],
    [compound("compound-a", 250, 10)],
  );
  const merged = mergeDailyRoutines(revised, otherPhone);
  assert.equal(merged.compounds[0].amount, 500);
  assert.equal(merged.logs[0].amount, 250);
  assert.equal(merged.logs[0].updatedAt, 10);
});

test("backup and restore round-trip dailyRoutines and still leave check-ins out", async () => {
  signIn();
  const previousShare = globalThis.navigator;
  try {
    app.state.dailyRoutines = null;
    assert.equal(app.putDailyRoutines(app.state, phoneStore(
      [item("item-a", "Example Compound A", 10)],
      [log("log-1", "2026-11-19", 250, 10)],
      [compound("compound-a", 250, 10)],
    )), true);
    app.state.checkins = { secret: "excluded fixture" };
    app.render = () => {};
    let captured;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { canShare: () => true, share: async ({ files }) => { captured = JSON.parse(await files[0].text()); } },
    });
    await app.exportData();
    assert.equal(captured.dailyRoutines.logs[0].amount, 250);
    assert.equal(captured.dailyRoutines.compounds[0].name, "Example Compound A");
    assert.equal(Object.hasOwn(captured, "checkins"), false);
    const restored = app.migrate(captured);
    assert.equal(restored.dailyRoutines.logs[0].day, "2026-11-19");
    assert.equal(restored.dailyRoutines.logs[0].unit, "mcg");
  } finally {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: previousShare });
    signOut();
  }
});

test("default blocks are the three routine sections and are not seeded by migrate", () => {
  assert.deepEqual(DEFAULT_ROUTINE_BLOCKS.map((block) => block.name), [
    "Morning routine",
    "Supplement & enhancer stack",
    "Night routine",
  ]);
  assert.equal(DEFAULT_ROUTINE_BLOCKS.some((block) => /check-?in/i.test(block.name)), false);
  const seeded = seedDefaultBlocks(emptyDailyRoutines(5), 5);
  assert.deepEqual(seeded.blocks.map((block) => block.name), DEFAULT_ROUTINE_BLOCKS.map((block) => block.name));
  assert.equal(seedDefaultBlocks(seeded, 9).blocks.length, 3);
  assert.equal(app.migrate({ version: 2, sessions: [] }).dailyRoutines, null);
});

test("reseeding after a non-default block is deleted keeps that tombstone", () => {
  const deleted = emptyDailyRoutines(10);
  deleted.blocks = [{
    id: "block-old", name: "Morning routine", color: "citrus", order: 0, updatedAt: 20, deletedAt: 20,
  }];
  deleted.updatedAt = 20;
  const seeded = seedDefaultBlocks(deleted, 30);
  assert.equal(seeded.blocks.find((row) => row.id === "block-old").deletedAt, 20);
  assert.equal(liveOf(seeded.blocks).length, 3);
  const stale = emptyDailyRoutines(10);
  stale.blocks = [{
    id: "block-old", name: "Morning routine", color: "citrus", order: 0, updatedAt: 10, deletedAt: null,
  }];
  const merged = mergeDailyRoutines(seeded, stale, 40);
  const old = merged.blocks.find((row) => row.id === "block-old");
  assert.equal(isLive(old), false);
  assert.equal(old.deletedAt, 20);
  assert.equal(liveOf(merged.blocks).length, 3);
});

test("two empty phones that seed at different times merge into one set of default blocks", () => {
  const phoneA = seedDefaultBlocks(emptyDailyRoutines(0), 1_000);
  const phoneB = seedDefaultBlocks(emptyDailyRoutines(0), 9_000);
  const ids = DEFAULT_ROUTINE_BLOCKS.map((block) => block.id);
  assert.deepEqual(phoneA.blocks.map((block) => block.id), ids);
  assert.deepEqual(phoneB.blocks.map((block) => block.id), ids);
  for (const merged of [mergeDailyRoutines(phoneA, phoneB), mergeDailyRoutines(phoneB, phoneA)]) {
    const live = projectDailyRoutines(merged).blocks;
    assert.equal(live.length, 3);
    assert.deepEqual(live.map((block) => block.id), ids);
    assert.deepEqual(live.map((block) => block.name), DEFAULT_ROUTINE_BLOCKS.map((block) => block.name));
  }
});

test("a deleted or renamed default block is not undone by another phone's later seed", () => {
  const phoneA = seedDefaultBlocks(emptyDailyRoutines(0), 1_000);
  const night = DEFAULT_ROUTINE_BLOCKS[2].id;
  const morning = DEFAULT_ROUTINE_BLOCKS[0].id;
  const blockA = phoneA.blocks.find((block) => block.id === night);
  blockA.deletedAt = 2_000;
  blockA.updatedAt = 2_000;
  const renamed = revisePlanEntity(phoneA, "blocks", morning, { name: "Wake up" }, 2_500);
  const phoneB = seedDefaultBlocks(emptyDailyRoutines(0), 50_000);
  for (const merged of [mergeDailyRoutines(renamed, phoneB), mergeDailyRoutines(phoneB, renamed)]) {
    const live = projectDailyRoutines(merged).blocks;
    assert.equal(live.some((block) => block.id === night), false);
    assert.equal(live.find((block) => block.id === morning).name, "Wake up");
    assert.equal(live.length, 2);
  }
});

test("seeding never brings back a default block that was deleted", () => {
  const store = seedDefaultBlocks(emptyDailyRoutines(0), 1_000);
  for (const block of store.blocks) {
    block.deletedAt = 3_000;
    block.updatedAt = 3_000;
  }
  const again = seedDefaultBlocks(store, 9_000);
  assert.equal(liveOf(again.blocks).length, 0);
  assert.equal(again.blocks.length, 3);
  assert.equal(again.updatedAt, store.updatedAt);
  const custom = { id: "block-custom", name: "Example block", color: "citrus", order: 0, updatedAt: 4_000, deletedAt: null };
  const withCustom = seedDefaultBlocks({ ...emptyDailyRoutines(0), blocks: [custom] }, 9_000);
  assert.deepEqual(withCustom.blocks.map((block) => block.id), ["block-custom"]);
});

test("the edge strip tombstones the same day's dose log and leaves the plan", () => {
  const stripUrl = new URL("../supabase/functions/_shared/strip.ts", import.meta.url).href;
  const blob = {
    sessions: [],
    dailyRoutines: phoneStore(
      [item("item-a", "Example Compound A", 10)],
      [log("log-day-1", "2026-11-01", 250, 10), log("log-day-2", "2026-11-02", 250, 20)],
      [compound("compound-a", 250, 10)],
    ),
  };
  const script = `
    import { stripRange } from ${JSON.stringify(stripUrl)};
    const data = stripRange(${JSON.stringify(blob)}, "2026-11-01", "2026-11-01", 4000, 6000);
    const logs = Object.fromEntries(data.dailyRoutines.logs.map((row) => [row.id, row]));
    console.log(JSON.stringify({
      day1: logs["log-day-1"].deletedAt,
      day1Keys: Object.keys(logs["log-day-1"]).sort(),
      day2: logs["log-day-2"].deletedAt,
      amount: logs["log-day-2"].amount,
      storeAt: data.dailyRoutines.updatedAt,
      block: data.dailyRoutines.blocks[0].name,
      compound: data.dailyRoutines.compounds[0].amount,
    }));
  `;
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const got = JSON.parse(result.stdout.trim().split("\n").pop());
  assert.equal(got.day1, 4000);
  assert.deepEqual(got.day1Keys, ["day", "deletedAt", "id", "status", "updatedAt"]);
  assert.equal(got.storeAt, 4000);
  assert.equal(got.day2, null);
  assert.equal(got.amount, 250);
  assert.equal(got.block, "Morning routine");
  assert.equal(got.compound, 250);
});

test("a purged dose is absent locally, in the account blob, in the backup, and in the csv", async () => {
  signIn();
  const previousShare = globalThis.navigator;
  try {
    app.render = () => {};
    app.state.dailyRoutines = phoneStore([], [
      log("log-1", "2026-11-01", 250, 10, { note: "extra dose note", itemId: "item-a", compoundId: "compound-a" }),
    ]);
    assert.equal(stripRange(app.state, "2026-11-01", "2026-11-01", { now: 4000 }), true);
    assertBareTombstone(app.state.dailyRoutines.logs[0]);
    assertBareTombstone(app.userDataBlob().dailyRoutines.logs[0]);
    let captured;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { canShare: () => true, share: async ({ files }) => { captured = JSON.parse(await files[0].text()); } },
    });
    await app.exportData();
    assertBareTombstone(captured.dailyRoutines.logs[0]);
    const csv = buildExportFiles(app.state).find((file) => file.name === "daily_routine_logs.csv").text;
    assert.match(csv, /log-1,,,2026-11-01,done,,,,1970-01-01T00:00:04\.000Z/);
    assert.equal(csv.includes("250"), false);
    assert.equal(csv.includes("mcg"), false);
    assert.equal(csv.includes("item-a"), false);
  } finally {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: previousShare });
    signOut();
  }
});

test("undo keeps the amount, unit, and note, while a range delete and the server strip keep the tombstone keys", () => {
  const keys = ["day", "deletedAt", "id", "status", "updatedAt"];
  signIn();
  app.sb = null;
  app.cloudPullOk = true;
  app.save = () => {};
  app.today = () => "2026-11-19";
  app.routineNow = () => new Date(2026, 10, 19, 8, 30, 0);
  try {
    app.state.dailyRoutines = phoneStore([], [
      log("log-undo", "2026-11-19", 250, 10, { note: "extra dose note" }),
    ]);
    assert.equal(undoRoutineLog(app.state, "log-undo"), true);
    const undone = app.state.dailyRoutines.logs[0];
    assert.equal(undone.undone, true);
    assert.equal(undone.amount, 250);
    assert.equal(undone.unit, "mcg");
    assert.equal(undone.note, "extra dose note");
    assert.notDeepEqual(Object.keys(undone).sort(), keys);

    const range = {
      dailyRoutines: phoneStore([], [
        log("log-range", "2026-11-01", 250, 10, { note: "extra dose note" }),
      ]),
    };
    assert.equal(purgeDailyRoutineRange(range, "2026-11-01", "2026-11-01", null, 4000), true);
    assert.deepEqual(Object.keys(range.dailyRoutines.logs[0]).sort(), keys);
    assert.equal(range.dailyRoutines.logs[0].deletedAt, 4000);

    const stripUrl = new URL("../supabase/functions/_shared/strip.ts", import.meta.url).href;
    const blob = {
      sessions: [],
      dailyRoutines: phoneStore([], [
        log("log-server", "2026-11-01", 250, 10, { note: "extra dose note" }),
      ]),
    };
    const script = `
      import { stripRange } from ${JSON.stringify(stripUrl)};
      const data = stripRange(${JSON.stringify(blob)}, "2026-11-01", "2026-11-01", 4000, 6000);
      console.log(JSON.stringify(Object.keys(data.dailyRoutines.logs[0]).sort()));
    `;
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.deepEqual(JSON.parse(result.stdout.trim().split("\n").pop()), keys);
  } finally {
    signOut();
  }
});

test("undoing a log tombstones it without the dose", () => {
  const undone = app.tombstoneLog(phoneStore([], [
    log("log-1", "2026-11-19", 250, 10, { note: "extra dose note" }),
  ]), "log-1", 80);
  assertBareTombstone(undone.logs[0]);
  assert.equal(undone.logs[0].deletedAt, 80);
  assert.equal(undone.logs[0].status, "done");
});

test("the privacy preview counts a live routine log and skips a tombstone", () => {
  app.food = () => ({ days: {} });
  app.cardio = () => ({ sessions: [] });
  app.meas = () => ({});
  app.weighIns = () => [];
  app.state.sessions = [];
  app.state.plan = {};
  app.state.dailyRoutines = phoneStore([], [
    log("log-1", "2026-11-01", 250, 10),
    log("log-2", "2026-11-01", 250, 10, { id: "log-2", deletedAt: 20 }),
  ]);
  app.state.dailyRoutines.logs[1] = { id: "log-2", day: "2026-11-01", status: "done", updatedAt: 20, deletedAt: 20 };
  assert.match(app.rangePreviewText("2026-11-01", "2026-11-01"), /1 routine log/);
});

/* Emoji at the clip boundary. A cut through a surrogate pair leaves a lone surrogate, and Postgres jsonb
   rejects that escape, so every later push from the phone would fail. */
const THUMB = "\u{1F44D}";
const THUMB_TONE = "\u{1F44D}\u{1F3FD}";
const FAMILY = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}";
const FLAG = "\u{1F1FA}\u{1F1F8}";
const BOUNDARY_GLYPHS = [THUMB, THUMB_TONE, FAMILY, FLAG];

function wellFormedJson(value) {
  return JSON.stringify(value).isWellFormed() && !/\\ud[89ab][0-9a-f]{2}(?!\\ud[c-f])/i.test(JSON.stringify(value));
}

test("clipText never splits an emoji, a ZWJ sequence or a flag at the limit", () => {
  for (const glyph of BOUNDARY_GLYPHS) {
    for (let lead = 80 - glyph.length - 1; lead <= 80; lead += 1) {
      const text = `${"a".repeat(lead)}${glyph}tail`;
      const out = clipText(text, 80);
      assert.ok(out.length <= 80, `${lead}: length ${out.length}`);
      assert.ok(out.isWellFormed(), `${lead}: lone surrogate`);
      const keepsGlyph = lead + glyph.length <= 80;
      assert.equal(out.startsWith(`${"a".repeat(lead)}${glyph}`), keepsGlyph, `${lead}: whole glyph kept or dropped`);
      if (!keepsGlyph) assert.equal(out, "a".repeat(lead));
    }
  }
  assert.equal(clipText(`  ${"b".repeat(5)}  `, 80), "bbbbb");
  assert.equal(clipText(42, 80), "");
});

test("routine names, units and kinds with emoji at the limit stay well formed through normalize, reload and the account blob", () => {
  signIn();
  try {
    const longName = `${"a".repeat(79)}${FAMILY}`;
    const store = phoneStore(
      [item("item-a", longName, 10, { kind: `${"k".repeat(23)}${THUMB}` })],
      [log("log-1", "2026-11-19", 250, 10, { unit: `${"u".repeat(15)}${FLAG}` })],
      [compound("compound-a", 250, 10, { name: `${"c".repeat(79)}${THUMB_TONE}`, unit: `${"u".repeat(15)}${THUMB}` })],
    );
    store.blocks[0].name = `${"b".repeat(79)}${THUMB}`;
    store.blocks[0].color = `${"c".repeat(23)}${FLAG}`;
    assert.equal(app.putDailyRoutines(app.state, store), true);
    const saved = app.state.dailyRoutines;
    assert.equal(saved.blocks[0].name, "b".repeat(79));
    assert.equal(saved.blocks[0].color, "c".repeat(23));
    assert.equal(saved.items[0].name, "a".repeat(79));
    assert.equal(saved.items[0].kind, "k".repeat(23));
    assert.equal(saved.compounds[0].name, "c".repeat(79));
    assert.equal(saved.compounds[0].unit, "u".repeat(15));
    assert.equal(saved.logs[0].unit, "u".repeat(15));
    app.save();
    const again = app.migrate(JSON.parse(localStorage.getItem(app.KEY)));
    assert.ok(wellFormedJson(again.dailyRoutines));
    assert.ok(wellFormedJson(app.userDataBlob()));
  } finally {
    signOut();
  }
});

test("the policy names exactly the keys a real deleted dose log keeps, and no more", () => {
  signIn();
  app.sb = null;
  app.cloudPullOk = true;
  app.save = () => {};
  app.today = () => "2026-11-19";
  app.routineNow = () => new Date(2026, 10, 19, 8, 30, 0);
  try {
    app.state.dailyRoutines = phoneStore(
      [item("item-a", "Example Compound A", 10)],
      [log("log_item-a_2026-11-01", "2026-11-01", 250, 10, { note: "extra dose note" })],
      [compound("compound-a", 250, 10)],
    );
    assert.equal(logRoutineItem(app.state, "item-a"), true);
    const todayId = "log_item-a_2026-11-19";
    app.state.dailyRoutines.logs.find((row) => row.id === todayId).note = "extra dose note";
    assert.equal(undoRoutineLog(app.state, todayId), true);
    assert.equal(purgeDailyRoutineRange(app.state, "2026-11-01", "2026-11-01", null, 4000), true);
    const undone = app.state.dailyRoutines.logs.find((row) => row.id === todayId);
    const marker = app.state.dailyRoutines.logs.find((row) => row.id === "log_item-a_2026-11-01");
    assert.equal(undone.undone, true);
    assert.equal(undone.amount, 250);
    assert.equal(undone.unit, "mcg");
    assert.equal(undone.note, "extra dose note");
    assert.equal(marker.id.includes("item-a"), true, "the id still links to the item");

    // The marker's list of kept fields: id, day, status, deleted time. updatedAt is the same stamp.
    const POLICY_FIELDS = { id: /\bits id\b/, day: /\bthe day\b/, status: /\bits status\b/, deletedAt: /when it was deleted/, updatedAt: null };
    assert.deepEqual(Object.keys(POLICY_FIELDS).sort(), TOMBSTONE_KEYS);
    assert.deepEqual(Object.keys(marker).sort(), TOMBSTONE_KEYS);

    const root = new URL("..", import.meta.url);
    const aboutTxt = buildExportFiles(app.state).find((file) => file.name === "about.txt").text;
    const texts = {
      "privacy.md": readFileSync(new URL("privacy.md", root), "utf8"),
      "privacy.js": readFileSync(new URL("logger/js/pages/privacy.js", root), "utf8"),
      "about.txt": aboutTxt,
    };
    for (const [name, text] of Object.entries(texts)) {
      assert.doesNotMatch(text, /the unit, and the item (are|is) (removed|not)/, name);
      assert.doesNotMatch(text, /item (is|are) removed/, name);
      assert.match(text, /the unit, and the dose details are (removed|not in that row)/, name);
      assert.match(text, /links (it|the marker) to the (routine )?item/, name);
      for (const [key, re] of Object.entries(POLICY_FIELDS)) if (re) assert.match(text, re, `${name} names ${key}`);
    }
  } finally {
    signOut();
  }
});

test("a whole emoji that fits is kept", () => {
  const name = `${"a".repeat(80 - FAMILY.length)}${FAMILY}`;
  const normalized = normalizeDailyRoutines(phoneStore([item("item-a", name, 10)]));
  assert.equal(normalized.items[0].name, name);
});

test("a lone surrogate already stored by an older build is replaced before it can reach a push", () => {
  signIn();
  try {
    const broken = `${"a".repeat(79)}\uD83D`;
    const store = phoneStore([item("item-a", broken, 10, { note: "x\uDC4Dy", ["k\uD83D"]: "v" })]);
    store.blocks[0].name = `Morning \uD83D routine`;
    app.state.dailyRoutines = store;
    const blob = app.userDataBlob();
    assert.ok(wellFormedJson(blob));
    assert.equal(blob.dailyRoutines.blocks[0].name, "Morning \uFFFD routine");
    const normalized = normalizeDailyRoutines(store);
    assert.ok(wellFormedJson(normalized));
    assert.equal(normalized.items[0].name, `${"a".repeat(79)}\uFFFD`);
    assert.equal(normalized.items[0].note, "x\uFFFDy");
    assert.equal(normalized.items[0]["k\uFFFD"], "v");
    const merged = mergeDailyRoutines(normalizeDailyRoutines(phoneStore([])), store);
    assert.ok(wellFormedJson(merged));
  } finally {
    app.state.dailyRoutines = null;
    signOut();
  }
});

test("without Intl.Segmenter the clip still keeps whole code points", () => {
  const storeUrl = new URL("../logger/js/shared/daily-routines-store.js", import.meta.url).href;
  const script = `
    delete Intl.Segmenter;
    const { clipText } = await import(${JSON.stringify(storeUrl)});
    const out = [
      clipText("${"a".repeat(79)}\\u{1F44D}", 80),
      clipText("${"a".repeat(78)}\\u{1F1FA}\\u{1F1F8}", 80),
      clipText("${"a".repeat(77)}\\u{1F1FA}\\u{1F1F8}", 80),
    ];
    process.stdout.write(JSON.stringify(out.map((s) => [s.length, s.isWellFormed()])));
  `;
  const run = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), [[79, true], [80, true], [79, true]]);
});

test("the export zip has unique file names", () => {
  const data = { sessions: [], dailyRoutines: phoneStore([item("item-a", "Example Compound A", 10)], [log("log-1", "2026-11-01", 250, 10)]) };
  const names = buildExportFiles(data).map((file) => file.name);
  assert.deepEqual(names, [...new Set(names)]);
  assert.equal(names.filter((name) => name === "daily_routine_logs.csv").length, 1);
});
