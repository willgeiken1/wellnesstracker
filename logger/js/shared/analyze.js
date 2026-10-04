import { app } from "../runtime.js";
import { correlate as runCorrelations, effect as bucketEffect } from "./correlate.js";

/* Charts and the numbers behind Insights. */
/* ================= Oura + insights ================= */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
app.clamp = clamp;

const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
app.avg = avg;

const e1rm = (s) => (s.w ? s.w * (1 + s.r / 30) : null);
app.e1rm = e1rm;

           // Epley estimate
/* Bodyweight sets (pull-ups, dips) use the person's bodyweight on that date. */
function estOn(x, date) {
  if (x.w) return app.e1rm(x);
  if (app.state.demo || typeof app.bodyweightOn !== "function") return null;
  const bw = app.bodyweightOn(date);
  return bw ? bw * (1 + x.r / 30) : null;
}
app.estOn = estOn;

const fmtHM = (sec) => `${Math.floor(sec / 3600)}h ${String(Math.round((sec % 3600) / 60)).padStart(2, "0")}m`;
app.fmtHM = fmtHM;

const signed = (v, d = 1) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}`;
app.signed = signed;

/* Realistic sample month so Recovery and Insights can be explored before Oura is connected.
   Deterministic, and kept completely separate from real workouts. */
let DEMO = null;
app.DEMO = DEMO;

function makeDemo() {
  let seed = 20260930;
  const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const N = 56, end = app.today(), days = {}, sessions = [];
  const hrvBase = 58;
  for (let i = N - 1; i >= 0; i--) {
    const d = app.addDays(end, -i), dow = app.parseDay(d).getDay(), work = dow >= 1 && dow <= 5;
    let sleepH = work ? 6.5 + rnd() * 1.3 : 7.3 + rnd() * 1.4;
    if (rnd() < 0.12) sleepH -= 1.2;
    const hrv = Math.round(hrvBase + (sleepH - 7) * 6 + (rnd() - 0.5) * 10 - (work ? 2 : 0) - (i < 14 ? 7 : 0));
    const rhr = Math.round(54 - (sleepH - 7) * 1.5 + (rnd() - 0.5) * 4 + (i < 9 ? 1.5 : 0));
    const total = Math.round(sleepH * 3600);
    const deep = Math.round(total * (0.15 + rnd() * 0.07)), rem = Math.round(total * (0.19 + rnd() * 0.07)), awake = Math.round(total * (0.04 + rnd() * 0.04));
    days[d] = {
      date: d, total, deep, rem, awake, light: total - deep - rem - awake,
      sleepScore: app.clamp(Math.round(72 + (sleepH - 7) * 12 + (rnd() - 0.5) * 8), 40, 98),
      readiness: app.clamp(Math.round(76 + (sleepH - 7) * 9 + (hrv - hrvBase) * 0.6 + (rnd() - 0.5) * 8), 45, 98),
      hrv, rhr, temp: Math.round((rnd() - 0.5) * 0.6 * 100) / 100,
      steps: Math.round(work ? 13000 + rnd() * 6000 : 5000 + rnd() * 5000)
    };
  }
  const base = { "Smith Machine Incline Bench Press": 135, "Chest Press Machine": 160, "Pec Fly Machine": 110, "Shoulder Press Machine": 100,
    "Cable Lateral Raise": 20, "Cable Tricep Pulldown": 50, "Lat Pulldown Machine": 140, "Seated Row Machine": 130, "Plate Loaded Low Row": 180,
    "Preacher Curl Machine": 60, "Rope Hammer Curl": 40, "Seated Leg Press Machine": 360, "Barbell Romanian Deadlift (RDL)": 185,
    "Seated Leg Curl Machine": 110, "Seated Leg Extension Machine": 130, "Calf Raises": 180 };
  const rate = { "Shoulder Press Machine": 0, "Cable Lateral Raise": 0, "Seated Leg Curl Machine": -0.004 };
  const order = ["push", "pull", "legs"];
  let k = 0;
  for (let i = N - 1; i >= 1; i--) {
    const d = app.addDays(end, -i);
    if (app.parseDay(d).getDay() === 0 || rnd() < 0.07) continue;
    const wid = order[k++ % 3];
    const w = app.DEFAULT_WORKOUTS.find((x) => x.id === wid);
    const prevSteps = (days[app.addDays(d, -1)] || {}).steps || 9000;
    const form = 1 + 0.0035 * (days[d].readiness - 78) - (prevSteps > 15000 ? 0.025 : 0) + (rnd() - 0.5) * 0.02;
    const weeks = (N - 1 - i) / 7;
    let minute = 2;
    const stamp = () => {
      const h = 17 + Math.floor(minute / 60), m = minute % 60;
      minute += 3;
      return `${d}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
    };
    const entries = w.exercises.filter((e) => base[e.name]).map((e) => {
      const W = Math.round(base[e.name] * (1 + (rate[e.name] ?? 0.008) * weeks) / 5) * 5;
      const sets = [0, 1, 2].map((j) => ({ w: W, r: app.clamp(Math.round(8 + (form - 1) * 35 - j * 0.7 + (rnd() - 0.5)), 4, 15), at: stamp() }));
      return { exercise: e.name, muscles: [...e.muscles], sets };
    });
    sessions.push({ id: "demo" + i, date: d, workoutId: w.id, name: w.name, startedAt: d + "T17:00:00", finishedAt: d + "T18:10:00", entries });
  }
  const weighIns = [];
  for (let i = 56; i >= 0; i -= 7) weighIns.push({ date: app.addDays(end, -i), kg: Math.round((82 + (56 - i) / 7 * 0.2) * 10) / 10 });
  const foodDays = {};
  for (let i = 0; i <= 28; i++) {
    const d = app.addDays(end, -i);
    foodDays[d] = [{ id: "df" + i, meal: "lunch", name: "Sample meals", base: { kcal: 3000, p: 170, c: 330, f: 80 }, servings: 1, at: d + "T12:00:00" }];
  }
  const measurements = {};
  measurements[app.addDays(end, -49)] = { vals: { waist: 84, arms: 35, chest: 100 }, at: 1 };
  measurements[app.addDays(end, -5)] = { vals: { waist: 84.3, arms: 36.2, chest: 101.4 }, at: 2 };
  return { sessions, oura: days, weighIns, foodDays, measurements };
}
app.makeDemo = makeDemo;

