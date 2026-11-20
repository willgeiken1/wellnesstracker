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
  emptyDailyRoutines,
  isLive,
  liveOf,
  mergeDailyRoutines,
  normalizeDailyRoutines,
  projectDailyRoutines,
  revisePlanEntity,
  seedDefaultBlocks,
} = await import("../logger/js/shared/daily-routines-store.js");
const { applyPurges, stripRange } = await import("../logger/js/shared/purge.js");

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

test("an equal updatedAt keeps the copy already on this phone", () => {
  const local = phoneStore([item("item-a", "Local name", 10)]);
  const remote = phoneStore([item("item-a", "Remote name", 10)]);
  const merged = mergeDailyRoutines(local, remote);
  assert.equal(merged.items[0].name, "Local name");
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
  assert.equal(isLive(byId["log-day-2"]), true);
  assert.equal(byId["log-day-2"].amount, 250);
  assert.equal(isLive(byId["log-after"]), true);
  assert.equal(data.dailyRoutines.blocks[0].name, "Morning routine");
  assert.equal(data.dailyRoutines.compounds[0].amount, 250);
  assert.equal(data.sessions.length, 1);
  assert.equal(stripRange(data, "2026-11-01", "2026-11-01", { before: 4000, now: 6000 }), false);
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
  const seeded = seedDefaultBlocks(emptyDailyRoutines(5), 5, (name) => `id-${name}`);
  assert.deepEqual(seeded.blocks.map((block) => block.name), DEFAULT_ROUTINE_BLOCKS.map((block) => block.name));
  assert.equal(seedDefaultBlocks(seeded, 9).blocks.length, 3);
  assert.equal(app.migrate({ version: 2, sessions: [] }).dailyRoutines, null);
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
      day2: logs["log-day-2"].deletedAt,
      amount: logs["log-day-2"].amount,
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
  assert.equal(got.day2, null);
  assert.equal(got.amount, 250);
  assert.equal(got.block, "Morning routine");
  assert.equal(got.compound, 250);
});

test("the account range delete stores a routine tombstone without the note, amount, or unit", () => {
  const rangeUrl = new URL("../supabase/functions/_shared/range.ts", import.meta.url).href;
  const script = `
    import { deleteRange } from ${JSON.stringify(rangeUrl)};
    const note = "qq4419-scribble-text";
    const keptNote = "qq4419-other-day";
    const blob = {
      dailyRoutines: {
        updatedAt: 10,
        blocks: [{ id: "block-morning", name: "Morning routine", deletedAt: null }],
        items: [{ id: "item-a", name: "Example Compound A", kind: "dose" }],
        compounds: [{ id: "compound-a", name: "Example Compound A", amount: 250, unit: "mcg" }],
        logs: [
          {
            id: "log-day-1", itemId: "item-a", compoundId: "compound-a",
            day: "2026-11-01", status: "done", amount: 250, unit: "mcg",
            at: 10, updatedAt: 10, deletedAt: null, note, mood: 2, energy: 3, stress: 1,
          },
          {
            id: "log-rest", day: "2026-11-01", status: "done", rest: true,
            amount: null, unit: "", at: 10, updatedAt: 10, deletedAt: null, note,
          },
          {
            id: "log-day-2", itemId: "item-a", compoundId: "compound-a",
            day: "2026-11-02", status: "done", amount: 125, unit: "mcg",
            at: 20, updatedAt: 20, deletedAt: null, note: keptNote,
          },
        ],
      },
    };
    let saved = null;
    const admin = {
      from(table) {
        const api = {
          op: "select",
          select() { api.op = "select"; return api; },
          delete() { api.op = "delete"; return api; },
          eq() { return api; },
          gte() { return api; },
          lte() { return api; },
          in() { return api; },
          upsert(row) { saved = row; return Promise.resolve({ error: null }); },
          maybeSingle() { return Promise.resolve({ data: { data: blob }, error: null }); },
          then(resolve, reject) {
            const payload = table === "progress_photos" && api.op === "select" ? { data: [], error: null } : { error: null };
            return Promise.resolve(payload).then(resolve, reject);
          },
        };
        return api;
      },
      storage: { from() { return { remove() { return Promise.resolve({ error: null }); } }; } },
      rpc() { return Promise.resolve({ error: { message: "could not find the function" } }); },
    };
    const res = await deleteRange(admin, "user-1", { from: "2026-11-01", to: "2026-11-01", deletedAt: 4000 }, 6000);
    const logs = Object.fromEntries(saved.data.dailyRoutines.logs.map((row) => [row.id, row]));
    console.log(JSON.stringify({
      status: res.status,
      day1: Object.keys(logs["log-day-1"]).sort(),
      rest: Object.keys(logs["log-rest"]).sort(),
      other: logs["log-day-2"],
      compound: saved.data.dailyRoutines.compounds[0].amount,
      raw: JSON.stringify(saved.data),
    }));
  `;
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const got = JSON.parse(result.stdout.trim().split("\n").pop());
  assert.equal(got.status, 200);
  assert.deepEqual(got.day1, ["day", "deletedAt", "id", "status", "updatedAt"]);
  assert.deepEqual(got.rest, ["day", "deletedAt", "id", "rest", "status", "updatedAt"]);
  assert.equal(got.other.note, "qq4419-other-day");
  assert.equal(got.other.amount, 125);
  assert.equal(got.other.unit, "mcg");
  assert.equal(got.compound, 250);
  assert.equal(got.raw.includes("qq4419-scribble-text"), false);
  assert.equal(got.raw.includes("\"mood\""), false);
});

test("the account range delete also scrubs a dose that was already undone", () => {
  const stripUrl = new URL("../supabase/functions/_shared/strip.ts", import.meta.url).href;
  const script = `
    import { stripRange } from ${JSON.stringify(stripUrl)};
    const data = {
      dailyRoutines: {
        logs: [
          {
            id: "log-undone", itemId: "item-a", compoundId: "compound-a",
            day: "2026-11-01", status: "done", amount: 250, unit: "mcg",
            at: 10, note: "qq4419-scribble-text", updatedAt: 20, deletedAt: 20,
          },
          {
            id: "log-later", itemId: "item-a", compoundId: "compound-a",
            day: "2026-11-01", status: "done", amount: 1, unit: "mg",
            at: 9000, note: "qq4419-kept-note", updatedAt: 9000, deletedAt: 9000,
          },
        ],
      },
    };
    stripRange(data, "2026-11-01", "2026-11-01", 4000, 6000);
    const logs = Object.fromEntries(data.dailyRoutines.logs.map((row) => [row.id, row]));
    console.log(JSON.stringify({
      undone: Object.keys(logs["log-undone"]).sort(),
      later: logs["log-later"].note,
      raw: JSON.stringify(logs["log-undone"]),
    }));
  `;
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const got = JSON.parse(result.stdout.trim().split("\n").pop());
  assert.deepEqual(got.undone, ["day", "deletedAt", "id", "status", "updatedAt"]);
  assert.equal(got.raw.includes("qq4419-scribble-text"), false);
  assert.equal(got.later, "qq4419-kept-note");
});
