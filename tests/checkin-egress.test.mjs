import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { scrubBreadcrumb, scrubEvent } from "../logger/js/sentry-scrub.js";
import { sanitizeCapture, sanitizePosthogEvent } from "../logger/js/usage-events.js";
import {
  NOT_ADVICE,
  RESOURCE_LINES,
  checkinRecord,
  crisisLanguage,
  needsResource,
  upsertCheckin,
} from "../logger/js/shared/checkin.js";
import { app } from "../logger/js/runtime.js";
import "../logger/js/pages/checkin.js";

/* before_send reads the analytics switch. These tests run with it on. */
globalThis.localStorage = {
  getItem(key) { return key === "insight-share-analytics" ? "1" : null; },
  setItem() {},
  removeItem() {},
};

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

/* Allowed PostHog keys for a product event after before_send.
   tab is the screen name. $geoip_disable turns location lookup off.
   A mood, stress, energy, or other health value is not in this set. */
const TAB_KEYS = new Set(["tab", "$geoip_disable"]);

const SENTINELS = ["987654", "13579", "24680", "13570", "11111", "sentinel@example.invalid"];

function assertNoSentinels(value, label) {
  const raw = JSON.stringify(value);
  for (const sentinel of SENTINELS) {
    assert.equal(raw.includes(sentinel), false, `${label} kept ${sentinel}`);
  }
}

function walkKeys(value, found = []) {
  if (!value || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    value.forEach((item) => walkKeys(item, found));
    return found;
  }
  Object.keys(value).forEach((key) => {
    found.push(key);
    walkKeys(value[key], found);
  });
  return found;
}

const CRISIS_HITS = [
  ["kill myself", "kill myself"],
  ["kms", "kms"],
  ["suicid", "thinking about suicide"],
  ["want to die", "I want to die"],
  ["wanna die", "I wanna die"],
  ["end my life", "I will end my life"],
  ["end it all", "I might end it all"],
  ["self-harm", "self-harm"],
  ["hurt myself", "I want to hurt myself"],
  ["harm myself", "I want to harm myself"],
  ["can't go on", "I can't go on"],
  ["cannot go on", "I cannot go on"],
  ["better off dead", "I would be better off dead"],
  ["no reason to live", "no reason to live"],
  ["overdose", "overdose"],
  ["take my own life", "I might take my own life"],
];

for (const [pattern, phrase] of CRISIS_HITS) {
  test(`crisis pattern ${pattern} matches`, () => {
    assert.equal(crisisLanguage(phrase), true, phrase);
  });
}

test("crisis wording is detected locally and ordinary food or workout talk is not", () => {
  assert.equal(crisisLanguage("this workout killed me"), false);
  assert.equal(crisisLanguage("I'm dying of hunger, pass the eggs"), false);
  assert.equal(crisisLanguage("low mood after a hard day"), false);
  assert.equal(needsResource({ mood: 2, energy: 5, stress: 1, note: "" }), true);
  assert.equal(needsResource({ mood: 5, energy: 1, stress: 2, note: "" }), false);
  assert.equal(needsResource({ mood: 4, energy: 4, stress: 4, note: "" }), true);
  assert.equal(needsResource({ mood: 5, energy: 5, stress: 1, note: "I want to die" }), true);
});

test("a check-in record keeps only the scale, the note, and the day", () => {
  const rec = checkinRecord({
    id: "c1",
    date: "2026-10-14",
    at: "2026-10-14T15:00:00.000Z",
    mood: 2,
    energy: 3,
    stress: 4,
    note: "  hard day  ",
    hrv: 987654,
    sleepScore: 13579,
    oura: { readiness: 80 },
    weight: 82,
  });
  assert.deepEqual(rec, {
    id: "c1",
    date: "2026-10-14",
    at: "2026-10-14T15:00:00.000Z",
    mood: 2,
    energy: 3,
    stress: 4,
    note: "hard day",
  });
  assert.equal(checkinRecord({ id: "c1", date: "2026-10-14", mood: 9 }), null);
  assert.equal(checkinRecord({ id: "", date: "2026-10-14", mood: 3 }), null);
  const merged = upsertCheckin({ checkins: [{ id: "old", date: "2026-10-14", mood: 5 }], checkinDeleted: ["x"] }, rec);
  assert.equal(merged.checkins.length, 1);
  assert.equal(merged.checkins[0].id, "old");
  assert.equal(merged.checkins[0].mood, 2);
  assert.equal(merged.checkins[0].hrv, undefined);
  assert.deepEqual(merged.checkinDeleted, ["x"]);
});

