import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { HOME_WIDGETS, getHomeLayout } from "../logger/js/shared/home-widgets.js";
import { ouraMetric } from "../logger/js/shared/brief.js";
import {
  gatedOuraStripHTML,
  hasOura,
  noteOuraConnected,
  ouraReturnDialog,
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
    layout: { homeV2: layout(["readiness", "sleep-score", "weekly-goal", "last-night", "today"]) },
  });
  assert.deepEqual(visibleHomeIds(s), ["weekly-goal", "today"]);
  s.oura.connected = true;
  assert.deepEqual(visibleHomeIds(s), ["readiness", "sleep-score", "weekly-goal", "last-night", "today"]);
  s.oura.connected = false;
  s.demo = true;
  assert.deepEqual(visibleHomeIds(s), ["readiness", "sleep-score", "weekly-goal", "last-night", "today"]);
});

test("hidden stays the person's list and is not a disconnect switch", () => {
  const s = state({
    oura: { connected: true },
    layout: { homeV2: layout(["readiness", "sleep-score", "weekly-goal"], { hidden: ["sleep-score"] }) },
  });
  assert.deepEqual(visibleHomeIds(s), ["readiness", "weekly-goal"]);
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
  const s = state();
  assert.equal(noteOuraConnected(s, true), true);
  const seeded = getHomeLayout(s);
  assert.equal(s.oura.connected, true);
  assert.equal(seeded.ouraSeeded, true);
  assert.equal(s.settingsAt, seeded.updatedAt);
  assert.ok(s.settingsAt > 0);
  assert.deepEqual(seeded.items, ["readiness", "sleep-score", "weekly-goal", "today"]);
  assert.deepEqual(seeded.hidden, []);
  const stamped = seeded.updatedAt;

  seeded.items = seeded.items.filter((id) => id !== "readiness");
  assert.equal(noteOuraConnected(s, false), false);
  assert.equal(s.oura.connected, false);
  assert.equal(getHomeLayout(s), seeded);
  assert.deepEqual(seeded.items, ["sleep-score", "weekly-goal", "today"]);
  assert.deepEqual(seeded.hidden, []);
  assert.deepEqual(visibleHomeIds(s), ["weekly-goal", "today"]);

  assert.equal(noteOuraConnected(s, true), false);
  assert.equal(s.oura.connected, true);
  assert.deepEqual(getHomeLayout(s).items, ["sleep-score", "weekly-goal", "today"]);
  assert.equal(getHomeLayout(s).ouraSeeded, true);
  assert.equal(getHomeLayout(s).updatedAt, stamped);
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
  assert.equal(getHomeLayout(s), null);
  s.layout.homeV2 = layout(["today"]);
  assert.equal(noteOuraConnected(s, true), true);
  assert.deepEqual(getHomeLayout(s).items, ["readiness", "sleep-score", "today"]);
  assert.equal(noteOuraConnected(s, true), false);
});

test("the Home strip paints Oura tiles only when they are visible", () => {
  const s = state({
    layout: { homeV2: layout(["readiness", "sleep-score", "weekly-goal", "last-night"]) },
  });
  app.state = s;
  assert.equal(gatedOuraStripHTML(s), "");
  s.oura.connected = true;
  const html = gatedOuraStripHTML(s);
  assert.match(html, /data-oura-widget="readiness"/);
  assert.match(html, /data-oura-widget="sleep-score"/);
  assert.match(html, /data-oura-widget="last-night"/);
  assert.match(html, /Waiting for first sync/);
  assert.match(html, /data-tab="recovery"/);
  assert.doesNotMatch(html, /weekly-goal|Connect a ring|No Oura yet|Open Recovery/);
  s.demo = true;
  s.oura.connected = false;
  assert.match(gatedOuraStripHTML(s), /data-oura-widget="readiness"/);
});

test("a score colors the readiness tile and a missing items list does not throw", () => {
  const s = state({
    oura: { connected: true, days: { "2026-10-04": { date: "2026-10-04", readiness: 86, sleepScore: 81, total: 27000 } } },
    layout: { homeV2: layout(["readiness", "sleep-score"]) },
  });
  app.state = s;
  app.src = () => ({ oura: s.oura.days });
  app.latestOura = (oura) => {
    const keys = Object.keys(oura || {}).filter((k) => oura[k] && oura[k].readiness != null).sort();
    return keys.length ? oura[keys[keys.length - 1]] : null;
  };
  app.readinessLevel = (r) => (r >= 85 ? { cls: "up", word: "Primed", tip: "" } : { cls: "ok", word: "Good", tip: "" });
  const html = gatedOuraStripHTML(s);
  assert.match(html, /lvl-up/);
  assert.match(html, /data-tab="recovery"/);
  assert.match(html, />86</);
  assert.doesNotMatch(html, /Waiting for first sync/);
  const bare = state({ layout: { homeV2: { v: 2 } }, oura: { connected: true, days: {} } });
  assert.deepEqual(visibleHomeIds(bare), []);
  assert.doesNotThrow(() => gatedOuraStripHTML(bare));
});

test("the offline shell caches the gate and the widget stub", () => {
  const sw = readFileSync(new URL("../logger/sw.js", import.meta.url), "utf8");
  const sentry = readFileSync(new URL("../logger/js/sentry.js", import.meta.url), "utf8");
  assert.match(sw, /insight-shell-v20/);
  assert.match(sentry, /insight-shell-v20/);
  assert.match(sw, /js\/shared\/oura-gate\.js/);
  assert.match(sw, /js\/shared\/home-widgets\.js/);
});

test("ouraRefresh seeds on connect and the return copy no longer says Recovery", () => {
  const cloud = readFileSync(new URL("../logger/js/shared/cloud.js", import.meta.url), "utf8");
  assert.match(cloud, /noteOuraConnected\(app\.state, !!c\)/);
  assert.match(cloud, /pendingOuraConnect/);
  assert.match(cloud, /ouraRefresh\(!!app\.pendingOuraConnect\)/);
  assert.doesNotMatch(cloud, /pendingOuraConnect\)\s*app\.ui\.tab/);
  assert.doesNotMatch(cloud, /Open Recovery/);
  assert.doesNotMatch(cloud, /ouraSeeded/);
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
    tile: (html.match(/data-oura-widget="readiness"/g) || []).length,
    card: (html.match(/class="rcard"/g) || []).length,
    brief: (html.match(/data-metric="oura"/g) || []).length,
  };
}

test("hiding readiness on a v2 home shows it at most once", () => {
  stubHomeShell();
  const day = { date: "2026-10-04", readiness: 70, sleepScore: 81 };
  app.state = state({
    oura: { connected: true, days: { "2026-10-04": day } },
    layout: { homeV2: layout(["readiness", "sleep-score", "today"], { hidden: ["readiness"], ouraSeeded: true }) },
    workouts: [],
    plan: {},
  });
  const hidden = readinessHits(app.homeHTML());
  assert.equal(hidden.tile, 0);
  assert.equal(hidden.card, 0);
  assert.equal(hidden.brief, 1);
  assert.equal(hidden.tile + hidden.card + hidden.brief, 1);
  assert.equal(ouraWidgetShowing(app.state, "readiness"), false);
  assert.equal(ouraMetric().value, "70");

  app.state.layout.homeV2.hidden = [];
  const shown = readinessHits(app.homeHTML());
  assert.equal(shown.tile, 1);
  assert.equal(shown.card, 0);
  assert.equal(shown.brief, 0);
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
