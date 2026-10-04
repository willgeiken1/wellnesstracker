import assert from "node:assert/strict";
import test from "node:test";
import { applyHomeMigration, homeV2Migrated, pickHomeV2 } from "../logger/js/shared/home-migrate.js";
import { HOME_WIDGETS, commitHomeEditor, setHomeLayout } from "../logger/js/shared/home-widgets.js";
import { noteOuraConnected } from "../logger/js/shared/oura-gate.js";

const DAY = 86400000;
const UNKNOWN = "future-widget";
const IDS = Object.keys(HOME_WIDGETS);
const ROUNDS = 36;

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function unknowns(home) {
  if (!home) return [];
  const ids = [...(home.items || []), ...(home.hidden || [])];
  return ids.filter((id) => typeof id === "string" && id && !HOME_WIDGETS[id]);
}

function hasId(home, id) {
  return !!home && ((home.items || []).includes(id) || (home.hidden || []).includes(id));
}

function keptUnknown(before, after) {
  if (!before || !after) return;
  unknowns(before).forEach((id) => {
    assert.ok(hasId(after, id), `dropped ${id}`);
  });
}

function sig(home) {
  return JSON.stringify({
    items: home && home.items || [],
    hidden: home && home.hidden || [],
    sizes: home && home.sizes || null,
    ouraSeeded: !!(home && home.ouraSeeded),
    migrated: homeV2Migrated(home),
  });
}

