import { app } from "../runtime.js";
import { FOOD_COMPLETE_KCAL, FOOD_COMPLETE_MEALS, weightTrend } from "../shared/correlate.js";

/* Stall detective, real maintenance, bulk quality, and workout efficiency.
   Numbers come only from logged data. Demo mode reads the sample bundle. */

function demoExtra() {
  if (!app.state.demo) return null;
  if (!app.DEMO) app.DEMO = app.makeDemo();
  return app.DEMO;
}

function sessions() { return app.src().sessions || []; }

function weighInsIn() {
  if (app.state.demo) return [...((demoExtra().weighIns) || [])].sort((a, b) => a.date.localeCompare(b.date));
  return app.weighIns();
}

/* A food day counts only with 2 meals or FOOD_COMPLETE_KCAL, same as correlations. */
function completeKcal(date) {
  const entries = app.state.demo ? ((demoExtra().foodDays || {})[date] || []) : (app.dayEntries(date) || []);
  if (!entries.length) return null;
  let kcal = 0;
  const meals = new Set();
  entries.forEach((e) => {
    if (!e || !e.base) return;
    const s = e.servings || 1;
    kcal += (e.base.kcal || 0) * s;
    if (e.meal) meals.add(String(e.meal));
  });
  if (!(kcal >= FOOD_COMPLETE_KCAL || meals.size >= FOOD_COMPLETE_MEALS)) return null;
  return kcal;
}

function totalsOn(date) {
  if (app.state.demo) {
    const entries = (demoExtra().foodDays || {})[date];
    if (!entries || !entries.length) return null;
    return entries.reduce((t, e) => {
      const s = e.servings || 1;
      t.kcal += (e.base.kcal || 0) * s; t.p += (e.base.p || 0) * s; t.c += (e.base.c || 0) * s; t.f += (e.base.f || 0) * s;
      return t;
    }, { kcal: 0, p: 0, c: 0, f: 0 });
  }
  if (!app.dayEntries(date).length) return null;
  return app.dayTotals(date);
}

function measBag() {
  if (app.state.demo) return demoExtra().measurements || {};
  return app.state.measurements || {};
}

function eachDate(start, end, fn) {
  for (let d = start; d <= end; d = app.addDays(d, 1)) fn(d);
}

function weekSpan(start, end) {
  return ((app.parseDay(end) - app.parseDay(start)) / 86400000 + 1) / 7;
}

function linSlope(points, yOf) {
  if (!points || points.length < 2) return null;
  const t0 = app.parseDay(points[0].date).getTime();
  const xs = points.map((p) => (app.parseDay(p.date).getTime() - t0) / 86400000);
  const ys = points.map(yOf);
  const mx = app.avg(xs), my = app.avg(ys);
  const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  if (!den) return 0;
  return xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / den;
}

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function fmtSleep(sec) {
  let m = Math.round((sec % 3600) / 60);
  let h = Math.floor(sec / 3600);
  if (m === 60) { h += 1; m = 0; }
  return `${h} h ${String(m).padStart(2, "0")} m`;
}

function fmtKcal(n) { return Math.round(n).toLocaleString("en-US"); }

