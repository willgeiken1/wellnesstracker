import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { app } from "../logger/js/runtime.js";
import { BRIEF_TILE_IDS, HOME_REGISTRY_PAINT, HOME_WIDGETS, commitHomeEditor, getHomeLayout, homeAwaitingSync, homeDraftUnchanged, homeEditorDraft, homeRegistryActive, renderHomeWidgets, setHomeLayout, widgetSize } from "../logger/js/shared/home-widgets.js";
import "../logger/js/pages/home.js";
import "../logger/js/shared/brief.js";

const IDS = [
  "readiness", "sleep-score", "sleep-duration", "hrv", "resting-hr", "steps",
  "weekly-goal", "food-today", "food-yesterday", "weight-trend", "cardio-minutes",
  "brief", "today", "this-week", "pattern", "headline", "muscles", "cardio", "last-night",
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
  assert.equal(HOME_WIDGETS.brief.category, "training");
  assert.equal(HOME_WIDGETS.brief.name, "Morning brief");
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
  }), /Too early to tell/);
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
  const visible = ["brief", "readiness", "today", "this-week", "cardio", "muscles"];
  assert.deepEqual(layout.items.filter((id) => !layout.hidden.includes(id)), visible);
  assert.deepEqual(layout.hidden, IDS.filter((id) => !visible.includes(id)));
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
  assert.deepEqual(written.items, ["today", "nope", "cardio"]);
  assert.deepEqual(written.hidden, ["steps", "missing", "today"]);
  state.layout.homeV2.items = ["hrv", "hrv", "ghost", null, ""];
  state.layout.homeV2.hidden = ["muscles", "nope", "muscles"];
  const got = getHomeLayout(state);
  assert.deepEqual(got.items, ["hrv"]);
  assert.deepEqual(got.hidden, ["muscles"]);
  assert.deepEqual(state.layout.homeV2.items, ["hrv", "hrv", "ghost", null, ""]);
  assert.equal(renderHomeWidgets(got, snap).includes('data-hw="ghost"'), false);
});

test("setHomeLayout keeps unknown ids already stored and does not render them", () => {
  const state = {
    layout: { homeV2: { v: 2, items: ["today", "future-widget", "cardio"], hidden: ["next-card"], updatedAt: 4, sizes: { "future-widget": "medium" } } },
  };
  const written = setHomeLayout(state, { items: ["muscles", "today"], hidden: ["hrv"] });
  assert.deepEqual(written.items, ["muscles", "today", "future-widget"]);
  assert.ok(written.hidden.includes("next-card"));
  assert.ok(written.hidden.includes("hrv"));
  assert.equal(written.sizes["future-widget"], "medium");
  const painted = getHomeLayout(state);
  assert.deepEqual(painted.items, ["muscles", "today"]);
  assert.equal(painted.hidden.includes("next-card"), false);
  assert.equal(renderHomeWidgets(state.layout.homeV2, snap).includes("future-widget"), false);
  assert.equal(JSON.stringify(state).includes("future-widget"), true);
});

