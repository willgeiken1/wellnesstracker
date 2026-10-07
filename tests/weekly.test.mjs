import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { addDays, correlate, findingsForWeek } from "../logger/js/shared/correlate.js";
import { app } from "../logger/js/runtime.js";
import {
  WEEK_HISTORY,
  buildWeek,
  formatChange,
  formatValue,
  mergeWeeklyReports,
  mondayOf,
  previousWeek,
  trendTone,
  weekCardDue,
  weekHeadline,
  weekHistory,
} from "../logger/js/shared/weekly.js";

function fill(start, n, assign) {
  const oura = {};
  for (let i = 0; i < n; i++) oura[addDays(start, i)] = assign(i, addDays(start, i));
  return oura;
}

test("week boundaries follow Monday through Sunday, including the year change", () => {
  assert.equal(mondayOf("2026-10-05"), "2026-10-05");
  assert.equal(mondayOf("2026-10-04"), "2026-09-28");
  assert.equal(mondayOf("2026-10-07"), "2026-10-05");
  assert.deepEqual(previousWeek("2026-10-05"), { start: "2026-09-28", end: "2026-10-04", current: "2026-10-05" });
  assert.deepEqual(previousWeek("2026-10-07"), { start: "2026-09-28", end: "2026-10-04", current: "2026-10-05" });
  assert.deepEqual(previousWeek("2026-10-04"), { start: "2026-09-21", end: "2026-09-27", current: "2026-09-28" });
  assert.equal(mondayOf("2026-01-01"), "2025-12-29");
  assert.deepEqual(previousWeek("2026-01-01"), { start: "2025-12-22", end: "2025-12-28", current: "2025-12-29" });
  assert.equal(weekHistory("2026-10-05", 3)[0], "2026-09-28");
  assert.equal(weekHistory("2026-10-05", 3)[2], "2026-09-14");
  assert.equal(WEEK_HISTORY, 8);
});

test("the home card appears on Monday and on the first later open, until it is dismissed", () => {
  const monday = weekCardDue("2026-10-05", []);
  assert.equal(monday.show, true);
  assert.equal(monday.start, "2026-09-28");
  const wednesday = weekCardDue("2026-10-07", []);
  assert.equal(wednesday.show, true);
  assert.equal(wednesday.start, monday.start);
  const dismissed = weekCardDue("2026-10-07", ["2026-09-28"]);
  assert.equal(dismissed.show, false);
  const nextMonday = weekCardDue("2026-10-12", ["2026-09-28"]);
  assert.equal(nextMonday.show, true);
  assert.equal(nextMonday.start, "2026-10-05");
  assert.equal(nextMonday.end, "2026-10-11");
  const sunday = weekCardDue("2026-10-04", []);
  assert.equal(sunday.start, "2026-09-21");
  assert.equal(sunday.show, true);
});

test("comparisons use logged days only, and a lower resting heart rate is an improvement", () => {
  const oura = {};
  for (let i = 0; i < 7; i++) {
    oura[addDays("2026-09-21", i)] = { readiness: 70, sleepScore: 70, total: 7 * 3600, hrv: 50, rhr: 55 };
  }
  oura["2026-09-28"] = { readiness: 80, total: 8 * 3600, rhr: 50 };
  oura["2026-09-30"] = { readiness: 90, sleepScore: 88, total: 7.5 * 3600, hrv: 60, rhr: 50 };
  oura["2026-10-02"] = { readiness: 70, total: 6 * 3600, rhr: 50 };
  const report = buildWeek({ oura }, "2026-09-28");
  assert.equal(report.metrics.readiness.n, 3);
  assert.equal(report.metrics.readiness.series.length, 7);
  assert.equal(report.metrics.readiness.series.filter((v) => v == null).length, 4);
  assert.equal(report.metrics.readiness.mean, 80);
  assert.equal(report.metrics.readiness.delta, 10);
  assert.equal(trendTone(report.metrics.readiness.delta, report.metrics.readiness.better, "score"), "up");
  assert.equal(report.metrics.hrv.n, 1);
  assert.equal(report.metrics.hrv.mean, 60);
  assert.equal(report.metrics.hrv.delta, 10);
  assert.equal(report.metrics.sleepScore.n, 1);
  assert.equal(report.metrics.rhr.mean, 50);
  assert.equal(report.metrics.rhr.delta, -5);
  assert.equal(report.metrics.rhr.better, "lower");
  assert.equal(trendTone(report.metrics.rhr.delta, "lower", "rhr"), "up");
  assert.ok(Math.abs(report.metrics.sleepHours.mean - (8 + 7.5 + 6) / 3) < 1e-9);
  assert.equal(report.weight, null);
  assert.equal(report.empty, false);
  assert.equal(report.metrics.readiness.supported, false);
  assert.equal(report.headline, "Readiness was up so far.");
});

