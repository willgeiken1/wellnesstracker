import { app } from "../runtime.js";
import { pickForToday, todayLine } from "./correlate.js";
import { hasOura, ouraWidgetShowing } from "./oura-gate.js";

/* Morning brief: one Home card, chosen metrics, a local headline.
   The headline uses readiness, lift status, and effect() — no network.
   The pattern line is one correlation that fits today. It stays on the device. */

const BRIEF_METRICS = [
  ["pattern", "What affects you"],
  ["oura", "Readiness and sleep"],
  ["train", "Today's training"],
  ["food", "Yesterday's food"],
  ["week", "Weekly workouts"],
  ["weight", "Weight trend"],
];
app.BRIEF_METRICS = BRIEF_METRICS;

export function briefHeadline({ proteinLowDays, readiness, focus, effectRows, lifts } = {}) {
  if (proteinLowDays >= 3) return `Protein was low ${proteinLowDays} days in a row`;
  if (readiness >= 85 && focus) return `Readiness is high, good day for ${focus}`;
  if (readiness != null && readiness < 70) return "Readiness is low, keep today easy";
  const rows = effectRows || [];
  const hi = rows.find((r) => r.label === "high");
  const lo = rows.find((r) => r.label === "low");
  if (hi && lo && hi.n >= 3 && lo.n >= 3 && hi.avg != null && lo.avg != null) {
    const d = hi.avg - lo.avg;
    if (d >= 1) return "You lift stronger on high-readiness days";
    if (d <= -1) return "You lift stronger on low-readiness days";
  }
  const list = (lifts || []).filter((l) => l && l.name && l.cls !== "wait");
  const down = list.filter((l) => l.cls === "down").sort((a, b) => (a.pctWeek || 0) - (b.pctWeek || 0));
  if (down.length) return `${down[0].name} is declining`;
  const flat = list.filter((l) => l.label === "Plateau");
  if (flat.length) return `${flat[0].name} has plateaued`;
  const up = list.filter((l) => l.label === "Progressing").sort((a, b) => (b.pctWeek || 0) - (a.pctWeek || 0));
  if (up.length) return `${up[0].name} is progressing`;
  if (readiness >= 70 && readiness < 85) return "Train as planned";
  if (readiness >= 85) return "Readiness is high, good day to push";
  return "Here's where today stands";
}
app.briefHeadline = briefHeadline;

function briefPrefs() {
  const b = app.state.brief && typeof app.state.brief === "object" && !Array.isArray(app.state.brief) ? app.state.brief : {};
  const known = new Set(BRIEF_METRICS.map((m) => m[0]));
  const order = [];
  (Array.isArray(b.order) ? b.order : []).forEach((id) => { if (known.has(id) && !order.includes(id)) order.push(id); });
  BRIEF_METRICS.forEach(([id]) => { if (!order.includes(id)) order.push(id); });
  const hidden = [...new Set((Array.isArray(b.hidden) ? b.hidden : []).filter((id) => known.has(id)))];
  return { order, hidden, size: b.size === "expanded" ? "expanded" : "compact", updatedAt: b.updatedAt || 0 };
}
app.briefPrefs = briefPrefs;

function saveBrief(next) {
  const prev = app.briefPrefs();
  app.state.brief = {
    order: next.order || prev.order,
    hidden: next.hidden || [],
    size: next.size === "expanded" ? "expanded" : "compact",
    updatedAt: Date.now(),
  };
  app.save();
}
app.saveBrief = saveBrief;

function focusWord(w) {
  if (!w || !w.name) return null;
  const low = String(w.name).trim().toLowerCase();
  if (/^legs?$/.test(low)) return "legs";
  if (low === "push" || low === "pull") return low;
  const muscle = w.exercises && w.exercises[0] && w.exercises[0].muscles && w.exercises[0].muscles[0];
  const group = {
    quads: "legs", hamstrings: "legs", glutes: "legs", calves: "legs", adductors: "legs", abductors: "legs",
    chest: "chest", frontDelts: "shoulders", sideDelts: "shoulders", rearDelts: "shoulders",
    lats: "back", upperBack: "back", lowerBack: "back", traps: "back",
    biceps: "arms", triceps: "arms", forearms: "arms", abs: "core", obliques: "core",
  };
  if (group[muscle]) return group[muscle];
  return low.length <= 18 ? low : null;
}

