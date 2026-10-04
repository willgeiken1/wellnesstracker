// Insight service worker.
// Network-first for same-origin files so a deploy is never stuck behind a stale cache.
// The cache is only the offline fallback. CACHE name changes drop old copies on activate.
// Cross-origin requests (Sentry and PostHog CDNs and ingest, Supabase, fonts) are not intercepted.
// The shell still starts if either script cannot be downloaded.
// v30. v26–v28 are reserved. v27 is the correlation release on main. v29 is the weigh-in delete follow-up.
// On a slow network (captive portal, lie-fi) a navigation may fall back to the cached page.
// That page and every file it loads come from the same generation. A cached page does not
// pull new scripts, and a fresh page does not fill a slow script from the previous cache.
const CACHE = "insight-shell-v30";
const SHELL = ["./", "./apple-touch-icon.png", "./css/appearance.css", "./css/base.css", "./css/brief.css", "./css/home-widgets.css", "./css/weekly.css", "./css/cardio.css", "./css/food.css", "./css/goals.css", "./css/platform.css", "./css/polish.css", "./css/privacy.css", "./css/progress.css", "./css/session.css", "./css/theme.css", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./index.html", "./js/data/body.js", "./js/data/state.js", "./js/main.js", "./js/pages/cardio.js", "./js/pages/food.js", "./js/pages/goals.js", "./js/pages/home.js", "./js/pages/insights.js", "./js/pages/insight-widgets.js", "./js/pages/privacy.js", "./js/pages/progress.js", "./js/pages/session.js", "./js/pages/settings.js", "./js/pages/workouts.js", "./js/runtime.js", "./js/sentry.js", "./js/sentry-scrub.js", "./js/usage.js", "./js/usage-events.js", "./js/usage-pref.js", "./js/shared/analyze.js", "./js/shared/brief.js", "./js/shared/weekly.js", "./js/shared/cloud.js", "./js/shared/correlate.js", "./js/shared/home-defaults.js", "./js/shared/home-migrate.js", "./js/shared/home-widgets.js", "./js/shared/oura-gate.js", "./js/shared/icons.js", "./js/shared/muscles.js", "./js/shared/platform.js", "./js/shared/profile.js", "./js/shared/purge.js", "./js/shared/widgets.js", "./js/shell/actions.js", "./js/shell/pager.js", "./js/shell/timer.js", "./js/shell/workout.js", "./manifest.json"];

const NAV_TIMEOUT_MS = (self.__SW_TEST_TIMEOUTS && self.__SW_TEST_TIMEOUTS.nav) || 4000;
const ASSET_TIMEOUT_MS = (self.__SW_TEST_TIMEOUTS && self.__SW_TEST_TIMEOUTS.asset) || 6000;

// resultingClientId of a navigation → "cache" or "network". Subresources of that
// page use the same source so a deploy cannot mix old and new modules.
const pageSource = new Map();

self.addEventListener("install", (event) => {
  // cache:"reload" bypasses the HTTP cache so a new release never precaches stale copies.
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

function fetchAndCache(req) {
  return (async () => {
    const fresh = await fetch(new Request(req, { cache: "no-cache" }));
    if (fresh && fresh.ok && (fresh.type === "basic" || fresh.type === "default")) {
      const cache = await caches.open(CACHE);
      await cache.put(req, fresh.clone());
    }
    return fresh;
  })();
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const isNav = req.mode === "navigate";
  const getCached = async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
    if (isNav) return (await caches.match("./index.html")) || null;
    return null;
  };
  const known = !isNav && event.clientId ? pageSource.get(event.clientId) : "";

  // Cached page: serve the cache we already have, then refresh it for the next load.
  // The refresh waits until the read finishes so a fast network cannot replace the
  // body this page is about to use.
  if (known === "cache") {
    const cachedPromise = getCached();
    let networkPromise = null;
    const fetchOnce = () => networkPromise || (networkPromise = fetchAndCache(req));
    event.waitUntil(cachedPromise.then((cached) => (cached ? fetchOnce().catch(() => {}) : undefined)));
    event.respondWith(cachedPromise.then((cached) => cached || fetchOnce()));
    return;
  }

  // Fresh page: wait for the network. The previous cache is a different release.
  if (known === "network") {
    const networkPromise = fetchAndCache(req);
    event.waitUntil(networkPromise.catch(() => {}));
    event.respondWith(networkPromise);
    return;
  }

  const timeoutMs = isNav ? NAV_TIMEOUT_MS : ASSET_TIMEOUT_MS;
  const networkPromise = fetchAndCache(req);
  const raced = raceWithTimeout(networkPromise, timeoutMs, getCached);
  // waitUntil keeps the worker alive so the cache write, and a late response after a timeout, finish.
  event.waitUntil(networkPromise.catch(() => {}));
  event.respondWith(raced.then((res) => {
    const pageId = isNav ? (event.resultingClientId || "") : "";
    if (pageId) pageSource.set(pageId, raced.picked());
    return res;
  }));
});
