import { app } from "../runtime.js";

/* Food log, targets, barcode, and photo estimate. */
/* ================= Food ================= */
const MEALS = [["breakfast", "Breakfast"], ["lunch", "Lunch"], ["dinner", "Dinner"], ["snacks", "Snacks"]];
app.MEALS = MEALS;

function food() {
  if (!app.state.food) app.state.food = { days: {}, saved: [], targets: { auto: true }, deleted: [], updatedAt: 0 };
  const f = app.state.food;
  f.days = f.days || {}; f.saved = f.saved || []; f.targets = f.targets || { auto: true }; f.deleted = f.deleted || [];
  return f;
}
app.food = food;

const fid = () => "f_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
app.fid = fid;

const r0 = (v) => Math.round(v || 0);
app.r0 = r0;

function entryTotals(e) { const s = e.servings || 1; return { kcal: e.base.kcal * s, p: e.base.p * s, c: e.base.c * s, f: e.base.f * s }; }
app.entryTotals = entryTotals;

function dayEntries(d) { return app.food().days[d] || []; }
app.dayEntries = dayEntries;

function dayTotals(d) {
  return app.dayEntries(d).reduce((t, e) => { const x = app.entryTotals(e); t.kcal += x.kcal; t.p += x.p; t.c += x.c; t.f += x.f; return t; }, { kcal: 0, p: 0, c: 0, f: 0 });
}
app.dayTotals = dayTotals;

function foodTouch() { app.food().updatedAt = Date.now(); app.save(); }
app.foodTouch = foodTouch;

/* ---------- Targets: profile + Oura steps (7-day average), +250 lean bulk ---------- */
function autoTargets() {
  const p = app.state.profile;
  if (!app.profileComplete()) return null;
  const kg = app.weighIns().slice(-1)[0].kg, age = app.ageOn(p.dob);
  const bmr = 10 * kg + 6.25 * p.heightCm - 5 * age + (p.sex === "male" ? 5 : -161);
  const od = (app.state.oura && app.state.oura.days) || {};
  const recent = [1, 2, 3, 4, 5, 6, 7].map((i) => od[app.addDays(app.today(), -i)]).filter((d) => d && d.steps != null).map((d) => d.steps);
  const steps = recent.length >= 3 ? app.avg(recent) : null;
  const actKey = (p.activity && app.ACTIVITY[p.activity]) ? p.activity : "active";
  const usedSteps = steps != null ? steps : app.ACTIVITY[actKey].steps;
  const stepKcal = usedSteps * 0.0005 * kg;                       // about 0.04 kcal per step at 80 kg
  const sessions = app.state.sessions.filter((s) => s.finishedAt && s.date >= app.addDays(app.today(), -28) && app.setCount(s) > 0).length;
  const trainKcal = (sessions / 4) * 250 / 7;                         // average daily cost of lifting
  const tdee = bmr * 1.15 + stepKcal + trainKcal;
  const dir = app.goals().weightDir || "gain";
  const adj = dir === "gain" ? 250 : dir === "lose" ? -400 : 0;
  const kcal = Math.round((tdee + adj) / 10) * 10;
  const prot = Math.round(2.0 * kg), fat = Math.round(kcal * 0.25 / 9);
  const carbs = Math.max(0, Math.round((kcal - prot * 4 - fat * 9) / 4));
  return { kcal, p: prot, c: carbs, f: fat, basis: { bmr: Math.round(bmr), steps: steps != null ? Math.round(steps) : null, activity: actKey, activitySet: !!p.activity, tdee: Math.round(tdee), adj, sessions } };
}
app.autoTargets = autoTargets;

function targets() {
  const t = app.food().targets, a = app.autoTargets();
  if (t.auto !== false) return a;
  return { kcal: t.kcal || (a && a.kcal) || 2500, p: t.p || (a && a.p) || 150, c: t.c || (a && a.c) || 300, f: t.f || (a && a.f) || 80, basis: null, manual: true };
}
app.targets = targets;

/* ---------- Day view ---------- */
function macroBar(label, have, goal, cls) {
  const pct = goal ? Math.min(100, have / goal * 100) : 0;
  return `<div class="mb"><div class="mb-top"><span>${label}</span><b>${app.r0(have)}<small> / ${app.r0(goal)} g</small></b></div>
    <div class="mb-bar"><i class="${cls}" style="width:${pct}%"></i></div></div>`;
}
app.macroBar = macroBar;

function calRingSVG(have, goal) {
  const C = 2 * Math.PI * 52, f = goal ? Math.min(1, have / goal) : 0;
  return `<svg class="cal-ring" viewBox="0 0 124 124" aria-hidden="true"><circle cx="62" cy="62" r="52" class="ring-bg"/>
    <circle cx="62" cy="62" r="52" class="ring-fg" stroke-dasharray="${C * f} ${C}" transform="rotate(-90 62 62)"/></svg>`;
}
app.calRingSVG = calRingSVG;

function autoMeal(date) {
  if (date && date !== app.today()) return "snacks";
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  const pick = h < 10.5 ? "breakfast" : h < 15 ? "lunch" : h < 21 ? "dinner" : "snacks";
  const hidden = new Set(((app.state.layout || {}).food || {}).hidden || []);
  if (!hidden.has("m-" + pick)) return pick;
  const order = ["breakfast", "lunch", "dinner", "snacks"], i = order.indexOf(pick);
  for (const k of [...order.slice(i + 1), ...order.slice(0, i).reverse()]) if (!hidden.has("m-" + k)) return k;
  return pick;
}
app.autoMeal = autoMeal;

