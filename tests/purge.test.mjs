import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { applyPurges, buildExportFiles, mergeWeighIns, notePurge, stripRange, toCsv, unionPurges, zipStore } from "../logger/js/shared/purge.js";

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
    const cutoff = resolveCutoff(blob, "2026-10-01", "2026-10-04", deletedAt);
    let out = addPurge(stripRange(blob, "2026-10-01", "2026-10-04", cutoff), "2026-10-01", "2026-10-04", cutoff);
    out = addPurge(stripRange(out, "2026-10-01", "2026-10-04", resolveCutoff(out, "2026-10-01", "2026-10-04", deletedAt)), "2026-10-01", "2026-10-04", deletedAt);
    const backfillAt = Date.parse("2026-10-04T15:00:00Z");
    const oldRange = {
      sessions: [{ id: "back-wo", date: "2026-09-15", startedAt: "2026-09-15T17:00:00", mod: backfillAt }],
      food: { days: { "2026-09-15": [{ id: "back-meal", at: "2026-09-15T08:00:00.000Z", updatedAt: new Date(backfillAt).toISOString() }] }, deleted: [] },
      purges: [{ from: "2026-09-01", to: "2026-09-30", at: Date.parse("2026-10-01T00:00:00Z"), deletedAt: Date.parse("2026-10-01T00:00:00Z") }],
    };
    const back = stripRange(oldRange, "2026-09-01", "2026-09-30", resolveCutoff(oldRange, "2026-09-01", "2026-09-30", null));
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
    const stripped = stripRange(structuredClone(blob), "2026-10-01", "2026-10-04", resolveCutoff(blob, "2026-10-01", "2026-10-04", deletedAt));
    const kept = stripRange(structuredClone({
      profile: { weighIns: [{ date: "2026-10-04", kg: 68, at: loggedAt }], wDel: ["2026-10-04"], wDelAt: {} },
      purges: blob.purges,
    }), "2026-10-01", "2026-10-04", deletedAt);
    const now = Date.parse("2026-10-04T15:00:00Z");
    const clamped = resolveCutoff({ purges: [] }, "2026-10-01", "2026-10-04", Date.parse("2030-01-01T00:00:00Z"), now);
    const cutoff = deletedAt;
    const photos = [
      { id: "old", path: "u/old.jpg", taken_at: new Date(cutoff - 1000).toISOString() },
      { id: "same", path: "u/same.jpg", taken_at: new Date(cutoff).toISOString() },
      { id: "new", path: "u/new.jpg", taken_at: new Date(cutoff + 1000).toISOString() },
      { id: "blank", path: "u/blank.jpg", taken_at: null },
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
    const good = await deleteRange(okAdmin, "user-1", { from: "2026-10-01", to: "2026-10-04", deletedAt: cutoff });
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
    const failed = await deleteRange(failAdmin, "user-1", { from: "2026-10-01", to: "2026-10-04", deletedAt: cutoff });
    console.log(JSON.stringify({
      cardio: stripped.cardio.sessions.map((s) => s.id),
      weigh: stripped.profile.weighIns.map((w) => w.date),
      tomb: stripped.profile.wDelAt["2026-10-04"],
      manualDel,
      keptWeigh: kept.profile.weighIns.map((w) => w.date),
      keptTomb: kept.profile.wDel.includes("2026-10-04"),
      clamped,
      cap: now + 60_000,
      dueOld: photoDue(photos[0].taken_at, cutoff),
      dueNew: photoDue(photos[2].taken_at, cutoff),
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
  assert.equal(got.clamped, got.cap);
  assert.equal(got.dueOld, true);
  assert.equal(got.dueNew, false);
  assert.equal(got.status, 200);
  assert.equal(got.goodRpc, "purge_user_range_rows");
  assert.deepEqual(got.removed.sort(), ["u/blank.jpg", "u/old.jpg", "u/same.jpg"]);
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
      { id: "old", path: "u/old.jpg", taken_at: new Date(T - 1000).toISOString() },
      { id: "new", path: "u/new.jpg", taken_at: new Date(T + 60_000).toISOString() },
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
  assert.deepEqual(got.removed, ["u/old.jpg"]);
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