test("a full week on both sides can say readiness was up", () => {
  const oura = {};
  for (let i = 0; i < 7; i++) oura[addDays("2026-09-21", i)] = { readiness: 70 };
  for (let i = 0; i < 7; i++) oura[addDays("2026-09-28", i)] = { readiness: 82 };
  const report = buildWeek({ oura }, "2026-09-28");
  assert.equal(report.metrics.readiness.n, 7);
  assert.equal(report.metrics.readiness.supported, true);
  assert.equal(report.headline, "Readiness was up.");
});

test("a week with nothing logged stays empty instead of inventing zeros", () => {
  const report = buildWeek({}, "2026-09-28");
  assert.equal(report.empty, true);
  assert.equal(report.metrics.readiness.mean, null);
  assert.equal(report.metrics.readiness.n, 0);
  assert.equal(report.workouts.n, 0);
  assert.equal(report.workouts.volume, 0);
  assert.equal(report.food.days, 0);
  assert.equal(report.food.kcal, null);
  assert.equal(report.weight, null);
  assert.equal(report.headline, "Not enough logged for a week yet.");
  assert.equal(weekHeadline(report), report.headline);
  assert.equal(report.mood, undefined);
});

test("workouts, food targets, weight, and a personal record compare with the week before", () => {
  const sessions = [
    { date: "2026-09-22", finishedAt: "2026-09-22T18:00:00", entries: [{ exercise: "Bench Press", sets: [{ w: 100, r: 5, tag: "warmup" }, { w: 100, r: 5 }] }] },
    { date: "2026-09-24", finishedAt: "2026-09-24T18:00:00", entries: [{ exercise: "Bench Press", sets: [{ w: 100, r: 5 }] }] },
    { date: "2026-09-29", finishedAt: "2026-09-29T18:00:00", entries: [{ exercise: "Bench Press", sets: [{ w: 110, r: 5 }] }] },
    { date: "2026-10-01", finishedAt: "2026-10-01T18:00:00", entries: [{ exercise: "Bench Press", sets: [{ w: 105, r: 5 }] }] },
    { date: "2026-10-03", entries: [{ exercise: "Bench Press", sets: [{ w: 200, r: 5 }] }] },
  ];
  const foodDays = {};
  for (let i = 0; i < 5; i++) {
    foodDays[addDays("2026-09-28", i)] = [{ base: { kcal: 2000, p: 140 }, servings: i === 0 ? 2 : 1 }];
  }
  const report = buildWeek({
    sessions,
    foodDays,
    weighIns: [{ date: "2026-09-22", kg: 80 }, { date: "2026-09-30", kg: 81 }],
    targets: { kcal: 2500, p: 160 },
    weightDir: "gain",
  }, "2026-09-28");
  assert.equal(report.workouts.n, 2);
  assert.equal(report.workouts.prior, 2);
  assert.equal(report.workouts.delta, 0);
  assert.equal(report.workouts.volume, 110 * 5 + 105 * 5);
  assert.equal(report.food.days, 5);
  assert.equal(report.food.kcal, (4000 + 2000 * 4) / 5);
  assert.equal(report.food.protein, (140 * 2 + 140 * 4) / 5);
  assert.equal(report.food.targetKcal, 2500);
  assert.equal(report.food.targetProtein, 160);
  assert.equal(report.weight.mean, 81);
  assert.equal(report.weight.prior, 80);
  assert.equal(report.weight.delta, 1);
  assert.equal(report.weight.better, "higher");
  assert.equal(trendTone(report.weight.delta, report.weight.better, "weight"), "up");
  assert.equal(report.standout.pr.kind, "pr");
  assert.equal(report.standout.pr.name, "Bench Press");
  assert.equal(report.standout.pr.date, "2026-09-29");
  assert.equal(report.headline, "You trained 2 times, and you set a personal record.");
  assert.equal(report.mood, undefined);
});

test("findings that applied during the week keep the engine labels, and other weeks do not borrow them", () => {
  const days = {};
  for (let i = 0; i < 40; i++) {
    const date = addDays("2026-01-05", i);
    const row = { workedOut: i % 2 === 0 };
    if (i > 0) row.readiness = (i - 1) % 2 === 0 ? 80 : 60;
    days[date] = row;
  }
  const rows = correlate({ days });
  const week = findingsForWeek(rows, { days }, "2026-01-05", "2026-01-11", 3);
  assert.ok(week.length >= 1 && week.length <= 3);
  assert.ok(week.some((r) => r.factor === "workedOut" && r.outcome === "readiness" && r.lag === 1));
  assert.ok(week.every((r) => r.valence === "good" || r.valence === "bad"));
  assert.ok(week.every((r) => !/which is a good sign|which is working against you/.test(r.lead)));
  const outside = findingsForWeek(rows, { days }, "2025-12-01", "2025-12-07", 3);
  assert.equal(outside.length, 0);

  const span = {};
  for (let i = 0; i < 7; i++) span[addDays("2026-03-02", i)] = { sleptWell: true, workedOut: i % 2 === 0 };
  const stacked = [
    { confidence: "high", valence: "good", strength: 9, percent: 4, nWith: 14, nWithout: 14, outcome: "liftPerf", factor: "sleptWell", kind: "boolean", lead: "One." },
    { confidence: "high", valence: "good", strength: 8, percent: 3, nWith: 14, nWithout: 14, outcome: "liftPerf", factor: "sleptWell", kind: "boolean", lead: "Two." },
    { confidence: "high", valence: "good", strength: 7, percent: 2, nWith: 14, nWithout: 14, outcome: "liftPerf", factor: "sleptWell", kind: "boolean", lead: "Three." },
    { confidence: "high", valence: "bad", strength: 6, percent: 2, nWith: 14, nWithout: 14, outcome: "readiness", factor: "workedOut", kind: "boolean", lead: "Four." },
  ];
  const mixed = findingsForWeek(stacked, { days: span }, "2026-03-02", "2026-03-08", 3);
  assert.equal(mixed.length, 3);
  assert.equal(mixed.filter((r) => r.outcome === "liftPerf").length, 2);
  assert.equal(mixed[2].outcome, "readiness");
});

