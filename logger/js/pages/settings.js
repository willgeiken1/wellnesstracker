import { app } from "../runtime.js";

/* Settings, appearance, measurements, machine notes. */
/* ================= Machine settings notes ================= */
function machineNote(name) {
  const v = app.state.machineNotes && app.state.machineNotes[name];
  if (typeof v === "string") return v;
  if (!v || typeof v !== "object" || v.gone) return "";
  return v.text || "";
}
app.machineNote = machineNote;

function allRoutineExercises() {
  const seen = new Set(), out = [];
  app.state.workouts.forEach((w) => w.exercises.forEach((e) => { if (!seen.has(e.name)) { seen.add(e.name); out.push({ name: e.name, routine: w.name }); } }));
  return out;
}
app.allRoutineExercises = allRoutineExercises;

function machineListSheetHTML() {
  const q = (app.ui.sd.q || "").trim().toLowerCase();
  const byRoutine = {};
  app.allRoutineExercises().filter((e) => !q || e.name.toLowerCase().includes(q)).forEach((e) => (byRoutine[e.routine] = byRoutine[e.routine] || []).push(e));
  const rows = Object.entries(byRoutine).map(([r, list]) => `<div class="mini-l">${app.esc(r)}</div>` + list.map((e) => {
    const n = app.machineNote(e.name);
    return `<button class="ms-row" data-action="ms-edit" data-name="${app.esc(e.name)}"><span><b>${app.esc(e.name)}</b><em>${n ? app.esc(n) : "No settings saved"}</em></span>${app.I.chevR}</button>`;
  }).join("")).join("");
  return `<h3>Machine settings</h3><p class="sub" style="margin:-6px 0 12px">Save how you set up each machine (seat height, pads, pin positions). It shows on that exercise during your workout.</p>
    <input class="text-in" id="ms-q" type="search" autocomplete="off" placeholder="Search your exercises" value="${app.esc(app.ui.sd.q || "")}">
    ${rows || `<p class="sub">No exercises match.</p>`}`;
}
app.machineListSheetHTML = machineListSheetHTML;

function machineEditSheetHTML() {
  const n = app.ui.sd.name;
  return `<h3>${app.esc(n)}</h3><label class="field-label" for="ms-text">Machine settings</label>
    <textarea class="text-in ms-text" id="ms-text" rows="3" placeholder="e.g. Seat 5, back pad 3, handles on the middle setting">${app.esc(app.machineNote(n))}</textarea>
    <div class="sheet-actions"><button class="btn primary" data-action="ms-save">Save</button></div>
    ${app.ui.sd.back ? `<button class="link-btn" data-action="ms-list" style="display:block;margin:10px auto 0">Back to all exercises</button>` : ""}`;
}
app.machineEditSheetHTML = machineEditSheetHTML;

/* ================= Body measurements ================= */
const MEAS = [["chest", "Chest"], ["waist", "Waist"], ["hips", "Hips"], ["arms", "Arms"], ["thighs", "Thighs"], ["calves", "Calves"], ["neck", "Neck"]];
app.MEAS = MEAS;

const lenUnit = () => (app.units() === "metric" ? "cm" : "in");
app.lenUnit = lenUnit;

const cmToDisp = (cm) => (app.units() === "metric" ? cm : cm / 2.54);
app.cmToDisp = cmToDisp;

const dispToCm = (v) => (app.units() === "metric" ? v : v * 2.54);
app.dispToCm = dispToCm;

function meas() { app.state.measurements = app.state.measurements || {}; return app.state.measurements; }
app.meas = meas;

   // { date: { vals: {key: cm}, at } }
function measSeries(key) {
  return Object.keys(app.meas()).sort().map((d) => ({ date: d, cm: app.meas()[d].vals[key] })).filter((p) => p.cm != null);
}
app.measSeries = measSeries;

