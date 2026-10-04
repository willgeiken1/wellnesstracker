import { app } from "../runtime.js";

/* Rearrangeable home and routine widgets. */
/* ================= Customizable pages (widgets) ================= */
const WIDGETS = {
  home: { brief: "Morning brief", readiness: "Readiness", today: "Today", week: "This week", cardio: "Cardio", "map-adv": "Muscle map (detailed)", "map-basic": "Muscle map (basic)" },
  food: { summary: "Daily summary", log: "Log buttons", "m-breakfast": "Breakfast", "m-lunch": "Lunch", "m-dinner": "Dinner", "m-snacks": "Snacks", history: "Last 14 days" },
  trends: { goals: "Goals", lifts: "Lift progress", prs: "Personal records", effects: "What affects your lifts", load: "Training load vs recovery",
            volume: "Weekly sets per muscle", balance: "Push / pull balance", stall: "Stall detective", maintenance: "Real maintenance calories",
            bulk: "Bulk quality", efficiency: "Workout efficiency" },
  recovery: { ready: "Readiness", stats: "Today's numbers", hrvage: "HRV for your age", night: "Last night", charts: "Trends" },
};
app.WIDGETS = WIDGETS;

const FIXED_WIDGETS = { food: ["log"] };
app.FIXED_WIDGETS = FIXED_WIDGETS;

          // can be moved but not removed
function layoutOf(page) {
  app.state.layout = app.state.layout || {};
  if (!app.state.layout[page]) app.state.layout[page] = { order: [], hidden: page === "home" ? [app.muscleMode() === "advanced" ? "map-basic" : "map-adv"] : [] };
  return app.state.layout[page];
}
app.layoutOf = layoutOf;

function layoutTouch() { app.state.settingsAt = Date.now(); app.save(); }
app.layoutTouch = layoutTouch;

function widgetize(page, html, force) {
  const parts = html.split(/<!--w:([a-z0-9-]+)-->/);
  const pre = parts[0], W = {}, natural = []; let post = "";
  for (let i = 1; i < parts.length; i += 2) {
    if (parts[i] === "end") { post = parts[i + 1] || ""; continue; }
    W[parts[i]] = parts[i + 1] || ""; natural.push(parts[i]);
  }
  const L = app.layoutOf(page);
  // The brief used to sit above the stack. A saved order from before it was a widget
  // should still show it there, unless the person has already hidden it.
  if (page === "home" && natural.includes("brief") && (L.order || []).length && !(L.order || []).includes("brief") && !(L.hidden || []).includes("brief")) {
    L.order = ["brief", ...L.order];
  }
  const hidden = new Set(L.hidden || []);
  const order = [...(L.order || []).filter((id) => natural.includes(id)), ...natural.filter((id) => !(L.order || []).includes(id))];
  const editing = app.ui.edit === page;
  const show = order.filter((id) => W[id] && W[id].trim() && (!hidden.has(id) || (force && force.has(id))));
  const body = show.map((id) => `<div class="wdg" data-w="${id}">${editing ? app.widgetChrome(page, id, show.length <= 1) : ""}${W[id]}</div>`).join("");
  return pre + `<div class="wdgs${editing ? " editing" : ""}" data-page="${page}">${body}</div>` + post;
}
app.widgetize = widgetize;

function widgetChrome(page, id, last) {
  const name = (app.WIDGETS[page] && app.WIDGETS[page][id]) || "widget";
  const canRemove = !last && !(app.FIXED_WIDGETS[page] || []).includes(id);
  return `<button class="wdg-grip" aria-label="Drag to move ${app.esc(name)}">${app.I.grip}</button>` +
    (canRemove ? `<button class="wdg-x" data-action="w-remove" data-w="${id}" aria-label="Remove ${app.esc(name)}">×</button>` : "");
}
app.widgetChrome = widgetChrome;

const editPage = () => app.ui.tab === "home" ? "home" : app.ui.tab === "food" && app.ui.fseg !== "recent" ? "food"
  : app.ui.tab === "insights" ? (app.ui.iseg === "recovery" ? "recovery" : "trends") : app.ui.tab === "workouts" && !app.ui.detail && app.ui.wseg !== "history" ? "routines" : null;
