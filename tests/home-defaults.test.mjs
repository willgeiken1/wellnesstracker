import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { app } from "../logger/js/runtime.js";
import "../logger/js/shared/analyze.js";
import "../logger/js/pages/insights.js";
import "../logger/js/shared/weekly.js";
import "../logger/js/shared/brief.js";
import "../logger/js/pages/home.js";
import { HOME_WIDGETS } from "../logger/js/shared/home-widgets.js";
import {
  OURA_DEFAULT_IDS,
  PLAIN_DEFAULT_IDS,
  defaultHomeIds,
  defaultHomeStripHTML,
  defaultTileIds,
  homeCardShowing,
  ouraLapsed,
} from "../logger/js/shared/home-defaults.js";

const TODAY = "2026-10-04";
const YESTERDAY = "2026-10-03";
const EMPTY_TILE = /No Oura yet|Connect a ring|Nothing logged|No goal yet|No weigh-ins|hw-v">–|hw-miss/;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* An account the stubs below read from. */
function account(over = {}) {
  return {
    demo: false,
    oura: { connected: false, lastSync: null, lastError: null, days: {} },
    layout: {},
    brief: null,
    plan: {},
    workouts: [{ id: "push", name: "Push", exercises: [{}, {}] }],
    goals: { sessionsPerWeek: null },
    profile: { weighIns: [] },
    food: {},
    doneThisWeek: 0,
    ...over,
  };
}

function ringDays(readiness = 78, sleepScore = 82) {
  return { [TODAY]: { date: TODAY, readiness, sleepScore, total: 27000, hrv: 60, rhr: 52 } };
}

const keep = {};
function stubApp(state) {
  for (const k of ["today", "addDays", "mondayOf", "src", "dayEntries", "dayTotals", "targets", "weekGoalStatus", "weighIns", "activeSession", "sessionsOn", "workoutById", "sessionsInWeek", "esc", "pl", "fmtDate", "fmtW", "kgToDisp", "weightRate", "signed", "wUnit", "r0", "briefTodayHeadline", "weighReminderHTML", "pageHead", "firstName", "greeting", "muscleMapHTML", "homeHeroHTML", "homeWeekHTML", "cardioWidgetHTML", "widgetize", "fmtHM", "ui", "state", "weekCardHTML"]) {
    if (!(k in keep)) keep[k] = app[k];
  }
  app.state = state;
  app.ui = {};
  app.today = () => TODAY;
  app.addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  app.mondayOf = () => "2026-09-28";
  app.src = () => ({ oura: state.oura.days || {}, sessions: [] });
  app.dayEntries = (d) => (state.food[d] ? [{}] : []);
  app.dayTotals = (d) => state.food[d] || { kcal: 0, p: 0 };
  app.targets = () => null;
  app.weekGoalStatus = () => (state.goals.sessionsPerWeek ? { done: state.doneThisWeek, goal: state.goals.sessionsPerWeek } : null);
  app.weighIns = () => state.profile.weighIns;
  app.activeSession = () => null;
  app.sessionsOn = () => [];
  app.workoutById = (id) => state.workouts.find((w) => w.id === id) || null;
  app.sessionsInWeek = () => state.doneThisWeek;
  app.esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  app.pl = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  app.fmtDate = () => "Sun";
  app.fmtW = (v) => String(v);
  app.kgToDisp = (v) => v;
  app.weightRate = () => null;
  app.signed = (v) => String(v);
  app.wUnit = () => "kg";
  app.r0 = Math.round;
  app.fmtHM = () => "7h 30m";
  app.briefTodayHeadline = () => "Headline phrase";
  app.weighReminderHTML = () => "";
  app.pageHead = () => "";
  app.firstName = () => "";
  app.greeting = () => "";
  app.muscleMapHTML = () => "";
  app.homeHeroHTML = () => `<div class="hero" data-hw="today">Today</div>`;
  app.homeWeekHTML = () => `<section data-hw="this-week"></section>`;
  app.cardioWidgetHTML = () => "";
  app.widgetize = (_page, html) => {
    const hidden = new Set((state.layout.home && state.layout.home.hidden) || []);
    return html.split(/<!--w:([a-z0-9-]+)-->/).map((part, i, all) => (i % 2 === 1 && hidden.has(part) ? "" : (i % 2 === 0 ? part : ""))).join("");
  };
  app.snapshotFromApp = undefined;
}