function fmt1(n) {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function fmtLen(min) {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} m`;
}

function avgOver(start, end, valueOf) {
  const vals = [];
  eachDate(start, end, (d) => {
    const v = valueOf(d);
    if (v != null && !Number.isNaN(v)) vals.push(v);
  });
  if (vals.length < 3) return null;
  return { avg: app.avg(vals), n: vals.length };
}

function pctPerWeek(points) {
  if (!points || points.length < 4) return null;
  const slope = linSlope(points, (p) => p.v);
  const my = app.avg(points.map((p) => p.v));
  if (slope == null || !my) return null;
  return slope * 7 / my * 100;
}

/* ---------- Stall detective ---------- */
function lastPrDate(series) {
  const best = Math.max(...series.map((p) => p.v));
  let date = series[0].date;
  series.forEach((p) => { if (p.v === best) date = p.date; });
  return date;
}

export const STALL_MIN_WEEKS = 4;
export const STALL_MIN_SESSIONS = 4;

const dayMs = (d) => Date.parse(d + "T00:00:00Z");

/* A lift only counts as stalled after 4+ weeks and 4+ sessions without beating its best. */
export function stallWindow(series, today) {
  if (!series || !series.length) return { ok: false, days: 0, weeks: 0, sessionsSince: 0, prDate: null };
  const prDate = lastPrDate(series);
  const days = Math.max(0, Math.round((dayMs(today) - dayMs(prDate)) / 86400000));
  const sessionsSince = series.filter((p) => p.date > prDate).length;
  return {
    ok: days >= STALL_MIN_WEEKS * 7 && sessionsSince >= STALL_MIN_SESSIONS,
    days, weeks: Math.max(1, Math.round(days / 7)), sessionsSince, prDate,
  };
}

/* Advice from what is actually different about this lift:
   ctx = { weeks, sessionsSince, repsAvg, volume: "down"|"up"|null, bwPct }.
   One main lever plus a note on how long it has been stuck. */
export function stallAdvice(ctx) {
  const perWeek = ctx.sessionsSince / Math.max(1, ctx.weeks);
  let lever;
  if (ctx.volume === "down") lever = "Your weekly sets for this muscle fell, so bring them back to where they were before changing anything else.";
  else if (ctx.volume === "up") lever = "Weekly sets for this muscle went up a lot, so recovery may be the limit. Trim a set or two for a couple of weeks.";
  else if (ctx.bwPct != null && ctx.bwPct <= -1.5) lever = `Body weight is down about ${fmt1(Math.abs(ctx.bwPct))}%, which can pull strength down with it. Judge it by reps at the same weight.`;
  else if (ctx.bwPct != null && ctx.bwPct >= 1.5) lever = `Body weight is up about ${fmt1(ctx.bwPct)}%, so the same weight is relatively lighter. Add load in the smallest jumps you have.`;
  else if (ctx.repsAvg != null && ctx.repsAvg >= 12) lever = `Your best sets sit around ${Math.round(ctx.repsAvg)} reps. Add weight and work in the 6–10 rep range for a few weeks.`;
  else if (ctx.repsAvg != null && ctx.repsAvg <= 3) lever = `Your best sets are ${Math.round(ctx.repsAvg)} reps or fewer. Add a back-off set of 6–8 reps to build volume under the heavy work.`;
  else if (perWeek < 1) lever = `It showed up about ${fmt1(perWeek)} times a week since your last record. A second weekly session usually moves it more than any tweak.`;
  else if (perWeek >= 2.5) lever = `You hit it about ${fmt1(perWeek)} times a week, which leaves little time to recover. Drop one session and make the other heavier.`;
  else lever = "Add weight only after you hit your top rep range on every set, and add a rep each session until then.";
  const time = ctx.weeks >= 8
    ? `After ${ctx.weeks} weeks, change the variation or the rep range instead of repeating the same sets.`
    : "Give it two more weeks with 5–10% less weight before you change the program.";
  return `${lever} ${time}`;
}

/* Lifts that got identical advice share one line. */
export function groupStallAdvice(lifts) {
  const groups = [];
  const byText = {};
  lifts.forEach((l) => {
    if (!l.advice) return;
    if (byText[l.advice]) byText[l.advice].names.push(l.name);
    else { byText[l.advice] = { advice: l.advice, names: [l.name] }; groups.push(byText[l.advice]); }
  });
  return groups;
}

function stallBounds(series) {
  const prDate = lastPrDate(series);
  const end = app.today();
  let days = Math.round((app.parseDay(end) - app.parseDay(prDate)) / 86400000);
  if (days < 0) days = 0;
  days = Math.min(28, Math.max(21, days));
  const start = app.addDays(end, -days);
  return {
    prDate, start, end,
    baseStart: app.addDays(start, -28),
    baseEnd: app.addDays(start, -1),
    weeksSincePR: Math.max(1, Math.round(Math.max(0, (app.parseDay(end) - app.parseDay(prDate)) / 86400000) / 7))
  };
}

function mainMuscle(list, name) {
  let m = null;
  list.forEach((s) => s.entries.forEach((e) => {
    if (e.exercise === name && e.muscles && e.muscles[0]) m = e.muscles[0];
  }));
  return m;
}

function muscleSets(list, muscle, start, end) {
  let n = 0;
  list.forEach((s) => {
    if (s.date < start || s.date > end) return;
    s.entries.forEach((e) => {
      if (!e.muscles || e.muscles[0] !== muscle) return;
      n += app.workCount(e);
    });
  });
  return n / weekSpan(start, end);
}

function stallFactors(name, series, bounds) {
  const { start, end, baseStart, baseEnd } = bounds;
  const list = sessions();
  const oura = app.src().oura || {};
  const flags = [];
  let volume = null;
  let bwPct = null;
  const sleepA = avgOver(start, end, (d) => oura[d] && oura[d].total != null ? oura[d].total : null);
  const sleepB = avgOver(baseStart, baseEnd, (d) => oura[d] && oura[d].total != null ? oura[d].total : null);
  if (sleepA && sleepB && sleepA.avg <= sleepB.avg - 30 * 60) {
    flags.push({ score: (sleepB.avg - sleepA.avg) / 60 / 30, text: `Sleep averaged ${fmtSleep(sleepA.avg)} vs ${fmtSleep(sleepB.avg)} when it was climbing.` });
  }
  const rdA = avgOver(start, end, (d) => oura[d] && oura[d].readiness != null ? oura[d].readiness : null);
  const rdB = avgOver(baseStart, baseEnd, (d) => oura[d] && oura[d].readiness != null ? oura[d].readiness : null);
  if (rdA && rdB && rdA.avg <= rdB.avg - 5) {
    flags.push({ score: (rdB.avg - rdA.avg) / 5, text: `Readiness averaged ${Math.round(rdA.avg)} vs ${Math.round(rdB.avg)} when it was climbing.` });
  }
  const pA = avgOver(start, end, (d) => { const t = totalsOn(d); return t ? t.p : null; });
  const pB = avgOver(baseStart, baseEnd, (d) => { const t = totalsOn(d); return t ? t.p : null; });
  if (pA && pB && pB.avg > 0 && pA.avg <= pB.avg * 0.85) {
    flags.push({ score: (1 - pA.avg / pB.avg) / 0.15, text: `Protein averaged ${Math.round(pA.avg)} g vs ${Math.round(pB.avg)} g when it was climbing.` });
  }
  const cA = avgOver(start, end, (d) => { const t = totalsOn(d); return t ? t.kcal : null; });
  const cB = avgOver(baseStart, baseEnd, (d) => { const t = totalsOn(d); return t ? t.kcal : null; });
  if (cA && cB) {
    const dropped = cB.avg > 0 && cA.avg <= cB.avg * 0.9;
    const tdee = app.autoTargets() && app.autoTargets().basis.tdee;
    const under = app.goals().weightDir === "gain" && tdee && cA.avg < tdee;
    if (dropped) flags.push({ score: (1 - cA.avg / cB.avg) / 0.1, text: `Calories averaged ${fmtKcal(cA.avg)} vs ${fmtKcal(cB.avg)} when it was climbing.` });
    else if (under) flags.push({ score: 1, text: `Calories averaged ${fmtKcal(cA.avg)}, below your estimated maintenance of ${fmtKcal(tdee)}, while you're trying to gain.` });
  }
  const muscle = mainMuscle(list, name);
  if (muscle) {
    const vA = muscleSets(list, muscle, start, end);
    const vB = muscleSets(list, muscle, baseStart, baseEnd);
    const label = (app.MUSCLES[muscle] || muscle).toLowerCase();
    if (vB > 0 && vA <= vB * 0.75) volume = "down";
    else if (vB > 0 && vA >= vB * 1.4) volume = "up";
    if (vB > 0 && vA <= vB * 0.75) flags.push({ score: (1 - vA / vB) / 0.25, text: `Weekly ${label} sets averaged ${fmt1(vA)} vs ${fmt1(vB)} when it was climbing.` });
    else if (vB > 0 && vA >= vB * 1.4) flags.push({ score: (vA / vB - 1) / 0.4, text: `Weekly ${label} sets averaged ${fmt1(vA)} vs ${fmt1(vB)} when it was climbing.` });
  }
  const fA = series.filter((p) => p.date >= start && p.date <= end).length / weekSpan(start, end);
  const fB = series.filter((p) => p.date >= baseStart && p.date <= baseEnd).length / weekSpan(baseStart, baseEnd);
  if (fA <= fB - 0.5) flags.push({ score: (fB - fA) / 0.5, text: `${name} showed up ${fmt1(fA)} times a week vs ${fmt1(fB)} when it was climbing.` });
  {
    const wA = weighInsIn().filter((w) => w.date >= start && w.date <= end);
    const wB = weighInsIn().filter((w) => w.date >= baseStart && w.date <= baseEnd);
    if (wA.length && wB.length) {
      const a = app.avg(wA.map((w) => w.kg)), b = app.avg(wB.map((w) => w.kg));
      if (b > 0) bwPct = (a - b) / b * 100;
      if (app.goals().weightDir === "gain" && a < b - 0.2) flags.push({ score: 1, text: `Body weight averaged ${app.fmtW(app.kgToDisp(a))} vs ${app.fmtW(app.kgToDisp(b))} when it was climbing, while your goal is to gain.` });
    }
  }
  return { flags: flags.sort((a, b) => b.score - a.score).slice(0, 3), volume, bwPct };
}

