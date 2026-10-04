import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  analyticsOn,
  crashReportsOn,
  setAnalytics,
  setCrashReports,
  setUsageSharing,
  usageSdkNeedsOptIn,
  setUsageSdkOptOut,
  usageSharingOn,
} from "../logger/js/usage-pref.js";
import { STUB_QUEUE_MAX, foodMethod, pushCapped, sanitizeCapture, sanitizePosthogEvent } from "../logger/js/usage-events.js";

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) { data[key] = String(value); },
    removeItem(key) { delete data[key]; },
  };
}

/* before_send and the SDK loader read this phone's analytics choice. These tests run with it on. */
globalThis.localStorage = memoryStorage({ "insight-share-analytics": "1" });

test("crash reports default on and only an explicit off turns them off", () => {
  const store = memoryStorage();
  assert.equal(usageSharingOn(store), true);
  setUsageSharing(true, store);
  assert.equal(store.getItem("insight-share-usage"), "1");
  assert.equal(usageSharingOn(store), true);
  setUsageSharing(false, store);
  assert.equal(store.getItem("insight-share-usage"), "0");
  assert.equal(usageSharingOn(store), false);
  assert.equal(usageSharingOn(null), true);
  assert.equal(usageSharingOn, crashReportsOn);
});

test("analytics and crash reports are separate switches", () => {
  const store = memoryStorage();
  assert.equal(analyticsOn(store), false);
  assert.equal(crashReportsOn(store), true);
  setAnalytics(true, store);
  assert.equal(store.getItem("insight-share-analytics"), "1");
  assert.equal(analyticsOn(store), true);
  assert.equal(crashReportsOn(store), true);
  setCrashReports(false, store);
  assert.equal(store.getItem("insight-share-usage"), "0");
  assert.equal(analyticsOn(store), true);
  setAnalytics(false, store);
  assert.equal(analyticsOn(store), false);
  assert.equal(crashReportsOn(store), false);
});

test("before_send drops everything while analytics is off, even with crash reports on", () => {
  const saved = globalThis.localStorage;
  globalThis.localStorage = memoryStorage({ "insight-share-usage": "1", "insight-share-analytics": "0" });
  try {
    assert.equal(sanitizePosthogEvent({ event: "tab_viewed", properties: { tab: "home" } }), null);
    assert.equal(sanitizePosthogEvent({ event: "$identify", properties: { distinct_id: "d" } }), null);
  } finally {
    globalThis.localStorage = saved;
  }
});

test("the sdk opt-out flag is separate from the sharing choice", () => {
  const store = memoryStorage();
  assert.equal(usageSdkNeedsOptIn(store), false);
  setUsageSdkOptOut(true, store);
  assert.equal(usageSdkNeedsOptIn(store), true);
  setUsageSdkOptOut(false, store);
  assert.equal(usageSdkNeedsOptIn(store), false);
});

test("feature events keep only the allowlisted property", () => {
  assert.deepEqual(sanitizeCapture("tab_viewed", { tab: "food", note: "oats", kcal: 400 }), {
    event: "tab_viewed",
    properties: { tab: "food" },
  });
  assert.equal(sanitizeCapture("tab_viewed", { tab: "meal plan" }), null);
  assert.deepEqual(sanitizeCapture("workout_logged", { name: "Squat", weight: 140 }), {
    event: "workout_logged",
    properties: {},
  });
  assert.deepEqual(sanitizeCapture("food_logged", { method: "photo", name: "salmon", kcal: 500 }), {
    event: "food_logged",
    properties: { method: "photo" },
  });
  assert.equal(sanitizeCapture("food_logged", { method: "voice", name: "salmon" }), null);
  assert.deepEqual(sanitizeCapture("readiness_plan_toggled", { mode: "normal", exercise: "Bench", score: 80 }), {
    event: "readiness_plan_toggled",
    properties: { mode: "normal" },
  });
  assert.equal(sanitizeCapture("readiness_plan_toggled", { mode: "easy" }), null);
  assert.deepEqual(sanitizeCapture("morning_brief_customized", { id: "hrv", value: 42 }), {
    event: "morning_brief_customized",
    properties: {},
  });
  assert.deepEqual(sanitizeCapture("privacy_export"), { event: "privacy_export", properties: {} });
  assert.deepEqual(sanitizeCapture("insights_opened"), { event: "insights_opened", properties: {} });
  assert.deepEqual(sanitizeCapture("weekly_report_opened", { readiness: 80, week: "2026-09-21" }), {
    event: "weekly_report_opened",
    properties: {},
  });
  assert.equal(sanitizeCapture("$pageview", {}), null);
  assert.equal(sanitizeCapture("$exception", { message: "note: chicken" }), null);
});

