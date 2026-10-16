// Food-guard regression table and seeded bypass corpus.
// Every case goes through the real describe prompt prefix, as food-describe sends it.
// A blocked case must never reach the model stub.
// Two corpus seeds are pinned and one is random. Set FOOD_GUARD_SEED to replay the
// random run. Every seed is printed.
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

// Quinn's repro rows, generated exactly as in the triage script.
const QUINN_PS = ["weight gainer", "weight gainers", "weight watchers"];
const QUINN_X = ["\u034F", "\uFE0F", "\u206A"];
const QUINN_BLOCK = [
  "weight gainer about 180 lb",
  "weight gainer roughly 82 kg",
  ...QUINN_PS.flatMap((p) => ["82 kilos", "82 kilograms", "13 st"].map((u) => `${p} ${u}`)),
];
const QUINN_UNICODE_BLOCK = [
  ["wei", "ght 180 lb"], ["sle", "ep score 82"], ["H", "RV 45"], ["glu", "cose 140"], ["met", "formin with eggs"], ["rest", "ing hr 62"],
].flatMap(([a, b]) => QUINN_X.map((c) => a + c + b));
const QUINN_ALIAS_BLOCK = ["bw 180 lb", "bw 82 kg", "resting hr 62", "eggs, resting hr 62", "restingHR 62"];
const QUINN_SENT = ["weight gainer 1 lb tub"];

// Current behavior, pinned. Every body-data row blocks.
const PINNED = [
  ["weight gainer shake", true],
  ["weight gainer 2 scoops", true],
  ["Two eggs and toast", true],
  ["weight 180 lb", false],
  ["resting hr", false],
  ["bodyweight 82 kg", false],
  ["stress-free salad", false],
  ["mood food bowl", false],
  ["steak (weight 8 oz)", false],
  ["weight gainer 1 lb tub, weight 180 lb", false],
  ["weight gainer 1 lb tub weighing 180", false],
  ["eggs\u2028weight 180", false],
  ["we\u00ADight 180", false],
  ["hr 62", false],
  ["rhr 62", false],
  ["heart rate 62", false],
  // Body fat is pending Will's decision; this records what happens today.
  ["bf 18%", true],
  ["body fat 18%", true],
  ["i'm 82kg", false],
  ["82 kg after gym", false],
  ["weighed 82 kilos", false],
  ["weight\u00a0180", false],
  ["weight gainer at 180 lbs", false],
  ["weight gainer, 180 lbs", false],
  ["weight watchers 13 stone", false],
  ["weight gainer 13st", false],
];

// Tub cap reads a decimal only when a point or comma was typed, with at most 2 digits after it.
// The anywhere body-mass rule counts stone but not a bare st, and reads 82,5 as 82.5.
// Combining marks are dropped, so an accent inside a blocked word does not split it.
// Joined terms split across 3 tokens. Up to 3 words between a food name and a body unit.
const KILL_ROWS = [
  "weight gainer 5 180 lb tub",
  "weight gainer 0.180 lb tub",
  "rest-ing hr",
  "my u-ser data",
  "weight gainer currently 180 lbs",
  "weight gainer me 180 lb",
  "weight gainer currently 25 kg",
  "180-ish lbs",
  "82,5 kg",
  "81,9 kg today",
  "eggs,82 kg",
  "toast.82kg",
  "30 kg",
  "we\u00AD\u0300ight 180",
  "wei\u034F\u0301ght 180",
  "weíght 180",
];
const KEEP_SENDING = [
  "weight gainer 2.5 lb tub",
  "weight gainer 2.50 lb tub",
  "weight gainer with chicken breast",
  "weight watchers lasagna with toast",
  "my 21st birthday cake",
  "brisket 10 lb",
  "weight gainer shake and 1 lb steak",
  "weight gainer 3 lb tub, brisket 20 lb",
  "weight gainer toast",
  "weight watchers chicken breast",
  "6 st louis ribs",
  "12 st. louis ribs",
  "pizza on 86 st",
  "bagel from 5 st",
  "weight gainer 4 lb tub, 2 st louis ribs",
  "29 kg",
  "weight gainer 2,5 lb tub",
  "jalapeño poppers and crème brûlée",
];

