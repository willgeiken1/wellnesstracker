/* Correlation engine for daily wellness series.

   Pure functions: no network, no DOM, and no analytics. Health values stay in
   memory on the device. Insights still calls effect() for its fixed buckets;
   that helper now lives here next to the general engine.

   A day of logs is not an independent coin flip, and one user is compared on
   well over a hundred factor, outcome, and lag pairs. A centred 29-day mean
   is removed from each numeric series before any cut. Days past either end
   are filled by reflection through a least-squares line on the first or last
   15 days (2*a0 - y[k] at the start, 2*aN - y[N-k] at the end), so the window
   stays centred. A shared drift is then not read as a split of early days
   against late days. Each
   comparison uses Welch's t with an effective sample size from the outcome's
   autocorrelation, then Benjamini-Hochberg q-values across that whole family.
   Confidence also requires a minimum effect size, so noise does not get a card. */

export const MIN_PER_GROUP = 7;
export const LATE_HOUR = 21;

const CONFIDENCE_WEIGHT = { low: 1, medium: 2, high: 3 };

/* Metrics the logger already stores. Extra numeric fields on a day are picked
   up too. plural tunes "is" / "are" in the sentence. absolute means the
   sentence quotes the raw difference, because a percent of a near-zero
   baseline (temperature deviation, lift % vs recent) is misleading. */
/* better: "higher" means a rise is good, "lower" means a drop is good,
   "goal" follows the weight goal, anything else stays neutral. */
const METRICS = {
  readiness: { label: "readiness", better: "higher" },
  sleepScore: { label: "sleep score", better: "higher" },
  sleepHours: { label: "sleep time", better: "higher" },
  deepHours: { label: "deep sleep", better: "higher" },
  remHours: { label: "REM sleep", better: "higher" },
  lightHours: { label: "light sleep" },
  awakeMin: { label: "time awake", better: "lower" },
  steps: { label: "steps", plural: true },
  hrv: { label: "HRV", better: "higher" },
  rhr: { label: "resting heart rate", better: "lower" },
  temp: { label: "temperature deviation", absolute: true },
  workoutVolume: { label: "workout volume" },
  liftPerf: { label: "strength", absolute: true, better: "higher" },
  calories: { label: "calories", plural: true },
  protein: { label: "protein" },
  carbs: { label: "carbs", plural: true },
  fat: { label: "fat" },
  weight: { label: "weight", better: "goal" },
  cardioMin: { label: "cardio" },
  cardioKcal: { label: "cardio calories", plural: true },
  waist: { label: "waist" },
  arms: { label: "arms", plural: true },
  chest: { label: "chest" },
};

/* Oura fields from one night or day. Two of these on the same date are the
   same story told twice (sleep score versus hours, HRV versus readiness). */
const OURA_IDS = new Set(["readiness", "sleepScore", "sleepHours", "deepHours", "remHours", "lightHours", "awakeMin", "steps", "hrv", "rhr", "temp"]);

export const DISPLAY_LIMIT = 8;
export const SEE_ALL_LIMIT = 25;
export const DAYS_FOR_A_PATTERN = MIN_PER_GROUP * 2;

/* Outcomes worth showing. Other series can still be factors.
   Weight is only an outcome when the person has a gain or lose goal. */
const OUTCOME_IDS = new Set(["readiness", "sleepScore", "sleepHours", "deepHours", "hrv", "rhr", "liftPerf", "weight"]);

const BOOLEAN_PHRASE = {
  workedOut: "you work out",
  didCardio: "you do cardio",
  lateEating: "you eat late",
  proteinOverTarget: "your protein is over target",
  caloriesOverTarget: "your calories are over target",
  carbsOverTarget: "your carbs are over target",
  fatOverTarget: "your fat is over target",
};

/* Pairs inside a group predict each other too directly to be useful:
   a threshold versus its own number, slices of one night, or "showed up"
   versus the volume of that same session. */
const LOCKED = [
  ["sleepHours", "deepHours", "remHours", "lightHours", "awakeMin"],
  ["cardioMin", "cardioKcal", "didCardio"],
  ["workoutVolume", "workedOut"],
  ["calories", "caloriesOverTarget"],
  ["protein", "proteinOverTarget"],
  ["carbs", "carbsOverTarget"],
  ["fat", "fatOverTarget"],
];

const OURA_STAGES = { total: "sleepHours", deep: "deepHours", rem: "remHours", light: "lightHours" };
const OURA_NAMED = ["readiness", "sleepScore", "hrv", "rhr", "temp", "steps"];
const MOOD_KEY = /mood|feel|emotion/i;

export function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

function finite(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function mean(xs) {
  if (!xs.length) return null;
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i];
  return s / xs.length;
}

function variance(xs, m) {
  if (xs.length < 2) return 0;
  let s = 0;
  for (let i = 0; i < xs.length; i++) {
    const d = xs[i] - m;
    s += d * d;
  }
  return s / (xs.length - 1);
}

/* Lanczos approximation. Enough for the beta function behind Welch's t. */
function logGamma(z) {
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < 9; i++) x += c[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function betacf(a, b, x) {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 3e-12) break;
  }
  return h;
}

function regularizedBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lnBeta = logGamma(a) + logGamma(b) - logGamma(a + b);
  if (x < (a + 1) / (a + b + 2)) {
    const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta) / a;
    return front * betacf(a, b, x);
  }
  const front = Math.exp(Math.log(1 - x) * b + Math.log(x) * a - lnBeta) / b;
  return 1 - front * betacf(b, a, 1 - x);
}

/* Two-tailed p for Student's t. */
export function studentP(t, df) {
  if (!Number.isFinite(df) || df <= 0) return 1;
  if (!Number.isFinite(t)) return 0;
  if (t === 0) return 1;
  const x = df / (df + t * t);
  const p = regularizedBeta(x, df / 2, 0.5);
  return Math.min(1, Math.max(0, p));
}

export function welch(a, b) {
  const n1 = a.length;
  const n2 = b.length;
  const m1 = mean(a);
  const m2 = mean(b);
  const v1 = variance(a, m1);
  const v2 = variance(b, m2);
  const diff = m1 - m2;
  const se2 = v1 / n1 + v2 / n2;
  let t = 0;
  let df = n1 + n2 - 2;
  let p = 1;
  if (se2 === 0) {
    t = diff === 0 ? 0 : Infinity;
    p = diff === 0 ? 1 : 0;
  } else {
    t = diff / Math.sqrt(se2);
    const left = (v1 / n1) ** 2 / (n1 - 1);
    const right = (v2 / n2) ** 2 / (n2 - 1);
    df = (se2 * se2) / (left + right);
    p = studentP(t, df);
  }
  const sp = n1 + n2 > 2 ? Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2)) : 0;
  const d = sp === 0 ? (diff === 0 ? 0 : Math.sign(diff) * 5) : diff / sp;
  return { meanWith: m1, meanWithout: m2, diff, t, df, p, d, v1, v2 };
}

