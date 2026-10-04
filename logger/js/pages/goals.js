import { app } from "../runtime.js";
import { countedEntries } from "../shared/skip.js";

/* Weekly goals, lift goals, and the PR board. */
/* ================= Goals, PRs, bodyweight rate ================= */
function goals() {
  if (!app.state.goals) app.state.goals = { sessionsPerWeek: null, lifts: {}, weightDir: null, updatedAt: 0 };
  if (!app.state.goals.lifts) app.state.goals.lifts = {};
  return app.state.goals;
}
app.goals = goals;

const countsForStats = (x) => x.tag !== "warmup";
app.countsForStats = countsForStats;

/* ---------- Weekly session goal ---------- */
function sessionsInWeek(mon) {
  const end = app.addDays(mon, 6);
  return app.state.sessions.filter((s) => s.finishedAt && s.date >= mon && s.date <= end && app.setCount(s) > 0).length;
}
app.sessionsInWeek = sessionsInWeek;

function weekGoalStatus() {
  const g = app.goals().sessionsPerWeek;
  if (!g) return null;
  const mon = app.mondayOf(app.today()), done = app.sessionsInWeek(mon);
  let streak = 0;
  for (let w = 1; w < 104; w++) { if (app.sessionsInWeek(app.addDays(mon, -7 * w)) >= g) streak++; else break; }
  if (done >= g) streak++;
  return { goal: g, done, streak };
}
app.weekGoalStatus = weekGoalStatus;

function weekRingSVG(done, goal) {
  const C = 2 * Math.PI * 15, f = Math.min(1, done / goal);
  return `<svg class="wring" viewBox="0 0 38 38" aria-hidden="true"><circle cx="19" cy="19" r="15" class="wring-bg"/>
    <circle cx="19" cy="19" r="15" class="wring-fg" stroke-dasharray="${C * f} ${C}" transform="rotate(-90 19 19)"/></svg>`;
}
app.weekRingSVG = weekRingSVG;

function weekGoalHeadHTML() {
  const st = app.weekGoalStatus();
  if (!st) return `<button class="goal-pill" data-action="goal-week">Set weekly goal</button>`;
  return `<button class="goal-pill on" data-action="goal-week" aria-label="${st.done} of ${st.goal} sessions this week">${app.weekRingSVG(st.done, st.goal)}<span>${st.done}/${st.goal}</span></button>`;
}
app.weekGoalHeadHTML = weekGoalHeadHTML;

function weekGoalLineHTML() {
  const st = app.weekGoalStatus();
  if (!st) return "";
  const left = st.goal - st.done;
  return `<p class="sub goal-line">${left > 0 ? `${app.pl(left, "more session")} to hit your goal this week.` : "Weekly goal hit."}${st.streak ? ` <b>${st.streak}-week streak</b>` : ""}</p>`;
}
app.weekGoalLineHTML = weekGoalLineHTML;

/* ---------- Lift goals (stored as estimated 1RM in kg, shown in the person's units) ---------- */
function liftGoalRows(series) {
  return Object.entries(app.goals().lifts).map(([name, g]) => {
    const s = series[name] || [];
    const target = app.kgToDisp(g.kg);
    const recent = s.slice(-3).map((p) => p.v);
    const current = recent.length ? Math.max(...recent) : null;
    const best = s.length ? Math.max(...s.map((p) => p.v)) : null;
    const st = app.liftStatus(s);
    let eta = null;
    if (current && current < target && st.pctWeek > 0.2) {
      const weeks = (target / current - 1) / (st.pctWeek / 100);
      if (weeks < 104) eta = app.addDays(app.today(), Math.round(weeks * 7));
    }
    return { name, target, current, best, done: best != null && best >= target, eta };
  });
}
app.liftGoalRows = liftGoalRows;

