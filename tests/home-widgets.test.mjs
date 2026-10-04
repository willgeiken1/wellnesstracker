import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { app } from "../logger/js/runtime.js";
import { HOME_REGISTRY_PAINT, HOME_WIDGETS, getHomeLayout, homeAwaitingSync, renderHomeWidgets, setHomeLayout } from "../logger/js/shared/home-widgets.js";
import "../logger/js/pages/home.js";

const IDS = [
  "readiness", "sleep-score", "sleep-duration", "hrv", "resting-hr", "steps",
  "weekly-goal", "food-today", "food-yesterday", "weight-trend", "cardio-minutes",
  "today", "this-week", "pattern", "headline", "muscles", "cardio", "last-night",
];

const OURA = new Set(["readiness", "sleep-score", "sleep-duration", "hrv", "resting-hr", "steps", "last-night"]);
const SMALL = new Set(["readiness", "sleep-score", "sleep-duration", "hrv", "resting-hr", "steps", "weekly-goal", "food-today", "food-yesterday", "weight-trend", "cardio-minutes"]);
const CATEGORIES = new Set(["recovery", "training", "nutrition", "body"]);

const day = {
  date: "2026-10-04",
  readiness: 88,
  sleepScore: 80,
  total: 28800,
  deep: 5400,
  rem: 7200,
  light: 15000,
  awake: 1200,
  hrv: 62,
  rhr: 51,
  steps: 9400,
};

const snap = {
  kind: "snapshot",
  today: "2026-10-04",
  demo: false,
  oura: day,
  hrvAvg: 55,
  steps: 9400,
  stepsLabel: "Yesterday",
  weekGoal: { done: 2, goal: 4 },
  foodToday: { logged: true, kcal: 1200, protein: 90, targetKcal: 2400, targetProtein: 160 },
  foodYesterday: { logged: true, kcal: 2100, protein: 140, targetKcal: 2400, targetProtein: 160 },
  weight: { empty: false, value: "+0.4 lb/wk", sub: "Last 181.0 lb" },
  cardio: { minutes: 42, goal: 150 },
  pattern: { label: "Good for you", line: "Sleep was long; lifts tend to be higher.", tone: "up" },
  headline: "Train as planned",
  muscleMode: "basic",
  hero: { mode: "empty", chips: ["Push"] },
  weekLabel: "This week",
  weekDays: [{ cls: "wk today", dow: "Sun", num: "4", label: "+" }],
};

test("the registry is exactly the agreed ids, sizes, and Oura flags", () => {
  assert.deepEqual(Object.keys(HOME_WIDGETS), IDS);
  IDS.forEach((id) => {
    const w = HOME_WIDGETS[id];
    assert.equal(w.id, id);
    assert.equal(typeof w.name, "string");
    assert.ok(w.name.length > 1);
    assert.ok(CATEGORIES.has(w.category), w.category);
    assert.equal(w.size, SMALL.has(id) ? "small" : "medium");
    assert.equal(w.needsOura, OURA.has(id));
    assert.equal(typeof w.render, "function");
    assert.equal(typeof w.preview, "function");
  });
  assert.equal(HOME_WIDGETS.readiness.category, "recovery");
  assert.equal(HOME_WIDGETS["food-today"].category, "nutrition");
  assert.equal(HOME_WIDGETS["weight-trend"].category, "body");
  assert.equal(HOME_WIDGETS.today.category, "training");
  assert.equal(HOME_WIDGETS["last-night"].category, "recovery");
});