const dayCache = Object.create(null);
function dayNumber(iso) {
  const known = dayCache[iso];
  if (known != null) return known;
  const n = Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000);
  dayCache[iso] = n;
  return n;
}

/* Lag-1 correlation of consecutive calendar days. The sample coefficient is
   biased toward -1/n under white noise, so that amount is added back and the
   result is shrunk toward 0. Only positive dependence is kept: negative
   dependence would make the test more willing to call a fluke real. */
function lag1Rho(dated) {
  let n = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 1; i < dated.length; i++) {
    if (dated[i].t - dated[i - 1].t !== 1) continue;
    const x = dated[i - 1].y;
    const y = dated[i].y;
    n++;
    sx += x;
    sy += y;
    sxx += x * x;
    syy += y * y;
    sxy += x * y;
  }
  if (n < 8) return 0;
  const vx = sxx - (sx * sx) / n;
  const vy = syy - (sy * sy) / n;
  if (vx <= 1e-12 || vy <= 1e-12) return 0;
  const r = (sxy - (sx * sy) / n) / Math.sqrt(vx * vy);
  if (!Number.isFinite(r)) return 0;
  const shrunk = (r + 1 / n) * (n / (n + 12));
  if (!(shrunk > 0)) return 0;
  return shrunk > 0.8 ? 0.8 : shrunk;
}

function seriesRho(map, idx) {
  const dated = [];
  const dates = Object.keys(map);
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const known = idx && idx[date];
    dated.push({ t: known == null ? dayNumber(date) : known, y: map[date] });
  }
  dated.sort((a, b) => a.t - b.t);
  return lag1Rho(dated);
}

/* Variance of the with-minus-without contrast if the outcome is AR(1) with
   correlation rho^|days apart|, divided by the independent-days variance.
   1 means the usual Welch standard error is already honest. The multiplier
   is clamped to [1, 40]: dependence never counts as extra evidence, and a
   very sticky series cannot shrink the sample without limit. */
let contrastWeights = new Float64Array(512);

function contrastInflation(withDays, withoutDays, rho) {
  if (!(rho > 0)) return 1;
  const n1 = withDays.length;
  const n2 = withoutDays.length;
  if (n1 < 2 || n2 < 2) return 1;
  let tMin = withDays[0];
  let tMax = tMin;
  for (let i = 1; i < n1; i++) {
    const t = withDays[i];
    if (t < tMin) tMin = t;
    else if (t > tMax) tMax = t;
  }
  for (let i = 0; i < n2; i++) {
    const t = withoutDays[i];
    if (t < tMin) tMin = t;
    else if (t > tMax) tMax = t;
  }
  const span = tMax - tMin + 1;
  if (!Number.isFinite(span) || span < 1) return 1;
  if (contrastWeights.length < span) contrastWeights = new Float64Array(span);
  else contrastWeights.fill(0, 0, span);
  const w1 = 1 / n1;
  const w2 = -1 / n2;
  for (let i = 0; i < n1; i++) contrastWeights[withDays[i] - tMin] += w1;
  for (let i = 0; i < n2; i++) contrastWeights[withoutDays[i] - tMin] += w2;
  let acc = 0;
  let quad = 0;
  let ww = 0;
  for (let i = 0; i < span; i++) {
    const w = contrastWeights[i];
    acc = w + rho * acc;
    quad += w * acc;
    ww += w * w;
  }
  const S = 2 * quad - ww;
  const indep = w1 - w2;
  if (!(S > 0) || !Number.isFinite(S)) return 1;
  const inflation = S / indep;
  if (!Number.isFinite(inflation) || inflation < 1) return 1;
  return inflation > 40 ? 40 : inflation;
}

/* Effective days in each arm after the contrast inflation above. */
export function effectiveN(withDays, withoutDays, rho) {
  const n1 = withDays.length;
  const n2 = withoutDays.length;
  const inflation = contrastInflation(withDays, withoutDays, rho);
  return {
    inflation,
    n1: n1 / inflation,
    n2: n2 / inflation,
  };
}

/* Welch's test with the effective sample size in the standard error and the
   degrees of freedom. Means, variances, and Cohen's d stay on the raw days:
   dependence widens the uncertainty, it does not change the gap. One tail
   probability is computed, from the effective size. */
export function welchEffective(a, b, n1eff, n2eff) {
  const n1 = a.length;
  const n2 = b.length;
  const m1 = mean(a);
  const m2 = mean(b);
  const v1 = variance(a, m1);
  const v2 = variance(b, m2);
  const diff = m1 - m2;
  const sp = n1 + n2 > 2 ? Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2)) : 0;
  const d = sp === 0 ? (diff === 0 ? 0 : Math.sign(diff) * 5) : diff / sp;
  if (!(n1eff >= 2) || !(n2eff >= 2)) {
    return { meanWith: m1, meanWithout: m2, diff, t: 0, df: 1, p: 1, d, v1, v2, n1eff, n2eff };
  }
  const se2 = v1 / n1eff + v2 / n2eff;
  let t = 0;
  let df = n1eff + n2eff - 2;
  let p = 1;
  if (se2 === 0) {
    t = diff === 0 ? 0 : Infinity;
    p = diff === 0 ? 1 : 0;
  } else {
    t = diff / Math.sqrt(se2);
    const left = (v1 / n1eff) ** 2 / Math.max(n1eff - 1, 1e-9);
    const right = (v2 / n2eff) ** 2 / Math.max(n2eff - 1, 1e-9);
    const den = left + right;
    df = den === 0 ? n1eff + n2eff - 2 : (se2 * se2) / den;
    p = studentP(t, df);
  }
  return { meanWith: m1, meanWithout: m2, diff, t, df, p, d, v1, v2, n1eff, n2eff };
}

/* Benjamini-Hochberg q-values. q(i) is the smallest FDR at which test i is
   still rejected, so a later screen can threshold them without a second pass. */
export function benjaminiHochberg(ps) {
  const m = ps.length;
  const q = new Array(m);
  if (!m) return q;
  const order = ps.map((p, i) => ({
    p: Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 1,
    i,
  }));
  order.sort((a, b) => a.p - b.p || a.i - b.i);
  let running = 1;
  for (let k = m - 1; k >= 0; k--) {
    const val = Math.min(1, (order[k].p * m) / (k + 1));
    if (val < running) running = val;
    q[order[k].i] = running;
  }
  return q;
}

/* Same bucket averages the Insights screen already shows. */
export function effect(perfs, valueOf, buckets) {
  return buckets.map((b) => {
    const xs = [];
    for (let i = 0; i < perfs.length; i++) {
      const v = valueOf(perfs[i].date);
      if (v != null && b.test(v)) xs.push(perfs[i].perf);
    }
    return { label: b.label, avg: mean(xs), n: xs.length };
  });
}

function metricMeta(id) {
  if (METRICS[id]) return METRICS[id];
  const label = String(id).replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return { label, plural: /s$/i.test(label) && !/(readiness|sleep|hours|ss)$/i.test(label) };
}

