import assert from "node:assert/strict";
import test from "node:test";
import {
  ANALYTICS_SHARE_KEY,
  APP_DATA_KEY,
  USAGE_SHARE_KEY,
  analyticsOn,
  crashReportsOn,
  resolveAnalyticsPref,
} from "../logger/js/usage-pref.js";
import { isDevHost, onDevHost } from "../logger/js/usage-events.js";

/* sanitizePosthogEvent reads the global store. */
globalThis.localStorage = memoryStorage({ [ANALYTICS_SHARE_KEY]: "1" });
const { sanitizePosthogEvent } = await import("../logger/js/usage-events.js");

function memoryStorage(initial = {}, opts = {}) {
  const data = { ...initial };
  return {
    data,
    getItem(key) {
      if (opts.throwGet) throw new Error("SecurityError");
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      if (opts.throwSet) throw new Error("QuotaExceededError");
      data[key] = String(value);
    },
    removeItem(key) { delete data[key]; },
  };
}

test("a new user (empty storage) gets analytics off and crash reports on", () => {
  const store = memoryStorage();
  assert.equal(resolveAnalyticsPref(store), false);
  assert.equal(store.getItem(ANALYTICS_SHARE_KEY), "0");
  assert.equal(analyticsOn(store), false);
  assert.equal(crashReportsOn(store), true);
  assert.equal(store.getItem(USAGE_SHARE_KEY), null);
});

test("an existing user with app data and no keys keeps analytics on", () => {
  const store = memoryStorage({ [APP_DATA_KEY]: JSON.stringify({ version: 2, sessions: [] }) });
  assert.equal(resolveAnalyticsPref(store), true);
  assert.equal(store.getItem(ANALYTICS_SHARE_KEY), "1");
  assert.equal(crashReportsOn(store), true);
});

test("an explicit old off turns off both analytics and crash reports", () => {
  const store = memoryStorage({ [USAGE_SHARE_KEY]: "0", [APP_DATA_KEY]: "{}" });
  assert.equal(resolveAnalyticsPref(store), false);
  assert.equal(analyticsOn(store), false);
  assert.equal(crashReportsOn(store), false);
});

test("an explicit old on keeps analytics on", () => {
  const store = memoryStorage({ [USAGE_SHARE_KEY]: "1" });
  assert.equal(resolveAnalyticsPref(store), true);
  assert.equal(analyticsOn(store), true);
  assert.equal(crashReportsOn(store), true);
});

test("an existing analytics key is never overwritten", () => {
  const off = memoryStorage({ [ANALYTICS_SHARE_KEY]: "0", [USAGE_SHARE_KEY]: "1", [APP_DATA_KEY]: "{}" });
  assert.equal(resolveAnalyticsPref(off), false);
  assert.equal(off.getItem(ANALYTICS_SHARE_KEY), "0");
  const on = memoryStorage({ [ANALYTICS_SHARE_KEY]: "1", [USAGE_SHARE_KEY]: "0" });
  assert.equal(resolveAnalyticsPref(on), true);
  assert.equal(on.getItem(ANALYTICS_SHARE_KEY), "1");
});

test("resolution is idempotent, and app data written later can't flip a new user on", () => {
  const store = memoryStorage();
  assert.equal(resolveAnalyticsPref(store), false);
  const snap = { ...store.data };
  assert.equal(resolveAnalyticsPref(store), false);
  assert.deepEqual(store.data, snap);
  store.setItem(APP_DATA_KEY, "{}"); // a cloud pull creates app data
  assert.equal(resolveAnalyticsPref(store), false);
  assert.equal(analyticsOn(store), false);
});

test("storage errors read as analytics off and never throw", () => {
  assert.equal(resolveAnalyticsPref(memoryStorage({}, { throwGet: true })), false);
  assert.equal(analyticsOn(memoryStorage({}, { throwGet: true })), false);
  const noWrite = memoryStorage({ [APP_DATA_KEY]: "{}" }, { throwSet: true });
  assert.equal(resolveAnalyticsPref(noWrite), false);
  assert.equal(analyticsOn(noWrite), false);
});

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

