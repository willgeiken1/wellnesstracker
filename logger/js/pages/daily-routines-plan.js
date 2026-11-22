import { app } from "../runtime.js";
import { isLive, lastRoutineSite, projectDailyRoutines, ROUTINE_SITES, routineSiteLabel } from "../shared/daily-routines-store.js";
import { routineBlockDays, routineBlockWindow, routineMinuteOfDay } from "../shared/routine-dose.js";
import {
  routineClock24,
  routineDayLetters,
  routineDaysLabel,
  routineDosesLeft,
  routineHiddenNote,
  routineItemLabel,
  routineLastTaken,
  routineShortName,
  routineTypeName,
  routineTypedItems,
  routineWeekTaken,
} from "../shared/routine-types.js";
import {
  hideRoutineBlock,
  moveRoutineBlock,
  ROUTINE_BLOCK_COLORS,
  routineClock,
  routineDraftWindow,
  routineNextText,
  routineSunAxis,
  routineTypedRowsHTML,
  saveRoutineBlock,
  showRoutineBlock,
} from "./daily-routines.js";

/* Type tabs, the Peptides cards, and the routine sheets: New routine, Edit
   routine and Edit routines, plus Injection sites.

   A type tab lists every item of that type, in a routine or not, with the
   same log, skip and undo as Routines. Peptides gets a card per peptide:
   a ring for doses left, when and how often it is taken, this week's days,
   and the next time and last site.

   A routine's window is picked on the sun path, by dragging either end or
   typing the two times. Saving changes only that routine and which items
   sit in it; logs are never rewritten. */

