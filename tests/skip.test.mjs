import assert from "node:assert/strict";
import test from "node:test";
import { app } from "../logger/js/runtime.js";
import "../logger/js/shared/analyze.js";
import "../logger/js/pages/session.js";
import "../logger/js/pages/goals.js";
import { buildWeek } from "../logger/js/shared/weekly.js";
import {
  bestEffortAverage,
  historyEntries,
  muscleSetMap,
  reconcileSkipped,
  restoreSkipped,
  skipForToday,
  withoutSkipped,
  workingVolume,
} from "../logger/js/shared/skip.js";

function routine() {
  return [
    { name: "Bench Press", muscles: ["chest", "triceps"] },
    { name: "Cable Fly", muscles: ["chest"] },
    { name: "Dip", muscles: ["chest", "triceps"] },
  ];
}

function session(extra) {
  return {
    id: "s1",
    date: "2026-10-04",
    workoutId: "push",
    name: "Push",
    startedAt: "2026-10-04T17:00:00",
    finishedAt: null,
    entries: [
      { exercise: "Bench Press", muscles: ["chest", "triceps"], sets: [{ w: 100, r: 5 }, { w: 100, r: 5 }, { w: 100, r: 4 }] },
      { exercise: "Cable Fly", muscles: ["chest"], sets: [{ w: 20, r: 12 }] },
    ],
    ...extra,
  };
}

test("skip hides the exercise for this session and leaves the routine alone", () => {
  const saved = routine();
  const before = JSON.parse(JSON.stringify(saved));
  const s = session();
  const rec = skipForToday(s, saved[1], 1000);
  assert.equal(rec.name, "Cable Fly");
  assert.deepEqual(saved, before);
  assert.deepEqual(withoutSkipped(saved, s).map((e) => e.name), ["Bench Press", "Dip"]);
  assert.deepEqual(s.entries.map((e) => e.exercise), ["Bench Press"]);
  assert.equal(s.entries.some((e) => e.exercise === "Cable Fly"), false);
  assert.equal(s.skipped.length, 1);
  assert.equal(s.skipped[0].entry.sets.length, 1);
  assert.equal(s.mod, 1000);
});

test("undo puts the exercise and its sets back", () => {
  const s = session();
  skipForToday(s, { name: "Cable Fly", muscles: ["chest"] }, 1000);
  const back = restoreSkipped(s, "Cable Fly", 2000);
  assert.equal(back.name, "Cable Fly");
  assert.equal(s.skipped, undefined);
  assert.deepEqual(s.entries.map((e) => e.exercise), ["Bench Press", "Cable Fly"]);
  assert.equal(s.entries[1].sets[0].w, 20);
  assert.equal(s.entries[1].sets[0].r, 12);
  assert.equal(s.mod, 2000);
});

test("restore brings one skipped exercise back and leaves the other skipped", () => {
  const saved = routine();
  const s = session();
  skipForToday(s, saved[1], 1);
  skipForToday(s, saved[2], 2);
  assert.deepEqual(s.skipped.map((x) => x.name), ["Cable Fly", "Dip"]);
  restoreSkipped(s, "Dip", 3);
  assert.deepEqual(s.skipped.map((x) => x.name), ["Cable Fly"]);
  assert.deepEqual(withoutSkipped(saved, s).map((e) => e.name), ["Bench Press", "Dip"]);
  assert.equal(saved.length, 3);
  assert.equal(saved[1].name, "Cable Fly");
});

test("a skipped exercise is not a zero-set history row and does not lower the average", () => {
  const s = session();
  s.finishedAt = "2026-10-04T18:00:00";
  const both = bestEffortAverage(s);
  skipForToday(s, { name: "Cable Fly", muscles: ["chest"] });
  s.entries.push({ exercise: "Cable Fly", muscles: ["chest"], sets: [] });
  reconcileSkipped(s);
  assert.deepEqual(historyEntries(s).map((e) => e.exercise), ["Bench Press"]);
  assert.equal(historyEntries(s).some((e) => !e.sets.length), false);
  const only = bestEffortAverage(s);
  assert.ok(only > both);
  assert.equal(only, bestEffortAverage({ entries: [s.entries[0]] }));
  assert.equal(workingVolume(s), 100 * 5 + 100 * 5 + 100 * 4);
});

