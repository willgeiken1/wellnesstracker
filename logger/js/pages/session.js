import { app } from "../runtime.js";

/* Logging a workout: suggestions, PRs, swaps. */
/* ================= At the gym: progression, PRs, summary, swap, tags ================= */
const isWork = (x) => x.tag !== "warmup";
app.isWork = isWork;

const workCount = (e) => e.sets.filter(app.isWork).length;
app.workCount = workCount;

const workSetCount = (s) => s.entries.reduce((n, e) => n + app.workCount(e), 0);
app.workSetCount = workSetCount;

function weightInc(w) { return app.units() === "metric" ? (w <= 20 ? 1.25 : 2.5) : (w <= 40 ? 2.5 : 5); }
app.weightInc = weightInc;

const roundTo = (v, inc) => Math.round(v / inc) * inc;
app.roundTo = roundTo;

function modeHigh(nums) {
  const c = {}; nums.forEach((n) => c[n] = (c[n] || 0) + 1);
  return Number(Object.keys(c).sort((a, b) => c[b] - c[a] || b - a)[0]);
}
app.modeHigh = modeHigh;

/* "Same reps, add weight each time":
   hit the target reps on every working set at the top weight -> add weight; missed -> repeat; missed twice running -> step back ~10%. */
function suggestion(name, sessionId) {
  const hist = app.finished().filter((s) => s.id !== sessionId)
    .map((s) => s.entries.find((e) => e.exercise === name)).filter((e) => e && e.sets.some(app.isWork));
  if (!hist.length) return null;
  const work = (e) => e.sets.filter(app.isWork);
  const last = work(hist[0]);
  if (last.every((x) => x.w == null)) {
    const best = Math.max(...last.map((x) => x.r));
    return { w: null, r: best + 1, kind: "bw", why: `Your best set last time was ${app.pl(best, "rep")}. Go for ${best + 1}.` };
  }
  const top = (e) => { const ws = work(e).filter((x) => x.w != null); const m = Math.max(...ws.map((x) => x.w)); return { W: m, sets: ws.filter((x) => x.w === m) }; };
  const { W, sets } = top(hist[0]);
  const T = app.modeHigh(hist.slice(0, 3).flatMap((e) => (work(e).some((x) => x.w != null) ? top(e).sets.map((x) => x.r) : [])));
  const inc = app.weightInc(W);
  if (sets.every((x) => x.r >= T)) {
    const out = { w: W + inc, r: T, kind: "up", why: `You hit ${T} reps on every set at ${app.fmtNum(W)} last time.` };
    const o = app.state.oura && app.state.oura.days && app.state.oura.days[app.today()];
    if (!app.state.demo && o && o.readiness != null && o.readiness < 70) out.note = `Readiness is ${o.readiness} today, so repeating ${app.fmtNum(W)} is a fine call too.`;
    return out;
  }
  let misses = 0;
  for (const e of hist) {
    if (!work(e).some((x) => x.w != null)) break;
    const t = top(e);
    if (t.W !== W || t.sets.every((x) => x.r >= T)) break;
    misses++;
  }
  if (misses >= 2) return { w: Math.max(inc, app.roundTo(W * 0.9, inc)), r: T, kind: "down", why: `${T} reps at ${app.fmtNum(W)} was missed two sessions running. A small step back lets you build up again.` };
  return { w: W, r: T, kind: "same", why: `You didn't get ${T} reps on every set at ${app.fmtNum(W)} last time. Stay here until you do.` };
}
app.suggestion = suggestion;

function suggestionHTML(sg, i) {
  if (!sg) return "";
  const label = { up: "Add weight", same: "Repeat", down: "Step back", bw: "Beat last time" }[sg.kind];
  return `<div class="sugg ${sg.kind}"><div class="sugg-top"><b>${label}: ${sg.w != null ? app.fmtNum(sg.w) + " " + app.wUnit() : "BW"} × ${sg.r}</b>
    <button class="link-inline" data-action="sugg-use" data-i="${i}">Use</button></div>
    <span>${sg.why}${sg.note ? " " + sg.note : ""}</span></div>`;
}
app.suggestionHTML = suggestionHTML;

