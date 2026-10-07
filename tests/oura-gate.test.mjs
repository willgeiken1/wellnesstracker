import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { HOME_WIDGETS, getHomeLayout } from "../logger/js/shared/home-widgets.js";
import { pickHomeV2 } from "../logger/js/shared/home-migrate.js";
import { ouraMetric } from "../logger/js/shared/brief.js";
import {
  gatedOuraStripHTML,
  hasOura,
  needsSleepRecovery,
  noteOuraConnected,
  ouraReturnDialog,
  sleepRecoveryCopy,
  sleepRecoveryLabel,
  ouraWidgetShowing,
  seedOuraWidgets,
  visibleHomeIds,
} from "../logger/js/shared/oura-gate.js";
import { app } from "../logger/js/runtime.js";
import "../logger/js/pages/home.js";

const OURA_IDS = ["readiness", "sleep-score", "sleep-duration", "hrv", "resting-hr", "steps", "last-night"];

function layout(items, extra = {}) {
  return { v: 2, items: items.slice(), hidden: extra.hidden ? extra.hidden.slice() : [], updatedAt: extra.updatedAt || 1, ...extra, items: items.slice() };
}

function state(over = {}) {
  return {
    demo: false,
    oura: { connected: false, lastSync: null, days: {} },
    layout: { homeV2: layout(["weekly-goal", "today"]) },
    ...over,
  };
}

test("hasOura is the ring or sample data", () => {
  assert.equal(hasOura(null), false);
  assert.equal(hasOura(state()), false);
  assert.equal(hasOura(state({ oura: { connected: true } })), true);
  assert.equal(hasOura(state({ demo: true })), true);
});

test("the registry marks the locked Oura widgets", () => {
  for (const id of OURA_IDS) assert.equal(HOME_WIDGETS[id].needsOura, true, id);
  assert.equal(HOME_WIDGETS.readiness.size, "small");
  assert.equal(HOME_WIDGETS["last-night"].size, "medium");
  assert.equal(HOME_WIDGETS["weekly-goal"].needsOura, false);
  assert.equal(HOME_WIDGETS.today.needsOura, false);
});

test("Oura widgets drop out of Home without a ring or demo", () => {
  const s = state({
    layout: { homeV2: layout(["readiness", "sleep-score", "weekly-goal", "last-night", "today", "not-a-widget", ""]) },
  });
  assert.equal(HOME_WIDGETS.readiness.needsOura, true);
  assert.equal(HOME_WIDGETS["sleep-score"].needsOura, true);
  assert.equal(HOME_WIDGETS["last-night"].needsOura, true);
  assert.equal(HOME_WIDGETS["weekly-goal"].needsOura, false);
  assert.equal(HOME_WIDGETS.today.needsOura, false);
  assert.equal(HOME_WIDGETS["not-a-widget"], undefined);
  assert.deepEqual(visibleHomeIds(s), ["weekly-goal", "today"]);
  s.oura.connected = true;
  assert.deepEqual(visibleHomeIds(s), ["weekly-goal", "today"]);
  s.oura.days = { "2026-10-04": { date: "2026-10-04", readiness: 80 } };
  assert.deepEqual(visibleHomeIds(s), ["readiness", "sleep-score", "weekly-goal", "last-night", "today"]);
  s.oura.connected = false;
  s.oura.days = {};
  s.demo = true;
  assert.deepEqual(visibleHomeIds(s), ["readiness", "sleep-score", "weekly-goal", "last-night", "today"]);
});

test("hidden stays the person's list and is not a disconnect switch", () => {
  const s = state({
    oura: { connected: true, days: { "2026-10-04": { readiness: 70 } } },
    layout: { homeV2: layout(["readiness", "sleep-score", "weekly-goal"], { hidden: ["sleep-score"] }) },
  });
  assert.deepEqual(visibleHomeIds(s), ["readiness", "weekly-goal"]);
  s.oura.days = {};
  assert.deepEqual(visibleHomeIds(s), ["weekly-goal"]);
});