test("the editor save clears a migration and writes the chosen cards", () => {
  const state = {
    layout: {
      home: { order: ["today"], hidden: [] },
      homeV2: {
        v: 2,
        items: ["today", "future-widget"],
        hidden: ["steps"],
        updatedAt: 8,
        migrated: true,
        migratedAt: 3,
        migratedFrom: "home",
        ouraSeeded: true,
        sizes: { "future-widget": "small", readiness: "medium" },
      },
    },
  };
  const before = Date.now();
  const draft = homeEditorDraft(state);
  assert.deepEqual(draft.items, ["today"]);
  assert.equal(draft.hidden.includes("steps"), false);
  assert.equal(draft.sizes["future-widget"], "small");
  draft.items = ["cardio", "headline"];
  draft.hidden = ["today", "steps"];
  draft.sizes = { ...draft.sizes, headline: "small", readiness: "medium", today: "small" };
  const written = commitHomeEditor(state, draft);
  assert.equal(written.migrated, undefined);
  assert.equal(written.migratedAt, undefined);
  assert.equal(written.migratedFrom, undefined);
  assert.equal(written.ouraSeeded, true);
  assert.ok(written.updatedAt >= before);
  assert.deepEqual(written.items, ["cardio", "headline", "future-widget"]);
  assert.ok(written.hidden.includes("today"));
  assert.ok(written.hidden.includes("steps"));
  assert.equal(written.sizes.headline, "small");
  assert.equal(written.sizes.readiness, "medium");
  assert.equal(written.sizes.today, undefined);
  assert.equal(written.sizes["future-widget"], "small");
  assert.equal(widgetSize("headline", written), "small");
  assert.equal(widgetSize("readiness", written), "medium");
  assert.equal(widgetSize("today", written), "medium");
  assert.equal(homeRegistryActive(state), true);
  assert.equal(state.layout.home.order[0], "today");
  const html = renderHomeWidgets(getHomeLayout(state), snap);
  assert.match(html, /data-hw="headline"/);
  assert.doesNotMatch(html, /span-m" data-hw="headline"/);
  assert.match(renderHomeWidgets({ items: ["readiness"], hidden: [], sizes: { readiness: "medium" } }, snap), /span-m" data-hw="readiness"/);
  assert.doesNotMatch(renderHomeWidgets({ items: ["readiness"], hidden: [] }, snap), /span-m/);
  assert.equal(html.includes("future-widget"), false);
  const again = homeEditorDraft(state);
  again.sizes = { ...again.sizes, headline: "medium", readiness: "small" };
  const cleared = commitHomeEditor(state, again);
  assert.equal(cleared.sizes.headline, undefined);
  assert.equal(cleared.sizes.readiness, undefined);
  assert.equal(cleared.sizes["future-widget"], "small");
});

test("hiding the brief carries into the stand-in and does not explode its metrics", () => {
  const hiddenBrief = getHomeLayout({
    muscleMode: "basic",
    layout: { home: { order: [], hidden: ["brief", "map-adv"] } },
  });
  const shown = hiddenBrief.items.filter((id) => !hiddenBrief.hidden.includes(id));
  assert.deepEqual(shown, ["readiness", "today", "this-week", "cardio", "muscles"]);
  assert.ok(hiddenBrief.hidden.includes("brief"));
  assert.ok(hiddenBrief.hidden.includes("headline"));
  assert.ok(hiddenBrief.hidden.includes("food-yesterday"));

  const noWeight = getHomeLayout({
    layout: { home: { order: [], hidden: ["map-adv"] } },
    brief: { order: ["weight", "pattern", "oura", "train", "food", "week"], hidden: ["weight"], updatedAt: 1 },
  });
  const visible = noWeight.items.filter((id) => !noWeight.hidden.includes(id));
  assert.equal(visible[0], "brief");
  assert.equal(visible.includes("weight-trend"), false);
  assert.equal(visible.includes("pattern"), false);
  assert.equal(visible.includes("headline"), false);
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
  assert.match(sw, /insight-shell-v42/);
  assert.match(sentry, /insight-shell-v42/);
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

test("a real home edit paints the registry and keeps the weigh-in nudge inside the brief", async () => {
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
    snapshotFromApp: app.snapshotFromApp,
    todayRender: app.HOME_WIDGETS.today.render,
    stepsRender: app.HOME_WIDGETS.steps.render,
    headlineRender: app.HOME_WIDGETS.headline.render,
  };
  app.today = () => "2026-10-04";
  app.ui = { edit: null };
  app.state = {
    layout: {
      home: { order: ["brief", "today"], hidden: ["map-adv"] },
      homeV2: { v: 2, items: ["brief", "this-week", "future-widget"], hidden: [], updatedAt: 9 },
    },
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
  app.snapshotFromApp = () => ({ live: true });
  app.HOME_WIDGETS.today.render = () => `<div class="hero">Today</div>`;
  app.HOME_WIDGETS.steps.render = () => `<article class="hw">Steps</article>`;
  app.HOME_WIDGETS.headline.render = () => `<section class="hw">Headline</section>`;
  try {
    const html = app.homeHTML();
    assert.match(html, /class="home-v2"/);
    assert.match(html, /data-hw="brief"/);
    assert.match(html, /data-hw="this-week"/);
    assert.doesNotMatch(html, /future-widget|class="wdgs|data-hw="headline"/);
    const slot = html.slice(html.indexOf('data-hw="brief"'));
    const briefAt = slot.indexOf('class="brief"');
    const nudgeAt = slot.indexOf('class="nudge"');
    const briefEnd = slot.indexOf("</section>");
    assert.ok(briefAt >= 0 && nudgeAt > briefAt && briefEnd > nudgeAt);
    assert.equal((html.match(/class="brief"/g) || []).length, 1);

    app.state.layout.homeV2 = { v: 2, items: ["headline", "today"], hidden: ["brief"], updatedAt: 9 };
    const tiles = app.homeHTML();
    assert.match(tiles, /data-hw="headline"/);
    assert.doesNotMatch(tiles, /class="brief"|class="nudge"/);

    app.ui.homeDraft = { items: ["headline", "today", "future-widget"], hidden: ["steps"], sizes: {} };
    app.ui.homeEdit = true;
    const editor = app.homeHTML();
    assert.match(editor, /data-action="home-save"/);
    assert.match(editor, /data-action="home-gallery"/);
    assert.match(editor, /class="hw-slot span-m" data-hw="headline"/);
    assert.match(editor, /data-action="home-remove" data-id="headline" aria-label="Remove Daily headline"/);
    assert.doesNotMatch(editor, /home-up|home-down|home-size|hw-grip|future-widget/);
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
    app.snapshotFromApp = prev.snapshotFromApp;
    app.HOME_WIDGETS.today.render = prev.todayRender;
    app.HOME_WIDGETS.steps.render = prev.stepsRender;
    app.HOME_WIDGETS.headline.render = prev.headlineRender;
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

test("the first-save draft keeps the brief and leaves its metrics and a missing ring out", () => {
  const plain = { muscleMode: "basic", layout: {}, oura: { connected: false } };
  const draft = homeEditorDraft(plain);
  assert.deepEqual(draft.items, ["brief", "this-week", "cardio", "muscles"]);
  assert.equal(draft.items.some((id) => BRIEF_TILE_IDS.includes(id)), false);
  assert.equal(draft.items.concat(draft.hidden).some((id) => HOME_WIDGETS[id].needsOura), false);
  assert.equal(homeDraftUnchanged(draft, homeEditorDraft(plain)), true);
  const moved = { ...draft, items: draft.items.slice().reverse() };
  assert.equal(homeDraftUnchanged(moved, homeEditorDraft(plain)), false);

  const hiddenBrief = homeEditorDraft({
    muscleMode: "basic",
    layout: { home: { order: [], hidden: ["brief"] } },
    oura: { connected: false },
  });
  assert.equal(hiddenBrief.items.includes("brief"), false);
  assert.ok(hiddenBrief.hidden.includes("brief"));
  assert.ok(hiddenBrief.items.includes("today"));

  const demo = homeEditorDraft({ demo: true, muscleMode: "basic", layout: {}, oura: { connected: false } });
  assert.deepEqual(demo.items, ["brief", "readiness", "this-week", "cardio", "muscles"]);
  assert.equal(demo.items.some((id) => BRIEF_TILE_IDS.includes(id)), false);
  assert.ok(demo.hidden.includes("last-night"));

  const saved = {
    oura: { connected: false },
    layout: { homeV2: { v: 2, items: ["readiness", "brief", "today"], hidden: ["steps"], updatedAt: 3 } },
  };
  const again = homeEditorDraft(saved);
  assert.deepEqual(again.items, ["readiness", "brief", "today"]);
  assert.ok(again.hidden.includes("steps"));
});

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("any layout containing brief paints one brief card", () => {
  const rnd = mulberry32(0x5fe1744);
  const ids = Object.keys(HOME_WIDGETS);
  const phrase = (id) => `Only on the ${id} card zz`;
  const prevRender = {};
  ids.forEach((id) => {
    prevRender[id] = HOME_WIDGETS[id].render;
    HOME_WIDGETS[id].render = () => (id === "brief"
      ? `<section class="brief">Morning brief card</section>`
      : `<article>${phrase(id)}</article>`);
  });
  const prev = {
    state: app.state,
    ui: app.ui,
    today: app.today,
    pageHead: app.pageHead,
    firstName: app.firstName,
    esc: app.esc,
    greeting: app.greeting,
    fmtDate: app.fmtDate,
    weekCardHTML: app.weekCardHTML,
    snapshotFromApp: app.snapshotFromApp,
    src: app.src,
    session: app.session,
    sb: app.sb,
    cloudPullOk: app.cloudPullOk,
    briefHTML: app.briefHTML,
    briefPaintEmpty: app.briefPaintEmpty,
    weighReminderHTML: app.weighReminderHTML,
    readinessCardHTML: app.readinessCardHTML,
    muscleMapHTML: app.muscleMapHTML,
    widgetize: app.widgetize,
  };
  app.today = () => "2026-10-04";
  app.ui = { edit: null };
  app.pageHead = (_title, _sub, opts) => `<header>Home</header>${opts && opts.left ? opts.left : ""}`;
  app.briefHTML = () => `<section class="brief">Morning brief</section>`;
  app.briefPaintEmpty = () => false;
  app.weighReminderHTML = () => "";
  app.readinessCardHTML = () => "";
  app.muscleMapHTML = () => "";
  app.widgetize = (_page, html) => html;
  app.firstName = () => "";
  app.esc = (s) => String(s ?? "");
  app.greeting = () => "";
  app.fmtDate = () => "Sunday";
  app.weekCardHTML = () => "";
  app.snapshotFromApp = () => ({ live: true });
  app.session = null;
  app.sb = null;

  function paint(items, hidden) {
    const state = { demo: false, oura: { connected: false, days: {} }, layout: {}, muscleMode: "basic" };
    commitHomeEditor(state, { items, hidden, sizes: {} });
    app.state = state;
    app.src = () => ({ oura: {} });
    return app.homeHTML();
  }

  function assertBriefCard(html, items, hidden, label) {
    const on = items.includes("brief") && !(hidden || []).includes("brief");
    const briefs = html.match(/<section class="brief"/g) || [];
    assert.equal(briefs.length, on ? 1 : 0, label);
    if (on) assert.match(html, /data-hw="brief"/, label);
  }

  try {
    const forced = [
      ids.slice(),
      ["brief"],
      ["brief", "this-week", "cardio", "muscles"],
      ["headline", "pattern", "today", "food-yesterday", "weekly-goal", "weight-trend"],
      ["brief", "headline", "readiness"],
      ["brief", "headline", "pattern", "today", "food-yesterday", "weekly-goal", "weight-trend"],
    ];
    forced.forEach((items, index) => assertBriefCard(paint(items, []), items, [], `forced ${index}`));
    for (let trial = 0; trial < 40; trial++) {
      const items = ids.filter(() => rnd() < 0.45);
      if (!items.includes("brief")) items.push("brief");
      const hidden = ids.filter((id) => !items.includes(id) && rnd() < 0.2);
      assertBriefCard(paint(items, hidden), items, hidden, `trial ${trial}`);
    }
    const hidden = paint(["this-week"], ["brief"]);
    assert.doesNotMatch(hidden, /class="brief"/);
    assert.match(hidden, /data-hw="this-week"/);

    app.session = { user: { id: "u" } };
    app.sb = {};
    app.cloudPullOk = false;
    app.state = { layout: {}, oura: { connected: false } };
    const blocked = app.homeHTML();
    assert.match(blocked, /data-action="home-edit"[^>]*disabled/);
    assert.match(blocked, /id="home-edit-wait"/);
    assert.match(blocked, /first sync finishes/);
    app.cloudPullOk = true;
    const open = app.homeHTML();
    assert.doesNotMatch(open, /data-action="home-edit"[^>]*disabled/);
    app.session = null;
    assert.doesNotMatch(app.homeHTML(), /disabled/);
  } finally {
    ids.forEach((id) => { HOME_WIDGETS[id].render = prevRender[id]; });
    app.state = prev.state;
    app.ui = prev.ui;
    app.today = prev.today;
    app.pageHead = prev.pageHead;
    app.firstName = prev.firstName;
    app.esc = prev.esc;
    app.greeting = prev.greeting;
    app.fmtDate = prev.fmtDate;
    app.weekCardHTML = prev.weekCardHTML;
    app.snapshotFromApp = prev.snapshotFromApp;
    app.src = prev.src;
    app.session = prev.session;
    app.sb = prev.sb;
    app.cloudPullOk = prev.cloudPullOk;
    app.briefHTML = prev.briefHTML;
    app.briefPaintEmpty = prev.briefPaintEmpty;
    app.weighReminderHTML = prev.weighReminderHTML;
    app.readinessCardHTML = prev.readinessCardHTML;
    app.muscleMapHTML = prev.muscleMapHTML;
    app.widgetize = prev.widgetize;
  }
});

test("a migrated editor hides a missing ring and empty goal and weigh-in tiles", () => {
  const migrated = {
    oura: { connected: false },
    goals: { sessionsPerWeek: null },
    profile: { weighIns: [] },
    layout: {
      homeV2: {
        v: 2,
        items: ["readiness", "weekly-goal", "weight-trend", "brief", "this-week"],
        hidden: ["steps", "sleep-score"],
        updatedAt: 4,
        migrated: true,
        migratedAt: 4,
      },
    },
  };
  const draft = homeEditorDraft(migrated);
  assert.deepEqual(draft.items, ["brief", "this-week"]);
  assert.ok(draft.hidden.includes("weekly-goal"));
  assert.ok(draft.hidden.includes("weight-trend"));
  assert.equal(draft.items.concat(draft.hidden).some((id) => HOME_WIDGETS[id].needsOura), false);
  assert.equal(homeDraftUnchanged(draft, homeEditorDraft(migrated)), true);

  const filled = homeEditorDraft({
    ...migrated,
    oura: { connected: true },
    goals: { sessionsPerWeek: 3 },
    profile: { weighIns: [{ date: "2026-10-01", kg: 80 }] },
  });
  assert.ok(filled.items.includes("readiness"));
  assert.ok(filled.items.includes("weekly-goal"));
  assert.ok(filled.items.includes("weight-trend"));
  assert.ok(filled.hidden.includes("sleep-score"));

  const demo = homeEditorDraft({ ...migrated, demo: true });
  assert.ok(demo.items.includes("readiness"));
  assert.ok(demo.items.includes("weight-trend"));
  assert.ok(demo.hidden.includes("weekly-goal"));
});

test("the registry brief drops repeated metrics and keeps a start action", () => {
  const prev = {
    state: app.state,
    ui: app.ui,
    today: app.today,
    esc: app.esc,
    briefPrefs: app.briefPrefs,
    briefTodayHeadline: app.briefTodayHeadline,
    briefMetrics: app.briefMetrics,
    activeSession: app.activeSession,
    sessionsOn: app.sessionsOn,
    workoutById: app.workoutById,
    addDays: app.addDays,
    dayEntries: app.dayEntries,
    sessionsInWeek: app.sessionsInWeek,
    mondayOf: app.mondayOf,
    weekGoalStatus: app.weekGoalStatus,
    pl: app.pl,
    weighIns: app.weighIns,
    plan: app.state && app.state.plan,
  };
  app.today = () => "2026-10-04";
  app.esc = (s) => String(s ?? "");
  app.ui = {};
  app.pl = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  app.activeSession = () => null;
  app.sessionsOn = () => [];
  app.workoutById = (id) => (id === "push" ? { id, name: "Push", exercises: [{}, {}] } : null);
  app.addDays = (day, n) => `${day}:${n}`;
  app.dayEntries = () => [];
  app.sessionsInWeek = () => 0;
  app.mondayOf = () => "2026-09-28";
  app.weekGoalStatus = () => null;
  app.weighIns = () => [];
  app.briefPrefs = () => ({ order: ["pattern", "train", "food", "week", "weight"], hidden: [], size: "compact" });
  app.briefTodayHeadline = () => "Headline phrase zz";
  const base = {
    demo: false,
    oura: { connected: false },
    plan: { "2026-10-04": "push" },
    workouts: [],
    sessions: [],
    profile: { weighIns: [] },
    goals: {},
  };
  try {
    app.state = {
      ...base,
      layout: { homeV2: { v: 2, items: ["brief", "headline", "pattern", "today", "food-yesterday"], hidden: [], updatedAt: 5 } },
    };
    const covered = app.briefHTML();
    assert.match(covered, /class="card brief"/);
    assert.doesNotMatch(covered, /brief-h|data-metric="pattern"|data-metric="train"|data-metric="food"|data-action="brief-edit"|Headline phrase zz/);
    assert.match(covered, /data-metric="week"/);
    assert.match(covered, /data-metric="weight"/);
    assert.match(covered, /data-action="brief-size"/);
    assert.doesNotMatch(covered, /data-action="start"/);
    const heroSrc = readFileSync(new URL("../logger/js/pages/home.js", import.meta.url), "utf8");
    assert.match(heroSrc, /data-action="start" data-id="\$\{app\.esc\(w\.id\)\}"/);

    app.state = {
      ...base,
      layout: { homeV2: { v: 2, items: ["brief"], hidden: [], updatedAt: 5 } },
    };
    const alone = app.briefHTML();
    assert.match(alone, /class="brief-h"/);
    assert.match(alone, /Headline phrase zz/);
    assert.match(alone, /data-metric="train"/);
    assert.match(alone, /data-action="start" data-id="push"/);
    assert.match(alone, /data-metric="food"/);
    assert.doesNotMatch(alone, /data-action="brief-edit"/);

    app.state = { ...base, layout: { home: { order: ["brief"], hidden: [] } } };
    const legacy = app.briefHTML();
    assert.doesNotMatch(legacy, /data-action="brief-edit"/);
    assert.match(legacy, /data-action="brief-size"/);
    assert.match(legacy, /class="brief-h"/);
    /* The legacy Today hero already shows the planned workout, so the brief leaves it out. */
    assert.doesNotMatch(legacy, /data-metric="train"|data-action="start"/);
    app.state = { ...base, layout: { home: { order: ["brief", "today"], hidden: ["today"] } } };
    assert.match(app.briefHTML(), /data-action="start" data-id="push"/);
  } finally {
    app.state = prev.state;
    app.ui = prev.ui;
    app.today = prev.today;
    app.esc = prev.esc;
    app.briefPrefs = prev.briefPrefs;
    app.briefTodayHeadline = prev.briefTodayHeadline;
    app.briefMetrics = prev.briefMetrics;
    app.activeSession = prev.activeSession;
    app.sessionsOn = prev.sessionsOn;
    app.workoutById = prev.workoutById;
    app.addDays = prev.addDays;
    app.dayEntries = prev.dayEntries;
    app.sessionsInWeek = prev.sessionsInWeek;
    app.mondayOf = prev.mondayOf;
    app.weekGoalStatus = prev.weekGoalStatus;
    app.pl = prev.pl;
    app.weighIns = prev.weighIns;
  }
});

test("an empty brief shell stays off Home, and legacy Home has one Edit", () => {
  const covered = ["headline", "pattern", "today", "food-yesterday", "weekly-goal", "weight-trend"];
  const prevRender = {};
  covered.forEach((id) => {
    prevRender[id] = HOME_WIDGETS[id].render;
    HOME_WIDGETS[id].render = () => `<article data-tile="${id}"></article>`;
  });
  const prev = {
    state: app.state, ui: app.ui, today: app.today, esc: app.esc, pageHead: app.pageHead,
    firstName: app.firstName, greeting: app.greeting, fmtDate: app.fmtDate, weekCardHTML: app.weekCardHTML,
    snapshotFromApp: app.snapshotFromApp, weighReminderHTML: app.weighReminderHTML, widgetize: app.widgetize,
    readinessCardHTML: app.readinessCardHTML, muscleMapHTML: app.muscleMapHTML, briefPrefs: app.briefPrefs,
    briefTodayHeadline: app.briefTodayHeadline, activeSession: app.activeSession, sessionsOn: app.sessionsOn,
    workoutById: app.workoutById, addDays: app.addDays, dayEntries: app.dayEntries, sessionsInWeek: app.sessionsInWeek,
    mondayOf: app.mondayOf, weekGoalStatus: app.weekGoalStatus, pl: app.pl, weighIns: app.weighIns,
    session: app.session, sb: app.sb, cloudPullOk: app.cloudPullOk, src: app.src, latestOura: app.latestOura,
  };
  app.today = () => "2026-10-04";
  app.ui = {};
  app.esc = (s) => String(s ?? "");
  app.pageHead = (_title, _sub, opts) => `${opts && opts.left ? opts.left : ""}`;
  app.firstName = () => "";
  app.greeting = () => "";
  app.fmtDate = () => "Sunday";
  app.weekCardHTML = () => "";
  app.snapshotFromApp = () => ({ live: true });
  app.weighReminderHTML = () => "";
  app.widgetize = (_page, html) => html;
  app.readinessCardHTML = () => "";
  app.muscleMapHTML = () => "";
  app.pl = (n, word) => `${n} ${word}`;
  app.activeSession = () => null;
  app.sessionsOn = () => [];
  app.workoutById = () => null;
  app.addDays = (day) => day;
  app.dayEntries = () => [];
  app.sessionsInWeek = () => 0;
  app.mondayOf = () => "2026-09-28";
  app.weekGoalStatus = () => null;
  app.weighIns = () => [];
  app.briefTodayHeadline = () => "Headline phrase zz";
  app.src = () => ({ oura: {}, sessions: [] });
  app.latestOura = () => null;
  app.session = null;
  app.sb = null;
  const shell = () => ({
    demo: false,
    oura: { connected: false },
    plan: {},
    workouts: [],
    sessions: [],
    profile: { weighIns: [] },
    goals: {},
  });
  try {
    app.state = {
      ...shell(),
      layout: { homeV2: { v: 2, items: ["brief", ...covered], hidden: [], updatedAt: 5 } },
    };
    const empty = app.homeHTML();
    assert.equal(app.briefPaintEmpty(app.state), true);
    assert.doesNotMatch(empty, /data-hw="brief"|class="card brief"|Morning brief/);
    assert.match(empty, /data-hw="headline"/);
    assert.match(empty, /data-tile="weight-trend"/);

    app.state.layout.homeV2 = { v: 2, items: ["brief", ...covered.filter((id) => id !== "weight-trend")], hidden: [], updatedAt: 5 };
    const kept = app.homeHTML();
    assert.equal(app.briefPaintEmpty(app.state), false);
    assert.match(kept, /class="card brief"/);
    assert.match(kept, /data-metric="weight"/);
    assert.doesNotMatch(kept, /data-metric="train"|class="brief-h"/);

    app.state = { ...shell(), layout: { home: { order: ["brief"], hidden: [] } } };
    const legacy = app.homeHTML();
    assert.equal((legacy.match(/data-action="home-edit"/g) || []).length, 1);
    assert.doesNotMatch(legacy, /data-action="brief-edit"/);
    assert.match(legacy, /data-action="brief-size"/);
  } finally {
    covered.forEach((id) => { HOME_WIDGETS[id].render = prevRender[id]; });
    Object.assign(app, prev);
  }
});

test("a blocked Edit says Offline only when the device is offline", () => {
  const prev = {
    state: app.state, ui: app.ui, today: app.today, esc: app.esc, pageHead: app.pageHead,
    firstName: app.firstName, greeting: app.greeting, fmtDate: app.fmtDate, weekCardHTML: app.weekCardHTML,
    widgetize: app.widgetize, briefHTML: app.briefHTML, weighReminderHTML: app.weighReminderHTML,
    readinessCardHTML: app.readinessCardHTML, muscleMapHTML: app.muscleMapHTML,
    session: app.session, sb: app.sb, cloudPullOk: app.cloudPullOk,
  };
  app.today = () => "2026-10-04";
  app.ui = {};
  app.esc = (s) => String(s ?? "");
  app.pageHead = (_title, _sub, opts) => `${opts && opts.left ? opts.left : ""}`;
  app.firstName = () => "";
  app.greeting = () => "";
  app.fmtDate = () => "Sunday";
  app.weekCardHTML = () => "";
  app.widgetize = (_page, html) => html;
  app.briefHTML = () => "";
  app.weighReminderHTML = () => "";
  app.readinessCardHTML = () => "";
  app.muscleMapHTML = () => "";
  app.session = { user: { id: "u" } };
  app.sb = {};
  app.cloudPullOk = false;
  app.state = { layout: {}, oura: { connected: false } };
  const prior = globalThis.navigator;
  function paint(onLine) {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { onLine } });
    return app.homeHTML();
  }
  try {
    const online = paint(true);
    assert.match(online, /Edit unlocks after the first sync finishes/);
    assert.doesNotMatch(online, /Offline/);
    const offline = paint(false);
    assert.match(offline, /Offline\. Edit unlocks after the first sync finishes/);
  } finally {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: prior });
    Object.assign(app, prev);
  }
});
