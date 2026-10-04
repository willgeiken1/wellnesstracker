import { app } from "../runtime.js";
import { homeOuraWaiting, visibleHomeIds } from "../shared/oura-gate.js";

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

const CATEGORY_LABEL = { recovery: "Recovery", training: "Training", nutrition: "Nutrition", body: "Body" };

function homeEditBlocked() {
  return !!(app.session && app.sb && !app.cloudPullOk);
}

function homeEditButton() {
  const blocked = homeEditBlocked();
  if (!blocked) return `<button type="button" class="home-edit" data-action="home-edit">Edit</button>`;
  const why = "Offline. Edit unlocks after the first sync finishes.";
  return `<span class="home-edit-lock"><button type="button" class="home-edit" data-action="home-edit" disabled aria-disabled="true" title="${why}" aria-describedby="home-edit-wait">Edit</button><p class="sub home-edit-wait" id="home-edit-wait">${why}</p></span>`;
}
app.homeEditBlocked = homeEditBlocked;

function sizeControls(id, widget, draft) {
  const sizes = widget.sizes || [widget.size];
  if (sizes.length < 2) return "";
  const current = draft.sizes && draft.sizes[id] && sizes.includes(draft.sizes[id]) ? draft.sizes[id] : widget.size;
  const buttons = sizes.map((size) => {
    const label = size === "small" ? "Small" : "Medium";
    const on = current === size;
    return `<button type="button" data-action="home-size" data-id="${app.esc(id)}" data-size="${size}" aria-pressed="${on}">${label}</button>`;
  }).join("");
  return `<div class="hw-size" role="group" aria-label="Size for ${app.esc(widget.name)}">${buttons}</div>`;
}

function homeEditorHTML() {
  const draft = app.ui.homeDraft || app.homeEditorDraft(app.state);
  app.ui.homeDraft = draft;
  const grip = app.I && app.I.grip ? app.I.grip : "";
  const rows = (draft.items || []).map((id, index) => {
    const widget = app.HOME_WIDGETS[id];
    if (!widget) return "";
    const upOff = index === 0 ? " disabled" : "";
    const downOff = index === draft.items.length - 1 ? " disabled" : "";
    return `<div class="hw-row" data-id="${app.esc(id)}">
      <button type="button" class="hw-grip" aria-label="Drag to move ${app.esc(widget.name)}">${grip}</button>
      <span class="hw-moves">
        <button type="button" class="hw-move" data-action="home-up" data-id="${app.esc(id)}" aria-label="Move ${app.esc(widget.name)} up"${upOff}>Up</button>
        <button type="button" class="hw-move" data-action="home-down" data-id="${app.esc(id)}" aria-label="Move ${app.esc(widget.name)} down"${downOff}>Down</button>
      </span>
      <span class="hw-row-name">${app.esc(widget.name)}</span>
      ${sizeControls(id, widget, draft)}
      <button type="button" class="hw-remove" data-action="home-remove" data-id="${app.esc(id)}" aria-label="Remove ${app.esc(widget.name)}">Remove</button>
    </div>`;
  }).join("");
  return `<div class="home-editor">
    <div class="home-editor-top">
      <button type="button" class="home-editor-cancel" data-action="home-cancel">Cancel</button>
      <h1 class="page-title">Edit Home</h1>
      <button type="button" class="btn primary home-editor-save" data-action="home-save">Save</button>
    </div>
    <p class="home-editor-note">Use Up and Down, or drag, to reorder. Remove a card, or add one from the gallery. Save keeps this arrangement with your account.</p>
    <div class="home-editor-list" data-home-list>
      ${rows || `<p class="home-editor-empty">No cards on Home yet. Add one from the gallery.</p>`}
    </div>
    <button type="button" class="btn home-editor-add" data-action="home-gallery">Add a card</button>
  </div>`;
}
app.homeEditorHTML = homeEditorHTML;

