import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { app } from "../logger/js/runtime.js";
import "../logger/js/shared/analyze.js";
import {
  addDays,
  confidenceOf,
  correlate,
  effect,
  extractDays,
  studentP,
  welch,
} from "../logger/js/shared/correlate.js";

function dateAt(i, start = "2026-01-05") {
  return addDays(start, i);
}

function fill(n, assign, start) {
  const days = {};
  for (let i = 0; i < n; i++) days[dateAt(i, start)] = assign(i);
  return days;
}

/* 0,1 workout, 2,3 rest, repeating. Lag 1 is independent of lag 0. */
function worked(i) {
  return i % 4 < 2;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rnd) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function legacyEffect(perfs, valueOf, buckets) {
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  return buckets.map((b) => {
    const xs = perfs.filter((p) => {
      const v = valueOf(p.date);
      return v != null && b.test(v);
    }).map((p) => p.perf);
    return { label: b.label, avg: avg(xs), n: xs.length };
  });
}

test("student's t and Welch's test match known values", () => {
  assert.ok(Math.abs(studentP(2.085963447, 20) - 0.05) < 0.001);
  assert.ok(Math.abs(studentP(2.228138852, 10) - 0.05) < 0.001);
  assert.equal(studentP(0, 20), 1);
  assert.equal(studentP(Infinity, 20), 0);

  const flat = welch([5, 5, 5, 5, 5, 5, 5], [5, 5, 5, 5, 5, 5, 5]);
  assert.equal(flat.diff, 0);
  assert.equal(flat.p, 1);

  const split = welch([1, 2, 2, 3, 1, 2, 2], [8, 9, 9, 10, 8, 9, 9]);
  assert.ok(split.diff < 0);
  assert.ok(split.p < 0.001);
});

test("effect() bucket averages stay the same for the Insights screen", () => {
  const perfs = [
    { date: "2026-01-01", perf: 2 },
    { date: "2026-01-02", perf: 4 },
    { date: "2026-01-03", perf: -1 },
    { date: "2026-01-04", perf: 8 },
    { date: "2026-01-05", perf: 1.5 },
  ];
  const valueOf = (d) => ({ "2026-01-01": 60, "2026-01-02": 90, "2026-01-03": 72, "2026-01-04": 88, "2026-01-05": null })[d];
  const buckets = [
    { label: "Readiness < 70", test: (v) => v < 70 },
    { label: "70–84", test: (v) => v >= 70 && v < 85 },
    { label: "85+", test: (v) => v >= 85 },
    { label: "Under 6.5h", test: (v) => v < 6.5 },
  ];
  const rows = effect(perfs, valueOf, buckets);
  assert.deepEqual(rows, legacyEffect(perfs, valueOf, buckets));
  assert.equal(rows[0].label, "Readiness < 70");
  assert.equal(rows[0].n, 1);
  assert.equal(rows[0].avg, 2);
  assert.equal(rows[1].n, 1);
  assert.equal(rows[1].avg, -1);
  assert.equal(rows[2].n, 2);
  assert.equal(rows[2].avg, 6);
  assert.equal(rows[3].n, 0);
  assert.equal(rows[3].avg, null);
  assert.deepEqual(app.effect(perfs, valueOf, buckets), rows);
});

test("a planted next-day effect is found and worded in plain language", () => {
  const days = fill(48, (i) => {
    const row = { workedOut: worked(i) };
    if (i > 0) row.readiness = worked(i - 1) ? 53 : 50;
    return row;
  });
  const hit = correlate({ days }).find((r) => r.factor === "workedOut" && r.outcome === "readiness" && r.lag === 1);
  assert.ok(hit);
  assert.equal(hit.nWith, 24);
  assert.equal(hit.nWithout, 23);
  assert.equal(hit.percent, 6);
  assert.equal(hit.confidence, "high");
  assert.equal(hit.sentence, "On days after you work out, your readiness is 6% higher (high confidence, 24 days).");

  const sameDay = correlate({ days }).find((r) => r.factor === "workedOut" && r.outcome === "readiness" && r.lag === 0);
  assert.equal(sameDay.confidence, "low");
});

