import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { dayDistance, resolveQuotaDay, serverLocalDay } from "../supabase/functions/_shared/quota-day.js";

const NOW = new Date("2026-10-04T02:30:00Z");

test("local midnight follows the phone's time zone, not UTC", () => {
  assert.equal(serverLocalDay("UTC", NOW), "2026-10-04");
  assert.equal(serverLocalDay("America/Chicago", NOW), "2026-10-03");
  const chicago = resolveQuotaDay("2026-10-03", "America/Chicago", NOW);
  assert.equal(chicago.day, "2026-10-03");
  const utc = resolveQuotaDay("2026-10-04", "UTC", NOW);
  assert.equal(utc.day, "2026-10-04");
});

test("a one-day clock skew is accepted and the server date is the bucket", () => {
  const near = resolveQuotaDay("2026-10-04", "America/Chicago", NOW);
  assert.equal(near.day, "2026-10-03");
  const far = resolveQuotaDay("2026-09-01", "America/Chicago", NOW);
  assert.match(far.error, /time zone|clock/i);
});

test("bad dates and time zones are rejected", () => {
  assert.ok(resolveQuotaDay("2026-02-31", "UTC", NOW).error);
  assert.ok(resolveQuotaDay("04-10-2026", "UTC", NOW).error);
  assert.ok(resolveQuotaDay("2026-10-04", "Not a zone", NOW).error);
  assert.ok(resolveQuotaDay("2026-10-04", "America/NotARealCity", NOW).error);
  assert.ok(resolveQuotaDay("2026-10-04", "../etc", NOW).error);
  assert.equal(dayDistance("2026-10-04", "2026-10-03"), 1);
});

function psql(sql) {
  const db = process.env.QUOTA_DB || "quota_test";
  return new Promise((resolve, reject) => {
    execFile("psql", ["-d", db, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", sql], (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message).trim()));
      else resolve(stdout.trim());
    });
  });
}

function q(sql) {
  return psql(sql).then((text) => JSON.parse(text));
}

test("parallel consumes stop at 10 photos and 20 descriptions", async () => {
  const user = "11111111-1111-4111-8111-111111111111";
  const day = "2026-10-04";
  await psql(`delete from public.ai_usage where user_id = '${user}'`);

  const burst = (kind, n) => Promise.all(
    Array.from({ length: n }, () => q(`select public.consume_ai_quota('${user}', '${day}', '${kind}')`))
  );

  const photos = await burst("photo", 25);
  const allowedPhotos = photos.filter((row) => row.allowed);
  assert.equal(allowedPhotos.length, 10);
  assert.equal(photos.filter((row) => !row.allowed).length, 15);
  assert.ok(allowedPhotos.every((row) => row.limit === 10 && row.used >= 1 && row.used <= 10));
  assert.ok(photos.filter((row) => !row.allowed).every((row) => row.remaining === 0 && row.limit === 10));
  assert.equal(await psql(`select count from public.ai_usage where user_id = '${user}' and day = '${day}' and kind = 'photo'`), "10");

  const describes = await burst("describe", 30);
  assert.equal(describes.filter((row) => row.allowed).length, 20);
  assert.equal(describes.filter((row) => !row.allowed).length, 10);
  assert.ok(describes.every((row) => row.limit === 20));
  const both = await psql(`select kind || ':' || count from public.ai_usage where user_id = '${user}' and day = '${day}' order by kind`);
  assert.equal(both, "describe:20\nphoto:10");

  const released = await q(`select public.release_ai_quota('${user}', '${day}', 'photo')`);
  assert.equal(released.used, 9);
  assert.equal(released.remaining, 1);
  const again = await q(`select public.consume_ai_quota('${user}', '${day}', 'photo')`);
  assert.equal(again.allowed, true);
  assert.equal(again.used, 10);

  const nextDay = await q(`select public.consume_ai_quota('${user}', '2026-10-05', 'photo')`);
  assert.equal(nextDay.allowed, true);
  assert.equal(nextDay.used, 1);

  const status = await q(`select public.ai_quota_status('${user}', '${day}', 'describe')`);
  assert.equal(status.remaining, 0);
  assert.equal(status.limit, 20);

  await assert.rejects(psql(`select public.consume_ai_quota('${user}', '${day}', 'other')`), /bad quota kind/);
});

test("the photo function no longer counts by UTC", () => {
  const src = readFileSync(new URL("../supabase/functions/food-photo/index.ts", import.meta.url), "utf8");
  assert.match(src, /consumeQuota/);
  assert.match(src, /resolveQuotaDay/);
  assert.doesNotMatch(src, /toISOString\(\)\.slice/);
  assert.doesNotMatch(src, /FOOD_DAILY_LIMIT/);
  const ui = readFileSync(new URL("../logger/js/pages/food.js", import.meta.url), "utf8");
  assert.match(ui, /10 food photos a day/);
  assert.match(ui, /photosLeft/);
  assert.match(ui, /left today/);
  assert.match(ui, /aiClock\(\)/);
});