/* ---------- PRs (compared with every earlier working set of this lift) ---------- */
function prsFor(name, set, date) {
  if (!app.isWork(set)) return [];
  const prior = [];
  app.state.sessions.forEach((s) => s.entries.forEach((e) => {
    if (e.exercise === name) e.sets.forEach((x) => { if (x !== set && app.isWork(x)) prior.push({ x, date: s.date }); });
  }));
  if (!prior.length) return [];                       // first time doing a lift isn't a PR
  const out = [];
  if (set.w != null) {
    const pw = prior.filter((p) => p.x.w != null);
    if (pw.length && set.w > Math.max(...pw.map((p) => p.x.w))) out.push("heavy");
    const same = pw.filter((p) => p.x.w === set.w);
    if (same.length && set.r > Math.max(...same.map((p) => p.x.r))) out.push("reps");
  } else {
    const pb = prior.filter((p) => p.x.w == null);
    if (pb.length && set.r > Math.max(...pb.map((p) => p.x.r))) out.push("reps");
  }
  const v = app.estOn(set, date), pv = prior.map((p) => app.estOn(p.x, p.date)).filter((n) => n != null);
  if (v != null && pv.length && v > Math.max(...pv)) out.push("e1");
  return out;
}
app.prsFor = prsFor;

function recomputePRs(name) {
  const sess = [...app.state.sessions].sort((a, b) => a.date.localeCompare(b.date) || String(a.startedAt).localeCompare(String(b.startedAt)));
  let any = false, maxW = null, maxBw = null, maxE = null; const repsAt = {};
  sess.forEach((s) => s.entries.forEach((e) => {
    if (e.exercise !== name) return;
    e.sets.forEach((x) => {
      if (!app.isWork(x)) { delete x.pr; return; }
      const out = [], v = app.estOn(x, s.date);
      if (any) {
        if (x.w != null) { if (maxW != null && x.w > maxW) out.push("heavy"); const k = String(x.w); if (repsAt[k] != null && x.r > repsAt[k]) out.push("reps"); }
        else if (maxBw != null && x.r > maxBw) out.push("reps");
        if (v != null && maxE != null && v > maxE) out.push("e1");
      }
      if (out.length) x.pr = out; else delete x.pr;
      any = true;
      if (x.w != null) { maxW = maxW == null ? x.w : Math.max(maxW, x.w); const k = String(x.w); repsAt[k] = Math.max(repsAt[k] || 0, x.r); }
      else maxBw = maxBw == null ? x.r : Math.max(maxBw, x.r);
      if (v != null) maxE = maxE == null ? v : Math.max(maxE, v);
    });
  }));
}
app.recomputePRs = recomputePRs;

const PR_NAMES = { heavy: "heaviest weight", reps: "most reps", e1: "best est. 1RM" };
app.PR_NAMES = PR_NAMES;

function prText(set) { return set.pr.map((k) => app.PR_NAMES[k]).join(" + "); }
app.prText = prText;

function celebrate(name, set) {
  const t = app.$("#toast");
  t.classList.add("pr");
  app.toast(`New PR: ${app.prText(set)} on ${name} (${app.fmtSet(set)})`);
  clearTimeout(app.celebrate.h);
  app.celebrate.h = setTimeout(() => t.classList.remove("pr"), 3200);
}
app.celebrate = celebrate;

/* ---------- Workout summary ---------- */
function volumeOf(s) {
  return s.entries.reduce((v, e) => v + e.sets.filter(app.isWork).reduce((a, x) => a + app.setVolume(x), 0), 0);
}
app.volumeOf = volumeOf;