function goalsSectionHTML(series) {
  const rows = app.liftGoalRows(series), st = app.weekGoalStatus();
  const weekCard = st ? `<div class="card goal-week"><div class="gw-ring">${app.weekRingSVG(st.done, st.goal)}<b>${st.done}/${st.goal}</b></div>
      <div><h4>Sessions this week</h4>${app.weekGoalLineHTML()}</div></div>` : "";
  const lifts = rows.map((r) => {
    const pct = r.current ? Math.min(100, r.current / r.target * 100) : 0;
    return `<button class="goal-row" data-action="goal-lift" data-name="${app.esc(r.name)}">
      <span class="goal-top"><b>${app.esc(r.name)}</b><span>${r.done ? `Reached · ${Math.round(r.target)} ${app.wUnit()}` : r.current ? `${Math.round(r.current)} / ${Math.round(r.target)} ${app.wUnit()}` : `Goal ${Math.round(r.target)} ${app.wUnit()}`}</span></span>
      <span class="goal-bar"><i class="${r.done ? "done" : ""}" style="width:${r.done ? 100 : pct}%"></i></span>
      <span class="goal-eta">${r.done ? "Best est. 1RM is past your goal. Time for a new one?" : r.eta ? `At your current pace: around ${app.fmtDate(r.eta, { month: "short", day: "numeric", year: r.eta.slice(0, 4) !== app.today().slice(0, 4) ? "numeric" : undefined })}` : r.current ? "Estimated date appears once this lift is trending up." : "Log this lift to start tracking."}</span></button>`;
  }).join("");
  return `<div class="sec-h"><h3>Goals</h3><button class="link-inline" data-action="goal-lift" data-name="">Add lift goal</button></div>
    ${weekCard}
    ${lifts ? `<div class="card goals">${lifts}</div>` : `<div class="card"><p class="sub">Set a target for any lift, like an estimated 1-rep max of ${app.units() === "metric" ? "100 kg" : "225 lb"} on a press, and track how close you are.</p></div>`}
    ${st ? "" : `<button class="btn block" data-action="goal-week" style="margin-bottom:12px">Set a weekly session goal</button>`}`;
}
app.goalsSectionHTML = goalsSectionHTML;

function goalSheetHTML() {
  const name = app.ui.sd.name, series = app.liftSeries(app.src().sessions);
  const names = [...new Set([...app.state.workouts.flatMap((w) => w.exercises.map((e) => e.name)), ...Object.keys(series)])].sort();
  const g = name && app.goals().lifts[name];
  const s = (name && series[name]) || [];
  const best = s.length ? Math.max(...s.map((p) => p.v)) : null;
  return `<h3>${g ? "Edit lift goal" : "New lift goal"}</h3>
    <label class="field-label" for="goal-ex">Lift</label>
    <select class="text-in" id="goal-ex">${names.map((n) => `<option value="${app.esc(n)}" ${n === name ? "selected" : ""}>${app.esc(n)}</option>`).join("")}</select>
    <label class="field-label" for="goal-v">Target estimated 1-rep max (${app.wUnit()})</label>
    <input class="text-in" id="goal-v" inputmode="decimal" placeholder="${app.units() === "metric" ? "100" : "225"}" value="${g ? Math.round(app.kgToDisp(g.kg)) : ""}">
    <p class="sub small" style="margin:-8px 0 14px">${best ? `Your best so far: ${Math.round(best)} ${app.wUnit()}. ` : ""}Estimated 1RM lets any set count, e.g. 205 × 5 is about 239.</p>
    <div class="sheet-actions">${g ? `<button class="btn danger" data-action="goal-del">Remove</button>` : ""}<button class="btn primary" data-action="goal-save">Save goal</button></div>`;
}
app.goalSheetHTML = goalSheetHTML;