function stallReport() {
  const seriesMap = app.liftSeries(sessions());
  let watched = 0;
  const lifts = [];
  Object.entries(seriesMap).forEach(([name, series]) => {
    if (series.length < 6) return;
    const span = (app.parseDay(series[series.length - 1].date) - app.parseDay(series[0].date)) / 86400000;
    if (span < 42) return;
    watched++;
    const st = app.liftStatus(series);
    if (st.label !== "Plateau" && st.label !== "Declining") return;
    const win = stallWindow(series, app.today());
    if (!win.ok) return;
    const bounds = stallBounds(series);
    const { flags, volume, bwPct } = stallFactors(name, series, bounds);
    const since = series.filter((p) => p.date > win.prDate && p.top && p.top.r != null);
    const repsAvg = since.length ? app.avg(since.map((p) => p.top.r)) : null;
    const advice = stallAdvice({ weeks: win.weeks, sessionsSince: win.sessionsSince, repsAvg, volume, bwPct });
    lifts.push({ name, st, weeks: win.weeks, flags, advice, rank: st.label === "Declining" ? 2 : 1 });
  });
  lifts.sort((a, b) => b.rank - a.rank || b.flags.length - a.flags.length || Math.abs(b.st.pctWeek || 0) - Math.abs(a.st.pctWeek || 0));
  return { empty: watched === 0, clear: watched > 0 && lifts.length === 0, total: lifts.length, lifts: lifts.slice(0, 3) };
}
app.stallReport = stallReport;

