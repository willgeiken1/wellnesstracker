// Food model egress. Allowed request keys, and why:
// model, max_tokens — the food model id and the fixed 1500-token cap
// messages, role, content, type, text — the fixed prompt plus the meal text
// source, media_type, data — the meal photo (jpeg bytes), not scanned as text
// Anything else, including a nested wearable or health key, throws first.
// The model client must not run after that throw.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { FOOD_MODEL_ID } from "../supabase/functions/_shared/food-model.js";
import { describeEstimateSchema, readDescribeEstimate } from "../supabase/functions/_shared/food-output.js";
import { FOOD_AI_ALLOWED_KEYS, FoodAiPayloadError, callFoodModel } from "../supabase/functions/_shared/strip.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const SENTINEL = 987654;

function describePayload(text) {
  return {
    model: FOOD_MODEL_ID,
    max_tokens: 1500,
    messages: [{ role: "user", content: [{ type: "text", text }] }],
  };
}

function photoPayload(text, data = "abcd") {
  return {
    model: FOOD_MODEL_ID,
    max_tokens: 1500,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data } },
        { type: "text", text },
      ],
    }],
  };
}

async function expectBlocked(payload) {
  let calls = 0;
  await assert.rejects(
    () => callFoodModel(payload, async () => { calls += 1; return { ran: true }; }),
    (err) => err instanceof FoodAiPayloadError && err.message.indexOf(String(SENTINEL)) === -1,
  );
  assert.equal(calls, 0);
}

test("an allowed meal payload is sent once", async () => {
  const payload = describePayload("Two eggs and toast");
  let calls = 0;
  let seen;
  const out = await callFoodModel(payload, async (body) => { calls += 1; seen = body; return { ok: true }; });
  assert.equal(calls, 1);
  assert.equal(seen, payload);
  assert.equal(out.ok, true);
  const keys = JSON.stringify(payload);
  assert.equal(keys.includes(String(SENTINEL)), false);
  for (const key of ["oura", "readiness", "sleep", "hrv", "weight", "mood", "stress"]) {
    assert.equal(Object.prototype.hasOwnProperty.call(payload, key), false);
  }
});

test("an allowed photo payload is sent once and photo bytes are not treated as text", async () => {
  const payload = photoPayload("Plate of rice", "sleep");
  let calls = 0;
  const out = await callFoodModel(payload, async (body) => {
    calls += 1;
    assert.equal(body.messages[0].content[0].source.data, "sleep");
    return { ok: true };
  });
  assert.equal(calls, 1);
  assert.equal(out.ok, true);
  assert.deepEqual(FOOD_AI_ALLOWED_KEYS, [
    "model", "max_tokens", "messages", "role", "content", "type", "text", "source", "media_type", "data",
  ]);
});

test("wearable and health keys throw before the model client runs", async () => {
  const keys = ["oura", "readiness", "sleep", "HRV", "hrv", "weight", "mood", "stress", "sleepScore", "average_hrv"];
  for (const key of keys) {
    const onText = describePayload("Two eggs and toast");
    onText.messages[0].content[0][key] = SENTINEL;
    await expectBlocked(onText);

    const nested = describePayload("Two eggs and toast");
    nested.messages[0][key] = { score: SENTINEL, nested: { [key]: SENTINEL } };
    await expectBlocked(nested);

    const deep = photoPayload("Plate of rice");
    deep.messages[0].content[0].source[key] = { [key]: SENTINEL };
    await expectBlocked(deep);
  }
});

test("a health word inside the meal text throws and the client is not called", async () => {
  for (const text of ["Two eggs readiness 80", "oatmeal and poor sleep", "HRV was high, then eggs", "weight 82 toast", "low mood and rice", "Oura day plus coffee"]) {
    await expectBlocked(describePayload(text));
  }
});

