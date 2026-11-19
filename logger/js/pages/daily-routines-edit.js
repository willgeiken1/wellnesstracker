import { app } from "../runtime.js";
import { canMutateRoutines, projectDailyRoutines } from "../shared/daily-routines-store.js";
import {
  ROUTINE_DOSE_UNITS,
  deleteRoutineBlock,
  deleteRoutineItem,
  duplicateRoutineBlock,
  parseRoutineAmount,
  rememberRoutineBlock,
  renameRoutineBlock,
  renameRoutineItem,
  reorderRoutineBlocks,
  reorderRoutinePlacements,
  restoreRoutineBlock,
  restoreRoutineItem,
  routineItemDraft,
  saveRoutineItem,
  setRoutineBlockColor,
} from "./daily-routines.js";

/* Block and item editing. Logging stays a tap on the row.
   Drag follows home-drag.js: a handle starts the drag, the card uses
   translate3d, and the other cards slide with a FLIP. Reduce Motion
   drops the slide. The write is placement or block order only. */

const HOLD_MS = 500;
const HOLD_SLOP = 10;
const TOUCH_ARM_MS = 220;
const MOUSE_SLOP = 4;
const EDGE_TOP = 96;
const EDGE_BOTTOM = 150;
const MAX_SCROLL = 18;
const LIFT_MS = 120;
const SLIDE_MS = 180;
const QUARTERS = Object.freeze([
  Object.freeze({ value: 0.25, label: "¼" }),
  Object.freeze({ value: 0.5, label: "½" }),
  Object.freeze({ value: 0.75, label: "¾" }),
  Object.freeze({ value: 1, label: "1" }),
  Object.freeze({ value: 1.25, label: "1¼" }),
  Object.freeze({ value: 1.5, label: "1½" }),
  Object.freeze({ value: 1.75, label: "1¾" }),
  Object.freeze({ value: 2, label: "2" }),
]);

let hold = null;
let pend = null;
let drag = null;
let busy = false;
let holdFiredAt = -10000;

