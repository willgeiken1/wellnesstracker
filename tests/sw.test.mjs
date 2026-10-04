import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SRC = readFileSync(new URL("../logger/sw.js", import.meta.url), "utf8");
const NAV = 60;
const ASSET = 90;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class FakeRequest {
  constructor(input, init = {}) {
    const base = typeof input === "string" ? { url: new URL(input, "https://app.test/").href } : input;
    this.url = base.url;
    this.method = base.method || "GET";
    this.mode = base.mode || "same-origin";
    this.cache = init.cache || base.cache;
  }
}

function load({ fetchImpl, cached = {}, home = null, cacheMap = null }) {
  const handlers = {};
  const puts = [];
  const added = [];
  const self = {
    __SW_TEST_TIMEOUTS: { nav: NAV, asset: ASSET },
    location: { origin: "https://app.test" },
    addEventListener: (type, fn) => { handlers[type] = fn; },
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
  };
  const cache = {
    put: async (req, res) => { puts.push([req, res]); },
    addAll: async (reqs) => { added.push(...reqs); },
  };
  const caches = {
    open: async () => cache,
    keys: async () => [],
    delete: async () => true,
    match: async (req) => {
      if (cacheMap) {
        if (typeof req === "string") return cacheMap[req] || (req === "./index.html" ? home : null) || null;
        const path = new URL(req.url).pathname;
        return cacheMap[req.url] || cacheMap[path] || null;
      }
      if (typeof req === "string") return req === "./index.html" ? home : null;
      return cached.value || null;
    },
  };
  const ctx = vm.createContext({
    self, caches, fetch: fetchImpl, Request: FakeRequest, URL, Promise, setTimeout, clearTimeout,
  });
  vm.runInContext(SRC, ctx);
  return { handlers, puts, added };
}

function dispatch(handlers, req, ids = {}) {
  let responded;
  const waits = [];
  handlers.fetch({
    request: req,
    clientId: ids.clientId || "",
    resultingClientId: ids.resultingClientId || "",
    respondWith: (p) => { responded = p; },
    waitUntil: (p) => { waits.push(p); },
  });
  return { responded, waits };
}

const nav = () => new FakeRequest({ url: "https://app.test/", mode: "navigate" });
const asset = () => new FakeRequest("https://app.test/js/main.js?v=1");
const okRes = (tag) => ({ tag, ok: true, type: "basic", clone() { return { tag: tag + "-clone" }; } });

test("slow network with a cached copy returns the cache at about the timeout", async () => {
  const cachedRes = { tag: "cached" };
  const { handlers } = load({
    cached: { value: cachedRes },
    fetchImpl: async () => { await sleep(400); return okRes("net"); },
  });
  const t0 = Date.now();
  const { responded } = dispatch(handlers, asset());
  assert.equal(await responded, cachedRes);
  const took = Date.now() - t0;
  assert.ok(took >= ASSET - 10 && took < 300, `took ${took}ms`);
});

test("slow navigation falls back to the cached index.html", async () => {
  const home = { tag: "home" };
  const { handlers } = load({ home, fetchImpl: async () => { await sleep(300); return okRes("net"); } });
  const { responded } = dispatch(handlers, nav());
  assert.equal(await responded, home);
});

test("slow network with nothing cached keeps waiting for the network", async () => {
  const net = okRes("net");
  const { handlers } = load({ fetchImpl: async () => { await sleep(250); return net; } });
  const t0 = Date.now();
  const { responded } = dispatch(handlers, nav());
  assert.equal(await responded, net);
  assert.ok(Date.now() - t0 >= 240);
});

test("a late network response still updates the cache after the timeout fired", async () => {
  const { handlers, puts } = load({
    cached: { value: { tag: "cached" } },
    fetchImpl: async () => { await sleep(200); return okRes("net"); },
  });
  const { responded, waits } = dispatch(handlers, asset());
  assert.equal((await responded).tag, "cached");
  assert.equal(puts.length, 0);
  await Promise.all(waits);
  assert.equal(puts.length, 1);
});

test("network error with a cached copy returns the cache", async () => {
  const cachedRes = { tag: "cached" };
  const { handlers } = load({ cached: { value: cachedRes }, fetchImpl: async () => { throw new Error("offline"); } });
  const { responded } = dispatch(handlers, asset());
  assert.equal(await responded, cachedRes);
});

test("network error with nothing cached rejects", async () => {
  const { handlers } = load({ fetchImpl: async () => { throw new Error("offline"); } });
  const { responded } = dispatch(handlers, asset());
  await assert.rejects(responded, /offline/);
});

test("fast network returns the network response and writes the cache", async () => {
  const net = okRes("net");
  const { handlers, puts } = load({ cached: { value: { tag: "cached" } }, fetchImpl: async () => net });
  const { responded, waits } = dispatch(handlers, asset());
  assert.equal(await responded, net);
  await Promise.all(waits);
  assert.equal(puts.length, 1);
  assert.equal(puts[0][1].tag, "net-clone");
});