const ICON_CAL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>`;
app.ICON_CAL = ICON_CAL;

const ICON_CAM = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M4 8h3.5l1.8-3h5.4l1.8 3H20v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>`;
app.ICON_CAM = ICON_CAM;

function foodHTML() {
  const d = app.ui.foodDay || app.today(), isToday = d === app.today();
  const seg = `<div class="seg2" role="tablist" style="margin-bottom:14px">
    <button data-action="fseg" data-s="day" aria-pressed="${app.ui.fseg !== "recent"}">Day</button>
    <button data-action="fseg" data-s="recent" aria-pressed="${app.ui.fseg === "recent"}">Recent</button></div>`;
  const head = app.pageHead("Food", app.ui.fseg === "recent" ? "Tap a meal to log it today" : isToday ? "Today" : app.fmtDate(d, { weekday: "long", month: "short", day: "numeric" }),
    { left: app.ui.fseg === "recent" ? "" : app.addButtonHTML("food"), below: `<button class="icon-btn cal-btn" data-action="food-cal" aria-label="Open calendar">${app.ICON_CAL}</button>` });
  if (app.ui.fseg === "recent") return head + seg + app.recentFoodHTML() + `<input type="file" id="food-file" accept="image/*" capture="environment" hidden>`;
  const T = app.targets(), tot = app.dayTotals(d), left = T ? T.kcal - tot.kcal : null;
  const nav = `<div class="day-nav"><button class="icon-btn" data-action="food-day" data-d="-1" aria-label="Previous day">${app.I.chevL}</button>
    <span>${isToday ? "Today" : app.fmtDate(d, { weekday: "short", month: "short", day: "numeric" })}</span>
    <button class="icon-btn" data-action="food-day" data-d="1" aria-label="Next day" ${isToday ? "disabled" : ""}><span style="transform:scaleX(-1);display:grid">${app.I.chevL}</span></button></div>`;
  const summary = T ? `<div class="card food-sum">
      <div class="fs-ring">${app.calRingSVG(tot.kcal, T.kcal)}<div class="fs-mid"><b>${app.r0(Math.abs(left)).toLocaleString()}</b><span>${left >= 0 ? "cal left" : "cal over"}</span></div></div>
      <div class="fs-macros"><div class="fs-cal">${app.r0(tot.kcal).toLocaleString()} / ${T.kcal.toLocaleString()} cal</div>
        ${app.macroBar("Protein", tot.p, T.p, "p")}${app.macroBar("Carbs", tot.c, T.c, "c")}${app.macroBar("Fat", tot.f, T.f, "f")}</div></div>`
    : `<div class="card"><h4>Set up your profile</h4><p class="sub">Your targets come from your height, weight, age and activity. Finish your profile in Settings to get them.</p></div>`;
  const aT = app.autoTargets();
  const actNudge = isToday && aT && aT.basis.steps == null && !aT.basis.activitySet && app.food().targets.auto !== false
    ? `<button class="act-nudge" data-action="pf-edit">Targets assume you're fairly active. <b>Set your activity level</b></button>` : "";
  const burned = app.cardio().sessions.filter((x) => x.date === d).reduce((n, x) => n + (x.kcal || 0), 0);
  const burnLine = burned ? `<p class="burn">🔥 ${Math.round(burned).toLocaleString()} cal burned from cardio${isToday ? " today" : ""} <span>(not added to your target)</span></p>` : "";
  const actions = isToday ? `<div class="log-row">
      <button class="snap" data-action="food-snap">${app.ICON_CAM}<span>Snap a meal</span></button>
      <button class="mini-act" data-action="food-quick-barcode">Scan</button>
      <button class="mini-act" data-action="food-quick-manual">Manual</button></div>` : "";
  const meals = app.MEALS.map(([k, label]) => {
    const list = app.dayEntries(d).filter((e) => e.meal === k);
    if (!isToday && !list.length) return "";
    const kc = list.reduce((n, e) => n + app.entryTotals(e).kcal, 0);
    return `<!--w:m-${k}--><div class="meal-card m-${k}"><div class="meal-h"><h4>${label}</h4><span class="mc-kcal">${list.length ? app.r0(kc).toLocaleString() + " cal" : ""}</span>
        ${isToday ? `<button class="mc-add" data-action="food-add" data-meal="${k}" aria-label="Add to ${label}">+</button>` : ""}</div>
      ${list.length ? list.map((e) => { const x = app.entryTotals(e); return `<button class="fe" data-action="food-edit" data-id="${e.id}">
        <span class="fe-n">${app.esc(e.name)}${(e.servings || 1) !== 1 ? ` <em>× ${app.fmtNum(e.servings)}</em>` : ""}</span><b>${app.r0(x.kcal)}</b>
        <span class="fe-m">P ${app.r0(x.p)} · C ${app.r0(x.c)} · F ${app.r0(x.f)}</span></button>`; }).join("") : `<p class="mc-empty">Nothing yet</p>`}</div>`;
  }).join("");
  const none = !isToday && !app.dayEntries(d).length ? `<div class="card"><p class="sub">Nothing was logged on this day.</p></div>` : "";
  const force = new Set(app.MEALS.filter(([k]) => app.dayEntries(d).some((e) => e.meal === k)).map(([k]) => "m-" + k));
  return head + seg + `<div id="food-swipe">${nav}` + app.widgetize("food", `<!--w:summary-->${summary}${actNudge}${burnLine}<!--w:log-->${actions}${meals}<!--w:history-->${isToday ? app.foodHistoryHTML() : ""}`, force) + `${none}</div>` +
    `<button class="link-btn" data-action="food-targets" style="display:block;margin:14px auto 0">${T ? `Targets: ${T.kcal.toLocaleString()} cal · ${T.p} g protein · Edit` : "Edit targets"}</button>
    <input type="file" id="food-file" accept="image/*" capture="environment" hidden>`;
}
app.foodHTML = foodHTML;

