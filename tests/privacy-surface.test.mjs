import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { FOOD_MODEL_ID } from "../supabase/functions/_shared/food-model.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

function invokeBody(src, name) {
  const match = src.match(new RegExp(`invoke\\("${name}",\\s*\\{\\s*body:\\s*\\{([^}]*)\\}`));
  assert.ok(match, `${name} invoke body`);
  return match[1];
}

function bodyFields(src) {
  return [...new Set([...src.matchAll(/\bbody\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((match) => match[1]))].sort();
}

function stringifyObject(src) {
  const marker = "JSON.stringify(";
  const at = src.indexOf(marker);
  assert.ok(at >= 0, "Anthropic JSON.stringify");
  let i = at + marker.length;
  while (src[i] === " " || src[i] === "\n") i++;
  assert.equal(src[i], "{");
  const start = i;
  let depth = 0;
  let quote = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === "\\") { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "\"" || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  assert.fail("unterminated Anthropic body");
}

function topLevelKeys(objectSrc) {
  const keys = [];
  let depth = 0;
  let quote = null;
  for (let i = 0; i < objectSrc.length; i++) {
    const c = objectSrc[i];
    if (quote) {
      if (c === "\\") { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "\"" || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{" || c === "[" || c === "(") { depth++; continue; }
    if (c === "}" || c === "]" || c === ")") { depth--; continue; }
    if (depth !== 1) continue;
    if (c === "." && objectSrc[i + 1] === "." && objectSrc[i + 2] === ".") {
      keys.push("...");
      i += 2;
      continue;
    }
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*:/.exec(objectSrc.slice(i));
    if (match) {
      keys.push(match[1]);
      i += match[0].length - 1;
    }
  }
  return keys;
}

function resolveFoodModel(src, raw) {
  const match = src.match(/const MODEL = ([^;]+);/);
  assert.ok(match, "MODEL assignment");
  const Deno = {
    env: { get(name) { assert.equal(name, "FOOD_MODEL"); return raw; } },
  };
  return new Function("Deno", "FOOD_MODEL_ID", `return (${match[1]});`)(Deno, FOOD_MODEL_ID);
}

test("food AI uses Haiku and sends only meal text or an image plus a hint", () => {
  const food = read("../logger/js/pages/food.js");
  const photoFn = read("../supabase/functions/food-photo/index.ts");
  const describeFn = read("../supabase/functions/food-describe/index.ts");
  const forbidden = /(?:oura|readiness|hrv|sleep|weight|kcal|calories|protein)/i;
  assert.match("sleepScore", forbidden);
  assert.match("oura_days", forbidden);
  assert.match("\nweight", forbidden);
  assert.doesNotMatch("steps", forbidden);

  assert.equal(FOOD_MODEL_ID, "claude-haiku-4-5-20251001");
  for (const src of [photoFn, describeFn]) {
    assert.match(src, /from "\.\.\/_shared\/food-model\.js"/);
    assert.match(src, /\(Deno\.env\.get\("FOOD_MODEL"\) \?\? ""\)\.trim\(\) \|\| FOOD_MODEL_ID/);
    assert.match(src, /max_tokens: 1500/);
    assert.doesNotMatch(src, /claude-sonnet/);
    assert.doesNotMatch(src, /(?:oura|readiness|hrv|sleep|weight)/i);
    assert.doesNotMatch(src, /\.from\(/);
    assert.doesNotMatch(src, /createClient/);
    assert.deepEqual(topLevelKeys(stringifyObject(src)), ["model", "max_tokens", "messages"]);
  }

  const photoBody = invokeBody(food, "food-photo");
  const describeBody = invokeBody(food, "food-describe");
  assert.equal(photoBody, ' image, hint: app.ui.sd.hint || "", ...app.aiClock() ');
  assert.doesNotMatch(photoBody, forbidden);
  assert.equal(describeBody, " text, ...app.aiClock() ");
  assert.doesNotMatch(describeBody, /\bimage\b/);
  assert.doesNotMatch(describeBody, forbidden);
  assert.match(food, /return \{ localDate: app\.today\(\), timeZone \}/);

  assert.deepEqual(bodyFields(photoFn), ["hint", "image", "localDate", "timeZone"]);
  assert.deepEqual(bodyFields(describeFn), ["localDate", "text", "timeZone"]);
  assert.doesNotMatch(photoFn, /body\.(?:oura|readiness|hrv|sleep|weight|kcal|protein|note)/);
  assert.doesNotMatch(describeFn, /body\.(?:oura|readiness|hrv|sleep|weight|kcal|protein|image|note)/);
  assert.match("body.sleepScore", /body\.(?:oura|readiness|hrv|sleep|weight|kcal|protein|note)/);
  assert.match("body.oura_days", /body\.(?:oura|readiness|hrv|sleep|weight|kcal|protein|note)/);
  assert.match(describeFn, /The meal: " \+ text/);
  assert.match(photoFn, /media_type: "image\/jpeg", data: image/);
  assert.match(photoFn, /The user adds: \$\{hint\}/);
});

test("an empty or whitespace FOOD_MODEL falls back to the Haiku id", () => {
  const photoFn = read("../supabase/functions/food-photo/index.ts");
  const describeFn = read("../supabase/functions/food-describe/index.ts");
  const blanks = [undefined, "", " ", "\t", "\n", " \t\n "];
  for (const src of [photoFn, describeFn]) {
    for (const raw of blanks) assert.equal(resolveFoodModel(src, raw), FOOD_MODEL_ID);
    assert.equal(resolveFoodModel(src, "  claude-haiku-4-5-20251001  "), "claude-haiku-4-5-20251001");
  }
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