function src() {
  if (app.state.demo) { if (!app.DEMO) app.DEMO = app.makeDemo(); return app.DEMO; }
  return { sessions: app.state.sessions.filter((s) => s.finishedAt && app.setCount(s) > 0), oura: (app.state.oura && app.state.oura.days) || {} };
}
app.src = src;

function latestOura(oura) {
  const keys = Object.keys(oura).filter((k) => oura[k] && oura[k].readiness != null).sort();
  return keys.length ? oura[keys[keys.length - 1]] : null;
}
app.latestOura = latestOura;

const dash = (v, f) => (v == null || Number.isNaN(v) ? "–" : f(v));
app.dash = dash;

function readinessLevel(r) {
  if (r >= 85) return { cls: "up", word: "Primed", tip: "Good day to push for a heavier set or a PR." };
  if (r >= 70) return { cls: "ok", word: "Good", tip: "Train as planned." };
  return { cls: "down", word: "Low", tip: "Recovery is low. Consider lighter weights or fewer sets today." };
}
app.readinessLevel = readinessLevel;

/* ---------- Analysis ---------- */
function liftSeries(sessions) {
  const m = {};
  [...sessions].sort((a, b) => a.date.localeCompare(b.date)).forEach((s) => s.entries.forEach((e) => {
    const est = (x) => app.estOn(x, s.date);
    const sets = e.sets.filter((x) => x.tag !== "warmup");
    const vals = sets.map(est).filter((v) => v != null);
    if (!vals.length) return;
    const best = sets.reduce((b, x) => (est(x) || 0) > (est(b) || 0) ? x : b, sets[0]);
    (m[e.exercise] = m[e.exercise] || []).push({ date: s.date, v: Math.max(...vals), top: best });
  }));
  return m;
}
app.liftSeries = liftSeries;

function liftStatus(series) {
  if (series.length < 4) return { cls: "wait", label: `Collecting data (${series.length}/4)`, pct: null };
  const cutoff = app.addDays(app.today(), -42);
  let pts = series.filter((p) => p.date >= cutoff);
  if (pts.length < 4) pts = series.slice(-6);
  const t0 = app.parseDay(pts[0].date);
  const xs = pts.map((p) => (app.parseDay(p.date) - t0) / 86400000), ys = pts.map((p) => p.v);
  const mx = app.avg(xs), my = app.avg(ys);
  const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0) || 1;
  const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / den;
  const pctWeek = slope * 7 / my * 100;
  const span = xs[xs.length - 1] - xs[0];
  const pct = slope * span / (my - slope * (mx - xs[0])) * 100;
  const best = Math.max(...series.map((p) => p.v));
  const sincePR = series.length - 1 - series.map((p) => p.v).lastIndexOf(best);
  let cls, label;
  if (pctWeek >= 0.4) { cls = "up"; label = "Progressing"; }
  else if (pctWeek <= -0.6) { cls = "down"; label = "Declining"; }
  else if (sincePR >= 3) { cls = "flat"; label = "Plateau"; }
  else { cls = "up"; label = "Holding steady"; }
  return { cls, label, pct, pctWeek, best, sincePR, weeks: Math.max(1, Math.round(span / 7)) };
}
app.liftStatus = liftStatus;

