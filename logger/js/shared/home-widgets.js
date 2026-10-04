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

function tile(id, label, value) {
  return `<div class="stat" data-oura-widget="${id}"><b>${esc(value)}</b><span>${esc(label)}</span></div>`;
}

function renderOura(id) {
  const o = reading() || {};
  const hm = (sec) => (typeof app.fmtHM === "function" ? app.fmtHM(sec) : shown(sec));
  switch (id) {
    case "readiness": return tile(id, "Readiness", shown(o.readiness));
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
  if (!layout || layout.v !== 2 || !Array.isArray(layout.items)) return null;
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