function summaryHTML(id) {
  const s = app.state.sessions.find((x) => x.id === id);
  if (!s) return "";
  const prev = app.finished().find((x) => x.id !== s.id && x.workoutId === s.workoutId && x.date <= s.date && x.startedAt < s.startedAt);
  const vol = app.volumeOf(s), pv = prev ? app.volumeOf(prev) : 0;
  const prs = s.entries.flatMap((e) => e.sets.filter((x) => x.pr && x.pr.length).map((x) => ({ name: e.exercise, x })));
  const fail = s.entries.reduce((n, e) => n + e.sets.filter((x) => x.tag === "failure").length, 0);
  const muscles = [...new Set(s.entries.filter((e) => app.workCount(e)).flatMap((e) => e.muscles))].map((m) => app.MUSCLES[m]).filter(Boolean);
  const dur = s.startedAt && s.finishedAt ? app.fmtDur(new Date(s.finishedAt) - new Date(s.startedAt)) : "–";
  const fmtVol = (v) => v >= 10000 ? (v / 1000).toFixed(1) + "k" : Math.round(v).toLocaleString();
  return `<h3>${app.esc(s.name)} done${prs.length ? " 🏆" : ""}</h3>
    <p class="sub" style="margin:-6px 0 14px">${app.fmtDate(s.date, { weekday: "long", month: "short", day: "numeric" })}</p>
    <div class="stats">
      <div class="stat"><b>${dur}</b><span>Duration</span></div>
      <div class="stat"><b>${app.workSetCount(s)}</b><span>Working sets</span></div>
      <div class="stat"><b>${fmtVol(vol)}<small> ${app.wUnit()}</small></b><span>Volume${pv ? ` · ${app.signed((vol / pv - 1) * 100, 0)}% vs last ${app.esc(s.name)}` : ""}</span></div>
      <div class="stat"><b>${prs.length}</b><span>${prs.length === 1 ? "PR" : "PRs"}${fail ? ` · ${fail} to failure` : ""}</span></div>
    </div>
    ${prs.length ? `<div class="mini-l">Personal records</div><ul class="wi-list">${prs.map((p) =>
      `<li class="pr-li"><span>${app.esc(p.name)}</span><b>${app.fmtSet(p.x)}</b><small>${app.prText(p.x)}</small></li>`).join("")}</ul>` : ""}
    ${muscles.length ? `<p class="sub small">Worked: ${muscles.join(", ")}</p>` : ""}
    <p class="sub small">Volume is weight × reps across working sets. Warm-ups and bodyweight sets aren't included.</p>
    <button class="btn primary block" data-action="sheet-close" style="margin-top:14px">Done</button>`;
}
app.summaryHTML = summaryHTML;

/* ---------- Exercise swap ---------- */
function findSetTarget(t) {
  const s = app.state.sessions.find((x) => x.id === t.sid), e = s && s.entries.find((x) => x.exercise === t.ex), x = e && e.sets[t.j];
  return x ? { s, e, x } : null;
}
app.findSetTarget = findSetTarget;

function seSteppers(wid, rid, x) {
  return `<div class="steppers">
      <div class="stepper"><label for="${wid}">Weight (${app.wUnit()})</label><div class="step-row">
        <button data-action="se-step" data-f="${wid}" data-d="-${app.wStep()}" aria-label="Weight minus ${app.wStep()}">−</button>
        <input id="${wid}" inputmode="decimal" autocomplete="off" placeholder="${app.canBW(app.ui.sd.ex) ? "BW" : "0"}" value="${x.w == null ? "" : app.fmtNum(x.w)}">
        <button data-action="se-step" data-f="${wid}" data-d="${app.wStep()}" aria-label="Weight plus ${app.wStep()}">+</button></div></div>
      <div class="stepper"><label for="${rid}">Reps</label><div class="step-row">
        <button data-action="se-step" data-f="${rid}" data-d="-1" aria-label="Reps minus 1">−</button>
        <input id="${rid}" inputmode="numeric" autocomplete="off" value="${x.r}">
        <button data-action="se-step" data-f="${rid}" data-d="1" aria-label="Reps plus 1">+</button></div></div></div>`;
}
app.seSteppers = seSteppers;

