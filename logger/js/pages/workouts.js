import { app } from "../runtime.js";

/* Workouts list, routine detail, and history. */
/* ================= Tab motion: bubble + slide + swipe ================= */
const GEAR_SVG = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`;
app.GEAR_SVG = GEAR_SVG;

function workoutsHTML() {
  const seg = `<div class="seg2" role="tablist"><button data-action="wseg" data-seg="routines" aria-pressed="${app.ui.wseg === "routines"}">Routines</button>
    <button data-action="wseg" data-seg="history" aria-pressed="${app.ui.wseg === "history"}">History</button><button class="icon-btn gear-btn" data-action="ms-list" aria-label="Machine settings">${app.GEAR_SVG}</button></div>`;
  const plus = `<button class="plus-btn" data-action="new-workout" aria-label="New workout">${app.PLUS_SVG}</button>`;
  if (app.ui.wseg === "history") return app.pageHead("Workouts", "", { below: plus }) + seg + app.historyHTML(true);
  if (app.ui.edit === "routines") return `${app.pageHead("Workouts", "Drag to reorder · × to delete", { below: plus })}${seg}${app.routinesEditHTML()}`;
  return `${app.pageHead("Workouts", "Tap one to edit or start it · hold to rearrange", { below: plus })}${seg}
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
        </button>
        <span class="handle" aria-label="Drag to reorder ${app.esc(e.name)}">${app.I.grip}</span>
      </li>`).join("")}</ul>
    <button class="add-row-btn" data-action="open-picker">Add exercises</button>
    <div class="start-bar"><button class="btn primary block" data-action="start" data-id="${app.esc(w.id)}">Start ${app.esc(w.name)}</button></div>`;
}
app.detailHTML = detailHTML;

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
        <div class="hist-actions"><button class="link-btn" data-action="summary" data-id="${app.esc(s.id)}">View summary</button>
        <button class="link-btn danger" data-action="delete-s" data-id="${app.esc(s.id)}">Delete this workout</button></div></div>
      </details></li>`;
  }).join("")}</ul>`;
}
app.historyHTML = historyHTML;
