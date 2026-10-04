import { app } from "../runtime.js";

/* Profile, units, and weigh-ins. */
/* ================= Profile, units, bodyweight ================= */
const LB = 2.20462;
app.LB = LB;

const ACTIVITY = {
  sitting: { label: "Mostly sitting", sub: "Desk job, little walking", steps: 4000 },
  light:   { label: "Lightly active", sub: "Some walking most days", steps: 7000 },
  active:  { label: "Active", sub: "On my feet a lot", steps: 10000 },
  very:    { label: "Very active", sub: "On my feet all day, physical job", steps: 14000 },
};
app.ACTIVITY = ACTIVITY;

const units = () => (app.state.profile && app.state.profile.units) || "imperial";
app.units = units;

const wUnit = () => (app.units() === "metric" ? "kg" : "lb");
app.wUnit = wUnit;

const wStep = () => (app.units() === "metric" ? 2.5 : 5);
app.wStep = wStep;

const kgToDisp = (kg) => (app.units() === "metric" ? kg : kg * app.LB);
app.kgToDisp = kgToDisp;

const dispToKg = (v) => (app.units() === "metric" ? v : v / app.LB);
app.dispToKg = dispToKg;

const round1 = (v) => Math.round(v * 10) / 10;
app.round1 = round1;

function profileComplete(p = app.state.profile) {
  return !!(p && p.name && p.dob && p.sex && p.units && p.heightCm && p.weighIns && p.weighIns.length);
}
app.profileComplete = profileComplete;

function ageOn(dob, date = app.today()) {
  if (!dob) return null;
  const b = app.parseDay(dob), d = app.parseDay(date);
  let a = d.getFullYear() - b.getFullYear();
  if (d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())) a--;
  return a;
}
app.ageOn = ageOn;

const firstName = () => (app.state.profile && app.state.profile.name ? app.state.profile.name.trim().split(/\s+/)[0] : "");
app.firstName = firstName;

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
app.greeting = greeting;

function fmtHeight(cm) {
  if (!cm) return "–";
  if (app.units() === "metric") return `${Math.round(cm)} cm`;
  const tin = Math.round(cm / 2.54);
  return `${Math.floor(tin / 12)}′${tin % 12}″`;
}
app.fmtHeight = fmtHeight;

const weighIns = () => [...((app.state.profile && app.state.profile.weighIns) || [])].sort((a, b) => a.date.localeCompare(b.date));
app.weighIns = weighIns;

/* Bodyweight (in the person's units) on a date: the latest weigh-in on or before it, else the earliest one. */
function bodyweightOn(date) {
  const w = app.weighIns();
  if (!w.length) return null;
  const before = w.filter((x) => x.date <= date);
  return app.kgToDisp((before.length ? before[before.length - 1] : w[0]).kg);
}
app.bodyweightOn = bodyweightOn;

const fmtW = (v) => (v == null ? "–" : `${app.round1(v)} ${app.wUnit()}`);
app.fmtW = fmtW;

/* Typical overnight HRV (RMSSD, ms) by age and sex: 10th / 50th / 90th percentile.
   From published wearable age charts; a rough guide, not a medical standard. */
const HRV_NORMS = [
  { max: 24, male: [27, 46, 85], female: [26, 48, 82] },
  { max: 34, male: [24, 41, 77], female: [23, 43, 73] },
  { max: 44, male: [21, 34, 66], female: [20, 36, 60] },
  { max: 54, male: [19, 28, 58], female: [18, 30, 52] },
  { max: 64, male: [17, 24, 50], female: [16, 25, 46] },
  { max: 74, male: [15, 22, 44], female: [14, 23, 40] },
  { max: 200, male: [13, 20, 39], female: [12, 20, 36] },
];
app.HRV_NORMS = HRV_NORMS;

function hrvNorm() {
  const p = app.state.profile, age = p && app.ageOn(p.dob);
  if (age == null || !p.sex) return null;
  const row = app.HRV_NORMS.find((r) => age <= r.max);
  return { age, sex: p.sex, p: row[p.sex] };
}
app.hrvNorm = hrvNorm;

