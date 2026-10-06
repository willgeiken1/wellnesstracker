import assert from "node:assert/strict";
import test from "node:test";
import { scrubBreadcrumb, scrubEvent } from "../logger/js/sentry-scrub.js";
import { sanitizePosthogEvent } from "../logger/js/usage-events.js";

const NEEDLES = ["HRV", "hrv", "55", "weight", "82.4", "readiness", "sleep", "7.2", "kcal", "450", "protein", "chicken", "oats"];

function assertGone(value, label) {
  assert.notEqual(value, null, label);
  const raw = JSON.stringify(value);
  for (const needle of NEEDLES) {
    assert.equal(raw.toLowerCase().includes(needle.toLowerCase()), false, `${label} still has ${needle}`);
  }
}

test("a fake HRV and weight error leaves no health value through either filter", () => {
  const savedStorage = globalThis.localStorage;
  const savedLocation = globalThis.location;
  globalThis.localStorage = {
    getItem(key) { return key === "insight-share-analytics" ? "1" : null; },
    setItem() {},
    removeItem() {},
  };
  globalThis.location = { hostname: "insight.example.com", protocol: "https:" };
  try {
  let thrown;
  try {
    throw new Error("HRV 55 / weight 82.4");
  } catch (error) {
    thrown = error;
  }
  assert.match(thrown.message, /HRV 55/);
  assert.match(thrown.message, /weight 82\.4/);

  const sentry = scrubEvent({
    message: thrown.message,
    exception: { values: [{ type: thrown.name, value: `${thrown.message}; meal: chicken breast 450 kcal; sleep 7.2h` }] },
    extra: {
      hrv: 55,
      weight: 82.4,
      readiness: 41,
      sleep: 7.2,
      kcal: 450,
      protein: 30,
      note: "chicken breast",
      meal: "oats",
    },
    contexts: { health: { hrv: 55, readiness: 41 }, food: { text: "oats 450 kcal" } },
    tags: { readiness: "41", weight_kg: "82.4" },
    fingerprint: ["HRV-55"],
    transaction: "/food/chicken",
    breadcrumbs: [{
      category: "fetch",
      type: "http",
      message: `GET /x ${thrown.message}`,
      data: { arguments: [thrown.message, "chicken breast"], method: "GET" },
    }],
  });
  assertGone(sentry, "sentry");
  assert.equal(sentry.exception.values[0].value, thrown.name);
  assert.equal(sentry.extra, undefined);

  const crumb = scrubBreadcrumb({
    category: "fetch",
    type: "http",
    message: "GET /x readiness 41 weight 82.4",
  });
  assertGone(crumb, "breadcrumb");

  const healthProps = {
    $hrv: 55,
    $readiness: 41,
    $weight: 82.4,
    $kcal: 450,
    $sleep: 7.2,
    $protein: 30,
    $meal: "chicken breast",
    $calories: 450,
    $note: "oats and honey",
    hrv: 55,
    readiness: 41,
    $city: "Austin",
    $latitude: 30.27,
    $longitude: -97.74,
    $ip: "203.0.113.8",
    $geoip_city_name: "Austin",
  };
  const person = { hrv: 55, weight: 82.4, $meal: "chicken breast", readiness: 41, kcal: 450 };

  const viewed = sanitizePosthogEvent({
    event: "tab_viewed",
    properties: { tab: "home", ...healthProps },
    $set: { ...person, $browser: "Chrome" },
    $set_once: { ...person, $os: "iOS" },
    hrv: 55,
    note: "chicken breast",
  });
  assert.equal(viewed.event, "tab_viewed");
  assert.equal(viewed.properties.tab, "home");
  assertGone(viewed, "tab_viewed");
  assert.equal(viewed.$set.$browser, "Chrome");
  assert.equal(viewed.$set_once.$os, "iOS");

  const logged = sanitizePosthogEvent({
    event: "food_logged",
    properties: { method: "manual", ...healthProps },
    $set: person,
    $set_once: person,
  });
  assert.equal(logged.event, "food_logged");
  assert.equal(logged.properties.method, "manual");
  assertGone(logged, "food_logged");
  assert.equal(logged.$set, undefined);
  assert.equal(logged.$set_once, undefined);

  const identify = sanitizePosthogEvent({
    event: "$identify",
    properties: { distinct_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", ...healthProps },
    $set: person,
    $set_once: person,
  });
  assert.equal(identify.event, "$identify");
  assert.equal(identify.properties.distinct_id, "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
  assertGone(identify, "$identify");
  } finally {
    globalThis.localStorage = savedStorage;
    if (savedLocation === undefined) delete globalThis.location;
    else globalThis.location = savedLocation;
  }
});