test("the check-in sheet uses calm copy and no diagnosis wording", () => {
  app.esc = (s) => String(s == null ? "" : s);
  app.today = () => "2026-10-14";
  app.state = { checkins: null, checkinDeleted: [] };
  app.ui = { sd: { mood: 1, energy: 2, stress: 5, note: "I want to die" } };
  const html = app.checkinSheetHTML();
  assert.match(html, /Check in/);
  assert.match(html, new RegExp(NOT_ADVICE.replace(/[.]/g, "\\.")));
  assert.match(html, /988/);
  assert.match(html, /Call 988/);
  assert.match(html, /Text 988/);
  assert.match(html, /tel:988/);
  assert.equal(html.includes('hidden'), false);
  for (const line of RESOURCE_LINES) assert.match(html, new RegExp(line.slice(0, 24).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(html, /\bdepression\b|\banxiety\b|\bdisorder\b|\byou are\b|\byou have\b/i);
  app.ui.sd = { mood: 4, energy: 4, stress: 2, note: "solid day" };
  const calm = app.checkinSheetHTML();
  assert.match(calm, / hidden/);
  const strip = app.checkinStripHTML();
  assert.match(strip, /data-action="checkin"/);
  assert.match(strip, /Mood, energy, and stress stay on this phone/);
  assert.doesNotMatch(strip, /24680|13570|987654/);
  app.state = { checkins: [{ id: "c1", date: "2026-10-14", mood: 1, stress: 5, note: "sentinel note" }], checkinDeleted: [] };
  const saved = app.checkinStripHTML();
  assert.match(saved, /Checked in/);
  assert.doesNotMatch(saved, /sentinel|Rough|Heavy|24680/);
});

test("sentry drops mood and stress sentinels from events, breadcrumbs, and urls", () => {
  const event = scrubEvent({
    message: "mood 24680 stress 13570 hrv 987654 sentinel@example.invalid",
    extra: { mood: 24680, stress: 13570, hrv: 987654, sleepScore: 13579, note: "sentinel@example.invalid" },
    tags: { mood: "24680", stress: "13570", browser: "Chrome" },
    contexts: {
      device: { mood: 24680, stress: "13570" },
      culture: { locale: "en-US", timezone: "America/Chicago" },
    },
    breadcrumbs: [
      { category: "ui.click", message: "mood 24680", data: { mood: 24680, stress: 13570 } },
      { category: "console", message: "stress 13570 sentinel@example.invalid" },
      { category: "fetch", type: "http", message: "POST https://x.supabase.co/checkin?mood=24680", data: { method: "POST", status_code: 200, url: "https://x.supabase.co/checkin?stress=13570", body: "mood 24680" } },
    ],
    request: {
      url: "https://app.example/home?mood=24680&stress=13570&hrv=987654",
      data: { mood: 24680, note: "sentinel@example.invalid" },
      query_string: "mood=24680",
    },
    fingerprint: ["MoodError"],
    exception: { values: [{ type: "MoodError", value: "stress 13570 hrv 987654" }] },
  });
  assertNoSentinels(event, "sentry event");
  assert.equal(JSON.stringify(event).toLowerCase().includes("mood"), false);
  assert.equal(JSON.stringify(event).toLowerCase().includes("stress"), false);
  assert.equal(event.fingerprint, undefined);
  assert.equal(event.extra, undefined);
  assert.equal(event.exception.values[0].type, "Error");
  assert.equal(event.exception.values[0].value, "Error");
  assert.equal(event.tags.browser, "Chrome");
  assert.equal(event.tags.mood, undefined);
  assert.equal(event.request.data, undefined);
  assert.equal(event.request.query_string, undefined);
  assert.equal(event.request.url, "https://app.example");
  const keys = walkKeys(event);
  for (const key of keys) {
    assert.equal(/mood|stress|hrv|sleep|weight|energy/i.test(key), false, key);
  }
  const crumb = scrubBreadcrumb({ category: "ui.click", message: "stress 13570", data: { mood: 24680 } });
  assertNoSentinels(crumb, "breadcrumb");
  assert.equal(crumb.data, undefined);
  assert.equal(crumb.message, "ui.click");
});

test("posthog drops mood and stress properties and unknown check-in events", () => {
  const viewed = sanitizePosthogEvent({
    event: "tab_viewed",
    properties: {
      tab: "home",
      mood: 24680,
      stress: 13570,
      energy: 11111,
      hrv: 987654,
      sleepScore: 13579,
      email: "sentinel@example.invalid",
      note: "mood 24680",
      $set: { mood: 24680, stress: 13570, energy: 11111 },
      $set_once: { sleepScore: 13579 },
    },
    $set: { mood: 24680, stress: 13570, hrv: 987654 },
    $set_once: { sleepScore: 13579, email: "sentinel@example.invalid" },
  });
  assert.ok(viewed);
  assert.deepEqual(new Set(Object.keys(viewed.properties)), TAB_KEYS);
  assert.equal(viewed.properties.tab, "home");
  assert.equal(viewed.$set, undefined);
  assert.equal(viewed.$set_once, undefined);
  assertNoSentinels(viewed, "posthog event");
  assert.equal(JSON.stringify(viewed).toLowerCase().includes("mood"), false);
  assert.equal(JSON.stringify(viewed).toLowerCase().includes("stress"), false);
  assert.equal(sanitizeCapture("checkin_saved", { mood: 24680, stress: 13570 }), null);
  assert.equal(sanitizePosthogEvent({ event: "checkin_saved", properties: { mood: 24680, stress: 13570, energy: 11111 } }), null);
  const food = sanitizePosthogEvent({
    event: "food_logged",
    properties: { method: "describe", mood: 24680, name: "eggs", kcal: 987654 },
  });
  assert.deepEqual(food.properties.method, "describe");
  assert.equal(food.properties.mood, undefined);
  assertNoSentinels(food, "food event");
});

test("the check-in modules do not call a model, Sentry, or PostHog", () => {
  const page = read("../logger/js/pages/checkin.js");
  const shared = read("../logger/js/shared/checkin.js");
  const heard = read("../logger/js/shared/heard.js");
  for (const src of [page, shared, heard]) {
    assert.doesNotMatch(src, /\bfetch\s*\(|XMLHttpRequest|WebSocket|posthog|Sentry|capture\(|oura|anthropic|openai/i);
  }
  assert.match(page, /needsResource/);
  assert.match(page, /checkinRecord/);
  assert.doesNotMatch(page, /app\.capture/);
  const actions = read("../logger/js/shell/actions.js");
  const block = actions.slice(actions.indexOf('case "checkin"'), actions.indexOf('case "food-review-save"'));
  assert.match(block, /checkin-save/);
  assert.doesNotMatch(block, /capture\(|fetch\(/);
});