function esc(value) {
  if (typeof app.esc === "function") return app.esc(value);
  return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

function view() {
  return projectDailyRoutines(app.state && app.state.dailyRoutines) || { blocks: [], hiddenBlocks: [], items: [], placements: [], logs: [], compounds: [], prefs: {} };
}

function tone(color) {
  return ROUTINE_BLOCK_COLORS.includes(color) ? color : "citrus";
}

function n(value) {
  return String(Math.round(value * 10) / 10);
}

/* ---------- Type tabs ---------- */

const TOOL_ICONS = {
  calc: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6M10 3v4l-4 9a3 3 0 0 0 2.7 4.3h6.6A3 3 0 0 0 18 16l-4-9V3"/><path d="M7.5 14h9"/></svg>`,
  sites: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>`,
  add: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`,
};

function toolsHTML() {
  const tool = (action, icon, label, extra = "") => `<button type="button" class="dr-tool" data-action="${action}"${extra}><i aria-hidden="true">${TOOL_ICONS[icon]}</i><span>${esc(label)}</span></button>`;
  return `<div class="dr-tools-row">
    ${tool("routines-calc", "calc", "Reconstitution calculator")}
    ${tool("routines-sites", "sites", "Injection sites")}
    ${tool("routines-add-typed", "add", "Add a peptide", ` data-type="peptide"`)}
  </div>`;
}

const RING_R = 24;

export function routineGaugeHTML(supply) {
  const c = 2 * Math.PI * RING_R;
  if (!supply) {
    return `<svg class="dr-gauge" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="${RING_R}" class="dr-gauge-trk"/><text x="32" y="37" class="dr-gauge-n" text-anchor="middle">–</text></svg>`;
  }
  const fraction = supply.total ? supply.left / supply.total : 0;
  const on = fraction > 0 ? `<circle cx="32" cy="32" r="${RING_R}" class="dr-gauge-on" stroke-dasharray="${n(c * fraction)} ${n(c)}" transform="rotate(-90 32 32)"/>` : "";
  return `<svg class="dr-gauge" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="${RING_R}" class="dr-gauge-trk"/>${on}<text x="32" y="33" class="dr-gauge-n" text-anchor="middle">${supply.left}</text><text x="32" y="45" class="dr-gauge-s" text-anchor="middle">of ${supply.total}</text></svg>`;
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function weekHTML(projected, item, day) {
  const week = routineWeekTaken(projected.logs, item.id, day);
  const letters = routineDayLetters();
  const chips = letters.map((letter, index) => {
    const taken = !!week.days[index];
    const today = index === week.today;
    return `<li data-taken="${taken ? "true" : "false"}" data-today="${today ? "true" : "false"}"><span aria-hidden="true">${letter}</span><span class="dr-vh">${DAY_NAMES[index]}${today ? ", today" : ""}, ${taken ? "taken" : "not taken"}</span></li>`;
  }).join("");
  return `<ol class="dr-week" aria-label="This week">${chips}</ol>`;
}

function doseLine(projected, item) {
  if (!item || item.kind !== "dose" || !item.compoundId) return "";
  const compound = (projected.compounds || []).find((row) => row.id === item.compoundId);
  if (!compound || typeof compound.amount !== "number") return "";
  return `${compound.amount}${compound.unit ? ` ${compound.unit}` : ""}`;
}

function coveringLog(projected, itemId, day) {
  return (projected.logs || []).filter((log) => isLive(log) && log.itemId === itemId && log.day === day && log.rest !== true)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0] || null;
}

function peptideCardHTML(projected, item, date, day) {
  const supply = routineDosesLeft(item, projected.logs);
  const dose = doseLine(projected, item);
  const next = routineNextText(projected, item, date, day);
  const siteId = lastRoutineSite(app.state && app.state.dailyRoutines, item.id) || ((routineLastTaken(projected.logs, item.id) || {}).site || "");
  const site = siteId ? routineSiteLabel(siteId) : "";
  const log = coveringLog(projected, item.id, day);
  const status = [
    next ? `<span>Next <b>${esc(next)}</b></span>` : "",
    site ? `<span>Last site <b>${esc(site)}</b></span>` : "",
  ].join("");
  const ring = supply ? `${supply.left} of ${supply.total} doses left` : "No dose count yet";
  const taken = !!log && log.status !== "skipped";
  /* A taken dose opens its details here, for the site and the amount, as a
     long press on a routine row does. */
  const details = taken
    ? `<button type="button" class="dr-pep-details" data-action="routines-details-open" data-item-id="${esc(item.id)}" data-log-id="${esc(log.id)}">Details <span class="dr-vh">${esc(item.name)}</span></button>`
    : "";
  const act = log
    ? `${details}<button type="button" class="dr-undo" data-action="routines-undo" data-log-id="${esc(log.id)}">Undo <span class="dr-vh">${esc(item.name)}</span></button>
       <span class="dr-mark dr-mark-on" aria-hidden="true">${log.status === "skipped" ? "–" : "✓"}</span>`
    : `<button type="button" class="dr-skip" data-action="routines-skip" data-item-id="${esc(item.id)}">Skip <span class="dr-vh">${esc(item.name)}</span></button>
       <button type="button" class="dr-pep-log" data-action="routines-log" data-item-id="${esc(item.id)}"><span class="dr-mark" aria-hidden="true"></span><span class="dr-vh">Log ${esc(item.name)}</span></button>`;
  return `<article class="dr-pep" data-item-id="${esc(item.id)}"${taken ? ` data-details="card" data-log-id="${esc(log.id)}"` : ""} data-state="${log ? (log.status === "skipped" ? "skipped" : "done") : "open"}">
    <span class="dr-pep-ring" role="img" aria-label="${esc(ring)}">${routineGaugeHTML(supply)}</span>
    <div class="dr-pep-body">
      <p class="dr-pep-k">${esc(routineItemLabel(projected, item))}</p>
      <h3><button type="button" class="dr-pep-name" data-action="routines-edit-item" data-item-id="${esc(item.id)}">${esc(item.name)}</button>${dose ? `<span class="dr-pep-dose">${esc(dose)}</span>` : ""}</h3>
      ${weekHTML(projected, item, day)}
      ${status ? `<p class="dr-pep-st">${status}</p>` : ""}
    </div>
    <div class="dr-pep-act">${act}</div>
  </article>`;
}

export function routineTypeViewHTML(projected, type, date) {
  const clock = date instanceof Date && !Number.isNaN(date.getTime()) ? date : routineClock().date;
  const day = routineClock().day;
  const items = routineTypedItems(projected, type);
  const one = routineTypeName(type, projected.prefs, false);
  const many = routineTypeName(type, projected.prefs, true);
  const add = `<button type="button" class="dr-add" data-action="routines-add-typed" data-type="${esc(type)}">+ Add ${type === "other" ? "an item" : `a ${esc(one.toLowerCase())}`}</button>`;
  if (type === "peptide") {
    const cards = items.map((item) => peptideCardHTML(projected, item, clock, day)).join("");
    return `<section class="dr-type-view" data-type="peptide" aria-label="${esc(many)}">
      ${toolsHTML()}
      ${cards || `<p class="dr-type-empty">No peptides yet. Add one to see its vial ring and week here.</p>`}
      ${items.length ? `<p class="sub dr-type-note">The ring shows doses left from the count you typed. Each one sits on the sun path at its time.</p>` : ""}
    </section>`;
  }
  const rows = routineTypedRowsHTML(projected, items, clock, day);
  return `<section class="dr-type-view" data-type="${esc(type)}" aria-label="${esc(many)}">
    ${items.length ? `<div class="dr-tile dr-type-list" data-color="lavender"><p class="dr-k">${esc(many)}</p><ul class="dr-rows">${rows}</ul></div>` : `<p class="dr-type-empty">Nothing here yet.</p>`}
    ${add}
  </section>`;
}

/* ---------- Injection sites ---------- */

export function openRoutineSites() {
  if (!app.ui) return false;
  app.ui.sheet = "routines-sites";
  app.ui.sd = {};
  if (typeof app.renderSheet === "function") app.renderSheet();
  return true;
}

export function routineSitesSheetHTML() {
  const projected = view();
  const peptides = routineTypedItems(projected, "peptide");
  const ids = new Set(peptides.map((item) => item.id));
  const lastBySite = new Map();
  for (const log of projected.logs || []) {
    if (!isLive(log) || !ids.has(log.itemId) || typeof log.site !== "string" || !log.site) continue;
    const prev = lastBySite.get(log.site);
    if (!prev || (log.at || 0) > (prev.at || 0)) lastBySite.set(log.site, log);
  }
  const rows = ROUTINE_SITES.map((site) => {
    const last = lastBySite.get(site.id);
    const item = last ? peptides.find((row) => row.id === last.itemId) : null;
    const when = last && typeof app.fmtDate === "function" ? app.fmtDate(last.day, { month: "short", day: "numeric" }) : (last ? last.day : "");
    return `<li><span class="dr-site-name">${esc(site.label)}</span><span class="dr-site-last">${last ? `${esc(when)}${item ? ` · ${esc(item.name)}` : ""}` : "Not used yet"}</span></li>`;
  }).join("");
  return `<h3>Injection sites</h3>
    <p class="sub">The last time each site was logged on a peptide. Pick a site in a dose's details after you log it.</p>
    <ul class="dr-sites">${rows}</ul>
    <button type="button" class="btn block" data-action="sheet-close">Done</button>`;
}

/* ---------- Mini sun path for Edit routines ---------- */

const MINI = Object.freeze({ hy: 25, x0: 3, x1: 45, rx: 21, ry: 19, cx: 24 });

function geometry(axis, box) {
  const X = (minutes) => box.x0 + ((axis.place(minutes) - axis.start) / (axis.end - axis.start)) * (box.x1 - box.x0);
  const Y = (x) => {
    const u = (x - box.cx) / box.rx;
    return box.hy - box.ry * Math.sqrt(Math.max(0, 1 - u * u));
  };
  const arc = (from, to) => {
    const a = X(from);
    const b = X(Math.min(to, axis.end));
    if (b - a < 0.3) return "";
    return `M${n(a)} ${n(Y(a))} A${box.rx} ${box.ry} 0 0 1 ${n(b)} ${n(Y(b))}`;
  };
  return { X, Y, arc };
}

export function routineMiniSunHTML(block, axis) {
  const window = routineBlockWindow(block);
  const { arc } = geometry(axis, MINI);
  const win = window ? arc(window.startMin, window.endMin) : "";
  return `<svg class="dr-mini-sun" viewBox="0 0 48 30" aria-hidden="true"><path d="${arc(axis.start, axis.end)}" class="dr-mini-trk"/><line x1="1" y1="${MINI.hy}" x2="47" y2="${MINI.hy}" class="dr-mini-hz"/>${win ? `<path d="${win}" class="dr-mini-win" data-color="${tone(block.color)}"/>` : ""}</svg>`;
}

function itemCount(projected, blockId) {
  const live = new Set((projected.items || []).map((item) => item.id));
  return new Set((projected.placements || []).filter((place) => place.blockId === blockId && live.has(place.itemId)).map((place) => place.itemId)).size;
}

function windowWords(block) {
  const window = routineBlockWindow(block);
  if (!window) return "No set time";
  if (window.endMin - window.startMin <= 60 && !window.own) return `From ${routineClock24(window.startMin)}`;
  return `${routineClock24(window.startMin)}–${routineClock24(window.endMin)}`;
}

/* ---------- Edit routines ---------- */

export function openRoutineBlocks() {
  if (!app.ui) return false;
  app.ui.sheet = "routines-blocks";
  app.ui.sd = {};
  if (typeof app.renderSheet === "function") app.renderSheet();
  return true;
}

export function routineBlocksSheetHTML() {
  const projected = view();
  const blocks = projected.blocks || [];
  const axis = routineSunAxis(blocks.map((block) => routineBlockWindow(block)).filter(Boolean));
  const rows = blocks.map((block, index) => {
    const count = itemCount(projected, block.id);
    const days = routineDaysLabel(routineBlockDays(block));
    const daysWord = days === "Daily" ? "Every day" : days;
    return `<li class="dr-erow" data-block-id="${esc(block.id)}">
      <span class="dr-grip-moves">
        <button type="button" class="dr-move" data-action="routines-block-move" data-block-id="${esc(block.id)}" data-dir="-1" aria-label="Move ${esc(block.name)} up"${index === 0 ? " disabled" : ""}><span aria-hidden="true">▲</span></button>
        <button type="button" class="dr-move" data-action="routines-block-move" data-block-id="${esc(block.id)}" data-dir="1" aria-label="Move ${esc(block.name)} down"${index === blocks.length - 1 ? " disabled" : ""}><span aria-hidden="true">▼</span></button>
      </span>
      ${routineMiniSunHTML(block, axis)}
      <span class="dr-erow-copy"><span class="dr-erow-name">${esc(routineShortName(block))}</span><span class="dr-erow-sub">${esc(windowWords(block))}</span><span class="dr-erow-sub">${esc(daysWord)} · ${count === 1 ? "1 item" : `${count} items`}</span></span>
      <button type="button" class="dr-erow-edit" data-action="routines-block-edit" data-block-id="${esc(block.id)}" aria-label="Edit ${esc(block.name)}">Edit</button>
    </li>`;
  }).join("");
  const store = app.state && app.state.dailyRoutines;
  const hidden = (projected.hiddenBlocks || []).map((block) => `<li class="dr-erow dr-erow-ghost" data-block-id="${esc(block.id)}">
      <span class="dr-erow-copy"><span class="dr-erow-name">${esc(block.name)}</span><span class="dr-erow-sub">${esc(routineHiddenNote(store, block))}</span></span>
      <button type="button" class="dr-erow-edit" data-action="routines-block-show" data-block-id="${esc(block.id)}" aria-label="Restore ${esc(block.name)}">Restore</button>
    </li>`).join("");
  return `<h3>Edit routines</h3>
    <p class="sub">Move, retime and recolor routines. Hiding one keeps its items and history.</p>
    <ul class="dr-elist">${rows}</ul>
    <button type="button" class="dr-add" data-action="routines-block-new">+ New routine</button>
    ${hidden ? `<h4 class="dr-elist-head">Hidden</h4><ul class="dr-elist">${hidden}</ul>` : ""}
    <button type="button" class="btn block" data-action="routines-edit">Rearrange items</button>
    <button type="button" class="btn block" data-action="sheet-close">Done</button>`;
}

/* ---------- New routine and Edit routine ---------- */

const PICK = Object.freeze({ hy: 112, x0: 16, x1: 244, rx: 114, ry: 84, cx: 130 });

function draftWindow(sd) {
  return routineDraftWindow(sd.startMin, sd.endMin);
}

/* The axis is fixed when the sheet opens, so it does not move under a drag. */
function sheetAxis(sd) {
  const span = sd.axis && typeof sd.axis.start === "number" ? sd.axis : null;
  const windows = span ? [{ startMin: span.start, endMin: span.end }] : [];
  return routineSunAxis(windows);
}

export function openRoutineBlockEditor(blockId) {
  if (!app.ui) return false;
  const projected = view();
  const block = blockId ? (projected.blocks || []).find((row) => row.id === blockId) : null;
  if (blockId && !block) return false;
  const window = block ? routineBlockWindow(block) : null;
  const others = (projected.blocks || []).map((row) => routineBlockWindow(row)).filter(Boolean);
  const startMin = window ? window.startMin : 12 * 60;
  const endMin = window ? window.endMin % 1440 : 14 * 60;
  const axis = routineSunAxis([...others, { startMin, endMin: window ? window.endMin : 14 * 60 }]);
  const placed = block
    ? (projected.placements || []).filter((place) => place.blockId === block.id).map((place) => place.itemId)
    : [];
  const used = new Set((projected.blocks || []).map((row) => row.color));
  const color = block ? tone(block.color) : (ROUTINE_BLOCK_COLORS.find((token) => !used.has(token)) || "lavender");
  app.ui.sheet = "routines-block";
  app.ui.sd = {
    blockId: block ? block.id : null,
    name: block ? block.name : "",
    startMin,
    endMin,
    days: block ? routineBlockDays(block) : [0, 1, 2, 3, 4, 5, 6],
    color,
    itemIds: [...new Set(placed)],
    more: false,
    axis: { start: axis.start, end: axis.end },
  };
  if (typeof app.renderSheet === "function") app.renderSheet();
  return true;
}

function pickerGeometry(sd) {
  const axis = sheetAxis(sd);
  const { X, Y, arc } = geometry(axis, PICK);
  const window = draftWindow(sd);
  return { axis, X, Y, arc, window };
}

function pickerSVG(sd) {
  const { axis, X, Y, arc, window } = pickerGeometry(sd);
  const projected = view();
  const parts = [`<path d="${arc(axis.start, axis.end)}" class="dr-sp-ahead"/>`];
  for (const block of projected.blocks || []) {
    if (block.id === sd.blockId) continue;
    const other = routineBlockWindow(block);
    const d = other ? arc(other.startMin, other.endMin) : "";
    if (d) parts.push(`<path d="${d}" class="dr-sp-win dr-sp-faint" data-color="${tone(block.color)}"/>`);
  }
  const label = window ? `${routineClock24(window.startMin)}–${routineClock24(window.endMin)}` : "Pick a time";
  if (window) {
    parts.push(`<path d="${arc(window.startMin, window.endMin)}" class="dr-sp-win dr-sp-pick" data-color="${tone(sd.color)}" data-sp-window="true"/>`);
    for (const [end, minutes] of [["start", window.startMin], ["end", window.endMin]]) {
      const x = X(minutes);
      parts.push(`<g class="dr-sp-handle" data-sp-handle="${end}"><line x1="${n(x)}" y1="${PICK.hy}" x2="${n(x)}" y2="${n(Y(x))}"/><circle cx="${n(x)}" cy="${n(Y(x))}" r="11"/></g>`);
    }
  }
  parts.push(`<line x1="${PICK.x0}" y1="${PICK.hy}" x2="${PICK.x1}" y2="${PICK.hy}" class="dr-sp-horizon"/>`);
  for (let minutes = axis.start; minutes <= axis.end; minutes += 180) {
    parts.push(`<text x="${n(X(minutes))}" y="${PICK.hy + 16}" class="dr-sp-label" text-anchor="middle">${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}</text>`);
  }
  parts.push(`<text x="${PICK.cx}" y="80" class="dr-sp-time dr-sp-time-sm" text-anchor="middle" data-sp-label="true">${label}</text>`);
  parts.push(`<text x="${PICK.cx}" y="97" class="dr-sp-sub" text-anchor="middle">drag either end</text>`);
  return `<svg class="dr-sun dr-sun-pick" viewBox="0 0 260 132" aria-hidden="true" data-sp-picker="true">${parts.join("")}</svg>`;
}

function itemChipsHTML(sd) {
  const projected = view();
  const placed = new Set(sd.itemIds || []);
  const items = projected.items || [];
  const inside = items.filter((item) => placed.has(item.id));
  const chips = inside.map((item) => `<button type="button" class="dr-chip" data-action="routines-block-item" data-item-id="${esc(item.id)}" aria-pressed="true" aria-label="Remove ${esc(item.name)} from this routine">${esc(item.name)} <span aria-hidden="true">×</span></button>`).join("");
  const rest = items.filter((item) => !placed.has(item.id));
  const more = sd.more === true && rest.length
    ? `<div class="dr-chips dr-chips-more" role="group" aria-label="Add from your tabs and routines">${rest.map((item) => `<button type="button" class="dr-chip" data-action="routines-block-item" data-item-id="${esc(item.id)}" aria-pressed="false">+ ${esc(item.name)}</button>`).join("")}</div>`
    : "";
  return `<div class="dr-chips" role="group" aria-labelledby="dr-block-items-label">
      ${chips}
      ${rest.length ? `<button type="button" class="dr-chip dr-chip-quiet" data-action="routines-block-more" aria-expanded="${sd.more === true ? "true" : "false"}">+ From your tabs</button>` : ""}
      <button type="button" class="dr-chip dr-chip-quiet" data-action="routines-discover">+ From the library</button>
    </div>
    ${more}`;
}

export function routineBlockSheetHTML() {
  const sd = app.ui && app.ui.sd ? app.ui.sd : {};
  const window = draftWindow(sd);
  const days = new Set(Array.isArray(sd.days) ? sd.days : []);
  const letters = routineDayLetters();
  const dayButtons = letters.map((letter, index) => `<button type="button" class="dr-day" data-action="routines-block-day" data-day="${index}" aria-pressed="${days.has(index) ? "true" : "false"}" aria-label="${DAY_NAMES[index]}">${letter}</button>`).join("");
  const colors = ROUTINE_BLOCK_COLORS.map((token) => `<button type="button" class="dr-swatch" data-color="${token}" data-action="routines-block-color" aria-pressed="${sd.color === token ? "true" : "false"}" aria-label="${token}, follows the accent"></button>`).join("");
  const start = window ? routineClock24(window.startMin) : "";
  const end = window ? routineClock24(window.endMin) : "";
  const editing = !!sd.blockId;
  return `<h3>${editing ? "Edit routine" : "New routine"}</h3>
    <label class="field-label" for="dr-block-name">Name</label>
    <input class="text-in" id="dr-block-name" autocomplete="off" maxlength="80" enterkeyhint="done" value="${esc(sd.name || "")}">
    <span class="field-label" id="dr-block-when-label">When</span>
    <div class="dr-pick" role="group" aria-labelledby="dr-block-when-label">
      ${pickerSVG(sd)}
      <div class="dr-pick-times">
        <label><span class="dr-vh">Starts at</span><input class="text-in" id="dr-block-start" type="time" step="300" value="${esc(start)}"></label>
        <label><span class="dr-vh">Ends at</span><input class="text-in" id="dr-block-end" type="time" step="300" value="${esc(end)}"></label>
      </div>
    </div>
    <span class="field-label" id="dr-block-days-label">Days</span>
    <div class="dr-days" role="group" aria-labelledby="dr-block-days-label">${dayButtons}</div>
    <div class="dr-set-row"><span id="dr-block-color-label">Color</span><div class="dr-colors" role="radiogroup" aria-labelledby="dr-block-color-label">${colors}</div></div>
    <span class="field-label" id="dr-block-items-label">Items</span>
    ${itemChipsHTML(sd)}
    <button type="button" class="btn primary block" data-action="routines-block-save">Save routine</button>
    ${editing ? `<button type="button" class="btn block" data-action="routines-block-hide" data-block-id="${esc(sd.blockId)}">Hide routine</button>
    <p class="sub">Hiding keeps its items and history. Restore it from Edit routines.</p>` : ""}`;
}

/* Typed times are read before any tap rebuilds the sheet. */
export function rememberRoutineBlockFields() {
  const sd = app.ui && app.ui.sd;
  if (!sd || app.ui.sheet !== "routines-block" || typeof app.$ !== "function") return false;
  const read = (id) => {
    const el = app.$(`#${id}`);
    return el && typeof el.value === "string" ? el.value : null;
  };
  const name = read("dr-block-name");
  const start = read("dr-block-start");
  const end = read("dr-block-end");
  if (name != null) sd.name = name;
  const parse = (value) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
    if (!match) return null;
    return routineMinuteOfDay(Number(match[1]) * 60 + Number(match[2]));
  };
  if (start != null && parse(start) != null) sd.startMin = parse(start);
  if (end != null && parse(end) != null) sd.endMin = parse(end);
  return true;
}