/* Each session scored against that lift's previous 3 sessions, averaged across lifts (in %) */
function sessionPerf(sessions) {
  const hist = {}, out = [];
  [...sessions].sort((a, b) => a.date.localeCompare(b.date)).forEach((s) => {
    const ratios = [];
    s.entries.forEach((e) => {
      const vals = e.sets.filter((x) => x.tag !== "warmup").map((x) => app.estOn(x, s.date)).filter((v) => v != null);
      if (!vals.length) return;
      const v = Math.max(...vals), prev = (hist[e.exercise] || []).slice(-3);
      if (prev.length >= 2) ratios.push(v / app.avg(prev) - 1);
      (hist[e.exercise] = hist[e.exercise] || []).push(v);
    });
    if (ratios.length) out.push({ date: s.date, perf: app.avg(ratios) * 100 });
  });
  return out;
}
app.sessionPerf = sessionPerf;

/* Bucket averages for the Insights screen. The general engine lives in correlate.js. */
function effect(perfs, valueOf, buckets) {
  return bucketEffect(perfs, valueOf, buckets);
}
app.effect = effect;

/* Daily correlations for later screens. Nothing here is rendered, and nothing is sent off the device. */
function correlationSource() {
  const S = app.src();
  const demo = !!(app.state && app.state.demo);
  let targets = null;
  if (!demo && typeof app.targets === "function") {
    try { targets = app.targets(); } catch (e) { targets = null; }
  }
  let liftPerf = null;
  if (typeof app.sessionPerf === "function") {
    try { liftPerf = app.sessionPerf(S.sessions || []); } catch (e) { liftPerf = null; }
  }
  return {
    sessions: S.sessions || [],
    oura: S.oura || {},
    foodDays: demo ? (S.foodDays || {}) : ((app.state && app.state.food && app.state.food.days) || {}),
    targets,
    weighIns: demo ? (S.weighIns || []) : (typeof app.weighIns === "function" ? app.weighIns() : []),
    cardioSessions: demo ? [] : ((app.state && app.state.cardio && app.state.cardio.sessions) || []),
    measurements: demo ? (S.measurements || {}) : ((app.state && app.state.measurements) || {}),
    checkins: demo ? null : (app.state && app.state.checkins),
    liftPerf,
  };
}
app.correlationSource = correlationSource;

function correlations(options) {
  const opts = { ...(options || {}) };
  if (opts.weightDir == null && typeof app.goals === "function") {
    try { opts.weightDir = app.goals().weightDir || null; } catch (e) { opts.weightDir = null; }
  }
  return runCorrelations(correlationSource(), opts);
}
app.correlations = correlations;

function effectCard(title, rows, sentence, need) {
  const max = Math.max(4, ...rows.filter((r) => r.n >= 3).map((r) => Math.abs(r.avg)));
  return `<div class="card"><h4>${title}</h4><p class="sub">${sentence || need}</p>
    <div class="cmp">${rows.map((r) => {
      const ok = r.n >= 3, v = ok ? r.avg : 0, w = Math.min(50, Math.abs(v) / max * 50);
      return `<div class="cmp-row"><span>${r.label}</span>
        <div class="cmp-bar"><i class="${v >= 0 ? "pos" : "neg"}" style="left:${v >= 0 ? 50 : 50 - w}%;width:${ok ? w : 0}%"></i><b></b></div>
        <span class="cmp-v">${ok ? app.signed(v) + "%" : `n=${r.n}`}</span></div>`;
    }).join("")}</div></div>`;
}
app.effectCard = effectCard;