function scheduledFocus() {
  const planned = (app.state.plan || {})[app.today()];
  if (!planned || planned === "rest") return null;
  return focusWord(app.workoutById(planned));
}

function freshReadiness() {
  const o = app.latestOura(app.src().oura);
  if (!o || o.readiness == null) return null;
  const t = app.today();
  if (o.date !== t && o.date !== app.addDays(t, -1)) return null;
  return o.readiness;
}

function proteinLowDays() {
  const T = app.targets();
  if (!T || !T.p) return 0;
  let n = 0;
  for (let i = 1; i <= 14; i++) {
    const d = app.addDays(app.today(), -i);
    if (!app.dayEntries(d).length) break;
    if (app.dayTotals(d).p >= T.p) break;
    n++;
  }
  return n;
}

export function ouraMetric() {
  if (!hasOura(app.state) || ouraWidgetShowing(app.state, "readiness")) return null;
  const o = app.latestOura(app.src().oura);
  if (!o || o.readiness == null) return null;
  const lv = app.readinessLevel(o.readiness);
  const when = o.date === app.today() ? "Today" : o.date === app.addDays(app.today(), -1) ? "Yesterday" : app.fmtDate(o.date, { month: "short", day: "numeric" });
  return {
    id: "oura", label: "Readiness", value: String(o.readiness), tone: lv.cls, bar: o.readiness,
    meta: o.sleepScore != null ? `Sleep ${o.sleepScore}` : "No sleep score",
    sub: `${lv.word} · ${when}${app.state.demo ? " · sample" : ""}`,
  };
}

function trainMetric() {
  const t = app.today();
  const active = app.activeSession();
  if (active) return { id: "train", label: "Training", value: active.name, meta: "In progress", sub: "Pick up where you left off." };
  const planned = (app.state.plan || {})[t];
  const doneToday = app.sessionsOn(t).filter((s) => s.finishedAt);
  if (planned && planned !== "rest") {
    const w = app.workoutById(planned);
    if (w && !doneToday.some((s) => s.workoutId === planned)) {
      return { id: "train", label: "Training", value: w.name, meta: app.pl(w.exercises.length, "exercise"), sub: "On today's plan." };
    }
  }
  if (doneToday.length) return { id: "train", label: "Training", value: doneToday.map((s) => s.name).join(" + "), meta: "Done today", sub: "Logged for today." };
  const o = app.latestOura(app.src().oura);
  const fresh = o && (o.date === t || o.date === app.addDays(t, -1)) ? o.readiness : null;
  const st = app.weekGoalStatus();
  let why = "Nothing is planned";
  if (planned === "rest") why = "It's on the plan";
  else if (fresh != null && fresh < 70) why = "Readiness is low";
  else if (st && st.done >= st.goal) why = "Weekly goal is already in";
  return { id: "train", label: "Training", value: planned === "rest" ? "Rest day" : "Rest suggested", meta: why, sub: planned === "rest" ? "Take the day." : "No session on the plan.", empty: planned !== "rest" && why === "Nothing is planned" };
}

function foodMetric() {
  const y = app.addDays(app.today(), -1);
  if (!app.dayEntries(y).length) return { id: "food", label: "Yesterday", value: "No meals logged", meta: "Calories and protein land here", sub: "Log yesterday from the Food tab.", empty: true };
  const tot = app.dayTotals(y), T = app.targets();
  const kcal = app.r0(tot.kcal), p = app.r0(tot.p);
  if (!T) return { id: "food", label: "Yesterday", value: `${kcal.toLocaleString()} cal`, meta: `Protein ${p} g`, sub: "No target set yet." };
  const under = T.p && p < T.p;
  return {
    id: "food", label: "Yesterday", low: !!under,
    value: `${kcal.toLocaleString()}/${T.kcal.toLocaleString()}`,
    meta: `Protein ${p}/${T.p} g`,
    sub: under ? "Protein under target." : "Protein on target.",
    bar: T.kcal ? Math.min(100, kcal / T.kcal * 100) : null,
  };
}

