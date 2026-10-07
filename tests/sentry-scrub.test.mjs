import assert from "node:assert/strict";
import test from "node:test";
import { scrubBreadcrumb, scrubEvent, scrubString, stripUrlQuery } from "../logger/js/sentry-scrub.js";

const JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";

test("query strings are removed from urls and left alone in prose", () => {
  assert.equal(
    stripUrlQuery("https://x.supabase.co/rest/v1/user_data?user_id=eq.abc&select=data"),
    "https://x.supabase.co/rest/v1/user_data",
  );
  assert.equal(stripUrlQuery("/rest/v1/oura_days?user_id=eq.abc"), "/rest/v1/oura_days");
  assert.equal(stripUrlQuery("GET /food?note=oats#top"), "GET /food#top");
  assert.equal(stripUrlQuery("Did you mean this?"), "Did you mean this?");
});

test("emails, bearer tokens, and jwts are redacted", () => {
  const out = scrubString(`user ada@example.com sent Bearer ${JWT} and access_token=secret-value`);
  assert.equal(out.includes("ada@example.com"), false);
  assert.equal(out.includes(JWT), false);
  assert.equal(out.includes("secret-value"), false);
  assert.match(out, /\[email\]/);
  assert.match(out, /Bearer \[token\]/);
  assert.match(out, /access_token=\[token\]/);
});

test("http breadcrumbs keep method and status and drop bodies and queries", () => {
  const crumb = scrubBreadcrumb({
    type: "http",
    category: "fetch",
    data: {
      method: "POST",
      status_code: 400,
      url: "https://x.supabase.co/functions/v1/food-describe?note=chicken",
      request_body: "chicken breast 250g",
      "http.request.body": "leftover oats",
    },
  });
  assert.deepEqual(crumb.data, {
    method: "POST",
    status_code: 400,
    url: "https://x.supabase.co",
  });
  assert.equal(JSON.stringify(crumb).includes("chicken"), false);
  assert.equal(JSON.stringify(crumb).includes("oats"), false);
});

test("ui and custom breadcrumbs do not keep user content", () => {
  const click = scrubBreadcrumb({
    category: "ui.click",
    message: "button Chicken breast 200g",
    data: { note: "photo of lunch" },
  });
  assert.equal(click.message, "ui.click");
  assert.equal(click.data, undefined);
  const custom = scrubBreadcrumb({
    category: "food",
    message: "logged grilled salmon for ada@example.com",
    data: { grams: 180 },
  });
  assert.equal(custom.message, undefined);
  assert.equal(custom.data, undefined);
  assert.equal(JSON.stringify(custom).includes("salmon"), false);
  assert.equal(JSON.stringify(custom).includes("ada@example.com"), false);
  const logged = scrubBreadcrumb({
    category: "console",
    level: "error",
    message: "meal chicken breast for ada@example.com",
  });
  assert.equal(logged.message, undefined);
  assert.equal(JSON.stringify(logged).includes("chicken"), false);
});

test("events keep a user id only and drop request bodies, headers, and queries", () => {
  const event = scrubEvent({
    message: "failed for ada@example.com",
    user: { id: "11111111-1111-1111-1111-111111111111", email: "ada@example.com", ip_address: "1.2.3.4" },
    request: {
      url: "http://127.0.0.1:4173/?meal=grilled+salmon&email=ada@example.com",
      query_string: "meal=grilled+salmon&email=ada@example.com",
      headers: { Authorization: `Bearer ${JWT}`, Cookie: "liftlog-auth=secret" },
      cookies: { "liftlog-auth": "secret" },
      data: { food: "oats", note: "breakfast" },
    },
    breadcrumbs: [{
      category: "fetch",
      type: "http",
      data: { url: "https://api.example/food?note=oats", method: "POST", request_body: "oats 80g" },
    }],
    exception: {
      values: [{
        type: "Error",
        value: `save failed ${JWT}`,
        stacktrace: { frames: [{ filename: "http://localhost/js/food.js?note=oats", vars: { meal: "salmon" } }] },
      }],
    },
    spans: [{
      description: "POST https://x.supabase.co/rest/v1/user_data?user_id=eq.abc",
      data: { url: "https://x.supabase.co/rest/v1/user_data?select=data", "http.request.body": "{\"food\":\"oats\"}" },
    }],
  });
  const raw = JSON.stringify(event);
  assert.deepEqual(event.user, { id: "11111111-1111-1111-1111-111111111111" });
  assert.equal(event.request.url, "http://127.0.0.1:4173");
  assert.equal(event.request.query_string, undefined);
  assert.equal(event.request.headers, undefined);
  assert.equal(event.request.data, undefined);
  assert.equal(raw.includes("ada@example.com"), false);
  assert.equal(raw.includes("grilled"), false);
  assert.equal(raw.includes("salmon"), false);
  assert.equal(raw.includes("oats"), false);
  assert.equal(raw.includes(JWT), false);
  assert.equal(raw.includes("secret"), false);
  assert.equal(event.exception.values[0].stacktrace.frames[0].vars, undefined);
  assert.equal(event.exception.values[0].stacktrace.frames[0].filename, "http://localhost/js/food.js");
  assert.equal(event.spans[0].description, "POST https://x.supabase.co/rest/v1/user_data");
});