test("saved meals and barcodes count as manual food logs", () => {
  assert.equal(foodMethod("photo"), "photo");
  assert.equal(foodMethod("describe"), "describe");
  assert.equal(foodMethod("manual"), "manual");
  assert.equal(foodMethod("saved"), "manual");
  assert.equal(foodMethod("barcode"), "manual");
  assert.equal(foodMethod("chicken breast"), null);
});

test("before_send drops autocapture and strips identity traits and query strings", () => {
  const page = sanitizePosthogEvent({
    event: "$pageview",
    properties: { $current_url: "http://localhost/?meal=salmon", note: "oats" },
  });
  assert.equal(page, null);

  const heatmap = sanitizePosthogEvent({ event: "$heatmap", properties: { note: "secret" } });
  assert.equal(heatmap, null);

  const viewed = sanitizePosthogEvent({
    event: "tab_viewed",
    properties: {
      tab: "insights",
      note: "felt tired",
      email: "ada@example.com",
      $current_url: "http://localhost:4173/?email=ada@example.com",
      $referrer: "https://example.com/start?token=abc",
      $lib: "web",
      $set: { email: "ada@example.com" },
    },
  });
  assert.equal(viewed.properties.tab, "insights");
  assert.equal(viewed.properties.note, undefined);
  assert.equal(viewed.properties.email, undefined);
  assert.equal(viewed.properties.$set, undefined);
  assert.equal(viewed.properties.$current_url, "http://localhost:4173/");
  assert.equal(viewed.properties.$referrer, "https://example.com/start");
  assert.equal(viewed.properties.$lib, "web");
  assert.equal(JSON.stringify(viewed).includes("ada@example.com"), false);
  assert.equal(JSON.stringify(viewed).includes("felt tired"), false);

  const identify = sanitizePosthogEvent({
    event: "$identify",
    properties: { $set: { email: "ada@example.com" }, distinct_id: "22222222-2222-4222-8222-222222222222" },
  });
  assert.equal(identify.properties.$set, undefined);
  assert.equal(identify.properties.distinct_id, "22222222-2222-4222-8222-222222222222");
  assert.equal(JSON.stringify(identify).includes("ada@example.com"), false);
});

test("before_send strips the URL fragment so magic-link tokens never leave", () => {
  const out = sanitizePosthogEvent({
    event: "tab_viewed",
    properties: {
      tab: "home",
      $current_url: "http://localhost/#access_token=abc.def&refresh_token=xyz&type=magiclink",
      $referrer: "https://proj.supabase.co/auth/v1/verify?token=1#access_token=abc",
      $initial_current_url: "http://localhost/?a=1#/home",
      $lib: "web",
    },
  });
  assert.equal(out.properties.$current_url, "http://localhost/");
  assert.equal(out.properties.$referrer, "https://proj.supabase.co/auth/v1/verify");
  assert.equal(out.properties.$initial_current_url, "http://localhost/");
  assert.equal(out.properties.$lib, "web");
  assert.equal(/access_token|refresh_token/.test(JSON.stringify(out)), false);
});

test("before_send drops token-looking auto property values", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.payload.sig";
  const out = sanitizePosthogEvent({
    event: "$identify",
    properties: { $x: jwt, $y: "has refresh_token inside", $z: "http://h/p/access_token", $ok: "fine", distinct_id: "d" },
  });
  assert.equal(out.properties.$x, undefined);
  assert.equal(out.properties.$y, undefined);
  assert.equal(out.properties.$z, undefined);
  assert.equal(out.properties.$ok, "fine");
  assert.equal(out.properties.distinct_id, "d");
});

test("the stub queue is capped and keeps the newest entries", () => {
  const q = [];
  for (let i = 0; i < 250; i++) pushCapped(q, ["capture", i]);
  assert.equal(q.length, STUB_QUEUE_MAX);
  assert.equal(q[0][1], 150);
  assert.equal(q[q.length - 1][1], 249);
});

async function loadUsageWithFakeDom() {
  const scripts = [];
  const doc = {
    createElement: () => ({ dataset: {} }),
    getElementsByTagName: () => [],
    head: { appendChild: (el) => scripts.push(el) },
  };
  globalThis.document = doc;
  globalThis.window = globalThis;
  delete globalThis.posthog;
  const mod = await import("../logger/js/usage.js?fake=" + Math.random());
  const { app } = await import("../logger/js/runtime.js");
  return { scripts, app, mod };
}

