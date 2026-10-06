// Compare Sonnet 5.5 and Haiku 4.5 on made-up meal descriptions.
// Run locally when a key is already available:
//   ANTHROPIC_API_KEY=... node scripts/compare-food-models.mjs
// Sends the food-describe prompt plus each fixture meal. No photos, no account data.

import { readFileSync } from "node:fs";
import { FOOD_MODEL_ID } from "../supabase/functions/_shared/food-model.js";
import { parseFoodEstimate } from "../supabase/functions/_shared/food-estimate.js";

const SONNET_ID = "claude-sonnet-5-5";
const HAIKU_ID = FOOD_MODEL_ID;

const MEALS = [
  "2 scrambled eggs, 1 slice wheat toast with butter, black coffee",
  "Chipotle chicken burrito bowl with rice, black beans, salsa, cheese",
  "grande oat milk latte",
  "6 oz grilled salmon, 1 cup quinoa, roasted broccoli",
  "Greek yogurt with blueberries and a handful of almonds",
  "turkey sandwich on whole wheat with lettuce, tomato, and mustard, plus an apple",
  "bowl of oatmeal with banana and a tablespoon of peanut butter",
  "grilled chicken Caesar salad, no croutons, light dressing",
];

function describePrompt() {
  const src = readFileSync(new URL("../supabase/functions/food-describe/index.ts", import.meta.url), "utf8");
  const match = src.match(/const PROMPT = `([\s\S]*?)`;/);
  if (!match) throw new Error("Could not read the food-describe prompt.");
  return match[1];
}

function totals(parsed) {
  if (!parsed) return null;
  const add = (key) => parsed.items.reduce((sum, item) => sum + item[key], 0);
  return { kcal: add("calories"), protein: add("protein"), carbs: add("carbs"), fat: add("fat") };
}

async function estimate(model, prompt, meal, key) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      messages: [{ role: "user", content: [{ type: "text", text: prompt + "\nThe meal: " + meal }] }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`${model} returned ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  const reply = (data.content ?? []).filter((block) => block.type === "text").map((block) => block.text || "").join("");
  return { totals: totals(parseFoodEstimate(reply)), outputTokens: data.usage?.output_tokens ?? null };
}

function cell(result, key) {
  return result.totals ? String(result.totals[key]) : "unparsed";
}

const key = process.env.ANTHROPIC_API_KEY;
if (!key) {
  console.error("Comparison has not run: ANTHROPIC_API_KEY is not set.");
  console.error("Set it in the environment and run: node scripts/compare-food-models.mjs");
  process.exit(1);
}

const prompt = describePrompt();
const rows = [];
for (const meal of MEALS) {
  const sonnet = await estimate(SONNET_ID, prompt, meal, key);
  const haiku = await estimate(HAIKU_ID, prompt, meal, key);
  rows.push({ meal, sonnet, haiku });
}

const header = [
  "Meal",
  "Sonnet kcal", "Sonnet protein", "Sonnet carbs", "Sonnet fat", "Sonnet output tokens",
  "Haiku kcal", "Haiku protein", "Haiku carbs", "Haiku fat", "Haiku output tokens",
];
console.log(`| ${header.join(" | ")} |`);
console.log(`| ${header.map(() => "---").join(" | ")} |`);
for (const row of rows) {
  const values = [
    row.meal,
    cell(row.sonnet, "kcal"), cell(row.sonnet, "protein"), cell(row.sonnet, "carbs"), cell(row.sonnet, "fat"),
    row.sonnet.outputTokens ?? "",
    cell(row.haiku, "kcal"), cell(row.haiku, "protein"), cell(row.haiku, "carbs"), cell(row.haiku, "fat"),
    row.haiku.outputTokens ?? "",
  ];
  console.log(`| ${values.join(" | ")} |`);
}