function restoreApp() {
  Object.keys(keep).forEach((k) => { app[k] = keep[k]; });
}

const hits = (html, re) => (html.match(re) || []).length;
const tileIdsIn = (html) => [...html.matchAll(/class="hw-slot[^"]*" data-hw="([a-z-]+)"/g)].map((m) => m[1]);

/* Everything Home paints for a legacy (not user-edited) account. */
function legacyView(state) {
  stubApp(state);
  const data = {
    kind: "snapshot", live: true, demo: state.demo, today: TODAY,
    oura: app.latestOura(app.src().oura),
    weekGoal: app.weekGoalStatus(),
    foodToday: state.food[TODAY] ? { logged: true, kcal: state.food[TODAY].kcal, protein: state.food[TODAY].p } : { logged: false },
    weight: state.profile.weighIns.length ? { empty: false, value: "81 kg", sub: "Last 81 kg" } : { empty: true },
    cardio: { minutes: 0, goal: 150 },
  };
  app.snapshotFromApp = () => data;
  return {
    strip: defaultHomeStripHTML(state, data),
    card: app.readinessCardHTML(),
    brief: app.briefHTML(),
  };
}

test("the defaults are the agreed ids per user type", () => {
  assert.deepEqual(OURA_DEFAULT_IDS, ["readiness", "sleep-score"]);
  assert.deepEqual(PLAIN_DEFAULT_IDS, ["food-today", "weekly-goal", "weight-trend"]);
  [...OURA_DEFAULT_IDS, ...PLAIN_DEFAULT_IDS].forEach((id) => assert.ok(HOME_WIDGETS[id], id));
  const ring = account({ oura: { connected: true, lastError: null, days: ringDays() } });
  assert.deepEqual(defaultHomeIds(ring), OURA_DEFAULT_IDS);
  assert.deepEqual(defaultHomeIds(account({ demo: true })), OURA_DEFAULT_IDS);
  assert.deepEqual(defaultHomeIds(account()), PLAIN_DEFAULT_IDS);
  const lapsed = account({ oura: { connected: true, lastError: "membership_inactive", days: ringDays() } });
  assert.equal(ouraLapsed(lapsed), true);
  assert.deepEqual(defaultHomeIds(lapsed), PLAIN_DEFAULT_IDS);
  assert.deepEqual(defaultHomeIds(account({ oura: { connected: true, lastError: "token lapsed", days: {} } })), OURA_DEFAULT_IDS);
});

test("a person with no ring gets food, weekly goal and weight tiles, only with data", () => {
  const s = account({ goals: { sessionsPerWeek: 3 }, doneThisWeek: 1, food: { [TODAY]: { kcal: 900, p: 60 } }, profile: { weighIns: [{ date: TODAY, kg: 81 }] } });
  try {
    const v = legacyView(s);
    assert.deepEqual(tileIdsIn(v.strip), ["food-today", "weekly-goal", "weight-trend"]);
    assert.doesNotMatch(v.strip, EMPTY_TILE);
    assert.doesNotMatch(v.strip, /data-hw="(readiness|sleep-score)"/);
    const bare = legacyView(account());
    assert.equal(bare.strip, "", "a new user has no empty tiles");
    assert.equal(bare.card, "");
    const partial = legacyView(account({ goals: { sessionsPerWeek: 4 } }));
    assert.deepEqual(tileIdsIn(partial.strip), ["weekly-goal"]);
  } finally { restoreApp(); }
});

test("a lapsed membership gets the no-ring defaults and no Oura tiles", () => {
  const s = account({
    oura: { connected: true, lastError: "membership_inactive", days: {} },
    goals: { sessionsPerWeek: 3 },
  });
  try {
    const v = legacyView(s);
    assert.deepEqual(tileIdsIn(v.strip), ["weekly-goal"]);
    assert.doesNotMatch(v.strip, EMPTY_TILE);
    assert.doesNotMatch(v.strip, /data-hw="(readiness|sleep-score)"/);
  } finally { restoreApp(); }
});

test("a ring gets readiness and sleep, with the Readiness card standing in for the readiness tile", () => {
  const s = account({ oura: { connected: true, lastError: null, days: ringDays(90, 77) } });
  try {
    const v = legacyView(s);
    assert.ok(v.card.includes("rcard"));
    assert.deepEqual(tileIdsIn(v.strip), ["sleep-score"]);
    assert.doesNotMatch(v.strip, EMPTY_TILE);
    /* With the card hidden, the readiness tile takes its place. */
    s.layout = { home: { order: [], hidden: ["readiness"] } };
    assert.deepEqual(tileIdsIn(legacyView(s).strip), ["readiness", "sleep-score"]);
    /* A ring that has not synced yet paints nothing, not placeholders. */
    const waiting = account({ oura: { connected: true, lastError: null, days: {} } });
    assert.equal(legacyView(waiting).strip, "");
    /* No sleep score: no sleep tile. */
    const noSleep = account({ oura: { connected: true, lastError: null, days: { [TODAY]: { date: TODAY, readiness: 80 } } } });
    assert.equal(legacyView(noSleep).strip, "");
  } finally { restoreApp(); }
});

test("a user-edited homeV2 gets no default strip and is never rewritten", () => {
  const edited = { v: 2, items: ["today", "weekly-goal"], hidden: ["readiness"], updatedAt: 12345 };
  const s = account({ goals: { sessionsPerWeek: 3 }, layout: { homeV2: edited } });
  const before = JSON.stringify(s.layout);
  try {
    stubApp(s);
    assert.deepEqual(defaultTileIds(s), []);
    assert.equal(defaultHomeStripHTML(s, { live: true }), "");
    app.homeHTML();
    app.briefHTML();
    assert.equal(JSON.stringify(s.layout), before);
    /* The seeded legacy path writes nothing either. */
    const fresh = account({ oura: { connected: true, days: ringDays() }, goals: { sessionsPerWeek: 3 } });
    legacyView(fresh);
    assert.equal(fresh.layout.homeV2, undefined);
  } finally { restoreApp(); }
});

test("the brief does not repeat the Readiness card, the planned card or a default tile", () => {
  const s = account({
    oura: { connected: true, lastError: null, days: ringDays(75, 80) },
    plan: { [TODAY]: "push" },
    goals: { sessionsPerWeek: 3 },
    profile: { weighIns: [{ date: TODAY, kg: 81 }] },
  });
  try {
    const v = legacyView(s);
    assert.doesNotMatch(v.brief, /data-metric="oura"/);
    assert.doesNotMatch(v.brief, /data-metric="train"/);
    s.layout = { home: { order: [], hidden: ["today"] } };
    const noToday = legacyView(s);
    assert.match(noToday.brief, /data-metric="train"/);
    assert.match(noToday.brief, /data-action="start" data-id="push"/);
    /* Plain user: weekly goal and weight tiles stand in for those brief metrics. */
    const plain = account({ goals: { sessionsPerWeek: 3 }, profile: { weighIns: [{ date: TODAY, kg: 81 }] } });
    const p = legacyView(plain);
    assert.doesNotMatch(p.brief, /data-metric="week"|data-metric="weight"/);
    assert.match(p.strip, /data-hw="weekly-goal"/);
    assert.match(p.strip, /data-hw="weight-trend"/);
    /* Brief stays: headline plus whatever the tiles do not cover. */
    assert.match(p.brief, /class="brief-h"/);
    assert.match(p.brief, /data-metric="food"/);
    /* Without data the tiles are absent, so the brief keeps its own line. */
    const none = legacyView(account());
    assert.match(none.brief, /data-metric="week"/);
  } finally { restoreApp(); }
});

test("the brief and the Readiness card give the same advice", () => {
  try {
    for (const score of [40, 69, 70, 84, 85, 99]) {
      const s = account({ oura: { connected: true, lastError: null, days: ringDays(score, 80) }, layout: { home: { order: [], hidden: ["today"] } } });
      const v = legacyView(s);
      const advice = app.readinessAdvice(score);
      assert.ok(v.card.includes(advice.tip), `card ${score}`);
      /* Today hidden, Readiness card showing: the card gives the advice and the brief does not repeat it. */
      assert.ok(!v.brief.includes(`<b>${advice.title}</b>`), `no duplicate advice at ${score}`);
      assert.doesNotMatch(v.brief, /Rest suggested/, `no conflict at ${score}`);
      /* With the Readiness card hidden too, the brief carries the same advice. */
      s.layout = { home: { order: [], hidden: ["today", "readiness"] } };
      const bare = legacyView(s);
      assert.ok(bare.brief.includes(`<b>${advice.title}</b>`), `brief ${score}`);
      assert.doesNotMatch(bare.brief, /Rest suggested/, `no conflict at ${score} without the card`);
    }
    assert.equal(app.readinessAdvice(70).title, "Train as planned");
    assert.equal(app.readinessLevel(40).tip, app.readinessAdvice(40).tip);
  } finally { restoreApp(); }
});

test("the empty Your week card is hidden, and What affects you moves last in compact", () => {
  try {
    stubApp(account());
    assert.equal(app.weekCardHTML(), "", "a new user has no Your week card");
    const v = legacyView(account({ layout: { home: { order: [], hidden: ["today"] } } }));
    const order = [...v.brief.matchAll(/data-metric="([a-z]+)"/g)].map((m) => m[1]);
    assert.equal(order[order.length - 1], "pattern");
    const roomy = account({ brief: { order: ["pattern", "train", "food", "week", "weight"], hidden: [], size: "expanded" }, layout: { home: { order: [], hidden: ["today"] } } });
    const e = legacyView(roomy);
    assert.equal([...e.brief.matchAll(/data-metric="([a-z]+)"/g)][0][1], "pattern");
  } finally { restoreApp(); }
});

test("the pattern wording is neutral", () => {
  const brief = readFileSync(new URL("../logger/js/shared/brief.js", import.meta.url), "utf8");
  const widgets = readFileSync(new URL("../logger/js/shared/home-widgets.js", import.meta.url), "utf8");
  assert.match(brief, /Worth watching/);
  assert.doesNotMatch(brief + widgets, /Working against you/);
});

test("the shell caches the defaults module on the v37 release", () => {
  const sw = readFileSync(new URL("../logger/sw.js", import.meta.url), "utf8");
  assert.match(sw, /js\/shared\/home-defaults\.js/);
  assert.match(sw, /const CACHE = "insight-shell-v37"/);
  assert.match(sw, /const STAGE = CACHE \+ "-next"/);
  assert.doesNotMatch(sw, /insight-shell-v30"/);
});

test("randomized account states hold every Home defaults invariant", () => {
  const seed = Number(process.env.HOME_DEFAULTS_SEED) || (Date.now() % 2147483647);
  const iterations = Number(process.env.HOME_DEFAULTS_ITERATIONS) || 600;
  console.log(`home-defaults seed=${seed} iterations=${iterations}`);
  const rnd = mulberry32(seed);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const flip = (p = 0.5) => rnd() < p;
  const catalog = Object.keys(HOME_WIDGETS);
  try {
    for (let i = 0; i < iterations; i++) {
      const ring = pick(["none", "ring", "demo", "lapsed", "waiting"]);
      const score = 40 + Math.floor(rnd() * 60);
      const days = ring === "ring" || ring === "lapsed" || ring === "demo" ? (flip(0.9) ? { [TODAY]: { date: TODAY, readiness: score, sleepScore: flip(0.8) ? 50 + Math.floor(rnd() * 50) : undefined, total: 25000 } } : {}) : {};
      const edited = flip(0.25);
      const hiddenSlots = ["readiness", "today", "brief"].filter(() => flip(0.2));
      const s = account({
        demo: ring === "demo",
        oura: { connected: ring !== "none" && ring !== "demo", lastError: ring === "lapsed" ? "membership_inactive" : null, days },
        goals: { sessionsPerWeek: flip() ? 1 + Math.floor(rnd() * 6) : null },
        doneThisWeek: Math.floor(rnd() * 5),
        profile: { weighIns: flip() ? [{ date: TODAY, kg: 60 + Math.floor(rnd() * 40) }] : [] },
        food: { ...(flip() ? { [TODAY]: { kcal: 500 + Math.floor(rnd() * 2000), p: 40 } } : {}), ...(flip() ? { [YESTERDAY]: { kcal: 1800, p: 120 } } : {}) },
        plan: { [TODAY]: pick([undefined, "rest", "push"]) },
        layout: edited
          ? { homeV2: { v: 2, items: catalog.filter(() => flip(0.4)), hidden: [], updatedAt: 1 + Math.floor(rnd() * 1e6) } }
          : { home: { order: [], hidden: hiddenSlots } },
      });
      const where = `seed=${seed} i=${i} ring=${ring} edited=${edited}`;
      const frozen = JSON.stringify(s);
      const v = legacyView(s);
      const html = edited ? app.homeHTML() : v.strip + v.card + v.brief;
      assert.equal(JSON.stringify(s), frozen, `state untouched. ${where}`);
      if (edited) {
        /* A real edit paints only its own cards: no strip, nothing empty for a ring that is not there. */
        assert.equal(v.strip, "", where);
        const painted = tileIdsIn(html);
        if (ring === "none") assert.equal(painted.some((id) => HOME_WIDGETS[id].needsOura), false, where);
        if (!days[TODAY] && ring !== "demo") assert.equal(painted.some((id) => HOME_WIDGETS[id].needsOura), false, `no Oura tile without a day. ${where}`);
        assert.doesNotMatch(html, /Connect a ring|No Oura yet|hw-miss/, where);
        continue;
      }
      const ids = tileIdsIn(v.strip);
      const ouraUser = ring === "ring" || ring === "demo" || ring === "waiting";
      assert.deepEqual(defaultHomeIds(s), ouraUser ? OURA_DEFAULT_IDS : PLAIN_DEFAULT_IDS, where);
      ids.forEach((id) => assert.ok(defaultHomeIds(s).includes(id), `${id} is a default for this user. ${where}`));
      assert.doesNotMatch(v.strip, EMPTY_TILE, where);
      assert.equal(new Set(ids).size, ids.length, where);
      const cardShows = v.card.includes("rcard") && !hiddenSlots.includes("readiness");
      if (cardShows) assert.equal(ids.includes("readiness"), false, `no duplicate readiness. ${where}`);
      /* A brief never repeats something already on Home. */
      const cardOnScreen = ring !== "none" || days[TODAY] ? v.card.includes("rcard") && !hiddenSlots.includes("readiness") : false;
      if (homeCardShowing(s, "readiness")) assert.doesNotMatch(v.brief, /data-metric="oura"/, where);
      if (cardOnScreen || ids.includes("readiness")) assert.doesNotMatch(v.brief, /data-metric="oura"/, where);
      if (!hiddenSlots.includes("today")) assert.doesNotMatch(v.brief, /data-metric="train"/, where);
      if (ids.includes("weekly-goal")) assert.doesNotMatch(v.brief, /data-metric="week"/, where);
      if (ids.includes("weight-trend")) assert.doesNotMatch(v.brief, /data-metric="weight"/, where);
      /* Information is not lost: a metric missing from the brief is on a tile or card. */
      if (!hiddenSlots.includes("brief")) {
        assert.match(v.brief, /class="brief-h"/, `brief keeps its headline. ${where}`);
        if (!ids.includes("weekly-goal")) assert.match(v.brief, /data-metric="week"/, where);
        if (!ids.includes("weight-trend")) assert.match(v.brief, /data-metric="weight"/, where);
      }
      /* The brief and the Readiness card never disagree. */
      if (days[TODAY]) {
        const advice = app.readinessAdvice(days[TODAY].readiness);
        const train = v.brief.match(/data-metric="train"[\s\S]*?<b>([^<]*)<\/b>/);
        if (train && s.plan[TODAY] !== "push" && s.plan[TODAY] !== "rest") assert.equal(train[1], advice.title, where);
        if (cardShows) assert.ok(v.card.includes(advice.tip), where);
        if (cardShows && !s.layout.homeV2 && train) assert.notEqual(train[1], advice.title, `brief repeats the Readiness card. ${where}`);
        if (train && ring !== "none" && ring !== "lapsed" && ring !== "waiting" && s.plan[TODAY] !== "rest") assert.doesNotMatch(v.brief, /Rest suggested/, where);
      }
    }
  } finally { restoreApp(); }
});
