// Insight service worker.
// Network-first for same-origin files so a deploy is never stuck behind a stale cache.
// The cache is only the offline fallback. CACHE name changes drop old copies on activate.
// Cross-origin requests (Sentry and PostHog CDNs and ingest, Supabase, fonts) are not intercepted.
// The shell still starts if either script cannot be downloaded.
const CACHE = "insight-shell-v14";
const SHELL = ["./", "./apple-touch-icon.png", "./css/appearance.css", "./css/base.css", "./css/brief.css", "./css/cardio.css", "./css/food.css", "./css/goals.css", "./css/platform.css", "./css/polish.css", "./css/privacy.css", "./css/progress.css", "./css/session.css", "./css/theme.css", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./index.html", "./js/data/body.js", "./js/data/state.js", "./js/main.js", "./js/pages/cardio.js", "./js/pages/food.js", "./js/pages/goals.js", "./js/pages/home.js", "./js/pages/insights.js", "./js/pages/insight-widgets.js", "./js/pages/privacy.js", "./js/pages/progress.js", "./js/pages/session.js", "./js/pages/settings.js", "./js/pages/workouts.js", "./js/runtime.js", "./js/sentry.js", "./js/sentry-scrub.js", "./js/usage.js", "./js/usage-events.js", "./js/usage-pref.js", "./js/shared/analyze.js", "./js/shared/brief.js", "./js/shared/cloud.js", "./js/shared/correlate.js", "./js/shared/icons.js", "./js/shared/muscles.js", "./js/shared/platform.js", "./js/shared/profile.js", "./js/shared/purge.js", "./js/shared/widgets.js", "./js/shell/actions.js", "./js/shell/pager.js", "./js/shell/timer.js", "./js/shell/workout.js", "./manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    try {
      // Revalidate with the server. A plain fetch() would reuse a cached index.html
      // and leave an updated install on the previous shell.
      const fresh = await fetch(new Request(req, { cache: "no-cache" }));
      if (fresh && fresh.ok && (fresh.type === "basic" || fresh.type === "default")) {
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (err) {
      const cached = await caches.match(req, { ignoreSearch: true });
      if (cached) return cached;
      if (req.mode === "navigate") {
        const home = await caches.match("./index.html");
        if (home) return home;
      }
      throw err;
    }
  })());
});
