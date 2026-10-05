import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { app } from "../logger/js/runtime.js";
import "../logger/js/shared/analyze.js";
import {
  DAYS_FOR_A_PATTERN,
  DISPLAY_LIMIT,
  LATE_HOUR,
  addDays,
  benjaminiHochberg,
  confidenceOf,
  detrendDays,
  correlate,
  effect,
  effectiveN,
  extractDays,
  findingsForView,
  loggedDays,
  factorFamily,
  FAMILY_CAP,
  listFindings,
  OUTCOME_CAP,
  pickForToday,
  SEE_ALL_LIMIT,
  splitFindings,
  STORY_CAP,
  storyKey,
  studentP,
  suppressedStory,
  todayLine,
  valenceOf,
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
  assert.ok(Math.abs(hit.percent - 6) < 0.3);
  assert.equal(hit.confidence, "high");
  assert.equal(hit.valence, "good");
  assert.equal(hit.lead, "On days after you work out, your readiness is 6.1% higher.");
  assert.equal(hit.sentence, "On days after you work out, your readiness is 6.1% higher (high confidence, 24 days).");
  assert.doesNotMatch(hit.sentence, /which is a good sign|which is working against you/);

  const sameDay = correlate({ days }).find((r) => r.factor === "workedOut" && r.outcome === "readiness" && r.lag === 0);
  assert.equal(sameDay, undefined);
});

test("lag 0 and lag 1 do not borrow each other's effect", () => {
  const days = fill(48, (i) => ({ workedOut: worked(i), readiness: worked(i) ? 53 : 50 }));
  const rows = correlate({ days });
  const same = rows.find((r) => r.factor === "workedOut" && r.outcome === "readiness" && r.lag === 0);
  const next = rows.find((r) => r.factor === "workedOut" && r.outcome === "readiness" && r.lag === 1);
  assert.equal(same, undefined);
  assert.equal(next.confidence, "low");
  assert.ok(Math.abs(next.percent) < 1);

  const lower = fill(48, (i) => {
    const row = { workedOut: worked(i) };
    if (i > 0) row.readiness = worked(i - 1) ? 47 : 50;
    return row;
  });
  const down = correlate({ days: lower }).find((r) => r.factor === "workedOut" && r.outcome === "readiness" && r.lag === 1);
  assert.equal(down.valence, "bad");
  assert.equal(down.sentence, "On days after you work out, your readiness is 6.1% lower (high confidence, 24 days).");
  assert.doesNotMatch(down.sentence, /working against you/);
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

  const enough = fill(14, (i) => ({ workedOut: i % 2 === 0, weight: i % 2 === 0 ? 82 : 80 }));
  const hit = correlate({ days: enough }, { weightDir: "gain" }).find((r) => r.factor === "workedOut" && r.outcome === "weight" && r.lag === 0);
  assert.ok(hit);
  assert.equal(hit.nWith, 7);
  assert.equal(hit.nWithout, 7);
  assert.equal(hit.confidence, "medium");

  const block = fill(14, (i) => ({ workedOut: i < 7, weight: i < 7 ? 82 : 80 }));
  const blocked = correlate({ days: block }, { weightDir: "gain" }).find((r) => r.factor === "workedOut" && r.outcome === "weight" && r.lag === 0);
  assert.ok(blocked);
  assert.ok(blocked.nEff < 7);
  assert.equal(blocked.confidence, "low");
  assert.equal(findingsForView([blocked]).length, 0);
});

test("missing outcomes and missing factors are skipped, not treated as zero", () => {
  const holes = fill(30, (i) => {
    const long = i % 2 === 0;
    const row = { sleepHours: long ? 8 : 6 };
    if (i % 7 !== 0) row.liftPerf = long ? 8 : 2;
    return row;
  });
  const hit = correlate({ days: holes }).find((r) => (r.source === "sleepHours" && r.outcome === "liftPerf") || (r.source === "liftPerf" && r.outcome === "sleepHours"));
  assert.ok(hit);
  assert.ok(hit.nWith + hit.nWithout <= 25);
  assert.ok(Math.abs(hit.diff) > 1);

  const absent = {};
  for (let i = 0; i < 30; i++) {
    const row = { liftPerf: i < 10 ? 8 : 2 };
    if (i < 20) row.sleepHours = i < 10 ? 8 : 6;
    absent[dateAt(i)] = row;
  }
  const kept = correlate({ days: absent }).find((r) => r.source === "sleepHours" && r.outcome === "liftPerf" && r.lag === 0);
  assert.ok(kept);
  assert.ok(kept.nWith <= 10);
  assert.ok(kept.nWithout <= 10);
  assert.ok(kept.nWith + kept.nWithout <= 20);
  // The raw step is 8 versus 2. A 29-day window on 30 days removes most of that level change.
  assert.ok(kept.meanWith > kept.meanWithout);

  const blank = fill(20, () => ({ workedOut: true }));
  assert.equal(correlate({ days: blank }).length, 0);
});

