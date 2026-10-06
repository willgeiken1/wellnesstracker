import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { applyPurges, buildExportFiles, mergeWeighIns, notePurge, stripProfileClockFields, stripRange, toCsv, unionPurges, weighBeatsTombstone, zipStore } from "../logger/js/shared/purge.js";

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

test("unionPurges keeps one record per range and the later delete time", () => {
  const u = unionPurges(
    [{ from: "2026-09-01", to: "2026-09-02", at: 1, synced: false }],
    [{ from: "2026-09-01", to: "2026-09-02", at: 5, deletedAt: 9, synced: true }, { from: "bad", to: "2026-01-01" }]
  );
  assert.equal(u.length, 1);
  assert.equal(u[0].synced, true);
  assert.equal(u[0].at, 9);
  assert.equal(u[0].deletedAt, 9);
});

test("marking a purge synced does not move deletedAt", () => {
  const list = notePurge([], "2026-10-01", "2026-10-04", false, 1_000);
  notePurge(list, "2026-10-01", "2026-10-04", true, 5_000);
  assert.equal(list[0].deletedAt, 1_000);
  assert.equal(list[0].synced, true);
  notePurge(list, "2026-10-01", "2026-10-04", false, 9_000);
  assert.equal(list[0].deletedAt, 9_000);
  assert.equal(list[0].synced, false);
});

/* What sync does: merge the saved purge back onto this phone and apply it again. */
function syncAgain(data) {
  data.purges = unionPurges(data.purges, data.purges.map((p) => ({ ...p, synced: true })));
  applyPurges(data);
  return data;
}

test("delete then log then sync keeps the new workout and meal", () => {
  const deletedAt = Date.parse("2026-10-04T12:00:00Z");
  const data = sample();
  data.sessions.push({ id: "old-wo", date: "2026-10-04", mod: deletedAt - 60_000, entries: [{ exercise: "Squat", sets: [{ w: 80, r: 5 }] }] });
  data.food.days["2026-10-04"] = [{ id: "old-meal", name: "Eggs", at: new Date(deletedAt - 60_000).toISOString() }];
  assert.equal(stripRange(data, "2026-10-01", "2026-10-04"), true);
  data.purges = notePurge(data.purges, "2026-10-01", "2026-10-04", true, deletedAt);
  assert.equal(data.sessions.some((s) => s.id === "old-wo"), false);
  assert.equal(data.food.days["2026-10-04"], undefined);

  const loggedAt = deletedAt + 60_000;
  data.sessions.push({
    id: "new-wo",
    date: "2026-10-04",
    startedAt: new Date(loggedAt).toISOString(),
    mod: loggedAt,
    entries: [{ exercise: "Bench", sets: [{ w: 100, r: 5, at: new Date(loggedAt).toISOString() }] }],
  });
  data.food.days["2026-10-04"] = [{ id: "new-meal", name: "Lunch", at: new Date(loggedAt).toISOString() }];
  syncAgain(data);
  syncAgain(data);
  assert.deepEqual(data.sessions.map((s) => s.id), ["s1", "new-wo"]);
  assert.deepEqual(data.food.days["2026-10-04"].map((e) => e.id), ["new-meal"]);
  assert.equal(data.deleted.includes("new-wo"), false);
  assert.equal(data.food.deleted.includes("new-meal"), false);
  assert.equal(data.purges[0].deletedAt, deletedAt);
});

test("backfill inside an old range keeps logs made after the delete", () => {
  const deletedAt = Date.parse("2026-10-01T00:00:00Z");
  const loggedAt = Date.parse("2026-10-04T15:00:00Z");
  const data = sample();
  stripRange(data, "2026-09-01", "2026-09-30");
  data.purges = notePurge([], "2026-09-01", "2026-09-30", true, deletedAt);
  data.sessions.push(
    {
      id: "back-wo",
      date: "2026-09-15",
      startedAt: "2026-09-15T17:00:00",
      finishedAt: "2026-09-15T18:00:00",
      mod: loggedAt,
      entries: [{ exercise: "Squat", sets: [{ w: 100, r: 5, at: new Date(loggedAt).toISOString() }] }],
    },
    { id: "resurrected", date: "2026-09-10", mod: deletedAt - 1000, entries: [{ exercise: "Row", sets: [{ w: 40, r: 8 }] }] }
  );
  data.food.days["2026-09-15"] = [{ id: "back-meal", name: "Oats", at: "2026-09-15T08:00:00.000Z", updatedAt: new Date(loggedAt).toISOString() }];
  data.cardio.sessions.push(
    { id: "back-cardio", date: "2026-09-15", loggedAt, finishedAt: "2026-09-15T12:00:00" },
    { id: "old-cardio", date: "2026-09-20", finishedAt: "2026-09-20T12:00:00" }
  );
  data.measurements["2026-09-15"] = { vals: { waist: 70 }, at: loggedAt };
  data.plan["2026-09-15"] = "push";
  data.planAt = { "2026-09-15": loggedAt, "2026-09-01": deletedAt - 1 };
  data.plan["2026-09-01"] = "pull";
  syncAgain(data);
  assert.equal(data.sessions.some((s) => s.id === "back-wo"), true);
  assert.equal(data.sessions.some((s) => s.id === "resurrected"), false);
  assert.equal(data.sessions.some((s) => s.id === "s1"), false);
  assert.deepEqual(data.food.days["2026-09-15"].map((e) => e.id), ["back-meal"]);
  assert.equal(data.food.days["2026-09-01"], undefined);
  assert.deepEqual(data.cardio.sessions.map((s) => s.id).sort(), ["back-cardio", "c2"]);
  assert.equal(data.measurements["2026-09-15"].vals.waist, 70);
  assert.equal(data.measurements["2026-09-01"], undefined);
  assert.equal(data.plan["2026-09-15"], "push");
  assert.equal(data.plan["2026-09-01"], undefined);
  assert.equal(data.plan["2026-10-03"], "push");
});

test("the edge strip keeps logs after deletedAt and does not move it on retry", () => {
  const stripUrl = new URL("../supabase/functions/_shared/strip.ts", import.meta.url).href;
  const script = `
    import { addPurge, resolveCutoff, stripRange } from ${JSON.stringify(stripUrl)};
    const now = Date.parse("2026-10-04T18:00:00Z");
    const deletedAt = Date.parse("2026-10-04T12:00:00Z");
    const loggedAt = deletedAt + 60_000;
    const blob = {
      sessions: [
        { id: "old-wo", date: "2026-10-04", mod: deletedAt - 1000 },
        { id: "new-wo", date: "2026-10-04", mod: loggedAt, startedAt: new Date(loggedAt).toISOString() },
      ],
      deleted: [],
      food: { days: { "2026-10-04": [
        { id: "old-meal", at: new Date(deletedAt - 1000).toISOString() },
        { id: "new-meal", at: new Date(loggedAt).toISOString() },
      ] }, deleted: [] },
      purges: [{ from: "2026-10-01", to: "2026-10-04", at: deletedAt, deletedAt, synced: false }],
    };
    const cutoff = resolveCutoff(blob, "2026-10-01", "2026-10-04", deletedAt, now);
    let out = addPurge(stripRange(blob, "2026-10-01", "2026-10-04", cutoff, now), "2026-10-01", "2026-10-04", cutoff, now);
    out = addPurge(stripRange(out, "2026-10-01", "2026-10-04", resolveCutoff(out, "2026-10-01", "2026-10-04", deletedAt, now), now), "2026-10-01", "2026-10-04", deletedAt, now);
    const backfillAt = Date.parse("2026-10-04T15:00:00Z");
    const oldRange = {
      sessions: [{ id: "back-wo", date: "2026-09-15", startedAt: "2026-09-15T17:00:00", mod: backfillAt }],
      food: { days: { "2026-09-15": [{ id: "back-meal", at: "2026-09-15T08:00:00.000Z", updatedAt: new Date(backfillAt).toISOString() }] }, deleted: [] },
      purges: [{ from: "2026-09-01", to: "2026-09-30", at: Date.parse("2026-10-01T00:00:00Z"), deletedAt: Date.parse("2026-10-01T00:00:00Z") }],
    };
    const back = stripRange(oldRange, "2026-09-01", "2026-09-30", resolveCutoff(oldRange, "2026-09-01", "2026-09-30", null, now), now);
    console.log(JSON.stringify({
      cutoff,
      sessions: out.sessions.map((s) => s.id),
      meals: (out.food.days["2026-10-04"] || []).map((e) => e.id),
      deletedAt: out.purges[0].deletedAt,
      backSessions: back.sessions.map((s) => s.id),
      backMeals: (back.food.days["2026-09-15"] || []).map((e) => e.id),
    }));
  `;
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const line = r.stdout.trim().split("\n").pop();
  const got = JSON.parse(line);
  assert.equal(got.cutoff, Date.parse("2026-10-04T12:00:00Z"));
  assert.deepEqual(got.sessions, ["new-wo"]);
  assert.deepEqual(got.meals, ["new-meal"]);
  assert.equal(got.deletedAt, Date.parse("2026-10-04T12:00:00Z"));
  assert.deepEqual(got.backSessions, ["back-wo"]);
  assert.deepEqual(got.backMeals, ["back-meal"]);
});

