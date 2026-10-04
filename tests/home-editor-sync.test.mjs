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