test("an email is not accepted as a user id", () => {
  const event = scrubEvent({ user: { id: "ada@example.com", email: "ada@example.com" } });
  assert.equal(event.user, undefined);
  assert.equal(JSON.stringify(event).includes("ada@example.com"), false);
});

const HEALTH_NEEDLES = ["readiness", "82.4", "hrv", "55", "chicken", "450", "oats", "7.2", "protein", "sleep", "weight"];

function assertNoHealth(value, label) {
  const raw = JSON.stringify(value).toLowerCase();
  for (const needle of HEALTH_NEEDLES) {
    assert.equal(raw.includes(needle.toLowerCase()), false, `${label} still has ${needle}`);
  }
}

test("scrubEvent drops health numbers and meal text from message, exception, extra, contexts, tags, fingerprint, and transaction", () => {
  const event = scrubEvent({
    message: "sync failed readiness 41 weight 82.4 hrv 55",
    exception: {
      values: [{
        type: "Error",
        value: "weigh-in 82.4 kg; meal: chicken breast 450 kcal; sleep 7.2h",
        stacktrace: { frames: [{ filename: "http://localhost/js/food.js", function: "analyzeFoodText" }] },
      }],
    },
    extra: {
      readiness: 41,
      hrv: 55,
      weight: 82.4,
      kcal: 450,
      protein: 30,
      sleep_score: 80,
      note: "chicken breast",
      meal: "oats",
    },
    contexts: {
      health: { hrv: 55, readiness: 41 },
      food: { text: "chicken breast 450 kcal" },
      culture: { locale: "en-US" },
    },
    tags: { readiness: "41", weight_kg: "82.4", browser: "Chrome" },
    fingerprint: ["readiness-41", "{{ default }}"],
    transaction: "/food/chicken",
    breadcrumbs: [{
      category: "fetch",
      type: "http",
      message: "GET /x readiness 41",
      data: { arguments: ["weight 82.4 chicken"], method: "GET", url: "https://x.supabase.co/functions/v1/food-describe" },
    }],
  });
  assertNoHealth(event, "scrubEvent");
  assert.equal(event.message, "message");
  assert.equal(event.exception.values[0].value, "Error");
  assert.equal(event.exception.values[0].stacktrace.frames[0].filename, "http://localhost/js/food.js");
  assert.equal(event.contexts.culture.locale, "en-US");
  assert.equal(event.contexts.health, undefined);
  assert.equal(event.contexts.food, undefined);
  assert.equal(event.extra, undefined);
  assert.equal(event.tags.browser, "Chrome");
  assert.equal(event.tags.readiness, undefined);
  assert.equal(event.tags.weight_kg, undefined);
  assert.deepEqual(event.fingerprint, ["{{ default }}"]);
  assert.equal(event.transaction, "/food");
  assert.equal(event.breadcrumbs[0].data.arguments, undefined);
  assert.equal(event.breadcrumbs[0].data.url, "https://x.supabase.co");
});