test("500 seeded storage shapes keep explicit choices, default new users off and existing users on", () => {
  const rnd = rng(0x5eed);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const prefValues = [undefined, "0", "1", "yes", "", "null", "true"];
  const dataValues = [undefined, "{\"version\":2,\"sessions\":[]}", "not json {", ""];
  for (let i = 0; i < 500; i++) {
    const initial = {};
    const analytics = pick(prefValues);
    const old = pick(prefValues);
    const appData = pick(dataValues);
    if (analytics !== undefined) initial[ANALYTICS_SHARE_KEY] = analytics;
    if (old !== undefined) initial[USAGE_SHARE_KEY] = old;
    if (appData !== undefined) initial[APP_DATA_KEY] = appData;
    const throwGet = rnd() < 0.08;
    const throwSet = !throwGet && rnd() < 0.08;
    const store = memoryStorage(initial, { throwGet, throwSet });
    const label = JSON.stringify({ i, initial, throwGet, throwSet });
    const crashBefore = crashReportsOn(store);
    const peek = (k) => (Object.prototype.hasOwnProperty.call(store.data, k) ? store.data[k] : null);

    let first;
    assert.doesNotThrow(() => { first = resolveAnalyticsPref(store); }, label);

    if (throwGet) {
      assert.equal(first, false, label);
      assert.equal(analyticsOn(store), false, label);
    } else if (analytics !== undefined) {
      // An explicit analytics key is never changed.
      assert.equal(peek(ANALYTICS_SHARE_KEY), analytics, label);
      assert.equal(first, analytics === "1", label);
    } else if (throwSet) {
      assert.equal(first, false, label);
      assert.equal(analyticsOn(store), false, label);
    } else if (old !== undefined) {
      // An explicit old choice is copied with the old meaning: only "0" was off.
      assert.equal(peek(ANALYTICS_SHARE_KEY), old === "0" ? "0" : "1", label);
      assert.equal(analyticsOn(store), old !== "0", label);
    } else if (appData !== undefined) {
      assert.equal(peek(ANALYTICS_SHARE_KEY), "1", label);
      assert.equal(analyticsOn(store), true, label);
    } else {
      assert.equal(peek(ANALYTICS_SHARE_KEY), "0", label);
      assert.equal(analyticsOn(store), false, label);
    }

    // Stable on a second run, even after app data shows up.
    const snap = { ...store.data };
    store.data[APP_DATA_KEY] = store.data[APP_DATA_KEY] ?? "{}";
    const second = resolveAnalyticsPref(store);
    assert.equal(second, first, label);
    assert.equal(peek(ANALYTICS_SHARE_KEY), snap[ANALYTICS_SHARE_KEY] ?? null, label);

    // The crash report key is never written by resolution.
    assert.equal(peek(USAGE_SHARE_KEY), old === undefined ? null : old, label);
    assert.equal(crashReportsOn(store), crashBefore, label);
  }
});

test("every event that passes disables GeoIP and drops IP and GeoIP properties", () => {
  const feature = sanitizePosthogEvent({
    event: "tab_viewed",
    properties: { tab: "food", $ip: "203.0.113.9", $geoip_city_name: "Oslo", $geoip_disable: false, $GeoIP_country_code: "NO", $lib: "web" },
  });
  assert.equal(feature.properties.$geoip_disable, true);
  assert.equal(feature.properties.$ip, undefined);
  assert.equal(feature.properties.$geoip_city_name, undefined);
  assert.equal(feature.properties.$GeoIP_country_code, undefined);
  assert.equal(feature.properties.tab, "food");
  assert.equal(feature.properties.$lib, "web");
  for (const event of ["$identify", "$create_alias", "$opt_in", "$opt_out"]) {
    const out = sanitizePosthogEvent({ event, properties: { distinct_id: "d", $ip: "203.0.113.9", $geoip_subdivision_1_name: "X" } });
    assert.equal(out.properties.$geoip_disable, true, event);
    assert.equal(out.properties.$ip, undefined, event);
    assert.equal(out.properties.$geoip_subdivision_1_name, undefined, event);
  }
  const bare = sanitizePosthogEvent({ event: "workout_logged" });
  assert.deepEqual(bare.properties, { $geoip_disable: true });
  assert.equal(sanitizePosthogEvent({ event: "$pageview", properties: {} }), null);
});