function recentFoodHTML() {
  const meal = app.ui.qMeal || app.autoMeal();
  const q = (app.ui.rq || "").toLowerCase();
  const fav = app.food().saved.filter((x) => !q || x.name.toLowerCase().includes(q));
  const favNames = new Set(app.food().saved.map((x) => x.name.toLowerCase()));
  const seen = new Set(), recent = [];
  Object.keys(app.food().days).sort().reverse().forEach((dd) => [...app.dayEntries(dd)].reverse().forEach((e) => {
    const k = e.name.toLowerCase();
    if (!seen.has(k) && !favNames.has(k) && recent.length < 25 && (!q || k.includes(q))) { seen.add(k); recent.push(e); }
  }));
  const row = (x, kind) => { const t = app.entryTotals(x); return `<div class="rq-row">
    <button class="rq-main" data-action="food-quick" data-kind="${kind}" data-id="${x.id}" aria-label="Log ${app.esc(x.name)} to ${meal}">
      <b>${app.esc(x.name)}</b><span>${app.r0(t.kcal)} cal · P ${app.r0(t.p)} · C ${app.r0(t.c)} · F ${app.r0(t.f)}</span></button>
    <button class="rq-plus" data-action="food-quick" data-kind="${kind}" data-id="${x.id}" aria-label="Log ${app.esc(x.name)}">+</button></div>`; };
  return `<span class="field-label">Log to</span>
    <div class="seg2 meal-seg">${app.MEALS.map(([k, l]) => `<button data-action="qmeal" data-m="${k}" aria-pressed="${meal === k}">${l}</button>`).join("")}</div>
    <input class="text-in" id="food-rq" placeholder="Search your foods" autocomplete="off" value="${app.esc(app.ui.rq || "")}">
    ${fav.length ? `<div class="mini-l">Favorites</div><div class="card rq-card">${fav.map((x) => row(x, "fav")).join("")}</div>` : ""}
    ${recent.length ? `<div class="mini-l">Recent</div><div class="card rq-card">${recent.map((x) => row(x, "recent")).join("")}</div>` : ""}
    ${!fav.length && !recent.length ? `<div class="card"><p class="sub">${q ? "No foods match that search." : "Foods you log show up here so you can re-log them with one tap. Tick \"Save as a favorite\" when logging to pin a meal to the top."}</p></div>` : ""}`;
}
app.recentFoodHTML = recentFoodHTML;

/* Calendar: dot = something logged; filled with the theme highlight = protein goal hit */
function foodCalSheetHTML() {
  const month = app.ui.fcMonth || (app.ui.foodDay || app.today()).slice(0, 7), first = month + "-01", fd = app.parseDay(first);
  const daysIn = new Date(fd.getFullYear(), fd.getMonth() + 1, 0).getDate(), lead = (fd.getDay() + 6) % 7, T = app.targets();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(`<span class="cal-pad"></span>`);
  for (let k = 1; k <= daysIn; k++) {
    const d = `${month}-${String(k).padStart(2, "0")}`, logged = app.dayEntries(d).length > 0;
    const hit = logged && T && app.dayTotals(d).p >= T.p * 0.95;
    cells.push(`<button class="fcal-day${logged ? " logged" : ""}${hit ? " hit" : ""}${d === app.today() ? " today" : ""}${d === (app.ui.foodDay || app.today()) ? " sel" : ""}" data-action="food-cal-day" data-date="${d}" ${d > app.today() ? "disabled" : ""}
      aria-label="${app.fmtDate(d, { month: "long", day: "numeric" })}${hit ? ", protein goal hit" : logged ? ", food logged" : ""}"><span>${k}</span>${logged ? "<i></i>" : ""}</button>`);
  }
  return `<div class="sec-h" style="margin:0 40px 10px 0"><h3>${app.fmtDate(first, { month: "long", year: "numeric" })}</h3>
      <div class="week-nav"><button class="icon-btn" data-action="food-cal-month" data-d="-1" aria-label="Previous month">${app.I.chevL}</button>
      <button class="icon-btn" data-action="food-cal-month" data-d="1" aria-label="Next month" ${month >= app.today().slice(0, 7) ? "disabled" : ""}><span style="transform:scaleX(-1);display:grid">${app.I.chevL}</span></button></div></div>
    <div class="cal-head">${["M", "T", "W", "T", "F", "S", "S"].map((x) => `<span>${x}</span>`).join("")}</div>
    <div class="cal">${cells.join("")}</div>
    <div class="fcal-key"><span><i class="k-dot"></i>Food logged</span><span><i class="k-hit"></i>Protein goal hit</span></div>
    <button class="btn primary block" data-action="food-cal-day" data-date="${app.today()}" style="margin-top:14px">Go to today</button>`;
}
app.foodCalSheetHTML = foodCalSheetHTML;