test("a weigh-in deleted after the range delete does not come back", () => {
  const deletedAt = Date.parse("2026-10-04T12:00:00Z");
  const loggedAt = deletedAt + 60_000;
  const manualDel = loggedAt + 60_000;
  const purges = notePurge([], "2026-10-01", "2026-10-04", true, deletedAt);
  const phoneB = {
    weighIns: [{ date: "2026-10-04", kg: 68, at: loggedAt }, { date: "2026-08-01", kg: 80, at: 1 }],
    wDel: ["2026-10-04"],
    updatedAt: loggedAt,
  };
  const phoneA = {
    weighIns: [{ date: "2026-08-01", kg: 80, at: 1 }],
    wDel: ["2026-10-04", "2026-08-01"],
    wDelAt: { "2026-10-04": manualDel },
    updatedAt: manualDel,
  };
  const merged = mergeWeighIns(phoneB, phoneA, purges);
  assert.equal(merged.weighIns.some((w) => w.date === "2026-10-04"), false);
  assert.equal(merged.weighIns.some((w) => w.date === "2026-08-01"), false);
  assert.ok(merged.wDel.includes("2026-10-04"));
  assert.ok(merged.wDel.includes("2026-08-01"));
  assert.equal(merged.wDelAt["2026-10-04"], manualDel);

  const data = sample();
  data.purges = purges;
  data.profile = merged;
  applyPurges(data);
  assert.equal(data.profile.weighIns.some((w) => w.date === "2026-10-04"), false);
  assert.ok(data.profile.wDel.includes("2026-10-04"));
  assert.equal(data.profile.wDelAt["2026-10-04"], manualDel);

  const relogged = mergeWeighIns(
    { weighIns: [{ date: "2026-10-04", kg: 67, at: manualDel + 1000 }], wDel: [], wDelAt: {}, updatedAt: manualDel + 1000 },
    data.profile,
    purges
  );
  assert.equal(relogged.weighIns.find((w) => w.date === "2026-10-04").kg, 67);
  assert.equal(relogged.wDel.includes("2026-10-04"), false);
  assert.equal(relogged.wDelAt["2026-10-04"], undefined);

  const kept = sample();
  kept.purges = purges;
  kept.profile.weighIns.push({ date: "2026-10-04", kg: 68, at: loggedAt });
  kept.profile.wDel = ["2026-10-04"];
  applyPurges(kept);
  assert.equal(kept.profile.weighIns.find((w) => w.date === "2026-10-04").kg, 68);
  assert.equal(kept.profile.wDel.includes("2026-10-04"), false);
});

test("re-logging a weigh-in beats a legacy wDel still on the other phone", () => {
  const entryAt = Date.parse("2026-10-04T15:00:00Z");
  const legacy = { weighIns: [], wDel: ["2026-10-04"], updatedAt: entryAt - 5000 };
  const phoneA = {
    weighIns: [{ date: "2026-10-04", kg: 68, at: entryAt }],
    wDel: [],
    wDelAt: { "2026-10-04": entryAt - 1 },
    updatedAt: entryAt,
  };
  const phoneB = { weighIns: [], wDel: ["2026-10-04"], updatedAt: legacy.updatedAt };
  const onB = mergeWeighIns(phoneB, phoneA, []);
  const onA = mergeWeighIns(phoneA, phoneB, []);
  for (const merged of [onA, onB]) {
    assert.equal(merged.weighIns.find((w) => w.date === "2026-10-04").kg, 68);
    assert.equal(merged.wDel.includes("2026-10-04"), false);
  }
});

test("a fast-clock weigh-in delete does not block re-logging", () => {
  const now = Date.parse("2026-10-04T16:00:00Z");
  const fast = now + 86_400_000;
  const date = "2026-10-04";
  const deleted = { weighIns: [], wDel: [date], wDelAt: { [date]: fast }, updatedAt: fast };
  const relogged = {
    weighIns: [{ date, kg: 68, at: now }],
    wDel: [],
    wDelAt: { [date]: now - 1 },
    updatedAt: now,
  };
  for (const merged of [mergeWeighIns(relogged, deleted, [], now), mergeWeighIns(deleted, relogged, [], now)]) {
    assert.equal(merged.weighIns.find((w) => w.date === date).kg, 68);
    assert.equal(merged.wDel.includes(date), false);
    assert.equal(merged.wDelAt[date], now - 1);
    assert.equal(merged.wDelAtRaw[date], fast);
  }
  const tomb = mergeWeighIns({ weighIns: [], wDel: [], updatedAt: now }, deleted, [], now);
  assert.equal(tomb.wDelAt[date], now - 1);
  assert.equal(tomb.wDelAtRaw[date], fast);
});

test("a fast weigh-in delete stays neutralised across later merges", () => {
  const t0 = Date.parse("2026-10-04T16:00:00Z");
  const fastStamp = t0 + 86_400_000;
  const date = "2026-10-04";
  const fast = { weighIns: [], wDel: [date], wDelAt: { [date]: fastStamp }, updatedAt: fastStamp };
  let phone = { weighIns: [], wDel: [], wDelAt: {}, updatedAt: t0 };
  let now = t0;
  phone = mergeWeighIns(phone, fast, [], now);
  assert.equal(phone.wDelAt[date], now - 1);
  assert.equal(phone.wDelAtRaw[date], fastStamp);
  for (let round = 0; round < 2; round++) {
    const relogAt = now + 5_000;
    const relog = {
      weighIns: [{ date, kg: 68 + round, at: relogAt }],
      wDel: [],
      wDelAt: { [date]: relogAt - 1 },
      updatedAt: fastStamp + round + 1,
    };
    phone = mergeWeighIns(phone, relog, [], now);
    assert.equal(phone.weighIns.find((w) => w.date === date).kg, 68 + round);
    now += 3_600_000;
    phone = mergeWeighIns(phone, fast, [], now);
    assert.equal(phone.weighIns.find((w) => w.date === date).kg, 68 + round);
    assert.equal(phone.wDelAt[date], t0 - 1);
    assert.equal(phone.wDelAtRaw[date], fastStamp);
    phone = mergeWeighIns(fast, phone, [], now);
    assert.equal(phone.weighIns.find((w) => w.date === date).kg, 68 + round);
    assert.equal(phone.wDelAt[date], t0 - 1);
  }
});

test("a deletedAt a year ahead does not erase a weigh-in logged now", () => {
  const now = Date.parse("2026-10-04T16:00:00Z");
  const ahead = now + 365 * 24 * 3600 * 1000;
  const yesterday = now - 86_400_000;
  const range = { from: "2026-10-01", to: "2026-10-04" };
  const future = { ...range, at: ahead, deletedAt: ahead, synced: true };
  const real = { ...range, at: yesterday, deletedAt: yesterday, synced: true };
  const keptReal = unionPurges([future], [real], now);
  assert.equal(keptReal.length, 1);
  assert.equal(keptReal[0].deletedAt, yesterday);
  const onlyFuture = unionPurges([future], [], now);
  assert.equal(onlyFuture[0].deletedAt, now - 1);

  const data = sample();
  data.purges = [{ ...future }];
  data.profile.weighIns = [
    { date: "2026-10-04", kg: 70, at: now },
    { date: "2026-10-03", kg: 80, at: now - 86_400_000 },
  ];
  applyPurges(data, now);
  assert.equal(data.profile.weighIns.find((w) => w.kg === 70).at, now);
  assert.equal(data.profile.weighIns.some((w) => w.kg === 80), false);
  assert.equal(data.purges[0].deletedAt, now - 1);
});

