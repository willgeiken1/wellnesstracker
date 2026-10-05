// Home layout v2 migration. Unit cases run in node; the browser cases boot the app.
//   PLAYWRIGHT_PATH=... node logger/tests/home-migrate.mjs

import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { migrateHomeLayout, applyHomeMigration, pickHomeV2 } from "../js/shared/home-migrate.js";
import { getHomeLayout, setHomeLayout, HOME_WIDGETS } from "../js/shared/home-widgets.js";

const require = createRequire(import.meta.url);
const pw = require(process.env.PLAYWRIGHT_PATH || "playwright");
const { chromium } = pw;

const BASE = process.env.BASE || "http://127.0.0.1:8765";
const ART = process.env.ARTIFACTS_DIR || "/opt/cursor/artifacts";
const CHROME = process.env.CHROME_PATH || "/usr/local/bin/google-chrome";
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
  check("newer homeV2 is kept", eq(newer.layout.homeV2.items, ["pattern", "today"]) && newer.layout.homeV2.updatedAt === 9000 && !newer.layout.homeV2.migratedAt);
  applyHomeMigration(newer, 80);
  check("stamp is not rewritten", !newer.layout.homeV2.migratedAt && newer.layout.homeV2.updatedAt === 9000);

  const older = customState();
  older.layout.homeV2 = { v: 2, items: ["steps"], hidden: [], updatedAt: 10 };
  applyHomeMigration(older, 60);
  check("unflagged homeV2 survives a newer settingsAt", eq(older.layout.homeV2.items, ["steps"]) && older.layout.homeV2.updatedAt === 10 && !older.layout.homeV2.migrated);

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
  check("surviving homeV2 keeps its clock", deviceC.layout.homeV2.updatedAt === 9000 && !deviceC.layout.homeV2.migratedAt);

  const tieLocal = { homeV2: { v: 2, items: ["today"], hidden: [], updatedAt: 40 } };
  const tieRemote = { homeV2: { v: 2, items: ["cardio"], hidden: [], updatedAt: 40, migratedAt: 7 } };
  const tied = pickHomeV2(tieLocal, tieRemote);
  check("an edit beats a migrated copy with the same clock", eq(tied.items, ["today"]) && !tied.migratedAt);
  check("invalid homeV2 is ignored", pickHomeV2({ homeV2: { v: 1, items: ["today"] } }, { homeV2: { items: ["cardio"] } }) === null);

  const holder = { layout: {} };
  setHomeLayout(holder, { v: 2, items: ["today"], hidden: [], updatedAt: 3, migrated: true, migratedAt: 9 });
  check("registry round trip", getHomeLayout(holder).items[0] === "today" && HOME_WIDGETS.today.size === "medium");
  check("setHomeLayout clears the migration flag", !holder.layout.homeV2.migrated && holder.layout.homeV2.migratedAt == null);

  regressions();

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