function hrvAgeCardHTML(avg30) {
  const n = app.hrvNorm();
  if (!n || avg30 == null) return "";
  const [p10, p50, p90] = n.p, lo = Math.min(p10 * 0.7, avg30 * 0.9), hi = Math.max(p90 * 1.15, avg30 * 1.1);
  const X = (v) => ((v - lo) / (hi - lo) * 100).toFixed(1);
  const where = avg30 >= p90 ? "in the top 10% for" : avg30 >= p50 ? "above the middle for" : avg30 >= p10 ? "below the middle for" : "in the bottom 10% for";
  return `<div class="card"><h4>HRV for your age</h4>
    <p class="sub">Your 30-day average of ${Math.round(avg30)} ms is ${where} ${n.sex === "male" ? "men" : "women"} aged ${n.age}. Your own trend matters more than this comparison.</p>
    <div class="norm"><div class="norm-band" style="left:${X(p10)}%;width:${X(p90) - X(p10)}%"></div>
      <div class="norm-mid" style="left:${X(p50)}%"></div><div class="norm-you" style="left:${X(avg30)}%"></div></div>
    <div class="norm-l"><span style="left:${X(p10)}%">${p10}</span><span style="left:${X(p50)}%">${p50} typical</span><span style="left:${X(p90)}%">${p90}</span></div>
    <p class="sub small">Shaded: the middle 80% for your age and sex (rough reference ranges). White dot: you.</p></div>`;
}
app.hrvAgeCardHTML = hrvAgeCardHTML;

/* ---------- Profile form (used for the required setup and for editing) ---------- */
function startProfileDraft() {
  const p = app.state.profile || {};
  const u = p.units || "imperial";
  const w = app.weighIns(), lastKg = w.length ? w[w.length - 1].kg : null;
  const tin = p.heightCm ? Math.round(p.heightCm / 2.54) : null;
  app.ui.pf = {
    name: p.name || "", dob: p.dob || "", sex: p.sex || "", units: u,
    ft: tin != null ? String(Math.floor(tin / 12)) : "", inch: tin != null ? String(tin % 12) : "",
    cm: p.heightCm ? String(Math.round(p.heightCm)) : "",
    weight: lastKg != null ? String(app.round1(u === "metric" ? lastKg : lastKg * app.LB)) : "",
    activity: p.activity || "",
  };
}
app.startProfileDraft = startProfileDraft;

function profileFormHTML(setup) {
  const f = app.ui.pf, imp = f.units === "imperial";
  const seg = (field, val, label) => `<button data-action="pf-pick" data-field="${field}" data-val="${val}" aria-pressed="${f[field] === val}">${label}</button>`;
  return `<label class="field-label" for="pf-name">Name</label>
    <input class="text-in" id="pf-name" data-pf="name" autocomplete="given-name" value="${app.esc(f.name)}" placeholder="Your name">
    <label class="field-label" for="pf-dob">Date of birth</label>
    <input class="text-in" id="pf-dob" data-pf="dob" type="date" max="${app.today()}" min="1920-01-01" value="${app.esc(f.dob)}">
    <span class="field-label">Sex</span>
    <div class="seg2 pf-seg">${seg("sex", "male", "Male")}${seg("sex", "female", "Female")}</div>
    <span class="field-label">Units</span>
    <div class="seg2 pf-seg">${seg("units", "imperial", "lb · ft/in")}${seg("units", "metric", "kg · cm")}</div>
    <span class="field-label">Height</span>
    ${imp ? `<div class="pf-row"><input class="text-in" id="pf-ft" data-pf="ft" inputmode="numeric" placeholder="ft" value="${app.esc(f.ft)}"><span>ft</span>
             <input class="text-in" id="pf-in" data-pf="inch" inputmode="numeric" placeholder="in" value="${app.esc(f.inch)}"><span>in</span></div>`
          : `<div class="pf-row"><input class="text-in" id="pf-cm" data-pf="cm" inputmode="numeric" placeholder="cm" value="${app.esc(f.cm)}"><span>cm</span></div>`}
    <label class="field-label" for="pf-w">${setup ? "Weight" : "Current weight"}</label>
    <div class="pf-row"><input class="text-in" id="pf-w" data-pf="weight" inputmode="decimal" placeholder="${imp ? "lb" : "kg"}" value="${app.esc(f.weight)}"><span>${imp ? "lb" : "kg"}</span></div>
    ${app.activityPickerHTML()}`;
}
app.profileFormHTML = profileFormHTML;

function onboardHTML() {
  return `<div class="ob-wrap"><h1 class="page-title">Set up your profile</h1>
    <p class="sub" style="margin:6px 0 20px">Insight uses this to show strength relative to your bodyweight, track your weight over time, and put your HRV in context for your age. Only you can see it.</p>
    ${app.profileFormHTML(true)}
    <button class="btn primary block" data-action="pf-save" style="margin-top:8px">Save and continue</button>
    <button class="link-btn" style="display:block;margin:12px auto 0" data-action="sign-out">Not you? Sign out</button></div>`;
}
app.onboardHTML = onboardHTML;

