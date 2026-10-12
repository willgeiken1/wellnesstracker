import assert from "node:assert/strict";
import test from "node:test";
import { app } from "../logger/js/runtime.js";
import "../logger/js/shared/analyze.js";
import { addDays, weightTrend } from "../logger/js/shared/correlate.js";
import "../logger/js/pages/insight-widgets.js";

const TODAY = "2026-10-06";

function meal(name, kcal) {
  return { meal: name, base: { kcal, p: 40, c: 50, f: 20 }, servings: 1 };
}

function withApp(food, weighIns, run) {
  const prev = {
    state: app.state,
    today: app.today,
    dayEntries: app.dayEntries,
    weighIns: app.weighIns,
    autoTargets: app.autoTargets,
    esc: app.esc,
    goals: app.goals,
    kgToDisp: app.kgToDisp,
    signed: app.signed,
    wUnit: app.wUnit,
    pl: app.pl,
    addDays: app.addDays,
    parseDay: app.parseDay,
  };
  app.state = { demo: false };
  app.today = () => TODAY;
  app.addDays = addDays;
  app.parseDay = (s) => new Date(s + "T12:00:00Z");
  app.dayEntries = (d) => food[d] || [];
  app.weighIns = () => weighIns;
  app.autoTargets = () => ({ basis: { tdee: 2400 } });
  app.esc = (s) => String(s == null ? "" : s);
  app.goals = () => ({ weightDir: "maintain" });
  app.kgToDisp = (kg) => kg;
  app.signed = (v, d = 1) => (v > 0 ? "+" : v < 0 ? "-" : "") + Number(v).toFixed(d);
  app.wUnit = () => "kg";
  app.pl = (n, word) => n + " " + word + (n === 1 ? "" : "s");
  try {
    return run();
  } finally {
    Object.assign(app, prev);
  }
}

test("maintenance uses the shared weight trend and skips a snack day", () => {
  const food = {};
  for (let i = 0; i < 14; i++) food[addDays(TODAY, -i)] = [meal("lunch", 2500)];
  for (let i = 20; i < 25; i++) food[addDays(TODAY, -i)] = [meal("snacks", 180)];
  const weighIns = [];
  for (let i = 0; i < 5; i++) weighIns.push({ date: addDays("2026-09-10", i * 4), kg: 80 + i * 0.4 });
  weighIns.push({ date: weighIns[weighIns.length - 1].date, kg: 80 + 4 * 0.4 });
  const averaged = weighIns.slice(0, -1);
  withApp(food, weighIns, () => {
    const rep = app.maintenanceReport();
    const trend = weightTrend(averaged, TODAY);
    assert.equal(rep.empty, false);
    assert.equal(rep.days, 14);
    assert.equal(rep.intake, 2500);
    assert.equal(rep.weighIns, 5);
    const maint = Math.round((2500 - trend.perWeekKg / 7 * 7700) / 10) * 10;
    assert.equal(rep.maint, maint);
    assert.equal(rep.tdee, 2400);
    assert.match(app.maintenanceHTML(), /2,500/);
  });
});

test("maintenance stays empty until the trend helper is ready and food days are complete", () => {
  const food = {};
  for (let i = 0; i < 14; i++) food[addDays(TODAY, -i)] = [meal("breakfast", 400), meal("dinner", 400)];
  const short = [
    { date: "2026-09-20", kg: 80 },
    { date: "2026-09-27", kg: 80.2 },
    { date: "2026-10-04", kg: 80.4 },
  ];
  withApp(food, short, () => {
    const rep = app.maintenanceReport();
    assert.equal(rep.empty, true);
    assert.equal(rep.scale, false);
    assert.equal(rep.days, 14);
    assert.match(app.maintenanceHTML(), /5 weigh-ins over 14 days/);
  });

  const snacks = {};
  for (let i = 0; i < 20; i++) snacks[addDays(TODAY, -i)] = [meal("snacks", 180)];
  const enough = [];
  for (let i = 0; i < 5; i++) enough.push({ date: addDays("2026-09-10", i * 4), kg: 80 });
  withApp(snacks, enough, () => {
    const rep = app.maintenanceReport();
    assert.equal(rep.empty, true);
    assert.equal(rep.days, 0);
    assert.equal(rep.scale, true);
    assert.match(app.maintenanceHTML(), /14\+ days/);
  });
});