test("circular pairs are left out, and median versus tertile keeps the stronger split", () => {
  const days = fill(40, (i) => {
    const high = i % 2 === 0;
    const row = {
      calories: high ? 3200 : 1800,
      caloriesOverTarget: high,
      protein: 140 + (i % 5) * 3,
      workedOut: high,
      workoutVolume: high ? 12000 : 0,
    };
    if (i > 0) row.readiness = (i - 1) % 2 === 0 ? 86 : 60;
    return row;
  });
  const rows = correlate({ days });
  assert.equal(rows.some((r) => r.outcome === "calories" && (r.factor === "caloriesOverTarget" || r.source === "calories")), false);
  assert.equal(rows.some((r) => r.factor === "workedOut" && r.outcome === "workoutVolume"), false);
  assert.equal(rows.some((r) => r.source === "workoutVolume" && r.outcome === "workoutVolume"), false);
  assert.equal(rows.some((r) => r.outcome === "protein" || r.outcome === "calories" || r.outcome === "workoutVolume"), false);
  assert.equal(rows.some((r) => r.factor === "caloriesOverTarget" && r.outcome === "readiness" && r.lag === 0), false);
  assert.ok(rows.some((r) => r.factor === "caloriesOverTarget" && r.outcome === "readiness" && r.lag === 1));

  const sleep = fill(42, (i) => ({
    sleepHours: 6 + (i % 3) * 1.2,
    readiness: 60 + (i % 3) * 12 + (i % 2),
  }));
  const slept = correlate({ days: sleep });
  const sameNight = slept.filter((r) => r.source === "sleepHours" && r.outcome === "readiness" && r.lag === 0);
  assert.equal(sameNight.length, 0);
  const splits = slept.filter((r) => r.lag === 1 && ((r.source === "sleepHours" && r.outcome === "readiness") || (r.source === "readiness" && r.outcome === "sleepHours")));
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
  assert.equal(strong.valence, "good");
  assert.match(strong.sentence, /^On days you push hard, your readiness is \d+% higher \(high confidence, 21 days\)\.$/);
  assert.doesNotMatch(strong.sentence, /which is a good sign/);
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

test("confidence rises only when the adjusted test, the effective sample, and the effect all support it", () => {
  assert.equal(confidenceOf(0.01, 20, 18, 0.8), "high");
  assert.equal(confidenceOf(0.01, 8, 12, 0.8), "medium");
  assert.equal(confidenceOf(0.04, 30, 30, 0.8), "medium");
  assert.equal(confidenceOf(0.08, 30, 30, 1.2), "low");
  assert.equal(confidenceOf(0.2, 30, 30, 1), "low");
  assert.equal(confidenceOf(0.005, 40, 40, 0.2), "low");
  assert.equal(confidenceOf(0.01, 6, 40, 2), null);
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

test("same-night Oura pairs and same-day workout types are filtered out", () => {
  assert.equal(LATE_HOUR, 21);
  assert.equal(DAYS_FOR_A_PATTERN, 14);
  assert.equal(DISPLAY_LIMIT, 5);
  assert.equal(SEE_ALL_LIMIT, 25);

  assert.equal(suppressedStory({ id: "sleepHours", source: "sleepHours" }, "sleepScore", 0, null), true);
  assert.equal(suppressedStory({ id: "hrv", source: "hrv" }, "readiness", 0, null), true);
  assert.equal(suppressedStory({ id: "rhr", source: "rhr" }, "readiness", 0, null), true);
  assert.equal(suppressedStory({ id: "steps", source: "steps" }, "readiness", 0, null), true);
  assert.equal(suppressedStory({ id: "sleepHours", source: "sleepHours" }, "readiness", 1, null), false);
  assert.equal(suppressedStory({ id: "workedOut", source: "workoutVolume" }, "readiness", 0, null), true);
  assert.equal(suppressedStory({ id: "workedOut" }, "hrv", 1, null), false);
  assert.equal(suppressedStory({ id: "workedOut" }, "rhr", 1, null), false);
  assert.equal(suppressedStory({ id: "workedOut" }, "sleepHours", 1, null), false);
  assert.equal(suppressedStory({ id: "workout:legs" }, "workoutVolume", 0, null), true);
  assert.equal(suppressedStory({ id: "workout:legs" }, "liftPerf", 0, null), true);
  assert.equal(suppressedStory({ id: "workout:legs" }, "workoutVolume", 1, null), true);
  assert.equal(suppressedStory({ id: "workout:pull" }, "liftPerf", 1, null), true);
  assert.equal(suppressedStory({ id: "workedOut" }, "liftPerf", 0, null), true);
  assert.equal(suppressedStory({ id: "workedOut" }, "liftPerf", 1, null), true);
  assert.equal(suppressedStory({ id: "workedOut" }, "workoutVolume", 1, null), true);
  assert.equal(suppressedStory({ id: "workout:legs" }, "workout:push", 1, null), true);
  assert.equal(suppressedStory({ id: "workout:legs" }, "readiness", 0, null), true);
  assert.equal(suppressedStory({ id: "workout:legs" }, "readiness", 1, null), false);
  assert.equal(suppressedStory({ id: "workout:legs" }, "sleepScore", 1, null), false);
  const extra = new Set(["activityScore"]);
  assert.equal(suppressedStory({ id: "activityScore", source: "activityScore" }, "readiness", 0, extra), true);
  assert.equal(suppressedStory({ id: "activityScore", source: "activityScore" }, "readiness", 1, extra), false);

  const oura = { days: {} };
  const sessions = [];
  const liftPerf = {};
  for (let i = 0; i < 28; i++) {
    const date = dateAt(i);
    const high = i % 2 === 0;
    oura.days[date] = {
      readiness: high ? 86 : 58,
      sleepScore: high ? 90 : 52,
      total: (high ? 8 : 5.5) * 3600,
      hrv: high ? 72 : 40,
      rhr: high ? 48 : 62,
      steps: high ? 12000 : 4000,
      activityScore: high ? 95 : 40,
    };
    sessions.push({
      date,
      finishedAt: date + "T18:00:00",
      workoutId: high ? "legs" : "push",
      name: high ? "Legs" : "Push",
      entries: [{ sets: [{ w: high ? 200 : 80, r: 5 }, { w: high ? 180 : 70, r: 5 }] }],
    });
    liftPerf[date] = high ? 8 : 1;
  }
  const rows = correlate({ oura, sessions, liftPerf });
  const ouraId = (id) => ["readiness", "sleepScore", "sleepHours", "steps", "hrv", "rhr", "activityScore"].includes(id);
  assert.equal(rows.some((r) => r.lag === 0 && ouraId(r.source || r.factor) && ouraId(r.outcome)), false);
  const dropped = ["lightHours", "remHours", "awakeMin", "temp", "steps", "workoutVolume", "cardioMin", "cardioKcal", "waist", "arms", "chest", "calories", "protein"];
  assert.equal(rows.some((r) => dropped.includes(r.outcome)), false);
  assert.equal(rows.some((r) => r.factor === "workout:legs" && (r.outcome === "workoutVolume" || r.outcome === "liftPerf")), false);
  assert.equal(rows.some((r) => r.factor === "workedOut" && (r.outcome === "workoutVolume" || r.outcome === "liftPerf")), false);
  assert.ok(rows.some((r) => r.lag === 1 && ((r.source === "sleepHours" && r.outcome === "readiness") || (r.source === "readiness" && r.outcome === "sleepHours"))));
  assert.equal(rows.some((r) => r.factor === "workout:legs" && r.outcome === "readiness" && r.lag === 0), false);
  assert.ok(rows.some((r) => r.factor === "workout:legs" && r.outcome === "readiness" && r.lag === 1));
  assert.equal(rows.some((r) => r.outcome === "weight"), false);
  const trained = rows.find((r) => r.factor === "workedOut" && r.outcome === "readiness");
  assert.equal(trained, undefined);

  const rest = correlate({
    oura,
    sessions: sessions.filter((_, i) => i % 2 === 0),
    liftPerf,
  });
  assert.equal(rest.some((r) => r.factor === "workedOut" && r.outcome === "readiness" && r.lag === 0), false);
  const kept = rest.find((r) => r.factor === "workedOut" && r.outcome === "readiness" && r.lag === 1);
  assert.ok(kept);
  assert.equal(kept.valence, "bad");
});

test("a finding is marked good, bad, or neutral from the outcome", () => {
  assert.equal(valenceOf("readiness", 3, 6, null), "good");
  assert.equal(valenceOf("sleepScore", -4, -5, null), "bad");
  assert.equal(valenceOf("hrv", 2, 4, null), "good");
  assert.equal(valenceOf("liftPerf", 1.2, null, null), "good");
  assert.equal(valenceOf("rhr", 4, 8, null), "bad");
  assert.equal(valenceOf("rhr", -3, -6, null), "good");
  assert.equal(valenceOf("awakeMin", 12, 20, null), "bad");
  assert.equal(valenceOf("awakeMin", -8, -15, null), "good");
  assert.equal(valenceOf("steps", 1000, 12, null), "neutral");
  assert.equal(valenceOf("readiness", 0.1, 0.2, null), "neutral");
  assert.equal(valenceOf("weight", 1, 2, null), "neutral");
  assert.equal(valenceOf("weight", 1, 2, "gain"), "good");
  assert.equal(valenceOf("weight", 1, 2, "lose"), "bad");
  assert.equal(valenceOf("weight", -1, -2, "lose"), "good");

  const days = fill(28, (i) => {
    const row = { workedOut: i % 2 === 0, weight: i % 2 === 0 ? 82 : 80 };
    if (i > 0) row.rhr = (i - 1) % 2 === 0 ? 60 : 50;
    return row;
  });
  assert.equal(correlate({ days }).some((r) => r.outcome === "weight"), false);
  const gain = correlate({ days }, { weightDir: "gain" }).find((r) => r.factor === "workedOut" && r.outcome === "weight" && r.lag === 0);
  assert.equal(gain.valence, "good");
  assert.match(gain.lead, /higher\.$/);
  assert.doesNotMatch(gain.lead, /which is a good sign/);
  const lose = correlate({ days }, { weightDir: "lose" }).find((r) => r.factor === "workedOut" && r.outcome === "weight" && r.lag === 0);
  assert.equal(lose.valence, "bad");
  assert.match(lose.sentence, /higher/);
  assert.doesNotMatch(lose.sentence, /working against you/);
  assert.equal(correlate({ days }).find((r) => r.factor === "workedOut" && r.outcome === "rhr" && r.lag === 0), undefined);
  const pulse = correlate({ days }).find((r) => r.factor === "workedOut" && r.outcome === "rhr" && r.lag === 1);
  assert.equal(pulse.valence, "bad");
  assert.match(pulse.lead, /higher\.$/);
  assert.doesNotMatch(pulse.lead, /working against you/);

  const strong = fill(20, (i) => ({ sleptWell: i % 2 === 0, liftPerf: i % 2 === 0 ? 4.82 : 0 }));
  const lift = correlate({ days: strong, phrases: { sleptWell: "you sleep well" } }).find((r) => r.factor === "sleptWell" && r.outcome === "liftPerf" && r.lag === 0);
  assert.equal(lift.lead, "On days you sleep well, your strength is 4.9 percentage points higher.");
  assert.match(lift.sentence, /4\.9 percentage points higher \(/);
  assert.match(todayLine({ ...lift, because: "yesterday", phrase: "you sleep well" }), /4\.9 percentage points higher\.$|^On days you sleep well/);
  assert.equal(correlate({ days: strong, phrases: { sleptWell: "you sleep well" } }).some((r) => r.factor === "workedOut"), false);
});

test("the Insights list hides low confidence and counts logged days", () => {
  const rnd = mulberry32(11);
  const days = fill(48, (i) => {
    const row = { workedOut: worked(i), steps: 8000 + gauss(rnd) * 1800 };
    if (i > 0) row.readiness = worked(i - 1) ? 53 : 50;
    return row;
  });
  const rows = correlate({ days });
  const shown = findingsForView(rows);
  assert.ok(rows.some((r) => r.confidence === "low"));
  assert.ok(shown.length > 0);
  assert.ok(shown.every((r) => r.confidence === "high" || r.confidence === "medium"));
  assert.equal(shown.some((r) => r.factor === "workedOut" && r.outcome === "readiness" && r.lag === 0), false);
  assert.equal(loggedDays({ days }), 48);
  assert.equal(loggedDays({}), 0);
  assert.equal(loggedDays({ days: { "2026-01-01": { readiness: 70 }, skip: { readiness: 1 } } }), 1);
});

test("good and bad findings rank ahead of a plain pattern, and See all stops at 25", () => {
  const rows = [
    { confidence: "high", valence: "neutral", strength: 9, percent: 20, nWith: 20, nWithout: 20 },
    { confidence: "medium", valence: "good", strength: 2, percent: 3, nWith: 10, nWithout: 10 },
    { confidence: "low", valence: "good", strength: 30, percent: 40, nWith: 8, nWithout: 8 },
    { confidence: "high", valence: "bad", strength: 4, percent: 8, nWith: 18, nWithout: 18 },
    { confidence: "high", valence: "good", strength: 3, percent: 5, nWith: 16, nWithout: 16 },
  ];
  const view = findingsForView(rows);
  assert.deepEqual(view.map((r) => r.strength), [4, 3, 2, 9]);
  const many = [];
  for (let i = 0; i < 40; i++) many.push({ confidence: "high", valence: i % 2 ? "good" : "neutral", strength: 40 - i, percent: 1, nWith: 14, nWithout: 14 });
  assert.equal(findingsForView(many).length, 40);
  assert.equal(findingsForView(many).slice(0, SEE_ALL_LIMIT).length, 25);
  assert.equal(findingsForView(many).slice(0, SEE_ALL_LIMIT).every((r, i, list) => i === 0 || viewGroupOrder(list[i - 1]) <= viewGroupOrder(r)), true);
});

function viewGroupOrder(row) {
  return row.valence === "good" || row.valence === "bad" ? 0 : 1;
}

test("sleep wording stays natural, and the brief uses yesterday when it fits", () => {
  const slept = fill(48, (i) => {
    const long = i % 2 === 0;
    const row = { sleepHours: long ? 8 : 6 };
    if (i > 0) row.readiness = (i - 1) % 2 === 0 ? 80 : 60;
    return row;
  });
  const sleep = correlate({ days: slept }).find((r) => r.lag === 1 && ((r.source === "sleepHours" && r.outcome === "readiness") || (r.source === "readiness" && r.outcome === "sleepHours")));
  assert.ok(sleep);
  assert.match(sleep.lead, /33% higher/);
  assert.doesNotMatch(sleep.lead, /which is a good sign|which is working against you/);

  const days = fill(48, (i) => {
    const row = { workedOut: worked(i) };
    if (i > 0) row.readiness = worked(i - 1) ? 53 : 50;
    return row;
  });
  const rows = correlate({ days });
  const picked = pickForToday(rows, { days }, dateAt(1));
  assert.equal(picked.factor, "workedOut");
  assert.equal(picked.outcome, "readiness");
  assert.equal(picked.lag, 1);
  assert.equal(picked.because, "yesterday");
  assert.equal(todayLine(picked), "You worked out yesterday; on days like this your readiness tends to be 6.1% higher.");

  const quiet = pickForToday(rows, { days }, dateAt(4));
  assert.equal(quiet.because, "overall");
  assert.match(todayLine(quiet), /^On days after you work out, your readiness is 6\.1% higher/);

  const late = fill(40, (i) => ({
    lateEating: i % 2 === 0,
    workedOut: i % 3 === 0,
    sleepScore: i > 0 && (i - 1) % 2 === 0 ? 88 : 70,
    readiness: i % 3 === 0 ? 90 : 62,
  }));
  const mixed = correlate({ days: late });
  const day = dateAt(2);
  assert.equal(late[dateAt(1)].lateEating, false);
  assert.equal(late[dateAt(1)].workedOut, false);
  const neither = pickForToday(mixed, { days: late }, day);
  assert.equal(neither.because, "overall");
  const on = dateAt(1);
  assert.equal(late[dateAt(0)].lateEating, true);
  const fromMeal = pickForToday(mixed, { days: late }, on);
  assert.equal(fromMeal.because, "yesterday");
  assert.equal(fromMeal.factor, "lateEating");
  assert.match(todayLine(fromMeal), /^You ate late yesterday; on days like this your sleep score tends to be \d+% higher\.$/);
});

test("a later factor cannot explain that morning, and the next day can", () => {
  assert.equal(suppressedStory({ id: "workedOut", source: "workoutVolume" }, "sleepHours", 0, null), true);
  assert.equal(suppressedStory({ id: "workedOut", source: "workoutVolume" }, "hrv", 0, null), true);
  assert.equal(suppressedStory({ id: "workedOut", source: "workoutVolume" }, "rhr", 0, null), true);
  assert.equal(suppressedStory({ id: "liftPerf:median", source: "liftPerf" }, "readiness", 0, null), true);
  assert.equal(suppressedStory({ id: "liftPerf:median", source: "liftPerf" }, "sleepScore", 1, null), false);
  assert.equal(suppressedStory({ id: "lateEating" }, "sleepScore", 0, null), true);
  assert.equal(suppressedStory({ id: "calories:median", source: "calories" }, "readiness", 0, null), true);
  assert.equal(suppressedStory({ id: "steps", source: "steps" }, "readiness", 0, null), true);
  assert.equal(suppressedStory({ id: "sleepHours:median", source: "sleepHours" }, "liftPerf", 0, null), false);
  assert.equal(suppressedStory({ id: "readiness:median", source: "readiness" }, "liftPerf", 0, null), false);

  const days = fill(40, (i) => {
    const train = i % 2 === 0;
    const row = {
      workedOut: train,
      lateEating: train,
      calories: train ? 3200 : 1800,
      steps: train ? 14000 : 4000,
      "workout:legs": train,
    };
    if (i > 0) {
      const after = (i - 1) % 2 === 0;
      row.readiness = after ? 86 : 60;
      row.sleepScore = after ? 90 : 64;
      row.hrv = after ? 70 : 42;
      row.rhr = after ? 48 : 58;
    }
    return row;
  });
  const rows = correlate({ days, phrases: { "workout:legs": "you do a legs workout" } });
  ["workedOut", "lateEating", "workout:legs"].forEach((factor) => {
    assert.equal(rows.some((r) => r.factor === factor && r.lag === 0 && (r.outcome === "readiness" || r.outcome === "sleepScore" || r.outcome === "hrv" || r.outcome === "rhr" || r.outcome === "sleepHours")), false);
    assert.ok(rows.some((r) => r.factor === factor && r.lag === 1 && r.outcome === "readiness"), factor);
  });
  assert.equal(rows.some((r) => r.source === "calories" && r.lag === 0 && r.outcome === "readiness"), false);
  assert.equal(rows.some((r) => r.source === "steps" && r.lag === 0 && r.outcome === "readiness"), false);
  assert.ok(rows.some((r) => r.source === "calories" && r.lag === 1 && r.outcome === "readiness"));
  assert.ok(rows.some((r) => r.source === "steps" && r.lag === 1 && (r.outcome === "readiness" || r.outcome === "sleepScore")));
  const morning = fill(20, (i) => ({ sleepHours: i % 2 === 0 ? 8 : 6, liftPerf: i % 2 === 0 ? 8 : 2 }));
  const lifted = correlate({ days: morning });
  const morningPair = lifted.filter((r) => (r.source === "sleepHours" && r.outcome === "liftPerf") || (r.source === "liftPerf" && r.outcome === "sleepHours"));
  assert.equal(morningPair.length, 1);
  assert.equal(morningPair.some((r) => r.source === "liftPerf" && r.outcome === "sleepHours" && r.lag === 0), false);
  assert.equal(rows.some((r) => /which is a good sign|which is working against you/.test(r.sentence)), false);
});

test("mirror pairs collapse to the stronger temporally valid direction", () => {
  const days = fill(40, (i) => {
    const high = i % 2 === 0;
    return { sleepHours: high ? 8 : 6, liftPerf: high ? 8 : 2 };
  });
  const rows = correlate({ days });
  const pair = rows.filter((r) => {
    const a = r.source || String(r.factor).replace(/:(median|tertile)$/, "");
    return (a === "sleepHours" && r.outcome === "liftPerf") || (a === "liftPerf" && r.outcome === "sleepHours");
  });
  assert.equal(pair.length, 1);
  assert.equal(pair[0].lag === 0 && pair[0].source === "liftPerf" && pair[0].outcome === "sleepHours", false);
  assert.equal(rows.filter((r) => (r.source === "sleepHours" && r.outcome === "liftPerf") || (r.source === "liftPerf" && r.outcome === "sleepHours")).length, 1);
});

test("the first screen allows 2 cards per outcome, 3 per family, 1 per story", () => {
  assert.equal(OUTCOME_CAP, 2);
  assert.equal(FAMILY_CAP, 3);
  const outcomes = ["liftPerf", "readiness", "sleepScore", "hrv", "rhr"];
  const factors = [
    { factor: "sleepHours:median", source: "sleepHours" },
    { factor: "sleepScore:median", source: "sleepScore" },
    { factor: "deepHours:median", source: "deepHours" },
    { factor: "lightHours:median", source: "lightHours" },
    { factor: "hrv:median", source: "hrv" },
    { factor: "rhr:median", source: "rhr" },
    { factor: "readiness:median", source: "readiness" },
    { factor: "workedOut", source: "workoutVolume" },
    { factor: "workoutVolume:tertile", source: "workoutVolume" },
    { factor: "liftPerf:median", source: "liftPerf" },
    { factor: "didCardio", source: "cardioMin" },
    { factor: "calories:median", source: "calories" },
    { factor: "protein:median", source: "protein" },
    { factor: "lateEating" },
    { factor: "steps:median", source: "steps" },
  ];
  const rows = [];
  let strength = 200;
  outcomes.forEach((outcome) => {
    factors.forEach((f) => {
      if (f.source === outcome) return;
      rows.push({
        confidence: "high",
        valence: "good",
        strength: strength--,
        percent: 10,
        nWith: 20,
        nWithout: 20,
        outcome,
        factor: f.factor,
        source: f.source,
        lag: 1,
      });
    });
  });
  const listed = listFindings(rows);
  const { top, more } = splitFindings(rows);
  const byOutcome = {};
  const byFamily = {};
  const byStory = {};
  top.forEach((r) => {
    byOutcome[r.outcome] = (byOutcome[r.outcome] || 0) + 1;
    const family = factorFamily(r);
    byFamily[family] = (byFamily[family] || 0) + 1;
    byStory[storyKey(r)] = (byStory[storyKey(r)] || 0) + 1;
    assert.ok(family === "sleep" || family === "training" || family === "food" || family === "hrv" || family === "rhr" || family === "readiness" || family === "steps");
  });
  assert.equal(top.length, DISPLAY_LIMIT);
  Object.values(byOutcome).forEach((n) => assert.ok(n <= OUTCOME_CAP));
  Object.values(byFamily).forEach((n) => assert.ok(n <= FAMILY_CAP));
  Object.values(byStory).forEach((n) => assert.equal(n, 1));
  assert.ok(new Set(top.map((r) => r.outcome)).size >= 3);
  assert.deepEqual(listed, top.concat(more));
  const seen = {};
  let overflowAt = listed.length;
  listed.forEach((r, i) => {
    const story = storyKey(r);
    seen[story] = (seen[story] || 0) + 1;
    if (seen[story] > STORY_CAP && overflowAt === listed.length) overflowAt = i;
  });
  listed.slice(0, overflowAt).forEach((r) => {
    const n = listed.slice(0, overflowAt).filter((x) => storyKey(x) === storyKey(r)).length;
    assert.ok(n <= STORY_CAP);
  });
  // Nothing is dropped. liftPerf spans several families, and the sleep story
  // keeps every high row, with the extras after the cap.
  assert.ok(listed.filter((r) => r.outcome === "liftPerf").length > OUTCOME_CAP);
  const sleep = listed.filter((r) => r.outcome === "liftPerf" && factorFamily(r) === "sleep");
  assert.ok(sleep.length > STORY_CAP);
  assert.equal(listed.length, rows.length);
});

function hrvRow(factor, source, strength, extra) {
  return { confidence: "high", valence: "bad", strength, percent: -8, nWith: 20, nWithout: 20, outcome: "hrv", factor, source, lag: 1, ...extra };
}

test("late eating, fat and carbs pulling HRV down are one story", () => {
  const rows = [
    hrvRow("fat:median", "fat", 50),
    hrvRow("lateEating", undefined, 80),
    hrvRow("carbs:median", "carbs", 65),
  ];
  assert.equal(new Set(rows.map(storyKey)).size, 1);
  const { top, more } = splitFindings(rows);
  const listed = listFindings(rows);
  assert.equal(listed.length, rows.length);
  assert.deepEqual(listed.map((r) => r.factor), ["lateEating", "carbs:median", "fat:median"]);
  assert.equal(top.length, 1);
  assert.equal(top[0].factor, "lateEating");
  assert.deepEqual(more.map((r) => r.factor), ["carbs:median", "fat:median"]);
  assert.deepEqual(listed, top.concat(more));
});

test("a weaker high finding is kept ahead of stronger mediums in the same story", () => {
  const rows = [
    hrvRow("lateEating", undefined, 90, { confidence: "medium" }),
    hrvRow("fat:median", "fat", 80, { confidence: "medium" }),
    hrvRow("carbs:median", "carbs", 10, { confidence: "high" }),
  ];
  const { top, more } = splitFindings(rows);
  const listed = listFindings(rows);
  assert.equal(top[0].factor, "carbs:median");
  assert.equal(top[0].confidence, "high");
  assert.ok(listed.some((r) => r.factor === "carbs:median"));
  assert.ok(more.some((r) => r.factor === "lateEating" || r.factor === "fat:median"));
  assert.equal(listed.length, 3);
  assert.deepEqual(listFindings(rows.slice().reverse()).map((r) => r.factor), listed.map((r) => r.factor));
});

test("a different direction or family is a different story", () => {
  const rows = [
    hrvRow("lateEating", undefined, 80),
    hrvRow("protein:median", "protein", 70, { valence: "good", percent: 6 }),
    hrvRow("sleepHours:median", "sleepHours", 60),
    hrvRow("steps:median", "steps", 55, { valence: undefined, percent: 4 }),
    hrvRow("calories:median", "calories", 50, { valence: undefined, percent: -4 }),
  ];
  assert.equal(new Set(rows.map(storyKey)).size, rows.length);
});

test("splitFindings never pads the first screen with cap-breaking rows", () => {
  const rows = [
    hrvRow("lateEating", undefined, 90),
    hrvRow("fat:median", "fat", 80),
    hrvRow("sleepHours:median", "sleepHours", 70),
    hrvRow("deepHours:median", "deepHours", 60),
    hrvRow("steps:median", "steps", 50),
    hrvRow("workedOut", "workoutVolume", 40, { confidence: "low" }),
  ];
  const { top, more } = splitFindings(rows);
  assert.ok(top.length < DISPLAY_LIMIT);
  assert.deepEqual(top.map((r) => r.factor), ["lateEating", "sleepHours:median"]);
  assert.deepEqual(more.map((r) => r.factor), ["steps:median", "fat:median", "deepHours:median"]);
  assert.deepEqual(listFindings(rows), top.concat(more));
  assert.deepEqual(splitFindings([]), { top: [], more: [] });
});

test("ties are broken by name, so input order does not matter", () => {
  const a = hrvRow("lateEating", undefined, 50, { outcome: "rhr" });
  const b = hrvRow("sleepHours:median", "sleepHours", 50);
  const c = hrvRow("steps:median", "steps", 50, { lag: 0 });
  const d = hrvRow("steps:median", "steps", 50);
  const order = (rows) => listFindings(rows).map((r) => r.outcome + "|" + r.factor + "|" + r.lag);
  const want = ["hrv|sleepHours:median|1", "hrv|steps:median|0", "rhr|lateEating|1", "hrv|steps:median|1"];
  assert.deepEqual(order([a, b, c, d]), want);
  assert.deepEqual(order([d, c, b, a]), want);
  const strong = hrvRow("deepHours:median", "deepHours", 51, { outcome: "rhr", factor: "zzz" });
  assert.equal(listFindings([a, strong])[0], strong);
});

test("the Insights screen still calls effect(), and the engine does not phone home", () => {
  const insights = readFileSync(new URL("../logger/js/pages/insights.js", import.meta.url), "utf8");
  const analyze = readFileSync(new URL("../logger/js/shared/analyze.js", import.meta.url), "utf8");
  const engine = readFileSync(new URL("../logger/js/shared/correlate.js", import.meta.url), "utf8");
  const sw = readFileSync(new URL("../logger/sw.js", import.meta.url), "utf8");
  const brief = readFileSync(new URL("../logger/js/shared/brief.js", import.meta.url), "utf8");
  const actions = readFileSync(new URL("../logger/js/shell/actions.js", import.meta.url), "utf8");
  const events = readFileSync(new URL("../logger/js/usage-events.js", import.meta.url), "utf8");
  const sentry = readFileSync(new URL("../logger/js/sentry.js", import.meta.url), "utf8");
  assert.match(insights, /app\.effect\(/);
  assert.match(insights, /What affects your lifts/);
  assert.match(insights, /Lift progress/);
  assert.match(insights, /app\.effectCard\(/);
  assert.match(insights, /class="card aff-card/);
  assert.match(insights, /correlations, not causes/);
  assert.match(insights, /data-action="affects-more"/);
  assert.doesNotMatch(insights, /capture\(|posthog|sentry/i);
  assert.match(actions, /case "affects-more"/);
  assert.match(events, /insights_opened:\s*\(\)\s*=>\s*\(\{\}\)/);
  assert.match(brief, /app\.effect\(/);
  assert.match(analyze, /bucketEffect/);
  assert.match(analyze, /app\.correlations/);
  assert.match(analyze, /weightDir/);
  assert.doesNotMatch(engine, /posthog|sentry|sendBeacon|fetch\(/i);
  assert.match(sw, /insight-shell-v32/);
  assert.match(sentry, /insight-shell-v32/);
  assert.match(insights, /listFindings/);
  assert.match(insights, /SEE_ALL_LIMIT/);
  assert.match(engine, /mergeMirrors/);
  assert.match(engine, /MORNING_IDS/);
  assert.doesNotMatch(engine, /which is a good sign|which is working against you/);
  assert.match(brief, /pickForToday/);
  assert.match(brief, /open-affects/);
  assert.match(brief, /\["pattern", "What affects you"\]/);
  assert.match(actions, /case "open-affects"/);
  assert.match(brief, /app\.capture\("morning_brief_customized"\)/);
  assert.doesNotMatch(brief, /capture\([^)]*(readiness|sleep|hrv|sentence|lead)/);
  assert.match(sw, /js\/shared\/correlate\.js/);
  assert.match(sw, /css\/polish\.css/);
  assert.match(insights, /No pattern is strong enough to trust yet/);
  assert.match(insights, /app\.affectsEmpty = affectsEmpty/);
  assert.doesNotMatch(brief, /app\.affectsEmpty\(/);
  assert.doesNotMatch(brief, /No pattern is strong enough to trust yet/);
  assert.match(brief, /Nothing clear yet/);
  assert.match(brief, /See Insights/);
  assert.match(brief, /brief-l">Patterns</);
  const correlateImport = brief.match(/import\s*\{([^}]+)\}\s*from\s*"\.\/correlate\.js"/);
  assert.ok(correlateImport, "brief imports from correlate.js");
  for (const name of ["DAYS_FOR_A_PATTERN", "loggedDays", "pickForToday", "todayLine", "findingsForView"]) {
    assert.match(correlateImport[1], new RegExp("\\b" + name + "\\b"));
  }
  const gateImport = brief.match(/import\s*\{([^}]+)\}\s*from\s*"\.\/oura-gate\.js"/);
  assert.ok(gateImport, "brief imports from oura-gate.js");
  assert.match(gateImport[1], /\bhasOura\b/);
  assert.match(brief, /import\s*\{\s*homeCardShowing,\s*readinessCardShowing\s*\}\s*from\s*"\.\/home-defaults\.js"/);
  assert.match(brief, /m\.link === "affects" && m\.empty/);
  assert.doesNotMatch(brief, /No strong pattern yet/);
  assert.doesNotMatch(brief, /m\.empty && m\.sub/);
  assert.match(engine, /benjaminiHochberg/);
  assert.match(engine, /TREND_HALF = 14/);
  assert.match(engine, /detrendSeries/);
  assert.match(engine, /flatOutcome/);
  assert.match(analyze, /correlationCache/);
  assert.match(analyze, /correlationRev/);
  assert.match(analyze, /correlationCache\.state === app\.state/);
  assert.match(analyze, /must also bump/);
  assert.match(engine, /r\.confidence === "high" && r\.q <= 0\.001/);
  assert.doesNotMatch(analyze, /hashAny/);
  const state = readFileSync(new URL("../logger/js/data/state.js", import.meta.url), "utf8");
  const cloud = readFileSync(new URL("../logger/js/shared/cloud.js", import.meta.url), "utf8");
  const privacy = readFileSync(new URL("../logger/js/pages/privacy.js", import.meta.url), "utf8");
  assert.match(state, /app\.correlationRev = \(app\.correlationRev \|\| 0\) \+ 1/);
  assert.match(state, /if \(correlationDay && day !== correlationDay\) app\.correlationRev = \(app\.correlationRev \|\| 0\) \+ 1/);
  assert.match(cloud, /function claimLocalFor\(uid\) \{[\s\S]*?app\.correlationRev = \(app\.correlationRev \|\| 0\) \+ 1;/);
  assert.match(privacy, /app\.replaceState\(app\.load\(\)\)/);
  assert.match(privacy, /app\.wipeLogs\(/);
  assert.match(cloud, /app\.replaceState\(/);
  assert.match(actions, /app\.replaceState\(/);
  assert.doesNotMatch(analyze, /posthog|sentry|sendBeacon|fetch\(/i);
});

test("false-discovery q-values and the autocorrelation adjustment match the formulas", () => {
  const q = benjaminiHochberg([0.001, 0.04, 0.03, 0.5]);
  assert.ok(Math.abs(q[0] - 0.004) < 1e-12);
  assert.ok(Math.abs(q[2] - (0.04 * 4) / 3) < 1e-12);
  assert.ok(q[1] <= q[2]);
  assert.equal(q[3], 0.5);
  assert.deepEqual(benjaminiHochberg([]), []);

  const plain = effectiveN([0, 1, 2, 3, 4, 5, 6, 7], [10, 11, 12, 13, 14, 15, 16, 17], 0);
  assert.equal(plain.inflation, 1);
  assert.equal(plain.n1, 8);
  assert.equal(plain.n2, 8);

  const withDays = [0, 1, 2, 3, 8, 9, 10, 11];
  const withoutDays = [4, 5, 6, 7, 12, 13, 14, 15];
  const rho = 0.6;
  const adjusted = effectiveN(withDays, withoutDays, rho);
  const pts = withDays.map((t) => ({ t, w: 1 / withDays.length })).concat(withoutDays.map((t) => ({ t, w: -1 / withoutDays.length })));
  let S = 0;
  pts.forEach((a) => pts.forEach((b) => {
    const dt = Math.abs(a.t - b.t);
    S += a.w * b.w * (dt ? rho ** dt : 1);
  }));
  const indep = 1 / withDays.length + 1 / withoutDays.length;
  const inflation = Math.max(1, S / indep);
  assert.ok(Math.abs(adjusted.inflation - inflation) < 1e-9);
  assert.ok(adjusted.n1 < withDays.length);
  assert.ok(adjusted.n1 > 1);
});

const NOISE_METRICS = {
  readiness: [78, 8], sleepScore: [80, 8], sleepHours: [7.2, 0.8], deepHours: [1.4, 0.35],
  remHours: [1.6, 0.4], lightHours: [4, 0.6], awakeMin: [40, 15], steps: [8000, 2500],
  hrv: [55, 12], rhr: [58, 4], temp: [0, 0.2], workoutVolume: [8000, 2500],
  liftPerf: [0, 4], calories: [2400, 400], protein: [150, 30], carbs: [250, 50],
  fat: [70, 15], cardioMin: [20, 15], weight: [80, 0.4],
};
const NOISE_FLAGS = ["workedOut", "didCardio", "lateEating", "proteinOverTarget", "caloriesOverTarget", "carbsOverTarget", "fatOverTarget"];

function noiseDays(n, seed, effect) {
  const rnd = mulberry32(seed);
  const days = {};
  for (let i = 0; i < n; i++) {
    const row = {};
    for (const [k, spec] of Object.entries(NOISE_METRICS)) row[k] = spec[0] + gauss(rnd) * spec[1];
    NOISE_FLAGS.forEach((flag) => { row[flag] = rnd() < 0.45; });
    if (!row.workedOut) row.workoutVolume = 0;
    days[dateAt(i, "2026-01-01")] = row;
  }
  if (effect) {
    for (let i = 1; i < n; i++) {
      const prev = days[dateAt(i - 1, "2026-01-01")];
      if (prev && prev.workedOut) days[dateAt(i, "2026-01-01")].readiness += effect;
    }
  }
  return days;
}

test("random days produce almost no findings, and an injected effect is still found", () => {
  const seeds = 120;
  let shown = 0;
  let high = 0;
  for (let s = 1; s <= seeds; s++) {
    const days = noiseDays(90, s, 0);
    const rows = correlate({ days });
    const view = findingsForView(rows);
    shown += view.length;
    high += view.filter((r) => r.confidence === "high").length;
    const brief = pickForToday(rows, { days }, dateAt(80, "2026-01-01"));
    if (brief) {
      assert.equal(brief.confidence, "high");
      assert.ok(brief.q <= 0.001);
    }
    if (!view.length) assert.equal(brief, null);
  }
  console.log("iid false-finding rate: shown " + (shown / seeds) + "/user, high " + (high / seeds) + "/user");
  assert.ok(shown / seeds < 0.25, "mean shown " + (shown / seeds));
  assert.ok(high / seeds < 0.15, "mean high " + (high / seeds));

  let found = 0;
  for (let s = 1; s <= 12; s++) {
    const days = noiseDays(90, s, 12);
    const rows = correlate({ days });
    const hit = findingsForView(rows).find((r) => r.factor === "workedOut" && r.outcome === "readiness" && r.lag === 1);
    if (!hit) continue;
    found++;
    assert.equal(hit.valence, "good");
    assert.ok(hit.confidence === "high" || hit.confidence === "medium");
    assert.ok(hit.q <= 0.05);
    assert.ok(Math.abs(hit.effect) >= 0.35);
    const brief = pickForToday(rows, { days }, dateAt(2, "2026-01-01"));
    assert.ok(brief);
    assert.ok(brief.confidence === "high" || brief.confidence === "medium");
    assert.ok(brief.valence === "good" || brief.valence === "bad");
  }
  assert.equal(found, 12);
});

test("two independent series that share a linear trend are not a finding", () => {
  for (let seed = 1; seed <= 8; seed++) {
    const rnd = mulberry32(seed);
    const days = {};
    for (let i = 0; i < 365; i++) {
      const trend = i / 364;
      days[dateAt(i, "2025-01-01")] = {
        readiness: 60 + trend * 24 + gauss(rnd) * 4,
        hrv: 40 + trend * 30 + gauss(rnd) * 5,
      };
    }
    const view = findingsForView(correlate({ days }));
    assert.equal(view.length, 0, "seed " + seed + " showed " + view.map((r) => r.factor + "->" + r.outcome).join(","));
  }
});

test("an account switch does not serve the previous account's findings", () => {
  const prevState = app.state;
  const prevGoals = app.goals;
  const prevSetCount = app.setCount;
  const prevRev = app.correlationRev;
  try {
    app.setCount = () => 1;
    app.goals = () => ({ weightDir: null });
    const daysA = noiseDays(40, 3, 20);
    app.state = {
      demo: false,
      ownerId: "account-a",
      sessions: [],
      oura: { days: daysA },
      food: { days: {} },
      cardio: { sessions: [] },
      measurements: {},
      checkins: null,
    };
    app.correlationRev = (app.correlationRev || 0) + 1;
    const rowsA = app.correlations();
    const builds = app.correlationBuilds();
    const daysB = {};
    for (let i = 0; i < 40; i++) {
      daysB[dateAt(i, "2024-03-01")] = { readiness: 55, hrv: 42, sleepScore: 74, sleepHours: 7 };
    }
    app.state = {
      demo: false,
      ownerId: "account-b",
      sessions: [],
      oura: { days: daysB },
      food: { days: {} },
      cardio: { sessions: [] },
      measurements: {},
      checkins: null,
    };
    const rowsB = app.correlations();
    assert.equal(app.correlationBuilds(), builds + 1);
    assert.notEqual(rowsB, rowsA);
    assert.equal(rowsB.some((r) => r.factor === "workedOut"), false);
    const again = app.correlations();
    assert.equal(again, rowsB);
    assert.equal(app.correlationBuilds(), builds + 1);
  } finally {
    app.state = prevState;
    app.goals = prevGoals;
    app.setCount = prevSetCount;
    app.correlationRev = prevRev;
  }
});

test("the brief shows only a high-confidence finding", () => {
  const days = fill(20, (i) => ({ workedOut: true, readiness: 70 + (i % 3) }));
  const medium = {
    confidence: "medium",
    valence: "good",
    strength: 9,
    factor: "workedOut",
    outcome: "readiness",
    lag: 1,
    kind: "boolean",
    phrase: "you work out",
    lead: "On days after you work out, your readiness is 8% higher.",
    nWith: 10,
    nWithout: 10,
  };
  const high = { ...medium, confidence: "high", q: 0.001, strength: 4, lead: "On days after you work out, your readiness is 12% higher." };
  const loose = { ...high, q: 0.01 };
  assert.equal(pickForToday([medium], { days }, dateAt(2)), null);
  assert.equal(pickForToday([loose], { days }, dateAt(2)), null);
  assert.equal(findingsForView([medium]).length, 1);
  const picked = pickForToday([medium, high], { days }, dateAt(2));
  assert.equal(picked.confidence, "high");
  assert.ok(picked.q <= 0.001);
  assert.equal(listFindings([medium, high]).some((r) => r.confidence === "medium"), true);
});

test("line reflection keeps a flat series flat, removes a slope, and leaves noisy ends unamplified", () => {
  const flat = {};
  for (let i = 0; i < 120; i++) flat[dateAt(i, "2026-01-01")] = { readiness: 59.5 };
  const flatOut = detrendDays(flat);
  const flatDates = Object.keys(flatOut).sort();
  assert.equal(flatOut[flatDates[0]].readiness, 59.5);
  assert.equal(flatOut[flatDates[119]].readiness, 59.5);
  assert.equal(flatOut[flatDates[60]].readiness, 59.5);

  const slope = {};
  for (let i = 0; i < 120; i++) slope[dateAt(i, "2026-01-01")] = { readiness: i };
  const slopeOut = detrendDays(slope);
  const slopeDates = Object.keys(slopeOut).sort();
  for (const d of [slopeDates[0], slopeDates[60], slopeDates[119]]) {
    assert.ok(Math.abs(slopeOut[d].readiness - 59.5) < 1e-6, d + " " + slopeOut[d].readiness);
  }

  const flatRnd = mulberry32(7);
  const flatNoise = {};
  const flatRaw = [];
  for (let i = 0; i < 120; i++) {
    const y = 50 + gauss(flatRnd) * 3;
    flatRaw.push(y);
    flatNoise[dateAt(i, "2026-03-01")] = { readiness: y };
  }
  const flatNoiseOut = detrendDays(flatNoise);
  const flatNoiseDates = Object.keys(flatNoiseOut).sort();
  [0, 119].forEach((i) => {
    const y = flatNoiseOut[flatNoiseDates[i]].readiness;
    assert.ok(Math.abs(y - flatRaw[i]) < 2, "flat end " + y);
  });

  const slopeRnd = mulberry32(7);
  const slopeNoise = {};
  const slopeRaw = [];
  let slopeSum = 0;
  for (let i = 0; i < 120; i++) {
    const y = 50 + (i / 119) * 20 + gauss(slopeRnd) * 3;
    slopeSum += y;
    slopeRaw.push(y);
    slopeNoise[dateAt(i, "2026-04-01")] = { readiness: y };
  }
  const slopeMean = slopeSum / 120;
  const slopeNoiseOut = detrendDays(slopeNoise);
  const slopeNoiseDates = Object.keys(slopeNoiseOut).sort();
  const first = slopeNoiseOut[slopeNoiseDates[0]].readiness;
  const last = slopeNoiseOut[slopeNoiseDates[119]].readiness;
  assert.ok(first > slopeRaw[0]);
  assert.ok(last < slopeRaw[119]);
  assert.ok(Math.abs(first - slopeMean) < 12);
  assert.ok(Math.abs(last - slopeMean) < 12);
});

test("replaceState and wipeLogs bump correlationRev", () => {
  const root = new URL("../logger/js/", import.meta.url);
  const files = readdirSync(root, { recursive: true }).filter((name) => String(name).endsWith(".js"));
  const raw = [];
  for (const name of files) {
    const src = readFileSync(new URL(name, root), "utf8");
    const rel = String(name);
    if (rel === "data/state.js") {
      const outside = src.replace(/function replaceState\(next\) \{[\s\S]*?\n\}/, "");
      if (/app\.state\s*=(?!=)/.test(outside)) raw.push(rel);
      assert.match(src, /function replaceState\(next\)/);
      assert.match(src, /function wipeLogs\(apply\)/);
      continue;
    }
    if (/app\.state\s*=(?!=)/.test(src)) raw.push(rel);
    if (/stripRange\(\s*app\.state/.test(src)) raw.push(rel + " stripRange");
  }
  assert.deepEqual(raw, []);

  const privacy = readFileSync(new URL("../logger/js/pages/privacy.js", import.meta.url), "utf8");
  assert.match(privacy, /removeItem\(app\.KEY\)[\s\S]{0,240}replaceState\(/);
  assert.match(privacy, /wipeLogs\(\(data\) => stripRange\(data/);

  const stateSrc = readFileSync(new URL("../logger/js/data/state.js", import.meta.url), "utf8");
  const start = stateSrc.indexOf("function bumpCorrelationRev");
  const end = stateSrc.indexOf("function save()");
  const host = { correlationRev: 0, state: { sessions: ["keep"] } };
  const api = new Function("app", stateSrc.slice(start, end) + "\nreturn { replaceState, wipeLogs };")(host);
  api.replaceState({ demo: true, sessions: [] });
  assert.equal(host.state.demo, true);
  assert.equal(host.correlationRev, 1);
  let seen = null;
  api.wipeLogs((data) => { seen = data; data.sessions = ["wiped"]; });
  assert.equal(seen, host.state);
  assert.deepEqual(host.state.sessions, ["wiped"]);
  assert.equal(host.correlationRev, 2);
});

test("autocorrelation rho 0.7 on untrended data stays quiet", () => {
  const rho = 0.7;
  const seeds = 24;
  const n = 90;
  let shown = 0;
  let high = 0;
  let briefUsers = 0;
  for (let s = 1; s <= seeds; s++) {
    const rnd = mulberry32(1000 + s);
    const series = {};
    for (const [k, spec] of Object.entries(NOISE_METRICS)) series[k] = ar1Series(rnd, n, rho, spec[0], spec[1]);
    const flags = {};
    NOISE_FLAGS.forEach((flag) => { flags[flag] = stickyBool(rnd, n, rho); });
    const days = {};
    for (let i = 0; i < n; i++) {
      const row = {};
      for (const k of Object.keys(series)) row[k] = series[k][i];
      NOISE_FLAGS.forEach((flag) => { row[flag] = flags[flag][i]; });
      if (!row.workedOut) row.workoutVolume = 0;
      days[dateAt(i, "2026-01-01")] = row;
    }
    const rows = correlate({ days });
    const view = findingsForView(rows);
    shown += view.length;
    high += view.filter((r) => r.confidence === "high").length;
    const brief = pickForToday(rows, { days }, dateAt(n - 1, "2026-01-01"));
    if (brief) {
      briefUsers++;
      assert.equal(brief.confidence, "high");
      assert.ok(brief.q <= 0.001);
    }
  }
  const rate = shown / seeds;
  const highRate = high / seeds;
  console.log("rho 0.7 untrended false-finding rate: shown " + rate.toFixed(3) + "/user, high " + highRate.toFixed(3) + "/user, brief " + (briefUsers / seeds).toFixed(3) + " of users, " + seeds + " seeds x " + n + " days");
  assert.ok(rate < 1, "mean shown " + rate);
  assert.ok(briefUsers / seeds < 0.15, "brief users " + (briefUsers / seeds));
});

function ar1Series(rnd, n, rho, mean, sd) {
  const innov = sd * Math.sqrt(Math.max(0, 1 - rho * rho));
  let x = gauss(rnd) * sd;
  for (let i = 0; i < 40; i++) x = rho * x + gauss(rnd) * innov;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = mean + x;
    x = rho * x + gauss(rnd) * innov;
  }
  return out;
}

function stickyBool(rnd, n, rho) {
  const stay = (1 + rho) / 2;
  let v = rnd() < 0.5;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = v;
    if (rnd() > stay) v = !v;
  }
  return out;
}

test("a flat outcome is not a confident about-the-same card", () => {
  const flat = {};
  for (let i = 0; i < 60; i++) {
    flat[dateAt(i, "2026-04-01")] = {
      readiness: 70,
      hrv: i % 2 === 0 ? 60 : 40,
      workedOut: i % 2 === 0,
    };
  }
  const skipped = correlate({ days: flat }).filter((r) => r.outcome === "readiness");
  assert.equal(skipped.length, 0);

  const tiny = {};
  for (let i = 0; i < 80; i++) {
    const on = i % 2 === 0;
    tiny[dateAt(i, "2026-05-01")] = {
      readiness: on ? 70.02 : 70,
      hrv: 50 + (i % 5),
      workedOut: on,
    };
  }
  const rows = correlate({ days: tiny });
  const same = rows.filter((r) => /about the same/.test(r.lead || ""));
  same.forEach((r) => assert.equal(r.confidence, "low"));
  assert.equal(findingsForView(rows).some((r) => /about the same/.test(r.lead || "")), false);
});

test("the correlation cache reruns only when a save bumps the revision", () => {
  const prevState = app.state;
  const prevGoals = app.goals;
  const prevSetCount = app.setCount;
  try {
    app.setCount = () => 1;
    let dir = null;
    app.goals = () => ({ weightDir: dir });
    const days = {};
    for (let i = 0; i < 21; i++) {
      days[dateAt(i, "2026-02-01")] = { readiness: 70 + (i % 5), sleepScore: 78, hrv: 48, total: 7 * 3600, steps: 6000 };
    }
    app.state = {
      demo: false,
      sessions: [],
      oura: { days },
      food: { days: {} },
      cardio: { sessions: [] },
      measurements: {},
      checkins: null,
    };
    const bump = () => { app.correlationRev = (app.correlationRev || 0) + 1; };
    const before = app.correlationBuilds();
    const first = app.correlations();
    assert.equal(app.correlationBuilds(), before + 1);
    const second = app.correlations();
    assert.equal(app.correlationBuilds(), before + 1);
    assert.equal(second, first);
    days[dateAt(21, "2026-02-01")] = { readiness: 90, sleepScore: 88, hrv: 60, total: 8 * 3600, steps: 9000 };
    app.correlations();
    assert.equal(app.correlationBuilds(), before + 1);
    bump();
    const third = app.correlations();
    assert.equal(app.correlationBuilds(), before + 2);
    assert.notEqual(third, first);
    days[dateAt(0, "2026-02-01")].readiness = 40;
    app.correlations();
    assert.equal(app.correlationBuilds(), before + 2);
    bump();
    app.correlations();
    assert.equal(app.correlationBuilds(), before + 3);
    dir = "gain";
    app.correlations();
    assert.equal(app.correlationBuilds(), before + 4);
    app.correlations();
    assert.equal(app.correlationBuilds(), before + 4);
  } finally {
    app.state = prevState;
    app.goals = prevGoals;
    app.setCount = prevSetCount;
  }
});