function foodHistoryHTML() {
  const days = [...Array(14)].map((_, i) => app.addDays(app.today(), i - 13));
  const logged = days.filter((d) => app.dayEntries(d).length);
  if (logged.length < 2) return "";
  const T = app.targets();
  const kc = days.map((d) => app.dayEntries(d).length ? app.dayTotals(d).kcal : null);
  const pr = days.map((d) => app.dayEntries(d).length ? app.dayTotals(d).p : null);
  const wk = days.slice(-7).filter((d) => app.dayEntries(d).length);
  const avgK = app.avg(wk.map((d) => app.dayTotals(d).kcal)), avgP = app.avg(wk.map((d) => app.dayTotals(d).p));
  const hitP = T ? wk.filter((d) => app.dayTotals(d).p >= T.p * 0.95).length : 0;
  return `<div class="sec-h" style="margin-top:22px"><h3>Last 14 days</h3></div>
    <div class="card">${wk.length ? `<p class="sub">Last 7 days: averaging ${app.r0(avgK).toLocaleString()} cal and ${app.r0(avgP)} g protein${T ? `. Protein goal hit ${hitP} of ${wk.length} logged days.` : "."}</p>` : ""}
      <div class="mini-l">Calories${T ? " (dashed: target)" : ""}</div>${app.chartSVG({ labels: days, series: [{ type: "bar", data: kc }], h: 110, yMin: 0, guide: T ? T.kcal : null, fmt: (v) => (v / 1000).toFixed(1) + "k" })}
      <div class="mini-l">Protein (g)</div>${app.chartSVG({ labels: days, series: [{ data: pr, cls: "ln" }], h: 90, guide: T ? T.p : null })}</div>`;
}
app.foodHistoryHTML = foodHistoryHTML;

/* ---------- Sheets ---------- */
function foodAddSheetHTML() {
  const label = app.MEALS.find((m) => m[0] === app.ui.sd.meal)[1];
  const opt = (a, icon, t, s) => `<button class="fopt" data-action="${a}"><span class="fopt-i">${icon}</span><span><b>${t}</b><span>${s}</span></span>${app.I.chevR}</button>`;
  return `<h3>Add to ${label}</h3>
    ${opt("food-photo", "📷", "Snap your plate", "AI estimates each food. 10 photos a day")}
    ${opt("food-describe", "💬", "Describe it", "Type or dictate a meal. 20 a day")}
    ${opt("food-barcode", "▥", "Scan a barcode", "Packaged foods, from Open Food Facts")}
    ${opt("food-saved", "★", "Saved and recent", "Re-log your usual meals in one tap")}
    ${opt("food-manual", "✎", "Enter manually", "Type the calories and macros")}`;
}
app.foodAddSheetHTML = foodAddSheetHTML;

function foodPhotoSheetHTML() {
  return `<h3>Snap your plate</h3>
    <p class="sub" style="margin:-6px 0 14px">Get the whole plate in frame from above, in good light. Estimates are a starting point; you'll review them before saving.</p>
    <label class="field-label" for="food-hint">Anything the camera can't see? (optional)</label>
    <input class="text-in" id="food-hint" autocomplete="off" placeholder="Cooked in butter, 2 scoops of rice" value="${app.esc(app.ui.sd.hint || "")}">
    <button class="btn primary block" data-action="food-photo-go">Take or choose a photo</button>
    <p class="sub small">10 food photos a day. The count resets at midnight on this phone. The photo isn't kept.</p>`;
}
app.foodPhotoSheetHTML = foodPhotoSheetHTML;

function foodDescribeSheetHTML() {
  return `<h3>Describe it</h3>
    <p class="sub" style="margin:-6px 0 14px">Type the meal, or dictate it with the microphone on your keyboard. You'll review the estimate before it's saved.</p>
    <label class="field-label" for="food-describe">What did you eat?</label>
    <textarea class="text-in desc-in" id="food-describe" maxlength="800" rows="4" placeholder="Two eggs, toast with butter, black coffee" aria-label="Meal description">${app.esc(app.ui.sd.text || "")}</textarea>
    <button class="btn primary block" data-action="food-describe-go">Estimate this meal</button>
    <p class="sub small">20 descriptions a day. The count resets at midnight on this phone. The description isn't kept.</p>`;
}
app.foodDescribeSheetHTML = foodDescribeSheetHTML;

function quotaLeftLine() {
  if (typeof app.ui.sd.describesLeft === "number") {
    const n = app.ui.sd.describesLeft;
    return `<p class="sub small">${n === 0 ? "No descriptions left today." : `${app.pl(n, "description")} left today.`}</p>`;
  }
  if (typeof app.ui.sd.photosLeft === "number") {
    const n = app.ui.sd.photosLeft;
    return `<p class="sub small">${n === 0 ? "No food photos left today." : `${app.pl(n, "food photo")} left today.`}</p>`;
  }
  return "";
}

function itemRow(it, i) {
  const m = it.mult || 1, v = (k) => app.r0(it.base[k] * m);
  return `<div class="fi" data-i="${i}">
    <div class="fi-top"><input class="text-in fi-name" data-fi="${i}" data-k="name" value="${app.esc(it.name)}" aria-label="Food name">
      <button class="set-x" data-action="fi-del" data-i="${i}" aria-label="Remove ${app.esc(it.name)}">×</button></div>
    ${it.portion ? `<span class="fi-por">${app.esc(it.portion)}</span>` : ""}
    <div class="fi-mult">${[0.5, 1, 1.5, 2].map((x) => `<button data-action="fi-mult" data-i="${i}" data-m="${x}" aria-pressed="${m === x}">${x === 0.5 ? "½" : x === 1.5 ? "1½" : x}×</button>`).join("")}</div>
    <div class="fi-grid">${[["kcal", "Cal"], ["p", "Protein"], ["c", "Carbs"], ["f", "Fat"]].map(([k, l]) =>
      `<label><span>${l}</span><input inputmode="decimal" data-fi="${i}" data-k="${k}" value="${v(k)}"></label>`).join("")}</div></div>`;
}
app.itemRow = itemRow;

