import { app } from "../runtime.js";
import { correlate, pickForToday, todayLine } from "./correlate.js";

/* Home widget registry.
   Paint for people who do not yet have layout.homeV2 still goes through the
   legacy Home stack, so the page does not change. getHomeLayout() only
   describes the v2 stand-in. Step 2 persists a migration; this file does not.

   homeV2 lives on layout so it rides along in user_data, but cloud merge
   keeps it off the wholesale layout replace and picks a winner by updatedAt.
   A missing homeV2 is only an in-memory stand-in (updatedAt 0). setHomeLayout
   is a user edit: it keeps unknown fields, clears migrated, and stamps now. */

const BRIEF_METRICS = ["pattern", "oura", "train", "food", "week", "weight"];
const LEGACY_ORDER = ["brief", "readiness", "today", "week", "cardio", "map-adv", "map-basic"];

/* The brief's training tile is the same job as the hero, so it has no id of its own. */
const METRIC_IDS = {
  pattern: ["pattern"],
  oura: ["readiness", "sleep-score", "sleep-duration", "hrv", "resting-hr", "steps"],
  train: [],
  food: ["food-yesterday"],
  week: ["weekly-goal"],
  weight: ["weight-trend"],
};

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function isoToday() {
  if (typeof app.today === "function") {
    try { return app.today(); } catch (e) { /* fall through */ }
  }
  return new Date().toLocaleDateString("en-CA");
}

function addDays(iso, n) {
  if (typeof app.addDays === "function") {
    try { return app.addDays(iso, n); } catch (e) { /* fall through */ }
  }
  const d = new Date(String(iso) + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
}

function mondayOf(iso) {
  if (typeof app.mondayOf === "function") {
    try { return app.mondayOf(iso); } catch (e) { /* fall through */ }
  }
  const d = new Date(String(iso) + "T12:00:00");
  const w = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - w);
  return d.toLocaleDateString("en-CA");
}

function fmtHM(sec) {
  if (sec == null || Number.isNaN(sec)) return "";
  if (typeof app.fmtHM === "function") return app.fmtHM(sec);
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 3600)}h ${String(Math.round((s % 3600) / 60)).padStart(2, "0")}m`;
}

function signed(v, d = 0) {
  if (typeof app.signed === "function") return app.signed(v, d);
  const n = Number(v);
  if (Number.isNaN(n)) return "";
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(d)}`;
}

function fmtKcal(n) { return Math.round(n || 0).toLocaleString("en-US"); }

function readinessWord(score) {
  if (typeof app.readinessLevel === "function") return app.readinessLevel(score);
  if (score >= 85) return { cls: "up", word: "Primed" };
  if (score >= 70) return { cls: "ok", word: "Good" };
  return { cls: "down", word: "Low" };
}