function esc(value) {
  if (typeof app.esc === "function") return app.esc(value);
  return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function motionMs() {
  try {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return 0;
  } catch (e) { /* assume motion is fine */ }
  return SLIDE_MS;
}

function moveList(list, from, to) {
  const out = Array.isArray(list) ? list.slice() : [];
  if (!Number.isInteger(from) || !Number.isInteger(to)) return out;
  if (from < 0 || from >= out.length || to < 0 || to >= out.length || from === to) return out;
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}

function editingReady() {
  return app.ROUTINES_ENABLED === true && !!(app.ui && app.ui.dailyRoutineEdit === true && !app.ui.sheet && app.ui.tab === "daily-routines");
}

function persist(ok, message, undo) {
  if (!ok) return false;
  if (typeof app.save === "function") app.save();
  if (app.ui) app.ui.routineAnnounce = message;
  if (typeof app.render === "function") app.render();
  const wrapped = typeof undo === "function"
    ? () => {
      if (!undo()) return;
      if (typeof app.save === "function") app.save();
      if (app.ui) app.ui.routineAnnounce = "Restored.";
      if (typeof app.render === "function") app.render();
    }
    : null;
  if (message && typeof app.toast === "function") app.toast(message, wrapped);
  return true;
}

export function toggleRoutineLayoutEdit() {
  if (!app.ui || app.ROUTINES_ENABLED !== true) return false;
  app.ui.dailyRoutineEdit = app.ui.dailyRoutineEdit !== true;
  app.ui.routineAnnounce = app.ui.dailyRoutineEdit
    ? "Editing routines. Drag a handle to reorder. Long press a name to rename."
    : "Done editing.";
  if (typeof app.render === "function") app.render();
  return true;
}

export async function promptRoutineRename(kind, id) {
  if (app.ROUTINES_ENABLED !== true || !canMutateRoutines() || typeof app.ask !== "function") return false;
  const view = projectDailyRoutines(app.state && app.state.dailyRoutines);
  if (!view || (kind !== "block" && kind !== "item")) return false;
  const row = kind === "block"
    ? (view.blocks || []).find((block) => block.id === id)
    : (view.items || []).find((item) => item.id === id);
  if (!row) return false;
  const next = await app.ask({
    title: kind === "block" ? "Rename routine" : "Rename item",
    ok: "Save",
    cancel: "Cancel",
    input: row.name || "",
  });
  if (typeof next !== "string") return false;
  const saved = kind === "block" ? renameRoutineBlock(app.state, id, next) : renameRoutineItem(app.state, id, next);
  return persist(saved, kind === "block" ? "Routine renamed." : "Item renamed.");
}

export function openRoutineItemEditor(blockId, itemId) {
  if (app.ROUTINES_ENABLED !== true || !canMutateRoutines() || !app.ui) return false;
  app.ui.sheet = "routines-item";
  app.ui.sd = routineItemDraft(app.state, { blockId, itemId });
  if (typeof blockId === "string" && blockId && rememberRoutineBlock(app.state, blockId) && typeof app.save === "function") app.save();
  if (typeof app.renderSheet === "function") app.renderSheet();
  return true;
}

export function removeRoutineBlock(blockId) {
  const view = projectDailyRoutines(app.state && app.state.dailyRoutines);
  const block = view && (view.blocks || []).find((row) => row.id === blockId);
  if (!block || !deleteRoutineBlock(app.state, blockId)) return false;
  return persist(true, `${block.name} deleted.`, () => restoreRoutineBlock(app.state, blockId));
}

export function removeRoutineItem(itemId) {
  const view = projectDailyRoutines(app.state && app.state.dailyRoutines);
  const item = view && (view.items || []).find((row) => row.id === itemId);
  if (!item || !deleteRoutineItem(app.state, itemId)) return false;
  if (app.ui && app.ui.sheet === "routines-item") app.ui.sheet = null;
  return persist(true, `${item.name} deleted.`, () => restoreRoutineItem(app.state, itemId));
}

export function copyRoutineBlock(blockId) {
  if (!duplicateRoutineBlock(app.state, blockId)) return false;
  return persist(true, "Routine duplicated. Items are shared, so logs stay put.");
}

export function paintRoutineBlock(blockId, color) {
  if (!setRoutineBlockColor(app.state, blockId, color)) return false;
  if (typeof app.save === "function") app.save();
  if (typeof app.render === "function") app.render();
  return true;
}

export function commitRoutineItemSheet() {
  const sd = app.ui && app.ui.sd ? app.ui.sd : null;
  if (!sd) return false;
  const nameEl = typeof app.$ === "function" ? app.$("#dr-item-name") : null;
  const amountEl = typeof app.$ === "function" ? app.$("#dr-item-amount") : null;
  if (nameEl) sd.name = nameEl.value;
  if (amountEl) sd.amount = amountEl.value;
  if (!saveRoutineItem(app.state, sd)) {
    if (typeof app.toast === "function") app.toast(sd.kind === "dose" ? "Add a name, an amount, and a unit." : "Add a name.");
    return false;
  }
  app.ui.sheet = null;
  return persist(true, sd.itemId ? "Item saved." : "Item added.");
}

function kindPressed(kind, current) {
  return kind === current ? "true" : "false";
}

export function routineItemSheetHTML() {
  const sd = app.ui && app.ui.sd ? app.ui.sd : {};
  const kind = sd.kind === "dose" ? "dose" : "check";
  const view = projectDailyRoutines(app.state && app.state.dailyRoutines) || { blocks: [] };
  const selected = new Set(Array.isArray(sd.blockIds) ? sd.blockIds : []);
  const amount = parseRoutineAmount(sd.amount);
  const units = ROUTINE_DOSE_UNITS.map((unit) => `<button type="button" class="dr-unit" data-action="routines-item-unit" data-unit="${esc(unit)}" aria-pressed="${sd.unit === unit ? "true" : "false"}">${esc(unit)}</button>`).join("");
  const quarters = QUARTERS.map((chip) => `<button type="button" class="dr-quarter" data-action="routines-item-quarter" data-amount="${chip.value}" aria-pressed="${amount === chip.value ? "true" : "false"}" aria-label="${chip.value}">${chip.label}</button>`).join("");
  const blocks = (view.blocks || []).map((block) => `<button type="button" class="dr-block-pick" data-action="routines-item-block" data-block-id="${esc(block.id)}" aria-pressed="${selected.has(block.id) ? "true" : "false"}">${esc(block.name)}</button>`).join("");
  const dose = kind === "dose" ? `<label class="field-label" for="dr-item-amount">Amount</label>
    <input class="text-in" id="dr-item-amount" inputmode="decimal" autocomplete="off" enterkeyhint="done" value="${esc(sd.amount || "")}">
    <span class="field-label" id="dr-quarter-label">Quarter amounts</span>
    <div class="dr-quarters" role="group" aria-labelledby="dr-quarter-label">${quarters}</div>
    <span class="field-label" id="dr-unit-label">Unit</span>
    <div class="dr-units" role="group" aria-labelledby="dr-unit-label">${units}</div>
    <p class="sub">The amount and unit are what you type. Nothing here suggests a dose.</p>` : "";
  const remove = sd.itemId
    ? `<button type="button" class="btn block" data-action="routines-delete-item" data-item-id="${esc(sd.itemId)}">Delete item</button>`
    : "";
  return `<h3>${sd.itemId ? "Edit item" : "Add item"}</h3>
    <label class="field-label" for="dr-item-name">Name</label>
    <input class="text-in" id="dr-item-name" autocomplete="off" maxlength="80" enterkeyhint="done" value="${esc(sd.name || "")}">
    <span class="field-label" id="dr-kind-label">Type</span>
    <div class="dr-kind" role="group" aria-labelledby="dr-kind-label">
      <button type="button" data-action="routines-item-kind" data-kind="check" aria-pressed="${kindPressed("check", kind)}">Check</button>
      <button type="button" data-action="routines-item-kind" data-kind="dose" aria-pressed="${kindPressed("dose", kind)}">Dose</button>
    </div>
    ${dose}
    <span class="field-label" id="dr-blocks-label">Routines</span>
    <div class="dr-block-picks" role="group" aria-labelledby="dr-blocks-label">${blocks}</div>
    <p class="sub">The same item can sit in more than one routine. Logging it once covers all of them.</p>
    <p class="dr-evidence">Custom item. No evidence is attached.</p>
    <button type="button" class="btn primary block" data-action="routines-item-save">${sd.itemId ? "Save" : "Add item"}</button>
    ${remove}`;
}

function cancelHold() {
  if (hold) { clearTimeout(hold.timer); hold = null; }
}

function cancelPend() {
  if (pend) { clearTimeout(pend.timer); pend = null; }
}

function onDown(ev) {
  if (!ev || ev.button > 0 || ev.isPrimary === false) return;
  if (editingReady()) downInEdit(ev);
  if (app.ui && app.ui.sheet) return;
  const target = ev.target && ev.target.closest && ev.target.closest("[data-rename]");
  if (!target || !target.closest(".dr-page")) return;
  if (ev.target.closest(".dr-handle, .dr-minus, .dr-dup, .dr-skip, .dr-add, .dr-swatch, .dr-undo, .dr-rename")) return;
  cancelHold();
  hold = {
    id: ev.pointerId,
    x: ev.clientX,
    y: ev.clientY,
    kind: target.dataset.rename,
    itemId: target.dataset.itemId || "",
    blockId: target.dataset.blockId || "",
    timer: setTimeout(() => {
      const pending = hold;
      hold = null;
      if (!pending) return;
      holdFiredAt = typeof performance !== "undefined" ? performance.now() : Date.now();
      app.wEatClick = true;
      app.eatClick = true;
      try { if (navigator.vibrate) navigator.vibrate(10); } catch (e) { /* no haptics here */ }
      const id = pending.kind === "block" ? pending.blockId : pending.itemId;
      promptRoutineRename(pending.kind, id);
    }, HOLD_MS),
  };
}

function downInEdit(ev) {
  if (busy || drag) return;
  const handle = ev.target && ev.target.closest && ev.target.closest(".dr-handle");
  if (!handle || !handle.closest(".dr-page")) return;
  const item = handle.closest(".dr-row") || handle.closest(".dr-tile");
  const list = item && item.parentElement;
  if (!item || !list || !list.hasAttribute("data-routine-list") || !item.dataset.id) return;
  cancelPend();
  pend = {
    item,
    id: ev.pointerId,
    type: ev.pointerType,
    x: ev.clientX,
    y: ev.clientY,
    lx: ev.clientX,
    ly: ev.clientY,
    timer: 0,
  };
  if (ev.pointerType !== "mouse") pend.timer = setTimeout(() => { if (pend) startDrag(); }, TOUCH_ARM_MS);
}

function onMove(ev) {
  if (hold && ev.pointerId === hold.id && (Math.abs(ev.clientX - hold.x) > HOLD_SLOP || Math.abs(ev.clientY - hold.y) > HOLD_SLOP)) cancelHold();
  if (pend && ev.pointerId === pend.id) {
    pend.lx = ev.clientX;
    pend.ly = ev.clientY;
    const dist = Math.max(Math.abs(ev.clientX - pend.x), Math.abs(ev.clientY - pend.y));
    if (pend.type === "mouse") { if (dist > MOUSE_SLOP) startDrag(); }
    else if (dist > HOLD_SLOP) cancelPend();
  }
  if (drag && ev.pointerId === drag.pointerId) {
    drag.px = ev.clientX;
    drag.py = ev.clientY;
    if (ev.cancelable) ev.preventDefault();
    schedule();
  }
}

function onUp(ev) {
  cancelHold();
  if (pend && ev.pointerId === pend.id) cancelPend();
  if (drag && ev.pointerId === drag.pointerId) endDrag();
}

function measure(d) {
  const top = d.scroller.scrollTop;
  d.slots.forEach((el) => {
    const rect = el.getBoundingClientRect();
    d.rects.set(el.dataset.id, { l: rect.left, t: rect.top + top, w: rect.width, h: rect.height, rect });
  });
}

function startDrag() {
  const pending = pend;
  cancelPend();
  if (!pending || !pending.item.isConnected || !editingReady()) return;
  const el = pending.item;
  const list = el.parentElement;
  const slots = [...list.querySelectorAll(list.dataset.routineList === "blocks" ? ":scope > .dr-tile" : ":scope > .dr-row")];
  const scroller = el.closest(".pane") || document.scrollingElement || document.documentElement;
  const d = {
    el,
    list,
    slots,
    scroller,
    kind: list.dataset.routineList === "blocks" ? "block" : "item",
    blockId: el.dataset.blockId || list.dataset.blockId || "",
    id: el.dataset.id,
    pointerId: pending.id,
    px: pending.lx,
    py: pending.ly,
    gx: 0,
    gy: 0,
    rects: new Map(),
    order: slots.map((slot) => slot.dataset.id),
    cool: 0,
    raf: 0,
  };
  measure(d);
  const origin = d.rects.get(d.id);
  if (!origin) return;
  d.gx = d.px - origin.l;
  d.gy = d.py + scroller.scrollTop - origin.t;
  d.byId = new Map(slots.map((slot) => [slot.dataset.id, slot]));
  drag = d;
  try { el.setPointerCapture(pending.id); } catch (e) { /* document listeners still follow the pointer */ }
  el.classList.add("dragging");
  list.classList.add("dragging-any");
  el.style.transition = `transform ${motionMs() ? LIFT_MS : 0}ms ease-out`;
  setTimeout(() => { if (drag === d) el.style.transition = ""; }, LIFT_MS);
  schedule();
}

function schedule() {
  if (drag && !drag.raf && typeof requestAnimationFrame === "function") drag.raf = requestAnimationFrame(tick);
}

function tick() {
  const d = drag;
  if (!d) return;
  d.raf = 0;
  if (!d.el.isConnected) { drag = null; return; }
  const scroller = d.scroller;
  const before = scroller.scrollTop;
  if (d.py < EDGE_TOP) scroller.scrollTop -= Math.ceil(MAX_SCROLL * Math.min(1, (EDGE_TOP - d.py) / EDGE_TOP + 0.3));
  else if (d.py > window.innerHeight - EDGE_BOTTOM) scroller.scrollTop += Math.ceil(MAX_SCROLL * Math.min(1, (d.py - (window.innerHeight - EDGE_BOTTOM)) / EDGE_BOTTOM + 0.3));
  const scrolled = scroller.scrollTop !== before;
  const cy = d.py + scroller.scrollTop;
  const origin = d.rects.get(d.id);
  d.el.style.transform = `translate3d(${d.px - d.gx - origin.l}px, ${cy - d.gy - origin.t}px, 0) scale(1.02)`;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (now >= d.cool) {
    const hit = d.slots.find((el) => {
      if (el === d.el) return false;
      const other = d.rects.get(el.dataset.id);
      const mx = other.w * 0.15;
      const my = other.h * 0.15;
      return d.px > other.l + mx && d.px < other.l + other.w - mx && cy > other.t + my && cy < other.t + other.h - my;
    });
    if (hit) reorder(d, hit.dataset.id);
  }
  if (scrolled) schedule();
}

function reorder(d, targetId) {
  const to = d.order.indexOf(targetId);
  const from = d.order.indexOf(d.id);
  if (to < 0 || from < 0 || to === from) return;
  d.order = moveList(d.order, from, to);
  const others = d.slots.filter((el) => el !== d.el);
  const first = new Map(others.map((el) => [el, el.getBoundingClientRect()]));
  d.order.forEach((id, index) => { d.byId.get(id).style.order = String(index); });
  const held = d.el.style.transform;
  d.el.style.transform = "none";
  others.forEach((el) => { el.style.transition = "none"; el.style.transform = ""; });
  measure(d);
  d.el.style.transform = held;
  const ms = motionMs();
  others.forEach((el) => {
    const before = first.get(el);
    const rect = d.rects.get(el.dataset.id).rect;
    const dx = before.left - rect.left;
    const dy = before.top - rect.top;
    if (ms && (dx || dy)) el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
  });
  if (ms) {
    void d.list.offsetWidth;
    others.forEach((el) => { el.style.transition = `transform ${ms}ms ease`; el.style.transform = ""; });
  }
  d.cool = (typeof performance !== "undefined" ? performance.now() : Date.now()) + ms + 60;
  schedule();
}

function commitDrag(d) {
  const changed = d.order.join("\0") !== d.slots.map((slot) => slot.dataset.id).join("\0");
  if (!changed) return true;
  const ok = d.kind === "block"
    ? reorderRoutineBlocks(app.state, d.order, d.id)
    : reorderRoutinePlacements(app.state, d.blockId, d.order);
  if (!ok) return false;
  if (typeof app.save === "function") app.save();
  const label = d.kind === "block" ? "Routine order saved." : "Item order saved.";
  if (app.ui) app.ui.routineAnnounce = label;
  const live = document.querySelector && document.querySelector(".dr-live");
  if (live) live.textContent = label;
  return true;
}

function endDrag() {
  const d = drag;
  if (!d) return;
  drag = null;
  busy = true;
  if (d.raf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(d.raf);
  const saved = commitDrag(d);
  if (!saved) {
    busy = false;
    if (typeof app.render === "function") app.render();
    return;
  }
  const ms = motionMs();
  d.el.classList.remove("dragging");
  d.el.classList.add("settling");
  d.el.style.transition = ms ? `transform ${ms}ms ease-out` : "none";
  d.el.style.transform = "";
  const done = () => {
    busy = false;
    if (!d.el.isConnected) return;
    d.list.classList.remove("dragging-any");
    d.el.classList.remove("settling");
    d.order.forEach((id) => { const el = d.byId.get(id); if (el) d.list.appendChild(el); });
    d.slots.forEach((el) => { el.style.order = ""; el.style.transform = ""; el.style.transition = ""; });
    try { d.el.releasePointerCapture(d.pointerId); } catch (e) { /* already released */ }
  };
  if (ms) setTimeout(done, ms + 20);
  else done();
}

function onKey(ev) {
  if (!ev || !editingReady()) return;
  const dialog = typeof document.getElementById === "function" ? document.getElementById("dialog") : null;
  if (dialog && dialog.hidden === false) return;
  const handle = ev.target && ev.target.closest && ev.target.closest(".dr-handle");
  if (!handle) {
    if (ev.key === "Escape") {
      app.ui.dailyRoutineEdit = false;
      app.ui.routineAnnounce = "Done editing.";
      if (typeof app.render === "function") app.render();
    }
    return;
  }
  const step = ev.key === "ArrowUp" || ev.key === "ArrowLeft" ? -1 : ev.key === "ArrowDown" || ev.key === "ArrowRight" ? 1 : 0;
  if (!step) return;
  ev.preventDefault();
  const kind = handle.dataset.reorder;
  const id = handle.dataset.id;
  const view = projectDailyRoutines(app.state && app.state.dailyRoutines);
  if (!view) return;
  const itemIds = new Set((view.items || []).map((item) => item.id));
  const ids = kind === "block"
    ? (view.blocks || []).map((block) => block.id)
    : (view.placements || []).filter((row) => row.blockId === handle.dataset.blockId && itemIds.has(row.itemId)).slice().sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map((row) => row.id);
  const from = ids.indexOf(id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= ids.length) return;
  const order = moveList(ids, from, to);
  const ok = kind === "block"
    ? reorderRoutineBlocks(app.state, order, id)
    : reorderRoutinePlacements(app.state, handle.dataset.blockId, order);
  if (!ok) return;
  if (typeof app.save === "function") app.save();
  const name = kind === "block"
    ? ((view.blocks || []).find((block) => block.id === id) || {}).name
    : ((view.items || []).find((item) => item.id === handle.closest(".dr-row").dataset.itemId) || {}).name;
  app.ui.routineAnnounce = `${name || "Row"} moved to position ${to + 1} of ${ids.length}.`;
  if (typeof app.render === "function") app.render();
  const again = document.querySelector(`.dr-handle[data-reorder="${kind}"][data-id="${id}"]`);
  if (again && typeof again.focus === "function") again.focus();
}

function onContextMenu(ev) {
  const recent = (typeof performance !== "undefined" ? performance.now() : Date.now()) - holdFiredAt < 1200;
  const tile = ev.target && ev.target.closest && ev.target.closest(".dr-page");
  if ((editingReady() && tile) || (recent && tile)) ev.preventDefault();
}

if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  document.addEventListener("pointerdown", onDown, true);
  document.addEventListener("pointermove", onMove, { passive: false });
  document.addEventListener("pointerup", onUp);
  document.addEventListener("pointercancel", onUp);
  document.addEventListener("touchmove", (ev) => { if (drag && ev.cancelable) ev.preventDefault(); }, { passive: false });
  document.addEventListener("keydown", onKey);
  document.addEventListener("contextmenu", onContextMenu);
  document.addEventListener("selectstart", (ev) => {
    if (!hold && (typeof performance !== "undefined" ? performance.now() : Date.now()) - holdFiredAt >= 1200) return;
    if (ev.target && ev.target.closest && ev.target.closest("input, textarea, [contenteditable]")) return;
    ev.preventDefault();
  });
}

app.toggleRoutineLayoutEdit = toggleRoutineLayoutEdit;
app.promptRoutineRename = promptRoutineRename;
app.openRoutineItemEditor = openRoutineItemEditor;
app.removeRoutineBlock = removeRoutineBlock;
app.removeRoutineItem = removeRoutineItem;
app.copyRoutineBlock = copyRoutineBlock;
app.paintRoutineBlock = paintRoutineBlock;
app.commitRoutineItemSheet = commitRoutineItemSheet;
app.routineItemSheetHTML = routineItemSheetHTML;