function reviewTotals() {
  return (app.ui.sd.items || []).reduce((t, it) => { const m = it.mult || 1; t.kcal += it.base.kcal * m; t.p += it.base.p * m; t.c += it.base.c * m; t.f += it.base.f * m; return t; }, { kcal: 0, p: 0, c: 0, f: 0 });
}
app.reviewTotals = reviewTotals;

function foodReviewSheetHTML() {
  const label = app.MEALS.find((m) => m[0] === app.ui.sd.meal)[1];
  const described = app.ui.sd.source === "describe";
  if (app.ui.sd.loading) return `<h3>${described ? "Reading your description…" : "Reading your plate…"}</h3><div class="spin" aria-hidden="true"></div><p class="sub" style="text-align:center">This usually takes a few seconds.</p>`;
  if (app.ui.sd.error) return `<h3>Couldn't analyze that</h3><p class="sub">${app.esc(app.ui.sd.error)}</p>
    <button class="btn primary block" data-action="${described ? "food-describe" : "food-photo"}">${described ? "Edit the description" : "Try another photo"}</button><button class="btn block" data-action="food-manual" style="margin-top:8px">Enter manually</button>`;
  const t = app.reviewTotals(), items = app.ui.sd.items || [];
  return `<h3>Review your meal</h3>
    <div class="seg2 meal-seg">${app.MEALS.map(([k, l]) => `<button data-action="review-meal" data-m="${k}" aria-pressed="${app.ui.sd.meal === k}">${l}</button>`).join("")}</div>
    ${app.ui.sd.notes ? `<p class="sub" style="margin:-6px 0 12px">${app.esc(app.ui.sd.notes)}</p>` : ""}
    ${quotaLeftLine()}
    ${items.length ? items.map(app.itemRow).join("") : `<p class="sub">No foods found. Add one below or ${described ? "describe it again" : "try another photo"}.</p>`}
    <button class="link-btn" data-action="fi-add">Add a food</button>
    ${app.ui.sd.image ? `<details class="reanalyze"${app.ui.sd.hint ? " open" : ""}><summary>Something off? Add a note and re-analyze</summary>
      <input class="text-in" id="food-hint" autocomplete="off" placeholder="Cooked in butter, 2 scoops of rice" value="${app.esc(app.ui.sd.hint || "")}">
      <button class="btn block" data-action="food-reanalyze">Re-analyze (uses 1 photo)</button></details>` : ""}
    ${described ? `<details class="reanalyze"><summary>Change the description</summary>
      <textarea class="text-in desc-in" id="food-describe" maxlength="800" rows="3" aria-label="Meal description">${app.esc(app.ui.sd.text || "")}</textarea>
      <button class="btn block" data-action="food-describe-go">Estimate again (uses 1 description)</button></details>` : ""}
    <div class="fr-total"><b>${app.r0(t.kcal)} cal</b><span>P ${app.r0(t.p)} · C ${app.r0(t.c)} · F ${app.r0(t.f)}</span></div>
    <label class="swap-keep"><input type="checkbox" id="food-fav" ${app.ui.sd.fav ? "checked" : ""}> Save as a favorite meal</label>
    <button class="btn primary block" data-action="food-review-save" ${items.length ? "" : "disabled"}>Save to ${app.MEALS.find((m) => m[0] === app.ui.sd.meal)[1]}</button>`;
}
app.foodReviewSheetHTML = foodReviewSheetHTML;

function foodManualSheetHTML() {
  const e = app.ui.sd.edit ? app.dayEntries(app.ui.foodDay || app.today()).find((x) => x.id === app.ui.sd.edit) : null;
  const b = e ? e.base : { kcal: "", p: "", c: "", f: "" };
  const f = (id, l, v, mode = "decimal") => `<label><span>${l}</span><input class="text-in" id="${id}" inputmode="${mode}" value="${v === "" ? "" : app.r0(v)}"></label>`;
  return `<h3>${e ? "Edit food" : "Enter manually"}</h3>
    <label class="field-label" for="fm-name">Name</label>
    <input class="text-in" id="fm-name" autocomplete="off" placeholder="Protein shake" value="${app.esc(e ? e.name : "")}">
    <div class="fm-grid">${f("fm-kcal", "Calories", b.kcal)}${f("fm-p", "Protein (g)", b.p)}${f("fm-c", "Carbs (g)", b.c)}${f("fm-f", "Fat (g)", b.f)}</div>
    <label class="field-label" for="fm-s">Servings</label>
    <input class="text-in" id="fm-s" inputmode="decimal" value="${e ? app.fmtNum(e.servings || 1) : "1"}">
    ${e ? `<label class="field-label" for="fm-meal">Meal</label><select class="text-in" id="fm-meal">${app.MEALS.map(([k, l]) => `<option value="${k}" ${e.meal === k ? "selected" : ""}>${l}</option>`).join("")}</select>` : ""}
    <label class="swap-keep"><input type="checkbox" id="food-fav"> Save as a favorite</label>
    <div class="sheet-actions">${e ? `<button class="btn danger" data-action="food-del">Delete</button>` : ""}<button class="btn primary" data-action="food-manual-save">${e ? "Save" : "Add"}</button></div>
    ${e && e.items && e.items.length ? `<p class="sub small">Includes: ${e.items.map((x) => app.esc(x.name)).join(", ")}</p>` : ""}`;
}
app.foodManualSheetHTML = foodManualSheetHTML;

