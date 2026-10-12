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

function historyHTML(embedded) {
  const list = app.finished().filter((s) => app.setCount(s) > 0);
  const head = embedded ? `<p class="sub" style="margin:0 0 10px">${app.pl(list.length, "workout")} logged</p>`
    : `<div class="page-head"><div><h1 class="page-title">History</h1><div class="page-sub">${app.pl(list.length, "workout")} logged</div></div></div>`;
  if (!list.length) return head + `<p class="empty" style="padding-left:0">Finished workouts show up here. Start one from Home or Workouts.</p>`;
  return head + `<ul class="hist">${list.map((s) => {
    const dur = s.startedAt && s.finishedAt ? app.fmtDur(new Date(s.finishedAt) - new Date(s.startedAt)) : "";
    return `<li><details><summary>
        <div><div class="hist-t">${app.esc(s.name)}</div><div class="hist-d">${app.fmtDate(s.date)}${dur ? " · " + dur : ""}</div></div>
        <div class="hist-n">${app.setCount(s)}<span>sets</span></div></summary>
      <div class="hist-body">${s.entries.filter((e) => e.sets.length).map((e) =>
        `<div class="hist-ex"><b>${app.esc(e.exercise)}</b><span class="hs-row">${e.sets.map((x, j) => `<button class="hs${x.tag === "warmup" ? " wu" : ""}" data-action="hist-set" data-id="${app.esc(s.id)}" data-ex="${app.esc(e.exercise)}" data-s="${j}" aria-label="Edit set ${j + 1} of ${app.esc(e.exercise)}">${x.tag === "warmup" ? "W " : ""}${app.fmtSet(x)}</button>`).join("")}</span></div>`).join("")}
        <div class="hist-actions">${s.origin === "freestyle" ? `<button class="link-btn" data-action="save-routine" data-id="${app.esc(s.id)}">Save as routine</button>` : ""}<button class="link-btn" data-action="summary" data-id="${app.esc(s.id)}">View summary</button>
        <button class="link-btn danger" data-action="delete-s" data-id="${app.esc(s.id)}">Delete this workout</button></div></div>
      </details></li>`;
  }).join("")}</ul>`;
}
app.historyHTML = historyHTML;