test("history, muscle map, weekly volume, and PRs ignore skipped work", () => {
  const day = session();
  day.finishedAt = "2026-10-04T18:00:00";
  day.startedAt = "2026-10-04T17:00:00";
  day.entries[1].sets[0].w = 200;
  skipForToday(day, { name: "Cable Fly", muscles: ["chest"] });
  const earlier = {
    id: "s0", date: "2026-09-28", startedAt: "2026-09-28T17:00:00", finishedAt: "2026-09-28T18:00:00",
    entries: [{ exercise: "Cable Fly", muscles: ["chest"], sets: [{ w: 15, r: 12 }] }],
  };
  assert.equal(muscleSetMap([day]).get("chest"), 3);
  assert.equal(muscleSetMap([day]).get("triceps"), 3);
  const report = buildWeek({ sessions: [earlier, day] }, "2026-09-28");
  assert.equal(report.workouts.volume, 15 * 12 + (100 * 5 + 100 * 5 + 100 * 4));
  assert.equal(report.standout.pr.name, "Bench Press");

  app.state = { sessions: [earlier, day], demo: false };
  app.recomputePRs("Cable Fly");
  const parked = day.skipped[0].entry.sets[0];
  assert.equal(parked.pr, undefined);
  const board = app.prBoard(app.state.sessions);
  assert.equal(board["Cable Fly"].heavy.w, 15);
  assert.equal(board["Bench Press"].heavy.w, 100);

  restoreSkipped(day, "Cable Fly");
  app.recomputePRs("Cable Fly");
  assert.ok(day.entries.find((e) => e.exercise === "Cable Fly").sets[0].pr.includes("heavy"));
  assert.equal(app.prBoard(app.state.sessions)["Cable Fly"].heavy.w, 200);
});

test("a weak skipped set does not drag the session average down", () => {
  const row = (date, fly) => ({
    id: date, date, startedAt: date + "T17:00:00", finishedAt: date + "T18:00:00",
    entries: [
      { exercise: "Bench Press", muscles: ["chest"], sets: [{ w: 100, r: 5 }] },
      { exercise: "Cable Fly", muscles: ["chest"], sets: [{ w: fly, r: 5 }] },
    ],
  });
  const days = [row("2026-09-01", 80), row("2026-09-08", 80), row("2026-09-15", 80), row("2026-09-22", 10)];
  const skipped = row("2026-09-29", 10);
  skipForToday(skipped, { name: "Cable Fly", muscles: ["chest"] });
  const perf = app.sessionPerf([...days, skipped]);
  const weak = perf.find((p) => p.date === "2026-09-22");
  const held = perf.find((p) => p.date === "2026-09-29");
  assert.ok(weak.perf < -20);
  assert.ok(Math.abs(held.perf) < 1);
  const series = app.liftSeries([...days, skipped]);
  assert.equal(series["Cable Fly"].some((p) => p.date === "2026-09-29"), false);
  assert.equal(series["Bench Press"].some((p) => p.date === "2026-09-29"), true);
});

test("skipped state survives a reload of the saved session", () => {
  const s = session();
  skipForToday(s, { name: "Dip", muscles: ["chest", "triceps"], original: "Dip" }, 50);
  const loaded = JSON.parse(JSON.stringify(s));
  loaded.entries.push({ exercise: "Dip", muscles: ["chest"], sets: [] });
  reconcileSkipped(loaded);
  assert.equal(loaded.skipped[0].name, "Dip");
  assert.equal(loaded.skipped[0].original, "Dip");
  assert.equal(loaded.entries.some((e) => e.exercise === "Dip"), false);
  assert.equal(historyEntries(loaded).some((e) => e.exercise === "Dip"), false);
  const back = restoreSkipped(loaded, "Dip");
  assert.equal(back.original, "Dip");
  assert.equal(loaded.entries.some((e) => e.exercise === "Dip"), false);
});