function whenLabel(date, today) {
  if (!date) return "";
  if (date === today) return "Today";
  if (date === addDays(today, -1)) return "Yesterday";
  try {
    return new Date(date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch (e) { return date; }
}

function latestOuraDay(oura) {
  if (!oura || typeof oura !== "object") return null;
  if (oura.readiness != null && oura.date && !oura.sessions) return oura;
  const keys = Object.keys(oura).filter((k) => oura[k] && oura[k].readiness != null).sort();
  return keys.length ? oura[keys[keys.length - 1]] : null;
}

function hrvAvg(oura) {
  if (!oura || typeof oura !== "object" || oura.readiness != null) {
    return oura && oura.hrv != null ? oura.hrv : null;
  }
  const keys = Object.keys(oura).filter((k) => oura[k] && oura[k].hrv != null).sort().slice(-30);
  if (!keys.length) return null;
  return keys.reduce((sum, k) => sum + oura[k].hrv, 0) / keys.length;
}

function pickSteps(oura, today) {
  if (!oura || typeof oura !== "object") return null;
  const yesterday = addDays(today, -1);
  if (oura[yesterday] && oura[yesterday].steps != null) return { steps: oura[yesterday].steps, label: "Yesterday" };
  const day = latestOuraDay(oura);
  if (day && day.steps != null) return { steps: day.steps, label: whenLabel(day.date, today) || "Latest" };
  if (oura.steps != null && oura.readiness != null) return { steps: oura.steps, label: whenLabel(oura.date, today) || "Latest" };
  return null;
}

function sumEntries(entries) {
  if (!entries || !entries.length) return null;
  const t = entries.reduce((a, e) => {
    const s = (e && e.servings) || 1;
    const b = (e && e.base) || {};
    a.kcal += (b.kcal || 0) * s;
    a.protein += (b.p || 0) * s;
    return a;
  }, { kcal: 0, protein: 0 });
  return { logged: true, kcal: t.kcal, protein: t.protein };
}

function packFood(sum, targets) {
  if (!sum || !sum.logged) return { logged: false };
  return {
    logged: true,
    kcal: sum.kcal,
    protein: sum.protein,
    targetKcal: targets && targets.kcal != null ? targets.kcal : null,
    targetProtein: targets && targets.protein != null ? targets.protein : null,
  };
}

function weightUnit() {
  if (typeof app.wUnit === "function") {
    try { return app.wUnit(); } catch (e) { /* fall through */ }
  }
  return "kg";
}

function fmtWeight(kg) {
  if (kg == null) return "";
  if (typeof app.fmtW === "function" && typeof app.kgToDisp === "function") {
    try { return app.fmtW(app.kgToDisp(kg)); } catch (e) { /* fall through */ }
  }
  return `${Math.round(kg * 10) / 10} kg`;
}

function weightModel(list, today) {
  const rows = [...(list || [])].filter((x) => x && x.date && x.kg != null).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (!rows.length) return { empty: true };
  const last = rows[rows.length - 1];
  const shown = fmtWeight(last.kg);
  const recent = rows.filter((x) => x.date >= addDays(today, -28));
  if (recent.length < 3) return { empty: false, value: shown, sub: "Need a few more over 10 days" };
  const t0 = Date.parse(recent[0].date + "T12:00:00");
  const xs = recent.map((x) => (Date.parse(x.date + "T12:00:00") - t0) / 86400000);
  const ys = recent.map((x) => x.kg);
  if (xs[xs.length - 1] - xs[0] < 10) return { empty: false, value: shown, sub: "Need a few more over 10 days" };
  const mx = xs.reduce((a, x) => a + x, 0) / xs.length;
  const my = ys.reduce((a, y) => a + y, 0) / ys.length;
  const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0) || 1;
  const perWeekKg = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / den * 7;
  const perWeek = typeof app.kgToDisp === "function" ? app.kgToDisp(perWeekKg) : perWeekKg;
  return { empty: false, value: `${signed(perWeek, 1)} ${weightUnit()}/wk`, sub: `Last ${shown}` };
}

function weekModel(sessions, today) {
  const mon = mondayOf(today);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(mon, i);
    const names = (sessions || []).filter((s) => s && s.date === date && s.finishedAt).map((s) => s.name).filter(Boolean);
    const dow = new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" }).slice(0, 3);
    let cls = "wk";
    let label = names.length ? names.join("+") : (date < today ? "" : "+");
    if (names.length) cls += " done";
    if (date === today) cls += " today";
    if (date < today) cls += " past";
    days.push({ cls, dow, num: String(new Date(date + "T12:00:00").getDate()), label });
  }
  return { weekLabel: "This week", weekDays: days };
}

function heroModel(sessions, today) {
  const names = [];
  if (app.DEFAULT_WORKOUTS) app.DEFAULT_WORKOUTS.forEach((w) => { if (w && w.name) names.push(w.name); });
  const chips = names.length ? names : ["Push", "Pull", "Legs"];
  const list = sessions || [];
  const active = list.find((s) => s && !s.finishedAt && s.date === today);
  if (active) return { mode: "active", title: active.name || "Workout", sub: "In progress" };
  const done = list.filter((s) => s && s.date === today && s.finishedAt);
  if (done.length) return { mode: "done", title: done.map((s) => s.name).filter(Boolean).join(" + ") || "Workout", sub: "Logged for today", chips };
  return { mode: "empty", chips };
}

function patternFrom(input, today) {
  if (!input) return null;
  try {
    const rows = correlate(input, {});
    const row = pickForToday(rows, input, today);
    const line = row && todayLine(row);
    if (!line) return null;
    const good = row.valence === "good";
    return { label: good ? "Good for you" : "Working against you", line, tone: good ? "up" : "down" };
  } catch (e) {
    return null;
  }
}

