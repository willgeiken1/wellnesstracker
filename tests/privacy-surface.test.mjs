import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { FOOD_MODEL_ID } from "../supabase/functions/_shared/food-model.js";
import { buildExportFiles, stripRange } from "../logger/js/shared/purge.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

function invokeBody(src, name) {
  const match = src.match(new RegExp(`invoke\\("${name}",\\s*\\{\\s*body:\\s*\\{([^}]*)\\}`));
  assert.ok(match, `${name} invoke body`);
  return match[1];
}

function bodyFields(src) {
  return [...new Set([...src.matchAll(/body\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((match) => match[1]))].sort();
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
    "reports",
    "reactions",
    "comments",
    "shared_items",
    "friend_invites",
    "friendships",
    "blocks",
    "social_settings",
  ]);
  assert.match(edge, /body\.confirm !== "DELETE"/);
  assert.match(privacy, /typed !== "DELETE"/);
  assert.match(privacy, /Type DELETE in capital letters to confirm/);
  assert.match(privacy, /invoke\("delete-account", \{ body: \{ confirm: "DELETE" \} \}\)/);
});

function routineFixture() {
  return {
    sessions: [],
    dailyRoutines: {
      blocks: [{ id: "block-1", name: "Morning routine", order: 0, updatedAt: 10, deletedAt: null }],
      items: [{ id: "item-1", name: "Example Item", kind: "dose", compoundId: "compound-1", updatedAt: 10, deletedAt: null }],
      placements: [{ id: "place-1", blockId: "block-1", itemId: "item-1", order: 0, updatedAt: 10, deletedAt: null }],
      compounds: [{ id: "compound-1", name: "Example Item", amount: 1, unit: "mcg", updatedAt: 10, deletedAt: null }],
      logs: [
        { id: "log-1", itemId: "item-1", day: "2026-11-01", status: "done", amount: 1, unit: "mcg", at: 10, updatedAt: 10, deletedAt: null },
        { id: "log-2", itemId: "item-1", day: "2026-11-02", status: "partial", amount: 0.25, unit: "mcg", at: 20, updatedAt: 20, deletedAt: null },
      ],
      prefs: {
        lastBlockId: "block-1",
        focusMode: true,
        collapsedBlocks: ["block-1"],
        revealBlocks: ["block-1"],
        updatedAt: 10,
      },
    },
  };
}

test("the web privacy policy describes what daily routines store and sync", () => {
  const policy = read("../privacy.md");
  const page = read("../logger/js/pages/privacy.js");
  const native = read("../insight-daily-privacy.md");
  assert.match(policy, /_Last updated: November 19, 2026_/);
  assert.doesNotMatch(policy, /_Last updated: October 16, 2026_/);
  assert.match(policy, /Blocks, the items in them, which block each item is placed in, and preferences/);
  assert.match(policy, /planned amount and unit/);
  assert.match(policy, /the item, the day, the status \(done, partial, or skipped\), the amount and unit when you logged an amount, and the time it was logged/);
  assert.match(policy, /save the log on an earlier day/);
  assert.match(policy, /When you are signed in, the layout and the dose logs sync to your account/);
  assert.match(policy, /included in the Settings backup and in the privacy export/);
  assert.match(policy, /A deleted dose log keeps only a small marker \(its id, the day, its status, and when it was deleted\) so an older device cannot bring it back\. The amount, the unit, and the item are removed\./);
  assert.match(policy, /That is the copy on this device, in your account, in the Settings backup, and in the privacy export/);
  assert.match(policy, /replaces the dose logs on those days with the same marker and leaves the layout/);
  assert.doesNotMatch(policy, /including the amount/);
  assert.match(policy, /Crash reports and usage analytics do not include dose amounts or item names/);
  assert.match(policy, /does arithmetic on this device from the numbers you type/);
  assert.match(policy, /It is not saved, it is not synced, and it is not sent anywhere/);
  assert.match(policy, /It is not a recommendation/);
  assert.match(page, /A deleted dose log keeps only a small marker/);
  assert.match(page, /The amount, the unit, and the item are removed/);
  assert.doesNotMatch(page, /including the amount/);
  assert.match(page, /It is not saved and it is not a recommendation/);
  assert.doesNotMatch(policy, /discover/i);
  assert.doesNotMatch(page, /discover/i);
  assert.doesNotMatch(native, /dose log|reconstitution|daily routine/i);
});

test("the settings backup and the privacy export include the routine layout and dose logs", () => {
  const actions = read("../logger/js/shell/actions.js");
  const cloud = read("../logger/js/shared/cloud.js");
  const exportStart = actions.indexOf("function exportData");
  const exportBody = actions.slice(exportStart, actions.indexOf("const name =", exportStart));
  assert.match(exportBody, /dailyRoutines: app\.state\.dailyRoutines \|\| null/);
  assert.match(cloud, /dailyRoutines: app\.state\.dailyRoutines \|\| null/);

  const data = routineFixture();
  assert.equal(stripRange(data, "2026-11-01", "2026-11-01", { before: 4000, now: 6000 }), true);
  const purged = data.dailyRoutines.logs.find((row) => row.id === "log-1");
  const kept = data.dailyRoutines.logs.find((row) => row.id === "log-2");
  assert.equal(purged.deletedAt, 4000);
  assert.equal(kept.deletedAt, null);
  assert.equal(kept.amount, 0.25);
  assert.equal(data.dailyRoutines.blocks[0].deletedAt, null);
  assert.equal(data.dailyRoutines.items[0].name, "Example Item");
  assert.equal(data.dailyRoutines.placements[0].itemId, "item-1");

  const files = buildExportFiles(data);
  const byName = Object.fromEntries(files.map((file) => [file.name, file.text]));
  assert.match(byName["about.txt"], /A deleted dose log in daily_routine_logs\.csv is only a marker: its id, the day, its status, and when it was deleted/);
  assert.match(byName["about.txt"], /The amount, the unit, and the item are not in that row/);
  assert.match(byName["about.txt"], /reconstitution calculator is not stored/);
  assert.match(byName["daily_routine_blocks.csv"], /block-1,Morning routine,0,/);
  assert.match(byName["daily_routine_items.csv"], /item-1,Example Item,dose,1,mcg,/);
  assert.match(byName["daily_routine_placements.csv"], /block-1,item-1,Morning routine,Example Item,0,/);
  const logLines = byName["daily_routine_logs.csv"].trim().split("\r\n");
  assert.equal(logLines[0], "id,item_id,item,day,status,amount,unit,time,deleted");
  assert.equal(logLines.find((line) => line.startsWith("log-1,")), "log-1,,,2026-11-01,done,,,,1970-01-01T00:00:04.000Z");
  assert.equal(logLines.find((line) => line.startsWith("log-2,")), "log-2,item-1,Example Item,2026-11-02,partial,0.25,mcg,1970-01-01T00:00:00.020Z,");
  assert.doesNotMatch(logLines.find((line) => line.startsWith("log-1,")), /Example Item|item-1|mcg|,1,/);
  assert.match(byName["daily_routine_preferences.csv"], /last_block,Morning routine/);
  assert.match(byName["daily_routine_preferences.csv"], /focus_mode,on/);
  assert.match(byName["daily_routine_preferences.csv"], /collapsed_blocks,Morning routine/);
  assert.match(byName["daily_routine_preferences.csv"], /show_completed,Morning routine/);
  assert.doesNotMatch(Object.values(byName).join("\n"), /discover/i);
});