function regressions() {
  const stale = {
    settingsAt: 100,
    layout: { home: { order: ["today", "cardio"], hidden: ["map-adv"] } },
  };
  applyHomeMigration(stale, 1);
  const locked = stale.layout.homeV2.items.slice();
  stale.settingsAt = 500;
  stale.layout.home = { order: ["cardio", "week", "today"], hidden: ["map-adv", "readiness"] };
  applyHomeMigration(stale, 2);
  check("1 stale migration stays until a merge", eq(stale.layout.homeV2.items, locked) && stale.layout.homeV2.migrated === true);
  applyHomeMigration(stale, 3, { afterMerge: true });
  const rebuilt = migrateHomeLayout(stale);
  check("1 merge of newer old keys rebuilds an untouched migration", eq(stale.layout.homeV2.items, rebuilt.items) && stale.layout.homeV2.updatedAt === 500 && stale.layout.homeV2.migrated === true, stale.layout.homeV2.items);
  check("1 old keys stay in place through the rebuild", eq(stale.layout.home.order, ["cardio", "week", "today"]));
  const sameKeys = { settingsAt: 100, layout: { home: { order: ["today", "cardio"], hidden: ["map-adv"] } } };
  applyHomeMigration(sameKeys, 1);
  const kept = sameKeys.layout.homeV2.items.slice();
  sameKeys.layout.homeV2 = { ...sameKeys.layout.homeV2, items: ["steps", "today"], updatedAt: Date.now() - 60000 };
  sameKeys.settingsAt = Date.now();
  applyHomeMigration(sameKeys, 2, { afterMerge: true });
  check("1 a settings bump does not rebuild when the saved order is unchanged", eq(sameKeys.layout.homeV2.items, ["steps", "today"]) && !eq(kept, ["steps", "today"]));

  const edited = customState();
  applyHomeMigration(edited, 4);
  setHomeLayout(edited, { ...edited.layout.homeV2, items: ["steps", "today"], hidden: [], updatedAt: 40 });
  edited.settingsAt = Date.now();
  applyHomeMigration(edited, 5, { afterMerge: true });
  check("2 an edit is not rebuilt after a settings bump", eq(edited.layout.homeV2.items, ["steps", "today"]) && !edited.layout.homeV2.migrated && edited.layout.homeV2.migratedAt == null);

  const migratedHigh = { homeV2: { v: 2, items: ["today"], hidden: [], updatedAt: 99999, migrated: true, migratedAt: 1 } };
  const realEdit = { homeV2: { v: 2, items: ["steps"], hidden: ["hrv"], updatedAt: 10 } };
  check("2 edit beats a migrated copy with a later stamp", pickHomeV2(migratedHigh, realEdit).items[0] === "steps" && pickHomeV2(realEdit, migratedHigh).items[0] === "steps");

  const seeded = { homeV2: { v: 2, items: ["today"], hidden: ["readiness"], updatedAt: 100, migratedAt: 1, ouraSeeded: true } };
  const elsewhere = { homeV2: { v: 2, items: ["cardio", "today"], hidden: ["readiness", "sleep-score"], updatedAt: 200, migratedAt: 2 } };
  const sticky = pickHomeV2(seeded, elsewhere);
  check("3 ouraSeeded survives a newer copy", sticky.ouraSeeded === true && sticky.items[0] === "cardio", sticky);

  const spread = {
    settingsAt: 100,
    layout: {
      home: { order: ["today"], hidden: ["map-adv"] },
      homeV2: { v: 2, items: ["cardio"], hidden: [], updatedAt: 20, migrated: true, migratedAt: 8, ouraSeeded: true, extra: "step1field", migratedFrom: "{\"order\":[\"cardio\"],\"hidden\":[],\"briefOrder\":[],\"briefHidden\":[]}" },
    },
  };
  spread.settingsAt = 400;
  applyHomeMigration(spread, 9, { afterMerge: true });
  check("3 rebuild keeps ouraSeeded and future fields", spread.layout.homeV2.ouraSeeded === true && spread.layout.homeV2.extra === "step1field" && spread.layout.homeV2.items.includes("today"), spread.layout.homeV2);

  const local = { homeV2: { v: 2, items: ["today"], hidden: [], updatedAt: 5 } };
  const bad = [null, "x", [], { homeV2: null }, { homeV2: "x" }, { homeV2: { v: 1, items: [] } }, { homeV2: { v: 2 } }, { homeV2: { v: 2, items: "x" } }, { homeV2: { v: 2, hidden: ["today"], updatedAt: 99 } }];
  check("5 malformed remotes never replace a good local", bad.every((r) => pickHomeV2(local, r) === local.homeV2));
  const junk = pickHomeV2(local, { homeV2: { v: 2, items: [1, null, "nope", "today", "today"], hidden: ["nope", "hrv"], updatedAt: 50 } });
  check("5 junk ids are filtered and unknown ids stay", eq(junk.items, ["nope", "today"]) && eq(junk.hidden, ["hrv"]), junk);
  const stringV = { homeV2: { v: "2", items: ["steps"], hidden: [], updatedAt: 999 } };
  check("string v is rejected", pickHomeV2(local, stringV) === local.homeV2);
  const onlyUnknown = { homeV2: { v: 2, items: ["nope", "zzz"], hidden: [], updatedAt: 99 } };
  check("only unknown ids are invalid", pickHomeV2(local, onlyUnknown) === local.homeV2);
  const emptyItems = pickHomeV2(
    { homeV2: { v: 2, items: ["today"], hidden: [], updatedAt: 1 } },
    { homeV2: { v: 2, items: [], hidden: [], updatedAt: 50 } }
  );
  check("an empty items array is a real layout", eq(emptyItems.items, []) && emptyItems.updatedAt === 50, emptyItems);

  const left = { homeV2: { v: 2, items: ["today"], hidden: [], updatedAt: 1, migratedAt: 5 } };
  const right = { homeV2: { v: 2, items: ["cardio"], hidden: [], updatedAt: 1, migratedAt: 6 } };
  check("tie on updatedAt converges", eq(pickHomeV2(left, right).items, pickHomeV2(right, left).items));
  const sizedA = { homeV2: { v: 2, items: ["today"], hidden: [], updatedAt: 5, sizes: { z: "s", aa: "m" } } };
  const sizedB = { homeV2: { v: 2, items: ["today"], hidden: [], updatedAt: 5, sizes: { z: "m", aa: "s" } } };
  const sizeWinner = pickHomeV2(sizedA, sizedB);
  check("sizes break a same-millisecond tie", sizeWinner.sizes.z === "s" && pickHomeV2(sizedB, sizedA).sizes.z === "s", sizeWinner.sizes);

  const now = 1_700_000_000_000;
  const skewed = pickHomeV2(
    { homeV2: { v: 2, items: ["cardio"], hidden: [], updatedAt: now } },
    { homeV2: { v: 2, items: ["today"], hidden: [], updatedAt: now + 365 * 864e5 } },
    now
  );
  check("a far-future stamp is capped at one day", skewed.items[0] === "today" && skewed.updatedAt === now + 864e5, skewed);
  const year = { homeV2: { v: 2, items: ["today"], hidden: [], updatedAt: now + 365 * 864e5 } };
  const twoDays = { homeV2: { v: 2, items: ["cardio"], hidden: [], updatedAt: now + 2 * 864e5 } };
  const capped = pickHomeV2(year, twoDays, now);
  const cappedBack = pickHomeV2(twoDays, year, now);
  check("clocks past the cap tie-break instead of the further one winning", eq(capped.items, cappedBack.items) && capped.updatedAt === now + 864e5, capped);

  const withBrief = { homeV2: { v: 2, items: ["brief", "this-week", "cardio"], hidden: [], updatedAt: 1000 } };
  const stripped = { homeV2: { v: 2, items: ["this-week", "cardio"], hidden: [], updatedAt: 1000 } };
  const keptBrief = pickHomeV2(withBrief, stripped, 2000);
  const keptBriefBack = pickHomeV2(stripped, withBrief, 2000);
  check("old client stripping brief loses the tie", keptBrief.items.includes("brief") && eq(keptBrief.items, keptBriefBack.items), keptBrief.items);
  const hiddenBrief = { homeV2: { v: 2, items: ["this-week"], hidden: ["brief"], updatedAt: 1000 } };
  const noHidden = { homeV2: { v: 2, items: ["this-week"], hidden: [], updatedAt: 1000 } };
  const keptHidden = pickHomeV2(hiddenBrief, noHidden, 2000);
  const keptHiddenBack = pickHomeV2(noHidden, hiddenBrief, 2000);
  check("old client stripping a hidden brief loses the tie", keptHidden.hidden.includes("brief") && eq(keptHidden.hidden, keptHiddenBack.hidden), keptHidden);
}