function patternNow() {
  if (typeof app.correlations !== "function" || typeof app.correlationSource !== "function" || typeof app.today !== "function") return null;
  try {
    const row = pickForToday(app.correlations(), app.correlationSource(), app.today());
    const line = row && todayLine(row);
    if (!line) return null;
    const good = row.valence === "good";
    return { label: good ? "Good for you" : "Working against you", line, tone: good ? "up" : "down" };
  } catch (e) {
    return null;
  }
}

function isDemoBundle(sample) {
  return !!(sample && Array.isArray(sample.sessions) && sample.oura && typeof sample.oura === "object" && sample.foodDays && typeof sample.foodDays === "object");
}

const demoSnaps = new WeakMap();

function snapshotFromDemo(bundle) {
  if (bundle && demoSnaps.has(bundle)) return demoSnaps.get(bundle);
  const today = (bundle && bundle.today) || isoToday();
  const ouraDays = (bundle && bundle.oura) || {};
  const oura = latestOuraDay(ouraDays);
  const steps = pickSteps(ouraDays, today);
  const targets = bundle && bundle.targets || null;
  const foodDays = (bundle && bundle.foodDays) || {};
  const snap = {
    kind: "snapshot",
    live: false,
    demo: true,
    today,
    oura,
    hrvAvg: hrvAvg(ouraDays),
    steps: steps ? steps.steps : null,
    stepsLabel: steps ? steps.label : "",
    weekGoal: bundle && bundle.weekGoal || null,
    foodToday: packFood(sumEntries(foodDays[today]), targets),
    foodYesterday: packFood(sumEntries(foodDays[addDays(today, -1)]), targets),
    weight: weightModel(bundle && bundle.weighIns, today),
    cardio: bundle && bundle.cardio || { minutes: 0, goal: 150 },
    pattern: patternFrom(bundle, today),
    headline: oura ? headlineFromScore(oura.readiness) : "Here's where today stands",
    muscleMode: bundle && bundle.muscleMode === "advanced" ? "advanced" : "basic",
    hero: heroModel(bundle && bundle.sessions, today),
    ...weekModel(bundle && bundle.sessions, today),
  };
  if (bundle) demoSnaps.set(bundle, snap);
  return snap;
}

function headlineFromScore(score) {
  if (typeof app.briefHeadline === "function" && score != null) {
    try { return app.briefHeadline({ readiness: score }); } catch (e) { /* fall through */ }
  }
  if (score == null) return "Here's where today stands";
  if (score >= 85) return "Readiness is high, good day to push";
  if (score < 70) return "Readiness is low, keep today easy";
  return "Train as planned";
}

function liveFood(date) {
  if (typeof app.dayEntries !== "function" || typeof app.dayTotals !== "function") return { logged: false };
  try {
    if (!app.dayEntries(date).length) return { logged: false };
    const t = app.dayTotals(date);
    let targets = null;
    if (typeof app.targets === "function") {
      const goal = app.targets();
      if (goal) targets = { kcal: goal.kcal, protein: goal.p };
    }
    return packFood({ logged: true, kcal: t.kcal, protein: t.p }, targets);
  } catch (e) {
    return { logged: false };
  }
}

function snapshotFromApp() {
  const today = isoToday();
  const src = typeof app.src === "function" ? app.src() : { oura: {}, sessions: [] };
  const ouraDays = (src && src.oura) || {};
  const oura = latestOuraDay(ouraDays);
  const steps = pickSteps(ouraDays, today);
  let weekGoal = null;
  try { if (typeof app.weekGoalStatus === "function") weekGoal = app.weekGoalStatus(); } catch (e) { weekGoal = null; }
  let cardio = { minutes: 0, goal: 150 };
  try {
    const wk = typeof app.weekCardio === "function" ? app.weekCardio() : null;
    const goal = app.cardio ? app.cardio().goalMin : 150;
    cardio = { minutes: wk ? wk.min : 0, goal: goal || 150, kcal: wk ? wk.kcal : 0 };
  } catch (e) { /* keep the empty cardio snapshot */ }
  let weigh = [];
  try { if (typeof app.weighIns === "function") weigh = app.weighIns(); } catch (e) { weigh = []; }
  let headline = "Here's where today stands";
  try {
    headline = typeof app.briefTodayHeadline === "function" ? app.briefTodayHeadline() : headlineFromScore(oura && oura.readiness);
  } catch (e) { headline = headlineFromScore(oura && oura.readiness); }
  const mode = typeof app.muscleMode === "function" && app.muscleMode() === "advanced" ? "advanced" : "basic";
  return {
    kind: "snapshot",
    live: true,
    demo: !!(app.state && app.state.demo),
    today,
    oura,
    hrvAvg: hrvAvg(ouraDays),
    steps: steps ? steps.steps : null,
    stepsLabel: steps ? steps.label : "",
    weekGoal,
    foodToday: liveFood(today),
    foodYesterday: liveFood(addDays(today, -1)),
    weight: weightModel(weigh, today),
    cardio,
    pattern: patternNow(),
    headline,
    muscleMode: mode,
    hero: null,
    weekLabel: "This week",
    weekDays: [],
  };
}

