// Route-layer network guard for every Playwright run.
// Chromium also gets the DNS lock in playwright.config.mjs / browser-launch.mjs.
// WebKit only has this layer. A telemetry or edge-function attempt is aborted
// and recorded so the run fails. Nothing in those requests is sent.

const TELEMETRY_HOST = /(^|\.)(sentry\.io|sentry-cdn\.com|posthog\.com|i\.posthog\.com)$/i;

export function isTelemetryHost(hostname) {
  return TELEMETRY_HOST.test(hostname);
}

export function functionViolation(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  const marker = "/functions/v1/";
  const at = parsed.pathname.indexOf(marker);
  if (at < 0) return null;
  const name = decodeURIComponent(parsed.pathname.slice(at + marker.length).split("/")[0] || "");
  if (/^food-/i.test(name)) return `Network guard: AI food function blocked (never sent): ${name}`;
  if (/^oura-/i.test(name)) return `Network guard: Oura function blocked (never sent): ${name}`;
  return `Network guard: edge function blocked (never sent): ${name || parsed.pathname}`;
}

function isLocalHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

function emptyState() {
  return { hits: [], aborted: [], continued: [] };
}

export function assertClean(state) {
  if (!state || !state.hits.length) return;
  throw new Error("Network guard blocked requests that must not leave the runner:\n" + state.hits.map((hit) => "- " + hit).join("\n"));
}

// Sets sharing prefs off before the app boots, then denies every non-local host.
// Stub routes registered after this one fulfill Supabase, supabase-js, and fonts.
export async function guardNetwork(context, state = emptyState()) {
  await context.addInitScript(() => {
    try {
      localStorage.setItem("insight-share-usage", "0");
      localStorage.setItem("insight-share-analytics", "0");
    } catch (e) { /* private mode: the route layer still blocks telemetry */ }
  });

  await context.route("**/*", async (route) => {
    const url = route.request().url();
    let parsed;
    try { parsed = new URL(url); } catch { parsed = null; }
    const protocol = parsed ? parsed.protocol : "";
    const hostname = parsed ? parsed.hostname : "";

    if (protocol === "data:" || protocol === "blob:" || isLocalHost(hostname)) {
      state.continued.push(url);
      await route.continue();
      return;
    }

    const fn = functionViolation(url);
    if (fn) {
      state.hits.push(fn + " " + url);
      state.aborted.push(url);
      await route.abort("blockedbyclient");
      return;
    }

    if (parsed && isTelemetryHost(hostname)) {
      state.hits.push(`Network guard: aborted telemetry request (never sent): ${url}`);
      state.aborted.push(url);
      await route.abort("blockedbyclient");
      return;
    }

    state.hits.push(`Network guard: denied non-local host (never sent): ${url}`);
    state.aborted.push(url);
    await route.abort("blockedbyclient");
  });

  state.assertClean = () => assertClean(state);
  return state;
}