function foodSavedSheetHTML() {
  const q = (app.ui.sd.q || "").toLowerCase();
  const fav = app.food().saved.filter((s) => !q || s.name.toLowerCase().includes(q));
  const seen = new Set(), recent = [];
  Object.keys(app.food().days).sort().reverse().forEach((d) => [...app.dayEntries(d)].reverse().forEach((e) => {
    const k = e.name.toLowerCase();
    if (!seen.has(k) && recent.length < 15 && (!q || k.includes(q))) { seen.add(k); recent.push(e); }
  }));
  const row = (x, a, extra = "") => `<div class="sv"><button class="sv-main" data-action="${a}" data-id="${x.id}"><b>${app.esc(x.name)}</b>
    <span>${app.r0(app.entryTotals(x).kcal)} cal · P ${app.r0(app.entryTotals(x).p)} · C ${app.r0(app.entryTotals(x).c)} · F ${app.r0(app.entryTotals(x).f)}</span></button>${extra}</div>`;
  return `<h3>Saved and recent</h3>
    <input class="text-in" id="food-q" placeholder="Search" autocomplete="off" value="${app.esc(app.ui.sd.q || "")}">
    ${fav.length ? `<div class="mini-l">Favorites</div>${fav.map((x) => row(x, "food-pick-fav", `<button class="set-x" data-action="food-unfav" data-id="${x.id}" aria-label="Remove ${app.esc(x.name)} from favorites">×</button>`)).join("")}` : ""}
    ${recent.length ? `<div class="mini-l">Recent</div>${recent.map((x) => row(x, "food-pick-recent")).join("")}` : ""}
    ${!fav.length && !recent.length ? `<p class="sub">Nothing here yet. Foods you log show up here, and favorites stay pinned at the top.</p>` : ""}`;
}
app.foodSavedSheetHTML = foodSavedSheetHTML;

function foodBarcodeSheetHTML() {
  if (app.ui.sd.product) {
    const p = app.ui.sd.product, unit = app.ui.sd.unit || (p.serving ? "serving" : "g"), amt = app.ui.sd.amt || (unit === "serving" ? "1" : "100");
    const per = unit === "serving" ? p.serving : p.per100, mult = unit === "serving" ? (parseFloat(amt) || 0) : (parseFloat(amt) || 0) / 100;
    const x = { kcal: per.kcal * mult, p: per.p * mult, c: per.c * mult, f: per.f * mult };
    return `<h3>${app.esc(p.name)}</h3>${p.brand ? `<p class="sub" style="margin:-6px 0 12px">${app.esc(p.brand)}</p>` : ""}
      <div class="seg2 pf-seg">${p.serving ? `<button data-action="bc-unit" data-u="serving" aria-pressed="${unit === "serving"}">Servings${p.servingLabel ? ` (${app.esc(p.servingLabel)})` : ""}</button>` : ""}
        <button data-action="bc-unit" data-u="g" aria-pressed="${unit === "g"}">Grams</button></div>
      <label class="field-label" for="bc-amt">${unit === "serving" ? "How many servings" : "How many grams"}</label>
      <input class="text-in" id="bc-amt" inputmode="decimal" value="${app.esc(amt)}">
      <div class="fr-total"><b>${app.r0(x.kcal)} cal</b><span>P ${app.r0(x.p)} · C ${app.r0(x.c)} · F ${app.r0(x.f)}</span></div>
      <label class="swap-keep"><input type="checkbox" id="food-fav"> Save as a favorite</label>
      <button class="btn primary block" data-action="bc-save">Add to ${app.MEALS.find((m) => m[0] === app.ui.sd.meal)[1]}</button>
      <p class="sub small">Nutrition data from Open Food Facts, a free community database.</p>`;
  }
  return `<h3>Scan a barcode</h3>
    <div class="bc-cam"><video id="bc-video" playsinline muted autoplay></video>
      <div class="bc-box" aria-hidden="true"><i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i><span class="bc-line"></span></div>
      <button class="btn small" id="bc-start" data-action="bc-start" hidden>Start camera</button></div>
    <p class="sub small" id="bc-status">${app.esc(app.ui.sd.status || "Starting the camera…")}</p>
    <div class="add-row"><input id="bc-code" inputmode="numeric" placeholder="Or type the barcode number" autocomplete="off"><button data-action="bc-lookup">Look up</button></div>`;
}
app.foodBarcodeSheetHTML = foodBarcodeSheetHTML;

function targetsSheetHTML() {
  const a = app.autoTargets(), t = app.food().targets, T = app.targets();
  const f = (id, l, v) => `<label><span>${l}</span><input class="text-in" id="${id}" inputmode="numeric" value="${v != null ? v : ""}"></label>`;
  return `<h3>Daily targets</h3>
    ${a ? `<p class="sub" style="margin:-6px 0 12px">Automatic estimate: ${a.basis.bmr.toLocaleString()} cal at rest, plus ${a.basis.steps != null ? `your ${a.basis.steps.toLocaleString()}-step daily average from Oura` : `your activity setting (${app.ACTIVITY[a.basis.activity].label}, about ${app.ACTIVITY[a.basis.activity].steps.toLocaleString()} steps a day${a.basis.activitySet ? "" : ", the default"})`} and ${app.pl(a.basis.sessions, "workout")} in the last 4 weeks, about ${a.basis.tdee.toLocaleString()} cal a day. ${a.basis.adj > 0 ? "Plus 250 for a lean bulk." : a.basis.adj < 0 ? "Minus 400 for a cut." : ""} Protein is 2 g per kg of bodyweight; fat is 25% of calories; carbs fill the rest.</p>` : ""}
    <div class="fm-grid">${f("tg-kcal", "Calories", T && T.kcal)}${f("tg-p", "Protein (g)", T && T.p)}${f("tg-c", "Carbs (g)", T && T.c)}${f("tg-f", "Fat (g)", T && T.f)}</div>
    <div class="sheet-actions">${t.auto === false && a ? `<button class="btn" data-action="tg-auto">Use automatic</button>` : ""}<button class="btn primary" data-action="tg-save">Save targets</button></div>
    <p class="sub small">${t.auto === false ? "You're using your own targets." : "Automatic targets update daily as your steps, weight and training change. Editing any number switches to your own targets."}</p>`;
}
app.targetsSheetHTML = targetsSheetHTML;

