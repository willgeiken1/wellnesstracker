// Insight service worker. It only exists so Android's Chrome will offer "Install app".
// It deliberately caches nothing, so every update you push shows up right away.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
