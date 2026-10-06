import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

function invokeBody(src, name) {
  const match = src.match(new RegExp(`invoke\\("${name}",\\s*\\{\\s*body:\\s*\\{([^}]*)\\}`));
  assert.ok(match, `${name} invoke body`);
  return match[1];
}

function bodyFields(src) {
  return [...new Set([...src.matchAll(/\bbody\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((match) => match[1]))].sort();
}

test("food AI request bodies are meal text or an image plus a hint", () => {
  const food = read("../logger/js/pages/food.js");
  const photoFn = read("../supabase/functions/food-photo/index.ts");
  const describeFn = read("../supabase/functions/food-describe/index.ts");
  const forbidden = /\b(?:oura|readiness|hrv|sleep|weight|kcal|calories|protein)\b/i;

  const photoBody = invokeBody(food, "food-photo");
  const describeBody = invokeBody(food, "food-describe");
  assert.match(photoBody, /\bimage\b/);
  assert.match(photoBody, /\bhint\b/);
  assert.match(photoBody, /\.\.\.app\.aiClock\(\)/);
  assert.doesNotMatch(photoBody, forbidden);
  assert.match(describeBody, /\btext\b/);
  assert.match(describeBody, /\.\.\.app\.aiClock\(\)/);
  assert.doesNotMatch(describeBody, /\bimage\b/);
  assert.doesNotMatch(describeBody, forbidden);
  assert.match(food, /return \{ localDate: app\.today\(\), timeZone \}/);

  assert.deepEqual(bodyFields(photoFn), ["hint", "image", "localDate", "timeZone"]);
  assert.deepEqual(bodyFields(describeFn), ["localDate", "text", "timeZone"]);
  assert.doesNotMatch(photoFn, /body\.(?:oura|readiness|hrv|sleep|weight|kcal|protein|note)\b/);
  assert.doesNotMatch(describeFn, /body\.(?:oura|readiness|hrv|sleep|weight|kcal|protein|image|note)\b/);
  assert.match(describeFn, /The meal: " \+ text/);
  assert.match(photoFn, /media_type: "image\/jpeg", data: image/);
  assert.match(photoFn, /The user adds: \$\{hint\}/);
});

test("delete account requires DELETE and removes the known tables", () => {
  const edge = read("../supabase/functions/delete-account/index.ts");
  const privacy = read("../logger/js/pages/privacy.js");
  const known = edge.match(/const KNOWN = \[([\s\S]*?)\];/);
  assert.ok(known, "KNOWN table list");
  const tables = [...known[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(tables, [
    "user_data",
    "oura_days",
    "oura_connections",
    "oura_tokens",
    "oura_oauth_states",
    "progress_photos",
    "ai_usage",
  ]);
  assert.match(edge, /body\.confirm !== "DELETE"/);
  assert.match(privacy, /typed !== "DELETE"/);
  assert.match(privacy, /Type DELETE in capital letters to confirm/);
  assert.match(privacy, /invoke\("delete-account", \{ body: \{ confirm: "DELETE" \} \}\)/);
});