function renderOnboard() {
  const el = app.$("#onboard");
  if (!app.ui.onboard) { el.hidden = true; el.innerHTML = ""; return; }
  el.hidden = false;
  el.innerHTML = app.onboardHTML();
}
app.renderOnboard = renderOnboard;

function checkProfileGate() {
  if (app.needsLock && app.needsLock()) { app.ui.onboard = false; app.renderOnboard(); return; }
  if (app.session && !app.profileComplete()) {
    if (!app.ui.onboard) { app.ui.onboard = true; app.startProfileDraft(); }
  } else app.ui.onboard = false;
  app.renderOnboard();
}
app.checkProfileGate = checkProfileGate;

function convertLoggedWeights(fromUnits, toUnits) {
  if (fromUnits === toUnits) return 0;
  const f = toUnits === "metric" ? 1 / app.LB : app.LB;
  let n = 0;
  app.state.sessions.forEach((s) => s.entries.forEach((e) => e.sets.forEach((x) => {
    const cv = (v) => toUnits === "metric" ? Math.round(v * f * 2) / 2 : Math.round(v * f);
    if (x.w != null) { x.w = cv(x.w); n++; }
    if (x.uni) [x.uni.l, x.uni.r].forEach((y) => { if (y.w != null) y.w = cv(y.w); });
  })));
  app.ui.drafts = {};
  if (n) app.state.sessions.forEach((x) => { x.mod = Date.now(); });
  return n;
}
app.convertLoggedWeights = convertLoggedWeights;

function activityPickerHTML() {
  return `<span class="field-label">Daily activity <span class="fl-note">(used when there's no tracker data)</span></span>
    <div class="act-grid">${Object.entries(app.ACTIVITY).map(([k, a]) => `<button class="act" data-action="pf-pick" data-field="activity" data-val="${k}" aria-pressed="${app.ui.pf.activity === k}"><b>${a.label}</b><span>${a.sub}</span></button>`).join("")}</div>`;
}
app.activityPickerHTML = activityPickerHTML;

async function saveProfile() {
  const f = app.ui.pf, imp = f.units === "imperial";
  const name = f.name.trim();
  const age = app.ageOn(f.dob);
  const heightCm = imp ? ((parseInt(f.ft, 10) || 0) * 12 + (parseFloat(f.inch) || 0)) * 2.54 : parseFloat(f.cm);
  const wv = parseFloat(f.weight), kg = imp ? wv / app.LB : wv;
  if (!name) return app.toast("Enter your name.");
  if (!f.dob || age == null || age < 13 || age > 100) return app.toast("Enter a valid date of birth.");
  if (!f.sex) return app.toast("Choose male or female.");
  if (!heightCm || heightCm < 120 || heightCm > 230) return app.toast("Enter a valid height.");
  if (!kg || kg < 30 || kg > 300) return app.toast("Enter a valid weight.");

  const before = (app.state.profile && app.state.profile.units) || "imperial";
  const converted = app.convertLoggedWeights(before, f.units);
  const p = app.state.profile || { weighIns: [] };
  p.name = name; p.dob = f.dob; p.sex = f.sex; p.units = f.units; p.heightCm = Math.round(heightCm * 10) / 10;
  if (f.activity) p.activity = f.activity;
  p.weighIns = p.weighIns || [];
  const last = app.weighIns().pop();
  let entryAt = Date.now();
  if (!last || Math.abs(last.kg - kg) > 0.05) {
    entryAt = app.localStamp(p, entryAt);
    p.weighIns = p.weighIns.filter((x) => x.date !== app.today()).concat([{ date: app.today(), kg: Math.round(kg * 100) / 100, at: entryAt }]);
    if (Array.isArray(p.wDel)) p.wDel = p.wDel.filter((d) => d !== app.today());
    const frozen = p.wDelAtRaw && typeof p.wDelAtRaw[app.today()] === "number" && typeof (p.wDelAt && p.wDelAt[app.today()]) === "number" && p.wDelAt[app.today()] < entryAt;
    if (!frozen) p.wDelAt = { ...(p.wDelAt || {}), [app.today()]: entryAt - 1 };
  }
  p.updatedAt = entryAt;
  app.state.profile = p;
  app.save();
  const wasSetup = app.ui.onboard;
  app.ui.onboard = false; app.ui.sheet = null;
  app.render(); app.renderOnboard();
  app.toast(converted ? `Profile saved. Converted ${app.pl(converted, "logged set")} to ${app.wUnit()}.` : wasSetup ? `Welcome, ${app.firstName()}.` : "Profile saved.");
}
app.saveProfile = saveProfile;