test("small cards render their numbers, and steps and last night stay blank without data", () => {
  assert.match(HOME_WIDGETS.readiness.render(snap), /88/);
  assert.match(HOME_WIDGETS["sleep-score"].render(snap), /80/);
  assert.match(HOME_WIDGETS.hrv.render(snap), /62 ms/);
  assert.match(HOME_WIDGETS.hrv.render(snap), /vs 30-day avg/);
  assert.match(HOME_WIDGETS["resting-hr"].render(snap), /51 bpm/);
  assert.match(HOME_WIDGETS.steps.render(snap), /9,400/);
  assert.match(HOME_WIDGETS["weekly-goal"].render(snap), /2 of 4/);
  assert.match(HOME_WIDGETS["food-today"].render(snap), /1,200 left/);
  assert.match(HOME_WIDGETS["food-today"].render(snap), /Protein 90\/160 g/);
  assert.match(HOME_WIDGETS["food-yesterday"].render(snap), /2,100\/2,400/);
  assert.match(HOME_WIDGETS["weight-trend"].render(snap), /\+0\.4 lb\/wk/);
  assert.match(HOME_WIDGETS["cardio-minutes"].render(snap), /42 min/);
  assert.match(HOME_WIDGETS.headline.render(snap), /Train as planned/);
  assert.match(HOME_WIDGETS.pattern.render(snap), /Sleep was long/);
  assert.match(HOME_WIDGETS.pattern.render(snap), /What affects you/);
  assert.match(HOME_WIDGETS["weight-trend"].preview({
    today: "2026-10-04", sessions: [], foodDays: {}, oura: {},
    weighIns: [{ date: "2026-10-01", kg: 80 }],
  }), /Need a few more over 10 days/);
  assert.match(HOME_WIDGETS["last-night"].render(snap), /Last night/);
  assert.match(HOME_WIDGETS["last-night"].render(snap), /Deep/);
  assert.equal(HOME_WIDGETS.steps.render({ kind: "snapshot", steps: null, oura: { readiness: 70, date: "2026-10-04" } }), "");
  assert.equal(HOME_WIDGETS["last-night"].render({ kind: "snapshot", oura: { readiness: 70 } }), "");
  assert.match(HOME_WIDGETS.readiness.render({ kind: "snapshot", oura: null }), /No Oura yet/);
});

test("preview accepts a demo bundle and the live sections delegate when asked", () => {
  const demo = {
    today: "2026-10-04",
    sessions: [],
    foodDays: { "2026-10-04": [{ servings: 1, base: { kcal: 1800, p: 110, c: 0, f: 0 } }] },
    weighIns: [{ date: "2026-09-01", kg: 80 }, { date: "2026-09-20", kg: 81 }, { date: "2026-10-02", kg: 82 }],
    oura: { "2026-10-04": day },
    targets: { kcal: 2500, protein: 160 },
  };
  const html = HOME_WIDGETS.readiness.preview(demo);
  assert.match(html, /88/);
  assert.match(HOME_WIDGETS["food-today"].preview(demo), /700 left/);
  assert.match(HOME_WIDGETS.steps.preview(demo), /9,400/);
  assert.match(HOME_WIDGETS["weight-trend"].preview(demo), /82/);
  app.homeHeroHTML = () => "LIVE-HERO";
  app.homeWeekHTML = () => "LIVE-WEEK";
  app.cardioWidgetHTML = () => "LIVE-CARDIO";
  assert.equal(HOME_WIDGETS.today.render({ live: true }), "LIVE-HERO");
  assert.equal(HOME_WIDGETS["this-week"].render({ live: true }), "LIVE-WEEK");
  assert.equal(HOME_WIDGETS.cardio.render({ live: true }), "LIVE-CARDIO");
  assert.match(HOME_WIDGETS.today.preview(demo), /Nothing planned/);
  assert.match(HOME_WIDGETS.muscles.preview({ kind: "snapshot", muscleMode: "advanced" }), /Detailed map|Muscles this week|sec/);
});

