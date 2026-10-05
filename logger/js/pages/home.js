import { app } from "../runtime.js";
import { homeOuraWaiting, visibleHomeIds } from "../shared/oura-gate.js";
import { addToDraft, galleryEntries, needsSizeChoice, removeFromDraft, reorderDraft, sizeChoices, sizeLabel } from "../shared/home-edit.js";
import "../shared/home-defaults.js";
import "../shared/home-drag.js";

/* Home page and the render entry (replaced by the pager). */
/* ================= Rendering ================= */
function render() {
  document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-current", t.dataset.tab === app.ui.tab ? "page" : "false"));
  const v = app.$("#view");
  if (app.ui.tab === "home") v.innerHTML = app.homeHTML();
  else if (app.ui.tab === "workouts") v.innerHTML = app.ui.detail && app.workoutById(app.ui.detail) ? app.detailHTML() : app.workoutsHTML();
  else if (app.ui.tab === "insights") v.innerHTML = app.insightsWrapHTML();
  else if (app.ui.tab === "food") v.innerHTML = app.foodHTML();
  else if (app.ui.tab === "cardio") v.innerHTML = app.cardioScreenHTML();
  else if (app.ui.tab === "progress") v.innerHTML = app.PH.ready ? app.photosHTML() : `<div class="page-head"><div><h1 class="page-title">Progress</h1><div class="page-sub">Loading…</div></div></div>`;
  else v.innerHTML = app.settingsHTML();
  if (app.ui.edit && app.ui.edit !== app.editPage()) app.ui.edit = null;
  if (app.mountDonePill) app.mountDonePill();
  app.syncBubble(true);
  app.renderWorkout();
  app.renderCardioLive();
  app.renderSheet();
  app.tick();
}
app.render = render;

function startChips(label) {
  return `<p class="hero-s">${label}</p><div class="chips">${app.state.workouts.map((w) =>
    `<button class="chip" data-action="start" data-id="${app.esc(w.id)}">${app.esc(w.name)}</button>`).join("")}</div>`;
}
app.startChips = startChips;

function homeHeroHTML() {
  const t = app.today();
  const active = app.activeSession();
  const planned = app.state.plan[t];
  const doneToday = app.sessionsOn(t).filter((s) => s.finishedAt);
  if (active) {
    return `<div class="hero"><p class="hero-k">In progress</p><h2 class="hero-t">${app.esc(active.name)}</h2>
      <p class="hero-s">${app.pl(app.setCount(active), "set")} logged · started ${new Date(active.startedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
      <button class="btn primary block" data-action="resume">Resume workout</button></div>`;
  }
  if (planned && planned !== "rest" && app.workoutById(planned) && !doneToday.some((s) => s.workoutId === planned)) {
    const w = app.workoutById(planned);
    return `<div class="hero"><p class="hero-k">Planned for today</p><h2 class="hero-t">${app.esc(w.name)}</h2>
      <p class="hero-s">${app.pl(w.exercises.length, "exercise")}</p>
      <button class="btn primary block" data-action="start" data-id="${app.esc(w.id)}">Start ${app.esc(w.name)}</button></div>`;
  }
  if (doneToday.length) {
    const sets = doneToday.reduce((n, s) => n + app.setCount(s), 0);
    return `<div class="hero"><p class="hero-k">Done today</p><h2 class="hero-t">${doneToday.map((s) => app.esc(s.name)).join(" + ")}</h2>
      ${app.startChips(`${app.pl(sets, "set")} logged. Train again?`)}</div>`;
  }
  if (planned === "rest") {
    return `<div class="hero quiet"><p class="hero-k">Today</p><h2 class="hero-t">Rest day</h2>${app.startChips("Planned off. Changed your mind?")}</div>`;
  }
  return `<div class="hero quiet"><p class="hero-k">Today</p><h2 class="hero-t">Nothing planned</h2>${app.startChips("Start a workout now, or plan one below.")}</div>`;
}
app.homeHeroHTML = homeHeroHTML;

