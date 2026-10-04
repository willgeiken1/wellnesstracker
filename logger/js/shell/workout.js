import { app } from "../runtime.js";

/* In-progress workout screen and bottom sheets. */
function renderWorkout() {
  const el = app.$("#workout");
  const s = app.activeSession();
  if (!s || !app.ui.workoutOpen) { el.hidden = true; document.body.classList.remove("in-workout"); return; }
  el.hidden = false;
  document.body.classList.add("in-workout");
  const list = app.liveExercises(s);
  el.innerHTML = `<div class="wo-top">
      <button class="icon-btn" data-action="minimize" aria-label="Back to home">${app.I.chevD}</button>
      <div class="wo-title"><h2>${app.esc(s.name)}</h2><span id="elapsed"></span></div>
      <div class="wo-actions"><button class="btn small cancel" data-action="cancel-workout">Cancel</button>
      <button class="btn small primary" data-action="finish">Finish</button></div></div>
    <ul class="list" id="wo-list">${list.length ? list.map((e, i) => app.exerciseHTML(s, e, i)).join("")
      : `<li class="empty">No exercises yet. Add one below.</li>`}</ul>
    <button class="add-row-btn live-add-btn" data-action="live-add-open">Add exercise</button>
    ${skippedFoot(s)}`;
}

