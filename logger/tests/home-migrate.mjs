// Home layout v2 migration. Unit cases run in node; the browser cases boot the app.
//   PLAYWRIGHT_PATH=... node logger/tests/home-migrate.mjs

import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { migrateHomeLayout, applyHomeMigration, pickHomeV2 } from "../js/shared/home-migrate.js";
import { getHomeLayout, setHomeLayout, HOME_WIDGETS } from "../js/shared/home-widgets.js";

const require = createRequire(import.meta.url);
const pw = require(process.env.PLAYWRIGHT_PATH || "playwright");
const { chromium } = pw;

const BASE = process.env.BASE || "http://127.0.0.1:8765";
const ART = "/opt/cursor/artifacts";
mkdirSync(ART, { recursive: true });
const fails = [];

function check(name, cond, extra) {
  if (cond) console.log("PASS", name);
  else { console.log("FAIL", name, extra == null ? "" : extra); fails.push(name); }
}

function eq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

const CUSTOM_ITEMS = ["today", "weight-trend", "readiness", "sleep-score", "weekly-goal", "pattern", "cardio", "hrv", "this-week", "muscles"];
const CUSTOM_HIDDEN = ["food-yesterday"];

function customState() {
  return {
    settingsAt: 200,
    muscleMode: "basic",
    layout: {
      home: {
        order: ["today", "brief", "cardio", "readiness", "week"],
        hidden: ["map-adv"],
      },
    },
    brief: {
      order: ["weight", "oura", "train", "food", "week"],
      hidden: ["food"],
      size: "compact",
      updatedAt: 150,
    },
  };
}

function idsOf(layout) {
  return { items: layout.items.slice(), hidden: layout.hidden.slice() };
}

