import { app } from "../runtime.js";
import { countedEntries, restoreSkipped, skipForToday, workingVolume } from "../shared/skip.js";

/* Logging a workout: suggestions, PRs, swaps. */
/* ================= At the gym: progression, PRs, summary, swap, tags ================= */
const isWork = (x) => x.tag !== "warmup";
app.isWork = isWork;

const workCount = (e) => e.sets.filter(app.isWork).length;
app.workCount = workCount;

const workSetCount = (s) => countedEntries(s).reduce((n, e) => n + app.workCount(e), 0);
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

/* Readiness and RPE sit on top of the usual progression.
   RPE from the last session is part of the normal plan. Today's readiness is a separate, dismissible layer. */
const roundW = (v) => Math.round(v * 100) / 100;
const MINUS = "−";

export function bestEpley(sets) {
  let best = null;
  for (const x of sets || []) {
    if (!x || x.tag === "warmup" || x.w == null || !(Number(x.r) > 0)) continue;
    const e = Number(x.w) * (1 + Number(x.r) / 30);
    if (!Number.isFinite(e)) continue;
    if (best == null || e > best) best = e;
  }
  return best;
}

export function summarizeReadiness(rows) {
  const high = [], low = [];
  for (const row of rows || []) {
    if (!row || row.perf == null || row.readiness == null) continue;
    const perf = Number(row.perf), r = Number(row.readiness);
    if (!Number.isFinite(perf) || !Number.isFinite(r)) continue;
    if (r >= 85) high.push(perf);
    else if (r < 70) low.push(perf);
  }
  const avg = (a) => (a.length ? a.reduce((s, n) => s + n, 0) / a.length : null);
  return { highN: high.length, lowN: low.length, highAvg: avg(high), lowAvg: avg(low) };
}

export function meanRpe(sets) {
  const rs = [];
  for (const x of sets || []) {
    if (!x || x.tag === "warmup") continue;
    const n = Number(x.rpe);
    if (Number.isInteger(n) && n >= 6 && n <= 10) rs.push(n);
  }
  if (!rs.length) return null;
  return rs.reduce((a, b) => a + b, 0) / rs.length;
}

export function applyRpe(plan, avgRpe) {
  const out = { w: plan.w, r: plan.r, kind: plan.kind };
  if (avgRpe == null || !Number.isFinite(Number(avgRpe))) return out;
  const avg = Number(avgRpe);
  const bw = plan.w == null;
  const inc = plan.inc || 0;
  if (avg <= 6) {
    if (bw) out.r = plan.r + 1;
    else if (inc) out.w = roundW(plan.w + inc);
    return out;
  }
  if (avg >= 10) {
    if (bw) out.r = Math.max(1, plan.r - 1);
    else if (inc) out.w = Math.max(inc, roundW(plan.w - inc));
    return out;
  }
  if (avg >= 9 && (plan.kind === "up" || plan.kind === "bw")) {
    if (bw) out.r = Math.max(1, plan.r - 1);
    else if (inc) out.w = Math.max(inc, roundW(plan.w - inc));
  }
  return out;
}

function weightPhrase(delta, unit) {
  const n = (Math.round(Math.abs(delta) * 100) / 100).toString();
  return delta < 0 ? `${MINUS}${n} ${unit}` : `+${n} ${unit}`;
}

/* Gentle defaults until this lift has at least three high and three low readiness days.
   High adds one increment (never on a deload). Low drops one set when there are three or more, otherwise one increment. */