function stallHTML() {
  const rep = stallReport();
  const title = "Stall detective";
  if (rep.empty) return widgetShell(title, `<p class="sub">Log a lift on 6+ sessions over 6 weeks to unlock this.</p>`);
  if (rep.clear) return widgetShell(title, `<h4 class="ins-verdict">No lifts look stalled right now.</h4><p class="ins-why">This shows up when a lift plateaus or starts slipping after at least 4 weeks and 4 sessions without a new best.</p>`);
  const verdict = rep.total === 1
    ? `${rep.lifts[0].name} has stalled.`
    : `${rep.total} lifts have stalled or started slipping.`;
  const body = rep.lifts.map((l) => `<div class="ins-lift"><div class="ins-lift-h"><b>${app.esc(l.name)}</b><span class="chip-s ${l.st.cls}">No PR in ${l.weeks} week${l.weeks === 1 ? "" : "s"}</span></div>
    ${l.flags.length ? `<ul class="ins-factors">${l.flags.map((f) => `<li>${app.esc(f.text)}</li>`).join("")}</ul>` : ""}</div>`).join("");
  const advice = `<ul class="ins-factors" style="margin-top:14px">${groupStallAdvice(rep.lifts).map((g) => `<li><b>${app.esc(g.names.join(", "))}:</b> ${app.esc(g.advice)}</li>`).join("")}</ul>`;
  return widgetShell(title, `<h4 class="ins-verdict">${app.esc(verdict)}</h4>${body}${advice}<p class="ins-why">These are patterns, not proof. The biggest gap is usually the place to start.</p>`);
}