test("a missing homeV2 is a temporary equivalent and is not written", () => {
  const state = { muscleMode: "basic", layout: {}, brief: null };
  const before = JSON.stringify(state);
  const layout = getHomeLayout(state);
  assert.equal(JSON.stringify(state), before);
  assert.equal(layout.v, 2);
  assert.equal(layout.updatedAt, 0);
  assert.deepEqual(layout.items.filter((id) => !layout.hidden.includes(id)), [
    "headline", "pattern", "readiness", "sleep-score", "sleep-duration", "hrv", "resting-hr", "steps",
    "food-yesterday", "weekly-goal", "weight-trend", "today", "this-week", "cardio", "muscles",
  ]);
  assert.deepEqual(layout.hidden, ["food-today", "cardio-minutes", "last-night"]);
  layout.items.push("nope");
  assert.equal(state.layout.homeV2, undefined);
});

test("saved homeV2 is returned as a copy, and setHomeLayout leaves the old keys alone", () => {
  const state = {
    layout: { home: { order: ["today"], hidden: ["brief"] }, homeV2: { v: 2, items: ["today", "cardio"], hidden: ["steps"], updatedAt: 40 } },
    brief: { order: ["food"], hidden: ["weight"], updatedAt: 3 },
  };
  const got = getHomeLayout(state);
  got.items.push("pattern");
  got.hidden.push("today");
  assert.deepEqual(state.layout.homeV2.items, ["today", "cardio"]);
  assert.deepEqual(state.layout.homeV2.hidden, ["steps"]);
  const before = Date.now();
  const written = setHomeLayout(state, { items: ["muscles", "today"], hidden: ["hrv"], updatedAt: 70 });
  assert.equal(written.v, 2);
  assert.ok(written.updatedAt >= before);
  assert.deepEqual(state.layout.home, { order: ["today"], hidden: ["brief"] });
  assert.equal(state.brief.updatedAt, 3);
  assert.deepEqual(getHomeLayout(state).items, ["muscles", "today"]);
});

test("an edit clears migrated, migratedAt, and migratedFrom, then stamps now", () => {
  const state = {
    layout: {
      homeV2: {
        v: 2,
        items: ["today"],
        hidden: [],
        updatedAt: 0,
        migrated: true,
        migratedAt: 12,
        migratedFrom: "{\"order\":[\"brief\"]}",
        ouraSeeded: true,
      },
    },
  };
  const before = Date.now();
  const written = setHomeLayout(state, { items: ["cardio", "today"], hidden: ["steps"] });
  assert.equal(written.migrated, undefined);
  assert.equal(state.layout.homeV2.migrated, undefined);
  assert.equal(written.migratedAt, undefined);
  assert.equal(written.migratedFrom, undefined);
  assert.equal(state.layout.homeV2.migratedAt, undefined);
  assert.equal(state.layout.homeV2.migratedFrom, undefined);
  assert.equal(written.ouraSeeded, true);
  assert.ok(written.updatedAt >= before);
  assert.notEqual(written.updatedAt, 0);
  assert.deepEqual(written.items, ["cardio", "today"]);
  assert.deepEqual(written.hidden, ["steps"]);
  const again = getHomeLayout(state);
  again.items.push("nope");
  assert.deepEqual(state.layout.homeV2.items, ["cardio", "today"]);
  assert.equal(again.ouraSeeded, true);
});

test("setHomeLayout keeps ouraSeeded when the edit passes it in", () => {
  const state = { layout: { homeV2: { v: 2, items: ["today"], hidden: [], updatedAt: 1 } } };
  const written = setHomeLayout(state, { items: ["today", "readiness"], hidden: [], ouraSeeded: true });
  assert.equal(written.ouraSeeded, true);
  assert.equal(state.layout.homeV2.ouraSeeded, true);
  assert.equal(getHomeLayout(state).ouraSeeded, true);
  const left = setHomeLayout(state, { items: ["today"], hidden: ["readiness"] });
  assert.equal(left.ouraSeeded, true);
});

