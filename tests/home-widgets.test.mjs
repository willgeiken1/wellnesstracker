import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { app } from "../logger/js/runtime.js";
import { HOME_WIDGETS, getHomeLayout, mergeHomeV2, mergeRemoteLayout, renderHomeWidgets, setHomeLayout } from "../logger/js/shared/home-widgets.js";

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

test("an edit clears migrated, stamps now, and keeps unknown homeV2 fields", () => {
  const state = {
    layout: {
      homeV2: {
        v: 2,
        items: ["today"],
        hidden: [],
        updatedAt: 0,
        migrated: true,
        migratedAt: 12,
        ouraSeeded: true,
      },
    },
  };
  const before = Date.now();
  const written = setHomeLayout(state, { items: ["cardio", "today"], hidden: ["steps"] });
  assert.equal(written.migrated, undefined);
  assert.equal(state.layout.homeV2.migrated, undefined);
  assert.equal(written.migratedAt, 12);
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

test("homeV2 merges on its own updatedAt and survives a wholesale layout replace", () => {
  const older = { v: 2, items: ["today"], hidden: [], updatedAt: 10 };
  const newer = { v: 2, items: ["cardio"], hidden: ["steps"], updatedAt: 25 };
  assert.deepEqual(mergeHomeV2(newer, older).items, ["cardio"]);
  assert.deepEqual(mergeHomeV2(older, newer).items, ["cardio"]);
  assert.deepEqual(mergeHomeV2(older, null).items, ["today"]);
  assert.equal(mergeHomeV2(null, { v: 1, items: [] }), null);

  const state = {
    settingsAt: 5,
    muscleMode: "basic",
    uniEx: {},
    layout: { home: { order: ["today"], hidden: [] }, homeV2: { v: 2, items: ["today"], hidden: [], updatedAt: 50, migrated: true, ouraSeeded: true } },
  };
  mergeRemoteLayout(state, {
    settingsAt: 90,
    muscleMode: "advanced",
    uniEx: { Curl: true },
    layout: { home: { order: ["week"], hidden: ["brief"] }, homeV2: { v: 2, items: ["cardio"], hidden: [], updatedAt: 10 } },
  });
  assert.equal(state.settingsAt, 90);
  assert.equal(state.muscleMode, "advanced");
  assert.equal(state.uniEx.Curl, true);
  assert.deepEqual(state.layout.home, { order: ["week"], hidden: ["brief"] });
  assert.deepEqual(state.layout.homeV2.items, ["today"]);
  assert.equal(state.layout.homeV2.updatedAt, 50);
  assert.equal(state.layout.homeV2.ouraSeeded, true);
  assert.equal(state.layout.homeV2.migrated, true);

  const kept = {
    settingsAt: 100,
    layout: { home: { order: ["today"], hidden: [] }, homeV2: { v: 2, items: ["muscles"], hidden: [], updatedAt: 4 } },
  };
  mergeRemoteLayout(kept, {
    settingsAt: 1,
    layout: { home: { order: ["nope"], hidden: [] }, homeV2: { v: 2, items: ["steps"], hidden: ["today"], updatedAt: 80 } },
  });
  assert.deepEqual(kept.layout.home.order, ["today"]);
  assert.deepEqual(kept.layout.homeV2.items, ["steps"]);
  assert.deepEqual(kept.layout.homeV2.hidden, ["today"]);

  const clobber = {
    settingsAt: 1,
    layout: { home: { order: ["today"], hidden: [] }, homeV2: { v: 2, items: ["headline"], hidden: [], updatedAt: 15 } },
  };
  mergeRemoteLayout(clobber, { settingsAt: 40, layout: { home: { order: ["cardio"], hidden: [] } } });
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
  assert.match(sw, /insight-shell-v20/);
  assert.match(sentry, /insight-shell-v20/);
  assert.match(sw, /js\/shared\/home-widgets\.js/);
  assert.match(sw, /css\/home-widgets\.css/);
});
