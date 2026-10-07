import assert from "node:assert/strict";
import test from "node:test";
import { app } from "../logger/js/runtime.js";
import "../logger/js/pages/goals.js";
import "../logger/js/shared/brief.js";
import { addDays, weightTrend } from "../logger/js/shared/correlate.js";
import { HOME_WIDGETS } from "../logger/js/shared/home-widgets.js";

function points(n, stepDays, start = "2026-09-01") {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ date: addDays(start, i * stepDays), kg: 80 + i * 0.25 });
  return out;
}

test("three weigh-ins do not produce a weekly rate", () => {
  const list = points(3, 7);
  const today = list[list.length - 1].date;
  const trend = weightTrend(list, today);
  assert.equal(trend.ready, false);
  assert.equal(trend.phrase, "too early to tell");

  const prev = { weighIns: app.weighIns, today: app.today, kgToDisp: app.kgToDisp, goals: app.goals };
  app.weighIns = () => list;
  app.today = () => today;
  app.kgToDisp = (kg) => kg;
  app.goals = () => ({ weightDir: "gain" });
  try {
    assert.equal(app.weightRate(), null);
    assert.match(app.weightRateHTML(), /Too early to tell/);
    const tile = HOME_WIDGETS["weight-trend"].preview({
      today,
      sessions: [],
      foodDays: {},
      oura: {},
      weighIns: list,
    });
    assert.match(tile, /Too early to tell/);
    assert.doesNotMatch(tile, /\/wk/);
  } finally {
    app.weighIns = prev.weighIns;
    app.today = prev.today;
    app.kgToDisp = prev.kgToDisp;
    app.goals = prev.goals;
  }
});

test("five weigh-ins over 14 days share one rate", () => {
  const list = points(5, 4);
  const today = list[list.length - 1].date;
  const trend = weightTrend(list, today);
  assert.equal(trend.ready, true);
  assert.ok(trend.perWeekKg > 0);

  const prev = {
    weighIns: app.weighIns,
    today: app.today,
    kgToDisp: app.kgToDisp,
    fmtW: app.fmtW,
    wUnit: app.wUnit,
    signed: app.signed,
    state: app.state,
    addDays: app.addDays,
    dayEntries: app.dayEntries,
    sessionsInWeek: app.sessionsInWeek,
    mondayOf: app.mondayOf,
    weekGoalStatus: app.weekGoalStatus,
    pl: app.pl,
  };
  app.weighIns = () => list;
  app.today = () => today;
  app.kgToDisp = (kg) => kg;
  app.fmtW = (v) => String(Math.round(v * 10) / 10);
  app.wUnit = () => "kg";
  app.signed = (v, d = 1) => (v > 0 ? "+" : "") + Number(v).toFixed(d);
  app.state = {};
  app.addDays = addDays;
  app.dayEntries = () => [];
  app.sessionsInWeek = () => 0;
  app.mondayOf = () => addDays(today, -3);
  app.weekGoalStatus = () => null;
  app.pl = (n, word) => n + " " + word;
  try {
    const rate = app.weightRate();
    assert.ok(Math.abs(rate.perWeek - trend.perWeekKg) < 1e-9);
    assert.ok(Math.abs(rate.pct - trend.pct) < 1e-9);
    const weight = app.briefMetrics().find((row) => row.id === "weight");
    assert.match(weight.value, /kg\/wk/);
    assert.doesNotMatch(weight.meta, /Too early/);
    const tile = HOME_WIDGETS["weight-trend"].preview({
      today,
      sessions: [],
      foodDays: {},
      oura: {},
      weighIns: list,
    });
    assert.match(tile, /kg\/wk/);
  } finally {
    Object.assign(app, prev);
  }
});

test("same-day weigh-ins are one point", () => {
  const doubled = [
    { date: "2026-09-01", kg: 80 },
    { date: "2026-09-05", kg: 80 },
    { date: "2026-09-05", kg: 82 },
    { date: "2026-09-09", kg: 81 },
    { date: "2026-09-13", kg: 82 },
    { date: "2026-09-17", kg: 82 },
    { date: "2026-09-17", kg: 84 },
  ];
  const averaged = [
    { date: "2026-09-01", kg: 80 },
    { date: "2026-09-05", kg: 81 },
    { date: "2026-09-09", kg: 81 },
    { date: "2026-09-13", kg: 82 },
    { date: "2026-09-17", kg: 83 },
  ];
  const merged = weightTrend(doubled, "2026-09-17");
  const once = weightTrend(averaged, "2026-09-17");
  assert.equal(merged.ready, true);
  assert.ok(Math.abs(merged.perWeekKg - once.perWeekKg) < 1e-9);
  assert.ok(Math.abs(merged.last.kg - 83) < 1e-9);

  const fourDays = [
    { date: "2026-09-01", kg: 80 },
    { date: "2026-09-01", kg: 80.2 },
    { date: "2026-09-08", kg: 81 },
    { date: "2026-09-15", kg: 82 },
    { date: "2026-09-20", kg: 82.4 },
  ];
  assert.equal(weightTrend(fourDays, "2026-09-20").ready, false);
});