test("setHomeLayout and getHomeLayout keep each known id once", () => {
  const state = { layout: {} };
  const written = setHomeLayout(state, {
    items: ["today", null, "", "today", "nope", "cardio", "cardio"],
    hidden: ["steps", "steps", "missing", "", null, "today"],
  });
  assert.deepEqual(written.items, ["today", "cardio"]);
  assert.deepEqual(written.hidden, ["steps", "today"]);
  state.layout.homeV2.items = ["hrv", "hrv", "ghost", null, ""];
  state.layout.homeV2.hidden = ["muscles", "nope", "muscles"];
  const got = getHomeLayout(state);
  assert.deepEqual(got.items, ["hrv"]);
  assert.deepEqual(got.hidden, ["muscles"]);
  assert.deepEqual(state.layout.homeV2.items, ["hrv", "hrv", "ghost", null, ""]);
});

test("hiding the brief or a brief tile changes the stand-in, not stored state", () => {
  const hiddenBrief = getHomeLayout({
    muscleMode: "basic",
    layout: { home: { order: [], hidden: ["brief", "map-adv"] } },
  });
  const shown = hiddenBrief.items.filter((id) => !hiddenBrief.hidden.includes(id));
  assert.deepEqual(shown, ["readiness", "today", "this-week", "cardio", "muscles"]);
  assert.ok(hiddenBrief.hidden.includes("headline"));
  assert.ok(hiddenBrief.hidden.includes("food-yesterday"));

  const noWeight = getHomeLayout({
    layout: { home: { order: [], hidden: ["map-adv"] } },
    brief: { order: ["weight", "pattern", "oura", "train", "food", "week"], hidden: ["weight"], updatedAt: 1 },
  });
  const visible = noWeight.items.filter((id) => !noWeight.hidden.includes(id));
  assert.equal(visible[0], "headline");
  assert.equal(visible.includes("weight-trend"), false);
  assert.equal(visible.includes("pattern"), true);
});

async function loadCloud() {
  globalThis.window = globalThis.window || {};
  globalThis.location = globalThis.location || { search: "", pathname: "/" };
  globalThis.history = globalThis.history || { replaceState() {} };
  await import("../logger/js/shared/cloud.js");
  if (typeof app.mergeMachineNotes !== "function") app.mergeMachineNotes = (local) => local || {};
}

function pullLayout(state, remote) {
  state.sessions = state.sessions || [];
  const prev = app.state;
  app.state = state;
  try { app.mergeRemote(remote); }
  finally { app.state = prev; }
}

test("an edit beats a migration and a missing remote homeV2 stays put", async () => {
  await loadCloud();
  const state = {
    settingsAt: 5,
    muscleMode: "basic",
    uniEx: {},
    sessions: [],
    layout: { home: { order: ["today"], hidden: [] }, homeV2: { v: 2, items: ["today"], hidden: [], updatedAt: 50, migrated: true, ouraSeeded: true } },
  };
  pullLayout(state, {
    settingsAt: 90,
    muscleMode: "advanced",
    uniEx: { Curl: true },
    layout: { home: { order: ["week"], hidden: ["brief"] }, homeV2: { v: 2, items: ["cardio"], hidden: [], updatedAt: 10 } },
  });
  assert.equal(state.settingsAt, 90);
  assert.equal(state.muscleMode, "advanced");
  assert.equal(state.uniEx.Curl, true);
  assert.deepEqual(state.layout.home, { order: ["week"], hidden: ["brief"] });
  assert.deepEqual(state.layout.homeV2.items, ["cardio"]);
  assert.equal(state.layout.homeV2.updatedAt, 10);
  assert.equal(state.layout.homeV2.ouraSeeded, true);
  assert.notEqual(state.layout.homeV2.migrated, true);

  const kept = {
    settingsAt: 100,
    sessions: [],
    layout: { home: { order: ["today"], hidden: [] }, homeV2: { v: 2, items: ["muscles"], hidden: [], updatedAt: 4 } },
  };
  pullLayout(kept, {
    settingsAt: 1,
    layout: { home: { order: ["nope"], hidden: [] }, homeV2: { v: 2, items: ["steps"], hidden: ["today"], updatedAt: 80 } },
  });
  assert.deepEqual(kept.layout.home.order, ["today"]);
  assert.deepEqual(kept.layout.homeV2.items, ["steps"]);
  assert.deepEqual(kept.layout.homeV2.hidden, ["today"]);

  const clobber = {
    settingsAt: 1,
    sessions: [],
    layout: { home: { order: ["today"], hidden: [] }, homeV2: { v: 2, items: ["headline"], hidden: [], updatedAt: 15 } },
  };
  pullLayout(clobber, { settingsAt: 40, layout: { home: { order: ["cardio"], hidden: [] } } });
  assert.deepEqual(clobber.layout.home.order, ["cardio"]);
  assert.deepEqual(clobber.layout.homeV2.items, ["headline"]);
});

