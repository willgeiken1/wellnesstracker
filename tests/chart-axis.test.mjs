import assert from "node:assert/strict";
import test from "node:test";
import { app } from "../logger/js/runtime.js";
import "../logger/js/shared/analyze.js";

function yLabels(svg) {
  return [...svg.matchAll(/<text class="ax" x="25"[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
}

test("a bodyweight chart under 2 lb does not repeat an integer tick", () => {
  const prev = app.fmtDate;
  app.fmtDate = () => "Oct 1";
  try {
    const tight = app.chartSVG({
      labels: ["2026-10-01", "2026-10-08", "2026-10-15"],
      series: [{ data: [177.1, 177.2, 177.4], cls: "ln alt" }],
      h: 110,
      fmt: (v) => v.toFixed(0),
    });
    const labels = yLabels(tight);
    assert.equal(new Set(labels).size, labels.length);
    assert.ok(labels.some((lab) => lab.includes(".")), labels.join(","));
    assert.equal(labels.filter((lab) => lab === "177").length, 0);

    const wide = app.chartSVG({
      labels: ["2026-10-01", "2026-10-08", "2026-10-15"],
      series: [{ data: [170, 177, 184], cls: "ln alt" }],
      h: 110,
      fmt: (v) => v.toFixed(0),
    });
    const wideLabels = yLabels(wide);
    assert.equal(new Set(wideLabels).size, wideLabels.length);
    assert.ok(wideLabels.every((lab) => !lab.includes(".")));
  } finally {
    app.fmtDate = prev;
  }
});

test("a tight chart keeps a custom unit suffix on decimal ticks", () => {
  const prev = app.fmtDate;
  app.fmtDate = () => "Oct 1";
  try {
    const labels = ["2026-10-01", "2026-10-02", "2026-10-03"];
    const cases = [
      { suffix: "h", yMin: 7.1, yMax: 7.9, data: [7.2, 7.4, 7.8] },
      { suffix: "k", yMin: 1.1, yMax: 1.9, data: [1.2, 1.4, 1.8] },
      { suffix: "m", yMin: 12.1, yMax: 12.9, data: [12.2, 12.4, 12.8] },
    ];
    for (const c of cases) {
      const svg = app.chartSVG({
        labels,
        series: [{ data: c.data, cls: "ln" }],
        h: 110,
        yMin: c.yMin,
        yMax: c.yMax,
        fmt: (v) => v.toFixed(0) + c.suffix,
      });
      const ticks = yLabels(svg).filter(Boolean);
      assert.equal(new Set(ticks).size, ticks.length, c.suffix);
      assert.ok(ticks.length >= 2, c.suffix);
      assert.ok(ticks.every((lab) => lab.endsWith(c.suffix)), ticks.join(","));
      assert.ok(ticks.some((lab) => lab.includes(".")), ticks.join(","));
    }
  } finally {
    app.fmtDate = prev;
  }
});