test("seed prepends only ids that are not already placed", () => {
  const before = layout(["pattern", "today", "readiness", "hrv", "sleep-score"], { hidden: ["food-today"], updatedAt: 4 });
  const once = seedOuraWidgets(before);
  assert.deepEqual(once.items, ["pattern", "today", "readiness", "hrv", "sleep-score"]);
  assert.deepEqual(once.hidden, ["food-today"]);
  assert.equal(once.ouraSeeded, true);
  assert.ok(once.updatedAt > before.updatedAt);
  assert.deepEqual(before.items, ["pattern", "today", "readiness", "hrv", "sleep-score"]);
  assert.equal(before.ouraSeeded, undefined);

  const partial = seedOuraWidgets(layout(["weekly-goal", "readiness", "today", "readiness"]));
  assert.deepEqual(partial.items, ["sleep-score", "weekly-goal", "readiness", "today"]);

  const hid = seedOuraWidgets(layout(["weekly-goal"], { hidden: ["readiness"] }));
  assert.deepEqual(hid.items, ["sleep-score", "weekly-goal"]);
  assert.deepEqual(hid.hidden, ["readiness"]);

  const twice = seedOuraWidgets(once);
  assert.equal(twice, once);

  const removed = { ...once, items: once.items.filter((id) => id !== "readiness") };
  const again = seedOuraWidgets(removed);
  assert.equal(again, removed);
  assert.deepEqual(again.items, ["pattern", "today", "hrv", "sleep-score"]);
});

test("connect seeds, disconnect keeps the layout, reconnect does not restore a removed widget", () => {
  const s = state({
    settingsAt: 40,
    layout: { homeV2: layout(["weekly-goal", "today"], { migrated: true, migratedAt: 12, migratedFrom: "home" }) },
  });
  assert.equal(noteOuraConnected(s, true), true);
  const seeded = getHomeLayout(s);
  assert.equal(s.oura.connected, true);
  assert.equal(seeded.ouraSeeded, true);
  assert.equal(s.settingsAt, 40);
  assert.deepEqual(seeded.items, ["readiness", "sleep-score", "weekly-goal", "today"]);
  assert.deepEqual(seeded.hidden, []);
  assert.notEqual(seeded, s.layout.homeV2);
  assert.equal(s.layout.homeV2.migrated, true);
  assert.equal(s.layout.homeV2.migratedAt, 12);
  assert.equal(s.layout.homeV2.migratedFrom, "home");
  const stamped = s.layout.homeV2.updatedAt;

  s.layout.homeV2.items = s.layout.homeV2.items.filter((id) => id !== "readiness");
  assert.equal(noteOuraConnected(s, false), false);
  assert.equal(s.oura.connected, false);
  assert.deepEqual(getHomeLayout(s).items, ["sleep-score", "weekly-goal", "today"]);
  assert.deepEqual(getHomeLayout(s).hidden, []);
  assert.equal(getHomeLayout(s).migratedAt, 12);
  assert.deepEqual(visibleHomeIds(s), ["weekly-goal", "today"]);

  assert.equal(noteOuraConnected(s, true), false);
  assert.equal(s.oura.connected, true);
  assert.deepEqual(getHomeLayout(s).items, ["sleep-score", "weekly-goal", "today"]);
  assert.equal(getHomeLayout(s).ouraSeeded, true);
  assert.equal(getHomeLayout(s).updatedAt, stamped);
  assert.deepEqual(visibleHomeIds(s), ["weekly-goal", "today"]);
  s.oura.days = { "2026-10-04": { readiness: 1 } };
  assert.deepEqual(visibleHomeIds(s), ["sleep-score", "weekly-goal", "today"]);
});

test("demo shows Oura widgets and does not seed", () => {
  const s = state({
    demo: true,
    layout: { homeV2: layout(["readiness", "weekly-goal"]) },
  });
  assert.equal(hasOura(s), true);
  assert.deepEqual(visibleHomeIds(s), ["readiness", "weekly-goal"]);
  assert.equal(noteOuraConnected(s, false), false);
  assert.equal(getHomeLayout(s).ouraSeeded, undefined);
  assert.deepEqual(getHomeLayout(s).items, ["readiness", "weekly-goal"]);
});

