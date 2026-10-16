// Food-guard regression table and seeded bypass corpus.
// Every case goes through the real describe prompt prefix, as food-describe sends it.
// A blocked case must never reach the model stub.
// Set FOOD_GUARD_SEED to replay a corpus run. The seed is printed every run.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { FOOD_MODEL_ID } from "../supabase/functions/_shared/food-model.js";
import { FoodAiPayloadError, callFoodModel } from "../supabase/functions/_shared/strip.ts";

const describeSrc = readFileSync(new URL("../supabase/functions/food-describe/index.ts", import.meta.url), "utf8");
const PROMPT = describeSrc.match(/const PROMPT = `([\s\S]*?)`;/)[1];
assert.match(describeSrc, /text: PROMPT \+ "\\nThe meal: " \+ text/);

function mealPayload(text) {
  return {
    model: FOOD_MODEL_ID,
    max_tokens: 1500,
    messages: [{ role: "user", content: [{ type: "text", text: PROMPT + "\nThe meal: " + text }] }],
  };
}

async function sends(text) {
  let calls = 0;
  try {
    await callFoodModel(mealPayload(text), async () => { calls += 1; return { ok: true }; });
  } catch (err) {
    assert.ok(err instanceof FoodAiPayloadError, String(err));
    assert.equal(calls, 0, "stub ran before the throw: " + JSON.stringify(text));
    return false;
  }
  assert.equal(calls, 1);
  return true;
}

// Derived from the triage cases (codex-repro.mjs was not reachable): 34 rows, then 12 extras.
const REGRESSION = [
  // A: body unit after an allowed food name, with fillers and attached forms
  "weight gainer about 180 lbs",
  "weight gainer roughly 82 kg",
  "weight watchers at 13 st",
  "weight watchers 13st",
  "weight gainer 82kg",
  "weight gainer 90 kilos",
  "weight gainer 82 kilograms",
  "weight watchers roughly 13 stone",
  "weight gainers about 180 pounds",
  "weight gainer approx 200lbs",
  "Weight Gainer is 12 st",
  "weight watchers, about 95 kg",
  // B: aliases and joined-term runs behind the prompt prefix
  "bw 82 and oats",
  "BW: 180, eggs",
  "hr 62 then toast",
  "resting hr 58, bagel",
  "RestingHR 55 with rice",
  "eggs, temperature deviation 0.4",
  "toast and temperatureDeviation +0.2",
  "lowest heart rate 48 then oats",
  "average_hrv 40 bagel",
  "total sleep duration 7h, coffee",
  "sleep_score 81 pancakes",
  "my user data says 82",
  "bw about 81 with granola",
  "hr roughly 60 after salad",
  // C: ignorable and format characters inside a blocked word, and line separators
  "wei\u034Fght 182",
  "H\u3164RV 45 eggs",
  "o\u2066ura day and toast",
  "sle\u{1D173}ep score 80",
  "str\u17B4ess and rice",
  "weig\u061Cht 80 kg",
  "mo\u202Eod and rice",
  "weight\u2028180",
  // extras: package-size cap, rescan after a package, full width, mixed
  "weight gainer 180 lb tub",
  "weight gainer 6 kg tub",
  "weight gainer 13 lb bag",
  "weight gainer 1 lb tub, weight 180",
  "weight gainer 2 lb jar then bw 80",
  "weight gainer 5 kg bag and hr 70",
  "ｂｗ ８２",
  "Ｒｅｓｔｉｎｇ ＨＲ ５８",
  "body weight gainer shake",
  "weight gainer about 13st",
  "heart\u2029rate 60",
  "weight gainer\u00AD 82\u200Bkg",
];

const MUST_SEND = [
  "weight gainer shake, 2 scoops",
  "two eggs and toast",
  "heart of palm",
  "chicken 200 g",
  "weight gainer 1 lb tub",
  "weight gainer 2.5 lb tub",
  "weight gainer 12 lb tub",
  "weight gainer 5 kg bag",
  "brisket 8 hr 30 min",
];

const MUST_BLOCK = [
  "stress relief tea",
  "Stress Less smoothie",
  "mood booster smoothie",
  "Good Mood bar",
  "steak weight",
  "steak weight 8 oz",
  "A1C 6.1 with rice",
];

test("regression table: 46 rows block behind the prompt and the stub never runs", async () => {
  assert.equal(REGRESSION.length, 46);
  for (const text of REGRESSION) assert.equal(await sends(text), false, JSON.stringify(text));
});

test("must-send foods reach the model", async () => {
  for (const text of MUST_SEND) assert.equal(await sends(text), true, text);
});

test("must-block stress, mood, and steak weight names", async () => {
  for (const text of MUST_BLOCK) assert.equal(await sends(text), false, text);
});

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const IGNORABLE = ["\u034F", "\u3164", "\uFFA0", "\u115F", "\u17B4", "\u2066", "\u{1D173}", "\u{E0041}", "\u061C", "\u202E", "\u200B", "\uFEFF", "\u00AD", "\u2060", "\u0600", "\u06DD", "\uFFF9", "\u{110BD}", "\u{13430}"];
const FILLERS = ["", " about", " roughly", " at", " around", " approx", " is", " was"];
const FOODS = [
  "eggs", "toast", "oatmeal", "chicken breast", "rice", "salmon", "greek yogurt", "low sugar yogurt",
  "protein shake", "keto bar", "diet soda", "heart of palm salad", "banana", "peanut butter",
  "glucose syrup pancakes", "weight watchers lasagna", "weight gainer shake", "steak", "broccoli",
  "pasta", "tofu", "almonds", "sweet potato", "turkey sandwich", "black coffee",
];

