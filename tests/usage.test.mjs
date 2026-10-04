import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  setUsageSharing,
  usageSdkNeedsOptIn,
  setUsageSdkOptOut,
  usageSharingOn,
} from "../logger/js/usage-pref.js";
import { foodMethod, sanitizeCapture, sanitizePosthogEvent } from "../logger/js/usage-events.js";

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) { data[key] = String(value); },
    removeItem(key) { delete data[key]; },
  };
}

test("sharing defaults on and only an explicit off turns it off", () => {
  const store = memoryStorage();
  assert.equal(usageSharingOn(store), true);
  setUsageSharing(true, store);
  assert.equal(store.getItem("insight-share-usage"), "1");
  assert.equal(usageSharingOn(store), true);
  setUsageSharing(false, store);
  assert.equal(store.getItem("insight-share-usage"), "0");
  assert.equal(usageSharingOn(store), false);
  assert.equal(usageSharingOn(null), true);
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

test("the shell caches the usage modules with the v22 release", () => {
  const sw = readFileSync(new URL("../logger/sw.js", import.meta.url), "utf8");
  const sentry = readFileSync(new URL("../logger/js/sentry.js", import.meta.url), "utf8");
  assert.match(sw, /insight-shell-v22/);
  assert.match(sw, /\.\/js\/usage\.js/);
  assert.match(sw, /\.\/js\/usage-events\.js/);
  assert.match(sw, /\.\/js\/usage-pref\.js/);
  assert.match(sentry, /insight-shell-v22/);
});