test("Quinn's repro rows block, and the 1 lb tub is sent", async () => {
  assert.equal(QUINN_BLOCK.length, 11);
  assert.equal(QUINN_UNICODE_BLOCK.length, 18);
  for (const text of [...QUINN_BLOCK, ...QUINN_UNICODE_BLOCK, ...QUINN_ALIAS_BLOCK]) assert.equal(await sends(text), false, JSON.stringify(text));
  for (const text of QUINN_SENT) assert.equal(await sends(text), true, text);
});

test("pinned extras keep their current behavior", async () => {
  for (const [text, sent] of PINNED) assert.equal(await sends(text), sent, JSON.stringify(text));
});

test("tub decimals, joined terms, word gaps, comma decimals, st, and combining marks", async () => {
  for (const text of KILL_ROWS) assert.equal(await sends(text), false, JSON.stringify(text));
  for (const text of KEEP_SENDING) assert.equal(await sends(text), true, text);
});

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
const MARKS = ["\u0300", "\u0301", "\u0308", "\u0327", "\u036F"];
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
    () => pick([`weight gainer ${int(1, 9)} ${int(13, 300)} lb tub`, `weight gainer 0.${int(100, 999)} lb tub`, `weight gainer ${int(1, 4)}.${int(100, 999)} kg bag`]),
    () => `${name()} ${pick(["currently", "me", "was like", "now maybe", "i think"])} ${bodyUnit()}`,
    () => pick([`i'm ${int(40, 160)}kg`, `${int(90, 350)}-ish lbs`, `${int(40, 160)} kg after gym`, `${int(6, 30)} stone now`, `${int(30, 160)},${int(0, 9)} kg`, `${int(60, 350)},${int(0, 9)} lbs today`]),
  ];
  const foodish = [
    () => `${int(50, 400)}${pick(["", " "])}${pick(["g", "grams", "oz", "ml"])} ${pick(FOODS)}`,
    () => `${pick(["two", "half", "a bowl of", "a cup of", "3 slices of"])} ${pick(FOODS)}`,
    () => `weight gainer ${int(1, 12)} lb ${pick(["tub", "bag", "jar"])}`,
    () => `weight gainer ${int(1, 5)}${pick(["", ".5"])} kg ${pick(["tub", "bag", "scoop"])}`.replace(/5\.5 kg/, "5 kg"),
    () => `${pick(["weight gainer shake", "protein shake"])}, ${int(1, 4)} scoops`,
    () => `brisket ${int(2, 14)} hr ${int(5, 55)} min`,
    () => `rice weighed ${int(50, 400)} g`,
    () => `weight gainer ${int(1, 11)}.${int(1, 99)} lb tub`,
    () => `${pick(["brisket", "turkey", "ham"])} ${int(2, 20)} lb`,
    () => `${pick(FOODS)} with ${pick(["chicken breast", "toast", "almonds"])}`,
    () => pick([`${int(1, 20)} st louis ribs`, `${int(1, 20)} st. louis ribs`, `pizza on ${int(1, 120)} st`, `bagel from ${int(1, 120)} st`]),
    () => pick(["jalapeño poppers", "crème brûlée", "açaí bowl", "café au lait", "piña colada", "jalapeño"]),
    () => `weight gainer ${int(1, 11)},${int(1, 99)} lb tub`,
    () => pick(FOODS),
  ];
  const hide = (s) => {
    const chars = [...s];
    const spots = [];
    for (let i = 1; i < chars.length; i++) if (/[a-z0-9]/i.test(chars[i - 1]) && /[a-z0-9]/i.test(chars[i])) spots.push(i);
    for (let k = int(1, 3); k > 0 && spots.length; k--) {
      const at = spots.splice(Math.floor(r() * spots.length), 1)[0];
      chars[at] = (r() < 0.25 ? pick(MARKS) : pick(IGNORABLE)) + chars[at];
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

const PINNED_SEEDS = [42, 31337];

for (const label of ["pinned 42", "pinned 31337", "random"]) {
  test(`seeded corpus (${label}): 2000 bypasses block and the paired foods send`, async () => {
    const seed = label === "random"
      ? Number(process.env.FOOD_GUARD_SEED) || Math.floor(Math.random() * 2 ** 32)
      : PINNED_SEEDS[label === "pinned 42" ? 0 : 1];
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
}
