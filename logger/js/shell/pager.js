import { app } from "../runtime.js";

/* Five-tab pager: equal slots, a gliding bubble, and a finger-tracked slide. */

app.TAB_ORDER = ["home", "workouts", "food", "progress", "insights"];
app.reduceMotion = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
app.motion = { index: 0, dragging: false, animating: false, hold: false, eatClick: false };
app.slideIn = function () {};

function stageWidth() {
  const stage = document.getElementById("stage");
  return stage ? stage.clientWidth : window.innerWidth;
}
function paneEls() {
  return [...document.querySelectorAll("#stage .pane")];
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

app.placeBubble = function (indexFloat, animate) {
  const nav = document.getElementById("tabs");
  const bub = document.getElementById("tab-bubble");
  if (!nav || !bub) return;
  if (indexFloat == null || Number.isNaN(indexFloat)) { bub.style.opacity = "0"; return; }
  const n = app.TAB_ORDER.length;
  const slot = nav.clientWidth / n;
  const inset = 4;
  const base = Math.max(0, slot - inset * 2);
  const idx = clamp(indexFloat, -0.22, n - 1 + 0.22);
  const nearest = clamp(Math.round(idx), 0, n - 1);
  const dist = Math.min(0.5, Math.abs(idx - nearest));
  // Mid-swipe the bubble widens, then settles. At a slot it is exactly inset by 4px.
  const stretch = animate ? 0 : Math.sin(dist / 0.5 * Math.PI) * slot * 0.16;
  const w = base + stretch;
  let x = (idx + 0.5) * slot - w / 2;
  x = clamp(x, 2, Math.max(2, nav.clientWidth - w - 2));
  const spring = "transform .38s cubic-bezier(.33,1.22,.45,1), width .38s cubic-bezier(.33,1.22,.45,1)";
  bub.style.opacity = "1";
  bub.style.transition = animate && !app.reduceMotion() ? spring : "none";
  bub.style.width = `${w}px`;
  bub.style.transform = `translate3d(${x}px,0,0)`;
};
app.syncBubble = function (animate) {
  const i = app.TAB_ORDER.indexOf(app.ui.tab);
  app.placeBubble(i < 0 ? null : i, !!animate);
};

function htmlFor(tab) {
  if (tab === "home") return app.homeHTML();
  if (tab === "workouts") return app.ui.detail && app.workoutById(app.ui.detail) ? app.detailHTML() : app.workoutsHTML();
  if (tab === "insights") return app.insightsWrapHTML();
  if (tab === "food") return app.foodHTML();
  if (tab === "cardio") return app.cardioScreenHTML();
  if (tab === "progress") return app.PH.ready ? app.photosHTML() : `<div class="page-head"><div><h1 class="page-title">Progress</h1><div class="page-sub">Loading…</div></div></div>`;
  return app.settingsHTML();
}

function paint(tab) {
  const el = document.querySelector(`.pane[data-pane="${tab}"]`);
  if (!el) return;
  const saved = app.ui.tab;
  app.ui.tab = tab;
  try { el.innerHTML = htmlFor(tab); }
  finally { app.ui.tab = saved; }
}

let moveGen = 0;

function readVisualIndex() {
  const w = stageWidth();
  const el = document.querySelector("#pane-home") || paneEls()[0];
  if (!el || !w) return app.motion.index;
  const tr = getComputedStyle(el).transform;
  if (!tr || tr === "none") return app.motion.index;
  const m = tr.match(/matrix3d\(([^)]+)\)/) || tr.match(/matrix\(([^)]+)\)/);
  if (!m) return app.motion.index;
  const parts = m[1].split(",").map(Number);
  const x = parts.length === 16 ? parts[12] : parts[4];
  return Number.isFinite(x) ? -x / w : app.motion.index;
}

function dropAnims() {
  moveGen++;
  paneEls().forEach((el) => {
    el.getAnimations().forEach((a) => { a.onfinish = null; a.cancel(); });
  });
  app.motion.animating = false;
}