/* ---------- Weigh-ins ---------- */
function weighSheetHTML() {
  const w = app.weighIns().reverse().slice(0, 6);
  return `<h3>Log weigh-in</h3>
    <div class="pf-row"><input class="text-in" id="wi-v" inputmode="decimal" placeholder="${app.wUnit()}" value="${app.esc(app.ui.sd.v || "")}"><span>${app.wUnit()}</span></div>
    <label class="field-label" for="wi-d">Date</label>
    <input class="text-in" id="wi-d" type="date" max="${app.today()}" value="${app.esc(app.ui.sd.d || app.today())}">
    <button class="btn primary block" data-action="weigh-save">Save weigh-in</button>
    ${w.length ? `<div class="mini-l" style="margin-top:18px">Recent</div><ul class="wi-list">${w.map((x) =>
      `<li><span>${app.fmtDate(x.date)}</span><b>${app.fmtW(app.kgToDisp(x.kg))}</b>
       <button class="set-x" data-action="weigh-del" data-date="${x.date}" aria-label="Delete weigh-in from ${app.fmtDate(x.date)}">×</button></li>`).join("")}</ul>` : ""}
    <p class="sub small">Weigh in at the same time of day, like first thing in the morning, for the most useful trend.</p>`;
}
app.weighSheetHTML = weighSheetHTML;

function saveWeighIn() {
  const v = parseFloat((app.$("#wi-v") || {}).value), d = (app.$("#wi-d") || {}).value || app.today();
  const kg = app.dispToKg(v);
  if (!v || kg < 30 || kg > 300) return app.toast("Enter a valid weight.");
  if (d > app.today()) return app.toast("That date is in the future.");
  app.state.profile = app.state.profile || { weighIns: [] };
  const entryAt = app.localStamp(app.state.profile, Date.now());
  app.state.profile.weighIns = (app.state.profile.weighIns || []).filter((x) => x.date !== d).concat([{ date: d, kg: Math.round(kg * 100) / 100, at: entryAt }]);
  if (Array.isArray(app.state.profile.wDel)) app.state.profile.wDel = app.state.profile.wDel.filter((day) => day !== d);
  const frozen = app.state.profile.wDelAtRaw && typeof app.state.profile.wDelAtRaw[d] === "number" && typeof (app.state.profile.wDelAt && app.state.profile.wDelAt[d]) === "number" && app.state.profile.wDelAt[d] < entryAt;
  if (!frozen) app.state.profile.wDelAt = { ...(app.state.profile.wDelAt || {}), [d]: entryAt - 1 };
  app.state.profile.updatedAt = entryAt;
  app.save(); app.ui.sheet = null; app.render();
  app.toast(`Logged ${app.fmtW(v)}.`);
}
app.saveWeighIn = saveWeighIn;

function bodyweightCardHTML() {
  const w = app.weighIns();
  if (!w.length) return "";
  const last = w[w.length - 1], cut = app.addDays(app.today(), -30);
  const base = w.filter((x) => x.date <= cut).pop() || w[0];
  const ch = app.kgToDisp(last.kg) - app.kgToDisp(base.kg);
  const pts = w.filter((x) => x.date >= app.addDays(app.today(), -120));
  return `<div class="sec-h"><h3>Bodyweight</h3><button class="link-inline" data-action="weigh-open">Log weigh-in</button></div>
    <div class="card"><div class="bw-top"><b>${app.fmtW(app.kgToDisp(last.kg))}</b>
      <span>${base !== last ? `${app.signed(ch, 1)} ${app.wUnit()} since ${app.fmtDate(base.date, { month: "short", day: "numeric" })}` : "First weigh-in"}</span></div>
      ${pts.length > 1 ? app.chartSVG({ labels: pts.map((x) => x.date), series: [{ data: pts.map((x) => app.kgToDisp(x.kg)), cls: "ln alt" }], h: 110, fmt: (v) => v.toFixed(0) }) : `<p class="sub small">Log a few more weigh-ins to see your trend.</p>`}
      ${app.weightRateHTML()}</div>`;
}
app.bodyweightCardHTML = bodyweightCardHTML;

function weighReminderHTML() {
  if (!app.profileComplete()) return "";
  const last = app.weighIns().pop();
  if (last && last.date > app.addDays(app.today(), -7)) return "";
  return `<button class="nudge" data-action="weigh-open"><span>⚖︎</span><span><b>Time for a weigh-in</b>
    <span>${last ? `Last one was ${app.fmtDate(last.date, { month: "short", day: "numeric" })}` : "Keep your bodyweight trend up to date"}</span></span></button>`;
}
app.weighReminderHTML = weighReminderHTML;