function asData(input) {
  if (input && input.kind === "snapshot") return input;
  if (input && input.live) return input;
  if (isDemoBundle(input)) return snapshotFromDemo(input);
  if (!input) return snapshotFromDemo(typeof app.makeDemo === "function" ? safeDemo() : null);
  return input;
}

function safeDemo() {
  try { return app.makeDemo(); } catch (e) { return null; }
}

function small(id, label, value, sub, tone) {
  const t = tone ? ` tone-${tone}` : "";
  return `<article class="hw hw-size-s${t}" data-hw="${id}"><p class="hw-k">${esc(label)}</p><p class="hw-v">${esc(value)}</p>${sub ? `<p class="hw-sub">${esc(sub)}</p>` : ""}</article>`;
}

function ouraMiss(id, label) {
  return small(id, label, "No Oura yet", "Connect a ring to see this");
}

function daySub(data, extra) {
  const when = whenLabel(data.oura && data.oura.date, data.today);
  const bits = [extra, when].filter(Boolean);
  if (data.demo) bits.push("sample");
  return bits.join(" · ");
}

function renderReadiness(data) {
  const day = data && data.oura;
  if (!day || day.readiness == null) return ouraMiss("readiness", "Readiness");
  const lv = readinessWord(day.readiness);
  return small("readiness", "Readiness", String(day.readiness), daySub(data, lv.word), lv.cls);
}

function renderSleepScore(data) {
  const day = data && data.oura;
  if (!day || day.sleepScore == null) return ouraMiss("sleep-score", "Sleep score");
  return small("sleep-score", "Sleep score", String(day.sleepScore), daySub(data, ""));
}

function renderSleepDuration(data) {
  const day = data && data.oura;
  if (!day || day.total == null) return ouraMiss("sleep-duration", "Sleep duration");
  return small("sleep-duration", "Sleep", fmtHM(day.total), daySub(data, ""));
}

function renderHrv(data) {
  const day = data && data.oura;
  if (!day || day.hrv == null) return ouraMiss("hrv", "HRV");
  const base = data.hrvAvg;
  const delta = base != null ? `${signed(day.hrv - base, 0)} vs 30-day avg` : "ms";
  return small("hrv", "HRV", `${Math.round(day.hrv)} ms`, daySub(data, delta));
}

function renderRestingHr(data) {
  const day = data && data.oura;
  if (!day || day.rhr == null) return ouraMiss("resting-hr", "Resting HR");
  return small("resting-hr", "Resting HR", `${Math.round(day.rhr)} bpm`, daySub(data, ""));
}

function renderSteps(data) {
  if (!data || data.steps == null || Number.isNaN(Number(data.steps))) return "";
  const bits = [data.stepsLabel, data.demo ? "sample" : ""].filter(Boolean);
  return small("steps", "Steps", Math.round(Number(data.steps)).toLocaleString("en-US"), bits.join(" · "));
}

function renderWeeklyGoal(data) {
  const st = data && data.weekGoal;
  if (!st || !st.goal) return small("weekly-goal", "Weekly goal", "No goal yet", "Set one from the week strip");
  const left = st.goal - st.done;
  const sub = left > 0 ? `${left === 1 ? "1 session" : left + " sessions"} to go` : "Goal hit";
  return small("weekly-goal", "Weekly goal", `${st.done} of ${st.goal}`, sub);
}