test("three phones with clock skew keep a real edit, agree, and keep unknown ids", () => {
  const realNow = Date.now;
  let trueNow = 1_780_000_000_000;
  let rng = 0xC0FFEE;
  const rnd = () => {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    return rng / 4294967296;
  };
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const phones = [-DAY, 0, DAY].map((skew) => ({
    skew,
    state: {
      settingsAt: 10,
      sessions: [],
      muscleMode: "basic",
      oura: { connected: false, lastSync: null, days: {} },
      layout: { home: { order: ["today", "brief", "cardio"], hidden: ["map-adv"] } },
      brief: { order: ["pattern", "week"], hidden: ["food"], size: "compact", updatedAt: 4 },
    },
  }));
  let server = null;
  let sawEdit = false;

  const clockOf = (phone) => trueNow + phone.skew;

  function sourceMatching(picked, inputs) {
    if (!picked) return null;
    return inputs.find((home) => home && JSON.stringify(home.items || []) === JSON.stringify(picked.items || [])) || null;
  }

  function pullPush(phone) {
    const now = clockOf(phone);
    const remote = server && server.homeV2;
    const picked = pickHomeV2(phone.state.layout, remote ? { homeV2: remote } : {}, now);
    if (picked) {
      const source = sourceMatching(picked, [phone.state.layout.homeV2, remote]);
      if (source) keptUnknown(source, picked);
      if (!phone.state.layout || typeof phone.state.layout !== "object") phone.state.layout = {};
      phone.state.layout.homeV2 = clone(picked);
    }
    const beforeMigrate = phone.state.layout.homeV2 ? clone(phone.state.layout.homeV2) : null;
    applyHomeMigration(phone.state, now, { afterMerge: true });
    if (beforeMigrate && !homeV2Migrated(beforeMigrate)) {
      keptUnknown(beforeMigrate, phone.state.layout.homeV2);
      assert.equal(homeV2Migrated(phone.state.layout.homeV2), false);
    }
    const pushed = pickHomeV2(server ? { homeV2: server.homeV2 } : {}, phone.state.layout, now);
    if (pushed) {
      const source = sourceMatching(pushed, [server && server.homeV2, phone.state.layout.homeV2]);
      if (source) keptUnknown(source, pushed);
      server = { homeV2: clone(pushed) };
    }
  }

  function fullSync() {
    for (let pass = 0; pass < 4; pass++) phones.forEach(pullPush);
  }

  try {
    Date.now = () => clockOf(phones[0]);
    setHomeLayout(phones[0].state, { items: ["today", UNKNOWN, "cardio"], hidden: ["steps", "next-card"] });
    Date.now = realNow;
    sawEdit = true;
    assert.ok(hasId(phones[0].state.layout.homeV2, UNKNOWN));
    assert.equal(homeV2Migrated(phones[0].state.layout.homeV2), false);
    fullSync();
    const first = sig(phones[0].state.layout.homeV2);
    phones.forEach((phone) => {
      assert.equal(sig(phone.state.layout.homeV2), first);
      assert.ok(hasId(phone.state.layout.homeV2, UNKNOWN));
      assert.equal(homeV2Migrated(phone.state.layout.homeV2), false);
    });
    assert.equal(sig(server.homeV2), first);

    for (let round = 0; round < ROUNDS; round++) {
      trueNow += Math.floor(rnd() * 4000) + 20;
      const phone = pick(phones);
      const op = pick(["edit", "edit", "migrate", "seed", "sync"]);
      const before = phone.state.layout.homeV2 ? clone(phone.state.layout.homeV2) : null;
      if (op === "edit") {
        const items = IDS.filter(() => rnd() > 0.62);
        if (!items.includes("today")) items.unshift("today");
        items.sort(() => rnd() - 0.5);
        const hidden = IDS.filter((id) => !items.includes(id) && rnd() > 0.72);
        const sizes = {};
        if (rnd() > 0.5) sizes.headline = "small";
        if (rnd() > 0.5) sizes.readiness = "medium";
        if (rnd() > 0.7) sizes.today = "small";
        Date.now = () => clockOf(phone);
        commitHomeEditor(phone.state, { items, hidden, sizes });
        Date.now = realNow;
        sawEdit = true;
        keptUnknown(before, phone.state.layout.homeV2);
        assert.equal(homeV2Migrated(phone.state.layout.homeV2), false);
        assert.ok(phone.state.layout.homeV2.updatedAt >= clockOf(phone) - 5);
      } else if (op === "migrate") {
        applyHomeMigration(phone.state, clockOf(phone));
        if (before && !homeV2Migrated(before)) {
          keptUnknown(before, phone.state.layout.homeV2);
          assert.equal(homeV2Migrated(phone.state.layout.homeV2), false);
        }
      } else if (op === "seed") {
        phone.state.oura = { ...(phone.state.oura || {}), connected: true };
        const pulled = before && typeof before.updatedAt === "number" ? before.updatedAt : 0;
        const newer = rnd() > 0.65;
        noteOuraConnected(phone.state, true, { pulledUpdatedAt: newer ? pulled + 5000 : pulled });
        if (before) keptUnknown(before, phone.state.layout.homeV2);
        if (newer && before) assert.equal(phone.state.layout.homeV2.updatedAt, before.updatedAt);
        if (before && !homeV2Migrated(before)) assert.equal(homeV2Migrated(phone.state.layout.homeV2), false);
      } else {
        pullPush(phone);
      }
    }

    fullSync();
    assert.equal(sawEdit, true);
    const agreed = sig(phones[0].state.layout.homeV2);
    phones.forEach((phone) => {
      assert.equal(sig(phone.state.layout.homeV2), agreed);
      assert.equal(homeV2Migrated(phone.state.layout.homeV2), false);
      assert.ok(hasId(phone.state.layout.homeV2, UNKNOWN));
      assert.ok(hasId(phone.state.layout.homeV2, "next-card"));
    });
    assert.equal(sig(server.homeV2), agreed);
    assert.equal(getPaintIds(phones[0].state.layout.homeV2).includes(UNKNOWN), false);
  } finally {
    Date.now = realNow;
  }
});

function getPaintIds(home) {
  const hidden = new Set(home.hidden || []);
  return (home.items || []).filter((id) => HOME_WIDGETS[id] && !hidden.has(id));
}

function mulberry(seed) {
  let rng = seed >>> 0;
  return () => {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    return rng / 4294967296;
  };
}

