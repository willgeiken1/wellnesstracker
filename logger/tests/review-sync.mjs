// Reviewer sync script for two builds sharing one user_data row.
// The in-page RPC stands in for merge_user_data: homeV2 is merged with the
// same pickHomeV2 rules the SQL function uses. Paths and Chrome come from env.
//   NEW=http://127.0.0.1:8765 OLD=http://127.0.0.1:8766 CHROME_PATH=... node logger/tests/review-sync.mjs

import { createRequire } from "node:module";
import { pickHomeV2 } from "../js/shared/home-migrate.js";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const NEW = process.env.NEW || "http://127.0.0.1:8765";
const OLD = process.env.OLD || "http://127.0.0.1:8766";
const CHROME = process.env.CHROME_PATH || "/usr/local/bin/google-chrome";
const R = [];
const ok = (n, c, x) => { R.push([n, !!c]); console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(x)); };
let server = null;

function mergeRow(stored, incoming) {
  const next = incoming && typeof incoming === "object" ? JSON.parse(JSON.stringify(incoming)) : {};
  const storedLayout = stored && stored.layout && typeof stored.layout === "object" && !Array.isArray(stored.layout) ? stored.layout : null;
  const incomingLayout = next.layout && typeof next.layout === "object" && !Array.isArray(next.layout) ? next.layout : null;
  const picked = pickHomeV2(
    storedLayout ? { homeV2: storedLayout.homeV2 } : {},
    incomingLayout ? { homeV2: incomingLayout.homeV2 } : {},
    Date.now()
  );
  if (picked) {
    if (!incomingLayout) next.layout = {};
    next.layout.homeV2 = JSON.parse(JSON.stringify(picked));
  }
  return next;
}

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox", "--disable-dev-shm-usage"] });

async function device(base, local, name) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route("**/*", (route) => { const u = route.request().url(); if (u.startsWith(base)) return route.continue(); return route.abort(); });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.exposeBinding("__srvGet", () => server);
  await page.exposeBinding("__srvSet", (_s, d) => { server = mergeRow(server, d); return server; });
  await page.addInitScript((s) => { if (s && !sessionStorage.getItem("seeded")) { sessionStorage.setItem("seeded", "1"); localStorage.setItem("liftlog-v1", JSON.stringify(s)); } }, local);
  await page.goto(base + "/index.html", { waitUntil: "load" });
  await page.waitForFunction(() => window.app && window.app.state);
  await page.evaluate(() => {
    window.__offline = false;
    const q = () => ({ select() { return this; }, eq() { return this; }, gte() { return this; },
      async maybeSingle() { if (window.__offline) throw new Error("offline"); const d = await window.__srvGet(); return { data: d ? { data: d } : null, error: null }; },
      async upsert(row) { if (window.__offline) throw new Error("offline"); await window.__srvSet(JSON.parse(JSON.stringify(row.data))); return { error: null }; } });
    window.app.sb = { from: q, async rpc(fn, { p_data }) { if (window.__offline) throw new Error("offline"); const merged = await window.__srvSet(JSON.parse(JSON.stringify(p_data))); return { data: merged, error: null }; },
      functions: { async invoke() { return { error: null }; } } };
    window.app.session = { user: { id: "u-test" } };
  });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  return { page, context, errors, name, ev,
    pull: () => ev(() => window.app.cloudPull()), push: () => ev(() => window.app.cloudPush()),
    v2: () => ev(() => JSON.parse(JSON.stringify((window.app.state.layout || {}).homeV2 || null))),
    stored: () => ev(() => { const s = JSON.parse(localStorage.getItem("liftlog-v1") || "null"); return s && s.layout ? s.layout.homeV2 || null : null; }),
    close: () => context.close() };
}
const base = (extra) => ({ version: 2, sessions: [], workouts: [], plan: {}, ...extra });
const oldKeys = (order, hidden, settingsAt) => ({ settingsAt, layout: { home: { order, hidden } } });