export function toggleRoutineBlockDay(index) {
  const sd = app.ui && app.ui.sd;
  if (!sd || !Number.isInteger(index) || index < 0 || index > 6) return false;
  rememberRoutineBlockFields();
  const days = new Set(Array.isArray(sd.days) ? sd.days : []);
  if (days.has(index) && days.size === 1) {
    if (typeof app.toast === "function") app.toast("A routine runs at least one day.");
    return false;
  }
  if (days.has(index)) days.delete(index);
  else days.add(index);
  sd.days = [...days].sort((a, b) => a - b);
  return true;
}

export function toggleRoutineBlockItem(itemId) {
  const sd = app.ui && app.ui.sd;
  if (!sd || typeof itemId !== "string" || !itemId) return false;
  rememberRoutineBlockFields();
  const ids = Array.isArray(sd.itemIds) ? sd.itemIds.slice() : [];
  sd.itemIds = ids.includes(itemId) ? ids.filter((id) => id !== itemId) : ids.concat(itemId);
  return true;
}

export function commitRoutineBlockSheet() {
  const sd = app.ui && app.ui.sd;
  if (!sd) return false;
  rememberRoutineBlockFields();
  if (!saveRoutineBlock(app.state, sd)) {
    if (typeof app.toast === "function") app.toast("Add a name and both times.");
    return false;
  }
  const back = app.ui.routineBlocksOpen === true;
  app.ui.sheet = back ? "routines-blocks" : null;
  app.ui.sd = {};
  app.ui.routineAnnounce = sd.blockId ? "Routine saved." : "Routine added.";
  if (typeof app.save === "function") app.save();
  if (typeof app.render === "function") app.render();
  return true;
}

