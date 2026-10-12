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