test("a v2 stack skips hidden ids and blank widgets", () => {
  const html = renderHomeWidgets({
    v: 2,
    items: ["steps", "readiness", "today"],
    hidden: ["today"],
    updatedAt: 1,
  }, { kind: "snapshot", steps: null, oura: day, hero: { mode: "rest" } });
  assert.match(html, /data-hw="readiness"/);
  assert.doesNotMatch(html, /data-hw="steps"/);
  assert.doesNotMatch(html, /data-hw="today"/);
  assert.match(html, /class="home-v2"/);
});

test("the shell cache names the registry", () => {
  const sw = readFileSync(new URL("../logger/sw.js", import.meta.url), "utf8");
  const sentry = readFileSync(new URL("../logger/js/sentry.js", import.meta.url), "utf8");
  assert.match(sw, /insight-shell-v27/);
  assert.match(sentry, /insight-shell-v27/);
  assert.match(sw, /js\/shared\/oura-gate\.js/);
  assert.match(sw, /js\/shared\/home-migrate\.js/);
  assert.match(sw, /js\/shared\/home-widgets\.js/);
  assert.match(sw, /css\/home-widgets\.css/);
});

test("render with no data uses the live snapshot, and preview keeps demo numbers", () => {
  const prevDemo = app.makeDemo;
  const prevSrc = app.src;
  const prevState = app.state;
  app.makeDemo = () => ({
    today: "2026-10-04",
    sessions: [],
    foodDays: {},
    oura: { "2026-10-04": { date: "2026-10-04", readiness: 88 } },
  });
  app.src = () => ({ oura: {}, sessions: [] });
  app.state = { demo: false };
  const live = HOME_WIDGETS.readiness.render();
  assert.match(live, /No Oura yet/);
  assert.doesNotMatch(live, /88/);
  assert.match(HOME_WIDGETS.readiness.render(undefined), /No Oura yet/);
  assert.match(HOME_WIDGETS.readiness.preview(), /88/);
  assert.match(HOME_WIDGETS.readiness.preview(app.makeDemo()), /88/);
  app.makeDemo = prevDemo;
  app.src = prevSrc;
  app.state = prevState;
});

function wdgsBlock(html) {
  const marker = '<div class="wdgs';
  const start = html.indexOf(marker);
  if (start < 0) return "";
  let depth = 0;
  let i = start;
  while (i < html.length) {
    const nextOpen = html.indexOf("<div", i);
    const nextClose = html.indexOf("</div>", i);
    if (nextClose < 0) return html.slice(start);
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      i = nextOpen + 4;
    } else {
      depth -= 1;
      i = nextClose + 6;
      if (depth === 0) return html.slice(start, i);
    }
  }
  return html.slice(start);
}

let widgetLoad = null;
function loadWidgets() {
  if (!widgetLoad) {
    const listeners = [];
    globalThis.document = {
      addEventListener(type, fn) { listeners.push({ type, fn }); },
      querySelectorAll() { return []; },
    };
    widgetLoad = import("../logger/js/shared/widgets.js").then(() => listeners);
  }
  return widgetLoad;
}