test("a phone one day fast loses the weigh-in it logged and then deleted", () => {
  const now = Date.parse("2026-10-04T16:00:00Z");
  const fast = now + 86_400_000;
  const from = "2026-10-01";
  const to = "2026-10-05";
  const data = {
    sessions: [
      { id: "fast-wo", date: "2026-10-05", mod: fast },
      { id: "seen-later", date: "2026-10-04", mod: now },
      { id: "already-there", date: "2026-10-03", mod: now - 86_400_000 },
    ],
    deleted: [],
    profile: {
      weighIns: [
        { date: "2026-10-05", kg: 70, at: fast },
        { date: "2026-10-04", kg: 71, at: now },
        { date: "2026-10-03", kg: 68, at: now - 86_400_000 },
      ],
      wDel: [],
      wDelAt: {},
    },
    purges: [{ from, to, at: fast, deletedAt: fast, synced: true }],
  };
  applyPurges(data, now);
  assert.equal(data.sessions.some((s) => s.id === "fast-wo"), false);
  assert.equal(data.sessions.some((s) => s.id === "seen-later"), true);
  assert.equal(data.sessions.some((s) => s.id === "already-there"), false);
  assert.equal(data.profile.weighIns.some((w) => w.kg === 70), false);
  assert.equal(data.profile.weighIns.find((w) => w.kg === 71).at, now);
  assert.equal(data.profile.weighIns.some((w) => w.kg === 68), false);
  assert.equal(data.purges[0].deletedAt, now - 1);

  const other = {
    sessions: [{ id: "fast-wo", date: "2026-10-05", mod: fast }],
    deleted: [],
    profile: { weighIns: [{ date: "2026-10-05", kg: 70, at: fast }], wDel: [], wDelAt: {} },
    purges: unionPurges([], [{ from, to, at: fast, deletedAt: fast }], now),
  };
  const merged = mergeWeighIns(
    other.profile,
    { weighIns: [], wDel: data.profile.wDel, wDelAt: data.profile.wDelAt, updatedAt: now },
    other.purges,
    now,
  );
  assert.equal(merged.weighIns.some((w) => w.kg === 70), false);
  applyPurges(other, now);
  assert.equal(other.sessions.some((s) => s.id === "fast-wo"), false);

  const skew = {
    sessions: [{ id: "within-minute", date: "2026-10-04", mod: now + 30_000 }],
    deleted: [],
    purges: unionPurges(
      [{ from, to, at: now - 1, deletedAt: now - 1, synced: true }],
      [{ from, to, at: fast, deletedAt: fast }],
      now,
    ),
  };
  applyPurges(skew, now);
  assert.equal(skew.purges[0].deletedAt, now - 1);
  assert.equal(skew.sessions[0].id, "within-minute");
});

test("same-day manual cardio logged before the delete is removed", () => {
  const noon = Date.parse("2026-10-04T12:00:00");
  const deletedAt = noon - 60_000;
  const data = sample();
  data.purges = notePurge([], "2026-10-04", "2026-10-04", true, deletedAt);
  data.cardio.sessions.push(
    { id: "early-manual", date: "2026-10-04", src: "manual", loggedAt: deletedAt - 3600_000, finishedAt: "2026-10-04T12:00:00" },
    { id: "later-manual", date: "2026-10-04", src: "manual", loggedAt: deletedAt + 60_000, finishedAt: "2026-10-04T12:00:00" },
    { id: "unstamped-manual", date: "2026-10-04", src: "manual", finishedAt: new Date(deletedAt + 3600_000).toISOString() },
    { id: "live-early", date: "2026-10-04", src: "live", loggedAt: deletedAt - 1000, finishedAt: new Date(deletedAt + 3600_000).toISOString() }
  );
  applyPurges(data);
  const ids = data.cardio.sessions.map((s) => s.id);
  assert.equal(ids.includes("early-manual"), false);
  assert.equal(ids.includes("unstamped-manual"), false);
  assert.equal(ids.includes("live-early"), false);
  assert.equal(ids.includes("later-manual"), true);
  assert.equal(ids.includes("c2"), true);
});

test("the edge strip matches weigh-in tombstones, manual cardio, photo cutoff, and the clock clamp", () => {
  const [major, minor] = process.versions.node.split(".").map(Number);
  assert.ok(major > 22 || (major === 22 && minor >= 6), `Node ${process.version} cannot run --experimental-strip-types`);
  const stripUrl = new URL("../supabase/functions/_shared/strip.ts", import.meta.url).href;
  const rangeUrl = new URL("../supabase/functions/_shared/range.ts", import.meta.url).href;
  const script = `
    import { photoDue, resolveCutoff, stripRange } from ${JSON.stringify(stripUrl)};
    import { deleteRange } from ${JSON.stringify(rangeUrl)};
    const noon = Date.parse("2026-10-04T12:00:00");
    const deletedAt = noon - 60_000;
    const loggedAt = deletedAt + 60_000;
    const manualDel = loggedAt + 60_000;
    const blob = {
      cardio: { sessions: [
        { id: "early-manual", date: "2026-10-04", src: "manual", loggedAt: deletedAt - 3600_000, finishedAt: "2026-10-04T12:00:00" },
        { id: "later-manual", date: "2026-10-04", src: "manual", loggedAt, finishedAt: "2026-10-04T12:00:00" },
      ], deleted: [] },
      profile: {
        weighIns: [{ date: "2026-10-04", kg: 68, at: loggedAt }],
        wDel: ["2026-10-04"],
        wDelAt: { "2026-10-04": manualDel },
      },
      purges: [{ from: "2026-10-01", to: "2026-10-04", at: deletedAt, deletedAt }],
    };
    const now = Date.parse("2026-10-04T15:00:00Z");
    const stripped = stripRange(structuredClone(blob), "2026-10-01", "2026-10-04", resolveCutoff(blob, "2026-10-01", "2026-10-04", deletedAt, now), now);
    const kept = stripRange(structuredClone({
      profile: { weighIns: [{ date: "2026-10-04", kg: 68, at: loggedAt }], wDel: ["2026-10-04"], wDelAt: {} },
      purges: blob.purges,
    }), "2026-10-01", "2026-10-04", deletedAt, now);
    const clamped = resolveCutoff({ purges: [] }, "2026-10-01", "2026-10-04", Date.parse("2030-01-01T00:00:00Z"), now);
    const cutoff = deletedAt;
    const photos = [
      { id: "old", path: "user-1/old.jpg", taken_at: new Date(cutoff - 1000).toISOString() },
      { id: "same", path: "user-1/same.jpg", taken_at: new Date(cutoff).toISOString() },
      { id: "new", path: "user-1/new.jpg", taken_at: new Date(cutoff + 1000).toISOString() },
      { id: "blank", path: "user-1/blank.jpg", taken_at: null },
    ];
    let removed = null;
    let deletedIds = null;
    let rpc = null;
    const okAdmin = {
      from(table) {
        const api = {
          op: "select",
          select() { api.op = "select"; return api; },
          delete() { api.op = "delete"; return api; },
          eq() { return api; },
          gte() { return api; },
          lte() { return api; },
          in(key, ids) { api.ids = ids; return api; },
          upsert() { return Promise.resolve({ error: null }); },
          maybeSingle() { return Promise.resolve({ data: { data: { purges: [{ from: "2026-10-01", to: "2026-10-04", deletedAt: cutoff }] } }, error: null }); },
          then(resolve, reject) {
            if (table === "progress_photos" && api.op === "delete") deletedIds = api.ids;
            const payload = table === "progress_photos" && api.op === "select" ? { data: photos, error: null } : { error: null };
            return Promise.resolve(payload).then(resolve, reject);
          },
        };
        return api;
      },
      storage: { from() { return { remove(paths) { removed = paths; return Promise.resolve({ error: null }); } }; } },
      rpc(name, args) { rpc = { name, args }; return Promise.resolve({ error: null }); },
    };
    const good = await deleteRange(okAdmin, "user-1", { from: "2026-10-01", to: "2026-10-04", deletedAt: cutoff }, now);
    const goodRemoved = removed;
    const goodIds = deletedIds;
    const goodRpc = rpc && rpc.name;
    removed = null;
    deletedIds = null;
    rpc = null;
    const failAdmin = {
      from(table) {
        const api = {
          op: "select",
          select() { api.op = "select"; return api; },
          delete() { api.op = "delete"; return api; },
          eq() { return api; },
          gte() { return api; },
          lte() { return api; },
          in(key, ids) { api.ids = ids; return api; },
          upsert() { return Promise.resolve({ error: null }); },
          maybeSingle() { return Promise.resolve({ data: { data: { purges: [{ from: "2026-10-01", to: "2026-10-04", deletedAt: cutoff }] } }, error: null }); },
          then(resolve, reject) {
            if (table === "progress_photos" && api.op === "delete") deletedIds = api.ids;
            const payload = table === "progress_photos" && api.op === "select" ? { data: photos, error: null } : { error: null };
            return Promise.resolve(payload).then(resolve, reject);
          },
        };
        return api;
      },
      storage: { from() { return { remove() { return Promise.resolve({ error: { message: "storage down" } }); } }; } },
      rpc() { rpc = true; return Promise.resolve({ error: null }); },
    };
    const failed = await deleteRange(failAdmin, "user-1", { from: "2026-10-01", to: "2026-10-04", deletedAt: cutoff }, now);
    console.log(JSON.stringify({
      cardio: stripped.cardio.sessions.map((s) => s.id),
      weigh: stripped.profile.weighIns.map((w) => w.date),
      tomb: stripped.profile.wDelAt["2026-10-04"],
      manualDel,
      keptWeigh: kept.profile.weighIns.map((w) => w.date),
      keptTomb: kept.profile.wDel.includes("2026-10-04"),
      clamped,
      neutral: now - 1,
      dueOld: photoDue(photos[0].taken_at, cutoff, now),
      dueNew: photoDue(photos[2].taken_at, cutoff, now),
      status: good.status,
      removed: goodRemoved,
      deletedIds: goodIds,
      goodRpc,
      failStatus: failed.status,
      failDeleted: deletedIds,
      failRpc: rpc,
    }));
  `;
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
    env: { ...process.env, TZ: "UTC" },
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const got = JSON.parse(r.stdout.trim().split("\n").pop());
  assert.deepEqual(got.cardio, ["later-manual"]);
  assert.deepEqual(got.weigh, []);
  assert.equal(got.tomb, got.manualDel);
  assert.deepEqual(got.keptWeigh, ["2026-10-04"]);
  assert.equal(got.keptTomb, false);
  assert.equal(got.clamped, got.neutral);
  assert.equal(got.dueOld, true);
  assert.equal(got.dueNew, false);
  assert.equal(got.status, 200);
  assert.equal(got.goodRpc, "purge_user_range_rows");
  assert.deepEqual(got.removed.sort(), ["user-1/blank.jpg", "user-1/old.jpg", "user-1/same.jpg"]);
  assert.deepEqual(got.deletedIds.sort(), ["blank", "old", "same"]);
  assert.equal(got.failStatus, 500);
  assert.equal(got.failDeleted, null);
  assert.equal(got.failRpc, null);
});

