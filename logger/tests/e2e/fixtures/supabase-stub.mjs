// Fulfills the app's Supabase traffic from a pinned supabase-js build and an
// in-memory synthetic account. Registered after guardNetwork so these URLs are
// served locally. /functions/v1/* is never fulfilled.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { E2E_EMAIL, E2E_PASSWORD, syntheticBlob, syntheticSession, syntheticUser, utcDay } from "./seed.mjs";

const require = createRequire(import.meta.url);
const pkgJson = require.resolve("@supabase/supabase-js/package.json");
const SUPABASE_JS = readFileSync(join(dirname(pkgJson), "dist/umd/supabase.js"));

const SB_HOST = "pvodxxmfgflvgvbdotlv.supabase.co";
const FONT_CSS = "/* stubbed locally so the page renders with system fonts */\n";

function cors(route) {
  const headers = route.request().headers();
  const origin = headers.origin || "*";
  const allow = headers["access-control-request-headers"] || "apikey, authorization, content-type, accept, prefer, x-client-info, accept-profile, content-profile, x-supabase-api-version";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": allow,
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD",
    "access-control-max-age": "600",
    "cache-control": "no-store",
  };
}

async function send(route, status, body, contentType) {
  const headers = { ...cors(route), "content-type": contentType || "application/json; charset=utf-8" };
  if (route.request().method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers, body: "" });
    return;
  }
  await route.fulfill({
    status,
    headers,
    body: typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body),
  });
}

function fail(state, message) {
  state.hits.push(message);
  state.aborted.push(message);
}

async function readBody(route) {
  const raw = route.request().postData() || "";
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

async function handleSupabase(route, state) {
  const req = route.request();
  const url = new URL(req.url());
  if (req.method() === "OPTIONS") {
    await send(route, 204, "");
    return;
  }

  const fn = url.pathname.indexOf("/functions/v1/");
  if (fn >= 0) {
    const name = decodeURIComponent(url.pathname.slice(fn + "/functions/v1/".length).split("/")[0] || "");
    const why = /^food-/i.test(name)
      ? `Network guard: AI food function blocked (never sent): ${name}`
      : /^oura-/i.test(name)
        ? `Network guard: Oura function blocked (never sent): ${name}`
        : `Network guard: edge function blocked (never sent): ${name || url.pathname}`;
    fail(state, `${why} ${req.url()}`);
    await route.abort("blockedbyclient");
    return;
  }

  if (url.pathname === "/auth/v1/token") {
    const body = await readBody(route);
    const grant = url.searchParams.get("grant_type");
    if (grant === "refresh_token") {
      await send(route, 200, syntheticSession());
      return;
    }
    if (body.email !== E2E_EMAIL || body.password !== E2E_PASSWORD) {
      await send(route, 400, { error: "invalid_grant", error_description: "Invalid login credentials", msg: "Invalid login credentials" });
      return;
    }
    await send(route, 200, syntheticSession());
    return;
  }

  if (url.pathname === "/auth/v1/user") {
    await send(route, 200, syntheticUser());
    return;
  }

  if (url.pathname === "/auth/v1/logout") {
    await send(route, 204, "");
    return;
  }

  if (url.pathname === "/rest/v1/user_data") {
    if (req.method() === "GET" || req.method() === "HEAD") {
      await send(route, 200, [{ data: syntheticBlob(utcDay()) }]);
      return;
    }
    await send(route, 201, []);
    return;
  }

  if (url.pathname === "/rest/v1/rpc/merge_user_data") {
    const body = await readBody(route);
    await send(route, 200, body.p_data && typeof body.p_data === "object" ? body.p_data : syntheticBlob(utcDay()));
    return;
  }

  if (url.pathname === "/rest/v1/oura_connections" || url.pathname === "/rest/v1/oura_days" || url.pathname === "/rest/v1/progress_photos") {
    await send(route, 200, []);
    return;
  }

  if (url.pathname.startsWith("/storage/v1/")) {
    await send(route, 200, []);
    return;
  }

  fail(state, `Network guard: unstubbed Supabase request blocked (never sent): ${req.method()} ${req.url()}`);
  await route.abort("blockedbyclient");
}

export async function installSupabaseStub(context, state) {
  // The app loads https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2 (floating
  // 2.x). This stub serves the pinned devDependency instead. If the pin falls
  // behind latest 2.x, PR smoke can pass against an older client than production.
  // CI warns when `npm view @supabase/supabase-js version` differs. Do not change
  // the script tag in index.html from this suite.
  await context.route(/https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js/, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await send(route, 204, "");
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { ...cors(route), "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" },
      body: SUPABASE_JS,
    });
  });

  await context.route(/https:\/\/fonts\.googleapis\.com\//, async (route) => {
    await route.fulfill({
      status: 200,
      headers: { ...cors(route), "content-type": "text/css; charset=utf-8", "cache-control": "no-store" },
      body: FONT_CSS,
    });
  });

  await context.route(/https:\/\/fonts\.gstatic\.com\//, async (route) => {
    await route.fulfill({
      status: 200,
      headers: { ...cors(route), "content-type": "font/woff2", "cache-control": "no-store" },
      body: "",
    });
  });

  await context.route(new RegExp(`https://${SB_HOST.replaceAll(".", "\\.")}/`), async (route) => {
    await handleSupabase(route, state);
  });
}