function moveTo(activeIndex, duration) {
  const w = stageWidth();
  const panes = paneEls();
  const gen = ++moveGen;
  let pending = 0;
  panes.forEach((el, i) => {
    const target = `translate3d(${(i - activeIndex) * w}px,0,0)`;
    const from = getComputedStyle(el).transform;
    el.getAnimations().forEach((a) => { a.onfinish = null; a.cancel(); });
    if (!duration || app.reduceMotion()) {
      el.style.transform = target;
      return;
    }
    const fromT = from && from !== "none" ? from : target;
    el.style.transform = fromT;
    pending++;
    const anim = el.animate(
      [{ transform: fromT }, { transform: target }],
      { duration, easing: "cubic-bezier(.22,.9,.24,1)", fill: "forwards" }
    );
    anim.onfinish = () => {
      if (gen !== moveGen) return;
      el.style.transform = target;
      anim.onfinish = null;
      anim.cancel();
      pending--;
      if (pending <= 0) app.motion.animating = false;
    };
  });
  app.motion.animating = pending > 0;
}

function dragTo(fromIndex, dx) {
  const w = stageWidth();
  dropAnims();
  paneEls().forEach((el, i) => {
    el.style.transform = `translate3d(${(i - fromIndex) * w + dx}px,0,0)`;
  });
}

function scroller() {
  if (!document.body.classList.contains("pager-on")) return document.getElementById("view");
  return document.querySelector(".pane.active") || document.querySelector('.pane[data-pane="home"]');
}

const nativeScrollTo = window.scrollTo.bind(window);
const nativeScrollBy = window.scrollBy.bind(window);
window.scrollTo = function (x, y) {
  const s = scroller();
  if (!s) return nativeScrollTo(x, y);
  if (x && typeof x === "object") s.scrollTo(x);
  else s.scrollTo(Number(x) || 0, Number(y) || 0);
};
window.scrollBy = function (x, y) {
  const s = scroller();
  if (!s) return nativeScrollBy(x, y);
  if (x && typeof x === "object") s.scrollBy(x);
  else s.scrollBy(Number(x) || 0, Number(y) || 0);
};

app.render = function () {
  if (app.needsLock && app.needsLock()) {
    document.body.classList.add("locked");
    if (app.renderLock) app.renderLock(false);
    return;
  }
  document.body.classList.remove("locked");
  document.documentElement.classList.remove("lock-first");
  const lock = document.getElementById("lock");
  if (lock && !lock.hidden) { lock.hidden = true; lock.innerHTML = ""; delete lock.dataset.mode; }
  const tab = app.ui.tab;
  document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-current", t.dataset.tab === tab ? "page" : "false"));
  const pager = app.TAB_ORDER.includes(tab);
  document.body.classList.toggle("pager-on", pager);
  const view = document.getElementById("view");
  const stage = document.getElementById("stage");
  if (view) view.hidden = pager;
  if (stage) stage.setAttribute("aria-hidden", pager ? "false" : "true");

  const host = pager ? document.querySelector(`.pane[data-pane="${tab}"]`) : view;
  if (host) {
    const top = host.scrollTop;
    host.innerHTML = htmlFor(tab);
    if (app.ui.edit && app.ui.edit !== app.editPage()) app.ui.edit = null;
    if (app.ui.edit) host.insertAdjacentHTML("beforeend", app.doneButtonHTML());
    host.scrollTop = top;
  }
  document.querySelectorAll(".pane").forEach((p) => p.classList.toggle("active", p.dataset.pane === tab));

  const to = app.TAB_ORDER.indexOf(tab);
  if (pager && to !== app.motion.index && !app.motion.dragging && !app.motion.hold) {
    const from = app.motion.index;
    const lo = Math.min(from, to), hi = Math.max(from, to);
    for (let i = lo; i <= hi; i++) {
      const id = app.TAB_ORDER[i];
      if (id !== tab && i !== from) paint(id);
    }
    const steps = Math.abs(to - from);
    const dur = app.reduceMotion() ? 0 : Math.min(420, 280 + Math.max(0, steps - 1) * 40);
    app.motion.index = to;
    moveTo(to, dur);
  } else if (pager && !app.motion.dragging && !app.motion.animating && !app.motion.hold) {
    moveTo(to, 0);
    app.motion.index = to;
  }
  if (!app.motion.dragging) app.syncBubble(true);
  app.renderWorkout();
  app.renderCardioLive();
  app.renderSheet();
  app.tick();
};

function horizontallyScrollable(node) {
  let el = node;
  while (el && el !== document.body) {
    if (el.classList && el.classList.contains("pane")) break;
    const s = getComputedStyle(el);
    const ox = s.overflowX;
    if ((ox === "auto" || ox === "scroll") && el.scrollWidth > el.clientWidth + 4) return true;
    el = el.parentElement;
  }
  return false;
}