function compareSentence(rows, better, worse) {
  const hi = rows[rows.length - 1], lo = rows[0];
  if (hi.n < 3 || lo.n < 3) return null;
  const d = hi.avg - lo.avg;
  if (Math.abs(d) < 1) return `So far there's little difference between ${worse} and ${better}.`;
  return d > 0 ? `You lift about ${d.toFixed(1)}% stronger ${better} than ${worse}.`
               : `Surprisingly, you've lifted ${Math.abs(d).toFixed(1)}% better ${worse} than ${better}.`;
}
app.compareSentence = compareSentence;

/* ---------- Charts (hand-drawn SVG, no libraries) ---------- */
function chartSVG({ labels, series, h = 130, yMin, yMax, guide, fmt = (v) => Math.round(v) }) {
  const W = 340, P = { l: 30, r: 8, t: 10, b: 20 }, n = labels.length, iw = W - P.l - P.r, ih = h - P.t - P.b;
  const all = series.flatMap((s) => s.data.filter((v) => v != null)).concat(guide != null ? [guide] : []);
  if (!all.length) return "";
  let lo = yMin ?? Math.min(...all), hi = yMax ?? Math.max(...all);
  if (yMin == null || yMax == null) { const pad = (hi - lo) * 0.12 || 1; if (yMin == null) lo -= pad; if (yMax == null) hi += pad; }
  const X = (i) => P.l + (n === 1 ? iw / 2 : i * iw / (n - 1));
  const Y = (v) => P.t + ih - (v - lo) / (hi - lo) * ih;
  let g = "";
  [0, 0.5, 1].forEach((f) => { const v = lo + (hi - lo) * f; g += `<line class="grid" x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ax" x="${P.l - 5}" y="${Y(v) + 3}" text-anchor="end">${fmt(v)}</text>`; });
  [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i).forEach((i) =>
    g += `<text class="ax" x="${X(i)}" y="${h - 5}" text-anchor="${i === 0 ? "start" : i === n - 1 ? "end" : "middle"}">${app.fmtDate(labels[i], { month: "short", day: "numeric" })}</text>`);
  if (guide != null) g += `<line class="guide" x1="${P.l}" x2="${W - P.r}" y1="${Y(guide)}" y2="${Y(guide)}"/>`;
  series.forEach((s) => {
    if (s.type === "bar") {
      const bw = Math.max(2, iw / n * 0.6);
      s.data.forEach((v, i) => { if (v == null) return; const y = Y(Math.max(v, lo)); g += `<rect class="${s.cls || "bar"}" x="${X(i) - bw / 2}" y="${y}" width="${bw}" height="${Math.max(0, Y(lo) - y)}" rx="1.5"/>`; });
    } else {
      let d = "", started = false;
      s.data.forEach((v, i) => { if (v == null) { started = false; return; } d += `${started ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; started = true; });
      g += `<path class="${s.cls || "ln"}" d="${d}"/>`;
      const li = s.data.map((v, i) => v != null ? i : -1).filter((i) => i >= 0).pop();
      if (li != null) g += `<circle class="${s.cls || "ln"}-dot" cx="${X(li)}" cy="${Y(s.data[li])}" r="3"/>`;
    }
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" role="img">${g}</svg>`;
}
app.chartSVG = chartSVG;

function sparkSVG(vals, cls) {
  if (vals.length < 2) return `<svg class="spark" viewBox="0 0 92 34"></svg>`;
  const lo = Math.min(...vals), hi = Math.max(...vals), r = hi - lo || 1;
  const d = vals.map((v, i) => `${i ? "L" : "M"}${(i / (vals.length - 1) * 88 + 2).toFixed(1)},${(30 - (v - lo) / r * 26).toFixed(1)}`).join("");
  return `<svg class="spark ${cls}" viewBox="0 0 92 34"><path d="${d}"/></svg>`;
}
app.sparkSVG = sparkSVG;

function ringSVG(v, cls) {
  const C = 2 * Math.PI * 44;
  return `<svg class="ring ${cls}" viewBox="0 0 108 108" role="img" aria-label="Readiness ${v}">
    <circle cx="54" cy="54" r="44" class="ring-bg"/><circle cx="54" cy="54" r="44" class="ring-fg" stroke-dasharray="${C * v / 100} ${C}" transform="rotate(-90 54 54)"/>
    <text x="54" y="60" text-anchor="middle" class="ring-v">${v}</text></svg>`;
}
app.ringSVG = ringSVG;

const demoBanner = () => app.state.demo ? `<div class="demo-banner"><span>Showing sample data. Your real workouts aren't affected.</span><button data-action="demo-off">Turn off</button></div>` : "";
app.demoBanner = demoBanner;
