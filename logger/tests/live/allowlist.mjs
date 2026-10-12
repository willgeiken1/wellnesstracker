// Browser allowlist for the deployed-site checks.
// Chromium is used because WebKit can send service-worker fetches outside route().
// serviceWorkers stay "block" in the live config so every request hits this list.

import { PAGES_HOST, SUPABASE_HOST } from "./project.mjs";

const STATIC_HOSTS = new Set([
  PAGES_HOST,
  "cdn.jsdelivr.net",
  "fastly.jsdelivr.net",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
]);

const ALLOWED_FUNCTION = "delete-account";

export function describeDenied(url) {
  let parsed;
  try { parsed = new URL(url); }
  catch { return "unparseable url"; }
  const marker = "/functions/v1/";
  const at = parsed.pathname.indexOf(marker);
  if (parsed.hostname === SUPABASE_HOST && at >= 0) {
    const name = decodeURIComponent(parsed.pathname.slice(at + marker.length).split("/")[0] || "");
    return `supabase function ${name || "(unknown)"}`;
  }
  return parsed.hostname || "unknown host";
}

export function liveRequestAllowed(url) {
  let parsed;
  try { parsed = new URL(url); }
  catch { return false; }
  if (parsed.protocol === "data:" || parsed.protocol === "blob:") return true;
  if (STATIC_HOSTS.has(parsed.hostname)) return true;
  if (parsed.hostname !== SUPABASE_HOST) return false;
  if (parsed.protocol !== "https:" && parsed.protocol !== "wss:") return false;
  const marker = "/functions/v1/";
  const at = parsed.pathname.indexOf(marker);
  if (at < 0) return true;
  const name = decodeURIComponent(parsed.pathname.slice(at + marker.length).split("/")[0] || "");
  return name === ALLOWED_FUNCTION;
}

export async function installAllowlist(context) {
  const denied = [];
  await context.addInitScript(() => {
    try {
      localStorage.setItem("insight-share-usage", "0");
      localStorage.setItem("insight-share-analytics", "0");
    } catch { /* the route layer still blocks telemetry hosts */ }
  });
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (liveRequestAllowed(url)) {
      await route.continue();
      return;
    }
    denied.push(describeDenied(url));
    await route.abort("blockedbyclient");
  });
  return {
    denied,
    assertClean() {
      if (!denied.length) return;
      const hosts = [...new Set(denied)];
      throw new Error("Live allowlist blocked unexpected requests: " + hosts.join(", "));
    },
  };
}