function swipeAllowed(target, touches) {
  if (!app.TAB_ORDER.includes(app.ui.tab) || app.ui.edit || app.ui.briefEdit || app.ui.sheet || app.ui.workoutOpen || app.ui.cardioOpen || app.ui.detail) return false;
  if (touches != null && touches !== 1) return false;
  if (!target || !target.closest) return false;
  if (target.closest("input, textarea, select, .wdg-grip, .brief-grip, .timeline, .switch, #tabs, .handle, .day-nav, .bc-cam, #sheet, #dialog, #onboard, #workout, #cardio-live")) return false;
  if (horizontallyScrollable(target)) return false;
  if (!target.closest("#stage")) return false;
  return true;
}

let gesture = null;

function beginGesture(x, y, pointerId) {
  gesture = {
    x, y, t: performance.now(), lock: null, dx: 0,
    idx: app.TAB_ORDER.indexOf(app.ui.tab),
    w: stageWidth(),
    pointerId: pointerId ?? null,
    painted: new Set(),
  };
}

function noteNeighbor(dir) {
  if (!gesture) return;
  const ni = gesture.idx + dir;
  if (ni < 0 || ni >= app.TAB_ORDER.length) return;
  const id = app.TAB_ORDER[ni];
  if (gesture.painted.has(id)) return;
  gesture.painted.add(id);
  paint(id);
}

function moveGesture(x, y, ev) {
  if (!gesture) return;
  const dx = x - gesture.x;
  const dy = y - gesture.y;
  if (!gesture.lock) {
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
    gesture.lock = Math.abs(dx) > Math.abs(dy) * 1.2 ? "h" : "v";
    if (gesture.lock === "h") {
      app.motion.dragging = true;
      // Grab the pixels on screen. A slide may still be catching up to ui.tab.
      gesture.origin = readVisualIndex();
      gesture.grabDx = Math.sign(dx) * 10;
      noteNeighbor(dx < 0 ? 1 : -1);
    }
  }
  if (gesture.lock !== "h") return;
  if (ev && ev.cancelable) ev.preventDefault();
  const dir = dx < 0 ? 1 : -1;
  if (Math.abs(dx) > 24) noteNeighbor(dir);
  const ni = gesture.idx + dir;
  const valid = ni >= 0 && ni < app.TAB_ORDER.length;
  const adx = valid ? dx : dx * 0.28;
  gesture.dx = adx;
  const mid = gesture.origin != null && Math.abs(gesture.origin - gesture.idx) > 0.02;
  if (mid) {
    const since = dx - gesture.grabDx;
    const visualDx = valid ? since : since * 0.28;
    dragTo(gesture.origin, visualDx);
    app.placeBubble(gesture.origin - visualDx / gesture.w, false);
  } else {
    dragTo(gesture.idx, adx);
    const progress = valid ? clamp(-adx / gesture.w, -1, 1) : clamp(-adx / gesture.w, -0.18, 0.18);
    app.placeBubble(gesture.idx + progress, false);
  }
}

/* One page move. The stage already has both panes, so this continues from the
   current transform (a finger offset, or the resting slot) instead of cloning a ghost. */
app.pageTransition = function (toIndex, opts = {}) {
  document.querySelectorAll(".page-ghost").forEach((el) => el.remove());
  const fromIndex = opts.fromIndex != null ? opts.fromIndex : app.motion.index;
  let dur = opts.duration;
  if (dur == null) {
    if (app.reduceMotion()) dur = 0;
    else if (opts.startDx != null) {
      const w = stageWidth();
      const remaining = Math.abs((fromIndex - toIndex) * w - opts.startDx);
      dur = clamp(remaining / Math.max(Math.abs(opts.velocity || 0), 0.45), 160, 420);
    } else {
      const steps = Math.abs(toIndex - fromIndex);
      dur = Math.min(420, 280 + Math.max(0, steps - 1) * 40);
    }
  }
  app.motion.index = toIndex;
  moveTo(toIndex, dur);
};

