import { app } from "../runtime.js";

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

function homeHTML() {
  const t = app.today();
  const active = app.activeSession();
  const planned = app.state.plan[t];
  const doneToday = app.sessionsOn(t).filter((s) => s.finishedAt);
  let hero;
  if (active) {
    hero = `<div class="hero"><p class="hero-k">In progress</p><h2 class="hero-t">${app.esc(active.name)}</h2>
      <p class="hero-s">${app.pl(app.setCount(active), "set")} logged · started ${new Date(active.startedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
      <button class="btn primary block" data-action="resume">Resume workout</button></div>`;
  } else if (planned && planned !== "rest" && app.workoutById(planned) && !doneToday.some((s) => s.workoutId === planned)) {
    const w = app.workoutById(planned);
    hero = `<div class="hero"><p class="hero-k">Planned for today</p><h2 class="hero-t">${app.esc(w.name)}</h2>
      <p class="hero-s">${app.pl(w.exercises.length, "exercise")}</p>
      <button class="btn primary block" data-action="start" data-id="${app.esc(w.id)}">Start ${app.esc(w.name)}</button></div>`;
  } else if (doneToday.length) {
    const sets = doneToday.reduce((n, s) => n + app.setCount(s), 0);
    hero = `<div class="hero"><p class="hero-k">Done today</p><h2 class="hero-t">${doneToday.map((s) => app.esc(s.name)).join(" + ")}</h2>
      ${app.startChips(`${app.pl(sets, "set")} logged. Train again?`)}</div>`;
  } else if (planned === "rest") {
    hero = `<div class="hero quiet"><p class="hero-k">Today</p><h2 class="hero-t">Rest day</h2>${app.startChips("Planned off. Changed your mind?")}</div>`;
  } else {
    hero = `<div class="hero quiet"><p class="hero-k">Today</p><h2 class="hero-t">Nothing planned</h2>${app.startChips("Start a workout now, or plan one below.")}</div>`;
  }

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

  const thisMon = app.mondayOf(t);
  const hit = app.musclesBetween(thisMon, app.addDays(thisMon, 6));
  const hitSet = new Set(hit.keys());
  const keys = Object.keys(app.MUSCLES).sort((a, b) => (hit.get(b) || 0) - (hit.get(a) || 0));

  return `
    ${app.pageHead(app.firstName() ? `Hi, ${app.esc(app.firstName())}` : app.fmtDate(t, { weekday: "long" }), `${app.firstName() ? `${app.greeting()} · ` : ""}${app.fmtDate(t, { weekday: "long", month: "long", day: "numeric" })}`, { left: app.addButtonHTML("home") })}
    ${app.widgetize("home", `<!--w:brief-->${app.briefHTML()}${app.weighReminderHTML()}<!--w:readiness-->${app.readinessCardHTML()}<!--w:today-->${hero}
    <!--w:week--><section class="sec">
      <div class="sec-h"><h3>${weekLabel}</h3>
        <div class="week-nav">${app.ui.weekOffset === 0 ? app.weekGoalHeadHTML() : ""}
          <button class="icon-btn" data-action="week" data-d="-1" aria-label="Previous week">${app.I.chevL}</button>
          <button class="icon-btn" data-action="week" data-d="1" aria-label="Next week"><span style="transform:scaleX(-1);display:grid">${app.I.chevL}</span></button>
        </div></div>
      <div class="week">${week}</div>${app.ui.weekOffset === 0 ? app.weekGoalLineHTML() : ""}
    </section>
    <!--w:cardio-->${app.cardioWidgetHTML()}
    <!--w:map-adv--><section class="sec">${app.muscleMapHTML("advanced")}</section>
    <!--w:map-basic--><section class="sec">${app.muscleMapHTML("basic")}</section>`)}`;
}
app.homeHTML = homeHTML;
