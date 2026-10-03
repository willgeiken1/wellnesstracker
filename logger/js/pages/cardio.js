import { app } from "../runtime.js";

/* Cardio estimates, live session, and cardio screens. */
/* ================= Cardio ================= */
const MACHINES = {
  treadmill: { name: "Incline treadmill", short: "Treadmill", icon: "🏃", fields: ["speed", "incline"] },
  stair:     { name: "StairMaster", short: "StairMaster", icon: "🪜", fields: ["level", "incline"] },
  elliptical:{ name: "Elliptical", short: "Elliptical", icon: "〰️", fields: ["level", "incline"] },
  bike:      { name: "Stationary bike", short: "Bike", icon: "🚲", fields: ["level"] },
  rower:     { name: "Rower", short: "Rower", icon: "🚣", fields: ["level"] },
};
app.MACHINES = MACHINES;

function cardio() {
  if (!app.state.cardio) app.state.cardio = { sessions: [], saved: [], goalMin: 150, deleted: [], live: null, updatedAt: 0 };
  const c = app.state.cardio; c.sessions = c.sessions || []; c.saved = c.saved || []; c.deleted = c.deleted || []; if (!c.goalMin) c.goalMin = 150;
  return c;
}
app.cardio = cardio;

const cid = () => "c_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
app.cid = cid;

function cardioTouch() { app.cardio().updatedAt = Date.now(); app.save(); }
app.cardioTouch = cardioTouch;

const spUnit = () => (app.units() === "metric" ? "km/h" : "mph");
app.spUnit = spUnit;

const mphToDisp = (mph) => (app.units() === "metric" ? mph * 1.609344 : mph);
app.mphToDisp = mphToDisp;

const dispToMph = (v) => (app.units() === "metric" ? v / 1.609344 : v);
app.dispToMph = dispToMph;

function bodyKg() { const w = app.weighIns().slice(-1)[0]; return w ? w.kg : 80; }
app.bodyKg = bodyKg;

/* Calories per minute.
   Treadmill: ACSM metabolic equations (walking below 4.5 mph, running above), VO2 in ml/kg/min, ~5 kcal per litre of O2.
   Others: MET values scaled by level (1–20); kcal/min = MET × 3.5 × kg / 200. All are estimates. */
function kcalPerMin(machine, seg, kg) {
  const inc = Math.max(0, +seg.incline || 0) / 100;
  if (machine === "treadmill") {
    const S = Math.max(0, +seg.mph || 0) * 26.8224;               // metres per minute
    const vo2 = (+seg.mph || 0) < 4.5 ? 3.5 + 0.1 * S + 1.8 * S * inc : 3.5 + 0.2 * S + 0.9 * S * inc;
    return vo2 * kg / 1000 * 5;
  }
  const L = Math.max(1, Math.min(20, +seg.level || 1));
  const met = machine === "stair" ? (4 + 0.4 * L) * (1 + inc * 0.5)
    : machine === "elliptical" ? (4 + 0.25 * L) * (1 + inc * 0.5)
    : machine === "bike" ? 3.5 + 0.3 * L
    : 4.5 + 0.3 * L;
  return met * 3.5 * kg / 200;
}
app.kcalPerMin = kcalPerMin;

function sessionKcal(s, kg) { return s.segments.reduce((n, g) => n + app.kcalPerMin(s.machine, g, kg) * (g.min || 0), 0); }
app.sessionKcal = sessionKcal;

const sessionMin = (s) => s.segments.reduce((n, g) => n + (g.min || 0), 0);
app.sessionMin = sessionMin;

function segText(machine, g) {
  const f = app.MACHINES[machine].fields, out = [];
  if (f.includes("speed")) out.push(`${app.fmtNum(Math.round(app.mphToDisp(g.mph || 0) * 10) / 10)} ${app.spUnit()}`);
  if (f.includes("level")) out.push(`level ${g.level || 1}`);
  if (f.includes("incline")) out.push(`${app.fmtNum(g.incline || 0)}%`);
  return out.join(" / ");
}
app.segText = segText;