test("lag 0 and lag 1 do not borrow each other's effect", () => {
  const days = fill(48, (i) => ({ workedOut: worked(i), readiness: worked(i) ? 53 : 50 }));
  const rows = correlate({ days });
  const same = rows.find((r) => r.factor === "workedOut" && r.outcome === "readiness" && r.lag === 0);
  const next = rows.find((r) => r.factor === "workedOut" && r.outcome === "readiness" && r.lag === 1);
  assert.equal(same.sentence, "On days you work out, your readiness is 6% higher (high confidence, 24 days).");
  assert.equal(next.confidence, "low");
  assert.ok(Math.abs(next.percent) < 1);

  const lower = fill(48, (i) => {
    const row = { workedOut: worked(i) };
    if (i > 0) row.readiness = worked(i - 1) ? 47 : 50;
    return row;
  });
  const down = correlate({ days: lower }).find((r) => r.factor === "workedOut" && r.outcome === "readiness" && r.lag === 1);
  assert.equal(down.sentence, "On days after you work out, your readiness is 6% lower (high confidence, 24 days).");
});

test("noise does not produce a confident result", () => {
  const rnd = mulberry32(11);
  const days = fill(48, () => ({
    readiness: 75 + gauss(rnd) * 6,
    steps: 8000 + gauss(rnd) * 1800,
  }));
  const rows = correlate({ days }).filter((r) => r.outcome === "readiness" || r.outcome === "steps");
  assert.ok(rows.length > 0);
  assert.ok(rows.every((r) => r.confidence === "low"));
  assert.ok(rows.every((r) => Math.abs(r.effect) < 0.8));
});

test("groups smaller than 7 days are dropped", () => {
  const thin = fill(26, (i) => ({ workedOut: i < 6, readiness: i < 6 ? 90 : 60 }));
  assert.equal(correlate({ days: thin }).some((r) => r.factor === "workedOut"), false);

  const enough = fill(14, (i) => ({ workedOut: i < 7, readiness: i < 7 ? 90 : 60 }));
  const hit = correlate({ days: enough }).find((r) => r.factor === "workedOut" && r.outcome === "readiness" && r.lag === 0);
  assert.ok(hit);
  assert.equal(hit.nWith, 7);
  assert.equal(hit.nWithout, 7);
  assert.equal(hit.confidence, "medium");
});

test("missing outcomes and missing factors are skipped, not treated as zero", () => {
  const holes = fill(30, (i) => {
    const workedOut = i % 2 === 0;
    const row = { workedOut };
    if (i % 7 !== 0) row.readiness = workedOut ? 80 : 70;
    return row;
  });
  const hit = correlate({ days: holes }).find((r) => r.factor === "workedOut" && r.outcome === "readiness" && r.lag === 0);
  assert.ok(hit);
  assert.equal(hit.nWith, 12);
  assert.ok(hit.diff > 5);

  const absent = {};
  for (let i = 0; i < 30; i++) {
    const row = { readiness: i < 10 ? 90 : 70 };
    if (i < 20) row.workedOut = i < 10;
    absent[dateAt(i)] = row;
  }
  const kept = correlate({ days: absent }).find((r) => r.factor === "workedOut" && r.outcome === "readiness" && r.lag === 0);
  assert.equal(kept.nWith, 10);
  assert.equal(kept.nWithout, 10);
  assert.ok(Math.abs(kept.meanWith - 90) < 1e-9);
  assert.ok(Math.abs(kept.meanWithout - 70) < 1e-9);

  const blank = fill(20, () => ({ workedOut: true }));
  assert.equal(correlate({ days: blank }).length, 0);
});

