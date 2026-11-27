import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

/* Synthetic compounds only. Zephyrlane Marker Qx is a fake name, and
   2026-03-17 is a fake start date. Nothing here is a person or a real stack. */

function el() {
  return {
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    appendChild() {},
    remove() {},
    click() {},
    classList: { add() {}, remove() {}, toggle() {} },
    style: {},
    dataset: {},
    hidden: true,
    innerHTML: "",
  };
}
const memory = new Map([["insight-share-analytics", "1"]]);
globalThis.document = {
  addEventListener() {},
  removeEventListener() {},
  documentElement: { dataset: {}, classList: { add() {}, remove() {} } },
  body: el(),
  head: el(),
  querySelector: () => el(),
  querySelectorAll: () => [],
  getElementById: () => el(),
  createElement: () => el(),
};
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
};

const { app } = await import("../logger/js/runtime.js");
await import("../logger/js/shared/analyze.js");
const { mergeDailyRoutines, normalizeDailyRoutines, revisePlanEntity } = await import("../logger/js/shared/daily-routines-store.js");
const {
  chartLineOptInHTML,
  setCompoundChartLine,
  startedChartMarkers,
} = await import("../logger/js/shared/routine-chart-lines.js");
const { addRoutineItem, dailyRoutinesHTML, logRoutineItem, routineItemDraft, saveRoutineItem } = await import("../logger/js/pages/daily-routines.js");
await import("../logger/js/pages/insights.js");
await import("../logger/js/shared/profile.js");
const { scrubEvent } = await import("../logger/js/sentry-scrub.js");
const { sanitizeCapture, sanitizePosthogEvent } = await import("../logger/js/usage-events.js");

const NAME = "Zephyrlane Marker Qx";
const DATE = "2026-03-17";
const AMOUNT = 424242;

function addDays(day, n) {
  const time = Date.parse(`${day}T00:00:00Z`) + n * 86400000;
  return new Date(time).toISOString().slice(0, 10);
}

function compound(id, extra = {}) {
  return {
    id,
    name: "Example Compound A",
    amount: 250,
    unit: "mcg",
    startDate: "2026-11-08",
    archivedAt: null,
    chartLine: false,
    updatedAt: 10,
    deletedAt: null,
    ...extra,
  };
}

function store(compounds) {
  return {
    updatedAt: 10,
    blocks: [],
    items: [],
    placements: [],
    compounds,
    logs: [{
      id: "log-1", itemId: "item-a", compoundId: compounds[0] ? compounds[0].id : "compound-a",
      day: "2026-11-08", status: "done", amount: 250, unit: "mcg", at: 10, updatedAt: 10, deletedAt: null,
    }],
    prefs: { lastBlockId: null, updatedAt: 10 },
  };
}

function chart(labels, markers) {
  const spec = {
    labels,
    series: [{ data: labels.map((_, i) => 40 + i), cls: "ln" }],
    h: 110,
  };
  if (markers) spec.markers = markers;
  return app.chartSVG(spec);
}

function svgAfter(html, heading) {
  const at = html.indexOf(`<h4>${heading}</h4>`);
  assert.ok(at >= 0, heading);
  const start = html.indexOf("<svg", at);
  const end = html.indexOf("</svg>", start);
  assert.ok(start >= 0 && end > start, heading);
  return html.slice(start, end + 6);
}

function ouraDays(start, count) {
  const days = {};
  for (let i = 0; i < count; i++) {
    const date = addDays(start, i);
    days[date] = {
      date, readiness: 80, total: 27000, hrv: 40 + i, rhr: 55, sleepScore: 80,
      deep: 4000, rem: 5000, light: 14000, awake: 600, temp: 0.1, steps: 8000,
    };
  }
  return days;
}

function bootPage(routines) {
  app.fmtDate = () => "Nov";
  app.addDays = addDays;
  app.today = () => "2026-11-20";
  app.widgetize = (_page, html) => html;
  app.syncedAgo = () => "just now";
  app.weightRateHTML = () => "";
  app.round1 = (v) => Math.round(Number(v) * 10) / 10;
  app.pageHead = () => "<h1>Insights</h1>";
  app.addButtonHTML = () => "";
  app.ui = { range: 14, ouraSyncing: false, iseg: "recovery", weekOpen: null, sheet: null, sd: {} };
  app.state = {
    demo: false,
    sessions: [],
    oura: { connected: true, days: ouraDays("2026-11-07", 14) },
    dailyRoutines: routines,
    profile: { units: "imperial", weighIns: [] },
  };
}