function homeWeekHTML() {
  const t = app.today();
  const mon = app.addDays(app.mondayOf(t), app.ui.weekOffset * 7);
  const days = [...Array(7)].map((_, i) => app.addDays(mon, i));
  const weekLabel = app.ui.weekOffset === 0 ? "This week" : app.ui.weekOffset === 1 ? "Next week" : app.ui.weekOffset === -1 ? "Last week"
    : `${app.fmtDate(days[0], { month: "short", day: "numeric" })} – ${app.fmtDate(days[6], { month: "short", day: "numeric" })}`;
  const week = days.map((d) => {
    const done = app.sessionsOn(d);
    const p = app.state.plan[d];
    const past = d < t;
    let cls = "wk", label = "";
    if (done.length) { cls += " done"; label = done.map((s) => s.name).join("+"); }
    else if (p === "rest") { cls += " planned"; label = "Rest"; }
    else if (p && app.workoutById(p)) { cls += " planned"; label = app.workoutById(p).name; }
    else label = past ? "" : "+";
    if (d === t) cls += " today";
    if (past) cls += " past";
    const aria = `${app.fmtDate(d, { weekday: "long", month: "long", day: "numeric" })}${label && label !== "+" ? ", " + label : ""}`;
    return `<button class="${cls}" data-action="plan" data-date="${d}" ${past ? "disabled" : ""} aria-label="${app.esc(aria)}">
      <span class="wk-d">${app.fmtDate(d, { weekday: "short" }).slice(0, 3)}</span>
      <span class="wk-n">${app.parseDay(d).getDate()}</span>
      <span class="wk-w">${app.esc(label)}</span></button>`;
  }).join("");
  return `<section class="sec">
      <div class="sec-h"><h3>${weekLabel}</h3>
        <div class="week-nav">${app.ui.weekOffset === 0 ? app.weekGoalHeadHTML() : ""}
          <button class="icon-btn" data-action="week" data-d="-1" aria-label="Previous week">${app.I.chevL}</button>
          <button class="icon-btn" data-action="week" data-d="1" aria-label="Next week"><span style="transform:scaleX(-1);display:grid">${app.I.chevL}</span></button>
        </div></div>
      <div class="week">${week}</div>${app.ui.weekOffset === 0 ? app.weekGoalLineHTML() : ""}
    </section>`;
}
app.homeWeekHTML = homeWeekHTML;

function homeEditBlocked() {
  return !!(app.session && app.sb && !app.cloudPullOk);
}

function homeEditButton() {
  const blocked = homeEditBlocked();
  if (!blocked) return `<button type="button" class="home-edit" data-action="home-edit">Edit</button>`;
  const sync = "Edit unlocks after the first sync finishes.";
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const why = offline ? `Offline. ${sync}` : sync;
  return `<span class="home-edit-lock"><button type="button" class="home-edit" data-action="home-edit" disabled aria-disabled="true" title="${why}" aria-describedby="home-edit-wait">Edit</button><p class="sub home-edit-wait" id="home-edit-wait">${why}</p></span>`;
}
app.homeEditBlocked = homeEditBlocked;

/* Edit mode entry, shared by the Edit button and press-and-hold. */
function enterHomeEdit() {
  if (app.homeEditBlocked && app.homeEditBlocked()) return false;
  app.ui.homeEdit = true;
  app.ui.edit = null;
  app.ui.briefEdit = false;
  app.ui.sheet = null;
  app.ui.homeAnnounce = "";
  app.ui.homeDraft = app.homeEditorDraft(app.state);
  app.render();
  return true;
}
app.enterHomeEdit = enterHomeEdit;

function liveSnapshot() {
  try { return typeof app.snapshotFromApp === "function" ? app.snapshotFromApp() : { live: true }; } catch (e) { return { live: true }; }
}

/* A card with nothing to paint still gets a body, so it can be moved or removed. */
function widgetBody(id, data) {
  const entry = app.HOME_WIDGETS[id];
  let html = "";
  try { html = entry.render(data) || ""; } catch (e) { html = ""; }
  if (String(html).trim()) return html;
  return `<article class="hw hw-size-s" data-hw="${id}"><p class="hw-k">${app.esc(entry.name)}</p><p class="hw-sub">Nothing to show yet</p></article>`;
}

/* The real Home grid, painted from the draft. Card bodies are inert so a tap or a
   hold never starts a workout; the slot is what moves. */
function homeEditCardsHTML(draft) {
  const data = liveSnapshot();
  const layout = { items: draft.items || [], hidden: [], sizes: draft.sizes || {} };
  const cards = layout.items.filter((id) => app.HOME_WIDGETS[id]).map((id, index, all) => {
    const widget = app.HOME_WIDGETS[id];
    const span = app.widgetSize(id, layout) === "medium" ? " span-m" : "";
    const name = app.esc(widget.name);
    return `<div class="hw-slot${span}" data-hw="${id}" data-id="${id}" tabindex="0" role="group" aria-label="${name}, ${index + 1} of ${all.length}. Arrow keys move it."><div class="hw-body" inert>${widgetBody(id, data)}</div><button type="button" class="hw-minus" data-action="home-remove" data-id="${id}" aria-label="Remove ${name}"><span aria-hidden="true">−</span></button></div>`;
  }).join("");
  return `<div class="home-v2 editing" data-home-list>${cards || `<p class="home-editor-empty">No widgets on Home. Tap Add to pick some.</p>`}</div>`;
}