/* ---------- Real maintenance ---------- */
function maintenanceReport() {
  const end = app.today();
  const start = app.addDays(end, -28);
  const logged = [];
  eachDate(start, end, (d) => { const kcal = completeKcal(d); if (kcal != null) logged.push(kcal); });
  const wis = weighInsIn().filter((w) => w && w.date >= start && w.date <= end);
  const trend = weightTrend(wis, end);
  const dates = [];
  const seen = new Set();
  wis.forEach((w) => {
    if (!w || typeof w.kg !== "number" || seen.has(w.date)) return;
    seen.add(w.date);
    dates.push(w.date);
  });
  dates.sort();
  const span = dates.length >= 2 ? (app.parseDay(dates[dates.length - 1]) - app.parseDay(dates[0])) / 86400000 : 0;
  if (logged.length < 14 || !trend.ready) return { empty: true, days: logged.length, weighIns: dates.length, span, scale: trend.ready };
  const slope = trend.perWeekKg / 7;
  const intake = app.avg(logged);
  const maint = Math.round((intake - slope * 7700) / 10) * 10;
  const auto = app.autoTargets();
  const tdee = auto && auto.basis ? auto.basis.tdee : null;
  return { empty: false, maint, intake, slope, days: logged.length, weighIns: dates.length, tdee };
}
app.maintenanceReport = maintenanceReport;

function maintSentence(rep) {
  const n = rep.maint.toLocaleString("en-US");
  if (rep.tdee == null) return `Your real maintenance is about ${n}.`;
  const diff = rep.maint - rep.tdee;
  if (diff === 0) return `Your real maintenance is about ${n}, matching the estimate.`;
  return `Your real maintenance is about ${n}, ${Math.abs(diff).toLocaleString("en-US")} ${diff > 0 ? "more" : "less"} than estimated.`;
}

function goalAdj() {
  const dir = app.goals().weightDir;
  if (dir === "gain") return { dir, adj: 250, phrase: "maintenance plus 250 for a gain" };
  if (dir === "lose") return { dir, adj: -400, phrase: "maintenance minus 400 for a cut" };
  return { dir: dir || "maintain", adj: 0, phrase: "maintenance, with no surplus or deficit" };
}

