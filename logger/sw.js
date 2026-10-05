// Insight service worker.
// Network-first for same-origin files so a deploy is never stuck behind a stale cache.
// The cache is only the offline fallback. CACHE name changes drop old copies on activate.
// Cross-origin requests (Sentry and PostHog CDNs and ingest, Supabase, fonts) are not intercepted.
// The shell still starts if either script cannot be downloaded.
// v32. v30 is the home editor release (#20). v31 is #14. v26–v28 are reserved.
// v27 is the correlation release on main. v29 is the weigh-in delete follow-up.
// On a slow network (captive portal, lie-fi) a navigation may fall back to the cached page.
// That page and every file it loads come from the same generation. A cached page does not
// pull new scripts, and a fresh page does not fill a slow script from the previous cache.
// A network document that matches index.html is served as one generation. The new shell
// is used only when every shell file has arrived. If any file is still out at the asset
// timeout, the page gets the live cache, which is one complete generation, and boots
// that version. A fast module is never paired with a slow module from the other copy.
// The fetch handler never writes the live cache. A refresh is staged in a second cache
// and copied over only after every shell file is there. The copy overwrites live entries
// before it drops stale ones, so the live cache is never emptied.
const CACHE = "insight-shell-v32";
const STAGE = CACHE + "-next";
const SHELL = ["./", "./apple-touch-icon.png", "./css/appearance.css", "./css/base.css", "./css/brief.css", "./css/home-widgets.css", "./css/weekly.css", "./css/cardio.css", "./css/food.css", "./css/goals.css", "./css/platform.css", "./css/polish.css", "./css/privacy.css", "./css/progress.css", "./css/session.css", "./css/theme.css", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./index.html", "./js/data/body.js", "./js/data/state.js", "./js/main.js", "./js/pages/cardio.js", "./js/pages/food.js", "./js/pages/goals.js", "./js/pages/home.js", "./js/pages/insights.js", "./js/pages/insight-widgets.js", "./js/pages/privacy.js", "./js/pages/progress.js", "./js/pages/session.js", "./js/pages/settings.js", "./js/pages/workouts.js", "./js/runtime.js", "./js/sentry.js", "./js/sentry-scrub.js", "./js/usage.js", "./js/usage-events.js", "./js/usage-pref.js", "./js/shared/analyze.js", "./js/shared/brief.js", "./js/shared/weekly.js", "./js/shared/cloud.js", "./js/shared/correlate.js", "./js/shared/home-defaults.js", "./js/shared/home-drag.js", "./js/shared/home-edit.js", "./js/shared/home-migrate.js", "./js/shared/home-widgets.js", "./js/shared/oura-gate.js", "./js/shared/icons.js", "./js/shared/muscles.js", "./js/shared/platform.js", "./js/shared/profile.js", "./js/shared/purge.js", "./js/shared/widgets.js", "./js/shell/actions.js", "./js/shell/pager.js", "./js/shell/timer.js", "./js/shell/workout.js", "./manifest.json"];

const NAV_TIMEOUT_MS = (self.__SW_TEST_TIMEOUTS && self.__SW_TEST_TIMEOUTS.nav) || 4000;
const ASSET_TIMEOUT_MS = (self.__SW_TEST_TIMEOUTS && self.__SW_TEST_TIMEOUTS.asset) || 6000;
const PAGE_CAP = 24;

// resultingClientId → "cache" | "network" | "same".
// "same" is a network document whose index.html matches the live cache. Its assets
// wait for one shell generation: the new files if they all arrive in time, otherwise
// the live cache. They do not wait on a single module that never resolves.
const pageSource = new Map();
// clientId → Promise<{ gen: "old" | "new", bodies: Map<path, Response> }>
const shellChoice = new Map();
// Resolves while the live cache is between generations. Readers snapshot after it.
let swapGate = Promise.resolve();

function rememberPage(id, source) {
  if (!id) return;
  if (pageSource.has(id)) pageSource.delete(id);
  pageSource.set(id, source);
  while (pageSource.size > PAGE_CAP) pageSource.delete(pageSource.keys().next().value);
}

function shellPath(input) {
  const raw = typeof input === "string" ? input : (input && input.url) || "";
  let path = raw;
  try {
    path = new URL(raw, (self.location && self.location.origin) || "https://app.test").pathname;
  } catch (e) {
    path = String(raw).split("?")[0];
  }
  if (!path || path === "/" || path === "/index.html") return "/";
  return path;
}

const SHELL_KEYS = [...new Set(SHELL.map((url) => shellPath(url)))];

function rememberChoice(id, choice) {
  if (!id) return;
  if (shellChoice.has(id)) shellChoice.delete(id);
  shellChoice.set(id, choice);
  while (shellChoice.size > PAGE_CAP) shellChoice.delete(shellChoice.keys().next().value);
}

async function shellSnap(live) {
  const snap = new Map();
  await Promise.all(SHELL.map(async (url) => {
    const hit = await live.match(url);
    if (hit) snap.set(shellPath(url), typeof hit.clone === "function" ? hit.clone() : hit);
  }));
  return snap;
}

// index.html can stay byte-for-byte identical across a JS-only deploy. Hold this
// page's assets until the new shell is complete, or until the asset timeout, and
// then answer every one of them from that single generation.
function chooseShell(clientId) {
  if (shellChoice.has(clientId)) return shellChoice.get(clientId);
  let settled = false;
  let resolveChoice;
  const choice = new Promise((resolve) => { resolveChoice = resolve; });
  rememberChoice(clientId, choice);
  const finish = (value) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    resolveChoice(value);
  };
  let oldBodies = new Map();
  const prepare = (async () => {
    const live = await caches.open(CACHE);
    await swapGate;
    oldBodies = await shellSnap(live);
  })().catch(() => {});
  const timer = setTimeout(() => {
    prepare.then(() => finish({ gen: "old", bodies: oldBodies }), () => finish({ gen: "old", bodies: oldBodies }));
  }, ASSET_TIMEOUT_MS);
  (async () => {
    await prepare;
    const freshBodies = new Map();
    let incomplete = false;
    await Promise.all(SHELL.map(async (url) => {
      let net;
      try { net = await fetch(new Request(url, { cache: "reload" })); }
      catch (e) { incomplete = true; return; }
      if (!net || !net.ok || (net.type !== "basic" && net.type !== "default")) {
        incomplete = true;
        return;
      }
      const forPage = typeof net.clone === "function" ? net.clone() : net;
      freshBodies.set(shellPath(url), forPage);
    }));
    if (settled) return;
    if (incomplete || freshBodies.size !== SHELL_KEYS.length) finish({ gen: "old", bodies: oldBodies });
    else finish({ gen: "new", bodies: freshBodies });
  })().catch(() => finish({ gen: "old", bodies: oldBodies }));
  return choice;
}

