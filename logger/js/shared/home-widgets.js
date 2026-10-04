import { app } from "../runtime.js";

/* Stub registry. Step 1 replaces this file.
   Ids, sizes, and needsOura match the locked Home widget interface.
   render and preview take no arguments. Non-Oura renders stay empty so the
   current Home page keeps drawing those sections until the real registry lands.
   Oura tiles are drawn here so Home can show and hide them. */

const SPECS = [
  ["readiness", "Readiness", "recovery", "small", true],
  ["sleep-score", "Sleep score", "recovery", "small", true],
  ["sleep-duration", "Sleep duration", "recovery", "small", true],
  ["hrv", "HRV", "recovery", "small", true],
  ["resting-hr", "Resting HR", "recovery", "small", true],
  ["steps", "Steps", "recovery", "small", true],
  ["weekly-goal", "Weekly goal", "training", "small", false],
  ["food-today", "Food today", "nutrition", "small", false],
  ["food-yesterday", "Yesterday's food", "nutrition", "small", false],
  ["weight-trend", "Weight trend", "body", "small", false],
  ["cardio-minutes", "Cardio minutes", "training", "small", false],
  ["today", "Today", "training", "medium", false],
  ["this-week", "This week", "training", "medium", false],
  ["pattern", "Today's pattern", "insight", "medium", false],
  ["headline", "Headline", "insight", "medium", false],
  ["muscles", "Muscles this week", "training", "medium", false],
  ["cardio", "Cardio", "training", "medium", false],
  ["last-night", "Last night", "recovery", "medium", true],
];

function esc(s) {
  if (typeof app.esc === "function") return app.esc(s);
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function reading() {
  if (typeof app.latestOura !== "function" || typeof app.src !== "function") return null;
  try { return app.latestOura(app.src().oura); }
  catch (e) { return null; }
}

function shown(v, fmt) {
  if (v == null || Number.isNaN(v)) return "–";
  return fmt ? fmt(v) : String(v);
}

function latestDay() {
  if (typeof app.src !== "function") return null;
  try {
    const days = app.src().oura;
    if (!days || typeof days !== "object") return null;
    const keys = Object.keys(days).filter((k) => days[k] && typeof days[k] === "object").sort();
    return keys.length ? days[keys[keys.length - 1]] : null;
  } catch (e) { return null; }
}

function awaitingFirstSync() {
  if (latestDay()) return false;
  return !!(app.state && app.state.oura && app.state.oura.connected);
}

function labelFor(id) {
  if (id === "sleep-score") return "Sleep score";
  if (id === "sleep-duration") return "Sleep";
  if (id === "hrv") return "HRV";
  if (id === "resting-hr") return "Resting HR";
  if (id === "steps") return "Steps";
  return "Readiness";
}

function tile(id, label, value, opt = {}) {
  const cls = ["stat", opt.level ? `lvl-${opt.level}` : ""].filter(Boolean).join(" ");
  const caption = opt.word ? `${label} · ${opt.word}` : label;
  const inner = `<b>${esc(value)}</b><span>${esc(caption)}</span>`;
  if (id === "readiness") {
    const named = value != null && value !== "–" ? `${label} ${value}` : label;
    const aria = opt.word ? `${named}, ${opt.word}, open Recovery` : `${named}, open Recovery`;
    return `<button type="button" class="${cls}" data-oura-widget="${id}" data-action="tab" data-tab="recovery" aria-label="${esc(aria)}">${inner}</button>`;
  }
  return `<div class="${cls}" data-oura-widget="${id}">${inner}</div>`;
}

export function homeAwaitingSync() {
  return awaitingFirstSync();
}

function renderOura(id) {
  const label = labelFor(id);
  if (awaitingFirstSync()) return id === "last-night"
    ? `<div class="card" data-oura-widget="last-night"><h4>Last night</h4><p class="sub">–</p></div>`
    : tile(id, label, "–");
  const o = reading() || {};
  const hm = (sec) => (typeof app.fmtHM === "function" ? app.fmtHM(sec) : shown(sec));
  const lv = o.readiness != null && typeof app.readinessLevel === "function" ? app.readinessLevel(o.readiness) : null;
  switch (id) {
    case "readiness": return tile(id, "Readiness", shown(o.readiness), { level: lv && lv.cls, word: lv && lv.word });
    case "sleep-score": return tile(id, "Sleep score", shown(o.sleepScore));
    case "sleep-duration": return tile(id, "Sleep", shown(o.total, hm));
    case "hrv": return tile(id, "HRV", shown(o.hrv, (v) => `${v} ms`));
    case "resting-hr": return tile(id, "Resting HR", shown(o.rhr, (v) => `${v} bpm`));
    case "steps": return tile(id, "Steps", shown(o.steps, (v) => Number(v).toLocaleString()));
    case "last-night": return `<div class="card" data-oura-widget="last-night"><h4>Last night</h4><p class="sub">${esc(o.total != null ? `Slept ${hm(o.total)}` : "–")}</p></div>`;
    default: return "";
  }
}

function widget(id, name, category, size, needsOura) {
  return {
    id, name, category, size, needsOura,
    render() { return needsOura ? renderOura(id) : ""; },
    preview() { return name; },
  };
}

export const HOME_WIDGETS = Object.fromEntries(SPECS.map((row) => {
  const w = widget(row[0], row[1], row[2], row[3], row[4]);
  return [w.id, w];
}));

export function getHomeLayout(state) {
  const layout = state && state.layout && state.layout.homeV2;
  if (!layout || layout.v !== 2) return null;
  return layout;
}

export function setHomeLayout(state, layout) {
  if (!state.layout || typeof state.layout !== "object" || Array.isArray(state.layout)) state.layout = {};
  const next = {
    ...(layout && typeof layout === "object" ? layout : {}),
    v: 2,
    items: layout && Array.isArray(layout.items) ? layout.items : [],
    hidden: layout && Array.isArray(layout.hidden) ? layout.hidden : [],
    updatedAt: layout && typeof layout.updatedAt === "number" ? layout.updatedAt : Date.now(),
  };
  if (!(layout && layout.ouraSeeded)) delete next.ouraSeeded;
  state.layout.homeV2 = next;
  return next;
}