/* Parent metric for a yes/no factor, when it is just a cut of that metric. */
const BOOLEAN_SOURCE = {
  workedOut: "workoutVolume",
  didCardio: "cardioMin",
  proteinOverTarget: "protein",
  caloriesOverTarget: "calories",
  carbsOverTarget: "carbs",
  fatOverTarget: "fat",
  lateEating: null,
};

function locked(factorId, source, outcome) {
  const self = source || factorId;
  if (self === outcome || factorId === outcome) return true;
  for (let g = 0; g < LOCKED.length; g++) {
    const group = LOCKED[g];
    const factorIn = group.indexOf(self) !== -1 || group.indexOf(factorId) !== -1;
    const outcomeIn = group.indexOf(outcome) !== -1;
    if (factorIn && outcomeIn) return true;
  }
  return false;
}

function isOura(id, extra) {
  if (!id) return false;
  if (OURA_IDS.has(id)) return true;
  return !!(extra && extra.has(id));
}

function isTrainingFactor(factor) {
  const id = String(factor && factor.id || "");
  return id === "workedOut" || id.indexOf("workout:") === 0;
}

function isTrainingOutcome(outcome) {
  return outcome === "workoutVolume" || outcome === "liftPerf" || String(outcome || "").indexOf("workout:") === 0;
}

/* Oura stores a night on the wake-up date. Sleep, HRV, resting heart rate,
   readiness, and the rest of that night are already known on the morning of
   that date, before the day's training and meals. Tonight's sleep is the
   next date. */
const MORNING_IDS = new Set(["readiness", "sleepScore", "sleepHours", "deepHours", "remHours", "lightHours", "awakeMin", "hrv", "rhr", "temp"]);
const LATER_IDS = new Set([
  "workedOut", "workoutVolume", "liftPerf", "steps",
  "calories", "protein", "carbs", "fat", "lateEating",
  "caloriesOverTarget", "proteinOverTarget", "carbsOverTarget", "fatOverTarget",
  "didCardio", "cardioMin", "cardioKcal",
]);

function factorMetric(factor) {
  const id = String(factor && factor.id || "");
  if (id.indexOf("workout:") === 0) return id;
  if (factor && factor.source) return factor.source;
  return id.replace(/:(median|tertile)$/, "");
}

function isLaterFactor(factor) {
  const id = String(factor && factor.id || "");
  if (id.indexOf("workout:") === 0) return true;
  const metric = factorMetric(factor);
  return LATER_IDS.has(metric) || LATER_IDS.has(id);
}

/* Same-night Oura pairs tell one story twice. A workout type or "worked out"
   against volume, strength, or another workout type is the training split.
   A factor that happens later in the day cannot explain that morning's
   sleep, readiness, HRV, or resting heart rate. The next-day lag can. */
export function suppressedStory(factor, outcome, lag, ouraExtra) {
  if (lag === 0 && isOura(factor.source || factor.id, ouraExtra) && isOura(outcome, ouraExtra)) return true;
  if (isTrainingFactor(factor) && isTrainingOutcome(outcome)) return true;
  if (lag === 0 && isLaterFactor(factor) && MORNING_IDS.has(outcome)) return true;
  return false;
}

function outcomeAllowed(id, weightDir) {
  if (!OUTCOME_IDS.has(id)) return false;
  if (id === "weight") return weightDir === "gain" || weightDir === "lose";
  return true;
}

function preferredDirection(outcome, weightDir) {
  const better = metricMeta(outcome).better || "neutral";
  if (better === "goal") {
    if (weightDir === "gain") return "higher";
    if (weightDir === "lose") return "lower";
    return "neutral";
  }
  return better;
}

export function valenceOf(outcome, diff, percent, weightDir) {
  const direction = preferredDirection(outcome, weightDir);
  if (direction !== "higher" && direction !== "lower") return "neutral";
  const moved = percent != null ? percent : diff;
  if (moved == null || Math.abs(moved) < 0.5) return "neutral";
  const up = moved > 0;
  if (direction === "higher") return up ? "good" : "bad";
  return up ? "bad" : "good";
}

function dayBucket(days, date) {
  if (!days[date]) days[date] = {};
  return days[date];
}

function putNum(bucket, key, value) {
  const n = finite(value);
  if (n == null) return;
  bucket[key] = n;
}