function bodyFrom(decision, req) {
  const picked = decision.bodies && decision.bodies.get(shellPath(req.url));
  if (!picked) return null;
  return typeof picked.clone === "function" ? picked.clone() : picked;
}

function shellRefreshOn() {
  if (self.__SW_SHELL_REFRESH === false) return false;
  if (self.__SW_TEST_TIMEOUTS && self.__SW_SHELL_REFRESH !== true) return false;
  return true;
}

self.addEventListener("install", (event) => {
  // cache:"reload" bypasses the HTTP cache so a new release never precaches stale copies.
  // addAll is all-or-nothing: a slow file does not publish a half-written shell.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Resolves with the network response. If the network is slower than ms and a cached copy
// exists, resolves with the cached copy instead; with no cached copy it keeps waiting.
// A network error falls back to the cached copy, and rejects only when there is none.
function raceWithTimeout(networkPromise, ms, getCached) {
  let picked = "network";
  const promise = new Promise((resolve, reject) => {
    let done = false;
    let timer = null;
    const finish = (fn, value, source) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      picked = source;
      fn(value);
    };
    timer = setTimeout(() => {
      Promise.resolve().then(getCached).then((cached) => { if (cached) finish(resolve, cached, "cache"); }, () => {});
    }, ms);
    networkPromise.then(
      (res) => finish(resolve, res, "network"),
      (err) => {
        Promise.resolve().then(getCached).then(
          (cached) => (cached ? finish(resolve, cached, "cache") : finish(reject, err, "network")),
          () => finish(reject, err, "network")
        );
      }
    );
  });
  promise.picked = () => picked;
  return promise;
}

function fetchFresh(req) {
  return fetch(new Request(req, { cache: "no-cache" }));
}

async function generationOf(res) {
  if (!res) return "";
  try {
    const src = typeof res.clone === "function" ? res.clone() : res;
    if (typeof src.text === "function") return await src.text();
  } catch (e) { /* compare the tag below */ }
  if (res.tag != null) return String(res.tag);
  return "";
}

// Fills STAGE, then swaps it into the live cache in one pass. A slow or failed file
// leaves the live cache untouched, so usage.js cannot go new while usage-pref.js stays old.
let refreshPromise = null;
function refreshShell() {
  if (!shellRefreshOn()) return Promise.resolve();
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const stage = await caches.open(STAGE);
    const stale = typeof stage.keys === "function" ? await stage.keys() : [];
    await Promise.all(stale.map((k) => stage.delete(k)));
    for (const url of SHELL) {
      let res;
      try { res = await fetch(new Request(url, { cache: "reload" })); }
      catch (e) { await caches.delete(STAGE); return; }
      if (!res || !res.ok || (res.type !== "basic" && res.type !== "default")) {
        await caches.delete(STAGE);
        return;
      }
      await stage.put(url, typeof res.clone === "function" ? res.clone() : res);
    }
    const ready = [];
    for (const url of SHELL) {
      const hit = await stage.match(url);
      if (!hit) { await caches.delete(STAGE); return; }
      ready.push([url, typeof hit.clone === "function" ? hit.clone() : hit]);
    }
    let releaseSwap;
    const locked = new Promise((resolve) => { releaseSwap = resolve; });
    const previous = swapGate;
    swapGate = previous.then(() => locked);
    await previous;
    try {
      const live = await caches.open(CACHE);
      for (const [url, res] of ready) await live.put(url, res);
      const keep = new Set(SHELL_KEYS);
      const old = typeof live.keys === "function" ? await live.keys() : [];
      for (const key of old) {
        if (!keep.has(shellPath(key))) await live.delete(key);
      }
      await caches.delete(STAGE);
    } finally {
      releaseSwap();
    }
  })().catch(() => caches.delete(STAGE)).finally(() => { refreshPromise = null; });
  return refreshPromise;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const isNav = req.mode === "navigate";
  const getCached = async () => {
    const live = await caches.open(CACHE);
    const cached = await live.match(req, { ignoreSearch: true });
    if (cached) return cached;
    if (isNav) return (await live.match("./index.html")) || (await live.match("./")) || null;
    return null;
  };
  const known = !isNav && event.clientId ? pageSource.get(event.clientId) : "";

  // Cached page: serve only what is already cached. Do not write those files back.
  if (known === "cache") {
    event.respondWith(getCached().then((cached) => cached || fetchFresh(req)));
    return;
  }

  // One generation for this document: the new shell if it is complete, else the live cache.
  if (known === "same") {
    const choice = shellChoice.get(event.clientId);
    event.respondWith((choice || Promise.resolve({ gen: "old", bodies: new Map() })).then(async (decision) => {
      const picked = bodyFrom(decision, req);
      if (picked) return picked;
      if (decision.gen === "old") {
        const cached = await getCached();
        if (cached) return cached;
      }
      return fetchFresh(req);
    }));
    return;
  }

  // Newer document than the cache. Wait for the network so an old module cannot pair with it.
  if (known === "network") {
    event.respondWith(fetchFresh(req));
    return;
  }

  const timeoutMs = isNav ? NAV_TIMEOUT_MS : ASSET_TIMEOUT_MS;
  const networkPromise = fetchFresh(req);
  const raced = raceWithTimeout(networkPromise, timeoutMs, getCached);
  event.respondWith(raced.then(async (res) => {
    if (!isNav) return res;
    let source = raced.picked();
    if (source === "network") {
      const cached = await getCached();
      const fresh = await generationOf(res);
      const prev = await generationOf(cached);
      const clientId = event.resultingClientId || "";
      if (fresh && prev && fresh === prev && clientId) {
        source = "same";
        event.waitUntil(chooseShell(clientId));
      }
    }
    rememberPage(event.resultingClientId || "", source);
    return res;
  }));
  if (isNav) event.waitUntil(refreshShell());
});