/* ---------- Actions ---------- */
function addEntry(meal, name, base, servings, src, items) {
  const d = app.ui.foodDay || app.today(), f = app.food();
  const e = { id: app.fid(), meal, name: name || "Food", base: { kcal: +base.kcal || 0, p: +base.p || 0, c: +base.c || 0, f: +base.f || 0 }, servings: servings || 1, src, at: new Date().toISOString() };
  if (items && items.length) e.items = items;
  (f.days[d] = f.days[d] || []).push(e);
  app.foodTouch();
  return e;
}
app.addEntry = addEntry;

function favFrom(name, base, items) {
  app.food().saved.unshift({ id: app.fid(), name, base: { ...base }, servings: 1, items: items || undefined });
  app.foodTouch();
}
app.favFrom = favFrom;

function compressForAI(file) {
  return app.fileToBitmap(file).then((img) => app.drawTo(img, 1024, 0.8)).then((blob) => new Promise((res) => {
    const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.readAsDataURL(blob);
  }));
}
app.compressForAI = compressForAI;

function aiClock() {
  let timeZone = "UTC";
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone) timeZone = zone;
  } catch (e) { /* UTC is only a fallback; the server still checks the date */ }
  return { localDate: app.today(), timeZone };
}
app.aiClock = aiClock;

async function analyzeFoodPhoto(file, reuse) {
  app.ui.sheet = "food-review"; app.ui.sd = { meal: app.autoMeal(), ...app.ui.sd, loading: true, error: null, items: [] }; app.renderSheet();
  try {
    if (!app.sb || !app.session) throw new Error("Sign in (Settings → Account) to use food photos.");
    const image = reuse || await app.compressForAI(file);
    app.ui.sd.image = image;
    const { data, error } = await app.sb.functions.invoke("food-photo", { body: { image, hint: app.ui.sd.hint || "", ...app.aiClock() } });
    if (error) {
      let msg = "Couldn't reach the food analysis service. Check your connection and try again.";
      try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (e) {}
      throw new Error(msg);
    }
    app.ui.sd.items = (data.items || []).map((it) => ({ name: it.name, portion: it.portion, mult: 1, base: { kcal: it.calories, p: it.protein, c: it.carbs, f: it.fat } }));
    app.ui.sd.notes = data.notes || "";
    app.ui.sd.source = "photo";
    app.ui.sd.photosLeft = typeof data.remaining === "number" ? data.remaining : null;
    app.ui.sd.describesLeft = null;
    app.ui.sd.loading = false;
  } catch (e) { app.ui.sd.loading = false; app.ui.sd.error = e.message || String(e); }
  if (app.ui.sheet === "food-review") app.renderSheet();
}
app.analyzeFoodPhoto = analyzeFoodPhoto;

async function analyzeFoodText() {
  if (app.describeBusy) return;
  const text = ((app.ui.sd && app.ui.sd.text) || "").trim();
  app.ui.sd.text = text;
  if (text.length < 2) { app.toast("Describe what you ate."); return; }
  const meal = app.ui.sd.meal || app.autoMeal();
  app.describeBusy = true;
  app.ui.sheet = "food-review";
  app.ui.sd = { meal, text, source: "describe", loading: true, error: null, items: [], image: null };
  app.renderSheet();
  try {
    if (!app.sb || !app.session) throw new Error("Sign in (Settings → Account) to describe a meal.");
    const { data, error } = await app.sb.functions.invoke("food-describe", { body: { text, ...app.aiClock() } });
    if (error) {
      let msg = "Couldn't reach the food analysis service. Check your connection and try again.";
      try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (e) {}
      throw new Error(msg);
    }
    app.ui.sd.items = (data.items || []).map((it) => ({ name: it.name, portion: it.portion, mult: 1, base: { kcal: it.calories, p: it.protein, c: it.carbs, f: it.fat } }));
    app.ui.sd.notes = data.notes || "";
    app.ui.sd.describesLeft = typeof data.remaining === "number" ? data.remaining : null;
    app.ui.sd.photosLeft = null;
    app.ui.sd.loading = false;
  } catch (e) { app.ui.sd.loading = false; app.ui.sd.error = e.message || String(e); }
  finally { app.describeBusy = false; }
  if (app.ui.sheet === "food-review") app.renderSheet();
}
app.analyzeFoodText = analyzeFoodText;

/* Barcode scanner: the app opens the rear camera itself (so the live view always shows),
   then reads frames with the browser's built-in detector if it has one, or ZXing loaded on demand. */
let bcStream = null, bcTimer = null;
app.bcStream = bcStream;
app.bcTimer = bcTimer;

function stopBarcode() {
  clearInterval(app.bcTimer); app.bcTimer = null;
  if (app.bcStream) { app.bcStream.getTracks().forEach((t) => t.stop()); app.bcStream = null; }
  const v = app.$("#bc-video"); if (v) v.srcObject = null;
}
app.stopBarcode = stopBarcode;

function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}
app.loadScript = loadScript;

async function loadZXing() {
  if (window.ZXing) return;
  for (const src of ["https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js", "https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js"]) {
    try { await app.loadScript(src); if (window.ZXing) return; } catch (e) { /* try the next source */ }
  }
  throw new Error("scanner unavailable");
}
app.loadZXing = loadZXing;