function maintenanceHTML() {
  const rep = maintenanceReport();
  const title = "Real maintenance calories";
  if (rep.empty) {
    const food = rep.days >= 14, scale = !!rep.scale;
    const msg = food && !scale ? "Log 5 weigh-ins over 14 days to unlock this."
      : scale && !food ? "Log food on 14+ days in the last month to unlock this."
      : "Log 5 weigh-ins over 14 days, and food on 14+ days, to unlock this.";
    return widgetShell(title, `<p class="sub">${msg}</p>`);
  }
  const g = goalAdj();
  const kcal = Math.round((rep.maint + g.adj) / 10) * 10;
  const weekly = app.kgToDisp(rep.slope * 7);
  const apply = app.state.demo
    ? `<p class="sub small">Turn off sample data before using this for your targets.</p>`
    : `<button class="btn block" data-action="use-maint">Use this for my targets</button><p class="sub small">Sets calories to ${kcal.toLocaleString("en-US")} (${g.phrase}). Protein stays put, fat is 25% of calories, and carbs fill the rest.</p>`;
  return widgetShell(title, `<h4 class="ins-verdict">${app.esc(maintSentence(rep))}</h4>
    <div class="stats"><div class="stat"><b>${fmtKcal(rep.intake)}</b><span>Avg calories on logged days</span></div>
    <div class="stat"><b>${app.signed(weekly, 2)}<small> ${app.wUnit()}</small></b><span>Weight change per week</span></div></div>
    <p class="ins-why">Based on ${app.pl(rep.days, "logged day")} and ${app.pl(rep.weighIns, "weigh-in")}. Unlogged meals make this read low.</p>
    ${apply}`);
}
app.maintenanceHTML = maintenanceHTML;

function applyRealMaintenance() {
  if (app.state.demo) { app.toast("Turn off sample data before changing your targets."); return; }
  const rep = maintenanceReport();
  if (!rep || rep.empty) return;
  const prev = JSON.parse(JSON.stringify(app.food().targets));
  const g = goalAdj();
  const kcal = Math.round((rep.maint + g.adj) / 10) * 10;
  const cur = app.targets();
  const last = app.weighIns().slice(-1)[0];
  const prot = cur && cur.p ? cur.p : (last ? Math.round(2 * last.kg) : 150);
  const fat = Math.round(kcal * 0.25 / 9);
  const carbs = Math.max(0, Math.round((kcal - prot * 4 - fat * 9) / 4));
  app.food().targets = { auto: false, kcal, p: prot, c: carbs, f: fat };
  app.foodTouch();
  app.render();
  app.toast("Targets updated from your real maintenance.", () => { app.food().targets = prev; app.foodTouch(); app.render(); });
}
app.applyRealMaintenance = applyRealMaintenance;

/* ---------- Bulk quality ---------- */
function measDelta(key, start, end) {
  const bag = measBag();
  const pts = Object.keys(bag).filter((d) => d >= start && d <= end).sort()
    .map((d) => (bag[d] && bag[d].vals ? bag[d].vals[key] : null)).filter((v) => v != null);
  if (pts.length < 2) return null;
  return pts[pts.length - 1] - pts[0];
}

function measNote(start, end) {
  const waist = measDelta("waist", start, end), arms = measDelta("arms", start, end), chest = measDelta("chest", start, end);
  if (waist == null && arms == null && chest == null) return null;
  const bit = (cm) => `${app.signed(app.cmToDisp(cm), 1)} ${app.lenUnit()}`;
  if (waist != null && arms != null && chest != null && Math.abs(waist) < 1 && arms >= 0.5 && chest >= 0.5)
    return "Waist stayed about the same while arms and chest rose, which tends to be a good sign.";
  const parts = [];
  if (waist != null) parts.push(`waist ${bit(waist)}`);
  if (arms != null) parts.push(`arms ${bit(arms)}`);
  if (chest != null) parts.push(`chest ${bit(chest)}`);
  return parts.length ? `Over this window, ${parts.join(", ")}.` : null;
}