test("sleep, weight, and the other deltas use one rounding style", () => {
  assert.equal(formatChange(-12 / 60, "hours"), "−12m");
  assert.equal(formatChange(-1.5, "hours"), "−1h 30m");
  assert.equal(formatChange(-(65 / 60), "hours"), "−1h 05m");
  assert.equal(formatChange(-0.1, "hours"), "about the same");
  assert.equal(formatChange(8, "score"), "+8");
  assert.equal(formatChange(-3, "score"), "−3");
  assert.equal(formatChange(0.4, "score"), "about the same");
  assert.equal(formatChange(-6.4, "hrv"), "−6 ms");
  assert.equal(formatChange(0.4, "rhr"), "about the same");
  assert.equal(formatChange(-5, "rhr"), "−5 bpm");
  assert.equal(formatValue(7 + 13 / 60, "hours"), "7h 13m");
  assert.equal(formatValue(58, "hrv"), "58<small> ms</small>");
  assert.equal(formatValue(52, "rhr"), "52<small> bpm</small>");
  app.wUnit = () => "lb";
  app.kgToDisp = (kg) => kg * 2.20462;
  assert.equal(formatChange(1, "weight"), "+2.2 lb");
  assert.equal(formatChange(0.02, "weight"), "about the same");
  assert.equal(formatValue(81, "weight"), "178.6<small> lb</small>");
  assert.equal(formatChange(-22200, "volume"), "−22.2k lb");
  assert.equal(formatValue(68200, "volume"), "68.2k<small> lb</small>");
  app.wUnit = () => "kg";
  app.kgToDisp = (kg) => kg;
  assert.equal(formatChange(1, "weight"), "+1.0 kg");
  assert.equal(formatValue(81, "weight"), "81.0<small> kg</small>");
});

test("dismissed weeks merge without keeping health values", () => {
  const merged = mergeWeeklyReports(
    { dismissed: ["2026-09-14", "nope"], updatedAt: 10 },
    { dismissed: ["2026-09-21", "2026-09-14"], updatedAt: 4 }
  );
  assert.deepEqual(merged.dismissed, ["2026-09-14", "2026-09-21"]);
  assert.equal(merged.updatedAt, 10);
});

test("the weekly report stays on the device and opens with an empty analytics event", () => {
  const weekly = readFileSync(new URL("../logger/js/shared/weekly.js", import.meta.url), "utf8");
  const events = readFileSync(new URL("../logger/js/usage-events.js", import.meta.url), "utf8");
  const actions = readFileSync(new URL("../logger/js/shell/actions.js", import.meta.url), "utf8");
  const sw = readFileSync(new URL("../logger/sw.js", import.meta.url), "utf8");
  const sentry = readFileSync(new URL("../logger/js/sentry.js", import.meta.url), "utf8");
  const home = readFileSync(new URL("../logger/js/pages/home.js", import.meta.url), "utf8");
  const insights = readFileSync(new URL("../logger/js/pages/insights.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("../logger/index.html", import.meta.url), "utf8");
  assert.match(events, /weekly_report_opened:\s*\(\)\s*=>\s*\(\{\}\)/);
  assert.match(actions, /capture\("weekly_report_opened"\)/);
  assert.match(sw, /insight-shell-v41/);
  assert.match(sentry, /insight-shell-v41/);
  assert.match(weekly, /kgToDisp/);
  assert.match(weekly, /week-lead/);
  assert.match(sw, /js\/shared\/weekly\.js/);
  assert.match(sw, /css\/weekly\.css/);
  assert.match(html, /css\/weekly\.css/);
  assert.match(home, /weekCardHTML/);
  assert.match(insights, /weeklyListHTML/);
  assert.match(insights, /What affects your lifts/);
  assert.match(insights, /Lift progress/);
  assert.doesNotMatch(weekly, /mood|checkin|posthog|sentry|capture\(|sendBeacon|fetch\(/i);
  assert.doesNotMatch(actions, /weekly_report_opened[\s\S]{0,120}(readiness|sleep|hrv|kcal)/);
});