test("a saved homeV2 still paints the legacy stack, and the weigh-in nudge sits inside the brief", async () => {
  assert.equal(HOME_REGISTRY_PAINT, false);
  await loadWidgets();
  const prev = {
    state: app.state,
    ui: app.ui,
    today: app.today,
    pageHead: app.pageHead,
    firstName: app.firstName,
    esc: app.esc,
    greeting: app.greeting,
    fmtDate: app.fmtDate,
    addButtonHTML: app.addButtonHTML,
    weekCardHTML: app.weekCardHTML,
    weighReminderHTML: app.weighReminderHTML,
    briefHTML: app.briefHTML,
    readinessCardHTML: app.readinessCardHTML,
    muscleMapHTML: app.muscleMapHTML,
    muscleMode: app.muscleMode,
    todayRender: app.HOME_WIDGETS.today.render,
    weekRender: app.HOME_WIDGETS["this-week"].render,
    cardioRender: app.HOME_WIDGETS.cardio.render,
  };
  app.today = () => "2026-10-04";
  app.ui = { edit: null };
  app.muscleMode = () => "basic";
  app.state = {
    layout: {
      home: { order: ["brief", "today"], hidden: ["map-adv"] },
      homeV2: { v: 2, items: ["steps"], hidden: [], updatedAt: 9, migratedAt: 4 },
    },
    plan: {},
    workouts: [],
  };
  app.pageHead = () => "<header>Home</header>";
  app.firstName = () => "";
  app.esc = (s) => String(s ?? "");
  app.greeting = () => "";
  app.fmtDate = () => "Sunday";
  app.addButtonHTML = () => "";
  app.weekCardHTML = () => "";
  app.weighReminderHTML = () => `<button class="nudge" data-action="weigh-open"><b>Time for a weigh-in</b></button>`;
  app.briefHTML = () => `<section class="brief">Morning brief</section>`;
  app.readinessCardHTML = () => `<div class="card">Readiness</div>`;
  app.muscleMapHTML = () => `<div class="map"></div>`;
  app.HOME_WIDGETS.today.render = () => `<div class="hero">Today</div>`;
  app.HOME_WIDGETS["this-week"].render = () => `<section class="sec">Week</section>`;
  app.HOME_WIDGETS.cardio.render = () => `<section class="sec">Cardio</section>`;
  try {
    const html = app.homeHTML();
    assert.match(html, /Morning brief/);
    assert.match(html, /class="card">Readiness/);
    assert.doesNotMatch(html, /class="home-v2"|oura-wait|data-hw=/);
    assert.match(html, /class="nudge"/);
    const stack = wdgsBlock(html);
    const briefAt = stack.indexOf('data-w="brief"');
    const nudgeAt = stack.indexOf('class="nudge"');
    const nextAt = stack.indexOf('data-w="today"');
    assert.ok(briefAt >= 0 && nudgeAt > briefAt && nextAt > nudgeAt);
    assert.ok(html.indexOf('class="nudge"') > html.indexOf('class="wdgs"'));
    app.state.layout.home.hidden = ["brief", "map-adv"];
    const hiddenBrief = app.homeHTML();
    assert.doesNotMatch(hiddenBrief, /class="nudge"|data-w="brief"/);
  } finally {
    app.state = prev.state;
    app.ui = prev.ui;
    app.today = prev.today;
    app.pageHead = prev.pageHead;
    app.firstName = prev.firstName;
    app.esc = prev.esc;
    app.greeting = prev.greeting;
    app.fmtDate = prev.fmtDate;
    app.addButtonHTML = prev.addButtonHTML;
    app.weekCardHTML = prev.weekCardHTML;
    app.weighReminderHTML = prev.weighReminderHTML;
    app.briefHTML = prev.briefHTML;
    app.readinessCardHTML = prev.readinessCardHTML;
    app.muscleMapHTML = prev.muscleMapHTML;
    app.muscleMode = prev.muscleMode;
    app.HOME_WIDGETS.today.render = prev.todayRender;
    app.HOME_WIDGETS["this-week"].render = prev.weekRender;
    app.HOME_WIDGETS.cardio.render = prev.cardioRender;
  }
});

