/* Correlation engine for daily wellness series.

   Pure functions: no network, no DOM, and no analytics. Health values stay in
   memory on the device. Insights still calls effect() for its fixed buckets;
   that helper now lives here next to the general engine. */

export const MIN_PER_GROUP = 7;
export const LATE_HOUR = 21;

const CONFIDENCE_WEIGHT = { low: 1, medium: 2, high: 3 };

/* Metrics the logger already stores. Extra numeric fields on a day are picked
   up too. plural tunes "is" / "are" in the sentence. absolute means the
   sentence quotes the raw difference, because a percent of a near-zero
   baseline (temperature deviation, lift % vs recent) is misleading. */
const METRICS = {
  readiness: { label: "readiness" },
  sleepScore: { label: "sleep score" },
  sleepHours: { label: "sleep" },
  deepHours: { label: "deep sleep" },
  remHours: { label: "REM sleep" },
  lightHours: { label: "light sleep" },
  awakeMin: { label: "time awake" },
  steps: { label: "steps", plural: true },
  hrv: { label: "HRV" },
  rhr: { label: "resting heart rate" },
  temp: { label: "temperature deviation", absolute: true },
  workoutVolume: { label: "workout volume" },
  liftPerf: { label: "strength", absolute: true },
  calories: { label: "calories", plural: true },
  protein: { label: "protein" },
  carbs: { label: "carbs", plural: true },
  fat: { label: "fat" },
  weight: { label: "weight" },
  cardioMin: { label: "cardio" },
  cardioKcal: { label: "cardio calories", plural: true },
  waist: { label: "waist" },
  arms: { label: "arms", plural: true },
  chest: { label: "chest" },
};

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
  const active = [];

  const oura = ouraMap(src.oura);
  Object.keys(oura).forEach((date) => {
    const day = oura[date];
    if (!day || typeof day !== "object") return;
    active.push(date);
    const bucket = dayBucket(days, date);
    OURA_NAMED.forEach((k) => putNum(bucket, k, day[k]));
    Object.keys(OURA_STAGES).forEach((k) => {
      const n = finite(day[k]);
      if (n == null) return;
      bucket[OURA_STAGES[k]] = n / 3600;
    });
    const awake = finite(day.awake);
    if (awake != null) bucket.awakeMin = awake / 60;
    Object.keys(day).forEach((k) => {
      if (k === "date" || k === "awake" || OURA_STAGES[k] || OURA_NAMED.indexOf(k) !== -1) return;
      if (days[date][k] != null) return;
      putNum(bucket, k, day[k]);
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

  return { days, phrases };
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
        phrase: "your " + label + " " + verb + " above your usual",
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
          phrase: "your " + label + " " + verb + " in the top third",
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

function align(values, outcomes, lag) {
  const withVals = [];
  const withoutVals = [];
  Object.keys(values).forEach((date) => {
    const flag = values[date];
    if (flag !== true && flag !== false) return;
    const when = lag ? addDays(date, lag) : date;
    const y = outcomes[when];
    if (y == null) return;
    (flag ? withVals : withoutVals).push(y);
  });
  return { withVals, withoutVals };
}

export function confidenceOf(p, n1, n2) {
  const n = Math.min(n1, n2);
  if (n < MIN_PER_GROUP) return null;
  if (p < 0.05 && n >= 14) return "high";
  if (p < 0.05 || (p < 0.1 && n >= 10)) return "medium";
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
  if (a >= 9.95) {
    const t = Math.round(a * 10) / 10;
    return Math.abs(t - Math.round(t)) < 1e-9 ? String(Math.round(t)) : t.toFixed(1);
  }
  const t = Math.round(a * 100) / 100;
  return String(t);
}

export function sentenceFor(result) {
  const meta = metricMeta(result.outcome);
  const verb = meta.plural ? "are" : "is";
  const useAbs = !!meta.absolute || result.percent == null || Math.abs(result.meanWithout) < 1;
  let change;
  if (useAbs) {
    const shown = formatAbs(result.diff);
    change = shown === "0" ? "about the same" : shown + (result.diff > 0 ? " higher" : " lower");
  } else {
    const shown = formatPercent(result.percent);
    change = shown === "0" ? "about the same" : shown + "% " + (result.percent > 0 ? "higher" : "lower");
  }
  const when = result.lag > 0 ? "On days after " : "On days ";
  const tail = result.kind === "tertile" && change !== "about the same" ? " than on days in the bottom third" : "";
  const n = result.nWith;
  return when + result.phrase + ", your " + meta.label + " " + verb + " " + change + tail + " (" + result.confidence + " confidence, " + n + " days).";
}

function evaluate(days, phrases, options) {
  const minN = options.minPerGroup == null ? MIN_PER_GROUP : options.minPerGroup;
  const lags = options.lags || [0, 1];
  const factors = buildFactors(days, phrases || {});
  const outcomes = numericSeries(days).filter((id) => !options.outcomes || options.outcomes.indexOf(id) !== -1);
  const results = [];

  outcomes.forEach((outcome) => {
    const ys = outcomeMap(days, outcome);
    factors.forEach((factor) => {
      if (locked(factor.id, factor.source, outcome)) return;
      lags.forEach((lag) => {
        const groups = align(factor.values, ys, lag);
        if (groups.withVals.length < minN || groups.withoutVals.length < minN) return;
        const stats = welch(groups.withVals, groups.withoutVals);
        const confidence = confidenceOf(stats.p, groups.withVals.length, groups.withoutVals.length);
        if (!confidence) return;
        const percent = Math.abs(stats.meanWithout) < 1e-9 ? null : (stats.diff / Math.abs(stats.meanWithout)) * 100;
        const strength = Math.abs(stats.d) * CONFIDENCE_WEIGHT[confidence];
        const row = {
          factor: factor.id,
          source: factor.source,
          kind: factor.kind,
          phrase: factor.phrase,
          outcome,
          outcomeLabel: metricMeta(outcome).label,
          lag,
          meanWith: stats.meanWith,
          meanWithout: stats.meanWithout,
          diff: stats.diff,
          percent,
          nWith: groups.withVals.length,
          nWithout: groups.withoutVals.length,
          n: groups.withVals.length,
          p: stats.p,
          effect: stats.d,
          confidence,
          strength,
        };
        row.sentence = sentenceFor(row);
        results.push(row);
      });
    });
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

function rank(results) {
  return dedupe(results).sort((a, b) => b.strength - a.strength || Math.abs(b.percent || 0) - Math.abs(a.percent || 0) || (b.nWith + b.nWithout) - (a.nWith + a.nWithout));
}

function isPrebuilt(input) {
  if (!input || typeof input !== "object" || !input.days || Array.isArray(input.days)) return false;
  if (input.sessions || input.oura || input.food || input.foodDays || input.weighIns || input.profile || input.cardio) return false;
  return true;
}

/* input is either { days, phrases } or a user_data-shaped blob.
   options.lags defaults to same day and next day. options.minPerGroup defaults to 7. */
export function correlate(input, options) {
  const opts = options || {};
  if (isPrebuilt(input)) return rank(evaluate(input.days, input.phrases || {}, opts));
  const extracted = extractDays(input || {});
  return rank(evaluate(extracted.days, extracted.phrases, opts));
}

export const TRACKED_METRICS = Object.keys(METRICS);