test("fetch breadcrumb messages do not keep health text after the url", () => {
  const crumb = scrubBreadcrumb({
    category: "fetch",
    type: "http",
    message: "GET /x readiness 41",
    data: { method: "GET", url: "https://x.supabase.co/x?note=oats", status_code: 200 },
  });
  assert.equal(JSON.stringify(crumb).includes("readiness"), false);
  assert.equal(JSON.stringify(crumb).includes("41"), false);
  assert.equal(JSON.stringify(crumb).includes("oats"), false);
  assert.equal(crumb.data.method, "GET");
  assert.equal(crumb.data.status_code, 200);
  assert.equal(crumb.data.url, "https://x.supabase.co");
  assert.equal(crumb.message, "GET");
});

test("fetch breadcrumb messages keep a route template and drop path segments", () => {
  const crumb = scrubBreadcrumb({
    category: "fetch",
    type: "http",
    message: "GET /food/oats",
    data: { method: "GET", url: "https://x.supabase.co/food/oats?note=breakfast", status_code: 200 },
  });
  assert.equal(crumb.message, "GET /food");
  assert.equal(crumb.data.url, "https://x.supabase.co");
  assert.equal(JSON.stringify(crumb).includes("oats"), false);
  assert.equal(JSON.stringify(crumb).includes("breakfast"), false);
});

test("navigation crumbs and request urls drop token fragments and health fragments", () => {
  const crumb = scrubBreadcrumb({
    type: "navigation",
    category: "navigation",
    data: {
      from: `/logger/#access_token=${JWT}&refresh_token=refresh-secret`,
      to: "/logger/#weight=82",
    },
  });
  const crumbRaw = JSON.stringify(crumb);
  assert.equal(crumbRaw.includes(JWT), false);
  assert.equal(crumbRaw.includes("refresh-secret"), false);
  assert.equal(crumbRaw.includes("access_token"), false);
  assert.equal(crumbRaw.includes("refresh_token"), false);
  assert.equal(crumbRaw.includes("weight"), false);
  assert.equal(crumbRaw.includes("82"), false);
  assert.equal(crumb.data.from, "/logger");
  assert.equal(crumb.data.to, "/logger");

  const event = scrubEvent({
    request: { url: `https://willgeiken1.github.io/logger/?meal=oats#weight=82&access_token=${JWT}` },
    tags: { url: "/food/oats#weight=82", browser: "Chrome" },
    message: { formatted: "sync failed weight 82", params: ["oats", 82] },
    logentry: { message: "note oats", formatted: "weight 82.4", params: ["chicken", 82.4] },
    contexts: {
      app: { app_name: "oats", app_version: "82" },
      culture: { locale: "en-US", timezone: "America/Chicago" },
      trace: { op: "pageload", data: { url: "https://x.supabase.co/food/oats#weight=82", status: "ok" } },
    },
    exception: {
      values: [{
        type: "TypeError",
        value: "weight 82 oats",
        mechanism: { type: "generic", handled: false, data: { weight: 82, note: "oats", fn: "saveMeal" } },
      }],
    },
  });
  const raw = JSON.stringify(event);
  assert.equal(raw.includes(JWT), false);
  assert.equal(raw.includes("weight"), false);
  assert.equal(raw.includes("oats"), false);
  assert.equal(raw.includes("82"), false);
  assert.equal(raw.includes("chicken"), false);
  assert.equal(event.request.url, "https://willgeiken1.github.io");
  assert.equal(event.tags.url, "/food");
  assert.equal(event.tags.browser, "Chrome");
  assert.equal(event.message, "message");
  assert.deepEqual(event.logentry, { message: "log" });
  assert.equal(event.contexts.app, undefined);
  assert.equal(event.contexts.culture.locale, "en-US");
  assert.equal(event.contexts.culture.timezone, "America/Chicago");
  assert.equal(event.contexts.trace.op, "pageload");
  assert.equal(event.contexts.trace.data.url, "https://x.supabase.co");
  assert.equal(event.contexts.trace.data.status, "ok");
  assert.equal(event.exception.values[0].value, "TypeError");
  assert.equal(event.exception.values[0].mechanism.type, "generic");
  assert.equal(event.exception.values[0].mechanism.handled, false);
  assert.equal(event.exception.values[0].mechanism.data, undefined);
});