app.editPage = editPage;

function addButtonHTML(page) {
  return app.ui.edit === page && app.WIDGETS[page] ? `<button class="add-w" data-action="w-add">Add</button>` : "";
}
app.addButtonHTML = addButtonHTML;

function doneButtonHTML() { return app.ui.edit ? `<button class="done-pill" data-action="w-done">Done</button>` : ""; }
app.doneButtonHTML = doneButtonHTML;

function addSheetHTML() {
  const page = app.ui.edit, L = app.layoutOf(page), names = app.WIDGETS[page];
  const hidden = (L.hidden || []).filter((id) => names[id]);
  return `<h3>Add to ${page === "home" ? "Home" : page === "food" ? "Food" : page === "trends" ? "Trends" : "Recovery"}</h3>
    ${hidden.length ? hidden.map((id) => `<div class="aw-row"><span>${names[id]}</span><button class="btn small primary" data-action="w-add-one" data-w="${id}">Add</button></div>`).join("")
      : `<p class="sub">Everything is already on this page. Removed widgets show up here so you can add them back.</p>`}
    ${Object.keys(names).filter((id) => !hidden.includes(id)).length ? `<div class="mini-l" style="margin-top:14px">On the page</div>
      ${Object.keys(names).filter((id) => !hidden.includes(id)).map((id) => `<div class="aw-row on"><span>${names[id]}</span><span class="sub small">Added</span></div>`).join("")}` : ""}`;
}
app.addSheetHTML = addSheetHTML;

function hideWidget(page, id) {
  if (document.querySelectorAll(".wdgs .wdg").length <= 1) { app.toast("Keep at least one widget on this page."); return; }
  const L = app.layoutOf(page);
  L.hidden = [...new Set([...(L.hidden || []), id])]; app.layoutTouch(); app.render();
  app.toast(`${app.WIDGETS[page][id]} removed.`, () => { L.hidden = L.hidden.filter((x) => x !== id); app.layoutTouch(); app.render(); });
}
app.hideWidget = hideWidget;

function showWidget(page, id) {
  const L = app.layoutOf(page);
  L.hidden = (L.hidden || []).filter((x) => x !== id);
  L.order = [...(L.order || []).filter((x) => x !== id), id];
  app.layoutTouch();
}
app.showWidget = showWidget;

function swapHomeMap(mode) {
  const L = app.layoutOf("home"), want = mode === "advanced" ? "map-adv" : "map-basic", other = mode === "advanced" ? "map-basic" : "map-adv";
  const h = new Set(L.hidden || []);
  if (h.has(want) && !h.has(other)) {
    h.delete(want); h.add(other); L.hidden = [...h];
    const o = L.order || []; const i = o.indexOf(other);
    if (i >= 0) { o.splice(i, 1, want); L.order = o.filter((x, k) => o.indexOf(x) === k); }
  }
}
app.swapHomeMap = swapHomeMap;

function deleteRoutine(id) {
  const idx = app.state.workouts.findIndex((w) => w.id === id); if (idx < 0) return;
  if (app.state.workouts.length <= 1) { app.toast("Keep at least one routine."); return; }
  const [w] = app.state.workouts.splice(idx, 1);
  const days = Object.keys(app.state.plan).filter((d) => app.state.plan[d] === id);
  days.forEach((d) => delete app.state.plan[d]);
  app.save(); app.render();
  app.toast(`${w.name} deleted.`, () => { app.state.workouts.splice(idx, 0, w); days.forEach((d) => { app.state.plan[d] = id; }); app.save(); app.render(); });
}
app.deleteRoutine = deleteRoutine;

function routinesEditHTML() {
  return `<div class="wdgs editing" data-page="routines">${app.state.workouts.map((w, wi) =>
    `<div class="wdg" data-w="${app.esc(w.id)}"><button class="wdg-grip" aria-label="Drag to move ${app.esc(w.name)}">${app.I.grip}</button>
      ${app.state.workouts.length > 1 ? `<button class="wdg-x" data-action="r-remove" data-w="${app.esc(w.id)}" aria-label="Delete ${app.esc(w.name)}">×</button>` : ""}
      <div class="wcard c${wi % 3}"><div><div class="wcard-t">${app.esc(w.name)}</div><div class="wcard-s">${app.pl(w.exercises.length, "exercise")}</div></div></div></div>`).join("")}</div>`;
}
app.routinesEditHTML = routinesEditHTML;