test("a failed PostHog script load empties the queue and stops further captures", async () => {
  const { scripts, app } = await loadUsageWithFakeDom();
  try {
    app.capture("tab_viewed", { tab: "home" });
    assert.equal(scripts.length, 1);
    assert.ok(window.posthog.length > 0);
    scripts[0].onerror();
    assert.equal(window.posthog.length, 0);
    app.capture("tab_viewed", { tab: "food" });
    app.capture("insights_opened");
    app.syncUsageUser({ user: { id: "11111111-1111-4111-8111-111111111111" } });
    assert.equal(window.posthog.length, 0);
    assert.equal(typeof window.posthog.capture, "function");
  } finally {
    delete globalThis.document;
    delete globalThis.window;
    delete globalThis.posthog;
  }
});

test("a loaded real SDK is never initialised again", async () => {
  const calls = [];
  globalThis.document = { createElement: () => ({ dataset: {} }), getElementsByTagName: () => [], head: { appendChild() {} } };
  globalThis.window = globalThis;
  globalThis.posthog = { __SV: 1, __loaded: true, init: () => calls.push("init"), capture: (e) => calls.push(e) };
  try {
    await import("../logger/js/usage.js?loaded=" + Math.random());
    const { app } = await import("../logger/js/runtime.js");
    app.capture("tab_viewed", { tab: "home" });
    assert.deepEqual(calls, ["tab_viewed"]);
  } finally {
    delete globalThis.document;
    delete globalThis.window;
    delete globalThis.posthog;
  }
});

async function captureLoadsScript({ storage, location }) {
  const scripts = [];
  const saved = globalThis.localStorage;
  globalThis.localStorage = storage;
  globalThis.document = { createElement: () => ({ dataset: {} }), getElementsByTagName: () => [], head: { appendChild: (el) => scripts.push(el) } };
  globalThis.window = globalThis;
  if (location) globalThis.location = location;
  delete globalThis.posthog;
  try {
    await import("../logger/js/usage.js?gate=" + Math.random());
    const { app } = await import("../logger/js/runtime.js");
    app.capture("tab_viewed", { tab: "home" });
    app.syncUsageUser({ user: { id: "11111111-1111-4111-8111-111111111111" } });
    return { scripts: scripts.length, queued: Array.isArray(globalThis.posthog) ? globalThis.posthog.length : 0 };
  } finally {
    globalThis.localStorage = saved;
    delete globalThis.document;
    delete globalThis.window;
    delete globalThis.posthog;
    delete globalThis.location;
  }
}

test("analytics off loads no PostHog and queues nothing, even with crash reports on", async () => {
  const out = await captureLoadsScript({ storage: memoryStorage({ "insight-share-usage": "1", "insight-share-analytics": "0" }) });
  assert.deepEqual(out, { scripts: 0, queued: 0 });
});

test("a new user's first load resolves analytics off and loads no PostHog", async () => {
  const storage = memoryStorage();
  const out = await captureLoadsScript({ storage });
  assert.deepEqual(out, { scripts: 0, queued: 0 });
  assert.equal(storage.getItem("insight-share-analytics"), "0");
});

test("local development never loads PostHog", async () => {
  for (const location of [
    { hostname: "localhost", protocol: "http:" },
    { hostname: "127.0.0.1", protocol: "http:" },
    { hostname: "[::1]", protocol: "http:" },
    { hostname: "my-mac.local", protocol: "http:" },
    { hostname: "", protocol: "file:" },
  ]) {
    const out = await captureLoadsScript({ storage: memoryStorage({ "insight-share-analytics": "1" }), location });
    assert.deepEqual(out, { scripts: 0, queued: 0 }, JSON.stringify(location));
  }
  const prod = await captureLoadsScript({ storage: memoryStorage({ "insight-share-analytics": "1" }), location: { hostname: "insight.example.com", protocol: "https:" } });
  assert.equal(prod.scripts, 1);
});

test("the shell caches the usage modules with the v30 release", () => {
  const sw = readFileSync(new URL("../logger/sw.js", import.meta.url), "utf8");
  const sentry = readFileSync(new URL("../logger/js/sentry.js", import.meta.url), "utf8");
  assert.match(sw, /insight-shell-v30/);
  assert.match(sw, /\.\/js\/usage\.js/);
  assert.match(sw, /\.\/js\/usage-events\.js/);
  assert.match(sw, /\.\/js\/usage-pref\.js/);
  assert.match(sentry, /insight-shell-v30/);
});
