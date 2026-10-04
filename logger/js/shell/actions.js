import { app } from "../runtime.js";

/* Clicks, typing, and the rest of the event wiring. */
/* ================= Actions ================= */
let toastUndo = null;
app.toastUndo = toastUndo;

function toast(msg, undo) {
  const t = app.$("#toast");
  app.toastUndo = undo || null;
  t.innerHTML = `<span>${app.esc(msg)}</span>${undo ? `<button data-action="toast-undo">Undo</button>` : ""}`;
  t.hidden = false;
  clearTimeout(app.toast.h); app.toast.h = setTimeout(() => { t.hidden = true; app.toastUndo = null; }, undo ? 5000 : 2600);
}
app.toast = toast;

/* In-app dialogs. iOS can block the browser's built-in confirm() and prompt() in Home Screen apps. */
let dlgResolve = null;
app.dlgResolve = dlgResolve;

function ask({ title, body = "", ok = "OK", cancel = "Cancel", danger = false, input = null }) {
  const el = app.$("#dialog");
  el.innerHTML = `<div class="dlg" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t">
    <h3 id="dlg-t">${app.esc(title)}</h3>${body ? `<p>${app.esc(body)}</p>` : ""}
    ${input != null ? `<input class="text-in" id="dlg-in" autocomplete="off" value="${app.esc(input)}">` : ""}
    <div class="dlg-actions"><button class="btn" data-action="dlg-cancel">${app.esc(cancel)}</button>
    <button class="btn ${danger ? "danger-fill" : "primary"}" data-action="dlg-ok">${app.esc(ok)}</button></div></div>`;
  el.hidden = false;
  const inp = app.$("#dlg-in");
  if (inp) setTimeout(() => { inp.focus(); inp.select(); }, 50);
  return new Promise((res) => { app.dlgResolve = res; });
}
app.ask = ask;

function closeDialog(ok) {
  const inp = app.$("#dlg-in");
  const val = inp ? inp.value.trim() : true;
  app.$("#dialog").hidden = true; app.$("#dialog").innerHTML = "";
  const r = app.dlgResolve; app.dlgResolve = null;
  if (r) r(ok ? (inp ? (val || null) : true) : (inp ? null : false));
}
app.closeDialog = closeDialog;

async function startWorkout(id) {
  const w = app.workoutById(id);
  if (!w) return;
  const cur = app.activeSession();
  if (cur) {
    if (cur.workoutId === id) { app.openWorkout(); return; }
    if (!(await app.ask({ title: `${cur.name} is still in progress`, body: `Finish it and start ${w.name}?`, ok: "Finish and start" }))) return;
    app.finishSession(cur, true);
  }
  app.state.sessions.push({ id: app.uid(), date: app.today(), workoutId: w.id, name: w.name, startedAt: new Date().toISOString(), finishedAt: null, entries: [] });
  app.ui.drafts = {}; app.ui.open = 0;
  app.save(); app.openWorkout();
}
app.startWorkout = startWorkout;

function openWorkout() { app.ui.workoutOpen = true; app.ui.sheet = null; app.render(); app.$("#workout").scrollTop = 0; }
app.openWorkout = openWorkout;

function finishSession(s, quiet) {
  if (!app.setCount(s)) {
    app.state.sessions = app.state.sessions.filter((x) => x !== s);
    app.state.deleted = [...(app.state.deleted || []), s.id];
    if (!quiet) app.toast("Workout discarded. No sets were logged.");
  } else {
    if (s.plain) delete s.plain;
    s.finishedAt = new Date().toISOString(); s.mod = Date.now();
    if (app.capture) app.capture("workout_logged");
    if (!quiet) { app.ui.sheet = "summary"; app.ui.sd = { id: s.id }; }
  }
  app.stopTimer(); app.ui.workoutOpen = false; app.ui.open = null; app.ui.drafts = {};
  app.save();
}
app.finishSession = finishSession;

function stepPair(i, d, wf, rf, bw) {
  return `<div class="steppers">
        <div class="stepper"><label for="${wf}-${i}">Weight (${app.wUnit()})</label><div class="step-row">
          <button data-action="step" data-field="${wf}" data-d="-${app.wStep()}" data-i="${i}" aria-label="Weight minus ${app.wStep()}">−</button>
          <input id="${wf}-${i}" data-field="${wf}" data-i="${i}" inputmode="decimal" autocomplete="off" placeholder="${bw ? "BW" : "0"}" value="${app.esc(d[wf] || "")}">
          <button data-action="step" data-field="${wf}" data-d="${app.wStep()}" data-i="${i}" aria-label="Weight plus ${app.wStep()}">+</button></div></div>
        <div class="stepper"><label for="${rf}-${i}">Reps</label><div class="step-row">
          <button data-action="step" data-field="${rf}" data-d="-1" data-i="${i}" aria-label="Reps minus 1">−</button>
          <input id="${rf}-${i}" data-field="${rf}" data-i="${i}" inputmode="numeric" autocomplete="off" placeholder="0" value="${app.esc(d[rf] || "")}">
          <button data-action="step" data-field="${rf}" data-d="1" data-i="${i}" aria-label="Reps plus 1">+</button></div></div>
      </div>`;
}
app.stepPair = stepPair;

function logSet(i) {
  const s = app.activeSession(); if (!s) return;
  const e = app.liveExercises(s)[i];
  const d = app.draftFor(s, e.name), uni = app.isUni(e.name), bw = app.canBW(e.name);
  const side = (wv, rv, label) => {
    const wRaw = String(wv == null ? "" : wv).trim(), w = wRaw === "" ? null : parseFloat(wRaw), r = parseInt(rv, 10);
    if (wRaw === "" && !bw) { app.toast(`Enter the ${label ? label.toLowerCase() : ""}weight.`); return null; }
    if (wRaw !== "" && (isNaN(w) || w < 0)) { app.toast(`${label}weight needs to be a number. Leave it blank for bodyweight.`); return null; }
    if (!r || r < 1) { app.toast(`Enter ${label ? label.toLowerCase() : "your "}reps first.`); return null; }
    return { w, r };
  };
  const L = side(d.w, d.r, uni ? "Left " : ""); if (!L) return;
  let base = L;
  if (uni) { const Rr = side(d.wR, d.rR, "Right "); if (!Rr) return; base = app.uniSet(L, Rr); }
  const w = base.w, r = base.r;
  let entry = s.entries.find((x) => x.exercise === e.name);
  if (!entry) { entry = { exercise: e.name, muscles: [...e.muscles], ...(e.adv ? { adv: [...e.adv] } : {}), sets: [] }; s.entries.push(entry); }
  entry.muscles = [...e.muscles];
  const set = { w, r, ...(base.uni ? { uni: base.uni } : {}), note: d.note.trim() || undefined, at: new Date().toISOString() };
  if (d.tag) set.tag = d.tag;
  if (Number.isInteger(d.rpe) && d.rpe >= 6 && d.rpe <= 10) set.rpe = d.rpe;
  entry.sets.push(set);
  s.mod = Date.now();
  const prs = app.prsFor(e.name, set, s.date);
  if (prs.length) set.pr = prs;
  delete app.ui.drafts[e.name];
  app.save(); app.startTimer(); app.renderWorkout(); app.tick();
  if (prs.length) app.celebrate(e.name, set);
}
app.logSet = logSet;

function deleteSet(i, j) {
  const s = app.activeSession(); if (!s) return;
  const e = app.liveExercises(s)[i];
  const entry = s.entries.find((x) => x.exercise === e.name);
  if (!entry || !entry.sets[j]) return;
  const [removed] = entry.sets.splice(j, 1);
  s.mod = Date.now();
  const entryIndex = s.entries.indexOf(entry);
  if (!entry.sets.length) s.entries = s.entries.filter((x) => x !== entry);
  delete app.ui.drafts[e.name];
  app.save(); app.renderWorkout(); app.tick();
  app.toast(`Removed ${app.fmtSet(removed)} from ${e.name}`, () => {
    if (!s.entries.includes(entry)) s.entries.splice(entryIndex, 0, entry);
    entry.sets.splice(j, 0, removed);
    s.mod = Date.now();
    delete app.ui.drafts[e.name];
    app.save(); app.renderWorkout(); app.tick();
  });
}
app.deleteSet = deleteSet;