function distinctCount(home) {
  const ids = new Set();
  [...(home.items || []), ...(home.hidden || [])].forEach((id) => {
    if (typeof id === "string" && id) ids.add(id);
  });
  return ids.size;
}

/* An old build's allowlist has no brief and drops unknown ids. */
function oldClientCopy(home) {
  const keep = (id) => HOME_WIDGETS[id] && id !== "brief";
  const items = (home.items || []).filter(keep);
  const hidden = (home.hidden || []).filter((id) => keep(id) && !items.includes(id));
  return { v: 2, items, hidden, updatedAt: home.updatedAt, sizes: home.sizes };
}

test("an old client that strips an id at the same updatedAt does not erase it", () => {
  const now = 2000;
  const rich = { v: 2, items: ["brief", "this-week", "cardio"], hidden: [], updatedAt: 1000 };
  const poor = { v: 2, items: ["this-week", "cardio"], hidden: [], updatedAt: 1000 };
  assert.deepEqual(pickHomeV2({ homeV2: rich }, { homeV2: poor }, now).items, ["brief", "this-week", "cardio"]);
  assert.deepEqual(pickHomeV2({ homeV2: poor }, { homeV2: rich }, now).items, ["brief", "this-week", "cardio"]);
  const hiddenRich = { v: 2, items: ["this-week"], hidden: ["brief"], updatedAt: 1000 };
  const hiddenPoor = { v: 2, items: ["this-week"], hidden: [], updatedAt: 1000 };
  assert.ok(pickHomeV2({ homeV2: hiddenRich }, { homeV2: hiddenPoor }, now).hidden.includes("brief"));
  assert.ok(pickHomeV2({ homeV2: hiddenPoor }, { homeV2: hiddenRich }, now).hidden.includes("brief"));

  const rnd = mulberry(0x4c9e055);
  const pool = [...IDS, "future-widget", "next-card"];
  for (let trial = 0; trial < 80; trial++) {
    const chosen = pool.filter(() => rnd() < 0.45);
    if (!chosen.includes("brief")) chosen.push("brief");
    if (!chosen.some((id) => HOME_WIDGETS[id])) chosen.push("today");
    const items = [];
    const hidden = [];
    chosen.forEach((id) => (rnd() < 0.72 ? items : hidden).push(id));
    if (!items.some((id) => HOME_WIDGETS[id])) items.unshift("brief");
    const at = 1000 + trial;
    const full = { v: 2, items, hidden, updatedAt: at };
    const stripped = oldClientCopy(full);
    const forward = pickHomeV2({ homeV2: full }, { homeV2: stripped }, at + 5000);
    const backward = pickHomeV2({ homeV2: stripped }, { homeV2: full }, at + 5000);
    assert.equal(sig(forward), sig(backward), `trial ${trial} diverged`);
    assert.ok(hasId(forward, "brief"), `trial ${trial} dropped brief`);
    assert.ok(distinctCount(forward) >= distinctCount(stripped), `trial ${trial} kept the shorter copy`);
    const merged = pickHomeV2({ homeV2: stripped }, { homeV2: forward }, at + 5000);
    assert.equal(sig(merged), sig(forward), `trial ${trial} merge erased ids`);
    unknowns(full).forEach((id) => assert.ok(hasId(forward, id), `trial ${trial} dropped ${id}`));
  }

  const sizedA = { v: 2, items: ["today", "brief"], hidden: ["steps"], updatedAt: 50, sizes: { z: "s", aa: "m" } };
  const sizedB = { v: 2, items: ["today", "brief"], hidden: ["steps"], updatedAt: 50, sizes: { z: "m", aa: "s" } };
  const sizeWinner = pickHomeV2({ homeV2: sizedA }, { homeV2: sizedB }, 80);
  assert.equal(sizeWinner.sizes.z, "s");
  assert.equal(pickHomeV2({ homeV2: sizedB }, { homeV2: sizedA }, 80).sizes.z, "s");
  assert.ok(hasId(sizeWinner, "brief"));
});