function homeEditorHTML() {
  const draft = app.ui.homeDraft || app.homeEditorDraft(app.state);
  app.ui.homeDraft = draft;
  return `<div class="home-editor">
    <div class="home-editor-top">
      <h1 class="page-title">Edit Home</h1>
      <button type="button" class="home-editor-add" data-action="home-gallery" aria-label="Add widget">Add</button>
      <button type="button" class="home-editor-save" data-action="home-save" aria-label="Done editing Home">Done</button>
    </div>
    <p class="hw-live" role="status" aria-live="polite">${app.esc(app.ui.homeAnnounce || "")}</p>
    ${homeEditCardsHTML(draft)}
  </div>`;
}
app.homeEditorHTML = homeEditorHTML;

/* Keyboard and screen reader path for reordering: arrow keys on a focused card. */
function homeMoveItem(id, delta) {
  const draft = app.ui.homeDraft;
  if (!draft) return;
  const from = draft.items.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= draft.items.length) return;
  app.ui.homeDraft = { ...draft, ...reorderDraft(draft, id, to) };
  app.ui.homeAnnounce = `${app.HOME_WIDGETS[id].name} moved to position ${to + 1} of ${draft.items.length}.`;
  app.render();
  const again = document.querySelector(`.hw-slot[data-id="${id}"]`);
  if (again) again.focus();
}
app.homeMoveItem = homeMoveItem;

/* Drag end hands over the new order. The draft stays in step without a repaint. */
function homeSetOrder(id, to) {
  const draft = app.ui.homeDraft;
  if (!draft) return;
  app.ui.homeDraft = { ...draft, ...reorderDraft(draft, id, to) };
}
app.homeSetOrder = homeSetOrder;

function homeRemoveItem(id) {
  const draft = app.ui.homeDraft;
  if (!draft) return;
  app.ui.homeDraft = { ...draft, ...removeFromDraft(draft, id) };
  app.ui.homeAnnounce = `${(app.HOME_WIDGETS[id] || {}).name || "Widget"} removed.`;
  app.render();
}
app.homeRemoveItem = homeRemoveItem;

/* Closes the gallery and stays in edit mode with the new widget showing. */
function homeAddItem(id, size) {
  const draft = app.ui.homeDraft;
  if (!draft || !app.HOME_WIDGETS[id]) return;
  app.ui.homeDraft = { ...draft, ...addToDraft(draft, id, size) };
  app.ui.homeAnnounce = `${app.HOME_WIDGETS[id].name} added.`;
  app.ui.sheet = null;
  app.render();
  const added = document.querySelector(`.hw-slot[data-id="${id}"]`);
  if (added && added.scrollIntoView) added.scrollIntoView({ block: "nearest" });
}
app.homeAddItem = homeAddItem;

/* Preview of a card at one size, from the user's own data. A demo account's
   renderers label their own numbers sample. */
function galleryPreview(id, size, data) {
  return `<div class="hw-prev hw-prev-${size}" inert aria-hidden="true"><div class="hw-prev-in">${widgetBody(id, data)}</div></div>`;
}

/* In-flow header: Cancel (with Back in the size step) left, title centered, close right.
   It is a grid row, so nothing sits on top of anything else. */
function galleryBar(title, back) {
  return `<div class="hw-gal-bar"><div class="hw-gal-side">${back}<button type="button" class="hw-gal-cancel" data-action="sheet-close">Cancel</button></div><div class="hw-gal-title">${title}</div><div class="hw-gal-side end"><button type="button" class="hw-gal-x" data-action="sheet-close" aria-label="Close"><span aria-hidden="true">×</span></button></div></div>`;
}