{
  const T = Date.now();
  server = base({ ...oldKeys(["cardio", "week", "today"], ["map-adv", "readiness"], T - 1000), updatedAt: T - 1000 });
  const n = await device(NEW, base({ ...oldKeys(["today", "cardio"], ["map-adv"], T - 864e5), updatedAt: T - 864e5 }), "N");
  const atLoad = await n.v2();
  await n.pull();
  const after = await n.v2();
  const expected = (await n.ev((s) => window.app.migrateHomeLayout(s), server)).items;
  console.log("  B1 at load:", JSON.stringify(atLoad && atLoad.items), "\n  B1 after pull:", JSON.stringify(after && after.items), "\n  B1 expected from newer synced keys:", JSON.stringify(expected));
  ok("B1 stale local migration does not lock in an older arrangement after pull", JSON.stringify(after.items) === JSON.stringify(expected), { after: after.items });
  await n.close();
}
{
  const T = Date.now() - 50000;
  server = null;
  const n = await device(NEW, base({ ...oldKeys(["today", "cardio"], ["map-adv"], T), updatedAt: T }), "N");
  await n.push();
  ok("B2a migrated homeV2 reaches the server", !!(server && server.layout && server.layout.homeV2));
  const o1 = await device(OLD, base({ ...oldKeys(["today", "cardio"], ["map-adv"], T - 10), updatedAt: T - 10 }), "O1");
  await o1.pull(); await o1.push();
  ok("B3 old client (older settingsAt) keeps homeV2 through its merge+push", !!(server.layout && server.layout.homeV2), server.layout);
  const o1Reload = await o1.ev(() => { const s = JSON.parse(localStorage.getItem("liftlog-v1")); return !!(window.app.migrate(s).layout.homeV2); });
  ok("B3b old client's migrate() on reload preserves unknown layout.homeV2", o1Reload);
  await o1.close();
  const o2 = await device(OLD, base({ ...oldKeys(["today", "cardio"], ["map-adv"], Date.now()), updatedAt: Date.now() }), "O2");
  await o2.pull(); await o2.push();
  ok("B2b old client (newer settingsAt) push does not erase homeV2 from the server", !!(server.layout && server.layout.homeV2), server.layout);
  await o2.close();
  await n.pull();
  ok("B2c new client keeps its homeV2 after pulling a homeV2-less row", !!(await n.v2()));
  await n.push();
  ok("B2d new client's next push restores homeV2 on the server", !!(server.layout && server.layout.homeV2));
  await n.close();
}
{
  const T0 = Date.now() - 100000;
  server = null;
  const n = await device(NEW, base({ ...oldKeys(["today", "cardio"], ["map-adv"], T0), updatedAt: T0 }), "N");
  await n.ev(() => { const h = window.app.state.layout.homeV2; window.app.state.layout.homeV2 = { ...h, items: ["steps", "sleep-duration", "today"], hidden: ["cardio"], updatedAt: Date.now() - 60000 }; window.app.save(); });
  await n.push();
  const edited = await n.v2();
  const o = await device(OLD, base({ ...oldKeys(["today", "cardio"], ["map-adv"], T0), updatedAt: T0 }), "O");
  await o.ev(() => { window.app.state.settingsAt = Date.now(); window.app.save(); });
  await o.pull(); await o.push(); await o.close();
  console.log("  B4 server homeV2 after old push:", JSON.stringify(server.layout.homeV2 || null));
  const d = await device(NEW, null, "D");
  await d.pull(); await d.push(); await d.close();
  console.log("  B4 server homeV2 after fresh device D:", JSON.stringify(server.layout.homeV2));
  await n.pull();
  const final = await n.v2();
  ok("B4 user's v2 edit survives old-client push + fresh device migration", JSON.stringify(final.items) === JSON.stringify(edited.items), { edited: edited.items, final: final.items });
  await n.close();
}
{
  const T = Date.now() - 7000;
  const s = base({ ...oldKeys(["week", "brief", "today"], ["map-adv", "cardio"], T), brief: { order: ["oura", "weight"], hidden: ["food"], size: "compact", updatedAt: T - 5 }, updatedAt: T });
  server = null;
  const a = await device(NEW, s, "A"), b = await device(NEW, s, "B");
  const va = await a.v2(), vb = await b.v2();
  await a.push(); await b.pull(); await b.push(); await a.pull();
  const fa = await a.v2(), fb = await b.v2();
  ok("B5 independent migrations converge, nothing reset", JSON.stringify(fa.items) === JSON.stringify(va.items) && JSON.stringify(fb.items) === JSON.stringify(vb.items) && JSON.stringify(fa.items) === JSON.stringify(fb.items) && JSON.stringify(fa.hidden) === JSON.stringify(fb.hidden));
  await a.ev(() => { const h = window.app.state.layout.homeV2; window.app.state.layout.homeV2 = { ...h, items: ["cardio"], updatedAt: Date.now() }; window.app.save(); });
  await a.push();
  const c = await device(NEW, s, "C");
  await c.pull();
  ok("B6 freshly migrated copy does not clobber a newer remote edit", JSON.stringify((await c.v2()).items) === '["cardio"]');
  await c.push();
  ok("B6b server still holds the newer edit after C pushes", JSON.stringify(server.layout.homeV2.items) === '["cardio"]');
  await b.ev(() => { window.__offline = true; const h = window.app.state.layout.homeV2; window.app.state.layout.homeV2 = { ...h, items: ["today", "pattern"], updatedAt: Date.now() + 5 }; window.app.save(); });
  await b.push();
  ok("B7a offline push leaves server alone", JSON.stringify(server.layout.homeV2.items) === '["cardio"]');
  await b.ev(() => { window.__offline = false; }); await b.push();
  ok("B7b offline edit (newer) lands after reconnect", JSON.stringify(server.layout.homeV2.items) === '["today","pattern"]');
  await a.pull();
  ok("B7c other device adopts it", JSON.stringify((await a.v2()).items) === '["today","pattern"]');
  const before = await c.stored();
  console.log("  B10 note: homeV2 persisted on C =", !!before);
  for (const x of [a, b, c]) { if (x.errors.length) console.log("  page errors", x.name, x.errors); await x.close(); }
}
{
  const T = Date.now() - 9000;
  server = base({ settingsAt: T, layout: { home: { order: ["today"], hidden: ["map-adv"] }, homeV2: { v: 2, items: ["readiness", "sleep-score", "today"], hidden: [], updatedAt: T, migratedAt: T, ouraSeeded: true } }, updatedAt: T });
  const b = await device(NEW, base({ settingsAt: T - 100, layout: { home: { order: ["today"], hidden: ["map-adv"] }, homeV2: { v: 2, items: ["today"], hidden: ["readiness", "sleep-score"], updatedAt: T - 100, migratedAt: T - 100 } }, updatedAt: T - 100 }), "B");
  await b.ev(() => { const h = window.app.state.layout.homeV2; window.app.state.layout.homeV2 = { ...h, items: ["today", "cardio"], updatedAt: Date.now() }; window.app.save(); });
  await b.push();
  ok("B8 ouraSeeded preserved on server after a newer edit from a phone that hadn't seen it", server.layout.homeV2.ouraSeeded === true, server.layout.homeV2);
  await b.close();
}
{
  const T = Date.now();
  server = base({ settingsAt: T + 1000, layout: "corrupt", updatedAt: T });
  const n = await device(NEW, base({ ...oldKeys(["today", "cardio"], ["map-adv"], T - 5000), updatedAt: T - 5000 }), "N");
  const res = await n.ev(async () => { try { const r = await window.__srvGet(); window.app.mergeRemote(r); return "ok:" + typeof window.app.state.layout; } catch (e) { return "throw:" + e.message; } });
  console.log("  B9 mergeRemote with layout:'corrupt' ->", res);
  ok("B9 malformed remote layout does not throw in mergeRemote", res.startsWith("ok"), res);
  server = base({ settingsAt: 1, layout: { homeV2: { v: 2, hidden: [], updatedAt: T + 1e6 } }, updatedAt: 1 });
  const n2 = await device(NEW, base({ ...oldKeys(["today", "cardio"], ["map-adv"], T - 5000), updatedAt: T - 5000 }), "N2");
  await n2.pull();
  ok("B9b partial remote homeV2 (no items) does not replace a good local layout", Array.isArray((await n2.v2()).items), await n2.v2());
  await n.close(); await n2.close();
}
await browser.close();
const failed = R.filter((r) => !r[1]);
console.log(`\nsync: ${R.filter((r) => r[1]).length}/${R.length} pass`);
if (failed.length) process.exit(1);