export function hideRoutineFromSheet(blockId) {
  if (!hideRoutineBlock(app.state, blockId)) return false;
  app.ui.sheet = "routines-blocks";
  app.ui.sd = {};
  app.ui.routineAnnounce = "Routine hidden. Restore it from Edit routines.";
  if (typeof app.save === "function") app.save();
  if (typeof app.render === "function") app.render();
  return true;
}

export function showRoutineFromSheet(blockId) {
  if (!showRoutineBlock(app.state, blockId)) return false;
  app.ui.routineAnnounce = "Routine restored.";
  if (typeof app.save === "function") app.save();
  if (typeof app.render === "function") app.render();
  return true;
}

export function moveRoutineFromSheet(blockId, delta) {
  if (!moveRoutineBlock(app.state, blockId, delta)) return false;
  if (typeof app.save === "function") app.save();
  if (typeof app.render === "function") app.render();
  return true;
}

/* ---------- Dragging an end of the window ---------- */

let drag = null;

function pointMinutes(svg, clientX) {
  const sd = app.ui && app.ui.sd;
  if (!sd || !svg || typeof svg.getBoundingClientRect !== "function") return null;
  const rect = svg.getBoundingClientRect();
  if (!rect.width) return null;
  const x = ((clientX - rect.left) / rect.width) * 260;
  const axis = sheetAxis(sd);
  const ratio = Math.min(1, Math.max(0, (x - PICK.x0) / (PICK.x1 - PICK.x0)));
  const raw = axis.start + ratio * (axis.end - axis.start);
  return Math.round(raw / 15) * 15;
}

