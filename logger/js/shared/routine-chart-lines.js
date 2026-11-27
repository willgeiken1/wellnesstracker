import { app } from "../runtime.js";
import {
  canMutateRoutines,
  projectDailyRoutines,
  putDailyRoutines,
  revisePlanEntity,
} from "./daily-routines-store.js";

/* Opt-in "Started X" marks for sleep, HRV, and weight charts.
   Drawing stays on this phone. This module must not call fetch, XHR,
   sendBeacon, Sentry, PostHog, capture, or a model. */

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function esc(value) {
  if (typeof app.esc === "function") return app.esc(value);
  return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function validDay(value) {
  if (typeof value !== "string" || !DAY.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function displayName(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

function shortDay(day) {
  if (typeof app.fmtDate === "function") {
    try {
      const text = app.fmtDate(day, { month: "short", day: "numeric" });
      if (typeof text === "string" && text) return text;
    } catch (e) { /* keep the stored day */ }
  }
  return day;
}

function nextStamp(previous) {
  const now = Date.now();
  const prev = typeof previous === "number" && Number.isFinite(previous) ? previous : 0;
  return now > prev ? now : prev + 1;
}

function shiftDay(day, n) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
}

/* A weekly HRV point is the Monday plus the six days after it. A start on
   Tuesday through Sunday of that week belongs on the Monday label, including
   the last week, whose Sunday is after the last label. */
function bucketStart(days, startDate, span) {
  let bucket = null;
  const endOffset = span - 1;
  for (const day of days) {
    if (day <= startDate && startDate <= shiftDay(day, endOffset) && (bucket == null || day > bucket)) bucket = day;
  }
  return bucket;
}

export function startedChartMarkers(store, labels, opts) {
  if (app.ROUTINES_ENABLED !== true || !canMutateRoutines()) return [];
  if (!Array.isArray(labels) || !labels.length) return [];
  const view = projectDailyRoutines(store);
  if (!view) return [];
  const days = labels.filter((day) => validDay(day));
  if (!days.length) return [];
  const span = opts && opts.bucketDays === 7 ? 7 : 1;
  const first = days.reduce((a, b) => (a < b ? a : b));
  const last = days.reduce((a, b) => (a > b ? a : b));
  const end = span === 1 ? last : shiftDay(last, span - 1);
  const markers = [];
  for (const compound of view.compounds) {
    if (!compound || compound.chartLine !== true || !validDay(compound.startDate)) continue;
    if (compound.startDate < first || compound.startDate > end) continue;
    const date = span === 1 ? compound.startDate : bucketStart(days, compound.startDate, span);
    if (!date) continue;
    const name = displayName(compound.name);
    if (!name) continue;
    markers.push({ date, label: `Started ${name}` });
  }
  markers.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  return markers;
}

export function setCompoundChartLine(state, compoundId, on) {
  if (app.ROUTINES_ENABLED !== true || !canMutateRoutines()) return false;
  if (app.sb && app.cloudPullOk !== true) return false;
  if (!state || typeof compoundId !== "string" || !compoundId) return false;
  const view = projectDailyRoutines(state.dailyRoutines);
  const compound = view && (view.compounds || []).find((row) => row.id === compoundId);
  if (!compound || !validDay(compound.startDate)) return false;
  const want = on === true;
  if ((compound.chartLine === true) === want) return false;
  const at = nextStamp(compound.updatedAt);
  const next = revisePlanEntity(state.dailyRoutines, "compounds", compoundId, { chartLine: want }, at);
  if (!next) return false;
  const row = (next.compounds || []).find((item) => item && item.id === compoundId);
  if (!row || row.chartLine !== want || row.updatedAt !== at) return false;
  return putDailyRoutines(state, next);
}

export function chartLineOptInHTML(store, prefix = "insights") {
  if (app.ROUTINES_ENABLED !== true || !canMutateRoutines()) return "";
  const view = projectDailyRoutines(store);
  if (!view) return "";
  const compounds = view.compounds.filter((row) => row && validDay(row.startDate) && displayName(row.name));
  if (!compounds.length) return "";
  const safePrefix = String(prefix || "insights").replace(/[^A-Za-z0-9_-]/g, "") || "insights";
  const rows = compounds.slice().sort((a, b) => {
    const an = displayName(a.name);
    const bn = displayName(b.name);
    if (an < bn) return -1;
    if (an > bn) return 1;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  }).map((compound, index) => {
    const on = compound.chartLine === true;
    const labelId = `dr-chart-line-${safePrefix}-${index}`;
    const name = displayName(compound.name);
    return `<div class="dr-set-row">
      <span id="${labelId}">Started ${esc(name)}<span class="sub"> ${esc(shortDay(compound.startDate))}</span></span>
      <button type="button" class="switch" role="switch" aria-checked="${on ? "true" : "false"}" aria-labelledby="${labelId}" data-action="routines-chart-line" data-compound-id="${esc(compound.id)}" data-on="${on ? "0" : "1"}"><i></i></button>
    </div>`;
  }).join("");
  return `<div class="card dr-chart-lines"><h4>Started lines</h4>
    <p class="sub">Show a thin line on sleep, HRV, and weight charts. Off until you turn one on. The line is drawn on this phone.</p>
    ${rows}</div>`;
}

app.startedChartMarkers = startedChartMarkers;
app.chartLineOptInHTML = chartLineOptInHTML;
app.setCompoundChartLine = setCompoundChartLine;