function hourOf(at) {
  if (typeof at !== "string") return null;
  const m = at.match(/T(\d{2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) + Number(m[2]) / 60;
}

function setVolume(set) {
  if (!set || set.tag === "warmup") return 0;
  if (set.uni) {
    const sides = [set.uni.l, set.uni.r];
    let n = 0;
    for (let i = 0; i < sides.length; i++) {
      const side = sides[i];
      if (side && finite(side.w) != null && finite(side.r) != null) n += side.w * side.r;
    }
    return n;
  }
  if (finite(set.w) == null || finite(set.r) == null) return 0;
  return set.w * set.r;
}

function workSets(session) {
  const out = [];
  const entries = session && session.entries || [];
  for (let i = 0; i < entries.length; i++) {
    const sets = entries[i].sets || [];
    for (let j = 0; j < sets.length; j++) if (sets[j] && sets[j].tag !== "warmup") out.push(sets[j]);
  }
  return out;
}

function eachDay(from, to) {
  const out = [];
  for (let d = from; d <= to && out.length < 2000; d = addDays(d, 1)) out.push(d);
  return out;
}

function ouraMap(oura) {
  if (!oura || typeof oura !== "object") return {};
  if (oura.days && typeof oura.days === "object" && !Array.isArray(oura.days)) return oura.days;
  return oura;
}

function resolvedTargets(data) {
  if (data.targets && typeof data.targets === "object") {
    const out = {};
    ["kcal", "p", "c", "f"].forEach((k) => { const n = finite(data.targets[k]); if (n != null) out[k] = n; });
    if (Object.keys(out).length) return out;
  }
  const t = data.food && data.food.targets;
  if (!t || typeof t !== "object") return null;
  const out = {};
  ["kcal", "p", "c", "f"].forEach((k) => { const n = finite(t[k]); if (n != null) out[k] = n; });
  return Object.keys(out).length ? out : null;
}

function addCheckins(days, checkins) {
  const list = [];
  if (Array.isArray(checkins)) {
    checkins.forEach((x) => { if (x && typeof x === "object") list.push(x); });
  } else if (checkins && typeof checkins === "object") {
    Object.keys(checkins).forEach((d) => {
      const x = checkins[d];
      if (x && typeof x === "object") list.push({ ...x, date: x.date || x.day || d });
      else if (finite(x) != null) list.push({ date: d, value: x });
    });
  }
  list.forEach((x) => {
    const date = x.date || x.day;
    if (!date) return;
    const bucket = dayBucket(days, date);
    Object.keys(x).forEach((k) => {
      if (k === "date" || k === "day" || k === "id" || k === "note" || k === "kind" || k === "type" || k === "at") return;
      if (MOOD_KEY.test(k)) return;
      const n = finite(x[k]);
      if (n == null) return;
      putNum(bucket, "checkin_" + k, n);
    });
  });
}

/* Turn a user_data blob (or the smaller shape the app passes) into one row per day. */
export function extractDays(data) {
  const src = data || {};
  const days = {};
  const phrases = {};
  const ouraKeys = new Set();
  const active = [];

  const oura = ouraMap(src.oura);
  Object.keys(oura).forEach((date) => {
    const day = oura[date];
    if (!day || typeof day !== "object") return;
    active.push(date);
    const bucket = dayBucket(days, date);
    OURA_NAMED.forEach((k) => { if (finite(day[k]) != null) { putNum(bucket, k, day[k]); ouraKeys.add(k); } });
    Object.keys(OURA_STAGES).forEach((k) => {
      const n = finite(day[k]);
      if (n == null) return;
      bucket[OURA_STAGES[k]] = n / 3600;
      ouraKeys.add(OURA_STAGES[k]);
    });
    const awake = finite(day.awake);
    if (awake != null) { bucket.awakeMin = awake / 60; ouraKeys.add("awakeMin"); }
    Object.keys(day).forEach((k) => {
      if (k === "date" || k === "awake" || OURA_STAGES[k] || OURA_NAMED.indexOf(k) !== -1) return;
      if (days[date][k] != null) return;
      if (finite(day[k]) == null) return;
      putNum(bucket, k, day[k]);
      ouraKeys.add(k);
    });
  });

  const sessions = src.sessions || [];
  const typeCounts = {};
  const typeNames = {};
  sessions.forEach((s) => {
    if (!s || !s.finishedAt || !s.date) return;
    const sets = workSets(s);
    if (!sets.length) return;
    active.push(s.date);
    const bucket = dayBucket(days, s.date);
    bucket.workedOut = true;
    let vol = finite(bucket.workoutVolume) || 0;
    sets.forEach((set) => { vol += setVolume(set); });
    bucket.workoutVolume = vol;
    const raw = String(s.workoutId || s.name || "").trim();
    const slug = raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!slug) return;
    const id = "workout:" + slug;
    bucket[id] = true;
    typeCounts[id] = (typeCounts[id] || 0) + 1;
    typeNames[id] = s.name || raw;
  });

  const foodDays = src.foodDays || (src.food && src.food.days) || {};
  const targets = resolvedTargets(src);
  Object.keys(foodDays).forEach((date) => {
    const entries = foodDays[date];
    if (!Array.isArray(entries) || !entries.length) return;
    active.push(date);
    let kcal = 0, p = 0, c = 0, f = 0, any = false, stamped = false, late = false;
    entries.forEach((e) => {
      if (!e || !e.base) return;
      const servings = finite(e.servings) != null ? e.servings : 1;
      const bk = finite(e.base.kcal), bp = finite(e.base.p), bc = finite(e.base.c), bf = finite(e.base.f);
      if (bk == null && bp == null && bc == null && bf == null) return;
      any = true;
      kcal += (bk || 0) * servings;
      p += (bp || 0) * servings;
      c += (bc || 0) * servings;
      f += (bf || 0) * servings;
      const hour = hourOf(e.at);
      if (hour != null) {
        stamped = true;
        if (hour >= LATE_HOUR) late = true;
      }
    });
    if (!any) return;
    const bucket = dayBucket(days, date);
    bucket.calories = kcal;
    bucket.protein = p;
    bucket.carbs = c;
    bucket.fat = f;
    if (stamped) bucket.lateEating = late;
    if (targets) {
      if (finite(targets.p) != null && targets.p > 0) bucket.proteinOverTarget = p > targets.p;
      if (finite(targets.kcal) != null && targets.kcal > 0) bucket.caloriesOverTarget = kcal > targets.kcal;
      if (finite(targets.c) != null && targets.c > 0) bucket.carbsOverTarget = c > targets.c;
      if (finite(targets.f) != null && targets.f > 0) bucket.fatOverTarget = f > targets.f;
    }
  });

  const weighIns = src.weighIns || (src.profile && src.profile.weighIns) || [];
  weighIns.forEach((w) => {
    if (!w || !w.date) return;
    putNum(dayBucket(days, w.date), "weight", w.kg);
  });

  const cardio = src.cardioSessions || (src.cardio && Array.isArray(src.cardio.sessions) ? src.cardio.sessions : src.cardio) || [];
  if (Array.isArray(cardio)) {
    cardio.forEach((s) => {
      if (!s || !s.date) return;
      active.push(s.date);
      const bucket = dayBucket(days, s.date);
      bucket.didCardio = true;
      let min = 0;
      const segs = s.segments || [];
      if (segs.length) segs.forEach((g) => { min += finite(g && g.min) || 0; });
      else min = finite(s.min) || 0;
      bucket.cardioMin = (finite(bucket.cardioMin) || 0) + min;
      const kcal = finite(s.kcal);
      if (kcal != null) bucket.cardioKcal = (finite(bucket.cardioKcal) || 0) + kcal;
    });
  }

  const measurements = src.measurements || {};
  Object.keys(measurements).forEach((date) => {
    const row = measurements[date];
    const vals = row && row.vals && typeof row.vals === "object" ? row.vals : row;
    if (!vals || typeof vals !== "object" || Array.isArray(vals)) return;
    const bucket = dayBucket(days, date);
    Object.keys(vals).forEach((k) => {
      if (k === "at" || k === "date" || k === "vals") return;
      putNum(bucket, k, vals[k]);
    });
  });

  addCheckins(days, src.checkins);

  const lift = src.liftPerf;
  if (Array.isArray(lift)) {
    lift.forEach((row) => { if (row && row.date) putNum(dayBucket(days, row.date), "liftPerf", row.perf); });
  } else if (lift && typeof lift === "object") {
    Object.keys(lift).forEach((date) => putNum(dayBucket(days, date), "liftPerf", lift[date]));
  }

  const span = active.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  if (span.length) {
    eachDay(span[0], span[span.length - 1]).forEach((date) => {
      const bucket = dayBucket(days, date);
      if (bucket.workedOut !== true) bucket.workedOut = false;
      if (bucket.didCardio !== true) bucket.didCardio = false;
      Object.keys(typeCounts).forEach((id) => {
        if (bucket.workedOut === true) bucket[id] = bucket[id] === true;
      });
    });
  }

  Object.keys(typeCounts).forEach((id) => {
    const name = String(typeNames[id] || "workout").trim().toLowerCase();
    phrases[id] = "you do a " + name + " workout";
  });

  return { days, phrases, ouraKeys };
}

function quantile(sorted, p) {
  if (!sorted.length) return null;
  const x = (sorted.length - 1) * p;
  const lo = Math.floor(x);
  const hi = Math.ceil(x);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (hi - x) + sorted[hi] * (x - lo);
}

function numericSeries(days) {
  const found = {};
  Object.keys(days).forEach((date) => {
    const bucket = days[date];
    Object.keys(bucket).forEach((k) => {
      if (finite(bucket[k]) != null) found[k] = true;
    });
  });
  return Object.keys(found);
}

function factorPhrase(id, label, verb) {
  if (id === "sleepHours") return { median: "you sleep more than usual", tertile: "you get a long night of sleep" };
  if (id === "deepHours") return { median: "your deep sleep is longer than usual", tertile: "you get a lot of deep sleep" };
  if (id === "steps") return { median: "you get more steps than usual", tertile: "you get a lot of steps" };
  if (id === "workoutVolume") return { median: "your workout is heavier than usual", tertile: "you have a heavy workout" };
  if (id === "calories") return { median: "you eat more than usual", tertile: "your calories are in the top third" };
  return {
    median: "your " + label + " " + verb + " above your usual",
    tertile: "your " + label + " " + verb + " in the top third",
  };
}

/* Centred 29-day window: 14 days on each side of the day itself.
   Days before the first sample and after the last are reflected through a
   least-squares line fitted to the first or last ~15 days: 2*a0 - y[k] at
   the start and 2*aN - y[N-k] at the end. A flat series stays flat, and a
   line keeps its slope. Reflecting through the raw endpoint amplifies noise. */
const TREND_HALF = 14;

/* Subtract each numeric series' centred rolling mean, then add the series
   mean back. Cuts and outcomes both use this copy, so a slow drift is not a
   high-versus-low split, and a percent still refers to the usual level.
   Booleans are copied through unchanged. */
let trendT = new Float64Array(256);
let trendY = new Float64Array(256);
let trendAt = new Int32Array(256);
let trendOrder = [];
let extT = new Float64Array(320);
let extY = new Float64Array(320);

function detrendGrow(n) {
  if (trendT.length >= n) return;
  let cap = trendT.length;
  while (cap < n) cap *= 2;
  trendT = new Float64Array(cap);
  trendY = new Float64Array(cap);
  trendAt = new Int32Array(cap);
}

function extGrow(n) {
  if (extT.length >= n) return;
  let cap = extT.length;
  while (cap < n) cap *= 2;
  extT = new Float64Array(cap);
  extY = new Float64Array(cap);
}

/* `times` and `values` are sorted by time. Line-reflected copies pad both
   ends by up to TREND_HALF days. `apply` is called with the original index
   and the detrended value. Interior days use only real neighbours. */
function detrendSeries(times, values, at, n, apply) {
  if (n < 2) return;
  let overall = 0;
  for (let i = 0; i < n; i++) overall += values[i];
  overall /= n;
  const t0 = times[0];
  const tN = times[n - 1];
  let nLeft = 0;
  for (let i = 1; i < n; i++) {
    if (2 * t0 - times[i] < t0 - TREND_HALF) break;
    nLeft++;
  }
  let nRight = 0;
  for (let i = n - 2; i >= 0; i--) {
    if (2 * tN - times[i] > tN + TREND_HALF) break;
    nRight++;
  }
  const edgeFit = (fromStart) => {
    let sx = 0, sy = 0, sxx = 0, sxy = 0, c = 0;
    const tE = fromStart ? t0 : tN;
    for (let j = 0; j < n; j++) {
      const i = fromStart ? j : n - 1 - j;
      const dt = times[i] - tE;
      if (Math.abs(dt) > TREND_HALF) break;
      sx += dt; sy += values[i]; sxx += dt * dt; sxy += dt * values[i]; c++;
    }
    const den = c * sxx - sx * sx;
    if (c < 3 || den === 0) return sy / c;
    const b = (c * sxy - sx * sy) / den;
    return (sy - b * sx) / c;
  };
  const a0 = edgeFit(true);
  const aN = edgeFit(false);
  const m = nLeft + n + nRight;
  extGrow(m);
  let p = 0;
  for (let k = nLeft; k >= 1; k--) {
    extT[p] = 2 * t0 - times[k];
    extY[p] = 2 * a0 - values[k];
    p++;
  }
  const base = p;
  for (let i = 0; i < n; i++) {
    extT[p] = times[i];
    extY[p] = values[i];
    p++;
  }
  for (let k = 0; k < nRight; k++) {
    const i = n - 2 - k;
    extT[p] = 2 * tN - times[i];
    extY[p] = 2 * aN - values[i];
    p++;
  }
  let lo = 0;
  let hi = 0;
  let sum = 0;
  let cnt = 0;
  for (let i = 0; i < m; i++) {
    const t = extT[i];
    while (hi < m && extT[hi] <= t + TREND_HALF) { sum += extY[hi]; cnt++; hi++; }
    while (extT[lo] < t - TREND_HALF) { sum -= extY[lo]; cnt--; lo++; }
    if (i >= base && i < base + n) apply(at[i - base], values[i - base] - sum / cnt + overall);
  }
}

export function detrendDays(days) {
  if (!days) return {};
  const dates = Object.keys(days);
  const nDates = dates.length;
  if (!nDates) return days;
  const out = {};
  const numeric = Object.create(null);
  const times = new Int32Array(nDates);
  for (let i = 0; i < nDates; i++) {
    const bucket = days[dates[i]];
    const copy = {};
    for (const k in bucket) {
      copy[k] = bucket[k];
      if (finite(bucket[k]) != null) numeric[k] = 1;
    }
    out[dates[i]] = copy;
    times[i] = dayNumber(dates[i]);
  }
  const ids = Object.keys(numeric);
  for (let k = 0; k < ids.length; k++) {
    const id = ids[k];
    let n = 0;
    for (let i = 0; i < nDates; i++) {
      const y = finite(days[dates[i]][id]);
      if (y == null) continue;
      if (n >= trendT.length) detrendGrow(n + 1);
      trendT[n] = times[i];
      trendY[n] = y;
      trendAt[n] = i;
      n++;
    }
    if (n < 2) continue;
    trendOrder.length = n;
    for (let i = 0; i < n; i++) trendOrder[i] = i;
    trendOrder.sort((a, b) => trendT[a] - trendT[b]);
    const sortedT = new Float64Array(n);
    const sortedY = new Float64Array(n);
    const sortedAt = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const oi = trendOrder[i];
      sortedT[i] = trendT[oi];
      sortedY[i] = trendY[oi];
      sortedAt[i] = trendAt[oi];
    }
    detrendSeries(sortedT, sortedY, sortedAt, n, (idx, y) => { out[dates[idx]][id] = y; });
  }
  return out;
}