function paintPicker(svg) {
  const sd = app.ui && app.ui.sd;
  const { X, Y, arc, window } = pickerGeometry(sd);
  if (!window || !svg) return;
  const path = svg.querySelector("[data-sp-window]");
  if (path) path.setAttribute("d", arc(window.startMin, window.endMin));
  for (const [end, minutes] of [["start", window.startMin], ["end", window.endMin]]) {
    const handle = svg.querySelector(`[data-sp-handle="${end}"]`);
    if (!handle) continue;
    const x = X(minutes);
    const line = handle.querySelector("line");
    const dot = handle.querySelector("circle");
    if (line) { line.setAttribute("x1", n(x)); line.setAttribute("x2", n(x)); line.setAttribute("y2", n(Y(x))); }
    if (dot) { dot.setAttribute("cx", n(x)); dot.setAttribute("cy", n(Y(x))); }
  }
  const label = svg.querySelector("[data-sp-label]");
  if (label) label.textContent = `${routineClock24(window.startMin)}–${routineClock24(window.endMin)}`;
  const startIn = typeof app.$ === "function" ? app.$("#dr-block-start") : null;
  const endIn = typeof app.$ === "function" ? app.$("#dr-block-end") : null;
  if (startIn) startIn.value = routineClock24(window.startMin);
  if (endIn) endIn.value = routineClock24(window.endMin);
}