function foodCard(id, label, food, left) {
  if (!food || !food.logged) return small(id, label, "Nothing logged", "Calories and protein show up here");
  let value;
  if (left && food.targetKcal != null) {
    const diff = Math.round(food.targetKcal - food.kcal);
    value = diff >= 0 ? `${fmtKcal(diff)} left` : `${fmtKcal(-diff)} over`;
  } else if (food.targetKcal != null) {
    value = `${fmtKcal(food.kcal)}/${fmtKcal(food.targetKcal)}`;
  } else {
    value = `${fmtKcal(food.kcal)} cal`;
  }
  const protein = food.targetProtein != null
    ? `Protein ${Math.round(food.protein)}/${Math.round(food.targetProtein)} g`
    : `Protein ${Math.round(food.protein)} g`;
  return small(id, label, value, protein);
}

function renderFoodToday(data) { return foodCard("food-today", "Food today", data && data.foodToday, true); }
function renderFoodYesterday(data) { return foodCard("food-yesterday", "Yesterday", data && data.foodYesterday, false); }

function renderWeight(data) {
  const w = data && data.weight;
  if (!w || w.empty) return small("weight-trend", "Weight", "No weigh-ins", "A few mornings show the trend");
  return small("weight-trend", "Weight", w.value, w.sub || "");
}

function renderCardioMinutes(data) {
  const c = (data && data.cardio) || { minutes: 0, goal: 150 };
  const goal = c.goal || 150;
  return small("cardio-minutes", "Cardio", `${Math.round(c.minutes || 0)} min`, `of ${goal} this week`);
}

function heroBlock(hero) {
  const h = hero || { mode: "empty", chips: [] };
  if (h.mode === "active") {
    return `<div class="hero" data-hw="today"><p class="hero-k">In progress</p><h2 class="hero-t">${esc(h.title)}</h2><p class="hero-s">${esc(h.sub || "Pick up where you left off.")}</p></div>`;
  }
  if (h.mode === "done") {
    return `<div class="hero" data-hw="today"><p class="hero-k">Done today</p><h2 class="hero-t">${esc(h.title)}</h2><p class="hero-s">${esc(h.sub || "Logged for today.")}</p></div>`;
  }
  if (h.mode === "rest") {
    return `<div class="hero quiet" data-hw="today"><p class="hero-k">Today</p><h2 class="hero-t">Rest day</h2><p class="hero-s">${esc(h.sub || "Planned off.")}</p></div>`;
  }
  if (h.mode === "planned") {
    return `<div class="hero" data-hw="today"><p class="hero-k">Planned for today</p><h2 class="hero-t">${esc(h.title)}</h2><p class="hero-s">${esc(h.sub || "")}</p></div>`;
  }
  const chips = (h.chips || []).map((name) => `<span class="chip">${esc(name)}</span>`).join("");
  return `<div class="hero quiet" data-hw="today"><p class="hero-k">Today</p><h2 class="hero-t">Nothing planned</h2><p class="hero-s">Start a workout now, or plan one below.</p>${chips ? `<div class="chips">${chips}</div>` : ""}</div>`;
}

function renderToday(data) {
  if (data && data.live && typeof app.homeHeroHTML === "function") return app.homeHeroHTML();
  return heroBlock(data && data.hero);
}

function weekBlock(data) {
  const days = (data && data.weekDays) || [];
  const label = (data && data.weekLabel) || "This week";
  if (!days.length) return `<section class="sec" data-hw="this-week"><div class="sec-h"><h3>${esc(label)}</h3></div></section>`;
  const cells = days.map((d) => `<div class="${esc(d.cls || "wk")}"><span class="wk-d">${esc(d.dow)}</span><span class="wk-n">${esc(d.num)}</span><span class="wk-w">${esc(d.label || "")}</span></div>`).join("");
  return `<section class="sec" data-hw="this-week"><div class="sec-h"><h3>${esc(label)}</h3></div><div class="week">${cells}</div></section>`;
}

function renderThisWeek(data) {
  if (data && data.live && typeof app.homeWeekHTML === "function") return app.homeWeekHTML();
  return weekBlock(data);
}

