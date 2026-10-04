import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { briefHeadline } from "../logger/js/shared/brief.js";

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
    "You lift stronger on high-readiness days",
  );
  assert.equal(
    briefHeadline({
      effectRows: [{ label: "low", avg: 4, n: 3 }, { label: "high", avg: 1, n: 3 }],
    }),
    "You lift stronger on low-readiness days",
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
