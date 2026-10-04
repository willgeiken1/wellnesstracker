// Insight service worker.
// Network-first for same-origin files so a deploy is never stuck behind a stale cache.
// The cache is only the offline fallback. CACHE name changes drop old copies on activate.
// Cross-origin requests (Sentry and PostHog CDNs and ingest, Supabase, fonts) are not intercepted.
// The shell still starts if either script cannot be downloaded.
// v30. v26–v28 are reserved. v27 is the correlation release on main. v29 is the weigh-in delete follow-up.
// On a slow network (captive portal, lie-fi) a navigation may fall back to the cached page.
// That page and every file it loads come from the same generation. A cached page does not
// pull new scripts, and a fresh page does not fill a slow script from the previous cache.
// The fetch handler never writes the live cache. A refresh is staged in a second cache
// and copied over only after every shell file is there.
const CACHE = "insight-shell-v30";
const STAGE = CACHE + "-next";
const SHELL = ["./", "./apple-touch-icon.png", "./css/appearance.css", "./css/base.css", "./css/brief.css", "./css/home-widgets.css", "./css/weekly.css", "./css/cardio.css", "./css/food.css", "./css/goals.css", "./css/platform.css", "./css/polish.css", "./css/privacy.css", "./css/progress.css", "./css/session.css", "./css/theme.css", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./index.html", "./js/data/body.js", "./js/data/state.js", "./js/main.js", "./js/pages/cardio.js", "./js/pages/food.js", "./js/pages/goals.js", "./js/pages/home.js", "./js/pages/insights.js", "./js/pages/insight-widgets.js", "./js/pages/privacy.js", "./js/pages/progress.js", "./js/pages/session.js", "./js/pages/settings.js", "./js/pages/workouts.js", "./js/runtime.js", "./js/sentry.js", "./js/sentry-scrub.js", "./js/usage.js", "./js/usage-events.js", "./js/usage-pref.js", "./js/shared/analyze.js", "./js/shared/brief.js", "./js/shared/weekly.js", "./js/shared/cloud.js", "./js/shared/correlate.js", "./js/shared/home-defaults.js", "./js/shared/home-migrate.js", "./js/shared/home-widgets.js", "./js/shared/oura-gate.js", "./js/shared/icons.js", "./js/shared/muscles.js", "./js/shared/platform.js", "./js/shared/profile.js", "./js/shared/purge.js", "./js/shared/widgets.js", "./js/shell/actions.js", "./js/shell/pager.js", "./js/shell/timer.js", "./js/shell/workout.js", "./manifest.json"];

const NAV_TIMEOUT_MS = (self.__SW_TEST_TIMEOUTS && self.__SW_TEST_TIMEOUTS.nav) || 4000;
const ASSET_TIMEOUT_MS = (self.__SW_TEST_TIMEOUTS && self.__SW_TEST_TIMEOUTS.asset) || 6000;
const PAGE_CAP = 24;

// resultingClientId → "cache" | "network" | "same".
// "same" is a network document that matches the cached shell, so a stalled asset
// may use that cache. "network" is a newer document and does not.
const pageSource = new Map();

function rememberPage(id, source) {
  if (!id) return;
  if (pageSource.has(id)) pageSource.delete(id);
  pageSource.set(id, source);
  while (pageSource.size > PAGE_CAP) pageSource.delete(pageSource.keys().next().value);
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
    const live = await caches.open(CACHE);
    const old = typeof live.keys === "function" ? await live.keys() : [];
    await Promise.all(old.map((k) => live.delete(k)));
    for (const [url, res] of ready) await live.put(url, res);
    await caches.delete(STAGE);
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

  // Same deploy as the cache: a stalled file can use that copy.
  if (known === "same") {
    event.respondWith(raceWithTimeout(fetchFresh(req), ASSET_TIMEOUT_MS, getCached));
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
      if (fresh && prev && fresh === prev) source = "same";
    }
    rememberPage(event.resultingClientId || "", source);
    return res;
  }));
  if (isNav) event.waitUntil(refreshShell());
});