function dayIndex(days) {
  const idx = Object.create(null);
  const dates = Object.keys(days);
  for (let i = 0; i < dates.length; i++) idx[dates[i]] = dayNumber(dates[i]);
  return idx;
}

function tertileTail(source) {
  if (source === "sleepHours") return " than on your shorter nights";
  if (source === "deepHours") return " than on nights with less deep sleep";
  if (source === "steps") return " than on your lower-step days";
  if (source === "workoutVolume") return " than on your lighter workouts";
  return " than on your lower days";
}

function buildFactors(days, phrases) {
  const factors = [];
  const dates = Object.keys(days);
  const boolIds = {};
  dates.forEach((date) => {
    const bucket = days[date];
    Object.keys(bucket).forEach((k) => {
      if (bucket[k] === true || bucket[k] === false) boolIds[k] = true;
    });
  });

  Object.keys(boolIds).forEach((id) => {
    const values = {};
    let yes = 0;
    let no = 0;
    dates.forEach((date) => {
      const v = days[date][id];
      if (v === true) { values[date] = true; yes++; }
      else if (v === false) { values[date] = false; no++; }
    });
    if (!yes || !no) return;
    const phrase = phrases[id] || BOOLEAN_PHRASE[id] || null;
    if (!phrase) return;
    const source = Object.prototype.hasOwnProperty.call(BOOLEAN_SOURCE, id) ? BOOLEAN_SOURCE[id] : id;
    factors.push({ id, source, kind: "boolean", phrase, values });
  });

  numericSeries(days).forEach((id) => {
    const samples = [];
    dates.forEach((date) => {
      const n = finite(days[date][id]);
      if (n != null) samples.push({ date, n });
    });
    if (samples.length < 4) return;
    const sorted = samples.map((s) => s.n).sort((a, b) => a - b);
    if (sorted[0] === sorted[sorted.length - 1]) return;
    const meta = metricMeta(id);
    const label = meta.label;
    const verb = meta.plural ? "are" : "is";
    const said = factorPhrase(id, label, verb);

    const med = quantile(sorted, 0.5);
    const medianValues = {};
    let above = 0;
    let below = 0;
    samples.forEach((s) => {
      const flag = s.n > med;
      medianValues[s.date] = flag;
      if (flag) above++;
      else below++;
    });
    if (above && below) {
      factors.push({
        id: id + ":median",
        source: id,
        kind: "median",
        phrase: said.median,
        values: medianValues,
      });
    }

    const lowCut = quantile(sorted, 1 / 3);
    const highCut = quantile(sorted, 2 / 3);
    if (highCut > lowCut) {
      const tertileValues = {};
      let top = 0;
      let bottom = 0;
      samples.forEach((s) => {
        if (s.n >= highCut) { tertileValues[s.date] = true; top++; }
        else if (s.n <= lowCut) { tertileValues[s.date] = false; bottom++; }
      });
      if (top && bottom) {
        factors.push({
          id: id + ":tertile",
          source: id,
          kind: "tertile",
          phrase: said.tertile,
          values: tertileValues,
        });
      }
    }
  });

  return factors;
}

