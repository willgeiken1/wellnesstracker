// Browser allowlist for the deployed-site checks.
// Chromium is used because WebKit can send service-worker fetches outside route().
// serviceWorkers stay "block" in the live config so every request hits this list.

import { PAGES_HOST, SUPABASE_HOST } from "./project.mjs";

export const STATIC_HOSTS = Object.freeze([
  PAGES_HOST,
  "cdn.jsdelivr.net",
  "fastly.jsdelivr.net",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
]);

const STATIC_HOST_SET = new Set(STATIC_HOSTS);
const ALLOWED_FUNCTION = "delete-account";
const FUNCTION_MARKER = "/functions/v1/";

function rawPath(url) {
  const match = /^[a-z][a-z0-9+.-]*:(?:\/\/[^/?#]*)?([^?#]*)/i.exec(url);
  return match ? match[1] : "";
}

function pathUnsafe(path) {
  if (/%(?:2f|2e)/i.test(path)) return true;
  return path.split("/").some((segment) => segment === "." || segment === "..");
}

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
  if (typeof url !== "string" || !url) return false;
  let parsed;
  try { parsed = new URL(url); }
  catch { return false; }
  if (parsed.protocol === "data:" || parsed.protocol === "blob:") return true;
  if (pathUnsafe(rawPath(url))) return false;
  if (STATIC_HOST_SET.has(parsed.hostname)) return parsed.protocol === "https:";
  if (parsed.hostname !== SUPABASE_HOST) return false;
  if (parsed.protocol !== "https:" && parsed.protocol !== "wss:") return false;
  const at = parsed.pathname.indexOf(FUNCTION_MARKER);
  if (at < 0) return true;
  if (parsed.protocol !== "https:") return false;
  let rest = parsed.pathname.slice(at + FUNCTION_MARKER.length);
  if (rest.endsWith("/")) rest = rest.slice(0, -1);
  if (!rest || rest.includes("/")) return false;
  let name;
  try { name = decodeURIComponent(rest); }
  catch { return false; }
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