function bcStatus(t) { app.ui.sd.status = t; const el = app.$("#bc-status"); if (el) el.textContent = t; }
app.bcStatus = bcStatus;

async function makeDetector(video) {
  if ("BarcodeDetector" in window) {
    try {
      const det = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
      return async () => { const r = await det.detect(video); return r && r[0] ? r[0].rawValue : null; };
    } catch (e) { /* fall through to ZXing */ }
  }
  await app.loadZXing();
  const Z = window.ZXing, reader = new Z.MultiFormatReader(), hints = new Map();
  hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E]);
  hints.set(Z.DecodeHintType.TRY_HARDER, true);
  const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d", { willReadFrequently: true });
  return async () => {
    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) return null;
    const cw = Math.round(w * 0.86), ch = Math.round(h * 0.5);            // read the band inside the scan window
    canvas.width = cw; canvas.height = ch;
    ctx.drawImage(video, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, cw, ch);
    try {
      const bmp = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas)));
      return reader.decode(bmp, hints).getText();
    } catch (e) { return null; }                                            // no barcode in this frame
  };
}
app.makeDetector = makeDetector;

async function startBarcode() {
  const video = app.$("#bc-video");
  if (!video) return;
  app.stopBarcode();
  const btn = app.$("#bc-start"); if (btn) btn.hidden = true;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { app.bcStatus("This browser can't open the camera. Type the number under the barcode instead."); return; }
  try {
    app.bcStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } });
  } catch (e) {
    app.bcStatus(e && e.name === "NotAllowedError"
      ? app.cameraBlockedText()
      : "Couldn't open the camera. Type the number under the barcode instead.");
    if (btn) btn.hidden = false;
    return;
  }
  if (app.ui.sheet !== "food-barcode") { app.stopBarcode(); return; }
  video.muted = true; video.setAttribute("playsinline", ""); video.setAttribute("autoplay", "");
  video.srcObject = app.bcStream;
  try { await video.play(); } catch (e) { if (btn) { btn.hidden = false; btn.textContent = "Tap to start the camera"; } }
  app.bcStatus("Line up the barcode inside the box.");
  let detect;
  try { detect = await app.makeDetector(video); }
  catch (e) { app.bcStatus("The scanner couldn't load. You can still type the number under the barcode."); return; }
  let busy = false;
  app.bcTimer = setInterval(async () => {
    if (busy || !app.bcStream) return;
    busy = true;
    try {
      const code = await detect();
      if (code && app.bcStream) { app.stopBarcode(); app.bcStatus(`Found ${code}. Looking it up…`); app.lookupBarcode(code); }
    } finally { busy = false; }
  }, 200);
}
app.startBarcode = startBarcode;

async function lookupBarcode(code) {
  code = String(code || "").replace(/\D/g, "");
  if (code.length < 6) { app.toast("Enter the full barcode number."); return; }
  app.bcStatus("Looking it up…");
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,serving_size,serving_quantity,nutriments`);
    const j = await res.json();
    if (!j || j.status !== 1 || !j.product) { app.bcStatus("That product isn't in the database. Try a photo of the label or enter it manually."); return; }
    const p = j.product, n = p.nutriments || {};
    const kcal = (suffix) => n["energy-kcal" + suffix] != null ? +n["energy-kcal" + suffix] : n["energy" + suffix] != null ? +n["energy" + suffix] / 4.184 : null;
    const per = (suffix) => ({ kcal: kcal(suffix) || 0, p: +n["proteins" + suffix] || 0, c: +n["carbohydrates" + suffix] || 0, f: +n["fat" + suffix] || 0 });
    const per100 = per("_100g");
    let serving = null;
    if (kcal("_serving") != null) serving = per("_serving");
    else if (p.serving_quantity && kcal("_100g") != null) { const q = +p.serving_quantity / 100; serving = { kcal: per100.kcal * q, p: per100.p * q, c: per100.c * q, f: per100.f * q }; }
    if (kcal("_100g") == null && !serving) { app.bcStatus("Found it, but it has no nutrition info. Enter it manually instead."); return; }
    app.ui.sd.product = { code, name: p.product_name || "Packaged food", brand: (p.brands || "").split(",")[0], per100, serving, servingLabel: p.serving_size || "" };
    app.ui.sd.unit = serving ? "serving" : "g"; app.ui.sd.amt = serving ? "1" : "100";
    app.renderSheet();
  } catch (e) { app.bcStatus("Couldn't reach the food database. Check your connection."); }
}
app.lookupBarcode = lookupBarcode;

/* merge cloud copy: union of entries per day, deletions respected, favorites by id */
function mergeFood(r) {
  if (!r) return;
  const f = app.food(), del = new Set([...(f.deleted || []), ...(r.deleted || [])]);
  const days = {};
  [r.days || {}, f.days].forEach((src) => Object.entries(src).forEach(([d, list]) => list.forEach((e) => {
    if (del.has(e.id)) return;
    const arr = (days[d] = days[d] || []);
    const k = arr.findIndex((x) => x.id === e.id);
    if (k >= 0) arr[k] = e; else arr.push(e);
  })));
  const saved = new Map();
  [...(r.saved || []), ...f.saved].forEach((s) => { if (!del.has(s.id)) saved.set(s.id, s); });
  const newerRemote = (r.updatedAt || 0) > (f.updatedAt || 0);
  app.state.food = { days, saved: [...saved.values()], targets: newerRemote && r.targets ? r.targets : f.targets, deleted: [...del], updatedAt: Math.max(r.updatedAt || 0, f.updatedAt || 0) };
}
app.mergeFood = mergeFood;