function outcomeMap(days, id) {
  const map = {};
  Object.keys(days).forEach((date) => {
    const n = finite(days[date][id]);
    if (n != null) map[date] = n;
  });
  return map;
}

function align(values, outcomes, lag, idx) {
  const withVals = [];
  const withoutVals = [];
  const withDays = [];
  const withoutDays = [];
  const dates = Object.keys(values);
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const flag = values[date];
    if (flag !== true && flag !== false) continue;
    const when = lag ? addDays(date, lag) : date;
    const y = outcomes[when];
    if (y == null) continue;
    if (!idx) {
      if (flag) withVals.push(y);
      else withoutVals.push(y);
      continue;
    }
    const known = idx[when];
    const t = known == null ? dayNumber(when) : known;
    if (flag) { withVals.push(y); withDays.push(t); }
    else { withoutVals.push(y); withoutDays.push(t); }
  }
  return { withVals, withoutVals, withDays, withoutDays };
}

/* q is the Benjamini-Hochberg q-value, n1 and n2 are effective days, and d is
   Cohen's d. High means the finding would survive a 1% false-discovery rate,
   with at least two weeks of effective days and a medium-or-larger gap.
   Medium is the 5% rate with a gap that is still large enough to matter.
   A raw p under 0.05 on its own is not enough. */
const HIGH_Q = 0.01;
const MEDIUM_Q = 0.05;
const HIGH_EFFECT = 0.5;
const MEDIUM_EFFECT = 0.35;
const HIGH_N_EFF = 14;

export function confidenceOf(q, n1, n2, d) {
  const n = Math.min(n1, n2);
  if (!(n >= MIN_PER_GROUP) || !Number.isFinite(q)) return null;
  const ad = Number.isFinite(d) ? Math.abs(d) : 0;
  if (q <= HIGH_Q && n >= HIGH_N_EFF && ad >= HIGH_EFFECT) return "high";
  if (q <= MEDIUM_Q && ad >= MEDIUM_EFFECT) return "medium";
  return "low";
}

function formatPercent(p) {
  const a = Math.abs(p);
  if (a >= 9.95) return String(Math.round(a));
  const t = Math.round(a * 10) / 10;
  if (Math.abs(t - Math.round(t)) < 1e-9) return String(Math.round(t));
  return t.toFixed(1);
}

function formatAbs(v) {
  const a = Math.abs(v);
  const places = a >= 1 ? 10 : 100;
  const t = Math.round(a * places) / places;
  if (Math.abs(t - Math.round(t)) < 1e-9) return String(Math.round(t));
  return places === 10 ? t.toFixed(1) : String(t);
}

function changeWords(result) {
  const useAbs = !!metricMeta(result.outcome).absolute || result.percent == null || Math.abs(result.meanWithout) < 1;
  if (useAbs) {
    const shown = formatAbs(result.diff);
    if (shown === "0") return "about the same";
    const unit = result.outcome === "liftPerf" ? " points" : "";
    return shown + unit + (result.diff > 0 ? " higher" : " lower");
  }
  const shown = formatPercent(result.percent);
  if (shown === "0") return "about the same";
  return shown + "% " + (result.percent > 0 ? "higher" : "lower");
}

export function sentenceFor(result) {
  const meta = metricMeta(result.outcome);
  const verb = meta.plural ? "are" : "is";
  const change = changeWords(result);
  const when = result.lag > 0 ? "On days after " : "On days ";
  const tail = result.kind === "tertile" && change !== "about the same" ? tertileTail(result.source) : "";
  const n = result.nWith;
  const body = when + result.phrase + ", your " + meta.label + " " + verb + " " + change + tail;
  return {
    lead: body + ".",
    sentence: body + " (" + result.confidence + " confidence, " + n + " days).",
  };
}

function yesterdayClause(phrase) {
  const known = {
    "you work out": "You worked out yesterday",
    "you do cardio": "You did cardio yesterday",
    "you eat late": "You ate late yesterday",
    "your protein is over target": "Your protein was over target yesterday",
    "your calories are over target": "Your calories were over target yesterday",
    "your carbs are over target": "Your carbs were over target yesterday",
    "your fat is over target": "Your fat was over target yesterday",
    "you sleep more than usual": "You slept more than usual yesterday",
    "you get a long night of sleep": "You got a long night of sleep yesterday",
    "your deep sleep is longer than usual": "Your deep sleep was longer than usual yesterday",
    "you get a lot of deep sleep": "You got a lot of deep sleep yesterday",
    "you get more steps than usual": "You got more steps than usual yesterday",
    "you get a lot of steps": "You got a lot of steps yesterday",
    "your workout is heavier than usual": "Your workout was heavier than usual yesterday",
    "you have a heavy workout": "You had a heavy workout yesterday",
    "you eat more than usual": "You ate more than usual yesterday",
  };
  if (known[phrase]) return known[phrase];
  const workout = /^you do a (.+) workout$/.exec(phrase || "");
  if (workout) return "You did a " + workout[1] + " workout yesterday";
  if (phrase && phrase.indexOf("your ") === 0) {
    const body = phrase.charAt(0).toUpperCase() + phrase.slice(1);
    return body.replace(" is ", " was ").replace(" are ", " were ") + " yesterday";
  }
  return null;
}

