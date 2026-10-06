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

/* mulberry32, seed fixed so a failure names the same inputs next run. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HEALTH_NAMES = ["hrv", "readiness", "weight", "kcal", "calories", "sleep", "protein", "meal", "note"];
const MEAL_WORDS = ["oats", "chicken", "salmon", "rice", "yogurt", "banana", "toast", "egg"];
const SEPS = [".", "_", "-"];
const JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";

function pick(rand, list) {
  return list[Math.floor(rand() * list.length)];
}

function mixCase(rand, word) {
  return [...word].map((ch) => (rand() < 0.5 ? ch.toUpperCase() : ch)).join("");
}

test("seeded random health keys, numbers, and meal words do not survive either filter", () => {
  const savedStorage = globalThis.localStorage;
  const savedLocation = globalThis.location;
  globalThis.localStorage = {
    getItem(key) { return key === "insight-share-analytics" ? "1" : null; },
    setItem() {},
    removeItem() {},
  };
  globalThis.location = { hostname: "willgeiken1.github.io", protocol: "https:" };
  const rand = mulberry32(0xC0FFEE);
  try {
    for (let trial = 0; trial < 32; trial++) {
      const bases = [pick(rand, HEALTH_NAMES)];
      let key = mixCase(rand, bases[0]);
      if (rand() < 0.7) {
        bases.push(pick(rand, HEALTH_NAMES));
        key += pick(rand, SEPS) + mixCase(rand, bases[1]);
      }
      if (rand() < 0.5) key = "$" + key;
      const meal = mixCase(rand, pick(rand, MEAL_WORDS));
      const number = `${200 + Math.floor(rand() * 700)}.${10 + Math.floor(rand() * 90)}`;
      let refresh = "rt_";
      for (let i = 0; i < 8; i++) refresh += "abcdef"[Math.floor(rand() * 6)];
      const fragment = `#access_token=${JWT}&refresh_token=${refresh}&${key}=${number}`;
      const path = `https://cdn.example/food/${meal}`;
      const needles = [key, meal, number, JWT, refresh, ...bases];

      const sentry = scrubEvent({
        message: { formatted: `${meal} ${number} ${key}`, params: [meal, number, key, JWT] },
        logentry: { message: `${meal} ${key}`, formatted: number, params: [meal, number, refresh] },
        exception: {
          values: [{
            type: meal,
            value: `${meal} ${number} ${JWT}`,
            mechanism: {
              type: meal,
              handled: false,
              data: { [key]: number, note: meal, url: `${path}${fragment}`, info: refresh },
            },
          }],
        },
        extra: { [key]: number, meal, note: meal },
        contexts: {
          app: { app_name: meal, [key]: number },
          culture: { locale: "en-US" },
          trace: { op: "pageload", data: { url: `${path}${fragment}`, [key]: meal, status: "ok" } },
          health: { [key]: number },
        },
        tags: { browser: meal, url: `${path}${fragment}`, [key]: number, transaction: `/food/${meal}` },
        fingerprint: [meal, `${key}-${number}`, "{{ default }}", "TypeError"],
        transaction: `/food/${meal}/${key}`,
        breadcrumbs: [
          {
            category: "navigation",
            type: "navigation",
            data: { from: `/logger/${fragment}`, to: `/food/${meal}${fragment}` },
          },
          {
            category: "fetch",
            type: "http",
            message: `GET /food/${meal}`,
            data: { method: "GET", url: `${path}?${key}=${number}${fragment}`, status_code: Number(number) },
          },
        ],
        request: { url: `${path}?${key}=${number}${fragment}`, data: { [key]: meal } },
      });
      const sentryRaw = JSON.stringify(sentry).toLowerCase();
      for (const needle of needles) {
        assert.equal(sentryRaw.includes(String(needle).toLowerCase()), false, `sentry trial ${trial} still has ${needle}`);
      }
      assert.equal(sentry.message, "message");
      assert.deepEqual(sentry.logentry, { message: "log" });
      assert.equal(sentry.exception.values[0].value, "Error");
      assert.equal(sentry.contexts.culture.locale, "en-US");

      const viewed = sanitizePosthogEvent({
        event: "tab_viewed",
        properties: {
          tab: "home",
          [key]: number,
          [meal]: meal,
          $browser: meal,
          $os: meal,
          $lib: "web",
          $current_url: `${path}?${key}=${number}${fragment}`,
          $pathname: `/food/${meal}`,
          $screen_height: Number(number),
          $referrer: `https://cdn.example/${meal}${fragment}`,
          $initial_utm_source: meal,
          distinct_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
          $geoip_city_name: meal,
        },
        $set: { [key]: number, $browser: meal, $meal: meal, $current_url: `https://cdn.example/${meal}${fragment}` },
        $set_once: {
          [key]: meal,
          $os: "iOS",
          $initial_current_url: `${path}?note=${number}${fragment}`,
          $screen_width: Number(number),
        },
      });
      assert.equal(viewed.event, "tab_viewed");
      assert.equal(viewed.properties.tab, "home");
      assert.equal(viewed.properties.$lib, "web");
      assert.equal(viewed.$set_once.$os, "iOS");
      const posthogRaw = JSON.stringify(viewed).toLowerCase();
      for (const needle of needles) {
        assert.equal(posthogRaw.includes(String(needle).toLowerCase()), false, `posthog trial ${trial} still has ${needle}`);
      }
    }
  } finally {
    globalThis.localStorage = savedStorage;
    if (savedLocation === undefined) delete globalThis.location;
    else globalThis.location = savedLocation;
  }
});