app.goTab = function (to, opts = {}) {
  if (to === "recovery") { to = "insights"; app.ui.iseg = "recovery"; }
  if (to === "photos") to = "progress";
  const fromI = app.TAB_ORDER.indexOf(app.ui.tab);
  const same = app.ui.tab === to;
  if (to === "settings" && app.ui.tab !== "settings") app.ui.prevTab = app.ui.tab;
  app.ui.edit = null;
  app.ui.briefEdit = false;
  app.ui.tab = to;
  if (same && to === "insights") app.ui.iseg = "trends";
  if (same && to === "food") app.ui.foodDay = null;
  if (app.ui.tab !== "workouts" || same) app.ui.detail = null;
  const toI = app.TAB_ORDER.indexOf(to);
  const pagerMove = !same && fromI >= 0 && toI >= 0;
  if (pagerMove) {
    const lo = Math.min(fromI, toI), hi = Math.max(fromI, toI);
    for (let i = lo; i <= hi; i++) if (i !== toI && i !== fromI) paint(app.TAB_ORDER[i]);
    app.motion.hold = true;
    app.motion.index = toI;
  }
  app.render();
  if (!same && app.noteTab) app.noteTab(to);
  window.scrollTo(0, 0);
  if (pagerMove) {
    app.motion.hold = false;
    app.pageTransition(toI, { fromIndex: fromI, ...opts });
  }
};

function endGesture() {
  if (!gesture) return;
  const g = gesture;
  gesture = null;
  app.motion.dragging = false;
  if (g.lock !== "h") return;
  const dt = Math.max(16, performance.now() - g.t);
  const vel = g.dx / dt;
  const projected = g.dx + vel * 150;
  const dir = projected < 0 ? 1 : -1;
  const ni = g.idx + dir;
  const valid = ni >= 0 && ni < app.TAB_ORDER.length && Math.sign(projected) === Math.sign(g.dx || projected);
  const commit = valid && Math.abs(projected) > g.w * 0.22;
  const target = commit ? ni : g.idx;
  const visualNow = readVisualIndex();
  if (commit) app.goTab(app.TAB_ORDER[target], { startDx: 0, velocity: vel, fromIndex: visualNow });
  else {
    const dur = app.reduceMotion() ? 0 : clamp(Math.abs(g.dx) / Math.max(Math.abs(vel), 0.45), 160, 420);
    app.pageTransition(g.idx, { duration: dur, fromIndex: visualNow });
    app.syncBubble(true);
  }
  // Swallow the click the finger lets go on, after the tab change above has run.
  if (Math.abs(g.dx) > 8) {
    app.motion.eatClick = true;
    setTimeout(() => { app.motion.eatClick = false; }, 450);
  }
}

document.addEventListener("touchstart", (ev) => {
  if (!swipeAllowed(ev.target, ev.touches.length)) { gesture = null; return; }
  const t = ev.touches[0];
  beginGesture(t.clientX, t.clientY, null);
}, { passive: true });

document.addEventListener("touchmove", (ev) => {
  if (!gesture || gesture.pointerId != null) return;
  const t = ev.touches[0];
  moveGesture(t.clientX, t.clientY, ev);
}, { passive: false });

document.addEventListener("touchend", () => {
  if (!gesture || gesture.pointerId != null) return;
  endGesture();
});
document.addEventListener("touchcancel", () => {
  if (!gesture || gesture.pointerId != null) return;
  const g = gesture;
  gesture = null;
  app.motion.dragging = false;
  if (g.lock === "h") { app.pageTransition(g.idx, { duration: app.reduceMotion() ? 0 : 200, fromIndex: g.idx }); app.syncBubble(true); }
});

document.addEventListener("pointerdown", (ev) => {
  if (ev.pointerType !== "mouse" || ev.button !== 0) return;
  if (!swipeAllowed(ev.target, 1)) return;
  beginGesture(ev.clientX, ev.clientY, ev.pointerId);
});
document.addEventListener("pointermove", (ev) => {
  if (!gesture || gesture.pointerId == null || ev.pointerId !== gesture.pointerId) return;
  moveGesture(ev.clientX, ev.clientY, ev);
});
document.addEventListener("pointerup", (ev) => {
  if (!gesture || gesture.pointerId == null || ev.pointerId !== gesture.pointerId) return;
  endGesture();
});
document.addEventListener("pointercancel", (ev) => {
  if (!gesture || gesture.pointerId == null || ev.pointerId !== gesture.pointerId) return;
  const g = gesture;
  gesture = null;
  app.motion.dragging = false;
  if (g.lock === "h") { app.pageTransition(g.idx, { duration: app.reduceMotion() ? 0 : 200, fromIndex: g.idx }); app.syncBubble(true); }
});

document.addEventListener("click", (ev) => {
  if (!app.motion.eatClick) return;
  app.motion.eatClick = false;
  ev.preventDefault();
  ev.stopPropagation();
}, true);

window.addEventListener("resize", () => {
  if (app.motion.dragging) return;
  const i = app.TAB_ORDER.indexOf(app.ui.tab);
  if (i >= 0) moveTo(i, 0);
  app.syncBubble(false);
});