function sessionSummary(s) {
  const segs = s.segments.length > 1 ? `${s.segments.length} changes` : app.segText(s.machine, s.segments[0] || {});
  return `${Math.round(app.sessionMin(s))} min · ${segs}`;
}
app.sessionSummary = sessionSummary;

function weekCardio() {
  const mon = app.mondayOf(app.today()), end = app.addDays(mon, 6);
  const list = app.cardio().sessions.filter((s) => s.date >= mon && s.date <= end);
  return { list, min: list.reduce((n, s) => n + app.sessionMin(s), 0), kcal: list.reduce((n, s) => n + (s.kcal || 0), 0) };
}
app.weekCardio = weekCardio;

function cardioToday() { return app.cardio().sessions.filter((s) => s.date === app.today()).reduce((n, s) => n + (s.kcal || 0), 0); }
app.cardioToday = cardioToday;

/* ---------- Live session ---------- */
function liveElapsedMs(L) {
  if (!L) return 0;
  const now = L.pausedAt || Date.now();
  return now - L.startedAt - (L.pausedMs || 0);
}
app.liveElapsedMs = liveElapsedMs;

function liveSegments(L) {
  const total = app.liveElapsedMs(L) / 60000;
  return L.segments.map((g, i) => {
    const end = i + 1 < L.segments.length ? L.segments[i + 1].at : total;
    return { ...g, min: Math.max(0, end - g.at) };
  });
}
app.liveSegments = liveSegments;

function startLive(machine, seg) {
  const c = app.cardio();
  c.live = { id: app.cid(), machine, startedAt: Date.now(), pausedMs: 0, pausedAt: null, segments: [{ ...seg, at: 0 }] };
  app.cardioTouch(); app.ui.cardioOpen = true; app.ui.sheet = null; app.render();
}
app.startLive = startLive;

function finishLive() {
  const c = app.cardio(), L = c.live; if (!L) return null;
  const segs = app.liveSegments(L).filter((g) => g.min > 0.05).map(({ at, ...g }) => ({ ...g, min: Math.round(g.min * 10) / 10 }));
  c.live = null;
  if (!segs.length) { app.cardioTouch(); return null; }
  const s = { id: L.id, date: app.today(), machine: L.machine, segments: segs, startedAt: new Date(L.startedAt).toISOString(), finishedAt: new Date().toISOString(), src: "live" };
  s.kcal = Math.round(app.sessionKcal(s, app.bodyKg()));
  c.sessions.push(s); app.cardioTouch();
  return s;
}
app.finishLive = finishLive;

function cardioLiveHTML() {
  const L = app.cardio().live; if (!L) return "";
  const m = app.MACHINES[L.machine], segs = app.liveSegments(L), cur = L.segments[L.segments.length - 1];
  const kc = segs.reduce((n, g) => n + app.kcalPerMin(L.machine, g, app.bodyKg()) * g.min, 0);
  return `<div class="wo-top cl-top"><button class="icon-btn" data-action="cl-min" aria-label="Back to home">${app.I.chevD}</button>
      <div class="wo-title"><h2>${m.icon} ${m.short}</h2><span class="sub">${L.pausedAt ? "Paused" : "In progress"}</span></div>
      <div class="wo-actions"><button class="btn small cancel" data-action="cl-cancel">Cancel</button><button class="btn small primary" data-action="cl-finish">Finish</button></div></div>
    <div class="cl-body">
      <div class="cl-time" id="cl-time">${app.fmtClock(app.liveElapsedMs(L))}</div>
      <div class="cl-kcal"><b id="cl-kcal">${Math.round(kc)}</b> cal burned (estimate)</div>
      <div class="card cl-now"><span class="mini-l" style="margin:0">Right now</span><b>${app.segText(L.machine, cur)}</b>
        <button class="btn primary block" data-action="cl-change">Change ${m.fields.includes("speed") ? "speed / incline" : "level / incline"}</button></div>
      <button class="btn block" data-action="cl-pause">${L.pausedAt ? "Resume" : "Pause"}</button>
      ${segs.length > 1 ? `<div class="mini-l">Segments</div><div class="card">${segs.map((g, i) => `<div class="cl-seg"><span>${i + 1}</span><b>${app.segText(L.machine, g)}</b><em>${app.fmtClock(g.min * 60000)}</em></div>`).join("")}</div>` : ""}
    </div>`;
}
app.cardioLiveHTML = cardioLiveHTML;

