// Reviewer unit script. Imports point at this repo. PR 11's oura gate is not
// on this branch; the two calls that used it only printed, so they are no-ops here.

import { migrateHomeLayout, applyHomeMigration, pickHomeV2 } from "../js/shared/home-migrate.js";

const visibleHomeIds = () => [];
const noteOuraConnected = () => {};
const eqItems = (m) => m && JSON.stringify(m.items) === JSON.stringify(["today"]) && m.hidden.includes("pattern") && !m.items.includes("cardio");
const R = [];
const ok = (n, c, x) => { R.push([n, !!c]); console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(x)); };
const J = (o) => JSON.parse(JSON.stringify(o));

ok("U1 fresh: no homeV2 written", !applyHomeMigration({ version: 2, sessions: [] }).layout);
ok("U1b fresh w/ empty layout obj", !applyHomeMigration({ layout: {} }).layout.homeV2);

const V = {
  preBriefOrder: { settingsAt: 50, layout: { home: { order: ["today", "readiness", "week"], hidden: ["map-adv"] } } },
  withBrief: { settingsAt: 60, layout: { home: { order: ["week", "brief", "today"], hidden: ["map-basic", "cardio"] } } },
  briefHidden: { settingsAt: 70, layout: { home: { order: ["today"], hidden: ["brief", "map-adv"] } }, brief: { order: ["oura", "week"], hidden: ["week"], size: "expanded", updatedAt: 65 } },
  briefOnlyPrePattern: { settingsAt: 0, brief: { order: ["weight", "oura", "train", "food", "week"], hidden: ["oura"], size: "compact", updatedAt: 80 } },
  hiddenOnlyNonDefault: { settingsAt: 90, layout: { home: { order: [], hidden: ["map-adv", "today"] } } },
  bothMapsHidden: { settingsAt: 91, layout: { home: { order: [], hidden: ["map-adv", "map-basic"] } } },
  advModeDefault: { muscleMode: "advanced", settingsAt: 92, layout: { home: { order: [], hidden: ["map-basic"] } } },
  sizeOnly: { brief: { size: "expanded" } },
  unknownIds: { settingsAt: 93, layout: { home: { order: ["bogus", "today", 7, null], hidden: ["zzz"] } } },
  allHomeHidden: { settingsAt: 94, layout: { home: { order: ["today"], hidden: ["brief", "readiness", "week", "cardio", "map-adv", "map-basic"] } } },
  noSettingsAtNoStamp: { layout: { home: { order: ["cardio", "today"], hidden: ["map-adv"] } } },
};
for (const [k, s] of Object.entries(V)) console.log("  variant", k, JSON.stringify(migrateHomeLayout(J(s))));
const m1 = migrateHomeLayout(V.preBriefOrder);
ok("U2a pre-brief order: brief tiles first, then today/readiness/week order", m1 && m1.items[0] === "pattern" && m1.items.indexOf("readiness") < m1.items.indexOf("today") && m1.items.indexOf("today") < m1.items.indexOf("hrv") && m1.items.indexOf("hrv") < m1.items.indexOf("this-week"), m1);
const m2 = migrateHomeLayout(V.withBrief);
ok("U2b custom order w/ brief middle + hidden cardio", m2.items.indexOf("this-week") < m2.items.indexOf("pattern") && m2.items.indexOf("pattern") < m2.items.indexOf("today") && m2.hidden.includes("cardio") && !m2.items.includes("cardio"), m2);
const m3 = migrateHomeLayout(V.briefHidden);
ok("U2c brief hidden -> its tiles hidden, not shown", ["readiness","sleep-score"].every((i)=>!m3.items.includes(i) || i==="readiness") && m3.hidden.includes("weekly-goal") && m3.hidden.includes("pattern"), m3);
const m6 = migrateHomeLayout(V.allHomeHidden);
ok("U2d every hidden widget stays hidden and today stays visible", eqItems(m6), m6);
ok("U2e default map hide only -> null", migrateHomeLayout(V.advModeDefault) === null);
ok("U2f size-only brief -> null", migrateHomeLayout(V.sizeOnly) === null);
ok("U2g old keys untouched by apply", (() => { const s = J(V.withBrief); const before = JSON.stringify(s.layout.home); applyHomeMigration(s); return JSON.stringify(s.layout.home) === before; })());

{
  const s = J(V.withBrief); applyHomeMigration(s, 111); const a = J(s.layout.homeV2); s.layout.home.order = ["cardio"]; s.settingsAt = 999; applyHomeMigration(s, 222);
  ok("U3 runs once (migratedAt guard) and idempotent", JSON.stringify(a) === JSON.stringify(s.layout.homeV2));
}

{
  const a = { homeV2: { v: 2, items: ["today"], hidden: [], updatedAt: 1, migratedAt: 5 } }, b = { homeV2: { v: 2, items: ["cardio"], hidden: [], updatedAt: 1, migratedAt: 6 } };
  const onA = pickHomeV2(a, b), onB = pickHomeV2(b, a);
  ok("U4 equal updatedAt, different content: both devices converge", JSON.stringify(onA.items) === JSON.stringify(onB.items), { onA: onA.items, onB: onB.items });
}
{
  const s1 = J(V.noSettingsAtNoStamp), s2 = { layout: { home: { order: ["today", "cardio"], hidden: [] } } };
  applyHomeMigration(s1, 10); applyHomeMigration(s2, 20);
  console.log("  unstamped migrations updatedAt:", s1.layout.homeV2.updatedAt, s2.layout.homeV2.updatedAt);
}