function weekMetric() {
  const done = app.sessionsInWeek(app.mondayOf(app.today()));
  const st = app.weekGoalStatus();
  if (!st) return { id: "week", label: "This week", value: done ? app.pl(done, "workout") : "No workouts yet", meta: "No weekly goal set", sub: "Set one from the week strip.", empty: !done };
  const left = st.goal - st.done;
  return { id: "week", label: "This week", value: `${st.done} of ${st.goal}`, meta: left > 0 ? `${app.pl(left, "session")} to go` : "Goal hit", sub: left > 0 ? "Monday through Sunday." : "Weekly goal is in.", bar: Math.min(100, st.done / st.goal * 100) };
}

function weightMetric() {
  const w = app.weighIns();
  if (!w.length) return { id: "weight", label: "Weight", value: "No weigh-ins", meta: "A few mornings show the trend", sub: "Log one from Progress or the reminder.", empty: true };
  const last = w[w.length - 1];
  const shown = app.fmtW(app.kgToDisp(last.kg));
  const r = app.weightRate();
  if (!r) return { id: "weight", label: "Weight", value: shown, meta: "Need a few more over 10 days", sub: "The weekly rate shows up after that." };
  const dir = r.perWeek > 0.05 ? "Gaining" : r.perWeek < -0.05 ? "Losing" : "Holding steady";
  return { id: "weight", label: "Weight", value: `${app.signed(r.perWeek, 1)} ${app.wUnit()}/wk`, meta: `Last ${shown}`, sub: `${dir} over the last month.` };
}

function patternMetric() {
  if (typeof app.correlations !== "function" || typeof app.correlationSource !== "function") return null;
  let row = null;
  try {
    const src = app.correlationSource();
    row = pickForToday(app.correlations(), src, app.today());
  } catch (e) { row = null; }
  if (!row) return null;
  const line = todayLine(row);
  if (!line) return null;
  const good = row.valence === "good";
  return {
    id: "pattern",
    label: good ? "Good for you" : "Working against you",
    value: line,
    meta: "What affects you",
    tone: good ? "up" : "down",
    link: "affects",
  };
}

function briefMetrics() {
  const byId = { pattern: patternMetric(), oura: ouraMetric(), train: trainMetric(), food: foodMetric(), week: weekMetric(), weight: weightMetric() };
  const prefs = app.briefPrefs();
  return prefs.order.filter((id) => !prefs.hidden.includes(id)).map((id) => byId[id]).filter(Boolean);
}
app.briefMetrics = briefMetrics;

function briefTodayHeadline() {
  const S = app.src();
  const perfs = app.sessionPerf(S.sessions);
  const effectRows = app.effect(perfs, (d) => {
    const day = S.oura[d];
    return day && day.readiness != null ? day.readiness : null;
  }, [
    { label: "low", test: (v) => v < 70 },
    { label: "mid", test: (v) => v >= 70 && v < 85 },
    { label: "high", test: (v) => v >= 85 },
  ]);
  const series = app.liftSeries(S.sessions);
  const lifts = Object.entries(series).map(([name, s]) => ({ name, ...app.liftStatus(s) }));
  return app.briefHeadline({ proteinLowDays: proteinLowDays(), readiness: freshReadiness(), focus: scheduledFocus(), effectRows, lifts });
}
app.briefTodayHeadline = briefTodayHeadline;

function metricHTML(m) {
  if (m.link === "affects") {
    return `<li class="brief-metric span${m.tone ? ` tone-${m.tone}` : ""}" data-metric="${m.id}">
      <button class="brief-hit" data-action="open-affects">
        <span class="brief-l">${app.esc(m.label)}</span>
        <span class="brief-line">${app.esc(m.value)}</span>
        <span class="brief-m">${app.esc(m.meta || "What affects you")}</span>
      </button></li>`;
  }
  const bar = m.bar != null ? `<span class="brief-bar" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, m.bar)).toFixed(1)}%"></i></span>` : "";
  return `<li class="brief-metric${m.empty ? " empty" : ""}${m.low ? " low" : ""}${m.tone ? ` tone-${m.tone}` : ""}" data-metric="${m.id}">
    <span class="brief-l">${app.esc(m.label)}</span><b>${app.esc(m.value)}</b>
    ${m.meta ? `<span class="brief-m">${app.esc(m.meta)}</span>` : ""}
    ${m.sub ? `<span class="brief-s">${app.esc(m.sub)}</span>` : ""}${bar}</li>`;
}