function bulkReport() {
  const end = app.today();
  const start = app.addDays(end, -56);
  const wis = weighInsIn().filter((w) => w.date >= start && w.date <= end);
  const span = wis.length >= 2 ? (app.parseDay(wis[wis.length - 1].date) - app.parseDay(wis[0].date)) / 86400000 : 0;
  let weightRate = null;
  if (wis.length >= 2 && span >= 14) {
    const slope = linSlope(wis, (p) => p.kg);
    const mean = app.avg(wis.map((w) => w.kg));
    if (mean && slope != null) weightRate = slope * 7 / mean * 100;
  }
  const rates = [];
  Object.values(app.liftSeries(sessions())).forEach((pts) => {
    const pct = pctPerWeek(pts.filter((p) => p.date >= start && p.date <= end));
    if (pct != null) rates.push(pct);
  });
  const strength = rates.length ? median(rates) : null;
  return { empty: weightRate == null || strength == null, weightRate, strength, note: measNote(start, end), weighIns: wis.length, lifts: rates.length, span };
}
app.bulkReport = bulkReport;

function bulkVerdict(w, s) {
  if (w >= 0.15 && s >= 0.3) return "Quality bulk: strength is keeping pace.";
  if (w > 0.5 && s < 0.3) return "Gaining faster than you're getting stronger, so likely extra fat. Consider a smaller surplus.";
  if (Math.abs(w) <= 0.15 && s >= 0.3) return "Recomposition: stronger at the same weight.";
  const wt = w >= 0.15 ? "up" : w <= -0.15 ? "down" : "about flat";
  const st = s >= 0.3 ? "up" : s <= -0.3 ? "down" : "about flat";
  return `Weight is ${wt} and strength is ${st}.`;
}

function bulkHTML() {
  const rep = bulkReport();
  const title = "Bulk quality";
  if (rep.empty) {
    const scale = rep.weightRate != null, strong = rep.strength != null;
    const msg = !scale && !strong ? "Log weigh-ins across 2+ weeks and repeat a lift for 4+ sessions to unlock this."
      : !scale ? "Log weigh-ins across 2+ weeks to unlock this."
      : "Repeat a lift for 4+ sessions in the last 8 weeks to unlock this.";
    return widgetShell(title, `<p class="sub">${msg}</p>`);
  }
  const dir = app.goals().weightDir;
  const goal = dir === "gain" ? "Your goal is to gain, which is what this comparison is built for." : "This reads clearest when your goal is to gain.";
  return widgetShell(title, `<h4 class="ins-verdict">${app.esc(bulkVerdict(rep.weightRate, rep.strength))}</h4>
    <div class="stats"><div class="stat"><b>${app.signed(rep.weightRate, 2)}<small>%/wk</small></b><span>Body weight</span></div>
    <div class="stat"><b>${app.signed(rep.strength, 1)}<small>%/wk</small></b><span>Strength</span></div></div>
    ${rep.note ? `<p class="sub">${app.esc(rep.note)}</p>` : ""}
    <p class="ins-why">${goal} Rates are the scale's weekly trend and the middle lift's estimated strength change.</p>`);
}

/* ---------- Workout efficiency ---------- */
function timedSets(s) {
  const out = [];
  s.entries.forEach((e) => e.sets.forEach((set) => {
    if (!app.isWork(set) || !set.at) return;
    const t = new Date(set.at).getTime();
    if (!Number.isNaN(t)) out.push({ t, exercise: e.exercise });
  }));
  out.sort((a, b) => a.t - b.t);
  return out;
}

function restsOf(s) {
  const sets = timedSets(s);
  const out = [];
  for (let i = 1; i < sets.length; i++) {
    const gap = (sets[i].t - sets[i - 1].t) / 1000;
    if (gap > 0 && gap <= 600) out.push({ sec: gap, exercise: sets[i - 1].exercise });
  }
  return out;
}

function hasTimestamps(s) {
  return s.entries.some((e) => e.sets.some((set) => app.isWork(set) && set.at));
}

