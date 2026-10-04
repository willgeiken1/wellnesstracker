import { app } from "../runtime.js";
import { addDays, findingsForWeek } from "./correlate.js";
import { countedEntries } from "./skip.js";

/* In-app weekly report. Numbers stay on the device. Dismiss state is a list of
   week-start dates in the existing user blob, not a new table. */

export const WEEK_HISTORY = 8;

export function mondayOf(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const offset = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return addDays(iso, -offset);
}

/* The last finished Monday–Sunday. A new one becomes due on Monday, and stays
   due until that card is dismissed, including the first open later in the week. */
export function previousWeek(today) {
  const current = mondayOf(today);
  const start = addDays(current, -7);
  return { start, end: addDays(start, 6), current };
}

export function weekCardDue(today, dismissed) {
  const week = previousWeek(today);
  const gone = new Set(Array.isArray(dismissed) ? dismissed : []);
  return { ...week, show: !gone.has(week.start) };
}

export function weekHistory(today, count) {
  const n = count == null ? WEEK_HISTORY : count;
  const first = previousWeek(today).start;
  const out = [];
  for (let i = 0; i < n; i++) out.push(addDays(first, -7 * i));
  return out;
}

export function mergeWeeklyReports(local, remote) {
  const seen = new Set();
  const dismissed = [];
  [local, remote].forEach((side) => {
    const list = side && Array.isArray(side.dismissed) ? side.dismissed : [];
    list.forEach((id) => {
      if (typeof id !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(id) || seen.has(id)) return;
      seen.add(id);
      dismissed.push(id);
    });
  });
  dismissed.sort();
  return {
    dismissed: dismissed.slice(-16),
    updatedAt: Math.max((local && local.updatedAt) || 0, (remote && remote.updatedAt) || 0),
  };
}

