import assert from "node:assert/strict";
import test from "node:test";
import { groupStallAdvice, stallAdvice, stallWindow } from "../logger/js/pages/insight-widgets.js";

const pt = (date, v) => ({ date, v });

test("a lift is not stalled after only 2 or 3 weeks without a record", () => {
  const s = [pt("2026-08-01", 100), pt("2026-09-20", 110), pt("2026-09-22", 105), pt("2026-09-25", 106), pt("2026-09-28", 105), pt("2026-09-30", 104)];
  const w = stallWindow(s, "2026-10-04");
  assert.equal(w.prDate, "2026-09-20");
  assert.equal(w.days, 14);
  assert.equal(w.ok, false);
  assert.equal(stallWindow(s, "2026-10-10").ok, false); // 20 days, 4 sessions
  assert.equal(stallWindow(s, "2026-10-18").ok, true); // 28 days, 4 sessions
});

test("needs at least 4 weeks and at least 4 sessions since the best", () => {
  const base = [pt("2026-08-01", 100), pt("2026-08-15", 110)];
  const since = ["2026-08-20", "2026-08-30", "2026-09-05"].map((d) => pt(d, 100));
  assert.equal(stallWindow([...base, ...since], "2026-10-04").ok, false, "3 sessions");
  const four = [...base, ...since, pt("2026-09-12", 100)];
  assert.equal(stallWindow(four, "2026-10-04").ok, true);
  assert.equal(stallWindow(four, "2026-09-11").ok, false, "27 days");
  assert.equal(stallWindow(four, "2026-10-04").sessionsSince, 4);
  assert.equal(stallWindow(four, "2026-10-04").weeks, 7);
});

test("advice differs when the situation differs", () => {
  const a = stallAdvice({ weeks: 5, sessionsSince: 6, repsAvg: 14, volume: null, bwPct: null });
  const b = stallAdvice({ weeks: 5, sessionsSince: 6, repsAvg: 2, volume: null, bwPct: null });
  const c = stallAdvice({ weeks: 9, sessionsSince: 6, repsAvg: 8, volume: "down", bwPct: null });
  const d = stallAdvice({ weeks: 5, sessionsSince: 4, repsAvg: 8, volume: null, bwPct: null });
  const e = stallAdvice({ weeks: 5, sessionsSince: 15, repsAvg: 8, volume: null, bwPct: null });
  const f = stallAdvice({ weeks: 5, sessionsSince: 6, repsAvg: 8, volume: null, bwPct: -3 });
  assert.equal(new Set([a, b, c, d, e, f]).size, 6);
  assert.match(a, /14 reps/);
  assert.match(b, /2 reps/);
  assert.match(c, /fell/);
  assert.match(c, /9 weeks/);
  assert.match(d, /0\.8 times a week/);
  assert.match(e, /3 times a week/);
  assert.match(f, /down about 3%/);
});

test("identical situations give identical advice, and grouping shows it once", () => {
  const ctx = { weeks: 5, sessionsSince: 6, repsAvg: 8, volume: null, bwPct: null };
  const same = stallAdvice(ctx);
  assert.equal(stallAdvice({ ...ctx }), same);
  const other = stallAdvice({ ...ctx, repsAvg: 14 });
  const groups = groupStallAdvice([
    { name: "Bench", advice: same },
    { name: "Row", advice: other },
    { name: "Squat", advice: same },
    { name: "Curl", advice: "" },
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0], { advice: same, names: ["Bench", "Squat"] });
  assert.deepEqual(groups[1].names, ["Row"]);
});