function measurementsHTML() {
  const rows = app.MEAS.map(([k, label]) => {
    const s = app.measSeries(k);
    if (!s.length) return "";
    const last = s[s.length - 1], first = s[0], ch = app.cmToDisp(last.cm) - app.cmToDisp(first.cm);
    const pts = s.slice(-12).map((p) => app.cmToDisp(p.cm)), lo = Math.min(...pts), hi = Math.max(...pts);
    const spark = pts.length > 1 ? `<svg class="m-spark" viewBox="0 0 60 20" aria-hidden="true"><polyline points="${pts.map((v, i) => `${(i / (pts.length - 1)) * 58 + 1},${hi === lo ? 10 : 18 - (v - lo) / (hi - lo) * 16}`).join(" ")}"/></svg>` : "";
    return `<button class="m-row" data-action="meas-detail" data-k="${k}"><span class="m-name">${label}</span>${spark}
      <span class="m-val"><b>${app.fmtNum(Math.round(app.cmToDisp(last.cm) * 10) / 10)}<small> ${app.lenUnit()}</small></b>${s.length > 1 ? `<em>${app.signed(ch, 1)} since ${app.fmtDate(first.date, { month: "short", day: "numeric" })}</em>` : `<em>${app.fmtDate(last.date, { month: "short", day: "numeric" })}</em>`}</span></button>`;
  }).join("");
  return `<div class="sec-h" style="margin-top:22px"><h3>Measurements</h3><button class="link-inline" data-action="meas-log">Log</button></div>
    <div class="card meas">${rows || `<p class="sub">Track your waist, chest, arms and more. On a bulk, arms and chest going up while your waist stays steady is a good sign the weight is muscle.</p>
      <button class="btn primary block" data-action="meas-log" style="margin-top:12px">Log measurements</button>`}</div>`;
}
app.measurementsHTML = measurementsHTML;

function measLogSheetHTML() {
  const d = app.ui.sd.date || app.today(), cur = (app.meas()[d] || {}).vals || {};
  const lastOf = (k) => { const s = app.measSeries(k); return s.length ? s[s.length - 1].cm : null; };
  return `<h3>Log measurements</h3>
    <label class="field-label" for="ms-date">Date</label><input class="text-in" id="ms-date" type="date" max="${app.today()}" value="${d}">
    <p class="sub small" style="margin:-6px 0 10px">In ${app.lenUnit() === "in" ? "inches" : "centimeters"}. Fill in whichever you measured; blanks are skipped.</p>
    <div class="fm-grid">${app.MEAS.map(([k, label]) => {
      const v = cur[k] != null ? cur[k] : null, prev = lastOf(k);
      return `<label><span>${label}</span><input class="text-in" id="mz-${k}" inputmode="decimal" placeholder="${prev != null ? app.fmtNum(Math.round(app.cmToDisp(prev) * 10) / 10) : "—"}" value="${v != null ? app.fmtNum(Math.round(app.cmToDisp(v) * 10) / 10) : ""}"></label>`;
    }).join("")}</div>
    <button class="btn primary block" data-action="meas-save">Save</button>
    <p class="sub small">Tip: measure at the same time of day, relaxed, with the tape snug but not tight.</p>`;
}
app.measLogSheetHTML = measLogSheetHTML;

function measDetailSheetHTML() {
  const k = app.ui.sd.k, label = (app.MEAS.find((m) => m[0] === k) || [])[1], s = app.measSeries(k);
  return `<h3>${label}</h3>
    ${s.length > 1 ? app.chartSVG({ labels: s.map((p) => p.date), series: [{ data: s.map((p) => Math.round(app.cmToDisp(p.cm) * 10) / 10), cls: "ln" }], h: 110 }) : ""}
    <ul class="wi-list">${[...s].reverse().map((p) => `<li><span>${app.fmtDate(p.date, { month: "short", day: "numeric", year: "numeric" })}</span><b>${app.fmtNum(Math.round(app.cmToDisp(p.cm) * 10) / 10)} ${app.lenUnit()}</b>
      <button class="set-x" data-action="meas-del" data-date="${p.date}" aria-label="Delete ${label} from ${app.fmtDate(p.date)}">×</button></li>`).join("")}</ul>`;
}
app.measDetailSheetHTML = measDetailSheetHTML;