function onPickDown(ev) {
  const target = ev.target && typeof ev.target.closest === "function" ? ev.target.closest("[data-sp-handle]") : null;
  if (!target || !app.ui || app.ui.sheet !== "routines-block") return;
  const svg = target.closest("[data-sp-picker]");
  rememberRoutineBlockFields();
  drag = { end: target.getAttribute("data-sp-handle"), svg, id: ev.pointerId };
  if (typeof svg.setPointerCapture === "function" && ev.pointerId != null) {
    try { svg.setPointerCapture(ev.pointerId); } catch { /* the drag still follows the document */ }
  }
  if (ev.cancelable) ev.preventDefault();
}

function onPickMove(ev) {
  if (!drag || !app.ui || !app.ui.sd) return;
  const minutes = pointMinutes(drag.svg, ev.clientX);
  if (minutes == null) return;
  const sd = app.ui.sd;
  const window = draftWindow(sd);
  if (!window) return;
  if (drag.end === "start") {
    const latest = window.endMin - 15;
    sd.startMin = Math.min(minutes, latest) % 1440;
  } else {
    const earliest = window.startMin + 15;
    sd.endMin = Math.max(minutes, earliest) % 1440;
  }
  paintPicker(drag.svg);
  if (ev.cancelable) ev.preventDefault();
}

function onPickUp() {
  drag = null;
}

if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  document.addEventListener("pointerdown", onPickDown, { passive: false });
  document.addEventListener("pointermove", onPickMove, { passive: false });
  document.addEventListener("pointerup", onPickUp);
  document.addEventListener("pointercancel", onPickUp);
}

app.routineTypeViewHTML = routineTypeViewHTML;
app.routineSitesSheetHTML = routineSitesSheetHTML;
app.openRoutineSites = openRoutineSites;
app.routineBlocksSheetHTML = routineBlocksSheetHTML;
app.openRoutineBlocks = openRoutineBlocks;
app.routineBlockSheetHTML = routineBlockSheetHTML;
app.openRoutineBlockEditor = openRoutineBlockEditor;
app.rememberRoutineBlockFields = rememberRoutineBlockFields;
app.toggleRoutineBlockDay = toggleRoutineBlockDay;
app.toggleRoutineBlockItem = toggleRoutineBlockItem;
app.commitRoutineBlockSheet = commitRoutineBlockSheet;
app.hideRoutineFromSheet = hideRoutineFromSheet;
app.showRoutineFromSheet = showRoutineFromSheet;
app.moveRoutineFromSheet = moveRoutineFromSheet;