test("isDevHost spots local development hosts", () => {
  for (const host of ["localhost", "LOCALHOST", "app.localhost", "127.0.0.1", "127.1.2.3", "::1", "[::1]", "0.0.0.0", "my-mac.local", "my-mac.local.", "", null, undefined, "10.0.0.5", "10.1.2.3", "192.168.0.1", "192.168.1.20", "172.16.0.1", "172.31.255.255", "169.254.1.1", "169.254.0.0", "100.64.0.1", "100.127.255.255", "fe80::1", "[fe80::1]", "fe80::1%eth0", "fd00::1", "fc00::"]) {
    assert.equal(isDevHost(host), true, String(host));
  }
  for (const host of ["insight.example.com", "localhost.example.com", "local", "127.0.0.1.nip.io.example", "11.0.0.5", "192.169.0.1", "172.15.0.1", "172.32.0.1", "example.locals", "169.253.1.1", "100.63.0.1", "100.128.0.1", "2001:db8::1", "fec0::1"]) {
    assert.equal(isDevHost(host), false, host);
  }
  assert.equal(onDevHost({ protocol: "file:", hostname: "" }), true);
  assert.equal(onDevHost({ protocol: "file:", hostname: "insight.example.com" }), true);
  assert.equal(onDevHost({ protocol: "https:", hostname: "insight.example.com" }), false);
  assert.equal(onDevHost({ protocol: "http:", hostname: "localhost" }), true);
  assert.equal(onDevHost(undefined), false);
});

test("a two-phone upgrade from the old synced key, with old and new builds mixed", () => {
  const rnd = rng(0x0A11);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const oldValues = [undefined, "0", "1", "yes"];
  // The old build had one local key, insight-share-usage, for both switches.
  const oldOn = (store) => {
    try { return store.getItem(USAGE_SHARE_KEY) !== "0"; } catch (e) { return true; }
  };
  for (let i = 0; i < 200; i++) {
    const oldChoice = pick(oldValues);
    const hasApp = rnd() < 0.5;
    const phoneA = {};
    const phoneB = {};
    if (oldChoice !== undefined) {
      phoneA[USAGE_SHARE_KEY] = oldChoice;
      phoneB[USAGE_SHARE_KEY] = oldChoice;
    }
    if (hasApp) {
      phoneA[APP_DATA_KEY] = "{\"version\":2}";
      phoneB[APP_DATA_KEY] = "{\"version\":2}";
    }
    const a = memoryStorage(phoneA);
    const b = memoryStorage(phoneB);
    const label = JSON.stringify({ i, oldChoice, hasApp });
    // Phone A is still the old build. Phone B has upgraded.
    const aOld = oldOn(a);
    const bNew = resolveAnalyticsPref(b);
    assert.equal(oldOn(a), aOld, label);
    if (oldChoice === undefined) assert.equal(bNew, hasApp, label);
    else assert.equal(bNew, oldChoice !== "0", label);
    // The old phone later writes its key again. That must not move the upgraded phone.
    a.setItem(USAGE_SHARE_KEY, a.getItem(USAGE_SHARE_KEY) === "0" ? "1" : "0");
    assert.equal(resolveAnalyticsPref(b), bNew, label);
    assert.equal(b.getItem(ANALYTICS_SHARE_KEY), bNew ? "1" : "0", label);
    // Phone A upgrades on its own copy of the key, after the extra write.
    const aUp = resolveAnalyticsPref(a);
    assert.equal(aUp, a.getItem(USAGE_SHARE_KEY) !== "0", label);
    assert.notEqual(a.data, b.data, label);
    // A cloud pull of app data onto a phone that already resolved cannot flip it.
    if (!hasApp) {
      b.setItem(APP_DATA_KEY, "{\"version\":2,\"sessions\":[]}");
      assert.equal(resolveAnalyticsPref(b), bNew, label);
    }
  }
});

test("before_send drops events on a dev host", () => {
  globalThis.location = { protocol: "http:", hostname: "localhost" };
  try {
    assert.equal(sanitizePosthogEvent({ event: "tab_viewed", properties: { tab: "home" } }), null);
  } finally {
    delete globalThis.location;
  }
  assert.ok(sanitizePosthogEvent({ event: "tab_viewed", properties: { tab: "home" } }));
});
