import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { app } from "../logger/js/runtime.js";
import "../logger/js/shared/analyze.js";
import { addDays } from "../logger/js/shared/correlate.js";
import { READINESS_FRESH_DAYS, briefHeadline, readinessForAdvice } from "../logger/js/shared/brief.js";

test("a high-readiness leg day uses the local headline", () => {
  assert.equal(
    briefHeadline({ proteinLowDays: 0, readiness: 90, focus: "legs" }),
    "Readiness is high, good day for legs",
  );
});

test("three low-protein days outrank readiness", () => {
  assert.equal(
    briefHeadline({ proteinLowDays: 3, readiness: 90, focus: "legs" }),
    "Protein was low 3 days in a row",
  );
  assert.equal(briefHeadline({ proteinLowDays: 5 }), "Protein was low 5 days in a row");
});

test("low readiness, effect(), and lift status each supply a headline", () => {
  assert.equal(
    briefHeadline({ proteinLowDays: 2, readiness: 61, focus: "legs" }),
    "Readiness is low, keep today easy",
  );
  assert.equal(
    briefHeadline({
      readiness: 78,
      effectRows: [{ label: "low", avg: 0, n: 4 }, { label: "high", avg: 3.2, n: 5 }],
      lifts: [{ name: "Squat", cls: "down", label: "Declining", pctWeek: -1 }],
    }),
    "So far, you lift stronger on high-readiness days",
  );
  assert.equal(
    briefHeadline({
      effectRows: [{ label: "low", avg: 4, n: 3 }, { label: "high", avg: 1, n: 3 }],
    }),
    "So far, you lift stronger on low-readiness days",
  );
  const low = Array.from({ length: 8 }, () => 0);
  const high = Array.from({ length: 8 }, () => 4);
  assert.equal(
    briefHeadline({
      effectRows: [
        { label: "low", avg: 0, n: low.length, values: low },
        { label: "high", avg: 4, n: high.length, values: high },
      ],
    }),
    "You lift stronger on high-readiness days",
  );
  assert.equal(
    briefHeadline({ lifts: [{ name: "Bench Press", cls: "down", label: "Declining", pctWeek: -0.8 }] }),
    "Bench Press is declining",
  );
  assert.equal(
    briefHeadline({ lifts: [{ name: "Curl", cls: "flat", label: "Plateau", pctWeek: 0 }] }),
    "Curl has plateaued",
  );
  assert.equal(
    briefHeadline({ lifts: [{ name: "Row", cls: "up", label: "Progressing", pctWeek: 0.6 }] }),
    "Row is progressing",
  );
});

test("thin samples and a steady morning stay quiet", () => {
  assert.equal(
    briefHeadline({
      effectRows: [{ label: "low", avg: 1, n: 2 }, { label: "high", avg: 9, n: 1 }],
      lifts: [{ name: "Curl", cls: "up", label: "Holding steady", pctWeek: 0.1 }],
    }),
    "Here's where today stands",
  );
  assert.equal(briefHeadline({ readiness: 76 }), "Train as planned");
  assert.equal(briefHeadline({ readiness: 90 }), "Readiness is high, good day to push");
  assert.equal(briefHeadline({}), "Here's where today stands");
});

test("stale readiness does not say go easy today", () => {
  assert.equal(READINESS_FRESH_DAYS, 1);
  assert.equal(readinessForAdvice({ readiness: 40, date: "2026-10-01" }, "2026-10-06"), null);
  assert.equal(readinessForAdvice({ readiness: 40, date: "2026-10-05" }, "2026-10-06"), 40);
  assert.equal(readinessForAdvice({ readiness: 40, date: "2026-10-06" }, "2026-10-06"), 40);
  assert.equal(readinessForAdvice({ readiness: 40 }, "2026-10-06"), null);

  const prev = {
    state: app.state,
    today: app.today,
    addDays: app.addDays,
    activeSession: app.activeSession,
    sessionsOn: app.sessionsOn,
    latestOura: app.latestOura,
    src: app.src,
    weekGoalStatus: app.weekGoalStatus,
    dayEntries: app.dayEntries,
    sessionsInWeek: app.sessionsInWeek,
    mondayOf: app.mondayOf,
    pl: app.pl,
    weighIns: app.weighIns,
    fmtW: app.fmtW,
    kgToDisp: app.kgToDisp,
  };
  const trainOn = (date) => {
    app.today = () => "2026-10-06";
    app.addDays = addDays;
    app.state = { layout: { home: { hidden: ["today", "readiness"] } }, plan: {} };
    app.activeSession = () => null;
    app.sessionsOn = () => [];
    app.latestOura = () => ({ date, readiness: 40 });
    app.src = () => ({ oura: {} });
    app.weekGoalStatus = () => null;
    app.dayEntries = () => [];
    app.sessionsInWeek = () => 0;
    app.mondayOf = () => "2026-10-05";
    app.pl = (n, word) => n + " " + word;
    app.weighIns = () => [];
    app.fmtW = (v) => String(v);
    app.kgToDisp = (kg) => kg;
    return app.briefMetrics().find((row) => row.id === "train");
  };
  try {
    assert.equal(trainOn("2026-10-01").value, "Rest suggested");
    assert.equal(trainOn("2026-10-05").value, "Go easy today");
    assert.equal(trainOn("2026-10-06").value, "Go easy today");
  } finally {
    Object.assign(app, prev);
  }
});

test("the card is wired to readiness, lift status, effect, and the account blob", () => {
  const src = readFileSync(new URL("../logger/js/shared/brief.js", import.meta.url), "utf8");
  assert.match(src, /app\.readinessLevel\(/);
  assert.match(src, /app\.liftStatus\(/);
  assert.match(src, /app\.effect\(/);
  assert.match(src, /brief-grip/);
  const cloud = readFileSync(new URL("../logger/js/shared/cloud.js", import.meta.url), "utf8");
  assert.match(cloud, /brief: app\.state\.brief/);
  const state = readFileSync(new URL("../logger/js/data/state.js", import.meta.url), "utf8");
  assert.match(state, /brief: d\.brief/);
});
