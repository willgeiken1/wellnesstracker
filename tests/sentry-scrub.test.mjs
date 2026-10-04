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
    url: "https://x.supabase.co/functions/v1/food-describe",
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
  assert.equal(event.request.url, "http://127.0.0.1:4173/");
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