function efficiencyReport() {
  const all = sessions().filter(hasTimestamps);
  if (all.length < 3) return { empty: true, n: all.length };
  const by = {};
  all.forEach((s) => { const id = s.workoutId || s.name || "workout"; (by[id] = by[id] || []).push(s); });
  const routines = Object.entries(by).map(([id, list]) => {
    const recent = [...list].sort((a, b) => (b.date + String(b.startedAt || "")).localeCompare(a.date + String(a.startedAt || ""))).slice(0, 8).reverse();
    const rests = recent.flatMap(restsOf);
    const points = [];
    recent.forEach((s) => {
      if (!s.startedAt || !s.finishedAt) return;
      const ms = new Date(s.finishedAt) - new Date(s.startedAt);
      if (ms > 0) points.push({ date: s.date, min: ms / 60000 });
    });
    const hours = points.reduce((n, p) => n + p.min, 0) / 60;
    const setN = recent.reduce((n, s) => n + app.workSetCount(s), 0);
    return {
      id, name: (recent[recent.length - 1] && recent[recent.length - 1].name) || "Workout",
      rest: median(rests.map((r) => r.sec)), rests, points,
      lenAvg: points.length ? app.avg(points.map((p) => p.min)) : null,
      perHour: hours > 0 ? setN / hours : null
    };
  });
  const allRests = routines.flatMap((r) => r.rests);
  const byEx = {};
  allRests.forEach((r) => { (byEx[r.exercise] = byEx[r.exercise] || []).push(r.sec); });
  const longest = Object.entries(byEx).map(([name, secs]) => ({ name, med: median(secs), n: secs.length }))
    .filter((x) => x.n >= 2).sort((a, b) => b.med - a.med).slice(0, 2);
  return { empty: false, routines, rest: median(allRests.map((r) => r.sec)), timer: app.state.restSeconds || 120, longest };
}
app.efficiencyReport = efficiencyReport;

function efficiencyHTML() {
  const rep = efficiencyReport();
  const title = "Workout efficiency";
  if (rep.empty) return widgetShell(title, `<p class="sub">Finish 3 workouts with set times to unlock this.</p>`);
  const timer = app.fmtTime(rep.timer);
  const verdict = rep.rest == null
    ? "These workouts don't have enough timed rests yet."
    : `You rest ${app.fmtTime(Math.round(rep.rest))} on average vs your ${timer} timer.`;
  const longs = rep.longest.length
    ? `<p class="sub">Longest rests tend to be ${rep.longest.map((x) => `${app.esc(x.name)} (${app.fmtTime(Math.round(x.med))})`).join(" and ")}.</p>`
    : "";
  const blocks = rep.routines.map((r) => `<div class="ins-routine"><b>${app.esc(r.name)}</b>
    <div class="stats">
      <div class="stat"><b>${r.rest == null ? "–" : app.fmtTime(Math.round(r.rest))}</b><span>Median rest</span></div>
      <div class="stat"><b>${r.lenAvg == null ? "–" : fmtLen(r.lenAvg)}</b><span>Avg session</span></div>
      <div class="stat"><b>${r.perHour == null ? "–" : fmt1(r.perHour)}</b><span>Working sets per hour</span></div>
    </div>
    ${r.points.length >= 2 ? app.chartSVG({ labels: r.points.map((p) => p.date), series: [{ data: r.points.map((p) => p.min), cls: "ln" }], h: 88, fmt: (v) => Math.round(v) + "m" }) : ""}
  </div>`).join("");
  return widgetShell(title, `<h4 class="ins-verdict">${app.esc(verdict)}</h4>${longs}${blocks}
    <p class="ins-why">Rest is the gap between working sets. Gaps over 10 minutes count as breaks, not rest.</p>`);
}

function widgetShell(title, inner) {
  return `<div class="sec-h"><h3>${app.esc(title)}</h3></div><div class="card ins-card">${inner}</div>`;
}

function trendWidgetsHTML() {
  return `<!--w:stall-->${stallHTML()}<!--w:maintenance-->${maintenanceHTML()}<!--w:bulk-->${bulkHTML()}<!--w:efficiency-->${efficiencyHTML()}`;
}
app.trendWidgetsHTML = trendWidgetsHTML;