function homeGalleryHTML() {
  const draft = app.ui.homeDraft || { items: [] };
  const q = ((app.ui.sd && app.ui.sd.q) || "").trim().toLowerCase();
  const have = new Set(draft.items || []);
  const groups = {};
  Object.keys(app.HOME_WIDGETS).forEach((id) => {
    if (have.has(id)) return;
    const widget = app.HOME_WIDGETS[id];
    if (q && !widget.name.toLowerCase().includes(q) && !id.includes(q)) return;
    (groups[widget.category] = groups[widget.category] || []).push(widget);
  });
  const body = ["recovery", "training", "nutrition", "body"].filter((key) => groups[key]).map((key) => {
    const rows = groups[key].map((widget) => {
      const meta = `${widget.needsOura ? "Oura · " : ""}${widget.size === "small" ? "Small card" : "Medium card"}`;
      return `<div class="hw-gal-row"><span><b>${app.esc(widget.name)}</b><em class="hw-gal-meta">${app.esc(meta)}</em></span><button type="button" class="btn small primary" data-action="home-add" data-id="${app.esc(widget.id)}">Add</button></div>`;
    }).join("");
    return `<div class="mini-l">${CATEGORY_LABEL[key]}</div>${rows}`;
  }).join("");
  return `<h3>Add a card</h3>
    <label class="field-label" for="home-q">Search</label>
    <input class="text-in" id="home-q" type="search" enterkeyhint="search" autocomplete="off" placeholder="Search cards" value="${app.esc((app.ui.sd && app.ui.sd.q) || "")}">
    ${body || `<p class="sub">${q ? "No cards match that search." : "Every card is already on Home."}</p>`}`;
}
app.homeGalleryHTML = homeGalleryHTML;

/* The brief card stays whenever the layout shows it. briefHTML drops only the
   metrics that are already painted as their own tiles. */
function paintedHomeItems(state) {
  return visibleHomeIds(state);
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
  const stack = app.widgetize("home", `<!--w:brief-->${app.briefHTML()}${app.weighReminderHTML()}<!--w:readiness-->${app.readinessCardHTML()}<!--w:today-->${app.HOME_WIDGETS.today.render(live)}
    <!--w:week-->${app.HOME_WIDGETS["this-week"].render(live)}
    <!--w:cardio-->${app.HOME_WIDGETS.cardio.render(live)}
    <!--w:map-adv--><section class="sec">${app.muscleMapHTML("advanced")}</section>
    <!--w:map-basic--><section class="sec">${app.muscleMapHTML("basic")}</section>`);
  return head + stack;
}
app.visibleHomeIds = visibleHomeIds;
app.homeHTML = homeHTML;

if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", (ev) => {
    const grip = ev.target.closest && ev.target.closest(".hw-grip");
    if (!grip || !app.ui || !app.ui.homeEdit) return;
    ev.preventDefault();
    const row = grip.closest(".hw-row");
    if (!row) return;
    const rect = row.getBoundingClientRect();
    app.homeDrag = { row, box: row.parentElement, grab: ev.clientY - rect.top, ty: 0, moved: false };
    row.classList.add("dragging");
    try { grip.setPointerCapture(ev.pointerId); } catch (e) { /* the drag still follows the pointer */ }
  });

  document.addEventListener("pointermove", (ev) => {
    const drag = app.homeDrag;
    if (!drag) return;
    ev.preventDefault();
    const y = ev.clientY;
    const row = drag.row;
    if (Math.abs(y - (drag.grab + row.getBoundingClientRect().top - drag.ty)) > 4) drag.moved = true;
    const place = () => {
      const top = row.getBoundingClientRect().top - drag.ty;
      drag.ty = y - drag.grab - top;
      row.style.transform = `translateY(${drag.ty}px)`;
    };
    place();
    const prev = row.previousElementSibling;
    const next = row.nextElementSibling;
    if (prev && y < prev.getBoundingClientRect().top + prev.offsetHeight / 2) { drag.box.insertBefore(row, prev); place(); }
    else if (next && y > next.getBoundingClientRect().top + next.offsetHeight / 2) { drag.box.insertBefore(next, row); place(); }
    const scroller = row.closest(".pane") || document.scrollingElement;
    if (scroller) {
      if (y < 96) scroller.scrollTop -= 16;
      else if (y > window.innerHeight - 150) scroller.scrollTop += 16;
    }
  }, { passive: false });

  const endHomeDrag = () => {
    const drag = app.homeDrag;
    if (!drag) return;
    app.homeDrag = null;
    drag.row.classList.remove("dragging");
    drag.row.style.transform = "";
    if (!drag.moved || !app.ui || !app.ui.homeDraft) return;
    app.ui.homeDraft.items = [...drag.box.querySelectorAll(".hw-row")].map((row) => row.dataset.id).filter(Boolean);
  };
  document.addEventListener("pointerup", endHomeDrag);
  document.addEventListener("pointercancel", endHomeDrag);
}