export function readinessAdjust(base, readiness, history, unit) {
  const same = { w: base.w, r: base.r, sets: base.sets, ready: null, adjusted: false };
  if (readiness == null || !Number.isFinite(Number(readiness))) return same;
  const n = Math.round(Number(readiness));
  const bw = base.w == null;
  const inc = base.inc || 0;
  const hold = { ...same, ready: `Readiness ${n}, holding steady` };
  const enough = !!(history && history.highN >= 3 && history.lowN >= 3 && history.highAvg != null && history.lowAvg != null && history.highAvg > 0);
  const strongerHigh = enough && history.highAvg >= history.lowAvg * 1.02;
  const weakerLow = enough && history.lowAvg <= history.highAvg * 0.95;
  if (n >= 85) {
    if (base.kind === "down" || (enough && !strongerHigh)) return hold;
    if (bw) return { w: null, r: base.r + 1, sets: base.sets, ready: `Readiness ${n}, suggesting +1 rep`, adjusted: true };
    if (!inc) return hold;
    return { w: roundW(base.w + inc), r: base.r, sets: base.sets, ready: `Readiness ${n}, suggesting ${weightPhrase(inc, unit)}`, adjusted: true };
  }
  if (n >= 70) return hold;
  if (weakerLow) {
    if (bw) {
      const r = Math.max(1, base.r - 1);
      if (r === base.r) return hold;
      return { w: null, r, sets: base.sets, ready: `Readiness ${n}, suggesting ${MINUS}1 rep`, adjusted: true };
    }
    if (!inc) return hold;
    const w = Math.max(inc, roundW(base.w - inc));
    if (Math.abs(w - base.w) < 1e-6) return hold;
    return { w, r: base.r, sets: base.sets, ready: `Readiness ${n}, suggesting ${weightPhrase(-inc, unit)}`, adjusted: true };
  }
  if ((base.sets || 0) >= 3) {
    return { w: base.w, r: base.r, sets: base.sets - 1, ready: `Readiness ${n}, dropping a set today`, adjusted: true };
  }
  if (bw) {
    const r = Math.max(1, base.r - 1);
    if (r === base.r) return hold;
    return { w: null, r, sets: base.sets, ready: `Readiness ${n}, suggesting ${MINUS}1 rep`, adjusted: true };
  }
  if (!inc) return hold;
  const w = Math.max(inc, roundW(base.w - inc));
  if (Math.abs(w - base.w) < 1e-6) return hold;
  return { w, r: base.r, sets: base.sets, ready: `Readiness ${n}, suggesting ${weightPhrase(-inc, unit)}`, adjusted: true };
}

export function rpeNote(avg, kind) {
  if (avg == null || !Number.isFinite(Number(avg))) return "";
  const n = Number(avg);
  const shown = Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toString();
  if (n <= 6) return ` Last time felt easy (RPE ${shown}), so this adds a little more.`;
  if (n >= 10 && kind !== "up" && kind !== "bw") return ` Last time was a max effort (RPE ${shown}), so this backs off a little.`;
  if (n >= 9) return ` Last time was very hard (RPE ${shown}), so this holds here.`;
  return "";
}

export function quietReadinessNote(readiness) {
  if (readiness == null || !Number.isFinite(Number(readiness))) return "";
  const n = Math.round(Number(readiness));
  if (n < 70) return `Readiness ${n}. No history yet, so nothing is changed. Starting a little lighter is reasonable.`;
  if (n >= 85) return `Readiness ${n}. No history yet, so the usual plan stands.`;
  return "";
}

function displayKind(kind, w, lastW) {
  if (kind === "bw" || w == null) return "bw";
  if (lastW == null || !Number.isFinite(Number(lastW))) return kind;
  if (w > lastW + 1e-6) return "up";
  if (w < lastW - 1e-6) return "down";
  return "same";
}

export function applyTrainingAdjust(plan, opts = {}) {
  const avg = opts.avgRpe;
  const after = applyRpe(plan, avg);
  const changed = after.w !== plan.w || after.r !== plan.r;
  const why = (plan.why || "") + (changed ? rpeNote(avg, plan.kind) : "");
  const layer = readinessAdjust(
    { w: after.w, r: after.r, kind: plan.kind, sets: plan.sets, inc: plan.inc },
    opts.readiness, opts.history, opts.unit || "lb"
  );
  const picked = opts.dismissed
    ? { w: after.w, r: after.r, sets: plan.sets, ready: null, adjusted: false }
    : layer;
  return {
    w: picked.w, r: picked.r, sets: picked.sets,
    kind: displayKind(plan.kind, picked.w, opts.lastW),
    why, ready: picked.ready,
    adjusted: !opts.dismissed && !!layer.adjusted,
    plain: !!opts.dismissed,
    canReady: !!opts.dismissed && !!layer.adjusted,
    base: { w: after.w, r: after.r, sets: plan.sets },
  };
}

function todayReadinessScore() {
  if (!app.state || app.state.demo) return null;
  const o = app.state.oura && app.state.oura.days && app.state.oura.days[app.today()];
  if (!o || o.readiness == null || o.readiness === "") return null;
  const n = Number(o.readiness);
  return Number.isFinite(n) ? n : null;
}