function unit() {
  check("empty state", migrateHomeLayout({}) === null);
  check("missing layout", migrateHomeLayout({ brief: null, settingsAt: 40 }) === null);
  check("default basic map hide", migrateHomeLayout({
    muscleMode: "basic",
    layout: { home: { order: [], hidden: ["map-adv"] } },
    brief: null,
  }) === null);
  check("default advanced map hide", migrateHomeLayout({
    muscleMode: "advanced",
    layout: { home: { order: [], hidden: ["map-basic"] } },
  }) === null);
  check("empty hidden is untouched", migrateHomeLayout({
    layout: { home: { order: [], hidden: [] } },
  }) === null);
  check("size alone is not a customization", migrateHomeLayout({
    brief: { size: "expanded" },
    layout: { home: { order: [], hidden: ["map-basic"] } },
  }) === null);

  const hiddenBrief = migrateHomeLayout({
    settingsAt: 20,
    layout: { home: { order: ["today", "readiness"], hidden: ["brief"] } },
    brief: { order: ["oura", "food"], hidden: ["food"], updatedAt: 10 },
  });
  check("brief hidden stays out of the row", eq(idsOf(hiddenBrief), {
    items: ["today", "readiness", "hrv", "this-week", "cardio", "muscles"],
    hidden: ["sleep-score", "food-yesterday", "pattern", "weekly-goal", "weight-trend"],
  }), idsOf(hiddenBrief));
  check("train is dropped when the brief is hidden", !hiddenBrief.items.includes("train") && !hiddenBrief.hidden.includes("train"));

  const custom = migrateHomeLayout(customState());
  check("custom order", eq(idsOf(custom), { items: CUSTOM_ITEMS, hidden: CUSTOM_HIDDEN }), idsOf(custom));
  check("custom stamp uses the saved times", custom.updatedAt === 200);
  check("visible muscle map beats the hidden one", custom.items.includes("muscles") && !custom.hidden.includes("muscles"));
  check("headline is not invented", !custom.items.includes("headline") && !custom.hidden.includes("headline"));

  const dup = migrateHomeLayout({
    settingsAt: 8,
    layout: { home: { order: ["readiness", "readiness", "brief"], hidden: [] } },
    brief: { order: ["oura", "oura", "food"], updatedAt: 3 },
  });
  check("duplicates keep the first id", eq(idsOf(dup), {
    items: ["readiness", "hrv", "sleep-score", "food-yesterday", "pattern", "weekly-goal", "weight-trend", "today", "this-week", "cardio", "muscles"],
    hidden: [],
  }), idsOf(dup));
  check("readiness is not repeated", dup.items.filter((id) => id === "readiness").length === 1);

  const unknown = migrateHomeLayout({
    settingsAt: 4,
    layout: { home: { order: ["zzz", "today", "today", "nope"], hidden: ["mystery"] } },
    brief: { order: ["ghost", "weight", "weight"], hidden: ["no-such"], updatedAt: 5 },
  });
  const unknownFlat = [...unknown.items, ...unknown.hidden];
  check("unknown ids are dropped", !["zzz", "nope", "mystery", "ghost", "no-such"].some((id) => unknownFlat.includes(id)), unknownFlat);
  check("unknown still keeps a real widget once", unknown.items.filter((id) => id === "today").length === 1 && unknown.items.includes("weight-trend"));

  const input = customState();
  input.layout.homeV2 = { v: 2, items: ["steps"], updatedAt: 5 };
  const snap = JSON.stringify(input);
  const first = migrateHomeLayout(input);
  const second = migrateHomeLayout(input);
  check("running twice matches", eq(first, second));
  check("pure function leaves its input alone", JSON.stringify(input) === snap);

  const applied = customState();
  const homeBefore = JSON.stringify(applied.layout.home);
  const briefBefore = JSON.stringify(applied.brief);
  applyHomeMigration(applied, 111);
  applyHomeMigration(applied, 222);
  check("apply stamps once", applied.layout.homeV2.migratedAt === 111 && applied.layout.homeV2.updatedAt === 200);
  check("apply twice keeps the same items", eq(applied.layout.homeV2.items, CUSTOM_ITEMS));
  check("old home key stays", JSON.stringify(applied.layout.home) === homeBefore);
  check("old brief key stays", JSON.stringify(applied.brief) === briefBefore);

  const fresh = {};
  applyHomeMigration(fresh, 5);
  check("apply on empty does not invent a layout", fresh.layout == null);

  const newer = customState();
  newer.layout.homeV2 = { v: 2, items: ["pattern", "today"], hidden: ["steps"], updatedAt: 9000 };
  applyHomeMigration(newer, 50);
  check("newer homeV2 is kept", eq(newer.layout.homeV2.items, ["pattern", "today"]) && newer.layout.homeV2.updatedAt === 9000 && newer.layout.homeV2.migratedAt === 50);
  applyHomeMigration(newer, 80);
  check("stamp is not rewritten", newer.layout.homeV2.migratedAt === 50);

  const older = customState();
  older.layout.homeV2 = { v: 2, items: ["steps"], hidden: [], updatedAt: 10 };
  applyHomeMigration(older, 60);
  check("older homeV2 is replaced by the saved arrangement", eq(older.layout.homeV2.items, CUSTOM_ITEMS) && older.layout.homeV2.updatedAt === 200);

  const deviceA = customState();
  applyHomeMigration(deviceA, 1000);
  const pushed = JSON.parse(JSON.stringify(deviceA));
  const deviceB = customState();
  deviceB.brief = { order: ["food", "weight"], hidden: [], updatedAt: 150 };
  const picked = pickHomeV2(deviceB.layout, pushed.layout);
  deviceB.layout.homeV2 = picked;
  applyHomeMigration(deviceB, 2000);
  check("pull adopts the migrated layout", eq(deviceB.layout.homeV2.items, CUSTOM_ITEMS) && eq(deviceB.layout.homeV2.hidden, CUSTOM_HIDDEN));
  check("pull does not re-migrate", deviceB.layout.homeV2.migratedAt === 1000 && deviceB.layout.homeV2.items[0] === "today");

  const deviceC = customState();
  applyHomeMigration(deviceC, 1000);
  deviceC.layout.homeV2 = { v: 2, items: ["pattern", "today"], hidden: ["steps"], updatedAt: 9000 };
  const localLayout = deviceC.layout;
  const remote = { settingsAt: 5000, layout: JSON.parse(JSON.stringify(pushed.layout)) };
  if (remote.settingsAt > deviceC.settingsAt) deviceC.layout = remote.layout;
  const winner = pickHomeV2(localLayout, remote.layout);
  deviceC.layout.homeV2 = winner;
  applyHomeMigration(deviceC, 3000);
  check("newer local homeV2 survives a settings push", eq(deviceC.layout.homeV2.items, ["pattern", "today"]) && eq(deviceC.layout.homeV2.hidden, ["steps"]));
  check("surviving homeV2 keeps its clock", deviceC.layout.homeV2.updatedAt === 9000 && deviceC.layout.homeV2.migratedAt === 1000);

  const tieLocal = { homeV2: { v: 2, items: ["today"], hidden: [], updatedAt: 40 } };
  const tieRemote = { homeV2: { v: 2, items: ["cardio"], hidden: [], updatedAt: 40, migratedAt: 7 } };
  const tied = pickHomeV2(tieLocal, tieRemote);
  check("tie keeps this phone and borrows the stamp", eq(tied.items, ["today"]) && tied.migratedAt === 7);
  check("invalid homeV2 is ignored", pickHomeV2({ homeV2: { v: 1, items: ["today"] } }, { homeV2: { items: ["cardio"] } }) === null);

  const holder = { layout: {} };
  setHomeLayout(holder, { v: 2, items: ["today"], hidden: [], updatedAt: 3 });
  check("registry round trip", getHomeLayout(holder).items[0] === "today" && HOME_WIDGETS.today.size === "medium");

  const oldClient = (state) => ({
    order: state.layout.home.order.slice(),
    hidden: state.layout.home.hidden.slice(),
    briefOrder: state.brief.order.slice(),
    briefHidden: state.brief.hidden.slice(),
  });
  const aged = customState();
  const seenByOld = oldClient(aged);
  applyHomeMigration(aged, 9);
  check("older client still reads the same keys", eq(oldClient(aged), seenByOld));
}