test("a drag drops blank widget ids before saving the home order", async () => {
  const listeners = await loadWidgets();
  const pointerup = listeners.filter((entry) => entry.type === "pointerup").pop().fn;
  const prev = { state: app.state, ui: app.ui, render: app.render, save: app.save, wdrag: app.wdrag };
  app.state = { layout: { home: { order: ["week", "brief", "today"], hidden: [] } }, workouts: [] };
  app.ui = { ...(app.ui || {}), edit: "home" };
  app.save = () => {};
  app.render = () => {};
  app.wdrag = {
    box: {
      dataset: { page: "home" },
      children: [
        { dataset: { w: "today" } },
        { dataset: {} },
        { dataset: { w: "brief" } },
      ],
    },
    el: { classList: { remove() {} }, style: {} },
  };
  try {
    pointerup({});
    assert.deepEqual(app.state.layout.home.order, ["today", "brief", "week"]);
    assert.equal(app.state.layout.home.order.every(Boolean), true);
  } finally {
    app.state = prev.state;
    app.ui = prev.ui;
    app.render = prev.render;
    app.save = prev.save;
    app.wdrag = prev.wdrag;
  }
});

test("a string or array layout is not spread over the saved home", async () => {
  await loadCloud();
  const state = {
    settingsAt: 1,
    muscleMode: "basic",
    sessions: [],
    layout: {
      home: { order: ["today"], hidden: ["brief"] },
      extra: 1,
      homeV2: { v: 2, items: ["today"], hidden: ["steps"], updatedAt: 20, ouraSeeded: true },
    },
  };
  pullLayout(state, { settingsAt: 90, muscleMode: "advanced", layout: "{\"home\":true}" });
  assert.equal(state.settingsAt, 90);
  assert.equal(state.muscleMode, "advanced");
  assert.equal(state.layout[0], undefined);
  assert.equal(state.layout.extra, 1);
  assert.deepEqual(state.layout.home, { order: ["today"], hidden: ["brief"] });
  assert.deepEqual(state.layout.homeV2.items, ["today"]);
  assert.deepEqual(state.layout.homeV2.hidden, ["steps"]);
  assert.equal(state.layout.homeV2.ouraSeeded, true);

  const listed = {
    settingsAt: 1,
    sessions: [],
    layout: { home: { order: ["week"], hidden: [] }, homeV2: { v: 2, items: ["cardio"], hidden: [], updatedAt: 3 } },
  };
  pullLayout(listed, { settingsAt: 10, layout: ["today", "week"] });
  assert.deepEqual(listed.layout.home.order, ["week"]);
  assert.equal(listed.layout[0], undefined);
  assert.deepEqual(listed.layout.homeV2.items, ["cardio"]);
});

test("homeAwaitingSync is true only for a connected ring with no day yet", () => {
  const prevState = app.state;
  const prevSrc = app.src;
  try {
    app.state = { oura: { connected: true } };
    app.src = () => ({ oura: {} });
    assert.equal(homeAwaitingSync(), true);
    const waiting = HOME_WIDGETS.readiness.render();
    const sleep = HOME_WIDGETS["sleep-score"].render();
    assert.match(waiting, /–/);
    assert.match(sleep, /–/);
    assert.doesNotMatch(`${waiting} ${sleep}`, /No Oura yet|Connect a ring|Waiting for first sync/);
    app.src = () => ({ oura: { "2026-10-03": { steps: 100 } } });
    assert.equal(homeAwaitingSync(), false);
    app.state = { oura: { connected: false } };
    app.src = () => ({ oura: {} });
    assert.equal(homeAwaitingSync(), false);
    app.src = () => { throw new Error("offline"); };
    app.state = { oura: { connected: true } };
    assert.equal(homeAwaitingSync(), true);
  } finally {
    app.state = prevState;
    app.src = prevSrc;
  }
});
