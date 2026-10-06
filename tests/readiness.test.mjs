import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  applyRpe,
  applyTrainingAdjust,
  bestEpley,
  meanRpe,
  quietReadinessNote,
  readinessAdjust,
  summarizeReadiness,
} from "../logger/js/pages/session.js";

const up = { w: 190, r: 5, kind: "up", sets: 3, inc: 5, why: "You hit 5 reps on every set at 185 last time." };
const thin = { highN: 0, lowN: 0, highAvg: null, lowAvg: null };

test("high readiness adds one increment, normal holds, low drops a set", () => {
  const high = readinessAdjust(up, 88, thin, "lb");
  assert.equal(high.w, 195);
  assert.equal(high.r, 5);
  assert.equal(high.sets, 3);
  assert.equal(high.ready, "Readiness 88, suggesting +5 lb");
  assert.equal(high.adjusted, true);

  const mid = readinessAdjust(up, 76, thin, "lb");
  assert.equal(mid.w, 190);
  assert.equal(mid.sets, 3);
  assert.equal(mid.ready, "Readiness 76, holding steady");
  assert.equal(mid.adjusted, false);

  const low = readinessAdjust(up, 58, thin, "lb");
  assert.equal(low.w, 190);
  assert.equal(low.sets, 2);
  assert.equal(low.ready, "Readiness 58, dropping a set today");
  assert.equal(low.adjusted, true);
});

test("a short session backs off weight instead of dropping the only sets", () => {
  const low = readinessAdjust({ ...up, sets: 2 }, 58, thin, "lb");
  assert.equal(low.w, 185);
  assert.equal(low.sets, 2);
  assert.equal(low.ready, "Readiness 58, suggesting −5 lb");
});

test("no readiness score leaves the normal plan alone", () => {
  for (const score of [null, undefined]) {
    const out = readinessAdjust(up, score, thin, "lb");
    assert.equal(out.w, 190);
    assert.equal(out.sets, 3);
    assert.equal(out.ready, null);
    assert.equal(out.adjusted, false);
  }
});

test("thin history stays gentle, and enough history can hold or switch to a weight cut", () => {
  const flat = { highN: 3, lowN: 3, highAvg: 100, lowAvg: 100 };
  const held = readinessAdjust(up, 90, flat, "lb");
  assert.equal(held.w, 190);
  assert.equal(held.adjusted, false);
  assert.equal(held.ready, "Readiness 90, holding steady");

  const stronger = { highN: 4, lowN: 3, highAvg: 110, lowAvg: 100 };
  const bumped = readinessAdjust(up, 90, stronger, "lb");
  assert.equal(bumped.w, 195);
  assert.match(bumped.ready, /suggesting \+5 lb/);

  const weaker = { highN: 3, lowN: 3, highAvg: 100, lowAvg: 90 };
  const cut = readinessAdjust(up, 58, weaker, "lb");
  assert.equal(cut.w, 185);
  assert.equal(cut.sets, 3);
  assert.equal(cut.ready, "Readiness 58, suggesting −5 lb");

  const close = { highN: 3, lowN: 3, highAvg: 100, lowAvg: 98 };
  const dropped = readinessAdjust(up, 58, close, "lb");
  assert.equal(dropped.w, 190);
  assert.equal(dropped.sets, 2);
});

test("a deload is not pushed heavier on a high-readiness day", () => {
  const down = { w: 165, r: 5, kind: "down", sets: 3, inc: 5 };
  const out = readinessAdjust(down, 92, thin, "lb");
  assert.equal(out.w, 165);
  assert.equal(out.adjusted, false);
});