function corpus(seed, n) {
  const r = rng(seed);
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const caseIt = (s) => (r() < 0.3 ? s.toUpperCase() : r() < 0.5 ? s.replace(/\b\w/g, (c) => c.toUpperCase()) : s);
  const wide = (s) => s.replace(/[!-~]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xFEE0));
  const name = () => pick(["weight gainer", "weight gainers", "weight watchers"]);
  const bodyUnit = () => {
    const unit = pick(["lb", "lbs", "pounds", "kg", "kgs", "kilos", "kilograms", "st", "stone"]);
    const value = /^(st|stone)$/.test(unit) ? int(6, 30) : /^k/.test(unit) ? int(40, 160) : int(90, 350);
    return value + (r() < 0.5 ? "" : " ") + unit;
  };
  const kinds = [
    () => `${name()}${pick(FILLERS)} ${bodyUnit()}`,
    () => `${pick(["bw", "hr", "resting hr", "restingHR"])}${pick(FILLERS)}${pick([" ", ": "])}${int(40, 220)}`,
    () => {
      const words = pick([["temperature", "deviation"], ["lowest", "heart", "rate"], ["average", "hrv"], ["total", "sleep", "duration"], ["sleep", "score"], ["resting", "hr"], ["body", "weight"], ["user", "data"]]);
      const joined = r() < 0.25
        ? words[0] + words.slice(1).map((w) => w[0].toUpperCase() + w.slice(1)).join("")
        : words.join(pick([" ", "_", "-", ""]));
      return `${joined} ${int(1, 99)}`;
    },
    () => {
      const word = pick(["weight", "hrv", "oura", "sleep", "stress", "mood", "readiness", "steps"]);
      const at = int(1, word.length - 1);
      return `${word.slice(0, at)}${pick(IGNORABLE)}${word.slice(at)} ${int(1, 200)}`;
    },
    () => pick([`heart rate ${int(40, 190)}`, `bp ${int(90, 180)} ${int(50, 110)}`, `glucose ${int(60, 300)}`, `a1c ${int(4, 12)}`, `${int(70, 300)} mg/dL`, "took metformin", "diagnosed with diabetes"]),
    () => (r() < 0.5 ? `weight gainer ${int(13, 300)} lb ${pick(["tub", "bag", "jar"])}` : `weight gainer ${int(6, 100)} kg ${pick(["tub", "bag", "scoop"])}`),
    () => `weight gainer ${int(1, 12)} lb tub, ${name()} ${bodyUnit()}`,
  ];
  const foodish = [
    () => `${int(50, 400)}${pick(["", " "])}${pick(["g", "grams", "oz", "ml"])} ${pick(FOODS)}`,
    () => `${pick(["two", "half", "a bowl of", "a cup of", "3 slices of"])} ${pick(FOODS)}`,
    () => `weight gainer ${int(1, 12)} lb ${pick(["tub", "bag", "jar"])}`,
    () => `weight gainer ${int(1, 5)}${pick(["", ".5"])} kg ${pick(["tub", "bag", "scoop"])}`.replace(/5\.5 kg/, "5 kg"),
    () => `${pick(["weight gainer shake", "protein shake"])}, ${int(1, 4)} scoops`,
    () => `brisket ${int(2, 14)} hr ${int(5, 55)} min`,
    () => `rice weighed ${int(50, 400)} g`,
    () => pick(FOODS),
  ];
  const hide = (s) => {
    const chars = [...s];
    const spots = [];
    for (let i = 1; i < chars.length; i++) if (/[a-z0-9]/i.test(chars[i - 1]) && /[a-z0-9]/i.test(chars[i])) spots.push(i);
    for (let k = int(1, 3); k > 0 && spots.length; k--) {
      const at = spots.splice(Math.floor(r() * spots.length), 1)[0];
      chars[at] = pick(IGNORABLE) + chars[at];
    }
    return chars.join("");
  };
  const bypass = [];
  const food = [];
  for (let i = 0; i < n; i++) {
    let text = caseIt(pick(kinds)());
    if (r() < 0.3) text = hide(text);
    if (r() < 0.15) text = wide(text);
    bypass.push(r() < 0.5 ? `${pick(FOODS)}, ${text}` : `${text} and ${pick(FOODS)}`);
    const parts = [pick(foodish)(), pick(foodish)()];
    food.push(caseIt(parts.join(pick([", ", " and ", " with "]))));
  }
  return { bypass, food };
}

test("seeded corpus: about 2000 bypasses block and the paired foods send", async () => {
  const seed = Number(process.env.FOOD_GUARD_SEED) || Math.floor(Math.random() * 2 ** 32);
  const { bypass, food } = corpus(seed, 2000);
  const leaked = [];
  for (const text of bypass) if (await sends(text)) leaked.push(text);
  const falsePositives = [];
  for (const text of food) if (!(await sends(text))) falsePositives.push(text);
  const rate = ((falsePositives.length / food.length) * 100).toFixed(2);
  console.log(`food-guard corpus seed=${seed} bypass=${bypass.length} leaked=${leaked.length} food=${food.length} false_positives=${falsePositives.length} (${rate}%)`);
  assert.deepEqual(leaked.slice(0, 5), [], `seed ${seed}: ${leaked.length} bypasses reached the model`);
  assert.deepEqual(falsePositives.slice(0, 5), [], `seed ${seed}: false-positive rate ${rate}%`);
});