test("the server clamp ignores a year-ahead purge and the save reads the blob again", () => {
  const stripUrl = new URL("../supabase/functions/_shared/strip.ts", import.meta.url).href;
  const rangeUrl = new URL("../supabase/functions/_shared/range.ts", import.meta.url).href;
  const script = `
    import { addPurge } from ${JSON.stringify(stripUrl)};
    import { deleteRange } from ${JSON.stringify(rangeUrl)};
    const now = Date.parse("2026-10-04T16:00:00Z");
    const ahead = now + 365 * 24 * 3600 * 1000;
    const yesterday = now - 86_400_000;
    const withReal = addPurge(
      { purges: [{ from: "2026-10-01", to: "2026-10-04", at: ahead, deletedAt: ahead }] },
      "2026-10-01", "2026-10-04", yesterday, now
    );
    const onlyFuture = addPurge(
      { purges: [{ from: "2026-10-01", to: "2026-10-04", at: ahead, deletedAt: ahead }] },
      "2026-10-01", "2026-10-04", undefined, now
    );
    const T = Date.parse("2026-10-01T00:00:00Z");
    const first = { purges: [{ from: "2026-10-01", to: "2026-10-04", deletedAt: T, at: T }], sessions: [] };
    const second = {
      purges: [{ from: "2026-10-01", to: "2026-10-04", deletedAt: T + 120_000, at: T + 120_000 }],
      sessions: [{ id: "during", date: "2026-10-04", mod: T + 60_000 }],
    };
    let reads = 0;
    let saved = null;
    let removed = null;
    const photos = [
      { id: "old", path: "user-1/old.jpg", taken_at: new Date(T - 1000).toISOString() },
      { id: "new", path: "user-1/new.jpg", taken_at: new Date(T + 60_000).toISOString() },
    ];
    const admin = {
      from(table) {
        const api = {
          op: "select",
          select() { api.op = "select"; return api; },
          delete() { api.op = "delete"; return api; },
          eq() { return api; },
          gte() { return api; },
          lte() { return api; },
          in() { return api; },
          upsert(row) { saved = row; return Promise.resolve({ error: null }); },
          maybeSingle() {
            reads += 1;
            const data = reads === 1 ? first : second;
            return Promise.resolve({ data: { data }, error: null });
          },
          then(resolve, reject) {
            const payload = table === "progress_photos" && api.op === "select" ? { data: photos, error: null } : { error: null };
            return Promise.resolve(payload).then(resolve, reject);
          },
        };
        return api;
      },
      storage: { from() { return { remove(paths) { removed = paths; return Promise.resolve({ error: null }); } }; } },
      rpc() { return Promise.resolve({ error: null }); },
    };
    const res = await deleteRange(admin, "user-1", { from: "2026-10-01", to: "2026-10-04", deletedAt: T });
    console.log(JSON.stringify({
      keptReal: withReal.purges[0].deletedAt,
      onlyFuture: onlyFuture.purges[0].deletedAt,
      status: res.status,
      reads,
      sessions: (saved.data.sessions || []).map((s) => s.id),
      removed,
    }));
  `;
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
    env: { ...process.env, TZ: "UTC" },
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const got = JSON.parse(r.stdout.trim().split("\n").pop());
  assert.equal(got.keptReal, Date.parse("2026-10-04T16:00:00Z") - 86_400_000);
  assert.equal(got.onlyFuture, Date.parse("2026-10-04T16:00:00Z") - 1);
  assert.equal(got.status, 200);
  assert.equal(got.reads, 2);
  assert.deepEqual(got.sessions, ["during"]);
  assert.deepEqual(got.removed, ["user-1/old.jpg"]);
});

