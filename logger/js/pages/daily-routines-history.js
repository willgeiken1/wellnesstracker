import { app } from "../runtime.js";
import { canMutateRoutines, normalizeDailyRoutines, projectDailyRoutines, putDailyRoutines } from "../shared/daily-routines-store.js";
import {
  longRoutineDay,
  routineGraphTab,
  routineHistoryCursor,
  routineHistoryView,
  routineMarkIcon,
  ROUTINE_GRAPH_TABS,
  shortRoutineDay,
} from "../shared/routine-history.js";
import { loggedAmountText, routineClock } from "./daily-routines.js";

/* Month history: day cards, a calendar, and one graph with two tabs.
   The last tab is stored on prefs.historyGraph. Amounts stay on the
   day card. The graph only counts logs. */

const WEEKDAYS = Object.freeze(["M", "T", "W", "T", "F", "S", "S"]);

function esc(value) {
  if (typeof app.esc === "function") return app.esc(value);
  return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function accountPullPending() {
  return !!(app.sb && app.cloudPullOk !== true);
}

function signedIn() {
  return app.ROUTINES_ENABLED === true && canMutateRoutines();
}

function ready() {
  return signedIn() && !accountPullPending();
}

function stampAfter(now, previous) {
  const at = typeof now === "number" && Number.isFinite(now) ? now : 0;
  const prev = typeof previous === "number" && Number.isFinite(previous) ? previous : 0;
  const next = at > prev ? at : prev + 1;
  return next > 0 ? next : 1;
}

function markHTML(mark) {
  const icon = routineMarkIcon(mark);
  switch (icon.icon) {
    case "ring":
      return `<span class="dr-h-mark" data-mark="missed"><i class="dr-h-ring" aria-hidden="true"></i><span class="dr-vh">Missed</span></span>`;
    case "dash":
      return `<span class="dr-h-mark" data-mark="skipped"><span aria-hidden="true">–</span><span class="dr-vh">Skipped</span></span>`;
    case "moon":
      return `<span class="dr-h-mark" data-mark="rest"><span aria-hidden="true">☾</span><span class="dr-vh">Rest</span></span>`;
    case "filled":
      return `<span class="dr-h-mark" data-mark="${mark === "partial" ? "partial" : "logged"}"><i class="dr-h-fill" aria-hidden="true"></i><span class="dr-vh">${esc(icon.label)}</span></span>`;
    case "none":
      return "";
    default: {
      const unexpected = icon.icon;
      void unexpected;
      return "";
    }
  }
}

function marksHTML(marks) {
  return (Array.isArray(marks) ? marks : []).map((mark) => markHTML(mark)).join("");
}

function historyModel() {
  const view = projectDailyRoutines(app.state && app.state.dailyRoutines) || {
    blocks: [],
    items: [],
    placements: [],
    compounds: [],
    logs: [],
    prefs: {},
  };
  const today = routineClock().day;
  const cursor = routineHistoryCursor(app.ui && app.ui.sd, today, {});
  const tab = routineGraphTab(view.prefs);
  return routineHistoryView(view, { month: cursor.month, day: cursor.day, today, tab });
}

function graphHTML(model) {
  const max = model.graph.points.reduce((best, point) => Math.max(best, point.count), 0);
  const word = model.tab === "skipped" ? "skipped" : "logged";
  const tabs = ROUTINE_GRAPH_TABS.map((entry) => `<button type="button" role="tab" data-action="routines-history-tab" data-tab="${entry.id}" aria-selected="${model.tab === entry.id ? "true" : "false"}">${esc(entry.label)}</button>`).join("");
  const bars = model.graph.points.map((point) => {
    const height = max > 0 ? Math.round((point.count / max) * 100) : 0;
    const label = `${longRoutineDay(point.day)}, ${point.count} ${word}`;
    return `<button type="button" class="dr-graph-col" data-action="routines-history-day" data-day="${esc(point.day)}" data-count="${point.count}" aria-label="${esc(label)}" aria-pressed="${point.day === model.day ? "true" : "false"}"><span class="dr-graph-bar" style="height:${height}%"></span></button>`;
  }).join("");
  const read = model.graph.selectedLabel
    ? `<p class="dr-graph-read" data-graph-count="${model.graph.selectedCount}">${esc(model.graph.selectedLabel)}</p>`
    : "";
  return `<div data-history-graph data-graph-tab="${esc(model.tab)}" data-graph-unit="count">
    <div class="dr-graph-tabs" role="tablist" aria-label="Graph">${tabs}</div>
    <p class="sub" id="dr-graph-note">This graph counts logs. It does not add amounts.</p>
    <div class="dr-graph" role="group" aria-labelledby="dr-graph-note">${bars}</div>
    ${read}
  </div>`;
}

function calendarHTML(model) {
  const heads = WEEKDAYS.map((label) => `<span>${label}</span>`).join("");
  const cells = model.cells.map((cell) => {
    if (cell.kind === "pad") return `<span class="dr-cal-pad"></span>`;
    if (cell.future) return `<span class="dr-cal-future">${Number(cell.day.slice(8, 10))}</span>`;
    const names = cell.marks.map((mark) => routineMarkIcon(mark).label).filter(Boolean);
    const detail = names.length ? `, ${names.join(", ")}` : "";
    const label = `${longRoutineDay(cell.day)}${detail}`;
    return `<button type="button" class="dr-cal-day" data-action="routines-history-day" data-day="${esc(cell.day)}" data-today="${cell.today ? "true" : "false"}" data-marks="${esc(cell.marks.join(" "))}" aria-pressed="${cell.selected ? "true" : "false"}" aria-label="${esc(label)}"><span class="dr-cal-num">${Number(cell.day.slice(8, 10))}</span><span class="dr-cal-marks">${marksHTML(cell.marks)}</span></button>`;
  }).join("");
  const next = model.nextMonth ? "" : " disabled";
  return `<div data-history-calendar>
    <div class="dr-cal-nav">
      <button type="button" data-action="routines-history-month" data-delta="-1" aria-label="Previous month">‹</button>
      <h4>${esc(model.monthLabel)}</h4>
      <button type="button" data-action="routines-history-month" data-delta="1" aria-label="Next month"${next}>›</button>
    </div>
    <div class="dr-cal-head" aria-hidden="true">${heads}</div>
    <div class="dr-cal" role="group" aria-label="Calendar, ${esc(model.monthLabel)}">${cells}</div>
  </div>`;
}

function itemRowHTML(row) {
  const amount = row.log ? loggedAmountText(row.log) : "";
  const amountHTML = amount ? `<span class="dr-dose">${esc(amount)}</span>` : "";
  const open = row.mark === "open" ? `<span class="dr-state">Open</span>` : "";
  return `<li class="dr-day-item" data-item-id="${esc(row.itemId)}" data-mark="${esc(row.mark)}">${markHTML(row.mark)}${open}<span class="dr-name">${esc(row.name)}</span>${amountHTML}</li>`;
}

function cardsHTML(model) {
  const cards = model.cards.map((record) => {
    const selected = record.day === model.day;
    const items = selected
      ? `<ul class="dr-day-items">${record.items.map((row) => itemRowHTML(row)).join("")}</ul>`
      : "";
    const empty = selected && !record.items.length && !record.rest ? `<p class="sub">Nothing logged this day.</p>` : "";
    const names = record.marks.map((mark) => routineMarkIcon(mark).label).filter(Boolean);
    const label = names.length ? `${longRoutineDay(record.day)}, ${names.join(", ")}` : longRoutineDay(record.day);
    return `<li class="dr-day-card" data-day="${esc(record.day)}" data-mark="${esc(record.mark)}">
      <button type="button" class="dr-day-open" data-action="routines-history-day" data-day="${esc(record.day)}" aria-pressed="${selected ? "true" : "false"}" aria-label="${esc(label)}">
        <span class="dr-day-label">${esc(shortRoutineDay(record.day))}</span>
        <span class="dr-cal-marks">${marksHTML(record.marks)}</span>
      </button>
      ${items}
      ${empty}
    </li>`;
  }).join("");
  return `<div data-history-days>
    <p class="sub" id="dr-days-label">Days</p>
    <ul class="dr-day-cards" aria-labelledby="dr-days-label">${cards}</ul>
  </div>`;
}

export function routineDayHistorySheetHTML() {
  const model = historyModel();
  return `<h3>History</h3>
    ${graphHTML(model)}
    ${calendarHTML(model)}
    ${cardsHTML(model)}
    <button type="button" class="btn block" data-action="sheet-close">Close</button>`;
}

export function openRoutineDayHistory() {
  if (!signedIn() || !app.ui) return false;
  const today = routineClock().day;
  const cursor = routineHistoryCursor({}, today, {});
  app.ui.sheet = "routines-days";
  app.ui.sd = { month: cursor.month, day: cursor.day };
  if (typeof app.renderSheet === "function") app.renderSheet();
  return true;
}

export function setRoutineHistoryCursor(patch) {
  if (!signedIn() || !app.ui || app.ui.sheet !== "routines-days") return false;
  const today = routineClock().day;
  const next = routineHistoryCursor(app.ui.sd, today, patch || {});
  if (!next.month) return false;
  app.ui.sd = { month: next.month, day: next.day };
  if (typeof app.renderSheet === "function") app.renderSheet();
  return true;
}

export function rememberRoutineGraphTab(state, tab) {
  if (tab !== "logged" && tab !== "skipped") return false;
  if (!ready() || !state || typeof state !== "object") return false;
  const store = normalizeDailyRoutines(state.dailyRoutines);
  if (!store) return false;
  if (store.prefs && store.prefs.historyGraph === tab) return false;
  const clock = routineClock();
  const at = stampAfter(clock.now, store.prefs && store.prefs.updatedAt);
  store.prefs = { ...store.prefs, historyGraph: tab, updatedAt: at };
  store.updatedAt = Math.max(store.updatedAt || 0, at);
  if (!putDailyRoutines(state, store)) return false;
  return true;
}

app.openRoutineDayHistory = openRoutineDayHistory;
app.setRoutineHistoryCursor = setRoutineHistoryCursor;
app.rememberRoutineGraphTab = rememberRoutineGraphTab;
app.routineDayHistorySheetHTML = routineDayHistorySheetHTML;
app.routineHistoryView = routineHistoryView;
