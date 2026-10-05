import assert from "node:assert/strict";
import test from "node:test";

/* Loads data/state.js and shared/cloud.js through the shared runtime, with an in-memory localStorage. */
const store = {};
globalThis.localStorage = {
  getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
globalThis.window = globalThis;
const { app } = await import("../logger/js/runtime.js");
await import("../logger/js/data/state.js");
await import("../logger/js/shared/cloud.js");
globalThis.document = { addEventListener() {}, documentElement: { dataset: {} }, querySelector: () => null };
await import("../logger/js/pages/settings.js");
app.schedulePush = () => {};
app.esc = (s) => String(s);

const clone = (v) => JSON.parse(JSON.stringify(v));

/* merge_user_data: the higher `at` wins, and an equal `at` keeps the note already stored.
   The client adopts that stored note, so the two sides meet. */
function sqlMerge(stored, incoming) {
  const out = app.normalizeMachineNotes(stored);
  Object.entries(app.normalizeMachineNotes(incoming)).forEach(([k, b]) => {
    const a = out[k];
    if (!a || (b.at || 0) > (a.at || 0)) out[k] = b;
  });
  return out;
}

function serverMerge(server, incoming) {
  return sqlMerge(server, incoming);
}

/* rpc stub: merges on call, answers whenever the test releases the reply. */
function fakeServer(initial = {}) {
  const srv = { notes: clone(initial), pending: [] };
  app.session = { user: { id: "11111111-1111-4111-8111-111111111111" } };
  app.sb = {
    rpc(name, args) {
      assert.equal(name, "merge_user_data");
      srv.notes = serverMerge(srv.notes, args.p_data.machineNotes);
      const snapshot = clone(srv.notes);
      return new Promise((resolve) => {
        srv.pending.push(() => resolve({ data: { machineNotes: snapshot }, error: null }));
      });
    },
  };
  return srv;
}

const tick = () => new Promise((r) => setImmediate(r));

test("an edit made while a save is in flight survives the stale server reply", async () => {
  app.state.machineNotes = { "Leg press": { text: "Seat 4", at: 100 } };
  const srv = fakeServer({ "Leg press": { text: "Seat 3", at: 50 } });
  const push = app.cloudPush();
  await tick();
  assert.equal(srv.pending.length, 1);
  // The user edits again before the reply lands.
  app.state.machineNotes["Leg press"] = { text: "Seat 6", at: 200 };
  srv.pending.shift()();
  await push;
  assert.deepEqual(app.state.machineNotes["Leg press"], { text: "Seat 6", at: 200 });
});

test("a newer note from another phone in the reply is merged in and saved", async () => {
  app.state.machineNotes = { Row: { text: "Pad 2", at: 10 } };
  const srv = fakeServer({ Row: { text: "Pad 5", at: 90 }, Curl: { text: "Pin 3", at: 40 } });
  let saves = 0;
  const realSave = app.save;
  app.save = () => { saves++; realSave(); };
  try {
    const push = app.cloudPush();
    await tick();
    srv.pending.shift()();
    await push;
  } finally {
    app.save = realSave;
  }
  assert.deepEqual(app.state.machineNotes, { Row: { text: "Pad 5", at: 90 }, Curl: { text: "Pin 3", at: 40 } });
  assert.equal(saves, 1);
  assert.deepEqual(JSON.parse(store[app.KEY]).machineNotes, app.state.machineNotes);
});

test("a reply that changes nothing doesn't save again", async () => {
  app.state.machineNotes = { Row: { text: "Pad 2", at: 10 } };
  const srv = fakeServer({});
  let saves = 0;
  const realSave = app.save;
  app.save = () => { saves++; realSave(); };
  try {
    const push = app.cloudPush();
    await tick();
    srv.pending.shift()();
    await push;
  } finally {
    app.save = realSave;
  }
  assert.equal(saves, 0);
});

test("a tombstone beats an older note in both merge directions", () => {
  const note = { Squat: { text: "Rack 7", at: 100 } };
  const gone = { Squat: { text: "", at: 200, gone: true } };
  assert.deepEqual(app.mergeMachineNotes(gone, note).Squat, { text: "", at: 200, gone: true });
  assert.deepEqual(app.mergeMachineNotes(note, gone).Squat, { text: "", at: 200, gone: true });
});

test("a newer note beats an older tombstone in both merge directions", () => {
  const gone = { Squat: { text: "", at: 100, gone: true } };
  const note = { Squat: { text: "Rack 8", at: 300 } };
  assert.deepEqual(app.mergeMachineNotes(gone, note).Squat, { text: "Rack 8", at: 300 });
  assert.deepEqual(app.mergeMachineNotes(note, gone).Squat, { text: "Rack 8", at: 300 });
});

test("the edit sheet shows Clear only when a note exists", () => {
  app.ui = { sd: { name: "Squat" } };
  app.state.machineNotes = { Squat: { text: "Rack 7", at: 1 } };
  assert.match(app.machineEditSheetHTML(), /data-action="ms-clear"[^>]*>Clear</);
  app.state.machineNotes = { Squat: { text: "", at: 2, gone: true } };
  assert.doesNotMatch(app.machineEditSheetHTML(), /ms-clear/);
  app.state.machineNotes = {};
  assert.doesNotMatch(app.machineEditSheetHTML(), /ms-clear/);
});

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

test("300 seeded interleavings of edits, clears, other phones, and late replies: newest wins and nothing is lost", async () => {
  const rnd = rng(0xBEEF);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const KEYS = ["Leg press", "Row", "Curl", "Chest fly"];
  for (let round = 0; round < 300; round++) {
    let clock = 1000;
    const newest = {}; // key -> the newest write anywhere
    const record = (k, v) => { if (!newest[k] || v.at > newest[k].at) newest[k] = clone(v); };
    const write = (gone) => {
      const v = gone ? { text: "", at: ++clock, gone: true } : { text: "n" + clock + "-" + round, at: ++clock };
      return v;
    };
    app.state.machineNotes = {};
    const srv = fakeServer({});
    const pushes = [];
    const label = `round ${round}`;
    const steps = 6 + Math.floor(rnd() * 14);
    for (let s = 0; s < steps; s++) {
      const op = rnd();
      const k = pick(KEYS);
      if (op < 0.3) {
        const v = write(false);
        app.state.machineNotes[k] = v;
        record(k, v);
      } else if (op < 0.45) {
        const v = write(true);
        app.state.machineNotes[k] = v;
        record(k, v);
      } else if (op < 0.6) {
        // Another phone saves straight to the server.
        const v = write(rnd() < 0.3);
        srv.notes = serverMerge(srv.notes, { [k]: v });
        record(k, v);
      } else if (op < 0.8) {
        pushes.push(app.cloudPush());
        await tick();
      } else if (srv.pending.length) {
        // Replies can land in any order.
        const i = Math.floor(rnd() * srv.pending.length);
        srv.pending.splice(i, 1)[0]();
        await tick();
      }
    }
    while (srv.pending.length) {
      srv.pending.splice(Math.floor(rnd() * srv.pending.length), 1)[0]();
      await tick();
    }
    await Promise.all(pushes);
    // One more round trip settles both sides.
    const last = app.cloudPush();
    await tick();
    srv.pending.shift()();
    await last;

    Object.keys(newest).forEach((k) => {
      assert.deepEqual(app.state.machineNotes[k], newest[k], `${label} local ${k}`);
      assert.deepEqual(srv.notes[k], newest[k], `${label} server ${k}`);
    });
    assert.deepEqual(Object.keys(app.state.machineNotes).sort(), Object.keys(newest).sort(), label);
  }
});

test("equal-timestamp ties converge between client and SQL", () => {
  const KEYS = ["Leg press", "Row", "Curl", "Chest fly"];
  const stored = sqlMerge(
    { Row: { text: "Pad A", at: 50 } },
    { Row: { text: "Pad B", at: 50 } }
  );
  assert.deepEqual(stored.Row, { text: "Pad A", at: 50 });
  assert.deepEqual(app.mergeMachineNotes({ Row: { text: "Pad B", at: 50 } }, stored), stored);
  assert.deepEqual(
    app.mergeMachineNotes({ Row: "Seat 4" }, { Row: "Seat 1" }).Row,
    { text: "Seat 1", at: 0 }
  );
  assert.deepEqual(
    app.mergeMachineNotes({ Squat: { text: "", at: 10, gone: true } }, sqlMerge({ Squat: { text: "Rack", at: 10 } }, { Squat: { text: "", at: 10, gone: true } })).Squat,
    { text: "Rack", at: 10 }
  );

  for (const seed of [7, 99]) {
    const rnd = rng(seed);
    const pick = (list) => list[Math.floor(rnd() * list.length)];
    for (let run = 0; run < 40; run++) {
      let server = {};
      const phones = [{ notes: {} }, { notes: {} }];
      let clock = 1000;
      const steps = 12 + Math.floor(rnd() * 20);
      for (let s = 0; s < steps; s++) {
        const phone = phones[Math.floor(rnd() * phones.length)];
        const op = rnd();
        if (op < 0.5) {
          const k = pick(KEYS);
          if (rnd() < 0.55) clock += 1;
          const at = clock;
          const next = rnd() < 0.25 ? { text: "", at, gone: true } : { text: "t" + seed + "-" + run + "-" + s, at };
          phone.notes = { ...phone.notes, [k]: next };
        } else if (op < 0.85) {
          server = sqlMerge(server, phone.notes);
          phone.notes = app.mergeMachineNotes(phone.notes, server);
        } else {
          phone.notes = app.mergeMachineNotes(phone.notes, server);
        }
      }
      phones.forEach((phone) => { server = sqlMerge(server, phone.notes); });
      phones.forEach((phone) => { phone.notes = app.mergeMachineNotes(phone.notes, server); });
      phones.forEach((phone, i) => {
        assert.deepEqual(phone.notes, server, `seed ${seed} run ${run} phone ${i}`);
      });
    }
  }
});