test("circular pairs are left out, and median versus tertile keeps the stronger split", () => {
  const days = fill(40, (i) => {
    const high = i % 2 === 0;
    return {
      calories: high ? 3200 : 1800,
      caloriesOverTarget: high,
      protein: 140 + (i % 5) * 3,
      workedOut: high,
      workoutVolume: high ? 12000 : 0,
      readiness: 70 + (i % 7),
    };
  });
  const rows = correlate({ days });
  assert.equal(rows.some((r) => r.outcome === "calories" && (r.factor === "caloriesOverTarget" || r.source === "calories")), false);
  assert.equal(rows.some((r) => r.factor === "workedOut" && r.outcome === "workoutVolume"), false);
  assert.equal(rows.some((r) => r.source === "workoutVolume" && r.outcome === "workoutVolume"), false);
  assert.ok(rows.some((r) => r.factor === "caloriesOverTarget" && r.outcome === "protein"));

  const sleep = fill(42, (i) => ({
    sleepHours: 6 + (i % 3) * 1.2,
    readiness: 60 + (i % 3) * 12 + (i % 2),
  }));
  const splits = correlate({ days: sleep }).filter((r) => r.source === "sleepHours" && r.outcome === "readiness" && r.lag === 0);
  assert.equal(splits.length, 1);
  assert.ok(splits[0].kind === "median" || splits[0].kind === "tertile");
});

test("a stronger effect ranks above a weaker one", () => {
  const days = fill(42, (i) => ({
    boost: i % 2 === 0,
    meh: i % 3 === 0,
    readiness: (i % 2 === 0 ? 88 : 58) + (i % 5) * 0.4,
    sleepScore: (i % 3 === 0 ? 72 : 70) + (i % 4) * 0.2,
  }));
  const rows = correlate({ days, phrases: { boost: "you push hard", meh: "you take it easy" } });
  const strong = rows.find((r) => r.factor === "boost" && r.outcome === "readiness" && r.lag === 0);
  const weak = rows.find((r) => r.factor === "meh" && r.outcome === "sleepScore" && r.lag === 0);
  assert.ok(strong.strength > weak.strength);
  assert.ok(rows.indexOf(strong) < rows.indexOf(weak));
  assert.match(strong.sentence, /^On days you push hard, your readiness is \d+% higher \(high confidence, 21 days\)\.$/);
});

test("user data becomes daily factors, including late meals and targets", () => {
  const { days, phrases } = extractDays({
    sessions: [
      {
        date: "2026-03-02",
        finishedAt: "2026-03-02T18:00:00",
        workoutId: "push",
        name: "Push",
        entries: [{ sets: [{ w: 100, r: 8, tag: "warmup" }, { w: 100, r: 5 }, { w: 100, r: 5 }] }],
      },
      {
        date: "2026-03-02",
        finishedAt: "2026-03-02T19:00:00",
        workoutId: "push",
        name: "Push",
        entries: [{ sets: [{ w: 40, r: 10 }] }],
      },
      { date: "2026-03-01", entries: [{ sets: [{ w: 200, r: 5 }] }] },
    ],
    oura: {
      days: {
        "2026-03-01": { readiness: 80, total: 8 * 3600, deep: 3600, rem: 5400, steps: 12000, sleepScore: 88, hrv: 55, rhr: 50, temp: 0.1, activityScore: 90 },
        "2026-03-02": { readiness: 70, total: 6 * 3600, steps: 4000, awake: 1800 },
      },
    },
    food: {
      days: {
        "2026-03-01": [{ base: { kcal: 2000, p: 100, c: 200, f: 60 }, servings: 1, at: "2026-03-01T18:00:00" }],
        "2026-03-02": [{ base: { kcal: 1500, p: 100, c: 150, f: 40 }, servings: 2, at: "2026-03-02T21:15:00" }],
      },
      targets: { kcal: 2500, p: 150, c: 250, f: 70 },
    },
    profile: { weighIns: [{ date: "2026-03-01", kg: 81.2 }] },
    cardio: { sessions: [{ date: "2026-03-02", kcal: 240, segments: [{ min: 20 }, { min: 5 }] }] },
    measurements: { "2026-03-01": { vals: { waist: 84, arms: 35 }, at: 1 } },
    checkins: [{ date: "2026-03-01", mood: 2, energy: 7, note: "tired" }],
  });

  const rest = days["2026-03-01"];
  const train = days["2026-03-02"];
  assert.equal(rest.workedOut, false);
  assert.equal(rest.readiness, 80);
  assert.equal(rest.sleepHours, 8);
  assert.equal(rest.deepHours, 1);
  assert.equal(rest.steps, 12000);
  assert.equal(rest.activityScore, 90);
  assert.equal(rest.calories, 2000);
  assert.equal(rest.proteinOverTarget, false);
  assert.equal(rest.lateEating, false);
  assert.equal(rest.weight, 81.2);
  assert.equal(rest.waist, 84);
  assert.equal(rest.didCardio, false);
  assert.equal(rest.checkin_energy, 7);
  assert.equal(rest.checkin_mood, undefined);
  assert.equal(rest.mood, undefined);
  assert.equal(train.workedOut, true);
  assert.equal(train.workoutVolume, 1400);
  assert.equal(train["workout:push"], true);
  assert.equal(rest["workout:push"], undefined);
  assert.equal(train.calories, 3000);
  assert.equal(train.protein, 200);
  assert.equal(train.proteinOverTarget, true);
  assert.equal(train.caloriesOverTarget, true);
  assert.equal(train.lateEating, true);
  assert.equal(train.cardioMin, 25);
  assert.equal(train.cardioKcal, 240);
  assert.equal(train.awakeMin, 30);
  assert.equal(phrases["workout:push"], "you do a push workout");

  const noClock = extractDays({
    foodDays: { "2026-05-01": [{ base: { kcal: 500, p: 20, c: 40, f: 10 }, servings: 1 }] },
    oura: { "2026-05-01": { readiness: 60, total: 20000 } },
  });
  assert.equal(noClock.days["2026-05-01"].lateEating, undefined);
  assert.equal(noClock.days["2026-05-01"].proteinOverTarget, undefined);
});

