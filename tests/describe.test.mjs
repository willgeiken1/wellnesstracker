import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseFoodEstimate } from "../supabase/functions/_shared/food-estimate.js";

test("a written meal becomes the same item shape as a photo", () => {
  const reply = `Here you go:
{"items":[
  {"name":"Eggs","portion":"2 large","grams":100,"calories":156,"protein":12,"carbs":1,"fat":11},
  {"name":"Toast with butter","portion":"1 slice","grams":40,"calories":140,"protein":3,"carbs":15,"fat":7},
  {"name":"Black coffee","portion":"1 cup","grams":240,"calories":2,"protein":0,"carbs":0,"fat":0}
],"notes":"Butter is a typical pat."}`;
  const parsed = parseFoodEstimate(reply);
  assert.equal(parsed.items.length, 3);
  assert.equal(parsed.items[0].name, "Eggs");
  assert.equal(parsed.items[0].calories, 156);
  assert.equal(parsed.items[0].protein, 12);
  assert.equal(parsed.items[1].carbs, 15);
  assert.equal(parsed.items[2].fat, 0);
  assert.match(parsed.notes, /Butter/);
});

test("a reply that is not food estimates returns no items", () => {
  const parsed = parseFoodEstimate('{"items":[],"notes":"No food found in the description"}');
  assert.deepEqual(parsed.items, []);
  assert.equal(parseFoodEstimate("no json here"), null);
  assert.equal(parseFoodEstimate("{not json"), null);
});

test("the describe function is text-only and uses the 20-a-day counter", () => {
  const src = readFileSync(new URL("../supabase/functions/food-describe/index.ts", import.meta.url), "utf8");
  assert.match(src, /DESCRIBE_KIND/);
  assert.match(src, /resolveQuotaDay/);
  assert.match(src, /releaseQuota/);
  assert.match(src, /type: "text"/);
  assert.doesNotMatch(src, /image/);
  assert.match(src, /descriptions for today/);
  const ui = readFileSync(new URL("../logger/js/pages/food.js", import.meta.url), "utf8");
  assert.match(ui, /Describe it/);
  assert.match(ui, /20 descriptions a day/);
  assert.match(ui, /food-describe/);
  assert.match(ui, /descriptions left today|description"\)\} left today/);
});