function readinessRows(sessions, name) {
  const days = (app.state.oura && app.state.oura.days) || {};
  const rows = [];
  for (const s of sessions) {
    const e = countedEntries(s).find((x) => x.exercise === name);
    if (!e) continue;
    const perf = bestEpley(e.sets);
    const day = days[s.date];
    const readiness = day && day.readiness != null && day.readiness !== "" ? Number(day.readiness) : null;
    if (perf == null || readiness == null || !Number.isFinite(readiness)) continue;
    rows.push({ readiness, perf });
  }
  return rows;
}

/* "Same reps, add weight each time":
   hit the target reps on every working set at the top weight -> add weight; missed -> repeat; missed twice running -> step back ~10%.
   Then nudge from last session's RPE, then from today's readiness. */
function suggestion(name, sessionId) {
  const histS = app.finished().filter((s) => s.id !== sessionId);
  const hist = histS
    .map((s) => ({ s, e: countedEntries(s).find((e) => e.exercise === name) }))
    .filter((x) => x.e && x.e.sets.some(app.isWork));
  if (!hist.length) return null;
  const work = (e) => e.sets.filter(app.isWork);
  const last = work(hist[0].e);
  const cur = app.state.sessions.find((s) => s.id === sessionId);
  const dismissed = !!(cur && Array.isArray(cur.plain) && cur.plain.includes(name));
  const opts = {
    avgRpe: meanRpe(last),
    readiness: todayReadinessScore(),
    history: summarizeReadiness(readinessRows(histS, name)),
    unit: app.wUnit(),
    dismissed,
  };
  if (last.every((x) => x.w == null)) {
    const best = Math.max(...last.map((x) => x.r));
    return applyTrainingAdjust({
      w: null, r: best + 1, kind: "bw", sets: last.length, inc: 1,
      why: `Your best set last time was ${app.pl(best, "rep")}. Go for ${best + 1}.`,
    }, opts);
  }
  const top = (e) => { const ws = work(e).filter((x) => x.w != null); const m = Math.max(...ws.map((x) => x.w)); return { W: m, sets: ws.filter((x) => x.w === m) }; };
  const { W, sets } = top(hist[0].e);
  const T = app.modeHigh(hist.slice(0, 3).flatMap((x) => (work(x.e).some((y) => y.w != null) ? top(x.e).sets.map((y) => y.r) : [])));
  const inc = app.weightInc(W);
  opts.lastW = W;
  let plan;
  if (sets.every((x) => x.r >= T)) {
    plan = { w: W + inc, r: T, kind: "up", sets: last.length, inc, why: `You hit ${T} reps on every set at ${app.fmtNum(W)} last time.` };
  } else {
    let misses = 0;
    for (const x of hist) {
      if (!work(x.e).some((y) => y.w != null)) break;
      const t = top(x.e);
      if (t.W !== W || t.sets.every((y) => y.r >= T)) break;
      misses++;
    }
    if (misses >= 2) plan = { w: Math.max(inc, app.roundTo(W * 0.9, inc)), r: T, kind: "down", sets: last.length, inc, why: `${T} reps at ${app.fmtNum(W)} was missed two sessions running. A small step back lets you build up again.` };
    else plan = { w: W, r: T, kind: "same", sets: last.length, inc, why: `You didn't get ${T} reps on every set at ${app.fmtNum(W)} last time. Stay here until you do.` };
  }
  return applyTrainingAdjust(plan, opts);
}
app.suggestion = suggestion;

function suggestionHTML(sg, i) {
  if (!sg) return "";
  const label = { up: "Add weight", same: "Repeat", down: "Step back", bw: "Beat last time" }[sg.kind];
  const load = sg.w != null ? `${app.fmtNum(sg.w)} ${app.wUnit()}` : "BW";
  const sets = sg.sets ? ` · ${app.pl(sg.sets, "set")}` : "";
  const act = sg.adjusted
    ? `<button class="link-inline" data-action="sugg-plain" data-i="${i}">Use normal plan</button>`
    : (sg.canReady ? `<button class="link-inline" data-action="sugg-ready" data-i="${i}">Use readiness</button>` : "");
  return `<div class="sugg ${sg.kind}"><div class="sugg-top"><b>${label}: ${load} × ${sg.r}${sets}</b>
    <button class="link-inline" data-action="sugg-use" data-i="${i}">Use</button></div>
    <span>${app.esc(sg.why)}</span>
    ${sg.ready ? `<span class="sugg-ready">${app.esc(sg.ready)}</span>` : ""}
    ${act}</div>`;
}
app.suggestionHTML = suggestionHTML;