function briefHTML() {
  const prefs = app.briefPrefs();
  if (app.ui.briefEdit) {
    const hidden = new Set(prefs.hidden);
    const rows = prefs.order.map((id) => {
      const name = BRIEF_METRICS.find((m) => m[0] === id)[1];
      const on = !hidden.has(id);
      return `<li class="brief-row" data-id="${id}">
        <button class="brief-grip" aria-label="Drag to move ${app.esc(name)}">${app.I.grip}</button>
        <span>${app.esc(name)}</span>
        <button class="switch" role="switch" aria-checked="${on}" data-action="brief-toggle" data-id="${id}" aria-label="${on ? "Hide" : "Show"} ${app.esc(name)}"><i></i></button>
      </li>`;
    }).join("");
    return `<section class="card brief editing" aria-label="Edit morning brief">
      <div class="brief-top"><p class="brief-k">Edit brief</p><button class="brief-done" data-action="brief-done">Done</button></div>
      <p class="brief-note">Turn metrics on or off, and drag to reorder. This stays with your account.</p>
      <ul class="brief-edit">${rows}</ul></section>`;
  }
  const expanded = prefs.size === "expanded";
  const items = app.briefMetrics();
  const visible = prefs.order.filter((id) => !prefs.hidden.includes(id));
  const body = items.length ? `<ul class="brief-metrics">${items.map(metricHTML).join("")}</ul>` : (visible.length ? "" : `<p class="brief-note">All metrics are off. Edit the brief to turn one on.</p>`);
  return `<section class="card brief${expanded ? " expanded" : ""}" data-brief-size="${prefs.size}" aria-label="Morning brief">
    <div class="brief-top"><p class="brief-k">Morning brief</p><div class="brief-tools">
      <button data-action="brief-size" aria-pressed="${expanded}">${expanded ? "Compact" : "Expand"}</button>
      <button data-action="brief-edit">Edit</button></div></div>
    <h2 class="brief-h">${app.esc(app.briefTodayHeadline())}</h2>
    ${body}
  </section>`;
}
app.briefHTML = briefHTML;

if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", (ev) => {
    const g = ev.target.closest(".brief-grip");
    if (!g || !app.ui.briefEdit) return;
    ev.preventDefault();
    const row = g.closest(".brief-row");
    const r = row.getBoundingClientRect();
    app.briefDrag = { row, box: row.parentElement, grab: ev.clientY - r.top, ty: 0, moved: false };
    row.classList.add("dragging");
    try { g.setPointerCapture(ev.pointerId); } catch (e) { /* the drag still follows the pointer */ }
  });

  document.addEventListener("pointermove", (ev) => {
    const d = app.briefDrag;
    if (!d) return;
    ev.preventDefault();
    const y = ev.clientY, el = d.row;
    if (Math.abs(y - (d.grab + el.getBoundingClientRect().top - d.ty)) > 4) d.moved = true;
    const place = () => {
      const top = el.getBoundingClientRect().top - d.ty;
      d.ty = y - d.grab - top;
      el.style.transform = `translateY(${d.ty}px)`;
    };
    place();
    const prev = el.previousElementSibling, next = el.nextElementSibling;
    if (prev && y < prev.getBoundingClientRect().top + prev.offsetHeight / 2) { d.box.insertBefore(el, prev); place(); }
    else if (next && y > next.getBoundingClientRect().top + next.offsetHeight / 2) { d.box.insertBefore(next, el); place(); }
    const scroller = el.closest(".pane");
    if (scroller) {
      if (y < 90) scroller.scrollTop -= 14;
      else if (y > window.innerHeight - 140) scroller.scrollTop += 14;
    }
  }, { passive: false });

  const endBriefDrag = () => {
    const d = app.briefDrag;
    if (!d) return;
    app.briefDrag = null;
    d.row.classList.remove("dragging");
    d.row.style.transform = "";
    if (!d.moved) return;
    app.briefEatUntil = performance.now() + 400;
    const order = [...d.box.querySelectorAll(".brief-row")].map((el) => el.dataset.id);
    const prefs = app.briefPrefs();
    app.saveBrief({ ...prefs, order });
    if (app.capture) app.capture("morning_brief_customized");
    app.render();
  };
  document.addEventListener("pointerup", endBriefDrag);
  document.addEventListener("pointercancel", endBriefDrag);
  document.addEventListener("click", (ev) => {
    if (performance.now() < (app.briefEatUntil || 0)) { app.briefEatUntil = 0; ev.stopPropagation(); ev.preventDefault(); }
  }, true);
}