test("non-GET and cross-origin requests are not intercepted", () => {
  const { handlers } = load({ fetchImpl: async () => okRes("net") });
  assert.equal(dispatch(handlers, new FakeRequest({ url: "https://app.test/x", method: "POST" })).responded, undefined);
  assert.equal(dispatch(handlers, new FakeRequest("https://cdn.test/x.js")).responded, undefined);
});

test("install precaches with cache:reload", async () => {
  const { handlers, added } = load({ fetchImpl: async () => okRes("net") });
  const waits = [];
  handlers.install({ waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  assert.ok(added.length > 10);
  assert.ok(added.every((r) => r instanceof FakeRequest && r.cache === "reload"));
});

test("randomized: response is always the cached copy or the network per the rules", async (t) => {
  // Mock timers: virtual time advances 1ms per tick and microtasks settle between ticks,
  // so no real clock or machine load is involved. Exact ties may go either way.
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const cases = [];
  for (let i = 0; i < 200; i++) {
    cases.push({
      delay: Math.floor(rnd() * 120),
      fails: rnd() < 0.3,
      hasCache: rnd() < 0.5,
      navigate: rnd() < 0.5,
    });
  }
  const runs = cases.map((c, i) => {
    const net = okRes("net" + i);
    const cachedRes = { tag: "cached" + i };
    const { handlers } = load({
      cached: !c.navigate && c.hasCache ? { value: cachedRes } : {},
      home: c.navigate && c.hasCache ? cachedRes : null,
      fetchImpl: async () => { await sleep(c.delay); if (c.fails) throw new Error("fail" + i); return net; },
    });
    const { responded } = dispatch(handlers, c.navigate ? nav() : asset());
    const settled = responded.then((res) => ({ res }), (err) => ({ err }));
    return { c, i, net, cachedRes, settled };
  });
  const settle = () => new Promise((r) => setImmediate(r));
  await settle();
  for (let ms = 0; ms <= 130; ms++) {
    t.mock.timers.tick(1);
    await settle();
  }
  for (const { c, i, net, cachedRes, settled } of runs) {
    const out = await settled;
    const timeout = c.navigate ? NAV : ASSET;
    if (c.fails && !c.hasCache) {
      assert.match(String(out.err && out.err.message), new RegExp("^fail" + i + "$"), `case ${i}`);
      continue;
    }
    assert.ok(!out.err, `case ${i}: unexpected rejection`);
    if (c.fails) assert.equal(out.res, cachedRes, `case ${i}`);
    else if (!c.hasCache) assert.equal(out.res, net, `case ${i}`);
    else if (c.delay < timeout) assert.equal(out.res, net, `case ${i}`);
    else if (c.delay > timeout) assert.equal(out.res, cachedRes, `case ${i}`);
    else assert.ok(out.res === net || out.res === cachedRes, `case ${i} (tie)`);
  }
});

test("a deploy during a slow network never mixes old and new files within one page load", async () => {
  const files = ["/js/usage.js", "/js/usage-pref.js", "/css/theme.css"];
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const cases = [{ navSlow: false, slowFile: "/js/usage-pref.js" }, { navSlow: true, slowFile: "/js/usage.js" }];
  for (let i = 0; i < 20; i++) cases.push({ navSlow: rnd() < 0.5, slowFile: files[Math.floor(rnd() * files.length)] });
  const body = (tag) => ({ tag, ok: true, type: "basic", clone() { return { tag: tag + "-clone" }; } });

  for (let n = 0; n < cases.length; n++) {
    const c = cases[n];
    const cacheMap = { "./index.html": body("old-html") };
    files.forEach((f) => { cacheMap[f] = body("old" + f); });
    const { handlers } = load({
      cacheMap,
      home: cacheMap["./index.html"],
      fetchImpl: async (req) => {
        const path = new URL(req.url).pathname;
        const file = path === "/" ? "/index.html" : path;
        const slow = c.navSlow ? file === "/index.html" : file === c.slowFile;
        if (slow) await sleep(c.navSlow ? 180 : 220);
        return body("new" + file);
      },
    });
    const page = "page-" + n;
    const nav = dispatch(handlers, new FakeRequest({ url: "https://app.test/", mode: "navigate" }), { resultingClientId: page });
    const html = await nav.responded;
    const assets = await Promise.all(files.map(async (f) => {
      const d = dispatch(handlers, new FakeRequest("https://app.test" + f), { clientId: page });
      return d.responded;
    }));
    const tags = [html.tag].concat(assets.map((res) => res.tag));
    const gens = new Set(tags.map((t) => (t.startsWith("old") ? "old" : "new")));
    assert.equal(gens.size, 1, `case ${n} mixed ${tags.join(",")}`);
    assert.equal([...gens][0], c.navSlow ? "old" : "new", `case ${n} navSlow=${c.navSlow}`);
  }
});
