import { app } from "../runtime.js";
import { moveItem } from "./home-edit.js";

/* Home edit mode gestures.
   1. Press and hold a Home widget (500 ms, cancelled by a move over 10 px) enters edit mode.
   2. In edit mode a widget is dragged by itself. A mouse drags after 4 px. A finger
      drags after a short hold, so a quick swipe still scrolls the page. touchmove is
      only cancelled while a drag is live.
   The dragged card follows the pointer with translate3d, written once per animation
   frame. Slot rects are measured when the drag starts and after each reorder, never per
   move. Cards move with CSS order plus a FLIP slide. On release the card eases into
   its slot, then the DOM is put in the new order and the draft gets the move. */

const HOLD_MS = 500;
const HOLD_SLOP = 10;
const TOUCH_ARM_MS = 220;
const MOUSE_SLOP = 4;
const EDGE_TOP = 96;
const EDGE_BOTTOM = 150;
const MAX_SCROLL = 18;
const LIFT_MS = 120;
const SLIDE_MS = 180;

let hold = null;
let pend = null;
let drag = null;
let busy = false;
let holdFiredAt = 0;

function motionMs() {
  try {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return 0;
  } catch (e) { /* assume motion is fine */ }
  return SLIDE_MS;
}

function holdTarget(t) {
  const ui = app.ui;
  if (!ui || ui.tab !== "home" || ui.homeEdit || ui.sheet || ui.edit || ui.briefEdit) return null;
  /* Pager Home lives in #pane-home; the non-pager path paints into #view. */
  if (!t || !t.closest || !t.closest("#pane-home, #view")) return null;
  if (t.closest("input, textarea, select, .page-head, .home-edit, .home-edit-lock")) return null;
  return t.closest(".hw-slot, .hero, .hw, .card, .sec, .wdg");
}

function cancelHold() {
  if (hold) { clearTimeout(hold.t); hold = null; }
}

function cancelPend() {
  if (pend) { clearTimeout(pend.t); pend = null; }
}

function onDown(ev) {
  if (ev.button > 0 || !ev.isPrimary) return;
  if (app.ui && app.ui.homeEdit) { downInEdit(ev); return; }
  if (!holdTarget(ev.target)) return;
  cancelHold();
  hold = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, t: setTimeout(() => {
    hold = null;
    holdFiredAt = performance.now();
    app.wEatClick = true;
    try { if (navigator.vibrate) navigator.vibrate(20); } catch (e) { /* no haptics here */ }
    if (app.enterHomeEdit) app.enterHomeEdit();
  }, HOLD_MS) };
}

function downInEdit(ev) {
  if (busy || drag || (app.ui && app.ui.sheet)) return;
  const slot = ev.target.closest && ev.target.closest(".hw-slot");
  if (!slot || ev.target.closest("button")) return;
  if (!slot.parentElement || !slot.parentElement.hasAttribute("data-home-list")) return;
  cancelPend();
  pend = { slot, id: ev.pointerId, type: ev.pointerType, x: ev.clientX, y: ev.clientY, lx: ev.clientX, ly: ev.clientY, t: 0 };
  if (ev.pointerType !== "mouse") pend.t = setTimeout(() => { if (pend) startDrag(); }, TOUCH_ARM_MS);
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
    const r = el.getBoundingClientRect();
    d.rects.set(el.dataset.id, { l: r.left, t: r.top + top, w: r.width, h: r.height, rect: r });
  });
}

function startDrag() {
  const p = pend;
  cancelPend();
  if (!p || !p.slot.isConnected) return;
  const el = p.slot;
  const list = el.parentElement;
  const slots = [...list.querySelectorAll(":scope > .hw-slot")];
  const scroller = el.closest(".pane") || document.scrollingElement || document.documentElement;
  const d = { el, list, slots, scroller, id: el.dataset.id, pointerId: p.id, px: p.lx, py: p.ly, gx: 0, gy: 0, rects: new Map(), order: slots.map((s) => s.dataset.id), cool: 0, raf: 0 };
  measure(d);
  const r = d.rects.get(d.id);
  d.gx = d.px - r.l;
  d.gy = d.py + scroller.scrollTop - r.t;
  d.byId = new Map(slots.map((s) => [s.dataset.id, s]));
  drag = d;
  try { el.setPointerCapture(p.id); } catch (e) { /* the document listeners still follow the pointer */ }
  el.classList.add("dragging");
  list.classList.add("dragging-any");
  el.style.transition = `transform ${LIFT_MS}ms ease-out`;
  setTimeout(() => { if (drag === d) el.style.transition = ""; }, LIFT_MS);
  schedule();
}

function schedule() {
  if (drag && !drag.raf) drag.raf = requestAnimationFrame(tick);
}