test("a layout that arrives after connect is seeded once", () => {
  const s = state({ layout: {} });
  assert.equal(noteOuraConnected(s, true), false);
  assert.equal(s.layout.homeV2, undefined);
  assert.equal(getHomeLayout(s).updatedAt, 0);
  assert.ok(getHomeLayout(s).items.includes("today"));
  s.layout.homeV2 = layout(["today"]);
  assert.equal(noteOuraConnected(s, true), true);
  assert.deepEqual(getHomeLayout(s).items, ["readiness", "sleep-score", "today"]);
  assert.equal(s.layout.homeV2.ouraSeeded, true);
  assert.equal(noteOuraConnected(s, true), false);
});

test("a refresh before this session's pull does not seed or touch settingsAt", () => {
  const s = state({ settingsAt: 40 });
  assert.equal(noteOuraConnected(s, true, { seed: false }), false);
  assert.equal(s.oura.connected, true);
  assert.equal(getHomeLayout(s).ouraSeeded, undefined);
  assert.deepEqual(getHomeLayout(s).items, ["weekly-goal", "today"]);
  assert.equal(s.settingsAt, 40);
});

test("the Home strip paints Oura tiles only when they are visible", () => {
  const prev = { state: app.state, src: app.src };
  const s = state({
    layout: { homeV2: layout(["readiness", "sleep-score", "weekly-goal", "last-night"]) },
  });
  app.state = s;
  app.src = () => ({ oura: {} });
  assert.equal(gatedOuraStripHTML(s), "");
  s.oura.connected = true;
  assert.equal(gatedOuraStripHTML(s), "");
  s.oura.days = { "2026-10-04": { date: "2026-10-04", readiness: 80, sleepScore: 70 } };
  app.src = () => ({ oura: s.oura.days });
  const html = gatedOuraStripHTML(s);
  assert.match(html, /data-hw="readiness"/);
  assert.match(html, /data-hw="sleep-score"/);
  assert.doesNotMatch(html, /data-hw="last-night"/);
  assert.doesNotMatch(html, /Waiting for first sync|hw-v">–|No Oura yet|Connect a ring/);
  assert.doesNotMatch(html, /weekly-goal|Open Recovery|data-tab="recovery"/);
  s.demo = true;
  s.oura.connected = false;
  s.oura.days = {};
  app.src = () => ({ oura: {} });
  assert.match(gatedOuraStripHTML(s), /data-hw="readiness"/);
  app.state = prev.state;
  app.src = prev.src;
});

test("a score colors the readiness tile and a missing items list does not throw", () => {
  const prev = { state: app.state, src: app.src, today: app.today, level: app.readinessLevel };
  const s = state({
    oura: { connected: true, days: { "2026-10-04": { date: "2026-10-04", readiness: 86, sleepScore: 81, total: 27000 } } },
    layout: { homeV2: layout(["readiness", "sleep-score"]) },
  });
  app.state = s;
  app.today = () => "2026-10-04";
  app.src = () => ({ oura: s.oura.days });
  app.readinessLevel = (r) => (r >= 85 ? { cls: "up", word: "Primed", tip: "" } : { cls: "ok", word: "Good", tip: "" });
  const html = gatedOuraStripHTML(s);
  assert.match(html, /tone-up/);
  assert.match(html, /data-hw="readiness"/);
  assert.match(html, /Primed/);
  assert.match(html, />86</);
  assert.match(html, /data-hw="sleep-score"/);
  assert.match(html, />81</);
  assert.doesNotMatch(html, /Waiting for first sync|No Oura yet|Connect a ring|data-tab="recovery"/);
  const bare = state({ layout: { homeV2: { v: 2 } }, oura: { connected: true, days: {} } });
  app.state = bare;
  app.src = () => ({ oura: {} });
  assert.equal(getHomeLayout(bare).updatedAt, 0);
  assert.ok(visibleHomeIds(bare).includes("today"));
  assert.equal(visibleHomeIds(bare).includes("readiness"), false);
  assert.doesNotThrow(() => gatedOuraStripHTML(bare));
  const empty = state({ layout: { homeV2: { v: 2, items: [], hidden: [] } }, oura: { connected: true, days: {} } });
  assert.deepEqual(visibleHomeIds(empty), []);
  assert.equal(gatedOuraStripHTML(empty), "");
  app.state = prev.state;
  app.src = prev.src;
  app.today = prev.today;
  app.readinessLevel = prev.level;
});

test("the offline shell caches the gate and the widget stub", () => {
  const sw = readFileSync(new URL("../logger/sw.js", import.meta.url), "utf8");
  const sentry = readFileSync(new URL("../logger/js/sentry.js", import.meta.url), "utf8");
  assert.match(sw, /insight-shell-v41/);
  assert.match(sentry, /insight-shell-v41/);
  assert.match(sw, /js\/shared\/oura-gate\.js/);
  assert.match(sw, /js\/shared\/home-widgets\.js/);
});

test("ouraRefresh seeds on connect and the return copy no longer says Recovery", () => {
  const cloud = readFileSync(new URL("../logger/js/shared/cloud.js", import.meta.url), "utf8");
  const gate = readFileSync(new URL("../logger/js/shared/oura-gate.js", import.meta.url), "utf8");
  assert.match(cloud, /noteOuraConnected\(app\.state, !!c, \{ seed: !!app\.cloudPullOk \}\)/);
  assert.match(cloud, /async function cloudPull\(\) \{\n  app\.cloudPullOk = false;/);
  assert.match(cloud, /cloudPullOk = true/);
  assert.match(cloud, /pendingOuraConnect/);
  assert.match(cloud, /ouraRefresh\(!!app\.pendingOuraConnect\)/);
  assert.doesNotMatch(cloud, /pendingOuraConnect\)\s*app\.ui\.tab/);
  assert.doesNotMatch(cloud, /Open Recovery/);
  assert.doesNotMatch(cloud, /ouraSeeded/);
  assert.doesNotMatch(gate, /settingsAt\s*=/);
});

function stubHomeShell() {
  app.today = () => "2026-10-04";
  app.activeSession = () => null;
  app.sessionsOn = () => [];
  app.workoutById = () => null;
  app.addDays = (s) => s;
  app.mondayOf = (s) => s;
  app.fmtDate = () => "Sun";
  app.parseDay = (s) => new Date(`${s}T12:00:00`);
  app.esc = (s) => String(s == null ? "" : s);
  app.pl = (n, w) => `${n} ${w}`;
  app.musclesBetween = () => new Map();
  app.MUSCLES = {};
  app.pageHead = () => "";
  app.firstName = () => "";
  app.addButtonHTML = () => "";
  app.weekCardHTML = () => "";
  app.weighReminderHTML = () => "";
  app.weekGoalHeadHTML = () => "";
  app.weekGoalLineHTML = () => "";
  app.cardioWidgetHTML = () => "";
  app.muscleMapHTML = () => "";
  app.I = { chevL: "" };
  app.ui = { weekOffset: 0 };
  app.widgetize = (_page, html) => html;
  app.readinessCardHTML = () => `<button class="rcard">70 · Train as planned</button>`;
  app.src = () => ({ oura: (app.state.oura && app.state.oura.days) || {}, sessions: [] });
  app.latestOura = (oura) => {
    const keys = Object.keys(oura || {}).filter((k) => oura[k] && oura[k].readiness != null).sort();
    return keys.length ? oura[keys[keys.length - 1]] : null;
  };
  app.readinessLevel = () => ({ cls: "ok", word: "Good", tip: "Train as planned." });
  app.briefHTML = () => {
    const m = ouraMetric();
    return m ? `<li data-metric="oura">${m.value}</li>` : "";
  };
}

function readinessHits(html) {
  return {
    tile: (html.match(/data-hw="readiness"/g) || []).length,
    card: (html.match(/class="rcard"/g) || []).length,
    brief: (html.match(/data-metric="oura"/g) || []).length,
  };
}

test("a saved homeV2 keeps the readiness card and the brief while the flag is off", () => {
  stubHomeShell();
  const day = { date: "2026-10-04", readiness: 70, sleepScore: 81 };
  app.state = state({
    oura: { connected: true, days: { "2026-10-04": day } },
    layout: { homeV2: layout(["readiness", "sleep-score", "today"], { hidden: ["readiness"], ouraSeeded: true, migrated: true, migratedAt: 2 }) },
    workouts: [],
    plan: {},
  });
  const hits = readinessHits(app.homeHTML());
  assert.equal(hits.tile, 0);
  assert.equal(hits.card, 1);
  /* The legacy Readiness card has the score and the default sleep tile has the sleep
     score, so the brief repeats neither. */
  assert.equal(hits.brief, 0);
  assert.equal(ouraWidgetShowing(app.state, "readiness"), false);
  assert.equal(ouraWidgetShowing(app.state, "sleep-score"), false);
  assert.equal(ouraMetric(), null);
});

test("the brief defers readiness to the default tile when the legacy card is hidden", () => {
  stubHomeShell();
  app.state = state({
    oura: { connected: true, days: { "2026-10-04": { date: "2026-10-04", readiness: 70, sleepScore: 72 } } },
    layout: { homeV2: layout(["readiness", "sleep-score"], { ouraSeeded: true, migrated: true, migratedAt: 2 }), home: { order: [], hidden: ["readiness"] } },
    workouts: [],
    plan: {},
  });
  /* With the card hidden the default readiness tile paints, so the brief still defers. */
  assert.equal(ouraMetric(), null);
  app.state.oura.days = { "2026-10-04": { date: "2026-10-04", readiness: 70 } };
  assert.equal(ouraMetric(), null);
  assert.equal(ouraWidgetShowing(app.state, "sleep-score"), false);
});

test("a first Oura seed does not outrank an edit newer than the pulled copy", () => {
  const stale = { v: 2, items: ["today", "weekly-goal", "future-widget"], hidden: ["next-card"], updatedAt: 1000 };
  const refused = seedOuraWidgets(stale, { pulledUpdatedAt: 5000 });
  assert.equal(refused, stale);
  assert.equal(refused.ouraSeeded, undefined);
  assert.equal(refused.updatedAt, 1000);

  const seeded = seedOuraWidgets(stale, { pulledUpdatedAt: 1000 });
  assert.notEqual(seeded, stale);
  assert.equal(seeded.ouraSeeded, true);
  assert.equal(seeded.updatedAt, 1001);
  assert.ok(seeded.updatedAt < 5000);
  assert.deepEqual(seeded.items.slice(0, 2), ["readiness", "sleep-score"]);
  assert.ok(seeded.items.includes("future-widget"));
  assert.deepEqual(seeded.hidden, ["next-card"]);

  const edit = { v: 2, items: ["cardio", "today", "future-widget"], hidden: ["readiness"], updatedAt: 5000 };
  const winner = pickHomeV2({ homeV2: seeded }, { homeV2: edit }, 10_000);
  assert.deepEqual(winner.items, ["cardio", "today", "future-widget"]);
  assert.equal(winner.ouraSeeded, true);

  const phone = state({
    layout: { homeV2: { v: 2, items: ["today"], hidden: [], updatedAt: 1000 } },
  });
  assert.equal(noteOuraConnected(phone, true, { pulledUpdatedAt: 5000 }), false);
  assert.equal(phone.layout.homeV2.ouraSeeded, undefined);
  assert.deepEqual(phone.layout.homeV2.items, ["today"]);
  assert.equal(phone.layout.homeV2.updatedAt, 1000);
});

test("oura personas on the registry home hide empty tiles", () => {
  stubHomeShell();
  const items = ["readiness", "sleep-score", "sleep-duration", "hrv", "resting-hr", "steps", "brief", "cardio"];
  const card = {
    kind: "snapshot",
    today: "2026-10-04",
    demo: false,
    oura: null,
    weekGoal: null,
    cardio: { minutes: 12, goal: 150 },
    headline: "Train",
    muscleMode: "basic",
  };
  app.snapshotFromApp = () => card;
  const personas = [
    { name: "none", connected: false, lastError: null },
    { name: "lapsed", connected: true, lastError: "token lapsed" },
    { name: "inactive", connected: true, lastError: "membership_inactive" },
  ];
  for (const persona of personas) {
    app.state = state({
      oura: { connected: persona.connected, lastError: persona.lastError, days: {} },
      layout: { homeV2: layout(items) },
      workouts: [],
      plan: {},
    });
    app.src = () => ({ oura: {} });
    const html = app.homeHTML();
    assert.equal(app.state.oura.lastError, persona.lastError, persona.name);
    assert.match(html, /data-hw="cardio"/, persona.name);
    assert.doesNotMatch(html, /data-hw="readiness"|data-hw="sleep-score"|data-hw="hrv"|data-hw="steps"|No Oura yet|hw-v">–/, persona.name);
    if (persona.name === "lapsed") assert.equal((html.match(/Waiting for first sync/g) || []).length, 1, persona.name);
    else assert.doesNotMatch(html, /Waiting for first sync/, persona.name);
  }
  card.oura = { date: "2026-10-04", readiness: 86, sleepScore: 81 };
  app.state = state({
    oura: { connected: true, lastError: null, days: { "2026-10-04": card.oura } },
    layout: { homeV2: layout(["readiness", "cardio"]) },
    workouts: [],
    plan: {},
  });
  app.src = () => ({ oura: app.state.oura.days });
  const ready = app.homeHTML();
  assert.match(ready, /data-hw="readiness"/);
  assert.match(ready, /86/);
  assert.doesNotMatch(ready, /Waiting for first sync|No Oura yet|hw-v">–/);
});

test("lapsed Oura needs the sleep card, and a reconnect label, while demo stays hidden", () => {
  const lapsed = state({ oura: { connected: true, lastSync: null, days: {}, lastError: "Oura daily_sleep request failed (403)" } });
  const never = state({ oura: { connected: false, lastSync: null, days: {} } });
  const withNights = state({ oura: { connected: true, days: { "2026-06-01": { readiness: 80 } } } });
  const demo = state({ demo: true, oura: { connected: false, days: {} } });
  assert.equal(needsSleepRecovery(lapsed, 0), true);
  assert.equal(needsSleepRecovery(never, 0), true);
  assert.equal(needsSleepRecovery(withNights, 1), false);
  assert.equal(needsSleepRecovery(demo, 0), false);
  const fresh = state({ oura: { connected: true, lastSync: null, days: {}, lastError: null } });
  assert.equal(sleepRecoveryLabel(lapsed, true), "Reconnect");
  assert.equal(sleepRecoveryLabel(fresh, true), "Sync now");
  assert.equal(sleepRecoveryLabel(never, true), "Connect Oura");
  assert.equal(sleepRecoveryLabel(never, false), "Learn more");
  assert.match(sleepRecoveryCopy(fresh), /first sync/);
  assert.doesNotMatch(sleepRecoveryCopy(fresh), /lapsed|Reconnect/);
  assert.match(sleepRecoveryCopy(lapsed), /lapsed/);
});

test("the OAuth dialog sends people to Settings", () => {
  for (const code of ["expired", "cancelled", "connected"]) {
    const dialog = ouraReturnDialog(code);
    assert.doesNotMatch(`${dialog.title} ${dialog.body}`, /recovery/i);
  }
  assert.match(ouraReturnDialog("expired").body, /Open Settings and tap Connect Oura/);
  assert.match(ouraReturnDialog("cancelled").body, /Open Settings and tap Connect Oura/);
  assert.match(ouraReturnDialog("connected").body, /Home/);
});