const MORE_SVG = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>`;

function skippedFoot(s) {
  const list = Array.isArray(s.skipped) ? s.skipped : [];
  if (!list.length) return "";
  const open = !!app.ui.skippedOpen;
  const rows = open ? `<ul class="skipped-list">${list.map((x, k) => {
    const n = x.entry && x.entry.sets ? x.entry.sets.filter((z) => z && z.tag !== "warmup").length : 0;
    return `<li><span>${app.esc(x.name)}${n ? `<small>${app.pl(n, "set")} logged</small>` : ""}</span>
      <button data-action="restore-skip" data-k="${k}">Restore</button></li>`;
  }).join("")}</ul>` : "";
  return `<div class="skipped-foot"><button class="skipped-sum" data-action="skipped-toggle" aria-expanded="${open}">${list.length} skipped</button>${rows}</div>`;
}
app.renderWorkout = renderWorkout;

function machineChipHTML(name) {
  const note = app.machineNote(name);
  const safe = app.esc(name);
  if (note) return `<button class="ms-chip" data-action="ms-edit" data-name="${safe}" aria-label="Machine settings: ${app.esc(note)}">${app.GEAR_SVG}<span>${app.esc(note)}</span></button>`;
  return `<button class="ms-add" data-action="ms-edit" data-name="${safe}">${app.GEAR_SVG}<span>Machine settings</span></button>`;
}

function exerciseHTML(s, e, i) {
  const done = app.setsFor(s, e.name);
  const prev = app.lastSets(e.name, s.id);
  const open = app.ui.open === i;
  const menu = app.ui.exMenu === i;
  let html = `<li class="ex${open ? " open" : ""}" data-i="${i}">
    <div class="ex-swipe">
      <div class="ex-skip-bg" aria-hidden="true">Skip</div>
      <div class="ex-face">
    <div class="ex-top">
    <button class="ex-head" data-action="toggle" data-i="${i}" aria-expanded="${open}">
      <span class="ex-name">${app.esc(e.name)}</span>
      <span class="ex-count${done.length ? " has" : ""}">${done.filter(app.isWork).length || (done.length ? "W" : "")}</span>
      <span class="ex-last">${e.original ? `Swapped in for ${app.esc(e.original)} · ` : ""}${app.esc(prev ? "Last: " + prev.filter((x) => x.tag !== "warmup").map(app.fmtSet).join(", ") : "No previous sets")}</span>
    </button>
    <button class="ex-more" data-action="ex-menu" data-i="${i}" aria-label="Options for ${app.esc(e.name)}" aria-haspopup="menu" aria-expanded="${menu}">${MORE_SVG}</button>
    </div>
    ${menu ? `<div class="ex-menu" role="menu"><button role="menuitem" data-action="skip-today" data-i="${i}">Skip for today</button></div>` : ""}
    <div class="ex-ms">${machineChipHTML(e.name)}</div>`;
  if (open) {
    const d = app.draftFor(s, e.name);
    const worked = done.filter(app.isWork).length;
    const sg = worked ? null : app.suggestion(e.name, s.id);
    let wi = 0;
    html += `<div class="panel"><div class="panel-top"><button class="link-inline" data-action="swap-open" data-i="${i}">Swap exercise</button></div>
      ${sg ? app.suggestionHTML(sg, i) : (worked ? "" : app.readinessQuietHTML())}
      ${done.length ? `<ol class="sets">${done.map((x, j) => {
        const badges = `${x.tag === "failure" ? `<span class="badge fail">F</span>` : ""}${x.pr && x.pr.length ? `<span class="badge pr">PR</span>` : ""}${x.rpe ? `<span class="badge rpe">RPE ${x.rpe}</span>` : ""}`;
        return `<li><span class="set-n${x.tag === "warmup" ? " wu" : ""}">${x.tag === "warmup" ? "W" : ++wi}</span><button class="set-v set-edit" data-action="set-edit" data-i="${i}" data-s="${j}" aria-label="Edit set ${j + 1}">${app.fmtSet(x)}${badges ? `<span class="set-badges">${badges}</span>` : ""}</button>
      <button class="set-x" data-action="delset" data-i="${i}" data-s="${j}" aria-label="Remove set ${j + 1}">×</button>
      ${x.note ? `<span class="set-note">${app.esc(x.note)}</span>` : ""}</li>`;
      }).join("")}</ol>` : ""}
      <div class="uni-row"><span id="uni-l-${i}">Unilateral</span>
        <button class="switch" role="switch" aria-checked="${app.isUni(e.name)}" aria-labelledby="uni-l-${i}" data-action="uni" data-i="${i}"><i></i></button></div>
      ${app.isUni(e.name) ? `<div class="side-l">Left</div>${app.stepPair(i, d, "w", "r", app.canBW(e.name))}<div class="side-l">Right</div>${app.stepPair(i, d, "wR", "rR", app.canBW(e.name))}` : app.stepPair(i, d, "w", "r", app.canBW(e.name))}
      <input class="note" data-field="note" data-i="${i}" autocomplete="off" placeholder="Note (optional)" value="${app.esc(d.note)}">
      <div class="tags" role="group" aria-label="Set type">
        <button data-action="tag" data-t="warmup" data-i="${i}" aria-pressed="${d.tag === "warmup"}">Warm-up</button>
        <button data-action="tag" data-t="failure" data-i="${i}" aria-pressed="${d.tag === "failure"}">To failure</button></div>
      ${app.rpeChipsHTML("rpe", d.rpe || null, i)}
      <button class="log" data-action="log" data-i="${i}">${d.tag === "warmup" ? "Log warm-up" : `Log set ${worked + 1}`}</button></div>`;
  }
  return html + "</div></div></li>";
}
app.exerciseHTML = exerciseHTML;

function renderSheet() {
  if (app.ui.sheet !== "food-barcode") app.stopBarcode();
  const el = app.$("#sheet");
  if (!app.ui.sheet) { el.hidden = true; el.innerHTML = ""; return; }
  el.hidden = false;
  let inner = "";
  if (app.ui.sheet === "plan") {
    const d = app.ui.sd.date, cur = app.state.plan[d];
    inner = `<h3>${app.fmtDate(d, { weekday: "long", month: "long", day: "numeric" })}</h3>
      ${app.state.workouts.map((w) => `<button class="opt" data-action="set-plan" data-id="${app.esc(w.id)}" aria-pressed="${cur === w.id}"><span>${app.esc(w.name)}</span><span class="sec-sub">${app.pl(w.exercises.length, "exercise")}</span></button>`).join("")}
      <button class="opt" data-action="set-plan" data-id="rest" aria-pressed="${cur === "rest"}"><span>Rest day</span></button>
      ${cur ? `<button class="opt clear" data-action="set-plan" data-id="">Clear plan</button>` : ""}`;
  } else if (app.ui.sheet === "food-add") { inner = app.foodAddSheetHTML();
  } else if (app.ui.sheet === "food-photo") { inner = app.foodPhotoSheetHTML();
  } else if (app.ui.sheet === "food-describe") { inner = app.foodDescribeSheetHTML();
  } else if (app.ui.sheet === "food-review") { inner = app.foodReviewSheetHTML();
  } else if (app.ui.sheet === "food-manual") { inner = app.foodManualSheetHTML();
  } else if (app.ui.sheet === "food-saved") { inner = app.foodSavedSheetHTML();
  } else if (app.ui.sheet === "food-barcode") { inner = app.foodBarcodeSheetHTML();
  } else if (app.ui.sheet === "food-targets") { inner = app.targetsSheetHTML();
  } else if (app.ui.sheet === "food-cal") { inner = app.foodCalSheetHTML();
  } else if (app.ui.sheet === "cardio-new") { inner = app.cardioNewSheetHTML();
  } else if (app.ui.sheet === "cardio-change") { inner = app.cardioChangeSheetHTML();
  } else if (app.ui.sheet === "cardio-log") { inner = app.cardioLogSheetHTML();
  } else if (app.ui.sheet === "cardio-sum") { inner = app.cardioSummarySheetHTML();
  } else if (app.ui.sheet === "cardio-goal") { inner = app.cardioGoalSheetHTML();
  } else if (app.ui.sheet === "phday") {
    inner = app.daySheetHTML();
  } else if (app.ui.sheet === "summary") {
    inner = app.summaryHTML(app.ui.sd.id);
  } else if (app.ui.sheet === "set-edit") {
    inner = app.setEditSheetHTML();
  } else if (app.ui.sheet === "swap") {
    inner = app.swapSheetHTML();
  } else if (app.ui.sheet === "goal") {
    inner = app.goalSheetHTML();
  } else if (app.ui.sheet === "goalweek") {
    inner = app.weekGoalSheetHTML();
  } else if (app.ui.sheet === "profile") {
    inner = `<h3>Edit profile</h3>${app.profileFormHTML(false)}
      <button class="btn primary block" data-action="pf-save">Save profile</button>`;
  } else if (app.ui.sheet === "weigh") {
    inner = app.weighSheetHTML();
  } else if (app.ui.sheet === "auth") {
    const up = app.ui.sd.mode === "signup";
    inner = `<h3>${up ? "Create account" : "Sign in"}</h3>
      <p class="sub" style="margin:-6px 0 14px">${up ? "Your workouts on this phone will be backed up to your new account." : "Sign in to back up your workouts and connect Oura."}</p>
      <label class="field-label" for="authEmail">Email</label>
      <input class="text-in" id="authEmail" type="email" inputmode="email" autocomplete="email" autocapitalize="off" value="${app.esc(app.ui.sd.email || "")}">
      <label class="field-label" for="authPw">Password${up ? " (6+ characters)" : ""}</label>
      <input class="text-in" id="authPw" type="password" autocomplete="${up ? "new-password" : "current-password"}">
      <button class="btn primary block" data-action="auth-go">${up ? "Create account" : "Sign in"}</button>
      <button class="link-btn" style="display:block;margin:10px auto 0" data-action="auth-mode">${up ? "Already have an account? Sign in" : "New here? Create an account"}</button>`;
  } else if (app.ui.sheet === "lift") {
    inner = app.liftSheetHTML(app.ui.sd.name);
  } else if (app.ui.sheet === "w-add") {
    inner = app.addSheetHTML();
  } else if (app.ui.sheet === "ms-list") { inner = app.machineListSheetHTML();
  } else if (app.ui.sheet === "ms-edit") { inner = app.machineEditSheetHTML();
  } else if (app.ui.sheet === "meas-log") { inner = app.measLogSheetHTML();
  } else if (app.ui.sheet === "meas-detail") { inner = app.measDetailSheetHTML();
  } else if (app.ui.sheet === "priv-summary") { inner = app.summarySheetHTML();
  } else if (app.ui.sheet === "priv-range") { inner = app.rangeSheetHTML();
  } else if (app.ui.sheet === "priv-delete") { inner = app.deleteSheetHTML();
  } else if (app.ui.sheet === "priv-passcode") { inner = app.passcodeSheetHTML();
  } else if (app.ui.sheet === "live-add") {
    inner = app.liveAddSheetHTML();
  } else if (app.ui.sheet === "picker") {
    inner = app.pickerSheetHTML();
  } else if (app.ui.sheet === "exercise") {
    const editing = app.ui.sd.idx >= 0;
    inner = `<h3>${editing ? "Edit exercise" : "Add exercise"}</h3>
      <label class="field-label" for="exName">Name</label>
      <input class="text-in" id="exName" autocomplete="off" placeholder="e.g. Hack Squat" value="${app.esc(app.ui.sd.name)}">
      <span class="field-label">Muscles worked</span>
      ${app.muscleMode() === "advanced" ? app.ASSETS.advGroups.map(([g, items]) => `<div class="mc-g">${g}</div><div class="mchips">${items.map(([k, n]) =>
        `<button class="mchip" data-action="toggle-a" data-m="${k}" aria-pressed="${app.ui.sd.adv.has(k)}">${n}</button>`).join("")}</div>`).join("")
      : `<div class="mchips">${Object.keys(app.MUSCLES).map((k) =>
        `<button class="mchip" data-action="toggle-m" data-m="${k}" aria-pressed="${app.ui.sd.muscles.has(k)}">${app.MUSCLES[k]}</button>`).join("")}</div>`}
      <div class="sheet-actions">${editing ? `<button class="btn danger" data-action="ex-delete">Remove</button>` : ""}
        <button class="btn primary" data-action="ex-save">${editing ? "Save" : "Add exercise"}</button></div>`;
  }
  el.innerHTML = `<div class="sheet-back" data-action="sheet-close"></div>
    <div class="sheet-card" role="dialog" aria-modal="true"><div class="grabber"></div>
    <button class="sheet-x" data-action="sheet-close" aria-label="Close">×</button>${inner}</div>`;
}
app.renderSheet = renderSheet;

/* Swipe an exercise left to skip it for today. Vertical movement keeps scrolling. */
function bindSkipSwipe() {
  const root = document.getElementById("workout");
  if (!root || root.dataset.skipBound) return;
  root.dataset.skipBound = "1";
  let g = null;
  const ignore = "input, textarea, select, .ex-more, .ex-menu, .step-row, .log, .set-x, .set-edit, .switch, .ms-chip, .ms-add, .link-inline, .tags, .rpe, .sugg, .note, .skipped-foot";
  root.addEventListener("pointerdown", (ev) => {
    if (!app.ui.workoutOpen || (ev.button != null && ev.button !== 0)) return;
    const face = ev.target.closest && ev.target.closest(".ex-face");
    if (!face || (ev.target.closest && ev.target.closest(ignore))) return;
    const li = face.closest(".ex");
    if (!li || li.dataset.i == null) return;
    g = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, face, i: +li.dataset.i, dx: 0, lock: null };
  });
  root.addEventListener("pointermove", (ev) => {
    if (!g || ev.pointerId !== g.id) return;
    const dx = ev.clientX - g.x, dy = ev.clientY - g.y;
    if (!g.lock) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if (Math.abs(dy) > Math.abs(dx)) { g = null; return; }
      g.lock = "h";
      g.face.parentElement.classList.add("dragging");
      try { g.face.setPointerCapture(ev.pointerId); } catch (e) { /* already gone */ }
    }
    if (g.lock !== "h") return;
    ev.preventDefault();
    const pull = Math.max(-120, Math.min(0, dx));
    g.dx = pull;
    g.face.style.transform = `translate3d(${pull}px,0,0)`;
    g.face.parentElement.classList.toggle("armed", pull <= -72);
  }, { passive: false });
  const end = (ev) => {
    if (!g || ev.pointerId !== g.id) return;
    const commit = g.lock === "h" && g.dx <= -72;
    const face = g.face, i = g.i, horizontal = g.lock === "h";
    face.style.transform = "";
    const swipe = face.parentElement;
    if (swipe) { swipe.classList.remove("dragging", "armed"); }
    g = null;
    if (horizontal) {
      app.suppressToggle = true;
      setTimeout(() => { app.suppressToggle = false; }, 400);
    }
    if (commit) app.skipExerciseAt(i);
  };
  root.addEventListener("pointerup", end);
  root.addEventListener("pointercancel", end);
}
bindSkipSwipe();