function tick() {
  const d = drag;
  if (!d) return;
  d.raf = 0;
  if (!d.el.isConnected) { drag = null; return; }
  const s = d.scroller;
  const before = s.scrollTop;
  if (d.py < EDGE_TOP) s.scrollTop -= Math.ceil(MAX_SCROLL * Math.min(1, (EDGE_TOP - d.py) / EDGE_TOP + 0.3));
  else if (d.py > window.innerHeight - EDGE_BOTTOM) s.scrollTop += Math.ceil(MAX_SCROLL * Math.min(1, (d.py - (window.innerHeight - EDGE_BOTTOM)) / EDGE_BOTTOM + 0.3));
  const scrolled = s.scrollTop !== before;
  const cy = d.py + s.scrollTop;
  const r = d.rects.get(d.id);
  d.el.style.transform = `translate3d(${d.px - d.gx - r.l}px, ${cy - d.gy - r.t}px, 0) scale(1.04)`;
  if (performance.now() >= d.cool) {
    const hit = d.slots.find((el) => {
      if (el === d.el) return false;
      const o = d.rects.get(el.dataset.id);
      const mx = o.w * 0.15;
      const my = o.h * 0.15;
      return d.px > o.l + mx && d.px < o.l + o.w - mx && cy > o.t + my && cy < o.t + o.h - my;
    });
    if (hit) reorder(d, hit.dataset.id);
  }
  if (scrolled) schedule();
}

/* Move the dragged id to the target's place, then slide the others (FLIP). */
function reorder(d, targetId) {
  const to = d.order.indexOf(targetId);
  const from = d.order.indexOf(d.id);
  if (to < 0 || from < 0 || to === from) return;
  d.order = moveItem(d.order, from, to);
  const others = d.slots.filter((el) => el !== d.el);
  const first = new Map(others.map((el) => [el, el.getBoundingClientRect()]));
  d.order.forEach((id, i) => { d.byId.get(id).style.order = String(i); });
  const held = d.el.style.transform;
  d.el.style.transform = "none";
  others.forEach((el) => { el.style.transition = "none"; el.style.transform = ""; });
  measure(d);
  d.el.style.transform = held;
  const ms = motionMs();
  others.forEach((el) => {
    const f = first.get(el);
    const r = d.rects.get(el.dataset.id).rect;
    const dx = f.left - r.left;
    const dy = f.top - r.top;
    if (ms && (dx || dy)) el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
  });
  if (ms) {
    void d.list.offsetWidth;
    others.forEach((el) => { el.style.transition = `transform ${ms}ms ease`; el.style.transform = ""; });
  }
  d.cool = performance.now() + ms + 60;
  schedule();
}

function endDrag() {
  const d = drag;
  if (!d) return;
  drag = null;
  busy = true;
  if (d.raf) cancelAnimationFrame(d.raf);
  const to = d.order.indexOf(d.id);
  if (to >= 0 && app.homeSetOrder && d.order.join() !== d.slots.map((s) => s.dataset.id).join()) app.homeSetOrder(d.id, to);
  const ms = motionMs();
  d.el.classList.remove("dragging");
  d.el.classList.add("settling");
  d.el.style.transition = ms ? `transform ${ms}ms ease-out, box-shadow ${ms}ms ease-out` : "none";
  d.el.style.transform = "";
  const done = () => {
    busy = false;
    if (!d.el.isConnected) return;
    d.list.classList.remove("dragging-any");
    d.el.classList.remove("settling");
    d.order.forEach((id) => { const el = d.byId.get(id); d.list.appendChild(el); });
    d.slots.forEach((el) => { el.style.order = ""; el.style.transform = ""; el.style.transition = ""; });
    try { d.el.releasePointerCapture(d.pointerId); } catch (e) { /* already released */ }
  };
  if (ms) setTimeout(done, ms + 20);
  else done();
}

if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", onDown, true);
  document.addEventListener("pointermove", onMove, { passive: false });
  document.addEventListener("pointerup", onUp);
  document.addEventListener("pointercancel", onUp);
  /* Only a live drag holds the page still. Scrolling stays native everywhere else. */
  document.addEventListener("touchmove", (ev) => { if (drag && ev.cancelable) ev.preventDefault(); }, { passive: false });
  document.addEventListener("contextmenu", (ev) => {
    const recent = performance.now() - holdFiredAt < 1200;
    if ((app.ui && app.ui.homeEdit && ev.target.closest && ev.target.closest(".hw-slot")) || recent) ev.preventDefault();
  });
  /* A hold in progress, or one that just fired, must not start a text selection. */
  document.addEventListener("selectstart", (ev) => {
    if (!hold && performance.now() - holdFiredAt >= 1200) return;
    if (ev.target && ev.target.closest && ev.target.closest("input, textarea, [contenteditable]")) return;
    ev.preventDefault();
  });
}
