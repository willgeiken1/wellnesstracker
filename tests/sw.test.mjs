import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SRC = readFileSync(new URL("../logger/sw.js", import.meta.url), "utf8");
const CACHE_NAME = (SRC.match(/const CACHE = "([^"]+)"/) || [])[1];
const STAGE_NAME = CACHE_NAME + "-next";
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

function cacheNorm(req) {
  const raw = typeof req === "string" ? req : new URL(req.url).pathname;
  let path = raw.replace(/^\.\//, "");
  if (!path || path === "index.html" || path === "/") return "/";
  if (!path.startsWith("/")) path = "/" + path;
  return path;
}

function load({ fetchImpl, cached = {}, home = null, cacheMap = null, shellRefresh = false, record = false, src = SRC, stores: shared } = {}) {
  const handlers = {};
  const puts = [];
  const added = [];
  const ops = [];
  const stores = shared || new Map();
  const self = {
    __SW_TEST_TIMEOUTS: { nav: NAV, asset: ASSET },
    __SW_SHELL_REFRESH: shellRefresh ? true : undefined,
    location: { origin: "https://app.test" },
    addEventListener: (type, fn) => { handlers[type] = fn; },
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() },
  };
  if (record && !stores.has(CACHE_NAME)) {
    const live = new Map();
    stores.set(CACHE_NAME, live);
    if (cacheMap) Object.entries(cacheMap).forEach(([k, v]) => live.set(cacheNorm(k), v));
    if (home) live.set("/", home);
  }
  const matchOld = async (req) => {
    if (cacheMap) {
      if (typeof req === "string") return cacheMap[req] || (req === "./index.html" || req === "./" ? home : null) || null;
      const path = new URL(req.url).pathname;
      return cacheMap[req.url] || cacheMap[path] || (path === "/" ? home : null) || null;
    }
    if (typeof req === "string") return req === "./index.html" || req === "./" ? home : null;
    return cached.value || null;
  };
  const caches = {
    open: async (name) => {
      if (record && !stores.has(name)) stores.set(name, new Map());
      const box = record ? stores.get(name) : null;
      return {
        put: async (req, res) => {
          puts.push([name, req, res]);
          ops.push({ op: "put", name, key: cacheNorm(req) });
          if (box) box.set(cacheNorm(req), typeof res.clone === "function" ? res.clone() : res);
        },
        delete: async (req) => {
          ops.push({ op: "del", name, key: cacheNorm(req) });
          if (box) box.delete(cacheNorm(req));
          return true;
        },
        keys: async () => (box ? [...box.keys()] : []),
        match: async (req) => (box ? box.get(cacheNorm(req)) || null : matchOld(req)),
        addAll: async (reqs) => {
          added.push(...reqs);
          if (!box) return;
          const fetched = [];
          for (const req of reqs) {
            const res = await fetchImpl(req);
            if (!res || !res.ok || (res.type !== "basic" && res.type !== "default")) throw new Error("precached shell failed");
            fetched.push([req, res]);
          }
          for (const [req, res] of fetched) {
            puts.push([name, req, res]);
            box.set(cacheNorm(req), typeof res.clone === "function" ? res.clone() : res);
          }
        },
      };
    },
    keys: async () => [...stores.keys()],
    delete: async (name) => { stores.delete(name); return true; },
    match: async (req) => matchOld(req),
  };
  const ctx = vm.createContext({
    self, caches, fetch: fetchImpl, Request: FakeRequest, URL, Promise, setTimeout, clearTimeout,
  });
  vm.runInContext(src, ctx);
  return { handlers, puts, added, stores, ops };
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

test("a late network response does not write the live cache one file at a time", async () => {
  const { handlers, puts } = load({
    cached: { value: { tag: "cached" } },
    fetchImpl: async () => { await sleep(200); return okRes("net"); },
  });
  const { responded, waits } = dispatch(handlers, asset());
  assert.equal((await responded).tag, "cached");
  await Promise.all(waits);
  assert.equal(puts.length, 0);
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

test("fast network returns the network response and does not write the live cache", async () => {
  const net = okRes("net");
  const { handlers, puts } = load({ cached: { value: { tag: "cached" } }, fetchImpl: async () => net });
  const { responded, waits } = dispatch(handlers, asset());
  assert.equal(await responded, net);
  await Promise.all(waits);
  assert.equal(puts.length, 0);
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

function shellFile(tag, text) {
  const res = {
    tag,
    ok: true,
    type: "basic",
    async text() { return text == null ? tag : text; },
    clone() { return shellFile(tag, text); },
  };
  return res;
}

function storedTag(stores, name, path) {
  const box = stores.get(name);
  const res = box && box.get(path);
  return res ? res.tag : null;
}

async function until(fn, ms = 1000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn()) return;
    await sleep(5);
  }
  throw new Error("timed out waiting for shell refresh");
}

function lieFetch(prefGate) {
  return async (req) => {
    const path = new URL(req.url).pathname;
    const reload = req.cache === "reload";
    if (!reload && (path === "/" || path === "/index.html")) {
      await sleep(NAV + 40);
      return shellFile("net-html", "NEW PAGE");
    }
    if (path === "/js/usage-pref.js") {
      await prefGate;
      return shellFile("new-pref", "export const NEW_THING = 1");
    }
    if (path === "/js/usage.js") return shellFile("new-usage", "import { NEW_THING } from './usage-pref.js'");
    return shellFile("new" + path, "new " + path);
  };
}

test("lie: a slow shell file stays out of the live cache until the whole shell is staged", async () => {
  let releasePref;
  const prefGate = new Promise((resolve) => { releasePref = resolve; });
  const cacheMap = {
    "/": shellFile("old-html", "OLD PAGE"),
    "/index.html": shellFile("old-html", "OLD PAGE"),
    "/js/usage.js": shellFile("old-usage", "old usage"),
    "/js/usage-pref.js": shellFile("old-pref", "old pref"),
  };
  const { handlers, stores } = load({
    record: true,
    shellRefresh: true,
    cacheMap,
    home: cacheMap["/"],
    fetchImpl: lieFetch(prefGate),
  });
  const first = dispatch(handlers, nav(), { resultingClientId: "p1" });
  assert.equal((await first.responded).tag, "old-html");
  await until(() => storedTag(stores, STAGE_NAME, "/js/usage.js") === "new-usage");
  assert.equal(storedTag(stores, CACHE_NAME, "/js/usage.js"), "old-usage");
  assert.equal(storedTag(stores, CACHE_NAME, "/js/usage-pref.js"), "old-pref");
  assert.equal(storedTag(stores, STAGE_NAME, "/js/usage-pref.js"), null);
  assert.equal(stores.has(CACHE_NAME), true);

  const second = dispatch(handlers, nav(), { resultingClientId: "p2" });
  assert.equal((await second.responded).tag, "old-html");
  const usage = dispatch(handlers, new FakeRequest("https://app.test/js/usage.js"), { clientId: "p2" });
  const pref = dispatch(handlers, new FakeRequest("https://app.test/js/usage-pref.js"), { clientId: "p2" });
  assert.equal((await usage.responded).tag, "old-usage");
  assert.equal((await pref.responded).tag, "old-pref");
  assert.equal(storedTag(stores, CACHE_NAME, "/js/usage.js"), "old-usage");

  releasePref();
  await Promise.all(first.waits.concat(second.waits));
  assert.equal(storedTag(stores, CACHE_NAME, "/js/usage.js"), "new-usage");
  assert.equal(storedTag(stores, CACHE_NAME, "/js/usage-pref.js"), "new-pref");
  assert.equal(storedTag(stores, CACHE_NAME, "/js/main.js"), "new/js/main.js");
  assert.equal(stores.has(STAGE_NAME), false);
});

test("liebump: a waiting cache bump does not mix the previous live shell", async () => {
  let releasePref;
  const prefGate = new Promise((resolve) => { releasePref = resolve; });
  const cacheMap = {
    "/": shellFile("old-html", "OLD PAGE"),
    "/index.html": shellFile("old-html", "OLD PAGE"),
    "/js/usage.js": shellFile("old-usage", "old usage"),
    "/js/usage-pref.js": shellFile("old-pref", "old pref"),
  };
  const fetchImpl = lieFetch(prefGate);
  const oldWorker = load({
    record: true,
    shellRefresh: true,
    cacheMap,
    home: cacheMap["/"],
    fetchImpl,
  });
  const bumped = SRC.replaceAll(CACHE_NAME, "insight-shell-v99");
  const newWorker = load({
    record: true,
    src: bumped,
    stores: oldWorker.stores,
    fetchImpl,
  });
  const installWaits = [];
  newWorker.handlers.install({ waitUntil: (p) => installWaits.push(p) });
  const first = dispatch(oldWorker.handlers, nav(), { resultingClientId: "p1" });
  assert.equal((await first.responded).tag, "old-html");
  await until(() => storedTag(oldWorker.stores, STAGE_NAME, "/js/usage.js") === "new-usage");
  assert.equal(storedTag(oldWorker.stores, CACHE_NAME, "/js/usage.js"), "old-usage");
  assert.equal(storedTag(oldWorker.stores, CACHE_NAME, "/js/usage-pref.js"), "old-pref");
  const v99 = oldWorker.stores.get("insight-shell-v99");
  assert.ok(!v99 || !v99.has("/js/usage.js"), "bumped install wrote usage.js before the shell was complete");
  const second = dispatch(oldWorker.handlers, nav(), { resultingClientId: "p2" });
  assert.equal((await second.responded).tag, "old-html");
  const usage = dispatch(oldWorker.handlers, new FakeRequest("https://app.test/js/usage.js"), { clientId: "p2" });
  const pref = dispatch(oldWorker.handlers, new FakeRequest("https://app.test/js/usage-pref.js"), { clientId: "p2" });
  assert.equal((await usage.responded).tag, "old-usage");
  assert.equal((await pref.responded).tag, "old-pref");

  releasePref();
  await Promise.all(first.waits.concat(second.waits, installWaits));
  assert.equal(storedTag(oldWorker.stores, CACHE_NAME, "/js/usage.js"), "new-usage");
  assert.equal(storedTag(oldWorker.stores, CACHE_NAME, "/js/usage-pref.js"), "new-pref");
  assert.equal(storedTag(oldWorker.stores, "insight-shell-v99", "/js/usage.js"), "new-usage");
  assert.equal(storedTag(oldWorker.stores, "insight-shell-v99", "/js/usage-pref.js"), "new-pref");
});

test("offlineafter: a same-version network page falls back to the cached asset", async () => {
  const cacheMap = {
    "/": shellFile("old-html", "SAME PAGE"),
    "/js/usage-pref.js": shellFile("cached-pref", "pref"),
  };
  const { handlers } = load({
    record: true,
    cacheMap,
    home: cacheMap["/"],
    fetchImpl: async (req) => {
      const path = new URL(req.url).pathname;
      if (path === "/" || path === "/index.html") return shellFile("net-html", "SAME PAGE");
      await sleep(ASSET + 40);
      return shellFile("net-pref", "pref-net");
    },
  });
  const page = dispatch(handlers, nav(), { resultingClientId: "same" });
  assert.equal((await page.responded).tag, "net-html");
  const t0 = Date.now();
  const asset = dispatch(handlers, new FakeRequest("https://app.test/js/usage-pref.js"), { clientId: "same" });
  assert.equal((await asset.responded).tag, "cached-pref");
  const took = Date.now() - t0;
  assert.ok(took >= ASSET - 15 && took < 250, `took ${took}ms`);
});

test("pageSource drops the oldest client once the cap is full", async () => {
  const home = shellFile("home", "PAGE");
  const cachedJs = shellFile("cached-js", "js");
  const { handlers } = load({
    record: true,
    cacheMap: { "/": home, "/js/main.js": cachedJs },
    fetchImpl: async (req) => {
      const path = new URL(req.url).pathname;
      if (path === "/" || path === "/index.html") {
        await sleep(NAV + 25);
        return shellFile("net-html", "OTHER");
      }
      return shellFile("net-js", "js");
    },
  });
  for (let i = 0; i < 30; i++) {
    const page = dispatch(handlers, nav(), { resultingClientId: "c" + i });
    assert.equal((await page.responded).tag, "home");
  }
  const oldest = dispatch(handlers, new FakeRequest("https://app.test/js/main.js"), { clientId: "c0" });
  assert.equal((await oldest.responded).tag, "net-js");
  const newest = dispatch(handlers, new FakeRequest("https://app.test/js/main.js"), { clientId: "c29" });
  assert.equal((await newest.responded).tag, "cached-js");
});

test("a newer network page does not fill a stalled asset from the previous cache", async () => {
  const cacheMap = {
    "/": shellFile("old-html", "OLD PAGE"),
    "/js/usage-pref.js": shellFile("cached-pref", "pref"),
  };
  const { handlers } = load({
    record: true,
    cacheMap,
    home: cacheMap["/"],
    fetchImpl: async (req) => {
      const path = new URL(req.url).pathname;
      if (path === "/" || path === "/index.html") return shellFile("net-html", "NEW PAGE");
      await sleep(ASSET + 30);
      return shellFile("net-pref", "pref-net");
    },
  });
  const page = dispatch(handlers, nav(), { resultingClientId: "newer" });
  assert.equal((await page.responded).tag, "net-html");
  const t0 = Date.now();
  const asset = dispatch(handlers, new FakeRequest("https://app.test/js/usage-pref.js"), { clientId: "newer" });
  assert.equal((await asset.responded).tag, "net-pref");
  assert.ok(Date.now() - t0 >= ASSET);
});

function oldShellMap() {
  return {
    "/": shellFile("html", "PAGE"),
    "/index.html": shellFile("html", "PAGE"),
    "/js/usage.js": shellFile("old-usage", "old usage"),
    "/js/usage-pref.js": shellFile("old-pref", "old pref"),
  };
}

function deployFetch(prefWait) {
  return async (req) => {
    const path = new URL(req.url).pathname;
    if (path === "/" || path === "/index.html") return shellFile("html", "PAGE");
    if (path === "/js/usage.js") return shellFile("new-usage", "import { NEW_THING } from './usage-pref.js'");
    if (path === "/js/usage-pref.js") {
      await prefWait();
      return shellFile("new-pref", "export const NEW_THING = 1");
    }
    return shellFile("rest", "same-bytes");
  };
}

test("orig: a slow JS-only deploy boots the cached shell instead of waiting on one module", async () => {
  const delay = ASSET + 80;
  const { handlers } = load({
    record: true,
    cacheMap: oldShellMap(),
    fetchImpl: deployFetch(() => sleep(delay)),
  });
  const page = dispatch(handlers, nav(), { resultingClientId: "orig" });
  assert.equal((await page.responded).tag, "html");
  await sleep(20);
  const t0 = Date.now();
  const usage = dispatch(handlers, new FakeRequest("https://app.test/js/usage.js"), { clientId: "orig" });
  const pref = dispatch(handlers, new FakeRequest("https://app.test/js/usage-pref.js"), { clientId: "orig" });
  assert.equal((await usage.responded).tag, "old-usage");
  assert.equal((await pref.responded).tag, "old-pref");
  const took = Date.now() - t0;
  assert.ok(took < delay - 30, `modules stayed pending for ${took}ms`);
});

test("a complete JS-only deploy is served as the new shell", async () => {
  const { handlers } = load({
    record: true,
    cacheMap: oldShellMap(),
    fetchImpl: deployFetch(() => Promise.resolve()),
  });
  const page = dispatch(handlers, nav(), { resultingClientId: "fast" });
  assert.equal((await page.responded).tag, "html");
  const usage = dispatch(handlers, new FakeRequest("https://app.test/js/usage.js"), { clientId: "fast" });
  const pref = dispatch(handlers, new FakeRequest("https://app.test/js/usage-pref.js"), { clientId: "fast" });
  assert.equal((await usage.responded).tag, "new-usage");
  assert.equal((await pref.responded).tag, "new-pref");
});

test("partialstage: a partial next cache is not served as the live shell", async () => {
  let releasePref;
  const prefGate = new Promise((resolve) => { releasePref = resolve; });
  const { handlers, stores } = load({
    record: true,
    shellRefresh: true,
    cacheMap: oldShellMap(),
    fetchImpl: deployFetch(() => prefGate),
  });
  const page = dispatch(handlers, nav(), { resultingClientId: "partial" });
  assert.equal((await page.responded).tag, "html");
  await until(() => storedTag(stores, STAGE_NAME, "/js/usage.js") === "new-usage");
  assert.equal(storedTag(stores, CACHE_NAME, "/js/usage.js"), "old-usage");
  assert.equal(storedTag(stores, CACHE_NAME, "/js/usage-pref.js"), "old-pref");
  assert.equal(storedTag(stores, STAGE_NAME, "/js/usage-pref.js"), null);
  const usage = dispatch(handlers, new FakeRequest("https://app.test/js/usage.js"), { clientId: "partial" });
  const pref = dispatch(handlers, new FakeRequest("https://app.test/js/usage-pref.js"), { clientId: "partial" });
  assert.equal((await usage.responded).tag, "old-usage");
  assert.equal((await pref.responded).tag, "old-pref");
  assert.equal(storedTag(stores, CACHE_NAME, "/js/usage.js"), "old-usage");
  assert.equal(storedTag(stores, STAGE_NAME, "/js/usage-pref.js"), null);
  releasePref();
  await Promise.all(page.waits);
  assert.equal(storedTag(stores, CACHE_NAME, "/js/usage.js"), "new-usage");
  assert.equal(storedTag(stores, CACHE_NAME, "/js/usage-pref.js"), "new-pref");
  assert.equal(stores.has(STAGE_NAME), false);
});

test("bump: a waiting cache bump does not pair new usage.js with the old pref", async () => {
  let releasePref;
  const prefGate = new Promise((resolve) => { releasePref = resolve; });
  const fetchImpl = deployFetch(() => prefGate);
  const oldWorker = load({
    record: true,
    shellRefresh: true,
    cacheMap: oldShellMap(),
    fetchImpl,
  });
  const bumped = SRC.replaceAll(CACHE_NAME, "insight-shell-v99");
  const newWorker = load({ record: true, src: bumped, stores: oldWorker.stores, fetchImpl });
  const installWaits = [];
  newWorker.handlers.install({ waitUntil: (p) => installWaits.push(p) });
  const page = dispatch(oldWorker.handlers, nav(), { resultingClientId: "bump" });
  assert.equal((await page.responded).tag, "html");
  await sleep(20);
  const usage = dispatch(oldWorker.handlers, new FakeRequest("https://app.test/js/usage.js"), { clientId: "bump" });
  const pref = dispatch(oldWorker.handlers, new FakeRequest("https://app.test/js/usage-pref.js"), { clientId: "bump" });
  assert.equal((await usage.responded).tag, "old-usage");
  assert.equal((await pref.responded).tag, "old-pref");
  assert.equal(storedTag(oldWorker.stores, CACHE_NAME, "/js/usage.js"), "old-usage");
  assert.equal(storedTag(oldWorker.stores, CACHE_NAME, "/js/usage-pref.js"), "old-pref");
  releasePref();
  await Promise.all(page.waits.concat(installWaits));
  assert.equal(storedTag(oldWorker.stores, "insight-shell-v99", "/js/usage.js"), "new-usage");
  assert.equal(storedTag(oldWorker.stores, "insight-shell-v99", "/js/usage-pref.js"), "new-pref");
});

test("swap overwrites live shell entries before pruning stale ones", async () => {
  const cacheMap = {
    "/": shellFile("old-html", "PAGE"),
    "/js/usage.js": shellFile("old-usage", "old usage"),
    "/js/obsolete.js": shellFile("obsolete", "gone"),
  };
  const { handlers, ops, stores } = load({
    record: true,
    shellRefresh: true,
    cacheMap,
    fetchImpl: async (req) => {
      const path = new URL(req.url).pathname;
      if (path === "/" || path === "/index.html") return shellFile("html", "PAGE");
      return shellFile("new" + path, "new " + path);
    },
  });
  const page = dispatch(handlers, nav(), { resultingClientId: "swap" });
  await page.responded;
  await Promise.all(page.waits);
  const live = ops.filter((op) => op.name === CACHE_NAME);
  const firstDel = live.findIndex((op) => op.op === "del");
  assert.ok(firstDel > 0, "live cache deleted a key before overwriting the shell");
  assert.ok(live.slice(0, firstDel).every((op) => op.op === "put"));
  const seen = new Set(["/", "/js/usage.js", "/js/obsolete.js"]);
  for (const op of live) {
    if (op.op === "put") seen.add(op.key);
    if (op.op === "del") seen.delete(op.key);
    assert.ok(seen.size > 0, "live cache was empty during the swap");
    assert.ok(seen.has("/js/usage.js"), "usage.js was removed before the new copy was stored");
  }
  assert.equal(storedTag(stores, CACHE_NAME, "/js/usage.js"), "new/js/usage.js");
  assert.equal(storedTag(stores, CACHE_NAME, "/js/obsolete.js"), null);
  assert.equal(stores.has(STAGE_NAME), false);
});