function weekGoalSheetHTML() {
  const cur = app.goals().sessionsPerWeek;
  return `<h3>Weekly session goal</h3><p class="sub" style="margin:-6px 0 14px">How many workouts do you want to hit each week (Monday to Sunday)?</p>
    <div class="seg7">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<button data-action="goal-week-set" data-n="${n}" aria-pressed="${cur === n}">${n}</button>`).join("")}</div>
    ${cur ? `<button class="btn danger block" data-action="goal-week-set" data-n="0" style="margin-top:12px">Turn off weekly goal</button>` : ""}`;
}
app.weekGoalSheetHTML = weekGoalSheetHTML;

/* ---------- PR board ---------- */
function prBoard(sessions) {
  const m = {};
  [...sessions].sort((a, b) => a.date.localeCompare(b.date)).forEach((s) => countedEntries(s).forEach((e) => e.sets.filter(app.countsForStats).forEach((x) => {
    const p = (m[e.exercise] = m[e.exercise] || { heavy: null, e1: null, reps: {}, bw: null });
    const v = app.estOn(x, s.date);
    if (x.w) {
      if (!p.heavy || x.w > p.heavy.w || (x.w === p.heavy.w && x.r > p.heavy.r)) p.heavy = { w: x.w, r: x.r, date: s.date };
      const k = String(x.w);
      if (!p.reps[k] || x.r > p.reps[k].r) p.reps[k] = { w: x.w, r: x.r, date: s.date };
    } else if (!p.bw || x.r > p.bw.r) p.bw = { r: x.r, date: s.date };
    if (v != null && (!p.e1 || v > p.e1.v)) p.e1 = { v, date: s.date, set: x };
  })));
  return m;
}
app.prBoard = prBoard;

function prBoardHTML(sessions) {
  const b = app.prBoard(sessions);
  const names = Object.keys(b).filter((n) => b[n].heavy || b[n].bw).sort((x, y) => ((b[y].e1 && b[y].e1.date) || "").localeCompare((b[x].e1 && b[x].e1.date) || ""));
  if (!names.length) return "";
  const d = (x) => app.fmtDate(x, { month: "short", day: "numeric" });
  return `<div class="sec-h" style="margin-top:22px"><h3>Personal records</h3><span class="sec-sub">Newest first</span></div>
    <div class="card prs">${names.map((n) => {
      const p = b[n];
      return `<button class="pr-row" data-action="lift" data-name="${app.esc(n)}"><b>${app.esc(n)}</b>
        <span class="pr-cells">
          ${p.heavy ? `<span><em>Heaviest</em>${app.fmtNum(p.heavy.w)} × ${p.heavy.r}<small>${d(p.heavy.date)}</small></span>` : `<span><em>Most reps</em>BW × ${p.bw.r}<small>${d(p.bw.date)}</small></span>`}
          ${p.e1 ? `<span><em>Best est. 1RM</em>${Math.round(p.e1.v)} ${app.wUnit()}<small>${d(p.e1.date)}</small></span>` : ""}
        </span></button>`;
    }).join("")}</div>`;
}
app.prBoardHTML = prBoardHTML;

function repRecordsHTML(name) {
  const p = app.prBoard(app.src().sessions)[name];
  if (!p) return "";
  const rows = Object.values(p.reps).sort((a, b) => b.w - a.w).slice(0, 8);
  if (!rows.length) return "";
  return `<div class="mini-l" style="margin-top:14px">Rep records</div>
    <ul class="wi-list">${rows.map((x) => `<li><span>${app.fmtNum(x.w)} ${app.wUnit()}</span><b>${app.pl(x.r, "rep")}</b><span class="sub small" style="margin:0;text-align:right">${app.fmtDate(x.date, { month: "short", day: "numeric" })}</span></li>`).join("")}</ul>`;
}
app.repRecordsHTML = repRecordsHTML;

/* ---------- Bulk-aware bodyweight rate ---------- */
const DIR_RANGES = {
  gain: { lo: 0.25, hi: 0.5, label: "lean bulk" },
  lose: { lo: -1.0, hi: -0.5, label: "steady cut" },
  maintain: { lo: -0.25, hi: 0.25, label: "maintenance" },
};
app.DIR_RANGES = DIR_RANGES;

function weightRate() {
  const w = app.weighIns().filter((x) => x.date >= app.addDays(app.today(), -28));
  if (w.length < 3) return null;
  const t0 = app.parseDay(w[0].date), xs = w.map((x) => (app.parseDay(x.date) - t0) / 86400000), ys = w.map((x) => x.kg);
  if (xs[xs.length - 1] < 10) return null;
  const mx = app.avg(xs), my = app.avg(ys);
  const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / (xs.reduce((a, x) => a + (x - mx) ** 2, 0) || 1);
  const perWeekKg = slope * 7;
  return { perWeek: app.kgToDisp(perWeekKg), pct: perWeekKg / ys[ys.length - 1] * 100 };
}
app.weightRate = weightRate;

function weightRateHTML() {
  const dir = app.goals().weightDir, r = app.weightRate();
  const pick = `<div class="seg2 dir-seg">${[["gain", "Gaining"], ["maintain", "Maintaining"], ["lose", "Losing"]].map(([k, l]) =>
    `<button data-action="goal-dir" data-d="${k}" aria-pressed="${dir === k}">${l}</button>`).join("")}</div>`;
  if (!r) return `<p class="sub small">${dir ? "Log a few weigh-ins over 10+ days to see your weekly rate." : "Are you gaining, maintaining or losing right now?"}</p>${pick}`;
  const range = dir && app.DIR_RANGES[dir];
  let msg = "";
  if (range) {
    msg = r.pct < range.lo ? (dir === "gain" ? `Slower than a typical ${range.label} (0.25–0.5% of bodyweight a week). A small calorie bump usually speeds it up.` : dir === "lose" ? "Faster than a typical steady cut (0.5–1% a week). Losing quickly can cost strength." : "Trending down a bit.")
        : r.pct > range.hi ? (dir === "gain" ? `Faster than a typical ${range.label}. Some of that is likely fat; easing calories slightly can slow it.` : dir === "lose" ? "Slower than a typical steady cut (0.5–1% a week)." : "Trending up a bit.")
        : `Right in a typical ${range.label} range.`;
  }
  return `<p class="rate"><b>${app.signed(r.perWeek, 1)} ${app.wUnit()}/week</b> <span>(${app.signed(r.pct, 2)}% of bodyweight)</span></p>
    ${msg ? `<p class="sub small" style="margin-top:4px">${msg}</p>` : ""}${pick}`;
}
app.weightRateHTML = weightRateHTML;