test("confidence rises only when the sample and the test both support it", () => {
  assert.equal(confidenceOf(0.01, 20, 18), "high");
  assert.equal(confidenceOf(0.01, 8, 12), "medium");
  assert.equal(confidenceOf(0.08, 12, 12), "medium");
  assert.equal(confidenceOf(0.2, 30, 30), "low");
  assert.equal(confidenceOf(0.01, 6, 40), null);
});

test("a full month of series stays on the device and finishes quickly", () => {
  const rnd = mulberry32(3);
  const days = fill(120, (i) => ({
    readiness: 70 + gauss(rnd) * 8,
    sleepHours: 7 + gauss(rnd) * 0.8,
    sleepScore: 75 + gauss(rnd) * 8,
    steps: 9000 + gauss(rnd) * 2500,
    hrv: 55 + gauss(rnd) * 8,
    rhr: 54 + gauss(rnd) * 3,
    calories: 2600 + gauss(rnd) * 300,
    protein: 160 + gauss(rnd) * 25,
    carbs: 280 + gauss(rnd) * 40,
    fat: 75 + gauss(rnd) * 12,
    workedOut: i % 2 === 0,
    workoutVolume: i % 2 === 0 ? 9000 + rnd() * 2000 : undefined,
  }));
  const started = performance.now();
  const rows = correlate({ days });
  assert.ok(performance.now() - started < 250);
  assert.ok(rows.length > 0);
  rows.forEach((r) => {
    assert.ok(r.nWith >= 7 && r.nWithout >= 7);
    assert.match(r.sentence, /\((low|medium|high) confidence, \d+ days\)\.$/);
  });
});

test("the Insights screen still calls effect(), and the engine does not phone home", () => {
  const insights = readFileSync(new URL("../logger/js/pages/insights.js", import.meta.url), "utf8");
  const analyze = readFileSync(new URL("../logger/js/shared/analyze.js", import.meta.url), "utf8");
  const engine = readFileSync(new URL("../logger/js/shared/correlate.js", import.meta.url), "utf8");
  const sw = readFileSync(new URL("../logger/sw.js", import.meta.url), "utf8");
  const brief = readFileSync(new URL("../logger/js/shared/brief.js", import.meta.url), "utf8");
  assert.match(insights, /app\.effect\(/);
  assert.match(brief, /app\.effect\(/);
  assert.match(analyze, /bucketEffect/);
  assert.match(analyze, /app\.correlations/);
  assert.doesNotMatch(engine, /posthog|sentry|sendBeacon|fetch\(/i);
  assert.match(sw, /insight-shell-v14/);
  assert.match(sw, /js\/shared\/correlate\.js/);
});