async function exportData() {
  const data = JSON.stringify({ app: "liftlog", version: 2, exportedAt: new Date().toISOString(),
    restSeconds: app.state.restSeconds, workouts: app.state.workouts, plan: app.state.plan, sessions: app.state.sessions, oura: app.state.oura }, null, 2);
  const name = `workouts-${app.today()}.json`;
  const file = new File([data], name, { type: "application/json" });
  let shared = false;
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); shared = true; }
    catch (e) { if (e.name === "AbortError") return; }
  }
  if (!shared) {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  app.state.lastExport = Date.now(); app.save(); app.render();
  app.toast("Backup exported.");
}
app.exportData = exportData;

app.$("#importFile").addEventListener("change", async (ev) => {
  const f = ev.target.files[0];
  ev.target.value = "";
  if (!f) return;
  try {
    const m = app.migrate(JSON.parse(await f.text()));
    if (!m) throw new Error("bad file");
    if (!(await app.ask({ title: "Restore this backup?", body: `Everything on this phone will be replaced with the backup's ${app.pl(m.sessions.length, "workout")}.`, ok: "Restore", danger: true }))) return;
    m.lastExport = app.state.lastExport;
    app.state = m; app.ui.drafts = {}; app.ui.open = null; app.ui.detail = null; app.ui.workoutOpen = false; app.applyTheme();
    app.save(); app.render(); app.toast("Backup restored.");
  } catch (e) { app.toast("That file isn't a Insight backup. Choose a workouts-….json file."); }
});

/* Drag to reorder exercises (Workouts tab) */
let drag = null;
app.drag = drag;

document.addEventListener("pointerdown", (ev) => {
  const h = ev.target.closest(".handle");
  if (!h) return;
  const li = h.closest(".erow");
  const rows = [...document.querySelectorAll("#elist .erow")];
  app.drag = { li, rows, from: rows.indexOf(li), to: rows.indexOf(li), startY: ev.clientY, step: li.offsetHeight + 8, id: ev.pointerId };
  li.classList.add("dragging");
  rows.forEach((r) => { if (r !== li) r.classList.add("shifting"); });
  try { h.setPointerCapture(ev.pointerId); } catch (e) {}
  ev.preventDefault();
});

document.addEventListener("pointermove", (ev) => {
  if (!app.drag || ev.pointerId !== app.drag.id) return;
  const n = app.drag.rows.length;
  const dy = Math.max(-app.drag.from * app.drag.step, Math.min((n - 1 - app.drag.from) * app.drag.step, ev.clientY - app.drag.startY));
  app.drag.li.style.transform = `translateY(${dy}px)`;
  app.drag.to = Math.max(0, Math.min(n - 1, app.drag.from + Math.round(dy / app.drag.step)));
  app.drag.rows.forEach((r, j) => {
    if (r === app.drag.li) return;
    let shift = 0;
    if (app.drag.from < app.drag.to && j > app.drag.from && j <= app.drag.to) shift = -app.drag.step;
    if (app.drag.from > app.drag.to && j < app.drag.from && j >= app.drag.to) shift = app.drag.step;
    r.style.transform = shift ? `translateY(${shift}px)` : "";
  });
});

function endDrag(ev) {
  if (!app.drag || ev.pointerId !== app.drag.id) return;
  const { from, to } = app.drag;
  app.drag = null;
  if (from !== to) {
    const w = app.workoutById(app.ui.detail);
    const [moved] = w.exercises.splice(from, 1);
    w.exercises.splice(to, 0, moved);
    app.save();
  }
  app.render();
}
app.endDrag = endDrag;

document.addEventListener("pointerup", app.endDrag);

document.addEventListener("pointercancel", app.endDrag);

document.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && (ev.target.id === "authPw" || ev.target.id === "authEmail")) { ev.preventDefault(); app.signIn(app.ui.sd.mode); }
  if (ev.key === "Enter" && ev.target.id === "dlg-in") { ev.preventDefault(); app.closeDialog(true); }
  if (ev.key === "Escape" && !app.$("#dialog").hidden) app.closeDialog(false);
});

let swipe = null;
app.swipe = swipe;

document.addEventListener("touchstart", (ev) => {
  if (app.ui.tab !== "food" || app.ui.fseg === "recent" || app.ui.sheet || ev.touches.length !== 1 || !ev.target.closest(".day-nav")) { app.swipe = null; return; }
  app.swipe = { x: ev.touches[0].clientX, y: ev.touches[0].clientY, t: Date.now() };
}, { passive: true });

