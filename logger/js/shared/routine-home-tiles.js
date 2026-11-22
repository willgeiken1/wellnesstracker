import { app } from "../runtime.js";
import { canMutateRoutines, isLive, normalizeDailyRoutines, projectDailyRoutines, putDailyRoutines } from "./daily-routines-store.js";
import { routineBlockRunsOn } from "./routine-dose.js";

/* Home tiles for Routines. The flag stays off in source. These ids are not
   catalog widgets. With the flag off they stay unknown strings: a saved
   layout keeps them, and this build does not paint them. Stacks and the
   long-press preview are not in this build. The stack cap is unused. */

export const NEXT_UP_TILE_ID = "routine-next";
export const ROUTINE_TILE_STACK_CAP = 5;

const BLOCK_PREFIX = "routine-block:";
const ITEM_PREFIX = "routine-item:";

function esc(value) {
  const text = String(value == null ? "" : value);
  return text.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

export function isRoutineTileId(id) {
  if (typeof id !== "string" || !id) return false;
  if (id === NEXT_UP_TILE_ID) return true;
  if (id.startsWith(BLOCK_PREFIX) && id.length > BLOCK_PREFIX.length) return true;
  if (id.startsWith(ITEM_PREFIX) && id.length > ITEM_PREFIX.length) return true;
  return false;
}

export function routineBlockTileId(blockId) {
  if (typeof blockId !== "string" || !blockId || blockId.length > 80) return "";
  return BLOCK_PREFIX + blockId;
}

export function routineItemTileId(itemId) {
  if (typeof itemId !== "string" || !itemId || itemId.length > 80) return "";
  return ITEM_PREFIX + itemId;
}

export function routineTileTarget(id) {
  if (id === NEXT_UP_TILE_ID) return { kind: "next" };
  if (typeof id === "string" && id.startsWith(BLOCK_PREFIX)) return { kind: "block", blockId: id.slice(BLOCK_PREFIX.length) };
  if (typeof id === "string" && id.startsWith(ITEM_PREFIX)) return { kind: "item", itemId: id.slice(ITEM_PREFIX.length) };
  return null;
}

/* Big tiles are the medium Home size. Item tiles start small. */
export function routineDefaultSize(id) {
  if (typeof id === "string" && id.startsWith(ITEM_PREFIX)) return "small";
  return "medium";
}

/* Stacks wait. Callers that group tiles later must stop at five.
   Adding a tile to Home does not call this. */
export function clampRoutineTileStack(ids) {
  const out = [];
  (Array.isArray(ids) ? ids : []).forEach((id) => {
    if (typeof id !== "string" || !id || out.includes(id)) return;
    if (out.length >= ROUTINE_TILE_STACK_CAP) return;
    out.push(id);
  });
  return out;
}

export function routineStacksEnabled() {
  return false;
}

/* The long-press tile preview is not in this build. A hold still enters edit. */
export function routineTilePreview() {
  return null;
}

export function routineTileDropEffect() {
  return "reorder";
}

export function parseClockMinutes(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function formatClock(minutes) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function normalizeTileGate(gate) {
  if (!gate || typeof gate !== "object" || Array.isArray(gate)) return null;
  const startMin = parseClockMinutes(gate.start);
  const endMin = parseClockMinutes(gate.end);
  if (startMin == null || endMin == null || startMin === endMin) return null;
  return { start: formatClock(startMin), end: formatClock(endMin) };
}

export function sanitizeRoutineGates(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out = {};
  Object.keys(raw).forEach((id) => {
    if (!isRoutineTileId(id)) return;
    const gate = normalizeTileGate(raw[id]);
    if (gate) out[id] = gate;
  });
  return Object.keys(out).length ? out : null;
}

/* End is exclusive. A window that passes midnight wraps. A missing gate is always on. */
export function tileGateVisible(gate, date) {
  const window = normalizeTileGate(gate);
  if (!window) return true;
  const when = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const now = when.getHours() * 60 + when.getMinutes();
  const start = parseClockMinutes(window.start);
  const end = parseClockMinutes(window.end);
  if (start < end) return now >= start && now < end;
  return now >= start || now < end;
}

export function routineTileOnNow(id, layout, date) {
  if (!isRoutineTileId(id)) return false;
  const gates = layout && layout.routineGates;
  const gate = gates && gates[id];
  return tileGateVisible(gate, date);
}

function gatedIds(layout) {
  if (!layout || typeof layout !== "object") return [];
  const hidden = new Set(Array.isArray(layout.hidden) ? layout.hidden : []);
  const items = Array.isArray(layout.items) ? layout.items : [];
  const ids = [];
  items.forEach((id) => {
    if (typeof id !== "string" || hidden.has(id) || !isRoutineTileId(id)) return;
    if (!normalizeTileGate(layout.routineGates && layout.routineGates[id])) return;
    ids.push(id);
  });
  if (layout.routineNextAside === true && !items.includes(NEXT_UP_TILE_ID) && !hidden.has(NEXT_UP_TILE_ID)) {
    if (normalizeTileGate(layout.routineGates && layout.routineGates[NEXT_UP_TILE_ID])) ids.push(NEXT_UP_TILE_ID);
  }
  return ids;
}

/* Ids whose clock window is open. Tiles without a window are omitted, so the
   signature changes only when a gate opens or closes. */
export function routineGateSignature(layout, date) {
  return gatedIds(layout).filter((id) => routineTileOnNow(id, layout, date)).join("\n");
}

export function routineGateRefresh(previous, layout, date) {
  const signature = routineGateSignature(layout, date);
  return { signature, changed: previous != null && previous !== signature };
}

/* Called from the rest timer while Home is on screen. The first look records
   the open gates and does not paint. A later look paints only when a window
   has opened or closed. */
export function refreshHomeRoutineGates() {
  if (app.ROUTINES_ENABLED !== true || !app.ui || app.ui.tab !== "home" || app.ui.homeEdit || app.ui.sheet) return false;
  const layout = app.state && app.state.layout && app.state.layout.homeV2;
  const result = routineGateRefresh(app.routineGateShown, layout, paintDate());
  app.routineGateShown = result.signature;
  if (!result.changed) return false;
  if (typeof app.render === "function") app.render();
  return true;
}

function routinesView(state) {
  return projectDailyRoutines(state && state.dailyRoutines) || {
    blocks: [], items: [], placements: [], compounds: [], logs: [], prefs: {},
  };
}

function dayKey() {
  if (typeof app.today === "function") {
    try {
      const day = app.today();
      if (typeof day === "string" && day) return day;
    } catch (e) { /* fall through */ }
  }
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const date = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${date}`;
}

function paintDate(date) {
  if (date instanceof Date && !Number.isNaN(date.getTime())) return date;
  if (typeof app.routineNow === "function") {
    try {
      const value = app.routineNow();
      if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    } catch (e) { /* fall through */ }
  }
  return new Date();
}

/* With a day, only routines that run that weekday, as Routines shows them. */
function runsOn(block, day) {
  return !day || routineBlockRunsOn(block, day);
}

/* An item in routines is due on a day one of them runs. One in no routine
   lives on its type tab and is due every day. */
function itemDue(view, itemId, day) {
  const blocks = (view.placements || []).filter((row) => row && row.itemId === itemId)
    .map((row) => (view.blocks || []).find((block) => block && block.id === row.blockId))
    .filter(Boolean);
  return !blocks.length || blocks.some((block) => runsOn(block, day));
}

function itemsInOrder(view, day = "") {
  const byId = new Map((view.items || []).map((item) => [item.id, item]));
  const out = [];
  const seen = new Set();
  (view.blocks || []).filter((block) => runsOn(block, day)).forEach((block) => {
    const rows = (view.placements || [])
      .filter((row) => row && row.blockId === block.id && byId.has(row.itemId))
      .slice()
      .sort((a, b) => (a.order || 0) - (b.order || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    rows.forEach((row) => {
      if (seen.has(row.itemId)) return;
      seen.add(row.itemId);
      out.push({ block, item: byId.get(row.itemId) });
    });
  });
  return out;
}

function coveringLog(logs, itemId, day) {
  const rows = (Array.isArray(logs) ? logs : []).filter((log) => isLive(log) && log.itemId === itemId && log.day === day && log.rest !== true);
  rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return rows[0] || null;
}

function amountText(view, item) {
  if (!item || item.kind !== "dose" || !item.compoundId) return "";
  const compound = (view.compounds || []).find((row) => row && row.id === item.compoundId);
  if (!compound || typeof compound.amount !== "number" || !Number.isFinite(compound.amount)) return "";
  const shown = String(Math.round(compound.amount * 1000) / 1000);
  return compound.unit ? `${shown} ${compound.unit}` : shown;
}

function rowLabel(view, item) {
  const name = item && item.name ? item.name : "Item";
  const amount = amountText(view, item);
  return amount ? `${name} · ${amount}` : name;
}

function openEntries(view, day) {
  return itemsInOrder(view, day).filter((entry) => !coveringLog(view.logs, entry.item.id, day));
}

function nextEntry(view, day) {
  const open = openEntries(view, day);
  return open.length ? open[0] : null;
}

function blockEntries(view, blockId, day) {
  const block = (view.blocks || []).find((row) => row && row.id === blockId);
  if (block && !runsOn(block, day)) return [];
  const byId = new Map((view.items || []).map((item) => [item.id, item]));
  return (view.placements || [])
    .filter((row) => row && row.blockId === blockId && byId.has(row.itemId))
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((row) => ({ item: byId.get(row.itemId) }))
    .filter((entry) => !coveringLog(view.logs, entry.item.id, day));
}

function canLog() {
  return canMutateRoutines() && !pullPending();
}

function checkButton(item, label, tileId) {
  if (!canLog()) {
    return `<button type="button" class="rt-check" data-action="routine-tile-open" data-tile-id="${esc(tileId)}">Open <span class="rt-vh">${esc(label)}</span></button>`;
  }
  return `<button type="button" class="rt-check" data-action="routines-log" data-item-id="${esc(item.id)}">Log <span class="rt-vh">${esc(label)}</span></button>`;
}

function jumpButton(tileId, kicker, title) {
  return `<button type="button" class="hw hw-hit rt-jump" data-action="routine-tile-open" data-tile-id="${esc(tileId)}"><p class="hw-k">${esc(kicker)}</p><p class="hw-line">${esc(title)}</p></button>`;
}

function gateLabel(layout, id) {
  const gates = layout && (layout.routineGates || layout.gates);
  const gate = normalizeTileGate(gates && gates[id]);
  return gate ? `${gate.start}–${gate.end}` : "";
}

function bigCard(id, kicker, lines, layout) {
  const when = gateLabel(layout, id);
  const body = lines.length ? lines.join("") : `<p class="hw-sub">All done today</p>`;
  const time = when ? `<p class="hw-sub">${esc(when)}</p>` : "";
  return `<article class="hw rt-card" data-routine-tile="${esc(id)}"><p class="hw-k">${esc(kicker)}</p>${time}${body}</article>`;
}

export function renderRoutineTileHTML(id, options) {
  if (app.ROUTINES_ENABLED !== true || !isRoutineTileId(id)) return "";
  const opts = options || {};
  const state = opts.state || app.state;
  const view = routinesView(state);
  const day = opts.day || dayKey();
  const size = opts.size === "small" || opts.size === "medium" ? opts.size : routineDefaultSize(id);
  const layout = opts.layout || {};
  const target = routineTileTarget(id);

  if (size === "small") {
    if (target.kind === "next") {
      const entry = nextEntry(view, day);
      return jumpButton(id, "Next up", entry ? rowLabel(view, entry.item) : "All done today");
    }
    if (target.kind === "block") {
      const block = (view.blocks || []).find((row) => row.id === target.blockId);
      return jumpButton(id, "Routine", block && block.name ? block.name : "Routine");
    }
    const item = (view.items || []).find((row) => row.id === target.itemId);
    return jumpButton(id, "Routine", item ? rowLabel(view, item) : "Item");
  }

  if (target.kind === "next") {
    const entry = nextEntry(view, day);
    const lines = entry ? [`<p class="hw-line">${esc(rowLabel(view, entry.item))}</p>`, checkButton(entry.item, rowLabel(view, entry.item), id)] : [];
    return bigCard(id, "Next up", lines, layout);
  }
  if (target.kind === "item") {
    const item = (view.items || []).find((row) => row.id === target.itemId);
    if (!item) return bigCard(id, "Routine", [`<p class="hw-sub">Nothing to show yet</p>`], layout);
    const open = !coveringLog(view.logs, item.id, day) && itemDue(view, item.id, day);
    const lines = [`<p class="hw-line">${esc(rowLabel(view, item))}</p>`];
    if (open) lines.push(checkButton(item, rowLabel(view, item), id));
    return bigCard(id, "Routine", lines, layout);
  }
  const block = (view.blocks || []).find((row) => row.id === target.blockId);
  const title = block && block.name ? block.name : "Routine";
  const open = block ? blockEntries(view, block.id, day) : [];
  const shown = open.slice(0, 4).map((entry) => `<p class="hw-line">${esc(rowLabel(view, entry.item))}</p>${checkButton(entry.item, rowLabel(view, entry.item), id)}`);
  if (open.length > 4) shown.push(`<p class="hw-sub">${open.length - 4} more</p>`);
  return bigCard(id, title, shown, layout);
}

export function routineAsideHTML(layout, data) {
  if (app.ROUTINES_ENABLED !== true || !layout || layout.routineNextAside !== true) return "";
  const items = Array.isArray(layout.items) ? layout.items : [];
  const hidden = Array.isArray(layout.hidden) ? layout.hidden : [];
  if (items.includes(NEXT_UP_TILE_ID) || hidden.includes(NEXT_UP_TILE_ID)) return "";
  const when = paintDate(data && data.date);
  if (!routineTileOnNow(NEXT_UP_TILE_ID, layout, when)) return "";
  const html = renderRoutineTileHTML(NEXT_UP_TILE_ID, {
    state: data && data.routinesState ? data.routinesState : app.state,
    layout,
    date: when,
    size: "medium",
  });
  if (!html) return "";
  return `<div class="hw-slot span-m" data-hw="${NEXT_UP_TILE_ID}">${html}<button type="button" class="rt-hide" data-action="routine-tile-hide" data-tile-id="${NEXT_UP_TILE_ID}">Remove from Home</button></div>`;
}

function registryEdit(state) {
  const saved = state && state.layout && state.layout.homeV2;
  if (!saved || saved.v !== 2 || !Array.isArray(saved.items)) return false;
  if (saved.migrated === true) return false;
  if (typeof saved.migratedAt === "number" && saved.migratedAt > 0) return false;
  return true;
}

function signedInWithRoutines(state) {
  if (!app.session || !app.session.user) return false;
  const items = state && state.dailyRoutines && state.dailyRoutines.items;
  return Array.isArray(items) && items.some((item) => item && !(typeof item.deletedAt === "number" && item.deletedAt > 0));
}

export function legacyNextUpWanted(state) {
  if (app.ROUTINES_ENABLED !== true) return false;
  if (!signedInWithRoutines(state)) return false;
  if (registryEdit(state)) return false;
  const home = state && state.layout && state.layout.homeV2;
  if (home && Array.isArray(home.hidden) && home.hidden.includes(NEXT_UP_TILE_ID)) return false;
  if (home && Array.isArray(home.items) && home.items.includes(NEXT_UP_TILE_ID)) return false;
  const prefs = state && state.dailyRoutines && state.dailyRoutines.prefs;
  if (prefs && prefs.homeNextHidden === true) return false;
  if (app.ui && app.ui.homeNextHidden === true) return false;
  return true;
}

export function legacyNextUpHTML(state) {
  if (!legacyNextUpWanted(state)) return "";
  const html = renderRoutineTileHTML(NEXT_UP_TILE_ID, { state, size: "medium" });
  if (!html) return "";
  return `<div class="home-v2 rt-legacy"><div class="hw-slot span-m" data-hw="${NEXT_UP_TILE_ID}">${html}<button type="button" class="rt-hide" data-action="routine-tile-hide" data-tile-id="${NEXT_UP_TILE_ID}">Remove from Home</button></div></div>`;
}

function pullPending() {
  return !!(app.sb && app.cloudPullOk !== true);
}

function persistNextHidden(state) {
  const home = state && state.layout && state.layout.homeV2;
  if (!home || home.v !== 2 || !Array.isArray(home.items)) return false;
  const hidden = Array.isArray(home.hidden) ? home.hidden.filter((id) => id !== NEXT_UP_TILE_ID) : [];
  hidden.push(NEXT_UP_TILE_ID);
  home.items = home.items.filter((id) => id !== NEXT_UP_TILE_ID);
  home.hidden = hidden;
  home.routineNextAside = false;
  home.routineNextSeeded = true;
  return true;
}

function writeHiddenPref(state, hidden) {
  if (!canMutateRoutines() || pullPending() || !state) return false;
  const current = normalizeDailyRoutines(state.dailyRoutines);
  if (!current) return false;
  const at = Date.now();
  const prefs = { ...current.prefs, homeNextHidden: hidden, updatedAt: at };
  return putDailyRoutines(state, { ...current, prefs, updatedAt: Math.max(current.updatedAt || 0, at) });
}

function saveLive(state) {
  if (state === app.state && typeof app.save === "function") app.save();
}

export function hideLegacyNextUp(state) {
  if (app.ROUTINES_ENABLED !== true || !state) return false;
  if (app.ui) app.ui.homeNextHidden = true;
  const laid = persistNextHidden(state);
  const prefs = writeHiddenPref(state, true);
  if (laid || prefs) saveLive(state);
  return laid || prefs;
}

export function showLegacyNextUp(state) {
  if (app.ROUTINES_ENABLED !== true || !state) return false;
  if (app.ui) app.ui.homeNextHidden = false;
  if (writeHiddenPref(state, false)) saveLive(state);
  return true;
}

function stringList(list) {
  const out = [];
  (Array.isArray(list) ? list : []).forEach((id) => {
    if (typeof id === "string" && id && !out.includes(id)) out.push(id);
  });
  return out;
}

function blockIdForItem(view, itemId) {
  const blocks = new Map((view.blocks || []).map((block) => [block.id, block]));
  const places = (view.placements || []).filter((row) => row && row.itemId === itemId && blocks.has(row.blockId));
  places.sort((a, b) => {
    const left = blocks.get(a.blockId);
    const right = blocks.get(b.blockId);
    return (left.order || 0) - (right.order || 0) || (a.order || 0) - (b.order || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
  return places.length ? places[0].blockId : "";
}

/* A collapsed block does not paint its rows, and a finished item stays hidden
   until that block is revealed. Open the block that holds the target so the
   row exists after the next render. A pull that has not finished does not write. */
export function revealRoutineJump(state, jump) {
  if (!jump || !state || !canMutateRoutines() || pullPending()) return false;
  const current = normalizeDailyRoutines(state.dailyRoutines);
  if (!current) return false;
  const view = projectDailyRoutines(current) || { blocks: [], placements: [], logs: [] };
  const blockId = jump.blockId || (jump.itemId ? blockIdForItem(view, jump.itemId) : "");
  if (!blockId || !(view.blocks || []).some((block) => block.id === blockId)) return false;
  const collapsed = stringList(current.prefs && current.prefs.collapsedBlocks);
  const revealed = stringList(current.prefs && current.prefs.revealBlocks);
  const nextCollapsed = collapsed.filter((id) => id !== blockId);
  const needsReveal = !!(jump.itemId && coveringLog(view.logs, jump.itemId, dayKey()));
  const nextRevealed = needsReveal && !revealed.includes(blockId) ? revealed.concat(blockId) : revealed;
  if (nextCollapsed.length === collapsed.length && nextRevealed.length === revealed.length) return false;
  const at = Date.now();
  const prefs = { ...current.prefs, collapsedBlocks: nextCollapsed, revealBlocks: nextRevealed, updatedAt: at };
  return putDailyRoutines(state, { ...current, prefs, updatedAt: Math.max(current.updatedAt || 0, at) });
}

/* Titles only. Amounts, units, and the row subtitle are not searched. */
export function routineTrayEntries(state, placedIds, query) {
  const view = routinesView(state);
  const placed = new Set(Array.isArray(placedIds) ? placedIds : []);
  const q = String(query == null ? "" : query).trim().toLowerCase();
  const rows = [{ id: NEXT_UP_TILE_ID, title: "Next up" }];
  (view.blocks || []).forEach((block) => {
    const id = routineBlockTileId(block.id);
    if (id) rows.push({ id, title: block.name || "Routine" });
  });
  const seen = new Set();
  itemsInOrder(view).forEach((entry) => {
    if (seen.has(entry.item.id)) return;
    seen.add(entry.item.id);
    const id = routineItemTileId(entry.item.id);
    if (id) rows.push({ id, title: entry.item.name || "Item" });
  });
  return rows.filter((row) => row.id && !placed.has(row.id) && (!q || row.title.toLowerCase().includes(q)));
}

export function forgetRoutineTrayQuery() {
  if (app.ui) app.ui.routineTrayQuery = "";
}

export function routineMotionOn() {
  try {
    if (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  } catch (e) { /* keep motion */ }
  return true;
}

export function trayHeightAfterDrag(startHeight, deltaY, options) {
  const reduce = !!(options && options.reduce);
  const start = typeof startHeight === "number" && Number.isFinite(startHeight) ? startHeight : 220;
  if (reduce) {
    if (deltaY < -12) return 280;
    if (deltaY > 12) return 64;
    return start >= 160 ? 280 : 64;
  }
  const next = start - (typeof deltaY === "number" && Number.isFinite(deltaY) ? deltaY : 0);
  return Math.max(64, Math.min(360, Math.round(next)));
}

export function routineHaptic() {
  try { if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10); } catch (e) { /* no haptics here */ }
}

function copyDraft(draft) {
  return {
    items: Array.isArray(draft && draft.items) ? draft.items.slice() : [],
    hidden: Array.isArray(draft && draft.hidden) ? draft.hidden.slice() : [],
    sizes: draft && draft.sizes && typeof draft.sizes === "object" && !Array.isArray(draft.sizes) ? { ...draft.sizes } : {},
    gates: draft && draft.gates && typeof draft.gates === "object" && !Array.isArray(draft.gates) ? { ...draft.gates } : {},
  };
}

/* Puts a routine tile on the draft. The tile stays in the tray list until then.
   Flag off changes nothing. There is no stack and no cap on how many sit on Home.
   A draft can hold only routine tiles. That list is a real Home layout. */
export function addRoutineTile(draft, id, size, gate) {
  const next = copyDraft(draft);
  if (app.ROUTINES_ENABLED !== true || !isRoutineTileId(id) || next.items.includes(id)) return next;
  const pick = size === "small" || size === "medium" ? size : routineDefaultSize(id);
  next.items.push(id);
  next.hidden = next.hidden.filter((item) => item !== id);
  if (pick === routineDefaultSize(id)) delete next.sizes[id];
  else next.sizes[id] = pick;
  const stored = normalizeTileGate(gate);
  if (stored) next.gates[id] = stored;
  else delete next.gates[id];
  return next;
}

export function routineTrayHTML(draft, state) {
  if (app.ROUTINES_ENABLED !== true) return "";
  const query = app.ui && typeof app.ui.routineTrayQuery === "string" ? app.ui.routineTrayQuery : "";
  const placed = (draft && draft.items) || [];
  const entries = routineTrayEntries(state, placed, query);
  const motion = routineMotionOn();
  const compact = !(app.ui && app.ui.routineTrayCompact === false);
  const height = app.ui && typeof app.ui.routineTrayHeight === "number" ? app.ui.routineTrayHeight : 220;
  const rows = entries.map((entry) => `<li class="rt-row" data-tray-id="${esc(entry.id)}">
      <span class="rt-title">${esc(entry.title)}</span>
      <label class="rt-time">From <input data-gate="start" inputmode="numeric" autocomplete="off" aria-label="From for ${esc(entry.title)}" placeholder="05:30"></label>
      <label class="rt-time">To <input data-gate="end" inputmode="numeric" autocomplete="off" aria-label="To for ${esc(entry.title)}" placeholder="06:30"></label>
      <button type="button" data-action="routine-tray-add" data-tile-id="${esc(entry.id)}" data-size="small">Small</button>
      <button type="button" data-action="routine-tray-add" data-tile-id="${esc(entry.id)}" data-size="medium">Big</button>
    </li>`).join("");
  const empty = query.trim() ? "No tiles match that title." : "Every routine tile is on Home.";
  return `<section class="rt-tray" data-rt-tray data-motion="${motion ? "on" : "reduce"}" data-compact="${compact ? "true" : "false"}" style="height:${height}px">
    <div class="rt-handle" data-rt-handle role="separator" aria-label="Drag the routine tray"></div>
    <div class="rt-top">
      <label class="rt-find"><span class="rt-vh">Search tiles</span><input id="rt-q" type="search" enterkeyhint="search" autocomplete="off" placeholder="Search tiles" aria-label="Search tiles" value="${esc(query)}"></label>
      <button type="button" class="rt-switch" data-action="routine-tray-compact" aria-pressed="${compact ? "true" : "false"}">${compact ? "Compact" : "Roomy"}</button>
    </div>
    <ul class="rt-list">${rows || `<li class="rt-none">${empty}</li>`}</ul>
  </section>`;
}

export function openRoutineTile(tileId) {
  if (app.ROUTINES_ENABLED !== true || !isRoutineTileId(tileId)) return false;
  const view = routinesView(app.state);
  const target = routineTileTarget(tileId);
  let jump = target;
  if (target && target.kind === "next") {
    const entry = nextEntry(view, dayKey());
    jump = entry ? { kind: "item", itemId: entry.item.id, blockId: entry.block && entry.block.id } : { kind: "next" };
  }
  if (!app.ui) app.ui = {};
  app.ui.routineJump = jump;
  /* A later routine opens for this visit only, so Night tapped from Home in
     the morning paints its rows and the jump has a row to reach. */
  const peekId = jump && (jump.blockId || (jump.itemId ? blockIdForItem(view, jump.itemId) : ""));
  if (peekId) {
    const open = Array.isArray(app.ui.routineOpenBlocks) ? app.ui.routineOpenBlocks.filter((id) => typeof id === "string" && id !== peekId) : [];
    const shut = Array.isArray(app.ui.routineShutBlocks) ? app.ui.routineShutBlocks.filter((id) => typeof id === "string" && id !== peekId) : [];
    app.ui.routineOpenBlocks = open.concat(peekId);
    app.ui.routineShutBlocks = shut;
  }
  if (revealRoutineJump(app.state, jump)) saveLive(app.state);
  if (typeof app.goTab === "function") app.goTab("daily-routines");
  else if (app.ui) app.ui.tab = "daily-routines";
  if (typeof document === "undefined" || !document.querySelector || !jump) return true;
  const selector = jump.itemId
    ? `.dr-row[data-item-id="${String(jump.itemId).replace(/"/g, "")}"]`
    : jump.blockId
      ? `.dr-tile[data-block-id="${String(jump.blockId).replace(/"/g, "")}"]`
      : "";
  const pane = document.querySelector("#pane-daily-routines") || document.querySelector("#view");
  const el = pane && selector && pane.querySelector ? pane.querySelector(selector) : null;
  if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest", behavior: routineMotionOn() ? "smooth" : "auto" });
  return true;
}

let trayDrag = null;
let trayBound = false;

function bindTrayDrag() {
  if (trayBound || typeof document === "undefined" || !document.addEventListener) return;
  trayBound = true;
  document.addEventListener("pointerdown", (ev) => {
    const handle = ev.target && ev.target.closest && ev.target.closest("[data-rt-handle]");
    if (!handle || app.ROUTINES_ENABLED !== true || !app.ui || !app.ui.homeEdit) return;
    trayDrag = { y: ev.clientY, h: app.ui.routineTrayHeight || 220 };
  });
  document.addEventListener("pointermove", (ev) => {
    if (!trayDrag || !app.ui) return;
    app.ui.routineTrayHeight = trayHeightAfterDrag(trayDrag.h, ev.clientY - trayDrag.y, { reduce: !routineMotionOn() });
    const tray = document.querySelector && document.querySelector(".rt-tray");
    if (tray && tray.style) tray.style.height = `${app.ui.routineTrayHeight}px`;
  });
  document.addEventListener("pointerup", () => { trayDrag = null; });
  document.addEventListener("pointercancel", () => { trayDrag = null; });
}

bindTrayDrag();

app.isRoutineTileId = isRoutineTileId;
app.renderRoutineTileHTML = renderRoutineTileHTML;
app.legacyNextUpHTML = legacyNextUpHTML;
app.routineTrayHTML = routineTrayHTML;
app.addRoutineTile = addRoutineTile;
app.openRoutineTile = openRoutineTile;
app.forgetRoutineTrayQuery = forgetRoutineTrayQuery;
app.refreshHomeRoutineGates = refreshHomeRoutineGates;
app.hideLegacyNextUp = hideLegacyNextUp;
app.showLegacyNextUp = showLegacyNextUp;
app.revealRoutineJump = revealRoutineJump;
app.routineHaptic = routineHaptic;