/* One line for the morning brief. A pattern set off by yesterday is worded
   as what happened, then what tends to follow. */
export function todayLine(result) {
  if (!result) return "";
  const change = changeWords(result);
  if (result.because === "yesterday" && change !== "about the same") {
    const clause = yesterdayClause(result.phrase);
    if (clause) return clause + "; on days like this your " + metricMeta(result.outcome).label + " tends to be " + change + ".";
  }
  return result.lead || result.sentence || "";
}

/* A series that does not move (sd under a billionth of its level) makes a
   tiny leftover difference look certain. Skip it. A difference that still
   rounds to "about the same" is kept, but only at low confidence. */
function flatOutcome(map) {
  let n = 0;
  let sum = 0;
  let sum2 = 0;
  for (const date in map) {
    const y = map[date];
    n++;
    sum += y;
    sum2 += y * y;
  }
  if (n < 2) return true;
  const mean = sum / n;
  const sd = Math.sqrt(Math.max(0, (sum2 - (sum * sum) / n) / (n - 1)));
  return !(sd > 1e-9 * Math.abs(mean));
}

function evaluate(days, phrases, options, ouraExtra) {
  const minN = options.minPerGroup == null ? MIN_PER_GROUP : options.minPerGroup;
  const lags = options.lags || [0, 1];
  const weightDir = options.weightDir || null;
  const adjusted = detrendDays(days);
  const idx = dayIndex(adjusted);
  const factors = buildFactors(adjusted, phrases || {});
  const outcomes = numericSeries(adjusted).filter((id) => outcomeAllowed(id, weightDir) && (!options.outcomes || options.outcomes.indexOf(id) !== -1));
  const pending = [];

  outcomes.forEach((outcome) => {
    const ys = outcomeMap(adjusted, outcome);
    if (flatOutcome(ys)) return;
    const rho = seriesRho(ys, idx);
    factors.forEach((factor) => {
      if (locked(factor.id, factor.source, outcome)) return;
      lags.forEach((lag) => {
        if (suppressedStory(factor, outcome, lag, ouraExtra)) return;
        const groups = align(factor.values, ys, lag, rho > 0 ? idx : null);
        if (groups.withVals.length < minN || groups.withoutVals.length < minN) return;
        const n1 = groups.withVals.length;
        const n2 = groups.withoutVals.length;
        let stats;
        let n1eff = n1;
        let n2eff = n2;
        if (rho > 0) {
          const eff = effectiveN(groups.withDays, groups.withoutDays, rho);
          n1eff = eff.n1;
          n2eff = eff.n2;
          stats = welchEffective(groups.withVals, groups.withoutVals, n1eff, n2eff);
        } else stats = welch(groups.withVals, groups.withoutVals);
        const percent = Math.abs(stats.meanWithout) < 1e-9 ? null : (stats.diff / Math.abs(stats.meanWithout)) * 100;
        pending.push({
          factor: factor.id,
          source: factor.source,
          kind: factor.kind,
          phrase: factor.phrase,
          outcome,
          outcomeLabel: metricMeta(outcome).label,
          direction: preferredDirection(outcome, weightDir),
          lag,
          meanWith: stats.meanWith,
          meanWithout: stats.meanWithout,
          diff: stats.diff,
          percent,
          nWith: groups.withVals.length,
          nWithout: groups.withoutVals.length,
          n: n1,
          nEff: Math.min(n1eff, n2eff),
          n1eff,
          n2eff,
          p: stats.p,
          effect: stats.d,
          valence: valenceOf(outcome, stats.diff, percent, weightDir),
        });
      });
    });
  });

  const qs = benjaminiHochberg(pending.map((row) => row.p));
  const results = [];
  pending.forEach((row, i) => {
    row.q = qs[i];
    /* Effective days can fall under 7 when the series barely moves from one
       day to the next. That is not enough to be confident, but it is still a
       computed comparison, so it stays low instead of disappearing. */
    let confidence = row.nEff >= MIN_PER_GROUP
      ? confidenceOf(row.q, row.n1eff, row.n2eff, row.effect)
      : "low";
    if (!confidence) return;
    if (confidence !== "low" && changeWords(row) === "about the same") confidence = "low";
    row.confidence = confidence;
    row.strength = Math.abs(row.effect) * CONFIDENCE_WEIGHT[confidence];
    const said = sentenceFor(row);
    row.lead = said.lead;
    row.sentence = said.sentence;
    delete row.n1eff;
    delete row.n2eff;
    results.push(row);
  });
  return results;
}

/* Median and tertile of the same number tell one story. Keep the stronger. */
function dedupe(results) {
  const best = new Map();
  const out = [];
  results.forEach((r) => {
    if (r.kind === "boolean") { out.push(r); return; }
    const key = r.source + "|" + r.outcome + "|" + r.lag;
    const prev = best.get(key);
    if (!prev || r.strength > prev.strength || (r.strength === prev.strength && r.kind === "median")) best.set(key, r);
  });
  best.forEach((r) => out.push(r));
  return out;
}

function mirrorMetric(row) {
  const id = String(row.factor || "");
  if (id.indexOf("workout:") === 0) return id;
  if (row.source) return row.source;
  return id.replace(/:(median|tertile)$/, "");
}

/* A to B and B to A are one relationship. Keep the stronger row. */
function mergeMirrors(rows) {
  const groups = new Map();
  rows.forEach((r) => {
    const a = mirrorMetric(r);
    const b = r.outcome;
    const key = a < b ? a + "\0" + b : b + "\0" + a;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  });
  const out = [];
  groups.forEach((list) => {
    const dirs = new Set(list.map((r) => mirrorMetric(r) + ">" + r.outcome));
    if (dirs.size < 2) {
      list.forEach((r) => out.push(r));
      return;
    }
    list.sort((a, b) => b.strength - a.strength || Math.abs(b.percent || 0) - Math.abs(a.percent || 0) || (b.nWith + b.nWithout) - (a.nWith + a.nWithout));
    out.push(list[0]);
  });
  return out;
}

function byStrength(a, b) {
  return b.strength - a.strength || Math.abs(b.percent || 0) - Math.abs(a.percent || 0) || (b.nWith + b.nWithout) - (a.nWith + a.nWithout);
}

function rank(results) {
  return mergeMirrors(dedupe(results)).sort(byStrength);
}

function isPrebuilt(input) {
  if (!input || typeof input !== "object" || !input.days || Array.isArray(input.days)) return false;
  if (input.sessions || input.oura || input.food || input.foodDays || input.weighIns || input.profile || input.cardio) return false;
  return true;
}

