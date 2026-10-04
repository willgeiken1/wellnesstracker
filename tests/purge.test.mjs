import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { applyPurges, buildExportFiles, stripRange, toCsv, unionPurges, zipStore } from "../logger/js/shared/purge.js";

function sample() {
  return {
    sessions: [
      { id: "s1", date: "2026-09-01", name: "Push", entries: [{ exercise: "Bench", sets: [{ w: 100, r: 5 }] }] },
      { id: "s2", date: "2026-10-02", name: "Push", entries: [{ exercise: "Bench", sets: [{ w: 105, r: 5 }] }] },
    ],
    deleted: [],
    food: {
      days: { "2026-09-01": [{ id: "f1", name: "Oats", meal: "breakfast", base: { kcal: 300, p: 10, c: 50, f: 5 }, servings: 1 }] },
      saved: [{ id: "fav", name: "Shake" }],
      deleted: [],
      targets: { auto: true },
    },
    cardio: { sessions: [{ id: "c1", date: "2026-09-01" }, { id: "c2", date: "2026-10-02" }], deleted: [] },
    measurements: { "2026-09-01": { vals: { waist: 70 } }, "2026-10-01": { vals: { waist: 69 } } },
    profile: { weighIns: [{ date: "2026-09-01", kg: 70 }, { date: "2026-10-01", kg: 69 }], wDel: [] },
    plan: { "2026-09-01": "push", "2026-10-03": "push" },
    oura: { days: { "2026-09-01": { readiness: 80 }, "2026-10-02": { readiness: 90 } } },
    checkins: [{ id: "k1", date: "2026-09-01", note: "tired" }, { id: "k2", date: "2026-10-02", note: "good" }],
    checkinDeleted: [],
    purges: [],
  };
}

test("stripRange removes only the dates inside the range and can run twice", () => {
  const data = sample();
  assert.equal(stripRange(data, "2026-09-01", "2026-09-30"), true);
  assert.deepEqual(data.sessions.map((s) => s.id), ["s2"]);
  assert.deepEqual(data.deleted, ["s1"]);
  assert.equal(data.food.days["2026-09-01"], undefined);
  assert.deepEqual(data.food.deleted, ["f1"]);
  assert.equal(data.food.saved.length, 1);
  assert.deepEqual(data.cardio.sessions.map((s) => s.id), ["c2"]);
  assert.equal(data.measurements["2026-09-01"], undefined);
  assert.equal(data.measurements["2026-10-01"].vals.waist, 69);
  assert.deepEqual(data.profile.weighIns.map((w) => w.date), ["2026-10-01"]);
  assert.ok(data.profile.wDel.includes("2026-09-01"));
  assert.deepEqual(data.plan, { "2026-10-03": "push" });
  assert.equal(data.oura.days["2026-09-01"], undefined);
  assert.equal(data.oura.days["2026-10-02"].readiness, 90);
  assert.deepEqual(data.checkins.map((c) => c.id), ["k2"]);
  assert.deepEqual(data.checkinDeleted, ["k1"]);
  assert.equal(stripRange(data, "2026-09-01", "2026-09-30"), false);
});

test("applyPurges strips merged copies without dropping the purge record", () => {
  const data = sample();
  data.purges = [{ from: "2026-09-01", to: "2026-09-30", at: 1, synced: true }];
  applyPurges(data);
  assert.equal(data.sessions.length, 1);
  assert.equal(data.purges.length, 1);
  assert.equal(data.updatedAt, undefined);
});

test("unionPurges keeps one record per range", () => {
  const u = unionPurges(
    [{ from: "2026-09-01", to: "2026-09-02", at: 1, synced: false }],
    [{ from: "2026-09-01", to: "2026-09-02", at: 5, synced: true }, { from: "bad", to: "2026-01-01" }]
  );
  assert.equal(u.length, 1);
  assert.equal(u[0].synced, true);
  assert.equal(u[0].at, 5);
});

test("csv escapes quotes and the zip round-trips", async () => {
  assert.equal(toCsv([["a,b", 'say "hi"']]), '"a,b","say ""hi"""\r\n');
  const files = buildExportFiles(sample(), { photos: [{ id: "p1", date: "2026-09-01", pose: "Front", at: "t" }] });
  const names = files.map((f) => f.name);
  for (const n of ["about.txt", "sets.csv", "food.csv", "oura_days.csv", "photos.csv", "checkins.csv"]) assert.ok(names.includes(n));
  const sets = files.find((f) => f.name === "sets.csv").text;
  assert.match(sets, /2026-09-01/);
  assert.match(sets, /Bench/);
  const blob = zipStore(files);
  const dir = mkdtempSync(join(tmpdir(), "insight-zip-"));
  const zipPath = join(dir, "out.zip");
  writeFileSync(zipPath, Buffer.from(await blob.arrayBuffer()));
  execFileSync("unzip", ["-t", zipPath]);
  execFileSync("unzip", ["-o", zipPath, "-d", dir]);
  assert.match(readFileSync(join(dir, "food.csv"), "utf8"), /Oats/);
  assert.match(readFileSync(join(dir, "about.txt"), "utf8"), /Anthropic|estimate/i);
});