function savedBlob() {
  return {
    version: 2,
    sessions: [],
    settingsAt: 200,
    muscleMode: "basic",
    theme: { mode: "dark", accent: "citrus" },
    layout: {
      home: {
        order: ["today", "brief", "cardio", "readiness", "week"],
        hidden: ["map-adv"],
      },
    },
    brief: {
      order: ["weight", "oura", "train", "food", "week"],
      hidden: ["food"],
      size: "compact",
      updatedAt: 150,
    },
  };
}

async function boot(browser, state) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  await page.addInitScript((s) => {
    if (sessionStorage.getItem("home-v2-booted")) return;
    sessionStorage.setItem("home-v2-booted", "1");
    localStorage.setItem("liftlog-v1", JSON.stringify(s));
  }, state);
  await page.goto(BASE + "/index.html", { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.app && window.app.state && window.app.state.layout);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(200);
  return { context, page, errors };
}

async function browserCases() {
  const browser = await chromium.launch({
    executablePath: "/usr/local/bin/google-chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const seed = savedBlob();
  const a = await boot(browser, seed);
  const loaded = await a.page.evaluate(() => ({
    items: window.app.state.layout.homeV2.items.slice(),
    hidden: window.app.state.layout.homeV2.hidden.slice(),
    updatedAt: window.app.state.layout.homeV2.updatedAt,
    migrated: !!window.app.state.layout.homeV2.migratedAt,
    home: window.app.state.layout.home,
    brief: window.app.state.brief,
    widgets: [...document.querySelectorAll("#pane-home .wdg")].map((el) => el.dataset.w),
  }));
  check("load migrates the saved arrangement", eq(loaded.items, CUSTOM_ITEMS) && eq(loaded.hidden, CUSTOM_HIDDEN) && loaded.updatedAt === 200 && loaded.migrated, loaded);
  check("loaded old keys still match the save", eq(loaded.home.order, seed.layout.home.order) && eq(loaded.home.hidden, seed.layout.home.hidden) && eq(loaded.brief.order, seed.brief.order));
  check("older renderer still uses the old order", eq(loaded.widgets, ["today", "brief", "cardio", "week", "map-basic"]), loaded.widgets);
  check("readiness stays saved when its card is empty", loaded.home.order.includes("readiness"));

  await a.page.evaluate(() => {
    const html = window.app.renderHomeV2(window.app.getHomeLayout(window.app.state));
    document.querySelector("#pane-home").insertAdjacentHTML("afterbegin", html);
  });
  await a.page.screenshot({ path: `${ART}/home_v2_migrated.png`, fullPage: true });
  const cards = await a.page.$$eval("#pane-home [data-hv2]", (els) => els.map((el) => el.dataset.hv2));
  check("preview shows the migrated row", eq(cards, CUSTOM_ITEMS), cards);

  const blob = await a.page.evaluate(() => JSON.parse(JSON.stringify({
    layout: window.app.state.layout,
    brief: window.app.state.brief,
    settingsAt: window.app.state.settingsAt,
    sessions: [],
    updatedAt: 1,
  })));

  const b = await boot(browser, seed);
  const clobber = await b.page.evaluate((remote) => {
    window.app.state.layout.homeV2 = { v: 2, items: ["pattern", "today"], hidden: ["steps"], updatedAt: 9000 };
    remote.settingsAt = 5000;
    window.app.mergeRemote(remote);
    window.app.applyHomeMigration(window.app.state, 4242);
    const home = window.app.state.layout.homeV2;
    return { items: home.items.slice(), hidden: home.hidden.slice(), updatedAt: home.updatedAt, migratedAt: home.migratedAt };
  }, blob);
  check("device B keeps its newer homeV2", eq(clobber.items, ["pattern", "today"]) && eq(clobber.hidden, ["steps"]) && clobber.updatedAt === 9000 && clobber.migratedAt !== 4242, clobber);

  const pulled = await b.page.evaluate((remote) => {
    delete window.app.state.layout.homeV2;
    window.app.state.brief = { order: ["food", "weight"], hidden: [], size: "compact", updatedAt: 150 };
    window.app.state.settingsAt = 200;
    remote.settingsAt = 200;
    window.app.mergeRemote(remote);
    window.app.applyHomeMigration(window.app.state, 7777);
    const home = window.app.state.layout.homeV2;
    return {
      items: home.items.slice(),
      hidden: home.hidden.slice(),
      migratedAt: home.migratedAt,
      briefOrder: window.app.state.brief.order.slice(),
    };
  }, blob);
  check("device B adopts A's push", eq(pulled.items, CUSTOM_ITEMS) && eq(pulled.hidden, CUSTOM_HIDDEN), pulled);
  check("device B does not re-migrate its own brief", pulled.migratedAt !== 7777 && pulled.items[0] === "today" && eq(pulled.briefOrder, ["food", "weight"]), pulled);

  check("no console errors", a.errors.length === 0 && b.errors.length === 0, [...a.errors, ...b.errors]);
  await browser.close();
}

unit();
await browserCases();
if (fails.length) {
  console.log("FAILED", fails.join(", "));
  process.exit(1);
}
console.log("ALL PASS");