function renderPattern(data) {
  const pattern = data && data.kind === "snapshot" ? data.pattern : (data && data.live ? patternNow() : data && data.pattern);
  if (!pattern || !pattern.line) {
    return `<section class="hw hw-m" data-hw="pattern"><p class="hw-k">Today's pattern</p><p class="hw-line">Nothing stands out for today yet.</p></section>`;
  }
  const tone = pattern.tone === "up" ? " tone-up" : pattern.tone === "down" ? " tone-down" : "";
  return `<button class="hw hw-m hw-hit${tone}" data-hw="pattern" data-action="open-affects"><span class="hw-k">${esc(pattern.label || "Today's pattern")}</span><span class="hw-line">${esc(pattern.line)}</span><span class="hw-sub">What affects you</span></button>`;
}

function renderHeadline(data) {
  let text = data && data.headline;
  if ((!text || data.live) && data && data.live && typeof app.briefTodayHeadline === "function" && data.kind !== "snapshot") {
    try { text = app.briefTodayHeadline(); } catch (e) { /* keep the snapshot line */ }
  }
  if (!text) text = "Here's where today stands";
  return `<section class="hw hw-m" data-hw="headline"><p class="hw-k">Today</p><h2 class="hw-h">${esc(text)}</h2></section>`;
}

function renderMuscles(data) {
  const mode = data && data.muscleMode === "advanced" ? "advanced" : "basic";
  if (typeof app.muscleMapHTML === "function") return `<section class="sec" data-hw="muscles">${app.muscleMapHTML(mode)}</section>`;
  return `<section class="hw hw-m" data-hw="muscles"><p class="hw-k">Muscles this week</p><p class="hw-line">${mode === "advanced" ? "Detailed map" : "Basic map"}</p></section>`;
}

function renderCardio(data) {
  if (data && data.live && typeof app.cardioWidgetHTML === "function") return app.cardioWidgetHTML();
  const c = (data && data.cardio) || { minutes: 0, goal: 150 };
  const goal = c.goal || 150;
  const min = Math.round(c.minutes || 0);
  const C = 2 * Math.PI * 30;
  const f = Math.min(1, min / goal);
  return `<section class="sec" data-hw="cardio"><div class="sec-h"><h3>Cardio</h3></div><div class="card cw"><button class="cw-ring" data-action="cardio-open" aria-label="Cardio: ${min} of ${goal} minutes this week"><svg viewBox="0 0 76 76" aria-hidden="true"><circle cx="38" cy="38" r="30" class="cw-bg"/><circle cx="38" cy="38" r="30" class="cw-fg" stroke-dasharray="${C * f} ${C}" transform="rotate(-90 38 38)"/></svg><span><b>${min}</b><small>/ ${goal} min</small></span></button><div class="cw-right"><span class="cw-label">Cardio this week</span></div></div></section>`;
}

function renderLastNight(data) {
  const day = data && data.oura;
  if (!day || !day.total) return "";
  const denom = (day.total || 0) + (day.awake || 0) || 1;
  const stage = (key, cls) => `<i class="${cls}" style="width:${((day[key] || 0) / denom * 100).toFixed(1)}%"></i>`;
  const awakeMin = Math.round((day.awake || 0) / 60);
  return `<div class="card" data-hw="last-night"><h4>Last night</h4><div class="stages">${stage("deep", "s-deep")}${stage("rem", "s-rem")}${stage("light", "s-light")}${stage("awake", "s-awake")}</div><div class="legend2"><span><i class="s-deep"></i>Deep ${fmtHM(day.deep || 0)}</span><span><i class="s-rem"></i>REM ${fmtHM(day.rem || 0)}</span><span><i class="s-light"></i>Light ${fmtHM(day.light || 0)}</span><span><i class="s-awake"></i>Awake ${awakeMin}m</span></div></div>`;
}

function widget(spec) {
  return {
    id: spec.id,
    name: spec.name,
    category: spec.category,
    size: spec.size,
    needsOura: spec.needsOura,
    render(data) { return spec.render(asData(data)); },
    preview(sample) { return this.render(sample); },
  };
}

