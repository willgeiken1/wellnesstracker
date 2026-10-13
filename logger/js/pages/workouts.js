import { app } from "../runtime.js";

/* Workouts list, routine detail, and history. */
/* ================= Tab motion: bubble + slide + swipe ================= */
const GEAR_SVG = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`;
app.GEAR_SVG = GEAR_SVG;

function slugRoutineId(name) {
  let id = String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workout";
  while (app.workoutById(id)) id += "-2";
  return id;
}
app.slugRoutineId = slugRoutineId;

/* A blank session. workoutId cannot collide with a routine slug. */
function freestyleSession() {
  const id = app.uid();
  return {
    id, date: app.today(), workoutId: "fs:" + id, name: "Freestyle", origin: "freestyle",
    startedAt: new Date().toISOString(), finishedAt: null, entries: [], extra: []
  };
}
app.freestyleSession = freestyleSession;

/* Working sets become the next session's targets. A warm-up is kept only when nothing else was logged. */
function targetSetsFrom(s, name) {
  const entry = (s.entries || []).find((e) => e.exercise === name);
  if (!entry || !entry.sets || !entry.sets.length) return [];
  const work = entry.sets.filter((x) => x.tag !== "warmup");
  const list = work.length ? work : entry.sets;
  return list.map((x) => {
    const o = { w: x.w, r: x.r };
    if (x.uni) o.uni = { l: { w: x.uni.l.w, r: x.uni.l.r }, r: { w: x.uni.r.w, r: x.uni.r.r } };
    return o;
  });
}
app.targetSetsFrom = targetSetsFrom;

function routineExercisesFrom(s) {
  return app.liveExercises(s).map((e) => {
    const o = { name: e.name, muscles: [...(e.muscles || [])] };
    if (e.adv && e.adv.length) o.adv = [...e.adv];
    const sets = targetSetsFrom(s, e.name);
    if (sets.length) o.sets = sets;
    return o;
  });
}
app.routineExercisesFrom = routineExercisesFrom;

/* Creates a routine, updates the one this freestyle session already saved, or saves a separate copy. */
function commitFreestyleRoutine(s, name, opts) {
  const trimmed = String(name || "").trim();
  if (!s || !trimmed) return null;
  const exercises = routineExercisesFrom(s);
  if (!exercises.length) return null;
  const copy = !!(opts && opts.copy);
  let routine = !copy && s.origin === "freestyle" ? app.workoutById(s.workoutId) : null;
  if (routine) {
    routine.name = trimmed;
    routine.exercises = exercises;
  } else {
    routine = { id: slugRoutineId(trimmed), name: trimmed, exercises };
    app.state.workouts.push(routine);
  }
  s.workoutId = routine.id;
  s.name = trimmed;
  s.origin = "freestyle";
  s.extra = [];
  s.swaps = {};
  s.removed = [];
  s.mod = Date.now();
  return routine;
}
app.commitFreestyleRoutine = commitFreestyleRoutine;

async function startFreestyle() {
  const cur = app.activeSession();
  if (cur) {
    if (cur.origin === "freestyle") { app.openWorkout(); return; }
    if (!(await app.ask({ title: `${cur.name} is still in progress`, body: "Finish it and start a freestyle workout?", ok: "Finish and start" }))) return;
    app.finishSession(cur, true);
  }
  app.state.sessions.push(freestyleSession());
  app.ui.drafts = {};
  app.ui.open = null;
  app.save();
  app.openWorkout();
}
app.startFreestyle = startFreestyle;

function workoutsHTML() {
  const seg = `<div class="seg2" role="tablist"><button data-action="wseg" data-seg="routines" aria-pressed="${app.ui.wseg === "routines"}">Routines</button>
    <button data-action="wseg" data-seg="history" aria-pressed="${app.ui.wseg === "history"}">History</button></div>`;
  const plus = `<button class="plus-btn" data-action="new-workout" aria-label="New workout">${app.PLUS_SVG}</button>`;
  const startFree = `<button class="btn block free-start" data-action="start-freestyle">Start freestyle workout</button>`;
  if (app.ui.wseg === "history") return app.pageHead("Workouts", "", { below: plus }) + startFree + seg + app.historyHTML(true);
  if (app.ui.edit === "routines") return `${app.pageHead("Workouts", "Drag to reorder · × to delete", { below: plus })}${seg}${app.routinesEditHTML()}`;
  return `${app.pageHead("Workouts", "Tap one to edit or start it · hold to rearrange", { below: plus })}${startFree}${seg}
    ${app.state.workouts.map((w, wi) => {
      const all = app.muscleMode() === "advanced" ? app.uniq(w.exercises.flatMap(app.advOf)).map((k) => app.ADV[k]) : [...new Set(w.exercises.flatMap((e) => e.muscles))].map((m) => app.MUSCLES[m]).filter(Boolean);
      const ms = all.length > 6 ? [...all.slice(0, 6), `+${all.length - 6} more`] : all;
      return `<button class="wcard c${wi % 3}" data-action="open-w" data-id="${app.esc(w.id)}">
        <div><div class="wcard-t">${app.esc(w.name)}</div>
        <div class="wcard-s">${w.exercises.length} exercise${w.exercises.length === 1 ? "" : "s"}${ms.length ? " · " + ms.join(", ") : ""}</div></div>${app.I.chevR}</button>`;
    }).join("")}`;
}
app.workoutsHTML = workoutsHTML;

function detailHTML() {
  const w = app.workoutById(app.ui.detail);
  return `<div class="detail-top"><button class="icon-btn" data-action="close-w" aria-label="Back to workouts">${app.I.chevL}</button>
      <div class="detail-actions"><button class="link-btn" data-action="rename-w">Rename</button>
      ${app.state.workouts.length > 1 ? `<button class="link-btn danger" data-action="delete-w">Delete</button>` : ""}</div></div>
    <h1 class="page-title">${app.esc(w.name)}</h1>
    <div class="page-sub">Drag the handles to reorder. Tap an exercise to edit it.</div>
    <ul class="elist" id="elist">${w.exercises.map((e, i) => `
      <li class="erow" data-i="${i}">
        <button class="erow-main" data-action="edit-ex" data-i="${i}">
          <div class="erow-n">${app.esc(e.name)}</div>
          <div class="erow-m${e.muscles.length ? "" : " none"}">${e.muscles.length ? app.esc(app.musclesLabel(e, 4)) : "No muscles set"}</div>
          ${e.sets && e.sets.length ? `<div class="erow-m">${e.sets.map((x) => app.esc(app.fmtSet(x))).join(", ")}</div>` : ""}
        </button>
        <span class="handle" aria-label="Drag to reorder ${app.esc(e.name)}">${app.I.grip}</span>
      </li>`).join("")}</ul>
    <button class="add-row-btn" data-action="open-picker">Add exercises</button>`;
}
app.detailHTML = detailHTML;

/* The routine list lives in a transformed pane, which would make a fixed bar scroll away. */
function mountStartBar() {
  const w = app.ui.tab === "workouts" && app.ui.detail && app.workoutById(app.ui.detail);
  const show = w && !(app.needsLock && app.needsLock());
  let slot = document.getElementById("start-slot");
  if (!show) { if (slot) slot.remove(); return; }
  const html = `<div class="start-bar"><button class="btn primary block" data-action="start" data-id="${app.esc(w.id)}">Start ${app.esc(w.name)}</button></div>`;
  if (!slot) {
    slot = document.createElement("div");
    slot.id = "start-slot";
    document.body.appendChild(slot);
  }
  if (slot.innerHTML !== html) slot.innerHTML = html;
}
app.mountStartBar = mountStartBar;

/* History uses the routine name once a freestyle workout is saved. The placeholder "Freestyle" is never a title. */
function historyTitle(s) {
  if (s.origin === "freestyle" && (!s.name || s.name === "Freestyle")) {
    const routine = app.workoutById(s.workoutId);
    if (routine) return routine.name;
    const order = Array.isArray(s.order) ? s.order : [];
    const names = [];
    (s.entries || []).forEach((e) => {
      if (e.sets && e.sets.length && !names.includes(e.exercise)) names.push(e.exercise);
    });
    names.sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia < 0 ? 1000 : ia) - (ib < 0 ? 1000 : ib);
    });
    if (!names.length) return "Workout";
    return names.length > 3 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ");
  }
  return s.name;
}
app.historyTitle = historyTitle;

function liveSnapshot(s) {
  return {
    extra: app.copy(s.extra || []),
    entries: app.copy(s.entries || []),
    order: Array.isArray(s.order) ? [...s.order] : null,
    swaps: app.copy(s.swaps || {}),
    removed: [...(s.removed || [])],
    open: app.ui.open,
  };
}
app.liveSnapshot = liveSnapshot;

function restoreLive(s, snap) {
  s.extra = snap.extra;
  s.entries = snap.entries;
  s.order = snap.order;
  s.swaps = snap.swaps;
  s.removed = snap.removed;
  app.ui.open = snap.open;
  s.mod = Date.now();
}
app.restoreLive = restoreLive;

function reorderLive(from, to, session) {
  const s = session || app.activeSession();
  if (!s || from === to || from < 0 || to < 0) return;
  const names = app.liveExercises(s).map((e) => e.name);
  if (from >= names.length || to >= names.length) return;
  const [moved] = names.splice(from, 1);
  names.splice(to, 0, moved);
  s.order = names;
  const o = app.ui.open;
  if (o != null) {
    if (o === from) app.ui.open = to;
    else if (from < to && o > from && o <= to) app.ui.open = o - 1;
    else if (from > to && o >= to && o < from) app.ui.open = o + 1;
  }
  s.mod = Date.now();
  app.save();
}
app.reorderLive = reorderLive;

function applyLiveRemoval(s, i) {
  const list = app.liveExercises(s);
  const e = list[i];
  if (!s || !e) return null;
  const snap = liveSnapshot(s);
  s.removed = [...(s.removed || [])];
  [e.original, e.name].forEach((n) => { if (n && !s.removed.includes(n)) s.removed.push(n); });
  if (e.original && s.swaps) delete s.swaps[e.original];
  s.extra = (s.extra || []).filter((x) => x.name !== e.name);
  s.entries = (s.entries || []).filter((x) => x.exercise !== e.name);
  if (Array.isArray(s.order)) s.order = s.order.filter((n) => n !== e.name);
  if (app.ui.open === i) app.ui.open = null;
  else if (app.ui.open != null && app.ui.open > i) app.ui.open -= 1;
  if (app.ui.drafts) delete app.ui.drafts[e.name];
  s.mod = Date.now();
  return { name: e.name, snap };
}
app.applyLiveRemoval = applyLiveRemoval;

async function removeLiveExercise(i) {
  const s = app.activeSession();
  if (!s) return;
  const e = app.liveExercises(s)[i];
  if (!e) return;
  const logged = app.setsFor(s, e.name);
  if (logged.length) {
    const ok = await app.ask({
      title: `Remove ${e.name}?`,
      body: `${app.pl(logged.length, "set")} will be removed from this workout.`,
      ok: "Remove",
      cancel: "Keep",
      danger: true,
    });
    if (!ok) return;
  }
  const removed = applyLiveRemoval(s, i);
  if (!removed) return;
  app.save();
  app.renderWorkout();
  app.tick();
  app.toast(`Removed ${removed.name}`, () => {
    restoreLive(s, removed.snap);
    app.save();
    app.renderWorkout();
    app.tick();
  });
}
app.removeLiveExercise = removeLiveExercise;

/* A freestyle log never starts the rest timer. The user taps Start rest, which uses the existing timer. */
function logsStartRest(s) {
  return !!(s && s.origin !== "freestyle");
}
app.logsStartRest = logsStartRest;

function historyHTML(embedded) {
  const list = app.finished().filter((s) => app.setCount(s) > 0);
  const head = embedded ? `<p class="sub" style="margin:0 0 10px">${app.pl(list.length, "workout")} logged</p>`
    : `<div class="page-head"><div><h1 class="page-title">History</h1><div class="page-sub">${app.pl(list.length, "workout")} logged</div></div></div>`;
  if (!list.length) return head + `<p class="empty" style="padding-left:0">Finished workouts show up here. Start one from Home or Workouts.</p>`;
  return head + `<ul class="hist">${list.map((s) => {
    const dur = s.startedAt && s.finishedAt ? app.fmtDur(new Date(s.finishedAt) - new Date(s.startedAt)) : "";
    return `<li><details><summary>
        <div><div class="hist-t">${app.esc(historyTitle(s))}</div><div class="hist-d">${app.fmtDate(s.date)}${dur ? " · " + dur : ""}</div></div>
        <div class="hist-n">${app.setCount(s)}<span>sets</span></div></summary>
      <div class="hist-body">${s.entries.filter((e) => e.sets.length).map((e) =>
        `<div class="hist-ex"><b>${app.esc(e.exercise)}</b><span class="hs-row">${e.sets.map((x, j) => `<button class="hs${x.tag === "warmup" ? " wu" : ""}" data-action="hist-set" data-id="${app.esc(s.id)}" data-ex="${app.esc(e.exercise)}" data-s="${j}" aria-label="Edit set ${j + 1} of ${app.esc(e.exercise)}">${x.tag === "warmup" ? "W " : ""}${app.fmtSet(x)}</button>`).join("")}</span></div>`).join("")}
        <div class="hist-actions">${s.origin === "freestyle" ? `<button class="link-btn" data-action="save-routine" data-id="${app.esc(s.id)}">Save as routine</button>` : ""}<button class="link-btn" data-action="summary" data-id="${app.esc(s.id)}">View summary</button>
        <button class="link-btn danger" data-action="delete-s" data-id="${app.esc(s.id)}">Delete this workout</button></div></div>
      </details></li>`;
  }).join("")}</ul>`;
}
app.historyHTML = historyHTML;
