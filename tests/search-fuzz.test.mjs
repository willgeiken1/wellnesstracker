import assert from "node:assert/strict";
import test from "node:test";
import { app } from "../logger/js/runtime.js";
import "../logger/js/data/body.js";
import "../logger/js/shared/muscles.js";

/* Oracle for optimal string alignment (adjacent transposition counts as one edit).
   It does not call app.damerau. The app may clamp a distance above 2 to 3. */
function refDamerau(a, b) {
  a = String(a);
  b = String(b);
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, dp[i - 2][j - 2] + 1);
      dp[i][j] = v;
    }
  }
  return dp[m][n];
}

function refTokenHit(q, word) {
  if (!q || !word) return false;
  if (word.includes(q)) return true;
  if (q.length >= 4 && word.length >= 4 && q.includes(word)) return true;
  if (q.length < 4) return false;
  const limit = q.length <= 5 ? 1 : 2;
  if (Math.abs(q.length - word.length) > limit) return false;
  return refDamerau(q, word) <= limit;
}

function searchSeed() {
  const raw = process.env.SEARCH_SEED;
  if (raw == null || raw === "") return 20261012;
  if (!/^\d+$/.test(raw)) throw new Error(`SEARCH_SEED must be an unsigned integer, got ${raw}`);
  const seed = Number(raw);
  if (!Number.isSafeInteger(seed)) throw new Error(`SEARCH_SEED is out of range, got ${raw}`);
  return seed;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyz";
const WORDS = ["bench", "press", "squat", "curl", "chest", "lats", "dumbbell", "barbell", "kettlebell", "machine", "smith", "row", "deadlift", "fly", "raise"];

function mutate(word, rnd) {
  const chars = [...word];
  const op = Math.floor(rnd() * 5);
  if (op === 0 && chars.length >= 2) {
    const i = Math.floor(rnd() * (chars.length - 1));
    const swap = chars[i];
    chars[i] = chars[i + 1];
    chars[i + 1] = swap;
  } else if (op === 1 && chars.length) {
    chars[Math.floor(rnd() * chars.length)] = ALPHABET[Math.floor(rnd() * ALPHABET.length)];
  } else if (op === 2) {
    chars.splice(Math.floor(rnd() * (chars.length + 1)), 0, ALPHABET[Math.floor(rnd() * ALPHABET.length)]);
  } else if (op === 3 && chars.length) {
    chars.splice(Math.floor(rnd() * chars.length), 1);
  } else {
    const n = Math.floor(rnd() * 9);
    const out = [];
    for (let i = 0; i < n; i++) out.push(ALPHABET[Math.floor(rnd() * ALPHABET.length)]);
    return out.join("");
  }
  return chars.join("");
}

function checkPair(a, b, where) {
  const want = refDamerau(a, b);
  const got = app.damerau(a, b);
  if (want <= 2) assert.equal(got, want, `${where} damerau(${JSON.stringify(a)}, ${JSON.stringify(b)})`);
  else assert.ok(got > 2, `${where} damerau(${JSON.stringify(a)}, ${JSON.stringify(b)}) clamped ${got}, oracle ${want}`);
  assert.equal(app.tokenHit(a, b), refTokenHit(a, b), `${where} tokenHit(${JSON.stringify(a)}, ${JSON.stringify(b)})`);
  assert.equal(app.tokenHit(b, a), refTokenHit(b, a), `${where} tokenHit(${JSON.stringify(b)}, ${JSON.stringify(a)})`);
}

const SEED = searchSeed();

test("damerau and tokenHit match an independent reference", () => {
  console.log(`SEARCH_SEED=${SEED}`);
  checkPair("bensh", "bench", "fixed");
  checkPair("sqaut", "squat", "fixed");
  checkPair("dumbell", "dumbbell", "fixed");
  checkPair("kettelbell", "kettlebell", "fixed");
  checkPair("", "", "fixed");
  checkPair("a", "abcde", "fixed");
  checkPair("press", "press", "fixed");
  assert.equal(app.tokenHit("bensh", "bench"), true);
  assert.equal(app.tokenHit("sqaut", "squat"), true);
  assert.equal(app.tokenHit("ab", "zzzz"), false);
  assert.equal(app.tokenHit("", "bench"), false);

  const rnd = mulberry32(SEED);
  const trials = 240;
  for (let i = 0; i < trials; i++) {
    const base = WORDS[Math.floor(rnd() * WORDS.length)];
    const a = rnd() < 0.15 ? "" : mutate(base, rnd);
    const b = rnd() < 0.2 ? base : mutate(a || base, rnd);
    checkPair(a, b, `SEARCH_SEED=${SEED} trial ${i}`);
  }
});