test("sentry.js loads the errors-only bundle on production hosts and stays off on dev hosts", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../logger/js/sentry.js", import.meta.url), "utf8");
  assert.match(src, /bundle\.min\.js/);
  assert.doesNotMatch(src, /bundle\.tracing/);
  assert.match(src, /insight-shell-v42/);

  async function bootAt(location) {
    const scripts = [];
    const inits = [];
    globalThis.location = location;
    globalThis.document = {
      createElement() {
        return { dataset: {}, addEventListener() {} };
      },
      querySelector() { return null; },
      head: { appendChild(el) { scripts.push(el); } },
    };
    globalThis.window = globalThis;
    globalThis.Sentry = {
      init(opts) { inits.push(opts); },
      setUser() {},
      close() {},
      breadcrumbsIntegration(opts) { return { name: "Breadcrumbs", opts }; },
      browserTracingIntegration(opts) { return { name: "BrowserTracing", opts }; },
    };
    await import("../logger/js/sentry.js?wire=" + Math.random().toString(36).slice(2));
    const { app } = await import("../logger/js/runtime.js");
    try {
      app.startSentry();
      return { scripts, inits };
    } finally {
      if (app.stopSentry) app.stopSentry();
    }
  }

  try {
    const prod = await bootAt({ hostname: "insight.example.com", protocol: "https:" });
    assert.equal(prod.scripts.length, 1);
    assert.match(prod.scripts[0].src, /\/bundle\.min\.js$/);
    assert.doesNotMatch(prod.scripts[0].src, /tracing/);
    assert.equal(prod.inits.length, 1);
    const opts = prod.inits[0];
    assert.equal(typeof opts.beforeSend, "function");
    assert.equal(typeof opts.beforeBreadcrumb, "function");
    assert.equal(opts.tracesSampleRate, 0);
    assert.equal(opts.integrations.some((item) => item && item.name === "BrowserTracing"), false);
    assert.equal(opts.integrations.some((item) => item && item.name === "Breadcrumbs"), true);

    const pages = await bootAt({ hostname: "willgeiken1.github.io", protocol: "https:" });
    assert.equal(pages.inits.length, 1, "willgeiken1.github.io");
    assert.match(pages.scripts[0].src, /\/bundle\.min\.js$/);
    assert.equal(pages.inits[0].tracesSampleRate, 0);
    assert.equal(typeof pages.inits[0].beforeSend, "function");
    assert.equal(typeof pages.inits[0].beforeBreadcrumb, "function");
    assert.equal(pages.inits[0].integrations.some((item) => item && item.name === "BrowserTracing"), false);
    const scrubbed = opts.beforeSend({
      message: "HRV 55 / weight 82.4",
      exception: { values: [{ type: "Error", value: "HRV 55 / weight 82.4" }] },
      extra: { hrv: 55, weight: 82.4 },
    });
    assertNoHealth(scrubbed, "beforeSend");
    assert.equal(scrubbed.exception.values[0].value, "Error");
    const crumb = opts.beforeBreadcrumb({ category: "fetch", type: "http", message: "GET /x readiness 41 weight 82.4" });
    assertNoHealth(crumb, "beforeBreadcrumb");
    assert.equal(typeof opts.beforeSendTransaction, "function");
    const txn = opts.beforeSendTransaction({ transaction: "/food/chicken", message: "hrv 55" });
    assertNoHealth(txn, "beforeSendTransaction");

    for (const location of [
      { hostname: "localhost", protocol: "http:" },
      { hostname: "127.0.0.1", protocol: "http:" },
      { hostname: "[::1]", protocol: "http:" },
      { hostname: "10.1.2.3", protocol: "http:" },
      { hostname: "192.168.1.20", protocol: "http:" },
      { hostname: "my-mac.local", protocol: "http:" },
      { hostname: "", protocol: "file:" },
    ]) {
      const dev = await bootAt(location);
      assert.equal(dev.scripts.length, 0, JSON.stringify(location));
      assert.equal(dev.inits.length, 0, JSON.stringify(location));
    }
  } finally {
    delete globalThis.document;
    delete globalThis.window;
    delete globalThis.Sentry;
    delete globalThis.location;
  }
});