/* headline and pattern sit with the training day. Muscles tracks this week's work. */
export const HOME_WIDGETS = {
  readiness: widget({ id: "readiness", name: "Readiness", category: "recovery", size: "small", needsOura: true, render: renderReadiness }),
  "sleep-score": widget({ id: "sleep-score", name: "Sleep score", category: "recovery", size: "small", needsOura: true, render: renderSleepScore }),
  "sleep-duration": widget({ id: "sleep-duration", name: "Sleep duration", category: "recovery", size: "small", needsOura: true, render: renderSleepDuration }),
  hrv: widget({ id: "hrv", name: "HRV", category: "recovery", size: "small", needsOura: true, render: renderHrv }),
  "resting-hr": widget({ id: "resting-hr", name: "Resting HR", category: "recovery", size: "small", needsOura: true, render: renderRestingHr }),
  steps: widget({ id: "steps", name: "Steps", category: "recovery", size: "small", needsOura: true, render: renderSteps }),
  "weekly-goal": widget({ id: "weekly-goal", name: "Weekly goal", category: "training", size: "small", needsOura: false, render: renderWeeklyGoal }),
  "food-today": widget({ id: "food-today", name: "Food today", category: "nutrition", size: "small", needsOura: false, render: renderFoodToday }),
  "food-yesterday": widget({ id: "food-yesterday", name: "Yesterday's food", category: "nutrition", size: "small", needsOura: false, render: renderFoodYesterday }),
  "weight-trend": widget({ id: "weight-trend", name: "Weight trend", category: "body", size: "small", needsOura: false, render: renderWeight }),
  "cardio-minutes": widget({ id: "cardio-minutes", name: "Cardio minutes", category: "training", size: "small", needsOura: false, render: renderCardioMinutes }),
  today: widget({ id: "today", name: "Today's workout", category: "training", size: "medium", needsOura: false, render: renderToday }),
  "this-week": widget({ id: "this-week", name: "This week", category: "training", size: "medium", needsOura: false, render: renderThisWeek }),
  pattern: widget({ id: "pattern", name: "Today's pattern", category: "training", size: "medium", needsOura: false, render: renderPattern }),
  headline: widget({ id: "headline", name: "Daily headline", category: "training", size: "medium", needsOura: false, render: renderHeadline }),
  muscles: widget({ id: "muscles", name: "Muscles this week", category: "training", size: "medium", needsOura: false, render: renderMuscles }),
  cardio: widget({ id: "cardio", name: "Cardio", category: "training", size: "medium", needsOura: false, render: renderCardio }),
  "last-night": widget({ id: "last-night", name: "Last night", category: "recovery", size: "medium", needsOura: true, render: renderLastNight }),
};

const CATALOG_IDS = Object.keys(HOME_WIDGETS);

function isHomeV2(raw) {
  return !!(raw && raw.v === 2 && Array.isArray(raw.items));
}

function cloneHomeV2(raw) {
  return {
    ...raw,
    v: 2,
    items: raw.items.slice(),
    hidden: Array.isArray(raw.hidden) ? raw.hidden.slice() : [],
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0,
  };
}

function legacyHomeView(state) {
  const home = state && state.layout && state.layout.home;
  const hasHome = !!(home && typeof home === "object" && !Array.isArray(home));
  const mode = state && state.muscleMode === "advanced" ? "advanced" : "basic";
  let order = hasHome && Array.isArray(home.order) ? home.order.slice() : [];
  const hidden = hasHome && Array.isArray(home.hidden) ? home.hidden.slice() : [mode === "advanced" ? "map-basic" : "map-adv"];
  if (order.length && !order.includes("brief") && !hidden.includes("brief")) order = ["brief", ...order];
  const full = [...order.filter((id) => LEGACY_ORDER.includes(id)), ...LEGACY_ORDER.filter((id) => !order.includes(id))];
  return { order: full, hidden };
}

function briefView(state) {
  const b = state && state.brief && typeof state.brief === "object" && !Array.isArray(state.brief) ? state.brief : {};
  const order = [];
  (Array.isArray(b.order) ? b.order : []).forEach((id) => { if (BRIEF_METRICS.includes(id) && !order.includes(id)) order.push(id); });
  BRIEF_METRICS.forEach((id) => { if (!order.includes(id)) order.push(id); });
  const hidden = [...new Set((Array.isArray(b.hidden) ? b.hidden : []).filter((id) => BRIEF_METRICS.includes(id)))];
  return { order, hidden };
}

/* Stand-in only. Visible legacy slots expand into v2 ids; everything else is hidden.
   The Morning brief stays one card on screen until a saved homeV2 exists. */