document.addEventListener("touchend", (ev) => {
  if (!app.swipe) return;
  const dx = ev.changedTouches[0].clientX - app.swipe.x, dy = ev.changedTouches[0].clientY - app.swipe.y;
  const quick = Date.now() - app.swipe.t < 700;
  app.swipe = null;
  if (!quick || Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
  const cur = app.ui.foodDay || app.today(), next = app.addDays(cur, dx < 0 ? 1 : -1);
  if (next > app.today()) return;
  app.ui.foodDay = next === app.today() ? null : next;
  app.render();
  const el = app.$("#food-swipe"); if (el) { el.classList.remove("slide-l", "slide-r"); void el.offsetWidth; el.classList.add(dx < 0 ? "slide-l" : "slide-r"); }
}, { passive: true });

document.addEventListener("toggle", (ev) => {
  const d = ev.target; if (d.classList && d.classList.contains("pk-g") && d.open) { const g = d.querySelector("summary").dataset.g; if (g) app.ui.sd.open = g; }
}, true);

document.addEventListener("change", (ev) => {
  if (ev.target.id === "swap-routine" || ev.target.id === "add-routine") app.ui.sd.routine = ev.target.checked;
  if (ev.target.id === "ms-date" && app.ui.sheet === "meas-log") { app.ui.sd.date = ev.target.value || app.today(); app.renderSheet(); }
  if (ev.target.id === "avatar-file" && ev.target.files[0]) {
    app.squarePhoto(ev.target.files[0], 160).then((url) => { app.state.profile = app.state.profile || {}; app.state.profile.photo = url; app.state.profile.updatedAt = Date.now(); app.save(); app.render(); app.toast("Profile photo updated."); })
      .catch(() => app.toast("Couldn't read that photo. Try another one."));
  }
  if (ev.target.id === "ph-file") app.onPhotoFile(ev.target.files[0]);
  if (ev.target.id === "food-file" && ev.target.files[0]) { if (!app.ui.sd || !app.ui.sd.meal) app.ui.sd = { meal: app.autoMeal() }; app.ui.sd.image = null; app.ui.sd.hint = app.ui.sheet === "food-photo" ? app.ui.sd.hint : ""; app.analyzeFoodPhoto(ev.target.files[0]); }
  if (ev.target.id === "food-fav") app.ui.sd.fav = ev.target.checked;
});

document.addEventListener("input", (ev) => {
  const el = ev.target;
  if (el.id === "exName") { app.ui.sd.name = el.value; return; }
  if (el.id === "authEmail") { app.ui.sd.email = el.value; return; }
  if (el.dataset.fi != null && app.ui.sd.items) {
    const it = app.ui.sd.items[+el.dataset.fi], k = el.dataset.k;
    if (k === "name") it.name = el.value; else it.base[k] = (parseFloat(el.value) || 0) / (it.mult || 1);
    const t = app.reviewTotals(), tot = document.querySelector(".fr-total");
    if (tot) tot.innerHTML = `<b>${app.r0(t.kcal)} cal</b><span>P ${app.r0(t.p)} · C ${app.r0(t.c)} · F ${app.r0(t.f)}</span>`;
    return;
  }
  if (el.id === "ms-q") { app.ui.sd.q = el.value; const pos = el.selectionStart; app.renderSheet(); const n = app.$("#ms-q"); if (n) { n.focus(); n.setSelectionRange(pos, pos); } return; }
  if (el.id === "pick-q") { app.ui.sd.q = el.value; const pos = el.selectionStart; app.renderSheet(); const n = app.$("#pick-q"); if (n) { n.focus(); n.setSelectionRange(pos, pos); } return; }
  if (el.id === "food-rq") { app.ui.rq = el.value; const pos = el.selectionStart; app.render(); const n = app.$("#food-rq"); if (n) { n.focus(); n.setSelectionRange(pos, pos); } return; }
  if (el.id === "food-hint") { app.ui.sd.hint = el.value; return; }
  if (el.id === "food-describe") { app.ui.sd.text = el.value; return; }
  if (el.dataset.cf && app.ui.sheet === "cardio-log") { app.updateLogTotals(); return; }
  if (el.id === "food-q") { app.ui.sd.q = el.value; const pos = el.selectionStart; app.renderSheet(); const n = app.$("#food-q"); if (n) { n.focus(); n.setSelectionRange(pos, pos); } return; }
  if (el.id === "bc-amt") { app.ui.sd.amt = el.value; const pos = el.selectionStart; app.renderSheet(); const n = app.$("#bc-amt"); if (n) { n.focus(); n.setSelectionRange(pos, pos); } return; }
  if (el.dataset.pf) { app.ui.pf[el.dataset.pf] = el.value; return; }
  if (el.id === "wi-v") { app.ui.sd.v = el.value; return; }
  if (el.id === "wi-d") { app.ui.sd.d = el.value; return; }
  if (!el.dataset.field || el.dataset.i == null) return;
  const s = app.activeSession(); if (!s) return;
  const e = app.liveExercises(s)[+el.dataset.i];
  if (e) app.draftFor(s, e.name)[el.dataset.field] = el.value;
});

document.addEventListener("click", async (ev) => {
  const mus = ev.target.closest(".body .mus");
  if (mus) {
    const k = mus.dataset.m, t = app.today(), mon = app.mondayOf(t);
    const n = app.musclesBetween(mon, app.addDays(mon, 6)).get(k) || 0;
    app.toast(`${app.MUSCLES[k]}: ${n ? n + " set" + (n === 1 ? "" : "s") + " this week" : "not trained yet this week"}`);
    return;
  }
  const b = ev.target.closest("[data-action]");
  if (!b) return;
  const a = b.dataset.action;
  const i = b.dataset.i != null ? +b.dataset.i : null;
  if (app.needsLock && app.needsLock() && a.indexOf("lock-") !== 0) { ev.preventDefault(); return; }

  switch (a) {
    case "tab": app.goTab(b.dataset.tab); break;
    case "use-maint": app.applyRealMaintenance(); break;
    case "week": app.ui.weekOffset += +b.dataset.d; app.render(); break;
    case "plan": app.ui.sheet = "plan"; app.ui.sd = { date: b.dataset.date }; app.renderSheet(); break;
    case "set-plan":
      app.state.planAt = app.state.planAt || {};
      if (b.dataset.id) { app.state.plan[app.ui.sd.date] = b.dataset.id; app.state.planAt[app.ui.sd.date] = Date.now(); }
      else { delete app.state.plan[app.ui.sd.date]; delete app.state.planAt[app.ui.sd.date]; }
      app.save(); app.ui.sheet = null; app.render(); break;
    case "sheet-close": app.ui.sheet = null; app.renderSheet(); break;
    case "start": app.startWorkout(b.dataset.id); break;
    case "resume": app.openWorkout(); break;
    case "minimize": app.ui.workoutOpen = false; app.render(); break;
    case "finish": {
      const s = app.activeSession(); if (!s) break;
      const ok = app.setCount(s)
        ? await app.ask({ title: `Finish ${s.name}?`, body: `${app.pl(app.setCount(s), "set")} will be saved to your history.`, ok: "Finish" })
        : await app.ask({ title: "No sets logged", body: "There's nothing to save, so this workout will be discarded.", ok: "Discard", danger: true });
      if (!ok) break;
      app.finishSession(s, false); app.render(); break;
    }
    case "cancel-workout": {
      const s = app.activeSession(); if (!s) break;
      const n = app.setCount(s);
      const ok = await app.ask({ title: `Cancel ${s.name}?`, body: n ? `The ${app.pl(n, "set")} you logged in this workout will be deleted. This can't be undone.` : "Nothing has been logged yet.", ok: "Cancel workout", cancel: "Keep going", danger: true });
      if (!ok) break;
      app.state.sessions = app.state.sessions.filter((x) => x !== s);
      app.state.deleted = [...(app.state.deleted || []), s.id];
      app.stopTimer(); app.ui.workoutOpen = false; app.ui.open = null; app.ui.drafts = {};
      app.save(); app.render(); app.toast("Workout cancelled. Nothing was saved."); break;
    }
    case "dlg-ok": app.closeDialog(true); break;
    case "wseg": app.ui.wseg = b.dataset.seg; app.ui.detail = null; app.render(); break;
    case "range": app.ui.range = +b.dataset.r; app.render(); break;
    case "lift": app.ui.sheet = "lift"; app.ui.sd = { name: b.dataset.name }; app.renderSheet(); break;
    case "iseg": app.ui.iseg = b.dataset.s; app.render(); break;
    case "affects-more": app.ui.affectsAll = !app.ui.affectsAll; app.render(); break;
    case "open-affects": app.ui.iseg = "trends"; app.goTab("insights"); break;
    case "week-dismiss": app.dismissWeek(b.dataset.week); app.render(); break;
    case "week-open":
      app.ui.weekOpen = b.dataset.week;
      app.ui.iseg = "trends";
      if (app.ui.tab !== "insights") app.goTab("insights");
      else app.render();
      if (app.capture) app.capture("weekly_report_opened");
      break;
    case "week-back": app.ui.weekOpen = null; app.render(); break;
    case "install-app": { if (!app.installPrompt) break; const p = app.installPrompt; app.installPrompt = null; try { await p.prompt(); } catch (e) {} app.render(); break; }
    case "cardio-open": {
      const changed = app.ui.tab !== "cardio";
      app.ui.tab = "cardio"; app.ui.sheet = null; app.render(); window.scrollTo(0, 0);
      if (changed && app.noteTab) app.noteTab("cardio");
      break;
    }
    case "cardio-new": app.ui.sheet = "cardio-new"; app.ui.sd = { machine: (app.recentCardio()[0] || {}).machine || "treadmill" }; app.renderSheet(); break;
    case "ma-pick": if (app.ui.sheet === "cardio-log") { app.ui.sd.segs = app.readLogSegs(); app.ui.sd.date = (app.$("#cl-date") || {}).value; } app.ui.sd.machine = b.dataset.m; app.renderSheet(); break;
    case "cf-step": {
      const inp = document.getElementById(b.dataset.f); if (!inp) break;
      const step = +b.dataset.d, dec = String(Math.abs(step)).includes(".") ? 1 : 0;
      inp.value = app.fmtNum(Math.max(0, Math.round(((parseFloat(inp.value) || 0) + step) * 10 ** dec) / 10 ** dec));
      if (app.ui.sheet === "cardio-log") app.updateLogTotals();
      break;
    }
    case "cn-start": { const m = app.ui.sd.machine || "treadmill"; app.startLive(m, app.readSeg(m, "n-")); break; }
    case "cl-open": app.ui.cardioOpen = true; app.render(); break;
    case "cl-min": app.ui.cardioOpen = false; app.render(); break;
    case "cl-change": app.ui.sheet = "cardio-change"; app.ui.sd = {}; app.renderSheet(); break;
    case "cc-apply": {
      const L = app.cardio().live; if (!L) break;
      const g = app.readSeg(L.machine, "c-"); g.at = app.liveElapsedMs(L) / 60000;
      const last = L.segments[L.segments.length - 1];
      if (g.at - last.at < 0.05) L.segments[L.segments.length - 1] = { ...g, at: last.at }; else L.segments.push(g);
      app.cardioTouch(); app.ui.sheet = null; app.renderSheet(); app.renderCardioLive(); app.toast(`Now: ${app.segText(L.machine, g)}`); break;
    }
    case "cl-pause": { const L = app.cardio().live; if (!L) break; if (L.pausedAt) { L.pausedMs += Date.now() - L.pausedAt; L.pausedAt = null; } else L.pausedAt = Date.now(); app.cardioTouch(); app.renderCardioLive(); break; }
    case "cl-finish": {
      if (!(await app.ask({ title: "Finish cardio?", body: `${app.fmtClock(app.liveElapsedMs(app.cardio().live))} will be saved.`, ok: "Finish" }))) break;
      const sDone = app.finishLive(); app.ui.cardioOpen = false;
      if (sDone) { app.ui.sheet = "cardio-sum"; app.ui.sd = { id: sDone.id, fresh: true }; } else app.toast("Nothing to save. The session was under a few seconds.");
      app.render(); break;
    }
    case "cl-cancel": {
      if (!(await app.ask({ title: "Cancel this session?", body: "Nothing will be saved.", ok: "Cancel session", cancel: "Keep going", danger: true }))) break;
      app.cardio().live = null; app.cardioTouch(); app.ui.cardioOpen = false; app.render(); app.toast("Cardio session cancelled."); break;
    }
    case "ca-start": case "ca-logas": {
      const list = b.dataset.kind === "saved" ? app.cardio().saved : app.cardio().sessions, src = list.find((x) => x.id === b.dataset.id); if (!src) break;
      if (a === "ca-start") { const { min, ...g } = src.segments[0]; app.startLive(src.machine, g); }
      else { app.ui.sheet = "cardio-log"; app.ui.sd = { machine: src.machine, segs: src.segments.map((g) => ({ ...g })) }; app.renderSheet(); }
      break;
    }
    case "ca-logform": app.ui.sheet = "cardio-log"; app.ui.sd = { machine: (app.recentCardio()[0] || {}).machine || "treadmill", segs: [{ min: 30 }] }; app.renderSheet(); break;
    case "cls-add": { const segs = app.readLogSegs(); segs.push({ ...segs[segs.length - 1], min: 10 }); app.ui.sd.segs = segs; app.ui.sd.date = (app.$("#cl-date") || {}).value; app.renderSheet(); break; }
    case "cls-del": { const segs = app.readLogSegs(); segs.splice(i, 1); app.ui.sd.segs = segs; app.ui.sd.date = (app.$("#cl-date") || {}).value; app.renderSheet(); break; }
    case "cls-save": {
      const segs = app.readLogSegs().filter((g) => g.min > 0);
      if (!segs.length) { app.toast("Enter how many minutes you did."); break; }
      const date = (app.$("#cl-date") || {}).value || app.today();
      if (date > app.today()) { app.toast("That date is in the future."); break; }
      const sNew = { id: app.cid(), date, machine: app.ui.sd.machine || "treadmill", segments: segs, src: "manual", finishedAt: date + "T12:00:00", loggedAt: Date.now() };
      sNew.kcal = Math.round(app.sessionKcal(sNew, app.bodyKg()));
      app.cardio().sessions.push(sNew); app.cardioTouch();
      app.ui.sheet = "cardio-sum"; app.ui.sd = { id: sNew.id, fresh: true }; app.render(); break;
    }
    case "ca-detail": app.ui.sheet = "cardio-sum"; app.ui.sd = { id: b.dataset.id }; app.renderSheet(); break;
    case "ca-save": {
      const sx = app.cardio().sessions.find((x) => x.id === app.ui.sd.id), name = ((app.$("#ca-name") || {}).value || "").trim();
      if (!sx) break;
      app.cardio().saved.push({ id: app.cid(), name: name || app.MACHINES[sx.machine].name, machine: sx.machine, segments: sx.segments.map((g) => ({ ...g })) });
      app.cardioTouch(); app.ui.sd.fresh = false; app.renderSheet(); app.toast("Saved. Start it again from Saved & recent."); break;
    }
    case "ca-del": {
      if (!(await app.ask({ title: "Delete this session?", body: "This can't be undone.", ok: "Delete", danger: true }))) break;
      const c = app.cardio(); c.sessions = c.sessions.filter((x) => x.id !== app.ui.sd.id); c.deleted.push(app.ui.sd.id); app.cardioTouch(); app.ui.sheet = null; app.render(); break;
    }
    case "ca-goal": app.ui.sheet = "cardio-goal"; app.ui.sd = {}; app.renderSheet(); break;
    case "ca-goal-set": app.cardio().goalMin = +b.dataset.n; app.cardioTouch(); app.ui.sheet = null; app.render(); app.toast(`Weekly cardio goal: ${b.dataset.n} min.`); break;
    case "fseg": app.ui.fseg = b.dataset.s; app.render(); window.scrollTo(0, 0); break;
    case "qmeal": app.ui.qMeal = b.dataset.m; app.render(); break;
    case "review-meal": app.ui.sd.meal = b.dataset.m; app.renderSheet(); break;
    case "food-snap": { app.ui.sd = { meal: app.autoMeal() }; const inp = app.$("#food-file"); if (inp) { inp.value = ""; inp.click(); } break; }
    case "food-quick-barcode": app.ui.sheet = "food-barcode"; app.ui.sd = { meal: app.autoMeal() }; app.renderSheet(); app.startBarcode(); break;
    case "food-quick-manual": app.ui.sheet = "food-manual"; app.ui.sd = { meal: app.autoMeal() }; app.renderSheet(); break;
    case "food-reanalyze": { app.ui.sd.hint = ((app.$("#food-hint") || {}).value || "").trim(); app.analyzeFoodPhoto(null, app.ui.sd.image); break; }
    case "food-quick": {
      let src = null;
      if (b.dataset.kind === "fav") src = app.food().saved.find((x) => x.id === b.dataset.id);
      else Object.values(app.food().days).forEach((l) => l.forEach((e) => { if (e.id === b.dataset.id) src = e; }));
      if (!src) break;
      const meal = app.ui.qMeal || app.autoMeal(), keepDay = app.ui.foodDay;
      app.ui.foodDay = app.today();
      const e = app.addEntry(meal, src.name, src.base, src.servings || 1, "saved", src.items);
      app.ui.foodDay = keepDay;
      app.render();
      const label = app.MEALS.find((m) => m[0] === meal)[1];
      app.toast(`${src.name} added to ${label}.`, () => { app.food().days[app.today()] = app.dayEntries(app.today()).filter((x) => x.id !== e.id); app.food().deleted.push(e.id); app.foodTouch(); app.render(); });
      break;
    }
    case "food-cal": app.ui.sheet = "food-cal"; app.ui.fcMonth = (app.ui.foodDay || app.today()).slice(0, 7); app.renderSheet(); break;
    case "food-cal-month": { const d = app.parseDay(app.ui.fcMonth + "-01"); d.setMonth(d.getMonth() + +b.dataset.d); app.ui.fcMonth = app.iso(d).slice(0, 7); app.renderSheet(); break; }
    case "food-cal-day": app.ui.foodDay = b.dataset.date === app.today() ? null : b.dataset.date; app.ui.fseg = "day"; app.ui.sheet = null; app.render(); window.scrollTo(0, 0); break;
    case "food-day": { const d = app.addDays(app.ui.foodDay || app.today(), +b.dataset.d); app.ui.foodDay = d > app.today() ? app.today() : d; app.render(); break; }
    case "food-add": app.ui.sheet = "food-add"; app.ui.sd = { meal: b.dataset.meal }; app.renderSheet(); break;
    case "food-photo": { app.ui.sd = { meal: app.ui.sd.meal || app.autoMeal(), hint: "" }; app.ui.sheet = null; app.renderSheet(); const inp = app.$("#food-file"); if (inp) { inp.value = ""; inp.click(); } break; }
    case "food-describe": {
      const meal = (app.ui.sd && app.ui.sd.meal) || app.autoMeal();
      const text = (app.ui.sd && app.ui.sd.text) || "";
      app.ui.sheet = "food-describe";
      app.ui.sd = { meal, text, source: "describe" };
      app.renderSheet();
      setTimeout(() => { const f = app.$("#food-describe"); if (f) f.focus(); }, 60);
      break;
    }
    case "food-describe-go": {
      app.ui.sd.text = ((app.$("#food-describe") || {}).value || "").trim();
      await app.analyzeFoodText();
      break;
    }
    case "food-photo-go": { app.ui.sd.hint = ((app.$("#food-hint") || {}).value || "").trim(); const inp = app.$("#food-file"); if (inp) { inp.value = ""; inp.click(); } break; }
    case "food-manual": app.ui.sheet = "food-manual"; app.ui.sd = { meal: app.ui.sd.meal || "snacks" }; app.renderSheet(); break;
    case "food-edit": app.ui.sheet = "food-manual"; app.ui.sd = { edit: b.dataset.id }; app.renderSheet(); break;
    case "food-saved": app.ui.sheet = "food-saved"; app.ui.sd = { meal: app.ui.sd.meal || "snacks", q: "" }; app.renderSheet(); break;
    case "food-barcode": app.ui.sheet = "food-barcode"; app.ui.sd = { meal: app.ui.sd.meal || "snacks" }; app.renderSheet(); app.startBarcode(); break;
    case "bc-start": app.startBarcode(); break;
    case "food-targets": app.ui.sheet = "food-targets"; app.ui.sd = {}; app.renderSheet(); break;
    case "fi-del": app.ui.sd.items.splice(i, 1); app.renderSheet(); break;
    case "fi-mult": app.ui.sd.items[i].mult = +b.dataset.m; app.renderSheet(); break;
    case "fi-add": app.ui.sd.items.push({ name: "Food", portion: "", mult: 1, base: { kcal: 0, p: 0, c: 0, f: 0 } }); app.renderSheet(); break;
    case "food-review-save": {
      const items = app.ui.sd.items.filter((it) => it.name.trim());
      if (!items.length) { app.toast("Add at least one food."); break; }
      const t = app.reviewTotals(), name = items.map((it) => it.name).join(", ").slice(0, 80);
      const keep = items.map((it) => ({ name: it.name, portion: it.portion, kcal: app.r0(it.base.kcal * (it.mult || 1)), p: app.r0(it.base.p * (it.mult || 1)), c: app.r0(it.base.c * (it.mult || 1)), f: app.r0(it.base.f * (it.mult || 1)) }));
      const base = { kcal: app.r0(t.kcal), p: app.r0(t.p), c: app.r0(t.c), f: app.r0(t.f) };
      app.addEntry(app.ui.sd.meal, name, base, 1, app.ui.sd.source === "describe" ? "describe" : "photo", keep);
      if ((app.$("#food-fav") || {}).checked) app.favFrom(name, base, keep);
      app.ui.sheet = null; app.render(); app.toast(`Added ${app.r0(t.kcal)} cal.`); break;
    }
    case "food-manual-save": {
      const g = (id) => parseFloat((app.$("#" + id) || {}).value) || 0;
      const name = ((app.$("#fm-name") || {}).value || "").trim() || "Food";
      const base = { kcal: g("fm-kcal"), p: g("fm-p"), c: g("fm-c"), f: g("fm-f") }, sv = g("fm-s") || 1;
      if (!base.kcal && !base.p && !base.c && !base.f) { app.toast("Enter at least the calories."); break; }
      if (app.ui.sd.edit) {
        const d = app.ui.foodDay || app.today(), e = app.dayEntries(d).find((x) => x.id === app.ui.sd.edit);
        if (e) { e.name = name; e.base = base; e.servings = sv; const m = (app.$("#fm-meal") || {}).value; if (m) e.meal = m; e.updatedAt = new Date().toISOString(); }
        app.foodTouch();
      } else app.addEntry(app.ui.sd.meal, name, base, sv, "manual");
      if ((app.$("#food-fav") || {}).checked) app.favFrom(name, base);
      app.ui.sheet = null; app.render(); app.toast("Saved."); break;
    }
    case "food-del": {
      const d = app.ui.foodDay || app.today(), f = app.food();
      f.days[d] = app.dayEntries(d).filter((x) => x.id !== app.ui.sd.edit);
      f.deleted.push(app.ui.sd.edit); app.foodTouch(); app.ui.sheet = null; app.render(); app.toast("Deleted."); break;
    }
    case "food-pick-fav": case "food-pick-recent": {
      let src = null;
      if (a === "food-pick-fav") src = app.food().saved.find((x) => x.id === b.dataset.id);
      else Object.values(app.food().days).forEach((l) => l.forEach((e) => { if (e.id === b.dataset.id) src = e; }));
      if (!src) break;
      const e = app.addEntry(app.ui.sd.meal, src.name, src.base, src.servings || 1, "saved", src.items);
      app.ui.sheet = null; app.render();
      app.toast(`Added ${src.name}.`, () => { const d = app.ui.foodDay || app.today(); app.food().days[d] = app.dayEntries(d).filter((x) => x.id !== e.id); app.food().deleted.push(e.id); app.foodTouch(); app.render(); });
      break;
    }
    case "food-unfav": app.food().saved = app.food().saved.filter((x) => x.id !== b.dataset.id); app.food().deleted.push(b.dataset.id); app.foodTouch(); app.renderSheet(); break;
    case "bc-lookup": app.lookupBarcode(((app.$("#bc-code") || {}).value || "")); break;
    case "bc-unit": app.ui.sd.unit = b.dataset.u; app.ui.sd.amt = b.dataset.u === "serving" ? "1" : "100"; app.renderSheet(); break;
    case "bc-save": {
      const p = app.ui.sd.product, unit = app.ui.sd.unit, amt = parseFloat((app.$("#bc-amt") || {}).value) || 0;
      if (!amt) { app.toast("Enter an amount."); break; }
      const per = unit === "serving" ? p.serving : p.per100, mult = unit === "serving" ? amt : amt / 100;
      const base = { kcal: app.r0(per.kcal * mult), p: app.r0(per.p * mult), c: app.r0(per.c * mult), f: app.r0(per.f * mult) };
      const name = p.name + (unit === "g" ? ` (${app.fmtNum(amt)} g)` : amt !== 1 ? ` (${app.fmtNum(amt)} servings)` : "");
      app.addEntry(app.ui.sd.meal, name, base, 1, "barcode");
      if ((app.$("#food-fav") || {}).checked) app.favFrom(name, base);
      app.ui.sheet = null; app.render(); app.toast(`Added ${base.kcal} cal.`); break;
    }
    case "tg-auto": app.food().targets = { auto: true }; app.foodTouch(); app.ui.sheet = null; app.render(); app.toast("Using automatic targets."); break;
    case "tg-save": {
      const g = (id) => parseInt((app.$("#" + id) || {}).value, 10) || null;
      const t = { auto: false, kcal: g("tg-kcal"), p: g("tg-p"), c: g("tg-c"), f: g("tg-f") };
      if (!t.kcal || t.kcal < 1000 || t.kcal > 7000) { app.toast("Enter a calorie target between 1,000 and 7,000."); break; }
      const a = app.autoTargets();
      if (a && t.kcal === a.kcal && t.p === a.p && t.c === a.c && t.f === a.f) t.auto = true;
      app.food().targets = t; app.foodTouch(); app.ui.sheet = null; app.render(); app.toast("Targets saved."); break;
    }
    case "ph-month": { const d = app.parseDay((app.PH.month || app.today().slice(0, 7)) + "-01"); d.setMonth(d.getMonth() + +b.dataset.d); app.PH.month = app.iso(d).slice(0, 7); app.render(); break; }
    case "ph-compare": app.PH.compare = !app.PH.compare; app.PH.pick = []; app.render(); break;
    case "ph-day": {
      const d = b.dataset.date, has = app.myPhotos().some((p) => p.date === d);
      if (app.PH.compare) {
        if (!has) { app.toast("Pick a day that has a photo."); break; }
        app.PH.pick = app.PH.pick.includes(d) ? app.PH.pick.filter((x) => x !== d) : [...app.PH.pick.slice(-1), d].slice(-2);
        if (app.PH.pick.length === 2) app.PH.pick.sort();
        app.render(); break;
      }
      app.ui.sheet = "phday"; app.ui.sd = { date: d, pose: "Front" }; app.renderSheet(); break;
    }
    case "ph-open": { const p = app.PH.list.find((x) => x.id === b.dataset.id); if (p) { app.ui.sheet = "phday"; app.ui.sd = { date: p.date, pose: "Front" }; app.renderSheet(); } break; }
    case "ph-pose": app.ui.sd.pose = b.dataset.p; app.renderSheet(); break;
    case "ph-add-today": case "ph-add": {
      app.ui.phDate = b.dataset.date || app.today();
      if (!app.ui.sd || app.ui.sheet !== "phday") app.ui.sd = { date: app.ui.phDate, pose: "Front" };
      const inp = app.$("#ph-file"); if (inp) { inp.value = ""; inp.click(); } break;
    }
    case "ph-del": {
      if (!(await app.ask({ title: "Delete this photo?", body: "This can't be undone.", ok: "Delete", danger: true }))) break;
      await app.deletePhoto(b.dataset.id); app.renderSheet(); app.render(); break;
    }
    case "set-edit": {
      const s = app.activeSession(); if (!s) break;
      const e = app.liveExercises(s)[i], x = app.setsFor(s, e.name)[+b.dataset.s]; if (!x) break;
      app.ui.sheet = "set-edit"; app.ui.sd = { sid: s.id, ex: e.name, j: +b.dataset.s, tag: x.tag || null, rpe: x.rpe || null }; app.renderSheet(); break;
    }
    case "hist-set": {
      const s = app.state.sessions.find((x) => x.id === b.dataset.id), e = s && s.entries.find((x) => x.exercise === b.dataset.ex), x = e && e.sets[+b.dataset.s]; if (!x) break;
      app.ui.sheet = "set-edit"; app.ui.sd = { sid: s.id, ex: e.exercise, j: +b.dataset.s, tag: x.tag || null, rpe: x.rpe || null }; app.renderSheet(); break;
    }
    case "se-step": {
      const inp = document.getElementById(b.dataset.f); if (!inp) break;
      inp.value = app.fmtNum(Math.max(0, (parseFloat(inp.value) || 0) + +b.dataset.d)); break;
    }
    case "se-tag": {
      app.ui.sd.tag = app.ui.sd.tag === b.dataset.t ? null : b.dataset.t;
      document.querySelectorAll('[data-action="se-tag"]').forEach((el) => el.setAttribute("aria-pressed", el.dataset.t === app.ui.sd.tag)); break;
    }
    case "se-save": {
      const t = app.findSetTarget(app.ui.sd); if (!t) break;
      const readSide = (wid, rid) => {
        const wRaw = ((app.$("#" + wid) || {}).value || "").trim(), w = wRaw === "" ? null : parseFloat(wRaw), r = parseInt((app.$("#" + rid) || {}).value, 10);
        if (wRaw === "" && !app.canBW(t.e.exercise)) { app.toast("Enter the weight."); return null; }
        if (wRaw !== "" && (isNaN(w) || w < 0)) { app.toast("Weight needs to be a number. Leave it blank for bodyweight."); return null; }
        if (!r || r < 1) { app.toast("Enter the reps."); return null; }
        return { w, r };
      };
      const sl = readSide("se-w", "se-r"); if (!sl) break;
      let w = sl.w, r = sl.r;
      if (t.x.uni) { const sr = readSide("se-wR", "se-rR"); if (!sr) break; const u = app.uniSet(sl, sr); w = u.w; r = u.r; t.x.uni = u.uni; }
      const note = ((app.$("#se-note") || {}).value || "").trim();
      t.x.w = w; t.x.r = r;
      if (note) t.x.note = note; else delete t.x.note;
      if (app.ui.sd.tag) t.x.tag = app.ui.sd.tag; else delete t.x.tag;
      if (Number.isInteger(app.ui.sd.rpe) && app.ui.sd.rpe >= 6 && app.ui.sd.rpe <= 10) t.x.rpe = app.ui.sd.rpe; else delete t.x.rpe;
      app.recomputePRs(t.e.exercise);
      t.s.mod = Date.now(); delete app.ui.drafts[t.e.exercise];
      app.save(); app.ui.sheet = null; app.render(); app.toast("Set updated."); break;
    }
    case "se-del": {
      const t = app.findSetTarget(app.ui.sd); if (!t) break;
      if (!(await app.ask({ title: "Delete this set?", body: `${app.fmtSet(t.x)} on ${t.e.exercise}. This can't be undone.`, ok: "Delete", danger: true }))) break;
      t.e.sets.splice(app.ui.sd.j, 1);
      if (!t.e.sets.length) t.s.entries = t.s.entries.filter((x) => x !== t.e);
      app.recomputePRs(t.e.exercise);
      if (!t.s.entries.length && t.s.finishedAt) { app.state.sessions = app.state.sessions.filter((x) => x !== t.s); app.state.deleted = [...(app.state.deleted || []), t.s.id]; }
      else t.s.mod = Date.now();
      delete app.ui.drafts[t.e.exercise];
      app.save(); app.ui.sheet = null; app.render(); app.toast("Set deleted."); break;
    }
    case "sugg-use": {
      const s = app.activeSession(); if (!s) break;
      const e = app.liveExercises(s)[i], sg = app.suggestion(e.name, s.id); if (!sg) break;
      const d = app.draftFor(s, e.name);
      d.w = sg.w != null ? app.fmtNum(sg.w) : ""; d.r = String(sg.r);
      app.renderWorkout(); app.tick(); break;
    }
    case "sugg-plain":
    case "sugg-ready": {
      const s = app.activeSession(); if (!s) break;
      const e = app.liveExercises(s)[i]; if (!e) break;
      const list = (Array.isArray(s.plain) ? s.plain : []).filter((n) => n !== e.name);
      if (a === "sugg-plain") list.push(e.name);
      if (list.length) s.plain = list; else delete s.plain;
      s.mod = Date.now();
      delete app.ui.drafts[e.name];
      if (app.capture) app.capture("readiness_plan_toggled", { mode: a === "sugg-plain" ? "normal" : "readiness" });
      app.save(); app.renderWorkout(); app.tick(); break;
    }
    case "rpe": {
      const s = app.activeSession(); if (!s) break;
      const e = app.liveExercises(s)[i]; if (!e) break;
      const d = app.draftFor(s, e.name), n = +b.dataset.n;
      d.rpe = d.rpe === n ? null : n;
      app.renderWorkout(); app.tick(); break;
    }
    case "se-rpe": {
      if (!app.ui.sd) break;
      const n = +b.dataset.n;
      app.ui.sd.rpe = app.ui.sd.rpe === n ? null : n;
      document.querySelectorAll('[data-action="se-rpe"]').forEach((el) => el.setAttribute("aria-pressed", String(+el.dataset.n === app.ui.sd.rpe)));
      break;
    }
    case "tag": {
      const s = app.activeSession(); if (!s) break;
      const d = app.draftFor(s, app.liveExercises(s)[i].name);
      d.tag = d.tag === b.dataset.t ? null : b.dataset.t;
      app.renderWorkout(); app.tick(); break;
    }
    case "swap-open": app.ui.sheet = "swap"; app.ui.sd = { i, q: "", routine: false }; app.renderSheet(); break;
    case "swap-pick": app.applySwap(b.dataset.name); break;
    case "swap-new": { const n = ((app.$("#swap-new") || {}).value || "").trim(); if (!n) { app.toast("Type an exercise name."); break; } app.applySwap(n); break; }
    case "summary": app.ui.sheet = "summary"; app.ui.sd = { id: b.dataset.id }; app.renderSheet(); break;
    case "goal-week": app.ui.sheet = "goalweek"; app.ui.sd = {}; app.renderSheet(); break;
    case "goal-week-set": { const n = +b.dataset.n; app.goals().sessionsPerWeek = n || null; app.goals().updatedAt = Date.now(); app.save(); app.ui.sheet = null; app.render(); app.toast(n ? `Goal set: ${n} sessions a week.` : "Weekly goal off."); break; }
    case "goal-open-insights": app.ui.tab = "insights"; app.ui.detail = null; app.render(); window.scrollTo(0, 0); break;
    case "goal-lift": app.ui.sheet = "goal"; app.ui.sd = { name: b.dataset.name || "" }; app.renderSheet(); break;
    case "goal-save": {
      const name = (app.$("#goal-ex") || {}).value, v = parseFloat((app.$("#goal-v") || {}).value);
      if (!name) { app.toast("Pick a lift."); break; }
      if (!v || v <= 0 || v > 2000) { app.toast("Enter a target weight."); break; }
      const g = app.goals();
      if (app.ui.sd.name && app.ui.sd.name !== name) delete g.lifts[app.ui.sd.name];
      g.lifts[name] = { kg: Math.round(app.dispToKg(v) * 100) / 100, setAt: app.today() };
      g.updatedAt = Date.now(); app.save(); app.ui.sheet = null; app.render(); app.toast(`Goal saved for ${name}.`); break;
    }
    case "goal-del": {
      if (!(await app.ask({ title: "Remove this goal?", body: app.ui.sd.name, ok: "Remove", danger: true }))) break;
      delete app.goals().lifts[app.ui.sd.name]; app.goals().updatedAt = Date.now(); app.save(); app.ui.sheet = null; app.render(); break;
    }
    case "goal-dir": app.goals().weightDir = b.dataset.d; app.goals().updatedAt = Date.now(); app.save(); app.render(); break;
    case "theme-mode": app.state.theme = { ...(app.state.theme || {}), mode: b.dataset.m }; app.applyTheme(); app.save(); app.render(); break;
    case "theme-accent": app.state.theme = { ...(app.state.theme || {}), accent: b.dataset.a }; app.applyTheme(); app.save(); app.render(); break;
    case "pf-edit": app.startProfileDraft(); app.ui.sheet = "profile"; app.renderSheet(); break;
    case "pf-pick": {
      const f = app.ui.pf, field = b.dataset.field, val = b.dataset.val;
      if (field === "units" && f.units !== val) {        // convert what's typed so far
        if (val === "metric") {
          const tin = (parseInt(f.ft, 10) || 0) * 12 + (parseFloat(f.inch) || 0);
          if (tin) f.cm = String(Math.round(tin * 2.54));
          if (parseFloat(f.weight)) f.weight = String(app.round1(parseFloat(f.weight) / app.LB));
        } else {
          const tin = Math.round((parseFloat(f.cm) || 0) / 2.54);
          if (tin) { f.ft = String(Math.floor(tin / 12)); f.inch = String(tin % 12); }
          if (parseFloat(f.weight)) f.weight = String(app.round1(parseFloat(f.weight) * app.LB));
        }
      }
      f[field] = val;
      if (app.ui.onboard) app.renderOnboard(); else app.renderSheet();
      break;
    }
    case "pf-save": await app.saveProfile(); break;
    case "weigh-open": app.ui.sheet = "weigh"; app.ui.sd = {}; app.renderSheet(); break;
    case "weigh-save": app.saveWeighIn(); break;
    case "weigh-del": {
      const d = b.dataset.date;
      if (!(await app.ask({ title: "Delete this weigh-in?", body: app.fmtDate(d), ok: "Delete", danger: true }))) break;
      app.state.profile.weighIns = app.state.profile.weighIns.filter((x) => x.date !== d);
      app.state.profile.wDel = [...(app.state.profile.wDel || []), d];
      app.state.profile.wDelAt = { ...(app.state.profile.wDelAt || {}), [d]: Date.now() };
      app.state.profile.updatedAt = Date.now();
      app.save(); app.render(); app.renderSheet(); break;
    }
    case "auth-open": app.ui.sheet = "auth"; app.ui.sd = { mode: "signin", email: "" }; app.renderSheet(); break;
    case "auth-mode": app.ui.sd.mode = app.ui.sd.mode === "signup" ? "signin" : "signup"; app.renderSheet(); break;
    case "auth-go": await app.signIn(app.ui.sd.mode); break;
    case "sign-out": if (await app.ask({ title: "Sign out?", body: "Your workouts stay on this phone and in your backup.", ok: "Sign out" })) await app.signOut(); break;
    case "oura-connect": await app.connectOura(); break;
    case "oura-sync": await app.ouraRefresh(true); break;
    case "oura-disconnect": await app.disconnectOura(); break;
    case "demo-on": app.state.demo = true; app.save(); app.render(); app.toast("Showing sample data in Recovery and Insights."); break;
    case "demo-off": app.state.demo = false; app.save(); app.render(); app.toast("Sample data off."); break;
    case "dlg-cancel": app.closeDialog(false); break;
    case "toast-undo": { const f = app.toastUndo; app.toastUndo = null; app.$("#toast").hidden = true; if (f) f(); break; }
    case "toggle": {
      const wo = app.$("#workout"), before = app.$("#wo-list").children[i] ? app.$("#wo-list").children[i].getBoundingClientRect().top : null;
      app.ui.open = app.ui.open === i ? null : i; app.renderWorkout(); app.tick();
      const li = app.$("#wo-list").children[i];
      if (li && before != null) wo.scrollTop += li.getBoundingClientRect().top - before;      // tapped row stays put
      if (li && app.ui.open != null) {
        const topBar = app.$(".wo-top").getBoundingClientRect().bottom + 6;
        const tm = app.$("#timer"), bottom = (tm && !tm.hidden ? tm.getBoundingClientRect().top : innerHeight) - 10;
        const r = li.getBoundingClientRect();
        if (r.bottom > bottom) wo.scrollTop += Math.min(r.bottom - bottom, Math.max(0, r.top - topBar));   // only as far as needed, never past the header
        else if (r.top < topBar) wo.scrollTop -= topBar - r.top;
      }
      break;
    }
    case "step": {
      const s = app.activeSession(); if (!s) break;
      const e = app.liveExercises(s)[i], d = app.draftFor(s, e.name), f = b.dataset.field, step = +b.dataset.d;
      const next = Math.max(0, (parseFloat(d[f]) || 0) + step);
      d[f] = f[0] === "w" && next === 0 && step < 0 && app.canBW(e.name) ? "" : app.fmtNum(next);
      const input = document.getElementById(`${f}-${i}`);
      if (input) input.value = d[f];
      break;
    }
    case "log": app.ensureAudio(); app.logSet(i); break;
    case "uni": {
      const s = app.activeSession(); if (!s) break;
      const e = app.liveExercises(s)[i], d = app.draftFor(s, e.name);
      app.state.uniEx = app.state.uniEx || {};
      if (app.state.uniEx[e.name]) delete app.state.uniEx[e.name];
      else { app.state.uniEx[e.name] = true; if (!d.wR && !d.rR) { d.wR = d.w; d.rR = d.r; } }
      app.state.settingsAt = Date.now(); app.save(); app.renderWorkout(); app.tick(); break;
    }
    case "delset": app.deleteSet(i, +b.dataset.s); break;
    case "t-adj":
      app.timer.end += +b.dataset.d * 1000;
      if (app.timer.end <= Date.now()) app.timer.end = Date.now() + 1000;
      app.timer.total = Math.max(app.timer.total, Math.ceil((app.timer.end - Date.now()) / 1000));
      app.tick(); break;
    case "t-skip": app.stopTimer(); break;

    case "open-w": app.ui.detail = b.dataset.id; app.render(); window.scrollTo(0, 0); break;
    case "close-w": app.ui.detail = null; app.render(); break;
    case "new-workout": {
      const name = await app.ask({ title: "New workout", body: "Give it a name, like Upper or Arms.", ok: "Create", input: "" });
      if (!name) break;
      let id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workout";
      while (app.workoutById(id)) id += "-2";
      app.state.workouts.push({ id, name, exercises: [] });
      app.save(); app.ui.detail = id; app.render(); break;
    }
    case "rename-w": {
      const w = app.workoutById(app.ui.detail);
      const name = await app.ask({ title: "Rename workout", ok: "Save", input: w.name });
      if (!name) break;
      w.name = name; app.save(); app.render(); break;
    }
    case "delete-w": {
      const w = app.workoutById(app.ui.detail);
      if (!(await app.ask({ title: `Delete ${w.name}?`, body: "Past workouts stay in your history. Any days planned with it will be cleared.", ok: "Delete", danger: true }))) break;
      app.state.workouts = app.state.workouts.filter((x) => x !== w);
      Object.keys(app.state.plan).forEach((d) => { if (app.state.plan[d] === w.id) { delete app.state.plan[d]; if (app.state.planAt) delete app.state.planAt[d]; } });
      app.ui.detail = null; app.save(); app.render(); break;
    }
    case "edit-ex": {
      const w = app.workoutById(app.ui.detail);
      const e = i >= 0 ? w.exercises[i] : null;
      app.ui.sheet = "exercise";
      app.ui.sd = { idx: i, name: e ? e.name : "", muscles: new Set(e ? e.muscles : []), adv: new Set(e ? app.advOf(e) : []), orig: e ? [...e.muscles].sort().join() : "" };
      app.renderSheet();
      if (!e) setTimeout(() => { const n = app.$("#exName"); if (n) n.focus(); }, 50);
      break;
    }
    case "toggle-a": {
      const k = b.dataset.m;
      app.ui.sd.adv.has(k) ? app.ui.sd.adv.delete(k) : app.ui.sd.adv.add(k);
      b.setAttribute("aria-pressed", app.ui.sd.adv.has(k));
      break;
    }
    case "w-done": app.ui.edit = null; app.render(); break;
    case "brief-edit": app.ui.briefEdit = true; app.ui.edit = null; app.render(); break;
    case "brief-done": app.ui.briefEdit = false; app.render(); break;
    case "brief-size": { const p = app.briefPrefs(); app.saveBrief({ ...p, size: p.size === "expanded" ? "compact" : "expanded" }); if (app.capture) app.capture("morning_brief_customized"); app.render(); break; }
    case "brief-toggle": {
      const p = app.briefPrefs(), hidden = new Set(p.hidden);
      if (hidden.has(b.dataset.id)) hidden.delete(b.dataset.id); else hidden.add(b.dataset.id);
      app.saveBrief({ ...p, hidden: [...hidden] }); if (app.capture) app.capture("morning_brief_customized"); app.render(); break;
    }
    case "usage-share": {
      const next = !(app.usageSharingOn && app.usageSharingOn());
      if (app.applyUsageSharing) app.applyUsageSharing(next);
      break;
    }
    case "w-remove": app.hideWidget(app.ui.edit, b.dataset.w); break;
    case "r-remove": app.deleteRoutine(b.dataset.w); break;
    case "w-add": app.ui.sheet = "w-add"; app.ui.sd = {}; app.renderSheet(); break;
    case "w-add-one": app.showWidget(app.ui.edit, b.dataset.w); app.ui.sheet = null; app.render(); app.toast(`${app.WIDGETS[app.ui.edit][b.dataset.w]} added.`); break;
    case "ms-list": app.ui.sheet = "ms-list"; app.ui.sd = { q: "" }; app.renderSheet(); break;
    case "ms-edit": { const back = app.ui.sheet === "ms-list"; app.ui.sheet = "ms-edit"; app.ui.sd = { name: b.dataset.name, back }; app.renderSheet(); setTimeout(() => { const t = app.$("#ms-text"); if (t) t.focus(); }, 60); break; }
    case "ms-save": {
      const txt = ((app.$("#ms-text") || {}).value || "").trim();
      if (!txt) { app.toast("Type the machine settings to save."); break; }
      app.state.machineNotes = app.state.machineNotes || {};
      app.state.machineNotes[app.ui.sd.name] = { text: txt, at: Date.now() };
      app.save();
      app.toast(`Saved settings for ${app.ui.sd.name}.`);
      if (app.ui.sd.back) { app.ui.sheet = "ms-list"; app.ui.sd = { q: "" }; } else app.ui.sheet = null;
      app.renderSheet(); app.renderWorkout(); app.tick(); break;
    }
    case "meas-log": app.ui.sheet = "meas-log"; app.ui.sd = { date: app.today() }; app.renderSheet(); break;
    case "meas-detail": app.ui.sheet = "meas-detail"; app.ui.sd = { k: b.dataset.k }; app.renderSheet(); break;
    case "meas-save": {
      const date = (app.$("#ms-date") || {}).value || app.today();
      if (date > app.today()) { app.toast("That date is in the future."); break; }
      const vals = { ...(((app.meas()[date] || {}).vals) || {}) }; let n = 0, bad = false;
      app.MEAS.forEach(([k]) => {
        const raw = ((app.$("#mz-" + k) || {}).value || "").trim(); if (!raw) return;
        const v = parseFloat(raw);
        if (!(v > 0) || v > (app.units() === "metric" ? 300 : 120)) { bad = true; return; }
        vals[k] = Math.round(app.dispToCm(v) * 10) / 10; n++;
      });
      if (bad) { app.toast("Check the numbers. One looks off."); break; }
      if (!n) { app.toast("Enter at least one measurement."); break; }
      app.meas()[date] = { vals, at: Date.now() }; app.save(); app.ui.sheet = null; app.render(); app.toast(`Saved ${app.pl(n, "measurement")}.`); break;
    }
    case "meas-del": {
      const d = b.dataset.date, m = app.meas()[d]; if (!m) break;
      const k = app.ui.sd.k, old = m.vals[k];
      delete m.vals[k]; m.at = Date.now(); app.save(); app.renderSheet(); app.render();
      app.toast("Deleted.", () => { m.vals[k] = old; m.at = Date.now(); app.save(); app.renderSheet(); app.render(); });
      break;
    }
    case "live-add-open": app.ui.sheet = "live-add"; app.ui.sd = { q: "", routine: false }; app.renderSheet(); break;
    case "live-add": app.liveAdd(b.dataset.name); break;
    case "live-add-new": { const n = ((app.$("#live-new") || {}).value || "").trim(); if (!n) { app.toast("Type an exercise name."); break; } app.liveAdd(n); break; }
    case "open-picker": app.ui.sheet = "picker"; app.ui.sd = { q: "" }; app.renderSheet(); break;
    case "pick-ex": app.pickExercise(b.dataset.name, b.dataset.src); break;
    case "set-mode": app.state.muscleMode = b.dataset.m; app.swapHomeMap(b.dataset.m); app.state.settingsAt = Date.now(); app.save(); app.render(); break;
    case "photo-pick": { const inp = app.$("#avatar-file"); if (inp) { inp.value = ""; inp.click(); } break; }
    case "photo-remove": delete app.state.profile.photo; app.state.profile.updatedAt = Date.now(); app.save(); app.render(); app.toast("Profile photo removed."); break;
    case "toggle-m": {
      const k = b.dataset.m;
      app.ui.sd.muscles.has(k) ? app.ui.sd.muscles.delete(k) : app.ui.sd.muscles.add(k);
      b.setAttribute("aria-pressed", app.ui.sd.muscles.has(k));
      break;
    }
    case "ex-save": {
      const w = app.workoutById(app.ui.detail);
      const name = (app.ui.sd.name || "").trim();
      if (!name) { app.toast("Give the exercise a name."); break; }
      if (w.exercises.some((x, j) => j !== app.ui.sd.idx && x.name.toLowerCase() === name.toLowerCase())) { app.toast(`${name} is already in ${w.name}.`); break; }
      let muscles = Object.keys(app.MUSCLES).filter((k) => app.ui.sd.muscles.has(k)), adv = null;
      if (app.muscleMode() === "advanced") { adv = Object.keys(app.ADV).filter((k) => app.ui.sd.adv.has(k)); muscles = app.basicOf(adv); }
      else if (app.ui.sd.idx >= 0 && [...muscles].sort().join() === app.ui.sd.orig) { const prev = w.exercises[app.ui.sd.idx]; if (prev.adv) adv = prev.adv; }
      const exObj = adv && adv.length ? { name, muscles, adv } : { name, muscles };
      if (app.ui.sd.idx >= 0) {
        const old = w.exercises[app.ui.sd.idx];
        if (old.name !== name) {
          if (app.state.machineNotes && app.state.machineNotes[old.name] != null) {
            const prev = app.state.machineNotes[old.name];
            const text = typeof prev === "string" ? prev.trim() : (prev && !prev.gone && prev.text ? String(prev.text).trim() : "");
            const now = Date.now();
            if (text) app.state.machineNotes[name] = { text, at: now };
            app.state.machineNotes[old.name] = { text: "", at: now, gone: true };
          }
          if (app.goals().lifts[old.name]) { app.goals().lifts[name] = app.goals().lifts[old.name]; delete app.goals().lifts[old.name]; app.goals().updatedAt = Date.now(); }
          // keep history linked to the renamed exercise
          app.state.sessions.forEach((s) => s.entries.forEach((e) => { if (e.exercise === old.name) e.exercise = name; }));
        }
        w.exercises[app.ui.sd.idx] = exObj;
      } else w.exercises.push(exObj);
      app.save(); app.ui.sheet = null; app.render(); break;
    }
    case "ex-delete": {
      const w = app.workoutById(app.ui.detail);
      const e = w.exercises[app.ui.sd.idx];
      if (!(await app.ask({ title: `Remove ${e.name}?`, body: `It comes out of ${w.name}. Its past sets stay in your history.`, ok: "Remove", danger: true }))) break;
      w.exercises.splice(app.ui.sd.idx, 1);
      app.save(); app.ui.sheet = null; app.render(); break;
    }

    case "delete-s": {
      const s = app.state.sessions.find((x) => x.id === b.dataset.id);
      if (!s || !(await app.ask({ title: `Delete this ${s.name} workout?`, body: `${app.fmtDate(s.date)}, ${app.pl(app.setCount(s), "set")}. This can't be undone.`, ok: "Delete", danger: true }))) break;
      app.state.sessions = app.state.sessions.filter((x) => x !== s);
      app.state.deleted = [...(app.state.deleted || []), s.id];
      app.save(); app.render(); break;
    }
    case "rest": app.state.restSeconds = +b.dataset.s; app.save(); app.render(); break;
    case "priv-summary": app.ui.sheet = "priv-summary"; app.ui.sd = {}; app.renderSheet(); break;
    case "priv-export": await app.exportAllData(); break;
    case "priv-range": app.ui.sheet = "priv-range"; app.ui.sd = { from: "", to: "" }; app.renderSheet(); break;
    case "priv-range-go": {
      const from = (app.ui.sd && app.ui.sd.from) || ((app.$("#purge-from") || {}).value || "");
      const to = (app.ui.sd && app.ui.sd.to) || ((app.$("#purge-to") || {}).value || "");
      await app.purgeRange(from, to);
      break;
    }
    case "priv-lock": if (app.lockState().enabled) await app.disableAppLock(); else await app.enableAppLock(); break;
    case "priv-pass-save": await app.savePasscodeLock(); break;
    case "priv-delete": app.ui.sheet = "priv-delete"; app.ui.sd = {}; app.renderSheet(); setTimeout(() => { const f = app.$("#del-confirm"); if (f) f.focus(); }, 60); break;
    case "priv-delete-go": await app.deleteAccount(); break;
    case "lock-bio": await app.unlockWithBiometric(); break;
    case "lock-relogin": app.ui.lockMode = "relogin"; app.ui.lockMsg = ""; app.renderLock(true); break;
    case "lock-back": app.ui.lockMode = app.lockState().method === "passcode" ? "passcode" : "main"; app.ui.lockMsg = ""; app.renderLock(true); break;
    case "lock-show-pass": app.ui.lockMode = "passcode"; app.ui.lockMsg = ""; app.renderLock(true); break;
    case "lock-code-go": await app.unlockWithPasscode(); break;
    case "lock-signin": await app.unlockWithPassword(); break;
    case "export": app.exportData(); break;
    case "import": app.$("#importFile").click(); break;
  }
});