function viewGroup(row) {
  return row && (row.valence === "good" || row.valence === "bad") ? 0 : 1;
}

const SLEEP_FAMILY = new Set(["sleepHours", "sleepScore", "deepHours", "remHours", "lightHours", "awakeMin"]);
const TRAINING_FAMILY = new Set(["workedOut", "workoutVolume", "liftPerf", "didCardio", "cardioMin", "cardioKcal"]);
const FOOD_FAMILY = new Set(["calories", "protein", "carbs", "fat", "lateEating", "caloriesOverTarget", "proteinOverTarget", "carbsOverTarget", "fatOverTarget"]);

export const OUTCOME_CAP = 2;
export const FAMILY_CAP = 3;

export function factorFamily(row) {
  const id = String(row && row.factor || "");
  if (id.indexOf("workout:") === 0) return "training";
  const metric = (row && row.source) || id.replace(/:(median|tertile)$/, "");
  if (SLEEP_FAMILY.has(metric)) return "sleep";
  if (metric.indexOf("workout:") === 0 || TRAINING_FAMILY.has(metric)) return "training";
  if (FOOD_FAMILY.has(metric)) return "food";
  return metric || "other";
}

/* The Insights list hides low confidence, then puts a good or bad pattern
   ahead of a neutral one. Strength still orders each group. */
export function findingsForView(rows) {
  return (rows || []).filter((r) => r && (r.confidence === "high" || r.confidence === "medium")).slice().sort((a, b) => viewGroup(a) - viewGroup(b) || byStrength(a, b));
}

/* The first screen keeps the ranked order, but will not stack one outcome
   or one kind of factor. Everything else stays available for See all. */
export function listFindings(rows) {
  const ranked = findingsForView(rows);
  const picked = [];
  const rest = [];
  const outcomes = {};
  const families = {};
  ranked.forEach((r) => {
    const outcome = r.outcome;
    const family = factorFamily(r);
    if (picked.length < DISPLAY_LIMIT && (outcomes[outcome] || 0) < OUTCOME_CAP && (families[family] || 0) < FAMILY_CAP) {
      picked.push(r);
      outcomes[outcome] = (outcomes[outcome] || 0) + 1;
      families[family] = (families[family] || 0) + 1;
    } else rest.push(r);
  });
  return picked.concat(rest);
}

/* One numeric series, same line-reflected adjustment evaluate() uses for cuts.
   Cached on the extracted day object so a week check does not repeat it. */
function adjustedSeries(days, id) {
  if (!days.__trend) Object.defineProperty(days, "__trend", { value: Object.create(null) });
  const box = days.__trend;
  if (box[id]) return box[id];
  const dates = Object.keys(days);
  const map = Object.create(null);
  const pts = [];
  for (let i = 0; i < dates.length; i++) {
    const y = finite(days[dates[i]] && days[dates[i]][id]);
    if (y != null) pts.push({ t: dayNumber(dates[i]), y, d: dates[i] });
  }
  const n = pts.length;
  if (n < 2) {
    for (let i = 0; i < n; i++) map[pts[i].d] = pts[i].y;
    box[id] = map;
    return map;
  }
  pts.sort((a, b) => a.t - b.t);
  const times = new Float64Array(n);
  const values = new Float64Array(n);
  const at = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    times[i] = pts[i].t;
    values[i] = pts[i].y;
    at[i] = i;
  }
  detrendSeries(times, values, at, n, (idx, y) => { map[pts[idx].d] = y; });
  box[id] = map;
  return map;
}

function factorActive(days, row, date) {
  const bucket = days[date];
  if (!bucket || !row) return false;
  if (row.kind === "boolean") return bucket[row.factor] === true;
  const series = adjustedSeries(days, row.source);
  const n = series[date];
  if (n == null) return false;
  const sorted = [];
  const dates = Object.keys(series);
  for (let i = 0; i < dates.length; i++) sorted.push(series[dates[i]]);
  sorted.sort((a, b) => a - b);
  if (sorted.length < 4 || sorted[0] === sorted[sorted.length - 1]) return false;
  if (row.kind === "median") return n > quantile(sorted, 0.5);
  if (row.kind === "tertile") {
    const highCut = quantile(sorted, 2 / 3);
    const lowCut = quantile(sorted, 1 / 3);
    return highCut > lowCut && n >= highCut;
  }
  return false;
}

/* The morning brief shows only a high-confidence finding whose q-value is
   at most 0.001. Medium stays on Insights, and a high card with a larger q
   stays there too: those were false claims on Home. Yesterday's trigger on
   a next-day pattern comes first. Otherwise the top good or bad finding. */
export function pickForToday(rows, input, today) {
  const days = isPrebuilt(input) ? input.days : extractDays(input || {}).days;
  const ranked = findingsForView(rows).filter((r) => r.confidence === "high" && r.q <= 0.001 && (r.valence === "good" || r.valence === "bad"));
  if (!today || !ranked.length) return ranked[0] ? { ...ranked[0], because: "overall" } : null;
  const yesterday = addDays(today, -1);
  const triggered = ranked.find((r) => r.lag === 1 && factorActive(days, r, yesterday));
  if (triggered) return { ...triggered, because: "yesterday" };
  return { ...ranked[0], because: "overall" };
}

/* Good or bad findings whose factor actually happened between start and end.
   Same ranking, labels, and temporal rules as the Insights list. */
export function findingsForWeek(rows, input, start, end, limit) {
  const days = isPrebuilt(input) ? input.days : extractDays(input || {}).days;
  const cap = limit == null ? 3 : limit;
  const ranked = findingsForView(rows).filter((r) => r.valence === "good" || r.valence === "bad");
  const hit = [];
  const outcomes = {};
  if (!start || !end) return hit;
  ranked.forEach((r) => {
    if (hit.length >= cap) return;
    if ((outcomes[r.outcome] || 0) >= OUTCOME_CAP) return;
    for (let d = start; d <= end; d = addDays(d, 1)) {
      if (factorActive(days, r, d)) {
        hit.push(r);
        outcomes[r.outcome] = (outcomes[r.outcome] || 0) + 1;
        break;
      }
    }
  });
  return hit;
}

export function loggedDays(input) {
  const days = isPrebuilt(input) ? input.days : extractDays(input || {}).days;
  return Object.keys(days || {}).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).length;
}

/* input is either { days, phrases } or a user_data-shaped blob.
   options.lags defaults to same day and next day. options.minPerGroup defaults to 7.
   options.weightDir is "gain", "lose", or empty, and only affects weight. */
export function correlate(input, options) {
  const opts = options || {};
  if (isPrebuilt(input)) return rank(evaluate(input.days, input.phrases || {}, opts, null));
  const extracted = extractDays(input || {});
  return rank(evaluate(extracted.days, extracted.phrases, opts, extracted.ouraKeys));
}

export const TRACKED_METRICS = Object.keys(METRICS);