function readinessQuietHTML() {
  const text = quietReadinessNote(todayReadinessScore());
  return text ? `<p class="sugg-quiet">${app.esc(text)}</p>` : "";
}
app.readinessQuietHTML = readinessQuietHTML;

function rpeChipsHTML(action, pressed, i) {
  const chips = [6, 7, 8, 9, 10].map((n) =>
    `<button data-action="${action}" data-n="${n}"${i != null ? ` data-i="${i}"` : ""} aria-pressed="${pressed === n}" aria-label="RPE ${n}">${n}</button>`).join("");
  return `<div class="rpe" role="group" aria-label="How hard was this set"><span class="rpe-l">RPE</span>${chips}</div>
    <p class="rpe-hint">Optional. 6 means about 4 reps left, 10 means none left.</p>`;
}
app.rpeChipsHTML = rpeChipsHTML;

/* ---------- PRs (compared with every earlier working set of this lift) ---------- */
function prsFor(name, set, date) {
  if (!app.isWork(set)) return [];
  const prior = [];
  app.state.sessions.forEach((s) => countedEntries(s).forEach((e) => {
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
  sess.forEach((s) => countedEntries(s).forEach((e) => {
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
  return workingVolume(s);
}
app.volumeOf = volumeOf;

function summaryHTML(id) {
  const s = app.state.sessions.find((x) => x.id === id);
  if (!s) return "";
  const prev = app.finished().find((x) => x.id !== s.id && x.workoutId === s.workoutId && x.date <= s.date && x.startedAt < s.startedAt);
  const vol = app.volumeOf(s), pv = prev ? app.volumeOf(prev) : 0;
  const done = countedEntries(s);
  const prs = done.flatMap((e) => e.sets.filter((x) => x.pr && x.pr.length).map((x) => ({ name: e.exercise, x })));
  const fail = done.reduce((n, e) => n + e.sets.filter((x) => x.tag === "failure").length, 0);
  const muscles = [...new Set(done.filter((e) => app.workCount(e)).flatMap((e) => e.muscles))].map((m) => app.MUSCLES[m]).filter(Boolean);
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
    ${app.rpeChipsHTML("se-rpe", app.ui.sd.rpe || null)}
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

function openExerciseName(s) {
  return app.ui.open != null && app.liveExercises(s)[app.ui.open] ? app.liveExercises(s)[app.ui.open].name : null;
}

function retargetOpen(s, name) {
  if (!name) { app.ui.open = null; return; }
  const idx = app.liveExercises(s).findIndex((e) => e.name === name);
  app.ui.open = idx >= 0 ? idx : null;
}

function skipExerciseAt(i) {
  const s = app.activeSession(); if (!s) return;
  const e = app.liveExercises(s)[i]; if (!e) return;
  const openName = openExerciseName(s);
  const had = !!((s.entries || []).find((x) => x.exercise === e.name && x.sets && x.sets.length));
  skipForToday(s, e);
  app.ui.exMenu = null;
  delete app.ui.drafts[e.name];
  retargetOpen(s, openName);
  if (had) app.recomputePRs(e.name);
  app.save();
  app.renderWorkout();
  if (app.tick) app.tick();
  app.toast(`Skipped ${e.name} for today`, () => {
    if (s.finishedAt) return;
    const back = restoreSkipped(s, e.name);
    if (!back) return;
    delete app.ui.drafts[e.name];
    retargetOpen(s, openName);
    if (had) app.recomputePRs(e.name);
    app.save();
    app.renderWorkout();
    if (app.tick) app.tick();
  });
}
app.skipExerciseAt = skipExerciseAt;

function restoreSkippedName(name) {
  const s = app.activeSession(); if (!s || !name) return;
  const openName = openExerciseName(s);
  const rec = restoreSkipped(s, name);
  if (!rec) return;
  app.ui.exMenu = null;
  delete app.ui.drafts[rec.name];
  retargetOpen(s, openName);
  if (rec.entry) app.recomputePRs(rec.name);
  app.save();
  app.renderWorkout();
  if (app.tick) app.tick();
  app.toast(`Restored ${rec.name}`, () => {
    if (s.finishedAt) return;
    skipForToday(s, rec);
    delete app.ui.drafts[rec.name];
    retargetOpen(s, openName);
    if (rec.entry) app.recomputePRs(rec.name);
    app.save();
    app.renderWorkout();
    if (app.tick) app.tick();
  });
}
app.restoreSkippedName = restoreSkippedName;