function fmtClock(ms) { const t = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0"); }
app.fmtClock = fmtClock;

function renderCardioLive() {
  const el = app.$("#cardio-live"); if (!el) return;
  const on = !!(app.cardio().live && app.ui.cardioOpen);
  el.hidden = !on; document.body.classList.toggle("in-cardio", on);
  if (on) el.innerHTML = app.cardioLiveHTML();
}
app.renderCardioLive = renderCardioLive;

function tickCardio() {
  const L = app.state.cardio && app.state.cardio.live; if (!L) return;
  const t = app.$("#cl-time"); if (t) t.textContent = app.fmtClock(app.liveElapsedMs(L));
  const k = app.$("#cl-kcal"); if (k) k.textContent = Math.round(app.liveSegments(L).reduce((n, g) => n + app.kcalPerMin(L.machine, g, app.bodyKg()) * g.min, 0));
  const w = app.$("#cw-live"); if (w) w.textContent = app.fmtClock(app.liveElapsedMs(L));
}
app.tickCardio = tickCardio;

/* ---------- Home widget ---------- */
function cardioWidgetHTML() {
  const wk = app.weekCardio(), goal = app.cardio().goalMin, L = app.cardio().live;
  const C = 2 * Math.PI * 30, f = Math.min(1, wk.min / goal);
  const ring = `<button class="cw-ring" data-action="cardio-open" aria-label="Cardio: ${Math.round(wk.min)} of ${goal} minutes this week">
    <svg viewBox="0 0 76 76" aria-hidden="true"><circle cx="38" cy="38" r="30" class="cw-bg"/><circle cx="38" cy="38" r="30" class="cw-fg" stroke-dasharray="${C * f} ${C}" transform="rotate(-90 38 38)"/></svg>
    <span><b>${Math.round(wk.min)}</b><small>/ ${goal} min</small></span></button>`;
  const right = L ? `<div class="cw-right"><span class="cw-label">${app.MACHINES[L.machine].name}</span><b class="cw-live" id="cw-live">${app.fmtClock(app.liveElapsedMs(L))}</b>
      <button class="btn small primary" data-action="cl-open">Resume</button></div>`
    : `<div class="cw-right"><span class="cw-label">Cardio this week${wk.kcal ? ` · ${Math.round(wk.kcal)} cal` : ""}</span>
      <button class="cw-btn" data-action="cardio-open">Saved & recent ${app.I.chevR}</button>
      <button class="cw-btn new" data-action="cardio-new">+ New</button></div>`;
  return `<section class="sec"><div class="sec-h"><h3>Cardio</h3></div><div class="card cw">${ring}${right}</div></section>`;
}
app.cardioWidgetHTML = cardioWidgetHTML;

/* ---------- Cardio screen ---------- */
function recentCardio() {
  const seen = new Set(), out = [];
  [...app.cardio().sessions].sort((a, b) => (b.finishedAt || b.date).localeCompare(a.finishedAt || a.date)).forEach((s) => {
    const key = s.machine + "|" + s.segments.map((g) => [g.mph, g.level, g.incline, Math.round(g.min)].join(",")).join(";");
    if (!seen.has(key) && out.length < 8) { seen.add(key); out.push(s); }
  });
  return out;
}
app.recentCardio = recentCardio;

function cardioScreenHTML() {
  const wk = app.weekCardio(), c = app.cardio();
  const item = (s, kind) => `<div class="ca-row"><button class="ca-main" data-action="ca-start" data-kind="${kind}" data-id="${s.id}" aria-label="Start ${app.esc(s.name || app.MACHINES[s.machine].name)}">
      <span class="ca-ic">${app.MACHINES[s.machine].icon}</span><span><b>${app.esc(s.name || app.MACHINES[s.machine].name)}</b><em>${app.sessionSummary(s)}</em></span></button>
    <button class="ca-log" data-action="ca-logas" data-kind="${kind}" data-id="${s.id}">Log</button>
    <button class="ca-go" data-action="ca-start" data-kind="${kind}" data-id="${s.id}" aria-label="Start">▶</button></div>`;
  const recent = app.recentCardio();
  return `<div class="detail-top"><button class="icon-btn" data-action="tab" data-tab="home" aria-label="Back">${app.I.chevL}</button></div>
    <div class="page-head"><div><h1 class="page-title">Cardio</h1><div class="page-sub">${Math.round(wk.min)} of ${c.goalMin} min this week</div></div>
      <button class="link-inline" data-action="ca-goal">Goal</button></div>
    ${c.live ? `<div class="card"><h4>${app.MACHINES[c.live.machine].name} in progress</h4><button class="btn primary block" data-action="cl-open">Resume</button></div>` : ""}
    <div class="ca-actions"><button class="btn primary" data-action="cardio-new">+ New session</button><button class="btn" data-action="ca-logform">Log finished cardio</button></div>
    ${c.saved.length ? `<div class="mini-l">Saved</div><div class="card ca-card">${c.saved.map((s) => item(s, "saved")).join("")}</div>` : ""}
    ${recent.length ? `<div class="mini-l">Recent</div><div class="card ca-card">${recent.map((s) => item(s, "recent")).join("")}</div>` : `<div class="card"><p class="sub">Your cardio shows up here after your first session, so you can restart it with one tap.</p></div>`}
    ${wk.list.length ? `<div class="mini-l">This week</div><div class="card">${[...wk.list].reverse().map((s) => `<button class="ca-hist" data-action="ca-detail" data-id="${s.id}">
      <span>${app.fmtDate(s.date, { weekday: "short" })} · ${app.MACHINES[s.machine].name}</span><b>${Math.round(app.sessionMin(s))} min · ${s.kcal} cal</b></button>`).join("")}</div>` : ""}
    <p class="hint">Calories are estimates from your speed, incline or level and your bodyweight (${app.fmtW(app.kgToDisp(app.bodyKg()))}). Machine displays usually read higher. Cardio calories show on the Food tab but don't change your food target.</p>`;
}
app.cardioScreenHTML = cardioScreenHTML;

/* ---------- Sheets ---------- */
function machinePickerHTML(sel) {
  return `<div class="ma-grid">${Object.entries(app.MACHINES).map(([k, m]) => `<button class="ma" data-action="ma-pick" data-m="${k}" aria-pressed="${sel === k}"><span>${m.icon}</span>${m.short}</button>`).join("")}</div>`;
}
app.machinePickerHTML = machinePickerHTML;

function stepField(id, label, val, step, unit) {
  return `<div class="stepper"><label for="${id}">${label}</label><div class="step-row">
    <button data-action="cf-step" data-f="${id}" data-d="-${step}" aria-label="${label} down">−</button>
    <input id="${id}" inputmode="decimal" value="${val}" data-cf="${id}">
    <button data-action="cf-step" data-f="${id}" data-d="${step}" aria-label="${label} up">+</button></div>${unit ? `<span class="cf-u">${unit}</span>` : ""}</div>`;
}
app.stepField = stepField;

function segFieldsHTML(machine, g, prefix) {
  const f = app.MACHINES[machine].fields;
  return `<div class="steppers cf-grid">
    ${f.includes("speed") ? app.stepField(prefix + "sp", `Speed (${app.spUnit()})`, app.fmtNum(Math.round(app.mphToDisp(g.mph || 3) * 10) / 10), 0.1) : ""}
    ${f.includes("level") ? app.stepField(prefix + "lv", machine === "stair" ? "Speed level" : "Level", g.level || 8, 1) : ""}
    ${f.includes("incline") ? app.stepField(prefix + "in", "Incline (%)", app.fmtNum(g.incline != null ? g.incline : (machine === "treadmill" ? 12 : 0)), 0.5) : ""}
  </div>`;
}
app.segFieldsHTML = segFieldsHTML;

function readSeg(machine, prefix) {
  const v = (id) => parseFloat((app.$("#" + prefix + id) || {}).value);
  const f = app.MACHINES[machine].fields, g = {};
  if (f.includes("speed")) g.mph = Math.max(0, app.dispToMph(v("sp") || 0));
  if (f.includes("level")) g.level = Math.max(1, Math.min(20, Math.round(v("lv") || 1)));
  if (f.includes("incline")) g.incline = Math.max(0, Math.min(40, v("in") || 0));
  return g;
}
app.readSeg = readSeg;

function cardioNewSheetHTML() {
  const m = app.ui.sd.machine || "treadmill";
  return `<h3>New cardio session</h3>${app.machinePickerHTML(m)}
    <span class="field-label">Starting settings</span>${app.segFieldsHTML(m, app.ui.sd.seg || {}, "n-")}
    <button class="btn primary block" data-action="cn-start" style="margin-top:14px">Start timer</button>
    <p class="sub small">Tap "Change" during the session whenever you adjust the machine. Each change is logged separately.</p>`;
}
app.cardioNewSheetHTML = cardioNewSheetHTML;

function cardioChangeSheetHTML() {
  const L = app.cardio().live; if (!L) return "";
  return `<h3>Change settings</h3><p class="sub" style="margin:-6px 0 12px">A new segment starts now.</p>
    ${app.segFieldsHTML(L.machine, L.segments[L.segments.length - 1], "c-")}
    <button class="btn primary block" data-action="cc-apply" style="margin-top:14px">Apply</button>`;
}
app.cardioChangeSheetHTML = cardioChangeSheetHTML;

function cardioLogSheetHTML() {
  const m = app.ui.sd.machine || "treadmill", segs = app.ui.sd.segs && app.ui.sd.segs.length ? app.ui.sd.segs : [{ min: 30 }];
  app.ui.sd.segs = segs;
  const s = { machine: m, segments: segs };
  return `<h3>Log finished cardio</h3>${app.machinePickerHTML(m)}
    <label class="field-label" for="cl-date">Date</label><input class="text-in" id="cl-date" type="date" max="${app.today()}" value="${app.esc(app.ui.sd.date || app.today())}">
    ${segs.map((g, i) => `<div class="cl-segcard"><div class="cl-seghead"><b>${segs.length > 1 ? `Segment ${i + 1}` : "Session"}</b>${segs.length > 1 ? `<button class="set-x" data-action="cls-del" data-i="${i}" aria-label="Remove segment ${i + 1}">×</button>` : ""}</div>
      <div class="steppers cf-grid">${app.stepField(`l${i}-mn`, "Minutes", app.fmtNum(g.min || 0), 1)}</div>
      ${app.segFieldsHTML(m, g, `l${i}-`)}</div>`).join("")}
    <button class="link-btn" data-action="cls-add">+ Add a speed / incline change</button>
    <div class="fr-total"><b id="cls-kcal">${Math.round(app.sessionKcal(s, app.bodyKg()))} cal</b><span id="cls-min">${Math.round(app.sessionMin(s))} min total</span></div>
    <button class="btn primary block" data-action="cls-save">Save</button>`;
}
app.cardioLogSheetHTML = cardioLogSheetHTML;

function readLogSegs() {
  const m = app.ui.sd.machine || "treadmill";
  return (app.ui.sd.segs || []).map((_, i) => ({ min: Math.max(0, parseFloat((app.$(`#l${i}-mn`) || {}).value) || 0), ...app.readSeg(m, `l${i}-`) }));
}
app.readLogSegs = readLogSegs;

function cardioSummarySheetHTML() {
  const s = app.cardio().sessions.find((x) => x.id === app.ui.sd.id); if (!s) return "";
  return `<h3>${app.MACHINES[s.machine].icon} ${app.MACHINES[s.machine].name}</h3><p class="sub" style="margin:-6px 0 12px">${app.fmtDate(s.date, { weekday: "long", month: "short", day: "numeric" })}</p>
    <div class="stats"><div class="stat"><b>${Math.round(app.sessionMin(s))}<small> min</small></b><span>Time</span></div>
      <div class="stat"><b>${s.kcal}</b><span>Calories (estimate)</span></div></div>
    <div class="card">${s.segments.map((g, i) => `<div class="cl-seg"><span>${i + 1}</span><b>${app.segText(s.machine, g)}</b><em>${app.fmtNum(g.min)} min</em></div>`).join("")}</div>
    ${app.ui.sd.fresh ? `<label class="field-label" for="ca-name">Save it to start again with one tap (optional)</label>
      <div class="add-row" style="margin-top:0"><input id="ca-name" placeholder="e.g. Incline walk" autocomplete="off"><button data-action="ca-save">Save</button></div>` : ""}
    <div class="sheet-actions" style="margin-top:14px"><button class="btn danger" data-action="ca-del">Delete</button><button class="btn primary" data-action="sheet-close">Done</button></div>`;
}
app.cardioSummarySheetHTML = cardioSummarySheetHTML;

function cardioGoalSheetHTML() {
  const cur = app.cardio().goalMin;
  return `<h3>Weekly cardio goal</h3><p class="sub" style="margin:-6px 0 14px">Minutes of cardio per week (Monday to Sunday). 150 minutes of moderate cardio a week is a common health guideline.</p>
    <div class="seg7" style="grid-template-columns:repeat(4,1fr)">${[60, 90, 120, 150, 180, 240, 300, 360].map((n) => `<button data-action="ca-goal-set" data-n="${n}" aria-pressed="${cur === n}">${n}</button>`).join("")}</div>`;
}
app.cardioGoalSheetHTML = cardioGoalSheetHTML;

function updateLogTotals() {
  const s = { machine: app.ui.sd.machine || "treadmill", segments: app.readLogSegs() };
  const k = app.$("#cls-kcal"), m = app.$("#cls-min");
  if (k) k.textContent = Math.round(app.sessionKcal(s, app.bodyKg())) + " cal";
  if (m) m.textContent = Math.round(app.sessionMin(s)) + " min total";
}
app.updateLogTotals = updateLogTotals;

function mergeCardio(r) {
  if (!r) return;
  const c = app.cardio(), del = new Set([...(c.deleted || []), ...(r.deleted || [])]);
  const by = new Map(); [...(r.sessions || []), ...c.sessions].forEach((s) => { if (!del.has(s.id)) by.set(s.id, s); });
  const sv = new Map(); [...(r.saved || []), ...c.saved].forEach((s) => { if (!del.has(s.id)) sv.set(s.id, s); });
  const newer = (r.updatedAt || 0) > (c.updatedAt || 0);
  app.state.cardio = { sessions: [...by.values()], saved: [...sv.values()], deleted: [...del], goalMin: newer && r.goalMin ? r.goalMin : c.goalMin, live: c.live, updatedAt: Math.max(r.updatedAt || 0, c.updatedAt || 0) };
}
app.mergeCardio = mergeCardio;