function setEditSheetHTML() {
  const t = app.findSetTarget(app.ui.sd); if (!t) return "";
  const { s, e, x } = t, tag = app.ui.sd.tag;
  const n = e.sets.slice(0, app.ui.sd.j + 1).filter(app.isWork).length;
  return `<h3>Edit set</h3><p class="sub" style="margin:-6px 0 14px">${app.esc(e.exercise)} · ${x.tag === "warmup" ? "warm-up" : "set " + n} · ${app.fmtDate(s.date)}</p>
    ${x.uni ? `<div class="side-l">Left</div>${app.seSteppers("se-w", "se-r", x.uni.l)}<div class="side-l">Right</div>${app.seSteppers("se-wR", "se-rR", x.uni.r)}` : `<div class="steppers">
      <div class="stepper"><label for="se-w">Weight (${app.wUnit()})</label><div class="step-row">
        <button data-action="se-step" data-f="se-w" data-d="-${app.wStep()}" aria-label="Weight minus ${app.wStep()}">−</button>
        <input id="se-w" inputmode="decimal" autocomplete="off" placeholder="${app.canBW(e.exercise) ? "BW" : "0"}" value="${x.w == null ? "" : app.fmtNum(x.w)}">
        <button data-action="se-step" data-f="se-w" data-d="${app.wStep()}" aria-label="Weight plus ${app.wStep()}">+</button></div></div>
      <div class="stepper"><label for="se-r">Reps</label><div class="step-row">
        <button data-action="se-step" data-f="se-r" data-d="-1" aria-label="Reps minus 1">−</button>
        <input id="se-r" inputmode="numeric" autocomplete="off" value="${x.r}">
        <button data-action="se-step" data-f="se-r" data-d="1" aria-label="Reps plus 1">+</button></div></div></div>`}
    <input class="note" id="se-note" autocomplete="off" placeholder="Note (optional)" value="${app.esc(x.note || "")}">
    <div class="tags" role="group" aria-label="Set type">
      <button data-action="se-tag" data-t="warmup" aria-pressed="${tag === "warmup"}">Warm-up</button>
      <button data-action="se-tag" data-t="failure" aria-pressed="${tag === "failure"}">To failure</button></div>
    <div class="sheet-actions" style="margin-top:14px"><button class="btn danger" data-action="se-del">Delete</button><button class="btn primary" data-action="se-save">Save</button></div>`;
}
app.setEditSheetHTML = setEditSheetHTML;

function swapSheetHTML() {
  const s = app.activeSession(); if (!s) return "";
  const cur = app.liveExercises(s)[app.ui.sd.i]; if (!cur) return "";
  const w = app.workoutById(s.workoutId);
  const inList = new Set(app.liveExercises(s).map((e) => e.name.toLowerCase()));
  return `<h3>Swap ${app.esc(cur.name)}</h3>
    <label class="swap-keep"><input type="checkbox" id="swap-routine" ${app.ui.sd.routine ? "checked" : ""}> Also change it in my ${app.esc(w ? w.name : "")} routine</label>
    <input class="text-in" id="pick-q" type="search" autocomplete="off" placeholder="Search ${app.ASSETS.bank.length} exercises" value="${app.esc(app.ui.sd.q || "")}">
    <div id="pk-body">${app.bankListHTML({ q: app.ui.sd.q, action: "swap-pick", open: app.ui.sd.open, similar: app.advOf(cur), exclude: inList, customHint: "Type it below to use it anyway." })}</div>
    <div class="add-row"><input id="swap-new" placeholder="Or type a new exercise" autocomplete="off"><button data-action="swap-new">Use</button></div>
    <p class="sub small">The swapped exercise keeps its own history and PRs.</p>`;
}
app.swapSheetHTML = swapSheetHTML;

function applySwap(newName) {
  const s = app.activeSession(); if (!s || !newName) return;
  const cur = app.liveExercises(s)[app.ui.sd.i]; if (!cur || newName === cur.name) return;
  const routine = !!app.ui.sd.routine;
  const ex = app.exObjFrom(newName);
  const known = ex ? ex.muscles : app.lookupMuscles(newName, app.state.workouts);
  const muscles = known.length ? known : [...cur.muscles];
  const adv = ex && ex.adv ? ex.adv : (!known.length ? cur.adv : undefined);
  const w = app.workoutById(s.workoutId);
  if (routine && w) {
    const k = w.exercises.findIndex((e) => e.name === cur.original || e.name === cur.name);
    if (k >= 0) w.exercises[k] = { name: newName, muscles, ...(adv ? { adv } : {}) };
    if (s.swaps && cur.original) delete s.swaps[cur.original];
  } else {
    s.swaps = s.swaps || {};
    s.swaps[cur.original || cur.name] = { name: newName, muscles, ...(adv ? { adv } : {}) };
  }
  app.ui.sheet = null; app.ui.open = app.ui.sd.i; s.mod = Date.now();
  app.save(); app.render();
  app.toast(`Swapped to ${newName}${routine ? ` (routine updated)` : " for this workout"}.`);
}
app.applySwap = applySwap;