/* ================= Appearance ================= */
const ACCENTS = [
  { id: "citrus", name: "Citrus", c: ["#D5F56B", "#C7B5FA", "#F5BEDB"] },
  { id: "sea", name: "Sea Glass", c: ["#2D6876", "#67B39F", "#CEDFCC"] },
  { id: "dusk", name: "Dusk", c: ["#A9B8FF", "#CDBEF3", "#F3CAD6"] },
  { id: "sand", name: "Sandstone", c: ["#F4BE8C", "#E7D3BC", "#CBDCC4"] },
];
app.ACCENTS = ACCENTS;

function applyTheme() {
  const t = app.state.theme || {};
  const root = document.documentElement;
  root.dataset.mode = t.mode === "light" ? "light" : "dark";
  root.dataset.accent = app.ACCENTS.some((a) => a.id === t.accent) ? t.accent : "citrus";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", root.dataset.mode === "light" ? "#F3F4F1" : "#0F0F11");
}
app.applyTheme = applyTheme;

app.applyTheme();

function appearanceHTML() {
  const t = app.state.theme || {};
  return `<div class="group-label">Appearance</div>
    <div class="group">
      <div class="mode-row"><div class="seg2" role="radiogroup" aria-label="Mode">
        <button data-action="theme-mode" data-m="dark" aria-pressed="${t.mode !== "light"}">Dark</button>
        <button data-action="theme-mode" data-m="light" aria-pressed="${t.mode === "light"}">Light</button></div></div>
      <div class="swatches" role="radiogroup" aria-label="Accent colors">${app.ACCENTS.map((a) =>
        `<button class="sw" data-action="theme-accent" data-a="${a.id}" aria-pressed="${(t.accent || "citrus") === a.id}">
          <span class="sw-dots">${a.c.map((c) => `<i style="background:${c}"></i>`).join("")}</span><span>${a.name}</span></button>`).join("")}</div>
    </div>`;
}
app.appearanceHTML = appearanceHTML;