test("a phone one day fast loses the photo and weigh-in on the server", () => {
  const rangeUrl = new URL("../supabase/functions/_shared/range.ts", import.meta.url).href;
  const script = `
    import { deleteRange } from ${JSON.stringify(rangeUrl)};
    const now = Date.parse("2026-10-04T16:00:00Z");
    const fast = now + 86_400_000;
    const from = "2026-10-01";
    const to = "2026-10-05";
    const blob = {
      sessions: [
        { id: "fast-wo", date: "2026-10-05", mod: fast },
        { id: "seen-later", date: "2026-10-04", mod: now },
        { id: "already-there", date: "2026-10-03", mod: now - 86_400_000 },
      ],
      profile: {
        weighIns: [
          { date: "2026-10-05", kg: 70, at: fast },
          { date: "2026-10-04", kg: 71, at: now },
          { date: "2026-10-03", kg: 68, at: now - 86_400_000 },
        ],
        wDel: [],
        wDelAt: {},
      },
      purges: [],
    };
    const photos = [
      { id: "fast", path: "user-1/fast.jpg", taken_at: new Date(fast).toISOString() },
      { id: "now", path: "user-1/now.jpg", taken_at: new Date(now).toISOString() },
      { id: "old", path: "user-1/old.jpg", taken_at: new Date(now - 86_400_000).toISOString() },
    ];
    let reads = 0;
    let saved = null;
    let removed = null;
    let deletedIds = null;
    const admin = {
      from(table) {
        const api = {
          op: "select",
          select() { api.op = "select"; return api; },
          delete() { api.op = "delete"; return api; },
          eq() { return api; },
          gte() { return api; },
          lte() { return api; },
          in(key, ids) { api.ids = ids; return api; },
          upsert(row) { saved = row; return Promise.resolve({ error: null }); },
          maybeSingle() {
            reads += 1;
            return Promise.resolve({ data: { data: structuredClone(blob) }, error: null });
          },
          then(resolve, reject) {
            if (table === "progress_photos" && api.op === "delete") deletedIds = api.ids;
            const payload = table === "progress_photos" && api.op === "select" ? { data: photos, error: null } : { error: null };
            return Promise.resolve(payload).then(resolve, reject);
          },
        };
        return api;
      },
      storage: { from() { return { remove(paths) { removed = paths; return Promise.resolve({ error: null }); } }; } },
      rpc() { return Promise.resolve({ error: null }); },
    };
    const res = await deleteRange(admin, "user-1", { from, to, deletedAt: fast }, now);
    const weigh = (saved.data.profile.weighIns || []).map((w) => w.kg);
    console.log(JSON.stringify({
      status: res.status,
      reads,
      deletedAt: saved.data.purges[0].deletedAt,
      sessions: (saved.data.sessions || []).map((s) => s.id),
      weigh,
      removed,
      deletedIds,
    }));
  `;
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
    env: { ...process.env, TZ: "UTC" },
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const got = JSON.parse(r.stdout.trim().split("\n").pop());
  const now = Date.parse("2026-10-04T16:00:00Z");
  assert.equal(got.status, 200);
  assert.equal(got.reads, 2);
  assert.equal(got.deletedAt, now - 1);
  assert.deepEqual(got.sessions, ["seen-later"]);
  assert.deepEqual(got.weigh, [71]);
  assert.deepEqual(got.removed.sort(), ["user-1/fast.jpg", "user-1/old.jpg"]);
  assert.deepEqual(got.deletedIds.sort(), ["fast", "old"]);
});

test("a repeat delete from a fast clock removes logs made since the earlier delete", () => {
  const rangeUrl = new URL("../supabase/functions/_shared/range.ts", import.meta.url).href;
  const script = `
    import { deleteRange } from ${JSON.stringify(rangeUrl)};
    const now = Date.parse("2026-10-04T16:00:00Z");
    const stored = now - 7 * 86_400_000;
    const logged = now - 2 * 86_400_000;
    const fast = now + 86_400_000;
    const from = "2026-09-01";
    const to = "2026-10-05";
    const blob = {
      sessions: [],
      profile: {
        weighIns: [
          { date: "2026-10-02", kg: 70, at: logged },
          { date: "2026-10-04", kg: 71, at: now },
        ],
        wDel: [],
        wDelAt: {},
      },
      purges: [{ from, to, at: stored, deletedAt: stored, synced: true }],
    };
    const photos = [
      { id: "two", path: "user-1/two.jpg", taken_at: new Date(logged).toISOString() },
      { id: "now", path: "user-1/now.jpg", taken_at: new Date(now).toISOString() },
    ];
    let saved = null;
    let removed = null;
    let deletedIds = null;
    const admin = {
      from(table) {
        const api = {
          op: "select",
          select() { api.op = "select"; return api; },
          delete() { api.op = "delete"; return api; },
          eq() { return api; },
          gte() { return api; },
          lte() { return api; },
          in(key, ids) { api.ids = ids; return api; },
          upsert(row) { saved = row; return Promise.resolve({ error: null }); },
          maybeSingle() { return Promise.resolve({ data: { data: structuredClone(blob) }, error: null }); },
          then(resolve, reject) {
            if (table === "progress_photos" && api.op === "delete") deletedIds = api.ids;
            const payload = table === "progress_photos" && api.op === "select" ? { data: photos, error: null } : { error: null };
            return Promise.resolve(payload).then(resolve, reject);
          },
        };
        return api;
      },
      storage: { from() { return { remove(paths) { removed = paths; return Promise.resolve({ error: null }); } }; } },
      rpc() { return Promise.resolve({ error: null }); },
    };
    const res = await deleteRange(admin, "user-1", { from, to, deletedAt: fast }, now);
    console.log(JSON.stringify({
      status: res.status,
      deletedAt: saved.data.purges[0].deletedAt,
      weigh: (saved.data.profile.weighIns || []).map((w) => w.kg),
      removed,
      deletedIds,
    }));
  `;
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
    env: { ...process.env, TZ: "UTC" },
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const got = JSON.parse(r.stdout.trim().split("\n").pop());
  const now = Date.parse("2026-10-04T16:00:00Z");
  assert.equal(got.status, 200);
  assert.equal(got.deletedAt, now - 1);
  assert.deepEqual(got.weigh, [71]);
  assert.deepEqual(got.removed, ["user-1/two.jpg"]);
  assert.deepEqual(got.deletedIds, ["two"]);
});