function finite(v) {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function datesOf(start) {
  return [...Array(7)].map((_, i) => addDays(start, i));
}

function metricOf(series, priorSeries, better) {
  const cur = series.filter((v) => v != null);
  const prev = priorSeries.filter((v) => v != null);
  const avg = mean(cur);
  const before = mean(prev);
  return {
    n: cur.length,
    of: series.length,
    mean: avg,
    prior: before,
    delta: avg != null && before != null ? avg - before : null,
    series,
    better,
  };
}

function ouraMap(oura) {
  if (!oura || typeof oura !== "object") return {};
  if (oura.days && typeof oura.days === "object" && !Array.isArray(oura.days)) return oura.days;
  return oura;
}

function dayNum(map, date, key, hours) {
  const day = map[date];
  if (!day) return null;
  const n = finite(day[key]);
  if (n == null || n <= 0) return null;
  return hours ? n / 3600 : n;
}

function setWork(set) {
  return set && set.tag !== "warmup" && finite(set.w) != null && finite(set.r) != null;
}

function setE1(set) {
  return set.w * (1 + set.r / 30);
}

function sessionsIn(sessions, start, end) {
  return (sessions || []).filter((s) => s && s.finishedAt && s.date >= start && s.date <= end);
}

function dayVolume(sessions, date) {
  let n = 0;
  sessionsIn(sessions, date, date).forEach((s) => {
    countedEntries(s).forEach((e) => {
      (e.sets || []).forEach((set) => { if (setWork(set)) n += set.w * set.r; });
    });
  });
  return n;
}

function liftStandout(sessions, start, end) {
  const before = {};
  const during = [];
  (sessions || []).forEach((s) => {
    if (!s || !s.finishedAt || !s.date) return;
    countedEntries(s).forEach((e) => {
      (e.sets || []).forEach((set) => {
        if (!setWork(set)) return;
        const e1 = setE1(set);
        const row = { name: e.exercise || "Lift", e1, w: set.w, r: set.r, date: s.date };
        if (s.date < start) {
          const prev = before[row.name];
          if (!prev || e1 > prev.e1) before[row.name] = row;
        } else if (s.date <= end) during.push(row);
      });
    });
  });
  if (!during.length) return null;
  let pr = null;
  during.forEach((row) => {
    const prev = before[row.name];
    if (!prev || row.e1 <= prev.e1 + 0.05) return;
    const gain = row.e1 - prev.e1;
    if (!pr || gain > pr.gain) pr = { ...row, kind: "pr", gain };
  });
  if (pr) return pr;
  let best = during[0];
  during.forEach((row) => { if (row.e1 > best.e1) best = row; });
  return { ...best, kind: "best" };
}

function foodOf(foodDays, dates, targets) {
  let days = 0;
  let kcal = 0;
  let protein = 0;
  dates.forEach((date) => {
    const entries = foodDays && foodDays[date];
    if (!Array.isArray(entries) || !entries.length) return;
    let dayK = 0;
    let dayP = 0;
    let any = false;
    entries.forEach((e) => {
      if (!e || !e.base) return;
      const servings = finite(e.servings) != null ? e.servings : 1;
      const bk = finite(e.base.kcal);
      const bp = finite(e.base.p);
      if (bk == null && bp == null) return;
      any = true;
      dayK += (bk || 0) * servings;
      dayP += (bp || 0) * servings;
    });
    if (!any) return;
    days += 1;
    kcal += dayK;
    protein += dayP;
  });
  const goalK = targets && finite(targets.kcal);
  const goalP = targets && finite(targets.p);
  return {
    days,
    kcal: days ? kcal / days : null,
    protein: days ? protein / days : null,
    targetKcal: goalK != null && goalK > 0 ? goalK : null,
    targetProtein: goalP != null && goalP > 0 ? goalP : null,
  };
}

function weightOf(weighIns, start, end, priorStart, priorEnd, weightDir) {
  const pick = (a, b) => (weighIns || []).map((w) => (w && w.date >= a && w.date <= b ? finite(w.kg) : null)).filter((n) => n != null && n > 0);
  const cur = pick(start, end);
  const prev = pick(priorStart, priorEnd);
  if (!cur.length) return null;
  const avg = mean(cur);
  const before = mean(prev);
  const better = weightDir === "gain" ? "higher" : weightDir === "lose" ? "lower" : "neutral";
  const series = datesOf(start).map((date) => {
    const hit = (weighIns || []).find((w) => w && w.date === date);
    const n = hit ? finite(hit.kg) : null;
    return n != null && n > 0 ? n : null;
  });
  return { n: cur.length, of: 7, mean: avg, prior: before, delta: before != null ? avg - before : null, better, series };
}

function bestReadiness(map, dates) {
  let best = null;
  dates.forEach((date) => {
    const n = dayNum(map, date, "readiness", false);
    if (n == null) return;
    if (!best || n > best.value) best = { date, value: n };
  });
  return best;
}

export function weekHeadline(report) {
  if (!report || report.empty) return "Not enough logged for a week yet.";
  const w = report.workouts.n;
  const train = w === 1 ? "You got a workout in" : w > 1 ? `You trained ${w} times` : "";
  let extra = "";
  if (report.standout && report.standout.pr && report.standout.pr.kind === "pr") extra = "you set a personal record";
  else {
    const ready = report.metrics.readiness;
    const sleep = report.metrics.sleepHours;
    if (ready && ready.delta != null && ready.delta >= 1) extra = "readiness was up";
    else if (sleep && sleep.delta != null && sleep.delta >= 0.25) extra = "you slept a bit longer";
    else if (report.food && report.food.days >= 5) extra = "meals were logged most days";
    else if (ready && ready.delta != null && ready.delta <= -1) extra = "recovery was a little quieter";
    else if (sleep && sleep.delta != null && sleep.delta <= -0.25) extra = "sleep ran a bit short";
  }
  if (train && extra) return `${train}, and ${extra}.`;
  if (train) return `${train}.`;
  if (extra) return extra.charAt(0).toUpperCase() + extra.slice(1) + ".";
  return "Here's how last week looked.";
}

/* Averages skip missing days. They are not treated as zero. */
export function buildWeek(input, start) {
  const src = input || {};
  const end = addDays(start, 6);
  const priorStart = addDays(start, -7);
  const priorEnd = addDays(priorStart, 6);
  const dates = datesOf(start);
  const priorDates = datesOf(priorStart);
  const map = ouraMap(src.oura);
  const pull = (key, hours) => metricOf(
    dates.map((d) => dayNum(map, d, key, hours)),
    priorDates.map((d) => dayNum(map, d, key, hours)),
    key === "rhr" ? "lower" : "higher"
  );
  const metrics = {
    readiness: pull("readiness", false),
    sleepScore: pull("sleepScore", false),
    sleepHours: pull("total", true),
    hrv: pull("hrv", false),
    rhr: pull("rhr", false),
  };
  const vol = dates.map((d) => dayVolume(src.sessions, d));
  const priorVol = priorDates.map((d) => dayVolume(src.sessions, d));
  const workouts = {
    n: dates.filter((d) => sessionsIn(src.sessions, d, d).length > 0).length,
    prior: priorDates.filter((d) => sessionsIn(src.sessions, d, d).length > 0).length,
    volume: vol.reduce((a, b) => a + b, 0),
    priorVolume: priorVol.reduce((a, b) => a + b, 0),
    series: vol.map((v, i) => (sessionsIn(src.sessions, dates[i], dates[i]).length ? v : null)),
  };
  workouts.delta = workouts.n || workouts.prior ? workouts.n - workouts.prior : null;
  const food = foodOf(src.foodDays, dates, src.targets);
  const weight = weightOf(src.weighIns, start, end, priorStart, priorEnd, src.weightDir || null);
  const readiness = bestReadiness(map, dates);
  const lift = liftStandout(src.sessions, start, end);
  const anyMetric = Object.keys(metrics).some((k) => metrics[k].n > 0);
  const empty = !anyMetric && workouts.n === 0 && food.days === 0 && !weight;
  const report = {
    start,
    end,
    priorStart,
    priorEnd,
    empty,
    metrics,
    workouts,
    food,
    weight,
    standout: { readiness, pr: lift },
  };
  report.headline = weekHeadline(report);
  return report;
}

export function weekBars(values) {
  const nums = (values || []).filter((v) => v != null);
  if (!nums.length) return "";
  const lo = Math.min(...nums);
  const hi = Math.max(...nums);
  const span = hi - lo || 1;
  const rects = (values || []).map((v, i) => {
    const x = i * 8;
    if (v == null) return `<rect class="wk-gap" x="${x}" y="18" width="5" height="2" rx="1"/>`;
    const h = 4 + ((v - lo) / span) * 14;
    return `<rect class="wk-bar" x="${x}" y="${20 - h}" width="5" height="${h.toFixed(1)}" rx="1"/>`;
  }).join("");
  return `<svg class="wk-spark" viewBox="0 0 53 22" aria-hidden="true">${rects}</svg>`;
}

function reportSource() {
  const demo = !!(app.state && app.state.demo);
  const S = typeof app.src === "function" ? app.src() : { sessions: [], oura: {} };
  let targets = null;
  if (!demo && typeof app.targets === "function") {
    try { targets = app.targets(); } catch (e) { targets = null; }
  }
  let weightDir = null;
  if (typeof app.goals === "function") {
    try { weightDir = app.goals().weightDir || null; } catch (e) { weightDir = null; }
  }
  return {
    oura: S.oura || {},
    sessions: S.sessions || [],
    foodDays: demo ? (S.foodDays || {}) : ((app.state && app.state.food && app.state.food.days) || {}),
    weighIns: demo ? (S.weighIns || []) : (typeof app.weighIns === "function" ? app.weighIns() : []),
    targets,
    weightDir,
  };
}

function dismissedList() {
  const w = app.state && app.state.weeklyReports;
  return w && Array.isArray(w.dismissed) ? w.dismissed : [];
}

function rangeLabel(start, end) {
  const a = app.fmtDate(start, { month: "short", day: "numeric" });
  const b = app.fmtDate(end, { month: "short", day: "numeric" });
  return `${a} – ${b}`;
}

const SAME = "about the same";

function fmtHours(h) {
  if (h == null) return "–";
  let hr = Math.floor(h);
  let m = Math.round((h - hr) * 60);
  if (m === 60) { hr += 1; m = 0; }
  return `${hr}h ${String(m).padStart(2, "0")}m`;
}

function weightUnit() {
  return typeof app.wUnit === "function" ? app.wUnit() : "kg";
}

function toWeightDisp(kg) {
  if (kg == null) return null;
  return typeof app.kgToDisp === "function" ? app.kgToDisp(kg) : kg;
}

function changeLimit(kind) {
  if (kind === "hours") return 0.15;
  if (kind === "weight") return 0.05;
  if (kind === "volume") return 1;
  return 0.5;
}

function paintChange(delta, kind, unit) {
  const sign = delta > 0 ? "+" : "−";
  const a = Math.abs(delta);
  if (kind === "hours") {
    const total = Math.round(a * 60);
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (!h) return `${sign}${m}m`;
    if (!m) return `${sign}${h}h`;
    return `${sign}${h}h ${String(m).padStart(2, "0")}m`;
  }
  if (kind === "weight") return `${sign}${a.toFixed(1)}${unit ? ` ${unit}` : ""}`;
  if (kind === "volume") {
    const n = a >= 10000 ? `${(a / 1000).toFixed(1)}k` : Math.round(a).toLocaleString("en-US");
    return `${sign}${n}${unit ? ` ${unit}` : ""}`;
  }
  if (kind === "hrv") return `${sign}${Math.round(a)} ms`;
  if (kind === "rhr") return `${sign}${Math.round(a)} bpm`;
  return `${sign}${Math.round(a)}`;
}

/* Stored units stay in the week model. Weight is kilograms until it is shown. */
export function formatChange(delta, kind) {
  if (delta == null || !Number.isFinite(delta)) return "";
  if (Math.abs(delta) < changeLimit(kind)) return SAME;
  if (kind === "weight") return paintChange(toWeightDisp(delta), kind, weightUnit());
  if (kind === "volume") return paintChange(delta, kind, weightUnit());
  return paintChange(delta, kind);
}

export function formatValue(mean, kind) {
  if (mean == null || !Number.isFinite(mean)) return "–";
  if (kind === "hours") return fmtHours(mean);
  if (kind === "hrv") return `${Math.round(mean)}<small> ms</small>`;
  if (kind === "rhr") return `${Math.round(mean)}<small> bpm</small>`;
  if (kind === "weight") return `${toWeightDisp(mean).toFixed(1)}<small> ${weightUnit()}</small>`;
  if (kind === "volume") return `${volumeText(mean)}<small> ${weightUnit()}</small>`;
  return String(Math.round(mean));
}

function fmtMean(metric, kind) {
  if (!metric) return "–";
  return formatValue(metric.mean, kind);
}

export function trendTone(delta, better, kind) {
  if (delta == null) return "flat";
  const limit = kind === "hours" ? 0.15 : kind === "weight" || better === "neutral" ? 0.05 : 0.5;
  if (Math.abs(delta) < limit) return "flat";
  const up = delta > 0;
  if (better === "lower") return up ? "down" : "up";
  if (better === "higher") return up ? "up" : "down";
  return "flat";
}

function tone(metric, kind) {
  if (!metric) return "flat";
  return trendTone(metric.delta, metric.better, kind);
}

function vsWeek(delta, kind) {
  const shown = formatChange(delta, kind);
  if (!shown || shown === SAME) return "About the same as last week";
  return `${shown} vs last week`;
}

function deltaLine(metric, kind) {
  if (!metric || metric.n === 0) return "Not logged";
  const cover = metric.of && metric.n < metric.of ? `${metric.n} of ${metric.of} days` : "";
  if (metric.delta == null) return cover || "Logged";
  const tail = cover ? " · " + cover : "";
  const shown = formatChange(metric.delta, kind);
  if (!shown || shown === SAME) return `About the same as last week${tail}`;
  return `${shown} vs last week${tail}`;
}

const ROWS = [
  ["readiness", "Readiness", "score"],
  ["sleepScore", "Sleep score", "score"],
  ["sleepHours", "Sleep time", "hours"],
  ["hrv", "HRV", "hrv"],
  ["rhr", "Resting heart rate", "rhr"],
];

function metricRow(label, metric, kind) {
  const logged = metric && metric.n > 0;
  const mark = tone(metric, kind);
  const note = logged ? (metric.n < 7 ? `${metric.n} of 7 days` : "All 7 days") : "Not logged";
  return `<div class="wk-row${logged ? "" : " missing"}">
    <div class="wk-row-t"><span>${label}</span><b>${fmtMean(metric, kind)}</b>
      <em class="tone-${mark || "flat"}">${logged ? deltaLine(metric, kind) : "Not logged"}</em></div>
    ${logged ? weekBars(metric.series) : `<span class="wk-gap-note">${note}</span>`}
  </div>`;
}

function volumeText(n) {
  if (!n) return "0";
  if (n >= 10000) return (n / 1000).toFixed(1) + "k";
  return Math.round(n).toLocaleString("en-US");
}

function weekFindings(start, end) {
  try {
    if (typeof app.correlations !== "function" || typeof app.correlationSource !== "function") return [];
    return findingsForWeek(app.correlations(), app.correlationSource(), start, end, 3);
  } catch (e) { return []; }
}

function findingCard(r) {
  const toneName = r.valence === "good" ? "good" : "bad";
  const mark = toneName === "good" ? "Good for you" : "Working against you";
  return `<article class="card aff-card ${toneName}">
    <div class="aff-k"><span class="aff-mark">${mark}</span><span class="aff-out">${app.esc(r.outcomeLabel || "")}</span></div>
    <p class="aff-s">${app.esc(r.lead || r.sentence || "")}</p>
  </article>`;
}

function emptyCopy() {
  return `<div class="card wk-empty"><h4>A couple of logs will do it</h4>
    <p class="sub">Last week doesn't have enough sleep, workouts, or meals to summarize. Log a few this week and Monday's report will have more to say.</p></div>`;
}

export function weekReportModel(start) {
  const report = buildWeek(reportSource(), start);
  report.findings = report.empty ? [] : weekFindings(start, report.end);
  return report;
}

function weekCardHTML() {
  const due = weekCardDue(typeof app.today === "function" ? app.today() : "", dismissedList());
  if (!due.show || !due.start) return "";
  const report = buildWeek(reportSource(), due.start);
  const stats = [];
  if (report.workouts.n > 0) stats.push(["Workouts", String(report.workouts.n)]);
  if (report.metrics.readiness.n) stats.push(["Readiness", fmtMean(report.metrics.readiness, "score")]);
  if (report.metrics.sleepHours.n) stats.push(["Sleep", fmtMean(report.metrics.sleepHours, "hours")]);
  const shown = stats.slice(0, 3);
  const chips = shown.length ? `<div class="week-stats n${shown.length}">${shown.map(([k, v]) =>
    `<span class="week-stat"><span>${k}</span><b>${app.esc(v)}</b></span>`).join("")}</div>` : "";
  return `<section class="card week-card">
    <div class="week-top"><p class="week-k">Your week</p>
      <button type="button" class="week-x" data-action="week-dismiss" data-week="${due.start}" aria-label="Dismiss your week">×</button></div>
    <button type="button" class="week-go" data-action="week-open" data-week="${due.start}">
      <h2 class="week-h">${app.esc(report.headline)}</h2>
      <p class="week-range">${rangeLabel(report.start, report.end)}</p>
      ${chips}
    </button>
  </section>`;
}
app.weekCardHTML = weekCardHTML;

function weeklyListHTML() {
  const today = typeof app.today === "function" ? app.today() : "";
  const src = reportSource();
  const reports = weekHistory(today).map((start) => buildWeek(src, start));
  const head = `<div class="sec-h wk-h"><h3>Weekly reports</h3></div>`;
  if (!reports.length || reports.every((r) => r.empty)) return head + emptyCopy();
  const rows = reports.map((r) => `<button type="button" class="wk-link" data-action="week-open" data-week="${r.start}">
      <span><b>${rangeLabel(r.start, r.end)}</b><span class="sub">${app.esc(r.headline)}</span></span>
      <span class="wk-chev" aria-hidden="true">›</span></button>`).join("");
  return head + `<div class="card wk-list">${rows}</div>`;
}
app.weeklyListHTML = weeklyListHTML;

function weekReportHTML(start) {
  const report = weekReportModel(start || previousWeek(app.today()).start);
  const back = `<button class="icon-btn" data-action="week-back" aria-label="Back to Insights">${app.I.chevL}</button>`;
  const head = app.pageHead("Your week", rangeLabel(report.start, report.end), { left: back });
  if (report.empty) return head + (app.demoBanner ? app.demoBanner() : "") + emptyCopy();
  const weight = report.weight ? metricRow("Weight", report.weight, "weight") : "";
  const trainDelta = report.workouts.prior ? vsWeek(report.workouts.n - report.workouts.prior, "score") : (report.workouts.n ? "First week with a workout" : "No workouts");
  const volDelta = report.workouts.priorVolume ? vsWeek(report.workouts.volume - report.workouts.priorVolume, "volume") : "Working sets";
  const kcalText = report.food.kcal == null ? "" : Math.round(report.food.kcal).toLocaleString("en-US");
  const kcalLine = report.food.targetKcal
    ? `Avg ${kcalText} cal · target ${Math.round(report.food.targetKcal).toLocaleString("en-US")}`
    : `Avg ${kcalText} cal · no target saved`;
  const food = report.food.days ? `<div class="wk-row">
      <div class="wk-row-t"><span>Food logged</span><b>${report.food.days} of 7 days</b>
        <em class="tone-flat">${kcalLine}</em></div>
      ${report.food.targetKcal ? `<div class="wk-track"><i style="width:${Math.min(100, report.food.kcal / report.food.targetKcal * 100)}%"></i></div>` : ""}
    </div>
    <div class="wk-row">
      <div class="wk-row-t"><span>Protein</span><b>${Math.round(report.food.protein)}<small> g</small></b>
        <em class="tone-flat">${report.food.targetProtein ? `Target ${Math.round(report.food.targetProtein)} g` : "Daily average"}</em></div>
      ${report.food.targetProtein ? `<div class="wk-track"><i style="width:${Math.min(100, report.food.protein / report.food.targetProtein * 100)}%"></i></div>` : ""}
    </div>` : `<div class="wk-row missing"><div class="wk-row-t"><span>Food</span><b>–</b><em class="tone-flat">No meals logged</em></div></div>`;
  const ready = report.standout.readiness;
  const lift = report.standout.pr;
  const stand = ready || lift ? `<div class="sec-h"><h3>Standout days</h3></div><div class="card wk-stand">
      ${ready ? `<p><b>Best readiness</b> ${Math.round(ready.value)} on ${app.fmtDate(ready.date, { weekday: "long" })}</p>` : ""}
      ${lift ? `<p><b>${lift.kind === "pr" ? "Personal record" : "Best lift"}</b> ${app.esc(lift.name)}, ${app.fmtNum(lift.w)} ${weightUnit()} × ${lift.r} on ${app.fmtDate(lift.date, { weekday: "long" })}</p>` : ""}
    </div>` : "";
  const patterns = report.findings && report.findings.length
    ? `<div class="sec-h"><h3>What showed up</h3></div>${report.findings.map(findingCard).join("")}<p class="sub wk-note">These line up what tended to happen that week. They are correlations, not causes.</p>`
    : `<div class="sec-h"><h3>What showed up</h3></div><div class="card wk-empty"><p class="sub">No strong pattern lined up with the days in this week.</p></div>`;
  return `${head}${app.demoBanner ? app.demoBanner() : ""}
    <div class="week-report">
    <h2 class="week-h week-lead">${app.esc(report.headline)}</h2>
    <div class="sec-h"><h3>Recovery</h3></div>
    <div class="card wk-block">${ROWS.map(([key, label, kind]) => metricRow(label, report.metrics[key], kind)).join("")}${weight}</div>
    <div class="sec-h"><h3>Training</h3></div>
    <div class="card wk-block">
      <div class="wk-row"><div class="wk-row-t"><span>Workouts</span><b>${report.workouts.n}</b><em class="tone-flat">${trainDelta}</em></div>${weekBars(report.workouts.series)}</div>
      <div class="wk-row"><div class="wk-row-t"><span>Volume</span><b>${formatValue(report.workouts.volume, "volume")}</b><em class="tone-flat">${volDelta}</em></div></div>
    </div>
    <div class="sec-h"><h3>Food</h3></div>
    <div class="card wk-block">${food}</div>
    ${stand}
    ${patterns}
    </div>`;
}
app.weekReportHTML = weekReportHTML;

function dismissWeek(start) {
  const cur = app.state.weeklyReports && typeof app.state.weeklyReports === "object" ? app.state.weeklyReports : { dismissed: [] };
  const next = mergeWeeklyReports(cur, { dismissed: [start], updatedAt: Date.now() });
  next.updatedAt = Date.now();
  app.state.weeklyReports = next;
  app.save();
}
app.dismissWeek = dismissWeek;
app.mergeWeeklyReports = mergeWeeklyReports;
app.buildWeek = buildWeek;
app.previousWeek = previousWeek;
app.weekCardDue = weekCardDue;