const PG_USER = process.env.PG_USER || "postgres";
const PG_DATABASE = process.env.PG_DATABASE || "notes_merge";

function pgArgs(extra) {
  return ["-u", PG_USER, "psql", "-d", PG_DATABASE, "-v", "ON_ERROR_STOP=1", ...extra];
}

function pgSql(sql) {
  return execFileSync("sudo", pgArgs(["-t", "-A", "-c", sql]), { encoding: "utf8" });
}

function rpcCases() {
  const dir = new URL("../..", import.meta.url);
  execFileSync("sudo", pgArgs(["-f", new URL("supabase/migrations/20261004180000_merge_user_data.sql", dir).pathname]), { encoding: "utf8" });
  execFileSync("sudo", pgArgs(["-f", new URL("supabase/migrations/20261004210000_merge_home_v2.sql", dir).pathname]), { encoding: "utf8" });
  execFileSync("sudo", pgArgs(["-f", new URL("supabase/migrations/20261005000000_home_v2_brief_rank.sql", dir).pathname]), { encoding: "utf8" });
  const uid = "11111111-1111-1111-1111-111111111111";
  pgSql(`insert into auth.users (id) values ('${uid}') on conflict (id) do nothing`);
  pgSql(`delete from public.user_data where user_id = '${uid}'`);
  const claim = `select set_config('request.jwt.claim.sub', '${uid}', false)`;
  const call = (payload) => pgSql(`${claim}; select public.merge_user_data('${JSON.stringify(payload).replace(/'/g, "''")}'::jsonb)->>'layout';`);
  const homeOf = (raw) => {
    const lines = raw.trim().split("\n").filter(Boolean);
    const layout = JSON.parse(lines[lines.length - 1]);
    return layout && layout.homeV2;
  };

  call({
    settingsAt: 10,
    machineNotes: { Bench: { text: "Seat 4", at: 20 } },
    layout: { home: { order: ["today"], hidden: ["map-adv"] }, homeV2: { v: 2, items: ["today", "cardio"], hidden: [], updatedAt: 10, migrated: true, migratedAt: 10, ouraSeeded: true } },
  });
  const oldClient = homeOf(call({
    settingsAt: 999999,
    machineNotes: { Bench: { text: "Old", at: 5 }, Squat: { text: "New", at: 30 } },
    layout: { home: { order: ["cardio"], hidden: ["map-adv"] } },
  }));
  check("4 old client with a newer settingsAt keeps homeV2", eq(oldClient.items, ["today", "cardio"]) && oldClient.ouraSeeded === true, oldClient);
  const notes = JSON.parse(pgSql(`${claim}; select data->'machineNotes' from public.user_data where user_id = '${uid}'`).trim().split("\n").filter(Boolean).pop());
  check("4 machine notes still merge", notes.Bench.text === "Seat 4" && notes.Squat.text === "New", notes);

  const edited = homeOf(call({
    settingsAt: 11,
    layout: { home: { order: ["today"], hidden: ["map-adv"] }, homeV2: { v: 2, items: ["steps"], hidden: [], updatedAt: 15 } },
  }));
  check("4 an edit beats a stored migration", eq(edited.items, ["steps"]) && edited.ouraSeeded === true, edited);
  const migratedLater = homeOf(call({
    settingsAt: 12,
    layout: { homeV2: { v: 2, items: ["today"], hidden: [], updatedAt: 99999, migrated: true, migratedAt: 1 } },
  }));
  check("4 a later migration does not replace the edit", eq(migratedLater.items, ["steps"]) && migratedLater.ouraSeeded === true, migratedLater);

  const seededEdit = homeOf(call({
    settingsAt: 13,
    layout: { homeV2: { v: 2, items: ["muscles"], hidden: [], updatedAt: 90 } },
  }));
  check("4 ouraSeeded sticks onto a newer edit", seededEdit.ouraSeeded === true && seededEdit.items[0] === "muscles", seededEdit);

  const partial = homeOf(call({
    settingsAt: 14,
    layout: { homeV2: { v: 2, hidden: [], updatedAt: 999999999 } },
  }));
  check("4 a partial homeV2 does not blank the stored one", eq(partial.items, ["muscles"]) && partial.ouraSeeded === true, partial);

  const future = Date.now() + 10 * 864e5;
  const capped = homeOf(call({
    settingsAt: 15,
    layout: { homeV2: { v: 2, items: ["hrv"], hidden: [], updatedAt: future } },
  }));
  check("4 a future stamp is capped at about one day", capped.items[0] === "hrv" && capped.updatedAt <= Date.now() + 864e5 + 5000 && capped.updatedAt > Date.now(), capped);

  pgSql(`delete from public.user_data where user_id = '${uid}'`);
  call({
    settingsAt: 1,
    layout: { homeV2: { v: 2, items: ["muscles"], hidden: [], updatedAt: 10, ouraSeeded: true } },
  });
  const stringV = homeOf(call({
    settingsAt: 2,
    layout: { homeV2: { v: "2", items: ["steps"], hidden: [], updatedAt: 999999 } },
  }));
  check("string v is rejected and the stored copy stays", eq(stringV.items, ["muscles"]) && stringV.ouraSeeded === true, stringV);
  const onlyUnknown = homeOf(call({
    settingsAt: 3,
    layout: { homeV2: { v: 2, items: ["not-a-widget", "zzz"], hidden: [], updatedAt: 999999 } },
  }));
  check("only unknown ids keep the stored copy", eq(onlyUnknown.items, ["muscles"]) && onlyUnknown.ouraSeeded === true, onlyUnknown);
  const emptyItems = homeOf(call({
    settingsAt: 4,
    layout: { homeV2: { v: 2, items: [], hidden: [], updatedAt: 20 } },
  }));
  check("an empty items array is a real layout", Array.isArray(emptyItems.items) && emptyItems.items.length === 0 && emptyItems.ouraSeeded === true, emptyItems);
  const mixed = homeOf(call({
    settingsAt: 5,
    layout: { homeV2: { v: 2, items: ["nope", "today"], hidden: [], updatedAt: 30 } },
  }));
  check("a mix of known and unknown ids stays valid", eq(mixed.items, ["nope", "today"]) && mixed.ouraSeeded === true, mixed);
  const briefOnly = homeOf(call({
    settingsAt: 6,
    layout: { homeV2: { v: 2, items: ["brief"], hidden: [], updatedAt: 40 } },
  }));
  check("brief is an allowlisted id", eq(briefOnly.items, ["brief"]), briefOnly);
  const ranked = pgSql(`select public.home_v2_pick(
    '{"v":2,"items":["today"],"hidden":[],"updatedAt":5,"sizes":{"z":"s","aa":"m"}}'::jsonb,
    '{"v":2,"items":["today"],"hidden":[],"updatedAt":5,"sizes":{"z":"m","aa":"s"}}'::jsonb,
    1000)::text`).trim();
  const rankedHome = JSON.parse(ranked);
  const clientRank = pickHomeV2(
    { homeV2: { v: 2, items: ["today"], hidden: [], updatedAt: 5, sizes: { z: "s", aa: "m" } } },
    { homeV2: { v: 2, items: ["today"], hidden: [], updatedAt: 5, sizes: { z: "m", aa: "s" } } },
    1000
  );
  check("sql sizes tie-break matches the client", rankedHome.sizes.z === "s" && clientRank.sizes.z === rankedHome.sizes.z, rankedHome.sizes);
  const sqlBrief = (stored, incoming) => JSON.parse(pgSql(`select public.home_v2_pick('${JSON.stringify(stored)}'::jsonb, '${JSON.stringify(incoming)}'::jsonb, 2000)::text`).trim());
  const richBrief = { v: 2, items: ["brief", "this-week", "cardio"], hidden: [], updatedAt: 1000 };
  const poorBrief = { v: 2, items: ["this-week", "cardio"], hidden: [], updatedAt: 1000 };
  const sqlKept = sqlBrief(richBrief, poorBrief);
  const sqlKeptBack = sqlBrief(poorBrief, richBrief);
  check("sql old client stripping brief keeps the richer copy", sqlKept.items.includes("brief") && eq(sqlKept.items, sqlKeptBack.items), sqlKept.items);
  const richHidden = { v: 2, items: ["this-week"], hidden: ["brief"], updatedAt: 1000 };
  const poorHidden = { v: 2, items: ["this-week"], hidden: [], updatedAt: 1000 };
  const sqlHidden = sqlBrief(richHidden, poorHidden);
  const sqlHiddenBack = sqlBrief(poorHidden, richHidden);
  check("sql old client stripping a hidden brief keeps it", sqlHidden.hidden.includes("brief") && eq(sqlHidden.hidden, sqlHiddenBack.hidden), sqlHidden);

  let unauth = "";
  try {
    pgSql(`select set_config('request.jwt.claim.sub', '', false); select public.merge_user_data('{}'::jsonb);`);
  } catch (err) {
    unauth = String(err.stderr || err.message || err);
  }
  check("4 merge_user_data still requires auth.uid()", /not authenticated/i.test(unauth), unauth.slice(0, 180));
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
    executablePath: CHROME,
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

  await a.page.screenshot({ path: `${ART}/home_v2_migrated.png`, fullPage: true });
  const flagOn = await a.page.evaluate(() => window.app.HOME_REGISTRY_PAINT === true);
  if (!flagOn) {
    check("flag off keeps the old Home order", eq(loaded.widgets, ["today", "brief", "cardio", "week", "map-basic"]), loaded.widgets);
  } else {
    await a.page.evaluate(() => {
      const html = window.app.renderHomeWidgets(window.app.getHomeLayout(window.app.state), window.app.snapshotFromApp());
      document.querySelector("#pane-home").insertAdjacentHTML("afterbegin", html);
    });
    const cards = await a.page.$$eval("#pane-home .hw-slot", (els) => els.map((el) => el.dataset.hw));
    check("preview shows the migrated row", eq(cards, CUSTOM_ITEMS), cards);
  }

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

  const corrupt = await a.page.evaluate(() => {
    const before = window.app.state.layout.homeV2.items.slice();
    try {
      window.app.mergeRemote({ settingsAt: (window.app.state.settingsAt || 0) + 1000, layout: "corrupt", sessions: [] });
      return { ok: true, items: window.app.state.layout.homeV2.items.slice(), same: JSON.stringify(before) === JSON.stringify(window.app.state.layout.homeV2.items) };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  });
  check("corrupt remote layout does not throw", corrupt.ok === true && corrupt.same === true, corrupt);

  const day = new Date().toLocaleDateString("en-CA");
  const upgraded = await boot(browser, {
    version: 2,
    sessions: [],
    settingsAt: 200,
    muscleMode: "basic",
    theme: { mode: "dark", accent: "citrus" },
    oura: {
      connected: true,
      lastSync: 1,
      days: { [day]: { date: day, readiness: 82, sleepScore: 74, total: 27000, hrv: 45 } },
    },
    layout: {
      home: {
        order: ["today", "brief", "cardio", "readiness", "week"],
        hidden: ["map-adv"],
      },
    },
    brief: {
      order: ["oura", "train", "week"],
      hidden: ["food", "weight", "pattern"],
      size: "compact",
      updatedAt: 150,
    },
  });
  const home = await upgraded.page.evaluate(() => {
    const homeV2 = window.app.state.layout.homeV2;
    const brief = document.querySelector("#pane-home .wdg[data-w='brief'] [data-metric='oura']");
    return {
      flag: window.app.HOME_REGISTRY_PAINT === true,
      migrated: !!(homeV2 && homeV2.v === 2 && Array.isArray(homeV2.items)),
      widgets: [...document.querySelectorAll("#pane-home .wdg")].map((el) => el.dataset.w),
      strip: document.querySelectorAll("#pane-home .oura-wait, #pane-home [data-hw], #pane-home .home-v2").length,
      card: !!document.querySelector("#pane-home .wdg[data-w='readiness'] .rcard"),
      brief: brief ? brief.textContent : "",
    };
  });
  check(
    "upgraded custom home matches main while the flag is off",
    home.flag === false && home.migrated && eq(home.widgets, ["today", "brief", "cardio", "readiness", "week", "map-basic"]) && home.strip === 0 && home.card && /82/.test(home.brief) && /Sleep 74/.test(home.brief),
    home
  );

  const due = await boot(browser, {
    version: 2,
    sessions: [],
    settingsAt: 1,
    muscleMode: "basic",
    theme: { mode: "dark", accent: "citrus" },
    profile: {
      name: "Ada Lovelace",
      dob: "1990-01-01",
      sex: "female",
      units: "kg",
      heightCm: 170,
      weighIns: [{ date: "2020-01-01", kg: 70 }],
    },
  });
  const nudge = await due.page.evaluate(() => {
    const brief = document.querySelector("#pane-home .wdg[data-w='brief']");
    const button = document.querySelector("#pane-home .nudge");
    const stack = document.querySelector("#pane-home .wdgs");
    return {
      text: button ? button.textContent : "",
      insideBrief: !!(brief && button && brief.contains(button)),
      aboveStack: !!(button && stack && button.compareDocumentPosition(stack) & Node.DOCUMENT_POSITION_FOLLOWING && !stack.contains(button)),
    };
  });
  check("weigh-in nudge renders inside the brief when one is due", nudge.insideBrief && !nudge.aboveStack && /Time for a weigh-in/.test(nudge.text), nudge);

  check("no console errors", a.errors.length === 0 && b.errors.length === 0 && upgraded.errors.length === 0 && due.errors.length === 0, [...a.errors, ...b.errors, ...upgraded.errors, ...due.errors]);
  await browser.close();
}

unit();
rpcCases();
await browserCases();
if (fails.length) {
  console.log("FAILED", fails.join(", "));
  process.exit(1);
}
console.log("ALL PASS");