test("a purge removes only the caller's own photo path and still deletes the rows", () => {
  const rangeUrl = new URL("../supabase/functions/_shared/range.ts", import.meta.url).href;
  const script = `
    import { deleteRange } from ${JSON.stringify(rangeUrl)};
    const now = Date.parse("2026-10-04T16:00:00Z");
    const taken = new Date(now - 86_400_000).toISOString();
    const photos = [
      { id: "ok", path: "user-1/ok.jpg", taken_at: taken },
      { id: "foreign", path: "user-2/secret.jpg", taken_at: taken },
      { id: "traversal", path: "user-1/../user-2/secret.jpg", taken_at: taken },
      { id: "slash", path: "/user-1/ok.jpg", taken_at: taken },
      { id: "backslash", path: "user-1\\\\ok.jpg", taken_at: taken },
      { id: "dots", path: "user-1/..", taken_at: taken },
      { id: "dot", path: "user-1/.", taken_at: taken },
      { id: "empty", path: "user-1/", taken_at: taken },
      { id: "nested", path: "user-1/a/b.jpg", taken_at: taken },
    ];
    let removed = null;
    let deletedIds = null;
    const admin = {
      from(table) {
        const api = {
          op: "select",
          select() { api.op = "select"; return api; },
          delete() { api.op = "delete"; return api; },
          eq() { return api; },
          gte() { return api; },
          lte() { return api; },
          in(key, ids) { api.ids = ids; return api; },
          upsert() { return Promise.resolve({ error: null }); },
          maybeSingle() { return Promise.resolve({ data: { data: { purges: [] } }, error: null }); },
          then(resolve, reject) {
            if (table === "progress_photos" && api.op === "delete") deletedIds = api.ids;
            const payload = table === "progress_photos" && api.op === "select" ? { data: photos, error: null } : { error: null };
            return Promise.resolve(payload).then(resolve, reject);
          },
        };
        return api;
      },
      storage: { from() { return { remove(paths) { removed = paths; return Promise.resolve({ error: null }); } }; } },
      rpc() { return Promise.resolve({ error: null }); },
    };
    const res = await deleteRange(admin, "user-1", { from: "2026-10-01", to: "2026-10-04", deletedAt: now - 1000 }, now);
    console.log(JSON.stringify({ status: res.status, removed, deletedIds }));
  `;
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
    env: { ...process.env, TZ: "UTC" },
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const got = JSON.parse(r.stdout.trim().split("\n").pop());
  assert.equal(got.status, 200);
  assert.deepEqual(got.removed, ["user-1/ok.jpg"]);
  assert.deepEqual(got.deletedIds.sort(), ["backslash", "dot", "dots", "empty", "foreign", "nested", "ok", "slash", "traversal"]);
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

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function profileSig(p) {
  const weigh = [...(p.weighIns || [])]
    .map((w) => [w.date, w.kg, w.at])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const wDel = [...(p.wDel || [])].sort();
  const wDelAt = {};
  const wDelAtRaw = {};
  for (const k of Object.keys(p.wDelAt || {}).sort()) wDelAt[k] = p.wDelAt[k];
  for (const k of Object.keys(p.wDelAtRaw || {}).sort()) wDelAtRaw[k] = p.wDelAtRaw[k];
  return JSON.stringify({ weigh, wDel, wDelAt, wDelAtRaw });
}

test("a fast delete stays hidden when that phone is pulled again", () => {
  const now = Date.parse("2026-10-04T16:00:00Z");
  const date = "2026-10-04";
  const F = now + 86_400_000;
  const B = { weighIns: [], wDel: [date], wDelAt: { [date]: F }, updatedAt: F };
  let A = mergeWeighIns({ weighIns: [], wDel: [], updatedAt: now }, B, [], now);
  assert.equal(A.weighIns.length, 0);
  assert.equal(A.wDelAt[date], now - 1);
  assert.equal(A.wDelAtRaw[date], F);
  const relogAt = now + 5000;
  A = mergeWeighIns(A, {
    weighIns: [{ date, kg: 68, at: relogAt }],
    wDel: [],
    wDelAt: { [date]: relogAt - 1 },
    updatedAt: relogAt,
  }, [], now);
  assert.equal(A.weighIns[0].kg, 68);
  A = mergeWeighIns(A, B, [], now + 3_600_000);
  A = mergeWeighIns(A, B, [], now + 86_400_000);
  assert.equal(A.weighIns[0].kg, 68);
  assert.equal(A.wDelAt[date], now - 1);
  assert.equal(A.wDelAtRaw[date], F);
});

test("a stale copy of a deleted weigh-in stays deleted without clock fields", () => {
  const now = Date.parse("2026-10-04T16:00:00Z");
  const date = "2026-10-04";
  const loggedAt = now - 60_000;
  const delAt = now - 1000;
  const deleted = { weighIns: [], wDel: [date], wDelAt: { [date]: delAt }, updatedAt: delAt };
  const stale = { weighIns: [{ date, kg: 70, at: loggedAt }], wDel: [], updatedAt: loggedAt };
  for (const merged of [mergeWeighIns(deleted, stale, [], now), mergeWeighIns(stale, deleted, [], now)]) {
    assert.equal(merged.weighIns.some((w) => w.date === date), false);
    assert.equal(merged.wDel.includes(date), true);
  }
});

test("clock skew fields are dropped on merge and on read", () => {
  const now = Date.parse("2026-10-04T16:00:00Z");
  const date = "2026-10-04";
  const remote = {
    weighIns: [{ date, kg: 70, at: now - 1000 }],
    wDel: [],
    updatedAt: now,
    clocks: [now - 86_400_000, now, now + 86_400_000],
    clockHint: now + 86_400_000,
    skewApplied: 86_400_000,
    skewKnown: true,
  };
  const merged = mergeWeighIns({ weighIns: [], wDel: [], updatedAt: now - 10 }, remote, [], now);
  assert.equal(merged.weighIns[0].kg, 70);
  assert.equal(merged.weighIns[0].at, now - 1000);
  for (const k of ["clocks", "clockHint", "skewApplied", "skewKnown"]) assert.equal(Object.hasOwn(merged, k), false);
  const data = { profile: { ...remote }, purges: [] };
  applyPurges(data, now);
  for (const k of ["clocks", "clockHint", "skewApplied", "skewKnown"]) assert.equal(Object.hasOwn(data.profile, k), false);
  assert.equal(stripProfileClockFields({ clocks: [1], name: "A" }), true);
});

test("a future re-log does not skip a purge cutoff", () => {
  const now = Date.parse("2026-10-04T16:00:00Z");
  const F = now + 86_400_000;
  const date = "2026-10-05";
  const purges = [{ from: "2026-10-01", to: "2026-10-06", at: now - 1000, deletedAt: now - 1000, synced: true }];
  const x = { date, kg: 70, at: F + 5000 };
  const tomb = { [date]: now - 1 };
  const raw = { [date]: F };
  assert.equal(weighBeatsTombstone([], x, tomb, now, raw), true);
  assert.equal(weighBeatsTombstone(purges, x, tomb, now, raw), false);
  const data = {
    profile: { weighIns: [x], wDel: [date], wDelAt: { ...tomb }, wDelAtRaw: { ...raw } },
    purges: purges.map((p) => ({ ...p })),
  };
  applyPurges(data, now);
  assert.equal(data.profile.weighIns.length, 0);
});

test("an older app's second future delete does not block a later re-log", () => {
  const t0 = Date.parse("2026-10-04T16:00:00Z");
  const date = "2026-10-04";
  const F = t0 + 86_400_000;
  const F2 = F + 3_600_000;
  let phone = mergeWeighIns(
    { weighIns: [], wDel: [], updatedAt: t0 },
    { weighIns: [], wDel: [date], wDelAt: { [date]: F }, updatedAt: F },
    [],
    t0,
  );
  assert.equal(phone.wDelAtRaw[date], F);
  const oldApp = {
    weighIns: [],
    wDel: [date],
    wDelAt: { [date]: F2 },
    wDelAtRaw: { [date]: F },
    updatedAt: F2,
  };
  const t1 = t0 + 2 * 3_600_000;
  phone = mergeWeighIns(phone, oldApp, [], t1);
  assert.equal(phone.wDelAtRaw[date], F2);
  assert.equal(phone.wDelAt[date], t1 - 1);
  const relogAt = t1 + 5000;
  phone = mergeWeighIns(phone, {
    weighIns: [{ date, kg: 72, at: relogAt }],
    wDel: [],
    wDelAt: { [date]: relogAt - 1 },
    updatedAt: relogAt,
  }, [], t1);
  assert.equal(phone.weighIns.find((w) => w.date === date).kg, 72);
  const t2 = t1 + 3_600_000;
  phone = mergeWeighIns(phone, oldApp, [], t2);
  assert.equal(phone.weighIns.find((w) => w.date === date).kg, 72);
  assert.equal(phone.wDelAt[date], t1 - 1);
  assert.equal(phone.wDelAtRaw[date], F2);
});

test("a re-add marker is not stored as a raw future delete", () => {
  const now = Date.parse("2026-10-04T16:00:00Z");
  const F = now + 86_400_000;
  const date = "2026-10-05";
  const fast = {
    weighIns: [{ date, kg: 71, at: F }],
    wDel: [],
    wDelAt: { [date]: F - 1 },
    updatedAt: F,
  };
  const merged = mergeWeighIns({ weighIns: [], wDel: [], updatedAt: now }, fast, [], now);
  assert.equal(merged.wDelAtRaw[date], undefined);
  assert.equal(merged.weighIns.find((w) => w.date === date).kg, 71);
  const data = {
    profile: { ...fast, wDelAt: { [date]: F - 1 }, wDelAtRaw: {} },
    purges: [],
  };
  stripRange(data, "2026-10-01", "2026-10-06", { before: now - 1000, now, quiet: true });
  assert.equal(data.profile.wDelAtRaw[date], undefined);
  assert.equal(data.profile.weighIns.length, 0);
});

test("an older future delete does not raise a cutoff that already has a newer raw", () => {
  const now = Date.parse("2026-10-04T16:00:00Z");
  const date = "2026-10-04";
  const older = now + 86_400_000;
  const newer = older + 3_600_000;
  const stored = {
    weighIns: [{ date, kg: 71, at: now + 5_000 }],
    wDel: [],
    wDelAt: { [date]: now - 1 },
    wDelAtRaw: { [date]: newer },
    updatedAt: now,
  };
  const again = {
    weighIns: [],
    wDel: [date],
    wDelAt: { [date]: older },
    updatedAt: older,
  };
  const merged = mergeWeighIns(stored, again, [], now + 2 * 86_400_000);
  assert.equal(merged.wDelAt[date], now - 1);
  assert.equal(merged.wDelAtRaw[date], newer);
  assert.equal(merged.weighIns.find((w) => w.date === date).kg, 71);
});

test("a stored cutoff that matches a re-add marker keeps its raw", () => {
  const now = Date.parse("2026-10-04T16:00:00Z");
  const date = "2026-10-04";
  const at = now - 5_000;
  const raw = now + 86_400_000;
  const stored = {
    weighIns: [{ date, kg: 80, at }],
    wDel: [date],
    wDelAt: { [date]: at - 1 },
    wDelAtRaw: { [date]: raw },
    updatedAt: now,
  };
  const plainFuture = {
    weighIns: [],
    wDel: [date],
    wDelAt: { [date]: raw },
    updatedAt: raw,
  };
  const merged = mergeWeighIns(stored, plainFuture, [], now);
  assert.equal(merged.wDelAt[date], at - 1);
  assert.equal(merged.wDelAtRaw[date], raw);
  assert.equal(merged.weighIns.find((w) => w.date === date).kg, 80);

  const data = { profile: structuredClone(stored) };
  stripRange(data, "2026-10-01", "2026-10-06", { before: at - 2, now, quiet: true });
  assert.equal(data.profile.wDelAt[date], at - 1);
  assert.equal(data.profile.wDelAtRaw[date], raw);
  assert.equal(data.profile.weighIns.find((w) => w.date === date).kg, 80);
});

test("a weigh-in ahead of this clock does not skip a purge cutoff", () => {
  const now = Date.parse("2026-10-04T16:00:00Z");
  const F = now + 86_400_000;
  const date = "2026-10-05";
  const purges = [{ from: "2026-10-01", to: "2026-10-06", at: now - 1000, deletedAt: now - 1000, synced: true }];
  const writer = {
    weighIns: [{ date, kg: 70, at: F + 5000 }],
    wDel: [],
    wDelAt: { [date]: F + 4999 },
    updatedAt: F + 5000,
  };
  const merged = mergeWeighIns({ weighIns: [], wDel: [], updatedAt: now }, writer, purges, now);
  assert.equal(merged.weighIns.find((w) => w.date === date), undefined);
});

test("a slower phone agrees with the writer after its clock catches up", () => {
  const now = Date.parse("2026-10-04T16:00:00Z");
  const date = "2026-10-04";
  const stamp = now + 6 * 3_600_000;
  const day = 86_400_000;
  const writer = {
    weighIns: [{ date, kg: 81.1, at: stamp }],
    wDel: [],
    wDelAt: { [date]: stamp - 1 },
    updatedAt: stamp,
  };
  const slow = {
    weighIns: [],
    wDel: [date],
    wDelAt: { [date]: now - day },
    updatedAt: now - day,
  };
  let onSlow = mergeWeighIns(slow, writer, [], now - 3_600_000);
  let onWriter = mergeWeighIns(writer, slow, [], stamp);
  const later = now + 5 * day;
  for (let pass = 0; pass < 4; pass++) {
    const nextSlow = mergeWeighIns(onSlow, onWriter, [], later - 3_600_000);
    const nextWriter = mergeWeighIns(onWriter, onSlow, [], later);
    onSlow = nextSlow;
    onWriter = nextWriter;
  }
  assert.equal(profileSig(onSlow), profileSig(onWriter));
  assert.equal(onSlow.weighIns.find((w) => w.date === date).kg, 81.1);
  assert.equal(onWriter.weighIns.find((w) => w.date === date).kg, 81.1);
});

test("a slow clock does not move a cutoff that was already neutralised", () => {
  const now = Date.parse("2026-10-04T16:00:00Z");
  const F = now + 86_400_000;
  const date = "2026-10-04";
  const stored = {
    weighIns: [],
    wDel: [date],
    wDelAt: { [date]: now - 1 },
    wDelAtRaw: { [date]: F },
    updatedAt: now,
  };
  const slowNow = now - 86_400_000;
  const merged = mergeWeighIns({ weighIns: [], wDel: [], updatedAt: slowNow }, stored, [], slowNow);
  assert.equal(merged.wDelAt[date], now - 1);
  assert.equal(merged.wDelAtRaw[date], F);
});

test("client and server strip the same weigh-in tombs", () => {
  const stripUrl = new URL("../supabase/functions/_shared/strip.ts", import.meta.url).href;
  const now = Date.parse("2026-10-04T16:00:00Z");
  const F = now + 86_400_000;
  const cases = {
    futureTombOnly: {
      profile: {
        weighIns: [],
        wDel: ["2026-10-04"],
        wDelAt: { "2026-10-04": F },
        clocks: [1],
        clockHint: F,
        skewApplied: 1,
        skewKnown: true,
      },
    },
    rawStored: {
      profile: {
        weighIns: [{ date: "2026-10-04", kg: 68, at: now + 5000 }],
        wDel: [],
        wDelAt: { "2026-10-04": now - 1 },
        wDelAtRaw: { "2026-10-04": F },
      },
    },
    readdMarkerFuture: {
      profile: {
        weighIns: [{ date: "2026-10-05", kg: 71, at: F }],
        wDel: [],
        wDelAt: { "2026-10-05": F - 1 },
      },
    },
    markerShapedRaw: {
      profile: {
        weighIns: [{ date: "2026-10-04", kg: 80, at: now }],
        wDel: ["2026-10-04"],
        wDelAt: { "2026-10-04": now - 1 },
        wDelAtRaw: { "2026-10-04": F },
      },
    },
    oldRowNoRaw: {
      profile: {
        weighIns: [{ date: "2026-10-03", kg: 60, at: now - 86_400_000 }],
        wDel: ["2026-10-03"],
        wDelAt: { "2026-10-03": now - 1000 },
      },
    },
  };
  const before = now - 1000;
  const client = {};
  for (const [name, blob] of Object.entries(cases)) {
    const data = structuredClone(blob);
    stripRange(data, "2026-10-01", "2026-10-06", { before, now, quiet: true });
    client[name] = {
      weigh: (data.profile.weighIns || []).map((w) => [w.date, w.kg, w.at]),
      wDelAt: data.profile.wDelAt || {},
      wDelAtRaw: data.profile.wDelAtRaw || {},
      clockFields: ["clocks", "clockHint", "skewApplied", "skewKnown"].filter((k) => Object.hasOwn(data.profile, k)),
    };
  }
  const script = `
    import { stripRange } from ${JSON.stringify(stripUrl)};
    const now = ${now};
    const F = ${F};
    const before = ${before};
    const cases = ${JSON.stringify(cases)};
    const out = {};
    for (const [name, blob] of Object.entries(cases)) {
      const data = stripRange(structuredClone(blob), "2026-10-01", "2026-10-06", before, now);
      out[name] = {
        weigh: (data.profile.weighIns || []).map((w) => [w.date, w.kg, w.at]),
        wDelAt: data.profile.wDelAt || {},
        wDelAtRaw: data.profile.wDelAtRaw || {},
        clockFields: ["clocks", "clockHint", "skewApplied", "skewKnown"].filter((k) => Object.hasOwn(data.profile, k)),
      };
    }
    console.log(JSON.stringify(out));
  `;
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const server = JSON.parse(r.stdout.trim().split("\n").pop());
  assert.deepEqual(server, client);
  assert.equal(client.futureTombOnly.wDelAt["2026-10-04"], now - 1);
  assert.equal(client.futureTombOnly.wDelAtRaw["2026-10-04"], F);
  assert.deepEqual(client.futureTombOnly.clockFields, []);
  assert.equal(client.rawStored.weigh.length, 1);
  assert.equal(client.rawStored.wDelAt["2026-10-04"], now - 1);
  assert.equal(client.rawStored.wDelAtRaw["2026-10-04"], F);
  assert.equal(client.readdMarkerFuture.weigh.length, 0);
  assert.equal(client.readdMarkerFuture.wDelAtRaw["2026-10-05"], undefined);
  assert.equal(client.markerShapedRaw.weigh.length, 1);
  assert.equal(client.markerShapedRaw.wDelAt["2026-10-04"], now - 1);
  assert.equal(client.markerShapedRaw.wDelAtRaw["2026-10-04"], F);
  assert.equal(client.oldRowNoRaw.weigh.length, 0);
  assert.equal(client.oldRowNoRaw.wDelAtRaw["2026-10-03"], undefined);
  assert.equal(client.oldRowNoRaw.wDelAt["2026-10-03"], now - 1000);
});

const DAY = 86_400_000;
const HOUR = 3_600_000;
const SKEW_SEEDS = [1, 7, 42, 99, 20261004, 8675309, 123456, 31337];
const SKEW_ROUNDS = 40;
const SKEW_CHOICES = [-2 * DAY, -DAY, -6 * HOUR, -HOUR, -90 * 60_000, -45 * 60_000, 0, 45 * 60_000, HOUR, 6 * HOUR, DAY, 2 * DAY];

function clusterSkew(rnd, n) {
  const skews = [];
  for (let i = 0; i < n; i++) {
    if (rnd() < 0.35) {
      const sign = rnd() < 0.5 ? -1 : 1;
      skews.push(sign * Math.floor(rnd() * 2.5 * DAY));
    } else skews.push(SKEW_CHOICES[Math.floor(rnd() * SKEW_CHOICES.length)]);
  }
  return skews;
}

/* Phones can disagree while one clock is still behind. Five days later they
   must agree, clock-skew fields must be gone, and re-merging a stored raw must
   not move the cutoff. The real-time resurrection oracle lives in
   weigh-sync-sim.test.mjs. */
function runSkewCluster(seed, skews, rounds) {
  const rnd = mulberry32(seed);
  const start = Date.parse("2026-06-15T12:00:00Z");
  let real = start;
  const dates = [0, 1, 2, 3].map((i) => new Date(start + i * DAY).toISOString().slice(0, 10));
  const phones = skews.map((skew) => ({
    skew,
    profile: { weighIns: [], wDel: [], wDelAt: {}, wDelAtRaw: {}, updatedAt: start },
  }));
  const events = [];
  const log = (phone, date) => {
    const at = real + phone.skew;
    const kg = Math.round((70 + rnd() * 20) * 10) / 10;
    const p = phone.profile;
    const frozen = p.wDelAtRaw && typeof p.wDelAtRaw[date] === "number"
      && typeof (p.wDelAt && p.wDelAt[date]) === "number" && p.wDelAt[date] < at;
    p.weighIns = [...(p.weighIns || []).filter((w) => w.date !== date), { date, kg, at }];
    p.wDel = (p.wDel || []).filter((d) => d !== date);
    if (!frozen) p.wDelAt = { ...(p.wDelAt || {}), [date]: at - 1 };
    p.updatedAt = Math.max(p.updatedAt || 0, at);
    events.push({ type: "log", date, real, at, kg, skew: phone.skew });
  };
  const del = (phone, date) => {
    const at = real + phone.skew;
    const p = phone.profile;
    p.weighIns = (p.weighIns || []).filter((w) => w.date !== date);
    if (!(p.wDel || []).includes(date)) p.wDel = [...(p.wDel || []), date];
    p.wDelAt = { ...(p.wDelAt || {}), [date]: at };
    if (p.wDelAtRaw && p.wDelAtRaw[date] != null) {
      const next = { ...p.wDelAtRaw };
      delete next[date];
      p.wDelAtRaw = next;
    }
    p.updatedAt = Math.max(p.updatedAt || 0, at);
    events.push({ type: "delete", date, real, at, skew: phone.skew });
  };
  const pull = (dst, src) => {
    dst.profile = mergeWeighIns(dst.profile, src.profile, [], real + dst.skew);
  };
  const fullSync = () => {
    for (let pass = 0; pass < 6; pass++) {
      for (const dst of phones) {
        for (const src of phones) if (dst !== src) pull(dst, src);
      }
    }
    events.push({ type: "sync", real });
  };
  fullSync();
  for (let round = 0; round < rounds; round++) {
    real += 60_000 + Math.floor(rnd() * 4 * HOUR);
    const phone = phones[Math.floor(rnd() * phones.length)];
    const date = dates[Math.floor(rnd() * dates.length)];
    const roll = rnd();
    if (roll < 0.4) log(phone, date);
    else if (roll < 0.75) del(phone, date);
    else {
      const other = phones[Math.floor(rnd() * phones.length)];
      if (other !== phone) {
        pull(phone, other);
        pull(other, phone);
      }
    }
    if (rnd() < 0.35) fullSync();
  }
  fullSync();
  const label = `seed ${seed} skews ${skews.join(",")}`;
  const finalReal = real;
  /* While a phone is still behind, aheadOf can disagree. Five days later every
     stamp from this run is in the past on every phone, and they converge. */
  const later = real + 5 * DAY;
  for (let pass = 0; pass < 6; pass++) {
    for (const dst of phones) {
      for (const src of phones) {
        if (dst !== src) dst.profile = mergeWeighIns(dst.profile, src.profile, [], later + dst.skew);
      }
    }
  }
  const agreed = profileSig(phones[0].profile);
  for (const phone of phones) {
    assert.equal(profileSig(phone.profile), agreed, `${label} phones diverge after the clock catches up`);
    for (const k of ["clocks", "clockHint", "skewApplied", "skewKnown"]) {
      assert.equal(Object.hasOwn(phone.profile, k), false, `${label} kept ${k}`);
    }
  }
  const profile = phones[0].profile;
  for (const date of dates) {
    const ev = events.filter((e) => e.date === date && e.type !== "sync");
    const logs = ev.filter((e) => e.type === "log");
    const deletes = ev.filter((e) => e.type === "delete");
    const have = (profile.weighIns || []).find((w) => w.date === date);
    if (have) {
      assert.ok(logs.some((entry) => entry.kg === have.kg && entry.at === have.at), `${label} ${date} weigh-in was not logged`);
    }
    if (!deletes.length && logs.length) {
      const trusted = logs.filter((e) => Math.abs(e.at - e.real) <= 60_000);
      if (trusted.length) {
        const want = trusted[trusted.length - 1];
        const higher = logs.some((e) => e.at > want.at);
        if (!higher) assert.ok(have && have.kg === want.kg && have.at === want.at, `${label} ${date} trusted log was lost`);
      }
      continue;
    }
    if (!deletes.length) {
      assert.equal(have, undefined, `${label} ${date} invented a weigh-in`);
      continue;
    }
    const lastDel = deletes[deletes.length - 1];
    const lastLog = logs.length ? logs[logs.length - 1] : null;
    const deleteCoversLogs = logs.every((entry) => lastDel.at >= entry.at);
    if (deleteCoversLogs && lastDel.real >= (lastLog ? lastLog.real : 0)) {
      if (have) {
        const raw = profile.wDelAtRaw && profile.wDelAtRaw[date];
        const tomb = profile.wDelAt && profile.wDelAt[date];
        const gap = typeof raw === "number" && typeof tomb === "number" && have.at > tomb && have.at <= raw;
        assert.ok(gap, `${label} ${date} delete came back`);
      }
      continue;
    }
    if (lastLog && lastLog.real > lastDel.real && lastLog.at > Math.max(...deletes.map((d) => d.at)) && Math.abs(lastLog.at - lastLog.real) <= 60_000 && lastLog.at <= finalReal + 60_000 && !logs.some((e) => e.at > lastLog.at)) {
      assert.ok(have && have.kg === lastLog.kg && have.at === lastLog.at, `${label} ${date} trusted log after delete was lost`);
    }
  }
  const frozen = profileSig(profile);
  for (const dst of phones) {
    for (const src of phones) {
      if (dst !== src) dst.profile = mergeWeighIns(dst.profile, src.profile, [], later + DAY + dst.skew);
    }
  }
  for (const phone of phones) assert.equal(profileSig(phone.profile), frozen, `${label} drifted after a later sync`);
  for (const date of dates) {
    const raw = profile.wDelAtRaw && profile.wDelAtRaw[date];
    if (typeof raw !== "number") continue;
    const fast = { weighIns: [], wDel: [date], wDelAt: { [date]: raw }, updatedAt: raw };
    const again = mergeWeighIns(mergeWeighIns(phones[0].profile, fast, [], later), fast, [], later + DAY);
    assert.equal(profileSig(again), profileSig(phones[0].profile), `${label} ${date} neutralised again`);
  }
}

test("random clock skews keep trusted logs, drop trusted deletes, and agree", () => {
  for (const seed of SKEW_SEEDS) {
    runSkewCluster(seed, [-DAY, 0, DAY], SKEW_ROUNDS);
    const rnd = mulberry32(seed ^ 0x9e3779b9);
    runSkewCluster(seed, clusterSkew(rnd, 3), SKEW_ROUNDS);
    runSkewCluster(seed, clusterSkew(rnd, 2), 24);
  }
});