function homeGalleryHTML() {
  const draft = app.ui.homeDraft || { items: [] };
  const sd = app.ui.sd || {};
  const data = liveSnapshot();
  const pick = sd.pick && app.HOME_WIDGETS[sd.pick] && !(draft.items || []).includes(sd.pick) ? app.HOME_WIDGETS[sd.pick] : null;
  if (pick) {
    const options = sizeChoices(pick.id).map((size) =>
      `<div class="hw-gal-item hw-gal-size${size === "medium" ? " span-m" : ""}"><button type="button" class="hw-gal-hit" data-action="home-add" data-id="${app.esc(pick.id)}" data-size="${size}" aria-label="Add ${app.esc(pick.name)}, ${sizeLabel(size).toLowerCase()}"></button>${galleryPreview(pick.id, size, data)}<b>${sizeLabel(size)}</b></div>`).join("");
    const back = `<button type="button" class="hw-gal-back" data-action="home-gal-back" aria-label="Back to all widgets"><span aria-hidden="true">‹</span></button>`;
    return `<div class="hw-gal-top">${galleryBar(`<b>${app.esc(pick.name)}</b><em>Choose a size</em>`, back)}</div>
      <div class="hw-gal-scroll"><div class="hw-gal-grid">${options}</div></div>`;
  }
  const q = sd.q || "";
  const entries = galleryEntries(draft, app.state, q);
  const items = entries.map((e) =>
    `<div class="hw-gal-item${e.size === "medium" ? " span-m" : ""}"><button type="button" class="hw-gal-hit" data-action="home-gal-pick" data-id="${app.esc(e.id)}" aria-label="${app.esc(e.title)}, ${app.esc(e.subtitle)}"></button>${galleryPreview(e.id, e.size, data)}<b>${app.esc(e.title)}</b><em>${app.esc(e.subtitle)}</em></div>`).join("");
  const none = q.trim() ? "No widgets match that search." : "Every widget is already on Home.";
  const search = `<label class="hw-gal-find"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg><input class="text-in hw-gal-search" id="home-q" type="search" enterkeyhint="search" autocomplete="off" placeholder="Search Widgets" aria-label="Search widgets" value="${app.esc(q)}"></label>`;
  return `<div class="hw-gal-top">${galleryBar("<b>Add Widget</b>", "")}${search}</div>
    <div class="hw-gal-scroll">${items ? `<div class="hw-gal-grid">${items}</div>` : `<p class="sub hw-gal-none">${none}</p>`}</div>`;
}
app.homeGalleryHTML = homeGalleryHTML;
app.galleryNeedsSize = needsSizeChoice;

/* The brief card stays when it still has a line to show. When every enabled
   metric is already a tile, and the headline tile is up, the shell is omitted. */
function paintedHomeItems(state) {
  const visible = visibleHomeIds(state);
  if (!visible.includes("brief")) return visible;
  if (typeof app.briefPaintEmpty === "function" && app.briefPaintEmpty(state)) {
    return visible.filter((id) => id !== "brief");
  }
  return visible;
}

function homeHTML() {
  if (app.ui && app.ui.homeEdit) return homeEditorHTML();
  const t = app.today();
  const registry = typeof app.homeRegistryActive === "function" && app.homeRegistryActive(app.state);
  const head = `
    ${app.pageHead(app.firstName() ? `Hi, ${app.esc(app.firstName())}` : app.fmtDate(t, { weekday: "long" }), `${app.firstName() ? `${app.greeting()} · ` : ""}${app.fmtDate(t, { weekday: "long", month: "long", day: "numeric" })}`, { left: homeEditButton() })}
    ${app.weekCardHTML ? app.weekCardHTML() : ""}`;
  if (registry) {
    const data = typeof app.snapshotFromApp === "function" ? app.snapshotFromApp() : { live: true };
    const layout = app.getHomeLayout(app.state);
    const wait = homeOuraWaiting(app.state) ? `<p class="sub oura-wait">Waiting for first sync</p>` : "";
    return head + wait + app.renderHomeWidgets({ ...layout, items: paintedHomeItems(app.state) }, data);
  }
  const live = { live: true };
  /* Default tiles sit above the slots, so hiding a slot never hides them. */
  const defaults = app.defaultHomeStripHTML(typeof app.snapshotFromApp === "function" ? app.snapshotFromApp() : live);
  const stack = defaults + app.widgetize("home", `<!--w:brief-->${app.briefHTML()}${app.weighReminderHTML()}<!--w:readiness-->${app.readinessCardHTML()}<!--w:today-->${app.HOME_WIDGETS.today.render(live)}
    <!--w:week-->${app.HOME_WIDGETS["this-week"].render(live)}
    <!--w:cardio-->${app.HOME_WIDGETS.cardio.render(live)}
    <!--w:map-adv--><section class="sec">${app.muscleMapHTML("advanced")}</section>
    <!--w:map-basic--><section class="sec">${app.muscleMapHTML("basic")}</section>`);
  return head + stack;
}
app.visibleHomeIds = visibleHomeIds;
app.homeHTML = homeHTML;