test("the real food prompts are allowed with a plain meal", async () => {
  const describeSrc = read("../supabase/functions/food-describe/index.ts");
  const photoSrc = read("../supabase/functions/food-photo/index.ts");
  const describePrompt = describeSrc.match(/const PROMPT = `([\s\S]*?)`;/);
  const photoPrompt = photoSrc.match(/const PROMPT = `([\s\S]*?)`;/);
  assert.ok(describePrompt && photoPrompt);
  let calls = 0;
  await callFoodModel(describePayload(describePrompt[1] + "\nThe meal: Two eggs and toast"), async () => { calls += 1; });
  await callFoodModel(photoPayload(photoPrompt[1] + "\nThe user adds: cooked in butter"), async () => { calls += 1; });
  assert.equal(calls, 2);
  assert.match(describeSrc, /callFoodModel\(JSON\.parse\(wire\), \(body\) => fetch\(/);
  assert.match(photoSrc, /callFoodModel\(JSON\.parse\(wire\), \(body\) => fetch\(/);
  assert.match(describeSrc, /readDescribeEstimate/);
  assert.match(describeSrc, /if \(!parsed\) throw new Error\("Couldn't read the estimate/);
  assert.doesNotMatch(describeSrc, /image/);
  for (const src of [describeSrc, photoSrc]) {
    assert.doesNotMatch(src, /(?:oura|readiness|hrv|sleep|weight)/i);
    assert.doesNotMatch(src, /from ["']ai["']/);
    assert.doesNotMatch(src, /@ai-sdk|generateObject|AI_GATEWAY|OPENAI_API_KEY/);
    assert.doesNotMatch(src, /user_data/);
  }
});

test("zod accepts a full describe reply and rejects a partial one", () => {
  const reply = `Here you go:
{"items":[
  {"name":"Eggs","portion":"2 large","grams":100,"calories":156.2,"protein":12,"carbs":1,"fat":11}
],"notes":"Butter is a typical pat."}`;
  const parsed = readDescribeEstimate(reply);
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].name, "Eggs");
  assert.equal(parsed.items[0].calories, 156);
  assert.equal(parsed.notes, "Butter is a typical pat.");
  assert.equal(describeEstimateSchema.safeParse(JSON.parse(reply.match(/\{[\s\S]*\}/)[0])).success, true);

  const partial = {
    items: [
      { name: "KEEPME", portion: "1", grams: 1, calories: 1, protein: 1, carbs: 1, fat: 1 },
      { name: "Eggs", portion: "2", grams: 1, calories: 1, protein: 1, carbs: 1 },
    ],
    notes: "missing fat on the second item",
  };
  assert.equal(readDescribeEstimate(JSON.stringify(partial)), null);
  assert.equal(readDescribeEstimate('{"items":[],"notes":"No food found in the description"}').items.length, 0);
  assert.equal(readDescribeEstimate("no json here"), null);
  assert.equal(readDescribeEstimate(JSON.stringify({
    items: [{ name: "Eggs", portion: "2", grams: 1, calories: 1, protein: 1, carbs: 1, fat: -1 }],
    notes: "bad",
  })), null);
  const many = {
    items: Array.from({ length: 13 }, (_, i) => ({
      name: "Food " + i, portion: "1", grams: 1, calories: 1, protein: 1, carbs: 1, fat: 1,
    })),
    notes: "too many",
  };
  assert.equal(readDescribeEstimate(JSON.stringify(many)), null);
});

test("the zod pin matches the edge import map and the AI SDK is not installed", () => {
  const pkg = JSON.parse(read("../package.json"));
  const deno = JSON.parse(read("../supabase/functions/deno.json"));
  assert.equal(pkg.dependencies.zod, "3.25.76");
  assert.equal(deno.imports.zod, "npm:zod@3.25.76");
  assert.equal(pkg.dependencies.ai, undefined);
  assert.equal(pkg.devDependencies.ai, undefined);
  const output = read("../supabase/functions/_shared/food-output.js");
  assert.match(output, /from "zod"/);
  assert.doesNotMatch(output, /generateObject|@ai-sdk/);
  const workflow = read("../.github/workflows/supabase-deploy.yml");
  assert.match(workflow, /--import-map supabase\/functions\/deno\.json/);
  assert.equal(exists("../supabase/functions/food-describe/deno.json"), false);
  assert.equal(exists("../supabase/functions/import_map.json"), false);
});

function exists(path) {
  try {
    read(path);
    return true;
  } catch (err) {
    if (err && err.code === "ENOENT") return false;
    throw err;
  }
}

function item(overrides = {}) {
  return {
    name: "Eggs",
    portion: "2",
    grams: 1,
    calories: 1,
    protein: 1,
    carbs: 1,
    fat: 1,
    ...overrides,
  };
}

test("blocklist spelling catches lowest heart rate, joined phrases, and camelCase", async () => {
  const strip = read("../supabase/functions/_shared/strip.ts");
  assert.match(strip, /"lowestheartrate"/);
  assert.doesNotMatch(strip, /lowesthheartrate/);
  for (const text of [
    "lowest heart rate",
    "lowestHeartRate",
    "Lowest_Heart_Rate",
    "temperature deviation",
    "resting hr",
    "eggs poorSleep",
  ]) {
    await expectBlocked(describePayload(text));
  }
});

test("model, meal text, and photo bytes keep their length bounds", async () => {
  const one = describePayload("a");
  one.model = "m";
  await callFoodModel(one, async () => ({ ok: true }));
  const eighty = describePayload("a".repeat(8000));
  eighty.model = "m".repeat(80);
  await callFoodModel(eighty, async () => ({ ok: true }));
  await callFoodModel(photoPayload("a", "a"), async () => ({ ok: true }));
  await callFoodModel(photoPayload("a", "a".repeat(2_000_000)), async () => ({ ok: true }));

  const emptyModel = describePayload("eggs");
  emptyModel.model = "";
  await expectBlocked(emptyModel);
  const longModel = describePayload("eggs");
  longModel.model = "m".repeat(81);
  await expectBlocked(longModel);
  const numericModel = describePayload("eggs");
  numericModel.model = 1;
  await expectBlocked(numericModel);
  await expectBlocked(describePayload(""));
  await expectBlocked(describePayload("a".repeat(8001)));
  const emptyPhoto = photoPayload("eggs", "");
  await expectBlocked(emptyPhoto);
  await expectBlocked(photoPayload("eggs", "a".repeat(2_000_001)));
});

test("token cap, role, order, media type, and extra allowed keys stay closed", async () => {
  for (const max of [1499, 1501]) {
    const payload = describePayload("eggs");
    payload.max_tokens = max;
    await expectBlocked(payload);
  }
  const swapped = photoPayload("eggs");
  swapped.messages[0].content.reverse();
  await expectBlocked(swapped);
  const png = photoPayload("eggs");
  png.messages[0].content[0].source.media_type = "image/png";
  await expectBlocked(png);
  const url = photoPayload("eggs");
  url.messages[0].content[0].source.type = "url";
  await expectBlocked(url);
  const twoTexts = describePayload("eggs");
  twoTexts.messages[0].content.push({ type: "text", text: "toast" });
  await expectBlocked(twoTexts);
  const extra = describePayload("eggs");
  extra.messages[0].content[0].data = "abcd";
  await expectBlocked(extra);

  const bare = Object.assign(Object.create(null), describePayload("eggs"));
  let calls = 0;
  await callFoodModel(bare, async () => { calls += 1; return { ok: true }; });
  assert.equal(calls, 1);
  await assert.rejects(
    () => callFoodModel(describePayload("eggs"), null),
    (err) => err instanceof FoodAiPayloadError,
  );
});

test("zod bounds, extra fields, and a rounded negative macro", () => {
  const ok = (overrides, notes = "ok") => readDescribeEstimate(JSON.stringify({
    items: [item(overrides)],
    notes,
  }));
  assert.equal(ok({ grams: 0, calories: 0, protein: 0, carbs: 0, fat: 0 }).items[0].grams, 0);
  assert.equal(ok({ calories: 5000 }).items[0].calories, 5000);
  assert.equal(ok({ name: "a".repeat(80) }).items[0].name.length, 80);
  assert.equal(ok({ portion: "p".repeat(60) }).items[0].portion.length, 60);
  assert.equal(ok({}, "n".repeat(300)).notes.length, 300);
  assert.equal(ok({ name: "  Eggs  " }).items[0].name, "Eggs");

  const dozen = {
    items: Array.from({ length: 12 }, () => item()),
    notes: "twelve",
  };
  assert.equal(readDescribeEstimate(JSON.stringify(dozen)).items.length, 12);

  assert.equal(ok({ calories: 5000.4 }), null);
  assert.equal(ok({ calories: 5001 }), null);
  assert.equal(ok({ fat: -0.4 }), null);
  assert.equal(ok({ name: "a".repeat(81) }), null);
  assert.equal(ok({ portion: "p".repeat(61) }), null);
  assert.equal(ok({}, "n".repeat(301)), null);
  assert.equal(ok({ extra: true }), null);
  assert.equal(readDescribeEstimate(JSON.stringify({
    items: [item()],
    notes: "ok",
    extra: true,
  })), null);
});