{
  const future = { homeV2: { v: 2, items: ["today"], hidden: [], updatedAt: Date.now() + 365 * 864e5 } }, real = { homeV2: { v: 2, items: ["cardio"], hidden: [], updatedAt: Date.now() } };
  ok("U5 future-dated remote beats a real edit made now (LWW, documents skew)", pickHomeV2(real, future).items[0] === "today");
}
{
  const miss = { homeV2: { v: 2, items: ["today"], hidden: [] } }, has = { homeV2: { v: 2, items: ["cardio"], hidden: [], updatedAt: 1 } };
  ok("U5b missing updatedAt loses to any stamped copy", pickHomeV2(miss, has).items[0] === "cardio");
}
{
  const str = { homeV2: { v: 2, items: ["today"], hidden: [], updatedAt: "9" } }, num = { homeV2: { v: 2, items: ["cardio"], hidden: [], updatedAt: 10 } };
  console.log("  string updatedAt '9' vs 10 ->", pickHomeV2(str, num).items);
}

const bad = [null, "x", [], { homeV2: null }, { homeV2: "x" }, { homeV2: { v: 1, items: [] } }, { homeV2: { v: 2 } }, { homeV2: { v: 2, items: "x" } }, { homeV2: { v: "2", items: ["today"], updatedAt: 99 } }, { homeV2: { v: 2, items: ["nope", "zzz"], updatedAt: 99 } }];
const local = { homeV2: { v: 2, items: ["today"], hidden: [], updatedAt: 5 } };
ok("U6 malformed remotes never replace a good local", bad.every((r) => pickHomeV2(local, r) === local.homeV2));
{
  const empty = pickHomeV2(local, { homeV2: { v: 2, items: [], hidden: [], updatedAt: 50 } });
  ok("U6c an empty items array is a real layout", empty && empty.items.length === 0 && empty.updatedAt === 50, empty);
}
{
  const r = { homeV2: { v: 2, hidden: ["today"], updatedAt: 99 } }; const w = pickHomeV2(local, r);
  ok("U6b partial remote {v:2, hidden} (no items) must not win", w === local.homeV2, w);
  const st = { layout: { homeV2: w } }; console.log("  visible ids on that winner:", JSON.stringify(visibleHomeIds(st)));
}
{
  const r = { homeV2: { v: 2, items: [1, null, "nope", "today"], hidden: {}, updatedAt: 99 } }; const w = pickHomeV2(local, r);
  console.log("  junk-items remote winner:", JSON.stringify(w));
}

{
  const seeded = { homeV2: { v: 2, items: ["today"], hidden: ["readiness"], updatedAt: 100, migratedAt: 1, ouraSeeded: true } };
  const editElsewhere = { homeV2: { v: 2, items: ["cardio", "today"], hidden: ["readiness", "sleep-score"], updatedAt: 200, migratedAt: 2 } };
  const w = pickHomeV2(seeded, editElsewhere);
  ok("U7 ouraSeeded survives merge with a newer copy lacking it", w.ouraSeeded === true, w);
  const st = { oura: { connected: true }, layout: { homeV2: w } }; noteOuraConnected(st, true);
  console.log("  after noteOuraConnected:", JSON.stringify(st.layout.homeV2.items), "ouraSeeded", st.layout.homeV2.ouraSeeded);
}
{
  const s = { settingsAt: 500, layout: { home: { order: ["cardio", "today"], hidden: ["map-adv"] }, homeV2: { v: 2, items: ["readiness", "sleep-score", "today"], hidden: [], updatedAt: 300, ouraSeeded: true, extra: "step1field" } } };
  applyHomeMigration(s, 9); ok("U7b applyHomeMigration keeps ouraSeeded/other fields when it replaces homeV2", s.layout.homeV2.ouraSeeded === true && s.layout.homeV2.extra === "step1field", s.layout.homeV2);
}
{
  const s = { settingsAt: 50, layout: { home: { order: ["cardio"], hidden: [] }, homeV2: { v: 2, items: ["today"], hidden: [], updatedAt: 300, ouraSeeded: true } } };
  applyHomeMigration(s, 9); ok("U7c keep-branch preserves ouraSeeded", s.layout.homeV2.ouraSeeded === true && s.layout.homeV2.items[0] === "today");
}
{
  const s = { settingsAt: Date.now(), layout: { home: { order: ["cardio"], hidden: [] }, homeV2: { v: 2, items: ["today", "pattern"], hidden: [], updatedAt: Date.now() - 1000 } } };
  applyHomeMigration(s, 9); ok("U8 unmigrated v2 edit not overwritten because an unrelated setting bumped settingsAt", s.layout.homeV2.items[0] === "today", s.layout.homeV2);
}
console.log(`\nunit: ${R.filter((r) => r[1]).length}/${R.length} pass`);
if (R.some((r) => !r[1])) process.exit(1);