/* ---------- hold to edit, wdrag to reorder ---------- */
let wlp = null, wEatClick = false, wdrag = null;
app.wlp = wlp;
app.wEatClick = wEatClick;
app.wdrag = wdrag;

document.addEventListener("pointerdown", (ev) => {
  if (app.ui.edit || app.ui.briefEdit || app.ui.sheet || ev.button > 0) return;
  const w = ev.target.closest(".wdgs .wdg, .wcard[data-action=open-w]"); if (!w) return;
  const page = app.editPage(); if (!page) return;
  app.wlp = { x: ev.clientX, y: ev.clientY, t: setTimeout(() => {
    app.wlp = null; app.wEatClick = true; app.ui.briefEdit = false; app.ui.edit = page;
    try { if (navigator.vibrate) navigator.vibrate(20); } catch (e) {}
    app.render();
  }, 500) };
}, true);

document.addEventListener("pointermove", (ev) => {
  if (app.wlp && (Math.abs(ev.clientX - app.wlp.x) > 10 || Math.abs(ev.clientY - app.wlp.y) > 10)) { clearTimeout(app.wlp.t); app.wlp = null; }
  if (!app.wdrag) return;
  ev.preventDefault();
  const y = ev.clientY, el = app.wdrag.el;
  const place = () => { const top = el.getBoundingClientRect().top - app.wdrag.ty; app.wdrag.ty = y - app.wdrag.grab - top; el.style.transform = `translateY(${app.wdrag.ty}px)`; };
  place();
  const prev = el.previousElementSibling, next = el.nextElementSibling;
  if (prev && y < prev.getBoundingClientRect().top + prev.offsetHeight / 2) { app.wdrag.box.insertBefore(el, prev); place(); }
  else if (next && y > next.getBoundingClientRect().top + next.offsetHeight / 2) { app.wdrag.box.insertBefore(next, el); place(); }
  if (y < 110) window.scrollBy(0, -14); else if (y > innerHeight - 170) window.scrollBy(0, 14);
}, { passive: false });

const wEndPress = () => { if (app.wlp) { clearTimeout(app.wlp.t); app.wlp = null; } };
app.wEndPress = wEndPress;

document.addEventListener("pointerup", (ev) => {
  app.wEndPress();
  if (app.wEatClick) { app.wEatClick = false; app.wEatUntil = performance.now() + 80; }   // swallow only the tap that ends the hold
  if (!app.wdrag) return;
  const { box, el } = app.wdrag; app.wdrag = null;
  el.classList.remove("dragging"); el.style.transform = "";
  const ids = [...box.children].map((c) => c.dataset.w), page = box.dataset.page;
  if (page === "routines") { app.state.workouts.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)); app.save(); }
  else { const L = app.layoutOf(page); L.order = [...ids, ...(L.order || []).filter((x) => !ids.includes(x))]; app.layoutTouch(); }
  app.render();
});

document.addEventListener("pointercancel", app.wEndPress);

document.addEventListener("pointerdown", (ev) => {
  const g = ev.target.closest(".wdg-grip"); if (!g) return;
  ev.preventDefault();
  const el = g.closest(".wdg"), r = el.getBoundingClientRect();
  app.wdrag = { el, box: el.parentElement, grab: ev.clientY - r.top, ty: 0 };
  el.classList.add("dragging");
  try { g.setPointerCapture(ev.pointerId); } catch (e) {}
});

let wEatUntil = 0;
app.wEatUntil = wEatUntil;

document.addEventListener("click", (ev) => { if (performance.now() < app.wEatUntil) { app.wEatUntil = 0; ev.stopPropagation(); ev.preventDefault(); } }, true);

document.addEventListener("contextmenu", (ev) => { if (ev.target.closest(".wdgs, .wcard")) ev.preventDefault(); });
