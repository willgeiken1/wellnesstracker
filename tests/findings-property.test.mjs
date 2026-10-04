import assert from "node:assert/strict";
import test from "node:test";
import {
  DISPLAY_LIMIT,
  FAMILY_CAP,
  OUTCOME_CAP,
  STORY_CAP,
  factorFamily,
  listFindings,
  splitFindings,
  storyKey,
} from "../logger/js/shared/correlate.js";

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const OUTCOMES = ["hrv", "rhr", "readiness", "sleepScore", "sleepHours", "liftPerf", "weight"];
const SOURCES = [
  "sleepHours", "sleepScore", "deepHours", "remHours", "awakeMin",
  "workoutVolume", "cardioMin", "liftPerf",
  "calories", "protein", "carbs", "fat",
  "steps",
];
const BOOLEANS = [
  { factor: "lateEating" },
  { factor: "workedOut", source: "workoutVolume" },
  { factor: "didCardio", source: "cardioMin" },
  { factor: "workout:push" },
];
const FACTORS = SOURCES.flatMap((s) => [
  { factor: s + ":median", source: s },
  { factor: s + ":tertile", source: s },
]).concat(BOOLEANS);
const VALENCE = ["good", "bad", "neutral", undefined];
const CONFIDENCE = ["high", "medium", "low"];

const pick = (rand, list) => list[Math.floor(rand() * list.length)];
const keyOf = (r) => r.outcome + "|" + r.factor + "|" + r.lag;

function makeRows(rand) {
  const n = Math.floor(rand() * 40);
  const rows = [];
  const used = new Set();
  // A small pool of strengths and percents makes ties common.
  const strengths = [10, 20, 20, 35, 50, 50, 50, 80];
  for (let i = 0; i < n; i++) {
    const f = pick(rand, FACTORS);
    const row = {
      outcome: pick(rand, OUTCOMES),
      factor: f.factor,
      source: f.source,
      lag: rand() < 0.5 ? 0 : 1,
      valence: pick(rand, VALENCE),
      confidence: pick(rand, CONFIDENCE),
      strength: rand() < 0.7 ? pick(rand, strengths) : Math.round(rand() * 100),
      percent: pick(rand, [-12, -5, 0, 5, 12]),
      nWith: pick(rand, [7, 10, 20]),
      nWithout: pick(rand, [7, 10, 20]),
    };
    if (used.has(keyOf(row))) continue;
    used.add(keyOf(row));
    rows.push(row);
  }
  return rows;
}

function shuffled(rand, rows) {
  const out = rows.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function counts(rows, keyFn) {
  const c = {};
  rows.forEach((r) => { const k = keyFn(r); c[k] = (c[k] || 0) + 1; });
  return Object.values(c);
}

test("listFindings and splitFindings hold their caps over 500 random row sets", () => {
  for (let i = 0; i < 500; i++) {
    const seed = 0x5eed + i * 7919;
    const rand = mulberry32(seed);
    const msg = (what) => `seed ${seed}: ${what}`;
    const rows = makeRows(rand);
    const { top, more } = splitFindings(rows);
    const listed = listFindings(rows);

    assert.ok(top.length <= DISPLAY_LIMIT, msg("top too long"));
    counts(top, (r) => r.outcome).forEach((n) => assert.ok(n <= OUTCOME_CAP, msg("OUTCOME_CAP broken in top")));
    counts(top, factorFamily).forEach((n) => assert.ok(n <= FAMILY_CAP, msg("FAMILY_CAP broken in top")));
    counts(top, storyKey).forEach((n) => assert.equal(n, 1, msg("story repeated in top")));
    counts(listed, storyKey).forEach((n) => assert.ok(n <= STORY_CAP, msg("STORY_CAP broken in list")));
    assert.equal(new Set(listed).size, listed.length, msg("row appears twice"));
    assert.equal(new Set(listed.map(keyOf)).size, listed.length, msg("key appears twice"));
    listed.forEach((r) => assert.ok(r.confidence === "high" || r.confidence === "medium", msg("low confidence row returned")));
    assert.deepEqual(listed, top.concat(more), msg("listFindings is not top.concat(more)"));
    assert.deepEqual(listed.slice(0, top.length), top, msg("top is not a prefix of listFindings"));

    const again = listFindings(shuffled(rand, rows)).map(keyOf);
    assert.deepEqual(again, listed.map(keyOf), msg("output depends on input order"));
    const split = splitFindings(shuffled(rand, rows));
    assert.deepEqual(split.top.map(keyOf), top.map(keyOf), msg("top depends on input order"));
  }
});