function equivalentLayout(state) {
  const legacy = legacyHomeView(state);
  const hiddenLegacy = new Set(legacy.hidden);
  const brief = briefView(state);
  const briefHidden = new Set(brief.hidden);
  const visible = [];
  const seen = new Set();
  const add = (id) => { if (!id || seen.has(id) || !HOME_WIDGETS[id]) return; seen.add(id); visible.push(id); };
  legacy.order.forEach((slot) => {
    if (hiddenLegacy.has(slot)) return;
    if (slot === "brief") {
      add("headline");
      brief.order.forEach((metric) => {
        if (briefHidden.has(metric)) return;
        (METRIC_IDS[metric] || []).forEach(add);
      });
    } else if (slot === "readiness") add("readiness");
    else if (slot === "today") add("today");
    else if (slot === "week") add("this-week");
    else if (slot === "cardio") add("cardio");
    else if (slot === "map-adv" || slot === "map-basic") add("muscles");
  });
  const hidden = CATALOG_IDS.filter((id) => !seen.has(id));
  return { v: 2, items: [...visible, ...hidden], hidden, updatedAt: 0 };
}

export function getHomeLayout(state) {
  const saved = state && state.layout && state.layout.homeV2;
  if (isHomeV2(saved)) return cloneHomeV2(saved);
  return equivalentLayout(state || {});
}

export function setHomeLayout(state, layout) {
  if (!state || typeof state !== "object") throw new Error("setHomeLayout needs a state object");
  const prev = state.layout && state.layout.homeV2 && typeof state.layout.homeV2 === "object" && !Array.isArray(state.layout.homeV2)
    ? state.layout.homeV2
    : {};
  const next = {
    ...prev,
    v: 2,
    items: Array.isArray(layout && layout.items) ? layout.items.slice() : [],
    hidden: Array.isArray(layout && layout.hidden) ? layout.hidden.slice() : [],
    updatedAt: Date.now(),
  };
  delete next.migrated;
  state.layout = state.layout && typeof state.layout === "object" && !Array.isArray(state.layout) ? state.layout : {};
  state.layout.homeV2 = next;
  return next;
}

export function mergeHomeV2(local, remote) {
  const a = isHomeV2(local) ? local : null;
  const b = isHomeV2(remote) ? remote : null;
  if (!a && !b) return null;
  if (!a) return cloneHomeV2(b);
  if (!b) return cloneHomeV2(a);
  return (b.updatedAt || 0) > (a.updatedAt || 0) ? cloneHomeV2(b) : cloneHomeV2(a);
}

/* Wholesale layout replace must not carry homeV2. The winner is chosen here. */
export function mergeRemoteLayout(state, remote) {
  if (!state) return;
  const localV2 = state.layout && state.layout.homeV2;
  const remoteLayout = remote && remote.layout;
  const remoteV2 = remoteLayout && remoteLayout.homeV2;
  if ((remote && remote.settingsAt || 0) > ((state && state.settingsAt) || 0)) {
    if (remote.muscleMode) state.muscleMode = remote.muscleMode;
    if (remoteLayout) {
      const rest = { ...remoteLayout };
      delete rest.homeV2;
      state.layout = rest;
    }
    if (remote.uniEx) state.uniEx = remote.uniEx;
    state.settingsAt = remote.settingsAt;
  }
  const winner = mergeHomeV2(localV2, remoteV2);
  if (winner) {
    state.layout = state.layout || {};
    state.layout.homeV2 = winner;
  } else if (state.layout && state.layout.homeV2) {
    delete state.layout.homeV2;
  }
}

export function renderHomeWidgets(layout, data) {
  const hidden = new Set((layout && layout.hidden) || []);
  const items = (layout && layout.items) || [];
  const body = items.map((id) => {
    if (hidden.has(id)) return "";
    const entry = HOME_WIDGETS[id];
    if (!entry) return "";
    const html = entry.render(data) || "";
    if (!String(html).trim()) return "";
    const span = entry.size === "medium" ? " span-m" : "";
    return `<div class="hw-slot${span}" data-hw="${id}">${html}</div>`;
  }).join("");
  return `<div class="home-v2">${body}</div>`;
}

app.HOME_WIDGETS = HOME_WIDGETS;
app.getHomeLayout = getHomeLayout;
app.setHomeLayout = setHomeLayout;
app.mergeHomeV2 = mergeHomeV2;
app.mergeRemoteLayout = mergeRemoteLayout;
app.renderHomeWidgets = renderHomeWidgets;
app.snapshotFromApp = snapshotFromApp;