describe("started lines on Insights charts", { concurrency: false }, () => {
  test("the line is off by default and an empty marker list matches the current chart", () => {
    app.fmtDate = () => "Nov";
    const labels = ["2026-11-01", "2026-11-08", "2026-11-15"];
    const plain = chart(labels);
    const empty = chart(labels, []);
    assert.equal(empty, plain);
    assert.doesNotMatch(plain, /started/);
    app.ROUTINES_ENABLED = true;
    app.session = { user: { id: "synthetic-user" } };
    const markers = startedChartMarkers(store([compound("compound-a")]), labels);
    assert.deepEqual(markers, []);
    assert.equal(chart(labels, markers), plain);
    const normalized = normalizeDailyRoutines(store([compound("compound-a", { chartLine: "true" })]));
    assert.equal(normalized.compounds[0].chartLine, false);
    app.ROUTINES_ENABLED = false;
    app.session = null;
  });

  test("a start date lands on that day's x, between sparse weigh-ins, and between weekly points", () => {
    app.fmtDate = () => "Nov";
    const days = ["2026-11-01", "2026-11-08", "2026-11-15"];
    const exact = chart(days, [{ date: "2026-11-08", label: "Started Example Compound A" }]);
    assert.match(exact, /class="started"/);
    assert.match(exact, /x1="181.0"/);
    assert.match(exact, /Started Example Compound A/);
    assert.doesNotMatch(exact, /2026-11-08/);

    const sparse = chart(["2026-11-01", "2026-11-15"], [{ date: "2026-11-02", label: "Started Example Compound A" }]);
    assert.match(sparse, /x1="51.6"/);

    const weeks = ["2026-11-02", "2026-11-09", "2026-11-16"];
    const midweek = chart(weeks, [{ date: "2026-11-11", label: "Started Example Compound A" }]);
    assert.match(midweek, /x1="224.1"/);

    app.ROUTINES_ENABLED = true;
    app.session = { user: { id: "synthetic-user" } };
    app.sb = null;
    const currentWeek = store([compound("compound-a", { chartLine: true, startDate: "2026-11-18" })]);
    assert.deepEqual(startedChartMarkers(currentWeek, weeks), []);
    const onLastWeek = startedChartMarkers(currentWeek, weeks, { bucketDays: 7 });
    assert.deepEqual(onLastWeek, [{ date: "2026-11-16", label: "Started Example Compound A" }]);
    assert.match(chart(weeks, onLastWeek), /x1="332.0"/);
    const midBucket = startedChartMarkers(store([compound("compound-a", { chartLine: true, startDate: "2026-11-11" })]), weeks, { bucketDays: 7 });
    assert.equal(midBucket[0].date, "2026-11-09");
    assert.match(chart(weeks, midBucket), /x1="181.0"/);
    const weekSunday = startedChartMarkers(store([compound("compound-a", { chartLine: true, startDate: "2026-11-22" })]), weeks, { bucketDays: 7 });
    assert.equal(weekSunday[0].date, "2026-11-16");
    assert.deepEqual(startedChartMarkers(store([compound("compound-a", { chartLine: true, startDate: "2026-11-23" })]), weeks, { bucketDays: 7 }), []);
    app.ROUTINES_ENABLED = false;
    app.session = null;

    const outside = chart(days, [{ date: "2026-10-01", label: "Started Example Compound A" }]);
    assert.equal(outside, chart(days));
    const after = chart(days, [{ date: "2026-12-01", label: "Started Example Compound A" }]);
    assert.equal(after, chart(days));
  });

  test("only an opted-in live compound inside the window is labeled", () => {
    app.ROUTINES_ENABLED = true;
    app.session = { user: { id: "synthetic-user" } };
    app.sb = null;
    const labels = ["2026-11-01", "2026-11-08", "2026-11-15"];
    const rows = [
      compound("compound-a", { chartLine: true, name: "Example Compound A" }),
      compound("compound-b", { name: "Example Compound B", startDate: "2026-11-01" }),
      compound("compound-c", { chartLine: true, name: "Example Compound C", startDate: "2026-10-01" }),
      compound("compound-d", {
        chartLine: true, name: "Example Compound D", startDate: "2026-11-15", deletedAt: 50, updatedAt: 50,
      }),
      compound("compound-e", { chartLine: true, name: "Example\nCompound E", startDate: "2026-11-15", archivedAt: 4 }),
    ];
    const markers = startedChartMarkers(store(rows), labels);
    assert.deepEqual(markers.map((row) => row.label), ["Started Example Compound A", "Started Example Compound E"]);
    assert.equal(markers[1].date, "2026-11-15");
    const svg = chart(labels, markers);
    assert.match(svg, /Started Example Compound A/);
    assert.match(svg, /Started Example Compound E/);
    assert.doesNotMatch(svg, /Example Compound B|Example Compound C|Example Compound D/);
    assert.doesNotMatch(svg, /started-label[^>]*>[^<]*\n/);
    const escaped = chart(labels, [{ date: "2026-11-08", label: `Started Qx <A> & "B"` }]);
    assert.match(escaped, /Started Qx &lt;A&gt; &amp; &quot;B&quot;/);
    assert.doesNotMatch(escaped, /<A>/);
    app.ROUTINES_ENABLED = false;
    assert.deepEqual(startedChartMarkers(store([compound("compound-a", { chartLine: true })]), labels), []);
    app.ROUTINES_ENABLED = true;
    app.session = null;
    assert.deepEqual(startedChartMarkers(store([compound("compound-a", { chartLine: true })]), labels), []);
    app.session = null;
    app.ROUTINES_ENABLED = false;
  });

  test("the switch defaults off, and turning it on does not rewrite logs or the start date", () => {
    app.ROUTINES_ENABLED = true;
    app.session = { user: { id: "synthetic-user" } };
    app.sb = null;
    app.cloudPullOk = true;
    const initial = store([
      compound("compound-a", { name: NAME, amount: AMOUNT, startDate: DATE, chartLine: false }),
      compound("compound-b", { name: "Example Compound B", startDate: "2026-11-02" }),
    ]);
    app.state = { dailyRoutines: initial };
    const off = chartLineOptInHTML(app.state.dailyRoutines, "insights");
    assert.match(off, /aria-checked="false"/);
    assert.match(off, /Started Zephyrlane Marker Qx/);
    assert.match(off, /data-action="routines-chart-line"/);
    assert.match(off, /data-on="1"/);
    assert.doesNotMatch(off, /424242|mcg|<script/);
    const nasty = chartLineOptInHTML(store([compound("compound-a", { name: `Qx <b>A</b> & "Z"` })]), "insights");
    assert.match(nasty, /Qx &lt;b&gt;A&lt;\/b&gt; &amp; &quot;Z&quot;/);
    assert.doesNotMatch(nasty, /<b>/);

    const logs = structuredClone(app.state.dailyRoutines.logs);
    assert.equal(setCompoundChartLine(app.state, "compound-a", true), true);
    const saved = app.state.dailyRoutines.compounds.find((row) => row.id === "compound-a");
    assert.equal(saved.chartLine, true);
    assert.equal(saved.startDate, DATE);
    assert.equal(saved.amount, AMOUNT);
    assert.deepEqual(app.state.dailyRoutines.logs, logs);
    assert.equal(app.state.dailyRoutines.compounds.find((row) => row.id === "compound-b").chartLine, false);
    const on = chartLineOptInHTML(app.state.dailyRoutines, "weight");
    assert.match(on, /id="dr-chart-line-weight-0"/);
    assert.match(on, /aria-checked="true"/);
    assert.match(on, /data-on="0"/);
    assert.equal(setCompoundChartLine(app.state, "compound-a", true), false);

    app.sb = { functions: { invoke() { throw new Error("network"); } } };
    app.cloudPullOk = false;
    assert.equal(setCompoundChartLine(app.state, "compound-a", false), false);
    assert.equal(app.state.dailyRoutines.compounds.find((row) => row.id === "compound-a").chartLine, true);
    app.cloudPullOk = true;
    app.ROUTINES_ENABLED = false;
    assert.equal(setCompoundChartLine(app.state, "compound-a", false), false);
    app.ROUTINES_ENABLED = true;
    app.session = null;
    assert.equal(setCompoundChartLine(app.state, "compound-a", false), false);
    app.ROUTINES_ENABLED = false;
    app.sb = null;
  });

  test("a newer chart choice wins a merge, and editing the item keeps the line", () => {
    const older = store([compound("compound-a", { chartLine: false, updatedAt: 10 })]);
    const newer = store([compound("compound-a", { chartLine: true, updatedAt: 20 })]);
    assert.equal(mergeDailyRoutines(older, newer).compounds[0].chartLine, true);
    assert.equal(mergeDailyRoutines(newer, older).compounds[0].chartLine, true);
    const tieOff = store([compound("compound-a", { chartLine: false, updatedAt: 20 })]);
    const tieOn = store([compound("compound-a", { chartLine: true, updatedAt: 20 })]);
    assert.equal(mergeDailyRoutines(tieOn, tieOff).compounds[0].chartLine, true);
    const renamed = revisePlanEntity(newer, "compounds", "compound-a", { name: "Example Compound B" }, 30);
    assert.equal(renamed.compounds[0].chartLine, true);
    assert.equal(renamed.compounds[0].startDate, "2026-11-08");
    assert.deepEqual(renamed.logs, newer.logs);

    app.ROUTINES_ENABLED = true;
    app.session = { user: { id: "synthetic-user" } };
    app.sb = null;
    app.cloudPullOk = true;
    app.state = { dailyRoutines: null };
    app.ui = { sheet: null, sd: {}, dailyRoutineEdit: false };
    app.save = () => {};
    app.render = () => {};
    app.today = () => "2026-11-19";
    app.routineNow = () => new Date(2026, 10, 19, 8, 30, 0);
    dailyRoutinesHTML();
    const morning = app.state.dailyRoutines.blocks.find((row) => row.name === "Morning routine");
    assert.equal(addRoutineItem(app.state, morning.id, { name: "Example Compound A", kind: "dose", amount: "250", unit: "mcg" }), true);
    const item = app.state.dailyRoutines.items.find((row) => row.name === "Example Compound A");
    const row = app.state.dailyRoutines.compounds.find((entry) => entry.id === item.compoundId);
    assert.equal(row.chartLine, false);
    assert.equal(row.startDate, "2026-11-19");
    assert.equal(setCompoundChartLine(app.state, row.id, true), true);
    assert.equal(logRoutineItem(app.state, item.id), true);
    const beforeLogs = structuredClone(app.state.dailyRoutines.logs);
    const draft = routineItemDraft(app.state, { itemId: item.id, blockId: morning.id });
    draft.amount = "500";
    assert.equal(saveRoutineItem(app.state, draft), true);
    const after = app.state.dailyRoutines.compounds.find((entry) => entry.id === item.compoundId);
    assert.equal(after.chartLine, true);
    assert.equal(after.startDate, "2026-11-19");
    assert.equal(after.amount, 500);
    assert.deepEqual(app.state.dailyRoutines.logs, beforeLogs);
    app.ROUTINES_ENABLED = false;
    app.session = null;
  });

  test("sleep and HRV gain the line, readiness and resting heart rate stay plain", () => {
    app.ROUTINES_ENABLED = false;
    app.session = null;
    const routines = store([compound("compound-a", { name: NAME, amount: AMOUNT, startDate: "2026-11-14", chartLine: true })]);
    bootPage(routines);
    const off = app.recoveryHTML();
    app.ROUTINES_ENABLED = true;
    app.session = { user: { id: "synthetic-user" } };
    app.state.dailyRoutines = store([compound("compound-a", { name: NAME, amount: AMOUNT, startDate: "2026-11-14", chartLine: false })]);
    const stillOff = app.recoveryHTML();
    for (const heading of ["Readiness", "Sleep", "HRV", "Resting heart rate"]) {
      assert.equal(svgAfter(stillOff, heading), svgAfter(off, heading));
      assert.doesNotMatch(svgAfter(stillOff, heading), new RegExp(NAME));
    }
    app.state.dailyRoutines = routines;
    const on = app.recoveryHTML();
    assert.match(svgAfter(on, "Sleep"), new RegExp(`Started ${NAME}`));
    assert.match(svgAfter(on, "Sleep"), /class="started"/);
    assert.match(svgAfter(on, "HRV"), new RegExp(`Started ${NAME}`));
    assert.doesNotMatch(svgAfter(on, "Readiness"), /class="started"|Zephyrlane/);
    assert.doesNotMatch(svgAfter(on, "Resting heart rate"), /class="started"|Zephyrlane/);
    assert.doesNotMatch(svgAfter(on, "Sleep"), new RegExp(String(AMOUNT)));
    assert.doesNotMatch(svgAfter(on, "Sleep"), /2026-11-14/);
    app.ROUTINES_ENABLED = false;
    app.session = null;
  });

  test("the weight chart uses the same opt-in and matches today when it is off", () => {
    const routines = store([compound("compound-a", { name: NAME, amount: AMOUNT, startDate: "2026-11-01", chartLine: true })]);
    bootPage(routines);
    app.state.profile = {
      units: "imperial",
      weighIns: [{ date: "2026-10-01", kg: 80 }, { date: "2026-11-18", kg: 81 }],
    };
    app.ROUTINES_ENABLED = false;
    app.session = null;
    const off = app.bodyweightCardHTML();
    assert.doesNotMatch(off, /Started lines|Zephyrlane|class="started"/);
    app.ROUTINES_ENABLED = true;
    app.session = { user: { id: "synthetic-user" } };
    app.state.dailyRoutines = store([compound("compound-a", { name: NAME, amount: AMOUNT, startDate: "2026-11-01", chartLine: false })]);
    const optedOut = app.bodyweightCardHTML();
    assert.match(optedOut, /aria-checked="false"/);
    const offSvg = off.slice(off.indexOf("<svg"), off.indexOf("</svg>") + 6);
    const outSvg = optedOut.slice(optedOut.indexOf("<svg"), optedOut.indexOf("</svg>") + 6);
    assert.doesNotMatch(outSvg, /class="started"/);
    assert.equal(outSvg, offSvg);
    app.state.dailyRoutines = routines;
    const on = app.bodyweightCardHTML();
    assert.match(on, /x1="225.0"/);
    assert.match(on, new RegExp(`Started ${NAME}`));
    assert.match(on, /dr-chart-line-weight-/);
    assert.doesNotMatch(on, /424242/);
    app.ROUTINES_ENABLED = false;
    app.session = null;
  });

  test("the Insights control is hidden until the flag is on and the person is signed in", () => {
    const routines = store([compound("compound-a", { name: NAME, startDate: DATE, chartLine: true })]);
    bootPage(routines);
    const real = app.insightsHTML;
    app.insightsHTML = () => "<div>trends</div>";
    app.ui.iseg = "trends";
    try {
      app.ROUTINES_ENABLED = false;
      app.session = null;
      const hidden = app.insightsWrapHTML();
      assert.doesNotMatch(hidden, /Started lines|Zephyrlane/);
      assert.match(hidden, /<div>trends<\/div>/);
      app.ROUTINES_ENABLED = true;
      app.session = null;
      assert.doesNotMatch(app.insightsWrapHTML(), /Zephyrlane|Started lines/);
      app.session = { user: { id: "synthetic-user" } };
      const shown = app.insightsWrapHTML();
      assert.match(shown, /Started lines/);
      assert.match(shown, /aria-checked="true"/);
      assert.match(shown, /dr-chart-line-insights-/);
      assert.match(shown, /Drawn on this phone|drawn on this phone/);
    } finally {
      app.insightsHTML = real;
      app.ROUTINES_ENABLED = false;
      app.session = null;
    }
  });

  test("drawing the line and toggling it sends no name or date to AI, analytics, or the network", () => {
    const calls = [];
    const originalFetch = globalThis.fetch;
    const OriginalXHR = globalThis.XMLHttpRequest;
    const originalBeacon = globalThis.navigator && globalThis.navigator.sendBeacon;
    globalThis.fetch = (...args) => {
      calls.push(["fetch", JSON.stringify(args)]);
      return Promise.resolve({ ok: true, text: async () => "", json: async () => ({}) });
    };
    globalThis.XMLHttpRequest = class {
      open(...args) { calls.push(["xhr", JSON.stringify(args)]); }
      send(body) { calls.push(["xhr-send", String(body)]); }
      setRequestHeader() {}
    };
    if (!globalThis.navigator) globalThis.navigator = {};
    globalThis.navigator.sendBeacon = (url, body) => {
      calls.push(["beacon", String(url), String(body)]);
      return true;
    };
    globalThis.Sentry = {
      captureMessage(msg) { calls.push(["sentry", String(msg)]); },
      captureException(err) { calls.push(["sentry", String(err)]); },
      captureEvent(event) { calls.push(["sentry", JSON.stringify(event)]); },
    };
    globalThis.posthog = { capture(...args) { calls.push(["posthog", JSON.stringify(args)]); } };

    const routines = store([compound("compound-a", { name: NAME, amount: AMOUNT, startDate: "2026-11-14", chartLine: true })]);
    bootPage(routines);
    app.ROUTINES_ENABLED = true;
    app.session = { user: { id: "synthetic-user" } };
    app.sb = {
      functions: { invoke(...args) { calls.push(["invoke", JSON.stringify(args)]); return Promise.resolve({ data: null, error: null }); } },
    };
    app.cloudPullOk = true;
    app.capture = (...args) => { calls.push(["capture", JSON.stringify(args)]); };
    app.save = () => { calls.push(["save"]); };

    const markers = startedChartMarkers(app.state.dailyRoutines, ["2026-11-07", "2026-11-14", "2026-11-20"]);
    assert.equal(markers[0].label, `Started ${NAME}`);
    assert.equal(markers[0].date, "2026-11-14");
    const svg = chart(["2026-11-07", "2026-11-14", "2026-11-20"], markers);
    const recovery = app.recoveryHTML();
    const choice = chartLineOptInHTML(app.state.dailyRoutines, "insights");
    app.state.profile.weighIns = [{ date: "2026-11-01", kg: 80 }, { date: "2026-11-18", kg: 81 }];
    app.state.dailyRoutines = store([compound("compound-a", { name: NAME, amount: AMOUNT, startDate: "2026-11-14", chartLine: false })]);
    assert.equal(setCompoundChartLine(app.state, "compound-a", true), true);
    const weight = app.bodyweightCardHTML();

    assert.match(svg, new RegExp(`Started ${NAME}`));
    assert.match(recovery, new RegExp(`Started ${NAME}`));
    assert.match(choice, new RegExp(NAME));
    assert.match(weight, new RegExp(`Started ${NAME}`));
    assert.equal(calls.length, 0, JSON.stringify(calls));
    const leaked = JSON.stringify(calls);
    assert.equal(leaked.includes(NAME), false);
    assert.equal(leaked.includes("2026-11-14"), false);
    assert.equal(leaked.includes(DATE), false);
    assert.equal(leaked.includes(String(AMOUNT)), false);

    const analytics = sanitizePosthogEvent({
      event: "insights_opened",
      properties: {
        compound: NAME,
        startDate: DATE,
        chartLine: true,
        label: `Started ${NAME}`,
        $current_url: `https://example.invalid/insights?compound=${encodeURIComponent(NAME)}&day=${DATE}`,
      },
    });
    assert.equal(JSON.stringify(analytics).includes(NAME), false);
    assert.equal(JSON.stringify(analytics).includes(DATE), false);
    assert.equal(sanitizeCapture("started_line", { name: NAME, startDate: DATE }), null);
    assert.deepEqual(sanitizeCapture("insights_opened", { compound: NAME, startDate: DATE, chartLine: true }), {
      event: "insights_opened", properties: {},
    });
    const sentry = scrubEvent({
      message: `Started ${NAME} on ${DATE}`,
      extra: { startDate: DATE, chartLine: true, label: NAME },
      contexts: { app: { startDate: DATE, start_date: DATE, chartLine: NAME, label: `Started ${NAME}` }, browser: { name: "Chrome" } },
      breadcrumbs: [{ category: "console", message: `Started ${NAME} ${DATE}`, data: { startDate: DATE, name: NAME } }],
    });
    assert.equal(JSON.stringify(sentry).includes(NAME), false);
    assert.equal(JSON.stringify(sentry).includes(DATE), false);
    assert.equal(sentry.contexts.browser.name, "Chrome");

    const src = readFileSync(new URL("../logger/js/shared/routine-chart-lines.js", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(src, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|posthog|Sentry|\bcapture\s*\(|functions\.invoke|routines-flag/);

    globalThis.fetch = originalFetch;
    globalThis.XMLHttpRequest = OriginalXHR;
    if (originalBeacon) globalThis.navigator.sendBeacon = originalBeacon;
    else delete globalThis.navigator.sendBeacon;
    delete globalThis.Sentry;
    delete globalThis.posthog;
    app.ROUTINES_ENABLED = false;
    app.session = null;
    app.sb = null;
  });

  test("the shell cache stays put and only sleep, HRV, and weight charts are wired", () => {
    const sw = readFileSync(new URL("../logger/sw.js", import.meta.url), "utf8");
    const sentry = readFileSync(new URL("../logger/js/sentry.js", import.meta.url), "utf8");
    const main = readFileSync(new URL("../logger/js/main.js", import.meta.url), "utf8");
    const flag = readFileSync(new URL("../logger/js/shared/routines-flag.js", import.meta.url), "utf8");
    const insights = readFileSync(new URL("../logger/js/pages/insights.js", import.meta.url), "utf8");
    const actions = readFileSync(new URL("../logger/js/shell/actions.js", import.meta.url), "utf8");
    const css = readFileSync(new URL("../logger/css/routines.css", import.meta.url), "utf8");
    const food = readFileSync(new URL("../logger/js/pages/food.js", import.meta.url), "utf8");
    const settings = readFileSync(new URL("../logger/js/pages/settings.js", import.meta.url), "utf8");
    assert.match(flag, /ROUTINES_ENABLED = true/);
    assert.match(sw, /const CACHE = "insight-shell-v91"/);
    assert.match(sentry, /insight-shell-v91/);
    assert.match(sw, /js\/shared\/routine-chart-lines\.js/);
    assert.equal(main.match(/routines-flag/g).length, 1);
    const slice = (src, start, end) => {
      const a = src.indexOf(start);
      const b = src.indexOf(end, a + start.length);
      assert.ok(a >= 0 && b > a, start);
      return src.slice(a, b);
    };
    assert.doesNotMatch(slice(insights, "<h4>Readiness</h4>", "<h4>Sleep</h4>"), /startedMarkers/);
    assert.match(slice(insights, "<h4>Sleep</h4>", "<h4>HRV</h4>"), /startedMarkers\(range\)/);
    assert.match(slice(insights, "<h4>HRV</h4>", "<h4>Resting heart rate</h4>"), /startedMarkers\(range\)/);
    assert.doesNotMatch(slice(insights, "<h4>Resting heart rate</h4>", "function insightsWrapHTML"), /startedMarkers/);
    assert.doesNotMatch(slice(insights, "Sets per week", "Average HRV"), /startedMarkers/);
    assert.match(insights, /startedMarkers\(weeks, 7\)/);
    assert.match(readFileSync(new URL("../logger/js/shared/profile.js", import.meta.url), "utf8"), /startedChartMarkers\(/);
    assert.doesNotMatch(food, /startedChartMarkers|startedMarkers/);
    assert.doesNotMatch(settings, /startedChartMarkers|startedMarkers/);
    const actionAt = actions.indexOf('case "routines-chart-line"');
    const actionEnd = actions.indexOf("case ", actionAt + 10);
    const action = actions.slice(actionAt, actionEnd);
    assert.match(action, /setCompoundChartLine/);
    assert.doesNotMatch(action, /capture\(|\bfetch\s*\(|invoke\(|posthog|Sentry|sendBeacon|XMLHttpRequest/);
    const lineCss = css.slice(css.indexOf(".chart .started"), css.indexOf(".dr-chart-lines"));
    assert.match(lineCss, /stroke-width:\s*1/);
    assert.doesNotMatch(lineCss, /animation|transition/);
  });
});
