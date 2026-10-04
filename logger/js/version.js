// Insight release. Semantic version. This file is the only copy.
// The service worker cache name is "insight-shell-v" plus this version.
// The Sentry release is this version.
// Bump INSIGHT_APP_VERSION for a user-facing release. Do not write the cache
// name back into sw.js or sentry.js.
globalThis.INSIGHT_APP_VERSION = "1.0.0";
globalThis.INSIGHT_SHELL_CACHE = "insight-shell-v" + globalThis.INSIGHT_APP_VERSION;