function settingsHTML() {
  const days = app.state.lastExport ? Math.floor((Date.now() - app.state.lastExport) / 86400000) : null;
  const lastExp = days == null ? "Never" : days === 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`;
  const p = app.state.profile, lastW = app.weighIns().pop();
  return `<div class="detail-top"><button class="icon-btn" data-action="tab" data-tab="${app.ui.prevTab && app.ui.prevTab !== "settings" ? app.ui.prevTab : "home"}" aria-label="Back">${app.I.chevL}</button></div>
    <div class="page-head"><div><h1 class="page-title">Settings</h1></div></div>
    <div class="group-label">Profile</div>
    <div class="group">
      <button class="set-row" data-action="pf-edit"><span>${p && p.name ? app.esc(p.name) : "Set up your profile"}</span>
        <span class="sub">${app.profileComplete() ? `${app.ageOn(p.dob)} · ${app.fmtHeight(p.heightCm)} · ${app.fmtW(app.kgToDisp(lastW.kg))}` : "Edit"}</span></button>
      <button class="set-row" data-action="photo-pick"><span>Profile photo</span><span class="sub">${p && p.photo ? `<img class="set-ph" src="${p.photo}" alt=""> Change` : "Add from your photos"}</span></button>
      ${p && p.photo ? `<button class="set-row" data-action="photo-remove"><span class="danger-t">Remove profile photo</span><span></span></button>` : ""}
      <button class="set-row" data-action="weigh-open"><span>Log weigh-in</span><span class="sub">${lastW ? "Last: " + app.fmtDate(lastW.date, { month: "short", day: "numeric" }) : ""}</span></button>
    </div>
    ${app.installPrompt ? `<div class="card install-card"><h4>Install Insight</h4><p class="sub">Add Insight to your home screen so it opens full-screen like a regular app.</p>
      <button class="btn primary block" data-action="install-app" style="margin-top:12px">Install</button></div>` : ""}
    <div class="group-label">Muscle detail</div>
    <div class="group"><div class="mode-row"><div class="seg2" role="radiogroup" aria-label="Muscle detail">
      <button data-action="set-mode" data-m="basic" aria-pressed="${app.muscleMode() === "basic"}">Basic</button>
      <button data-action="set-mode" data-m="advanced" aria-pressed="${app.muscleMode() === "advanced"}">Advanced</button></div></div>
      <p class="sub small" style="margin:8px 0 12px">${app.muscleMode() === "advanced" ? `Advanced shows ${Object.keys(app.ADV).length} individual muscles, like each head of the triceps, on exercises and on your diagram.` : `Basic groups muscles into ${Object.keys(app.MUSCLES).length} areas, like chest and triceps. Advanced shows ${Object.keys(app.ADV).length} individual muscles.`}</p></div>
    <input type="file" id="avatar-file" accept="image/*" hidden>
    <div class="group-label">Goals</div>
    <div class="group">
      <button class="set-row" data-action="goal-week"><span>Weekly sessions</span><span class="sub">${app.goals().sessionsPerWeek ? app.goals().sessionsPerWeek + " per week" : "Off"}</span></button>
      <button class="set-row" data-action="goal-open-insights"><span>Lift goals</span><span class="sub">${Object.keys(app.goals().lifts).length || "None yet"}</span></button>
    </div>
    ${app.appearanceHTML()}
    <div class="group-label">Rest timer</div>
    <div class="group"><div class="seg">${[60, 90, 120, 180].map((s) =>
      `<button data-action="rest" data-s="${s}" aria-pressed="${app.state.restSeconds === s}">${app.fmtTime(s)}</button>`).join("")}</div></div>
    <div class="group-label">Account</div>
    <div class="group">${app.session
      ? `<div class="set-row"><span>Signed in</span><span class="sub">${app.esc(app.session.user.email || "")}</span></div>
         <div class="set-row"><span>Cloud backup</span><span class="sub">${app.state.lastCloud ? "On · saved " + new Date(app.state.lastCloud).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "On"}</span></div>
         <button class="set-row" data-action="sign-out"><span>Sign out</span></button>`
      : `<button class="set-row" data-action="auth-open"><span>Sign in or create an account</span>${app.I.chevR}</button>`}</div>
    ${app.session ? "" : `<p class="hint">An account backs up your workouts to the cloud and lets you connect Oura.</p>`}
    ${app.privacySectionHTML()}
    <div class="group-label">Oura Ring</div>
    <div class="group">
      ${app.state.oura.connected
        ? `<div class="set-row"><span>Connection</span><span class="sub">Connected</span></div>
           <button class="set-row" data-action="oura-sync"><span>Sync now</span><span class="sub">${app.ui.ouraSyncing ? "Syncing…" : app.syncedAgo()}</span></button>
           <button class="set-row" data-action="oura-disconnect"><span style="color:var(--red)">Disconnect Oura</span></button>`
        : `<button class="set-row" data-action="oura-connect"><span>${app.session ? "Connect Oura" : "Sign in to connect Oura"}</span>${app.I.chevR}</button>`}
      <button class="set-row" data-action="${app.state.demo ? "demo-off" : "demo-on"}"><span>Preview with sample data</span><span class="sub">${app.state.demo ? "On" : "Off"}</span></button>
    </div>
    <p class="hint">Sample data fills Recovery and Insights for exploring. It never mixes with your real workouts or Oura data.</p>
    <div class="group-label">Backup</div>
    <div class="group">
      <button class="set-row" data-action="export"><span>Export workouts</span><span class="sub">Last: ${lastExp}</span></button>
      <button class="set-row" data-action="import"><span>Restore from a backup</span>${app.I.chevR}</button>
    </div>
    <p class="hint">${app.session ? "Your workouts back up to your account automatically. You can still export a copy any time." : "Workouts are saved on this phone only until you sign in. Export a backup every week or so."}${app.IS_IOS ? " Always open Insight from the Home Screen icon, not a Safari tab, because iOS keeps their data separate." : ""}</p>
    <p class="hint">Weights are in ${app.units() === "metric" ? "kilograms" : "pounds"}; change units in your profile. Leave weight blank to log a bodyweight set.</p>`;
}
app.settingsHTML = settingsHTML;