test("bodyweight uses reps, and RPE nudges the normal plan", () => {
  const bw = { w: null, r: 11, kind: "bw", sets: 3, inc: 1 };
  assert.equal(readinessAdjust(bw, 88, thin, "lb").r, 12);
  assert.equal(readinessAdjust(bw, 88, thin, "lb").ready, "Readiness 88, suggesting +1 rep");
  assert.equal(readinessAdjust(bw, 58, thin, "lb").sets, 2);
  assert.equal(readinessAdjust({ ...bw, sets: 2 }, 58, thin, "lb").r, 10);

  assert.equal(applyRpe(up, 6).w, 195);
  assert.equal(applyRpe(up, 8).w, 190);
  assert.equal(applyRpe(up, 9).w, 185);
  assert.equal(applyRpe({ w: 185, r: 5, kind: "same", inc: 5 }, 9).w, 185);
  assert.equal(applyRpe({ w: 185, r: 5, kind: "same", inc: 5 }, 10).w, 180);
  assert.equal(applyRpe(bw, 6).r, 12);
  assert.equal(applyRpe(bw, 9).r, 10);
  assert.equal(applyRpe(up, null).w, 190);
});

test("dismiss keeps the post-RPE plan and drops only the readiness layer", () => {
  const history = { highN: 1, lowN: 0, highAvg: 120, lowAvg: null };
  const on = applyTrainingAdjust(up, { avgRpe: 6, readiness: 88, history, unit: "lb", lastW: 185 });
  assert.equal(on.w, 200);
  assert.equal(on.base.w, 195);
  assert.equal(on.adjusted, true);
  assert.match(on.why, /felt easy/);
  assert.match(on.ready, /suggesting \+5 lb/);

  const off = applyTrainingAdjust(up, { avgRpe: 6, readiness: 88, history, unit: "lb", lastW: 185, dismissed: true });
  assert.equal(off.w, off.base.w);
  assert.equal(off.w, 195);
  assert.equal(off.ready, null);
  assert.equal(off.adjusted, false);
  assert.equal(off.canReady, true);
  assert.equal(off.plain, true);
});

test("missing history gets a quiet note and no invented numbers", () => {
  assert.equal(quietReadinessNote(null), "");
  assert.equal(quietReadinessNote(76), "");
  assert.match(quietReadinessNote(58), /No history yet/);
  assert.match(quietReadinessNote(58), /nothing is changed/);
  assert.match(quietReadinessNote(88), /usual plan stands/);
});

test("epley and RPE averages ignore warm-ups", () => {
  const sets = [{ w: 100, r: 5, tag: "warmup" }, { w: 140, r: 5, rpe: 8 }, { w: 140, r: 3, rpe: 10 }];
  assert.equal(bestEpley(sets), 140 * (1 + 5 / 30));
  assert.equal(meanRpe(sets), 9);
  const rows = summarizeReadiness([
    { readiness: 90, perf: 110 }, { readiness: 86, perf: 112 }, { readiness: 88, perf: 108 },
    { readiness: 60, perf: 90 }, { readiness: 55, perf: 92 }, { readiness: 64, perf: 88 },
    { readiness: 75, perf: 200 },
  ]);
  assert.equal(rows.highN, 3);
  assert.equal(rows.lowN, 3);
  assert.ok(rows.highAvg > 100 && rows.lowAvg < 100);
});

test("the workout shell saves RPE, offers a normal plan, and bumps the cache", () => {
  const session = readFileSync(new URL("../logger/js/pages/session.js", import.meta.url), "utf8");
  const actions = readFileSync(new URL("../logger/js/shell/actions.js", import.meta.url), "utf8");
  const workout = readFileSync(new URL("../logger/js/shell/workout.js", import.meta.url), "utf8");
  const sw = readFileSync(new URL("../logger/sw.js", import.meta.url), "utf8");
  const purge = readFileSync(new URL("../logger/js/shared/purge.js", import.meta.url), "utf8");
  assert.doesNotMatch(session, /fine call too/);
  assert.match(actions, /set\.rpe = d\.rpe/);
  assert.match(actions, /sugg-plain/);
  assert.match(workout, /rpeChipsHTML/);
  assert.match(workout, /badge rpe/);
  assert.match(sw, /insight-shell-v35/);
  assert.match(purge, /"rpe"/);
});
