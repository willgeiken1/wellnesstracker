import { app } from "../runtime.js";

/* Storage, exercise catalog, and shared session helpers. */
/* ================= Data ================= */
const KEY = "liftlog-v1";
app.KEY = KEY;

const MUSCLES = {
  chest: "Chest", frontDelts: "Front delts", sideDelts: "Side delts", rearDelts: "Rear delts",
  traps: "Traps", upperBack: "Upper back", lats: "Lats", lowerBack: "Lower back",
  biceps: "Biceps", triceps: "Triceps", forearms: "Forearms", abs: "Abs", obliques: "Obliques",
  glutes: "Glutes", quads: "Quads", hamstrings: "Hamstrings", adductors: "Adductors",
  abductors: "Abductors", calves: "Calves"
};
app.MUSCLES = MUSCLES;

const ex = (name, ...muscles) => ({ name, muscles });
app.ex = ex;

const DEFAULT_WORKOUTS = [
  { id: "push", name: "Push", exercises: [
    app.ex("Pec Fly Machine", "chest"),
    app.ex("Smith Machine Incline Bench Press", "chest", "frontDelts", "triceps"),
    app.ex("Chest Press Machine", "chest", "frontDelts", "triceps"),
    app.ex("Cable Lateral Raise", "sideDelts"),
    app.ex("Shoulder Press Machine", "frontDelts", "sideDelts", "triceps"),
    app.ex("Rear Deltoid Fly Machine", "rearDelts", "upperBack"),
    app.ex("Cable Tricep Pulldown", "triceps"),
    app.ex("Dips", "chest", "triceps", "frontDelts") ] },
  { id: "pull", name: "Pull", exercises: [
    app.ex("Pull Ups", "lats", "upperBack", "biceps"),
    app.ex("Lat Pulldown Machine", "lats", "biceps"),
    app.ex("Seated Row Machine", "upperBack", "lats", "rearDelts", "biceps"),
    app.ex("Plate Loaded Low Row", "upperBack", "lats", "biceps"),
    app.ex("Cable Lat Pullover", "lats"),
    app.ex("Preacher Curl Machine", "biceps"),
    app.ex("Bicep Curl Machine", "biceps"),
    app.ex("Rope Hammer Curl", "biceps", "forearms") ] },
  { id: "legs", name: "Legs", exercises: [
    app.ex("Seated Leg Press Machine", "quads", "glutes"),
    app.ex("Barbell Romanian Deadlift (RDL)", "hamstrings", "glutes", "lowerBack"),
    app.ex("Seated Leg Curl Machine", "hamstrings"),
    app.ex("Seated Leg Extension Machine", "quads"),
    app.ex("Abductor Machine", "abductors"),
    app.ex("Adductor Machine", "adductors"),
    app.ex("Calf Raises", "calves") ] }
];
app.DEFAULT_WORKOUTS = DEFAULT_WORKOUTS;

const $ = (s) => document.querySelector(s);
app.$ = $;

const copy = (o) => JSON.parse(JSON.stringify(o));
app.copy = copy;

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
app.esc = esc;

const iso = (d) => d.toLocaleDateString("en-CA");
app.iso = iso;

const today = () => app.iso(new Date());
app.today = today;

const parseDay = (s) => new Date(s + "T12:00:00");
app.parseDay = parseDay;

const addDays = (s, n) => { const d = app.parseDay(s); d.setDate(d.getDate() + n); return app.iso(d); };
app.addDays = addDays;

const mondayOf = (s) => { const d = app.parseDay(s); const w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return app.iso(d); };
app.mondayOf = mondayOf;

const fmtNum = (n) => (Math.round(n * 100) / 100).toString();
app.fmtNum = fmtNum;

const fmtSide = (x) => `${x.w == null ? "BW" : app.fmtNum(x.w)} × ${x.r}`;
app.fmtSide = fmtSide;

const fmtSet = (s) => s.uni ? `L ${app.fmtSide(s.uni.l)} · R ${app.fmtSide(s.uni.r)}` : app.fmtSide(s);
app.fmtSet = fmtSet;

const BW_RE = /\b(pull[- ]?ups?|chin[- ]?ups?|chest to bar|dips?|push[- ]?ups?|muscle[- ]?ups?|inverted rows?|ring rows?|bodyweight|body weight|air squats?|pistol|nordic|planks?|sit[- ]?ups?|crunch(es)?|leg raises?|knee raises?|hanging|l-sit|dragon flag|hollow|dead bug|mountain climbers?|burpees?|lunges?|step[- ]?ups?|glute bridges?|back extensions?|superman|handstand|wall walk|bar hang|windshield wipers?|jumps?|bounds?|copenhagen|scap pull)\b/i;
app.BW_RE = BW_RE;

const LOADED_RE = /\b(barbell|dumbbell|smith|machine|cable|kettlebell|ez|trap bar|landmine|plate|band(ed)?|weighted|sled|medicine ball)\b/i;
app.LOADED_RE = LOADED_RE;

// "BW" (bodyweight) only makes sense for movements you can do without a load.
function canBW(name) {
  if (app.state.sessions.some((s) => s.entries.some((e) => e.exercise === name && e.sets.some((x) => x.w == null)))) return true;
  return app.BW_RE.test(name) && !app.LOADED_RE.test(name);
}
app.canBW = canBW;

const isUni = (name) => !!(app.state.uniEx && app.state.uniEx[name]);
app.isUni = isUni;

// A unilateral set is represented by its weaker side, so PRs and progression need both sides to improve.
function uniSet(l, r) {
  const e1 = (x) => (x.w == null ? 0 : x.w) * (1 + x.r / 30) + (x.w == null ? x.r : 0);
  const weak = e1(l) <= e1(r) ? l : r;
  return { w: weak.w, r: weak.r, uni: { l: { w: l.w, r: l.r }, r: { w: r.w, r: r.r } } };
}
app.uniSet = uniSet;

const setVolume = (x) => x.uni ? [x.uni.l, x.uni.r].reduce((a, y) => a + (y.w != null ? y.w * y.r : 0), 0) : (x.w != null ? x.w * x.r : 0);
app.setVolume = setVolume;

const fmtTime = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
app.fmtTime = fmtTime;

const fmtDate = (s, o) => app.parseDay(s).toLocaleDateString(undefined, o || { weekday: "short", month: "short", day: "numeric" });
app.fmtDate = fmtDate;

const fmtDur = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };
app.fmtDur = fmtDur;

const uid = () => "s_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
app.uid = uid;

const pl = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
app.pl = pl;

const setCount = (s) => s.entries.reduce((n, e) => n + e.sets.length, 0);
app.setCount = setCount;

function lookupMuscles(name, workouts) {
  const n = String(name).toLowerCase();
  for (const w of [...(workouts || []), ...app.DEFAULT_WORKOUTS]) {
    const e = (w.exercises || []).find((x) => x.name && x.name.toLowerCase() === n);
    if (e) return [...e.muscles];
  }
  return [];
}
app.lookupMuscles = lookupMuscles;

/* Accepts the original v1 format and the current one */
function migrate(d) {
  if (!d || !Array.isArray(d.sessions)) return null;
  let workouts;
  if (Array.isArray(d.workouts)) workouts = d.workouts;
  else if (d.templates) workouts = Object.keys(d.templates).map((k) => ({
    id: k.toLowerCase(), name: k,
    exercises: d.templates[k].map((n) => typeof n === "string" ? { name: n, muscles: app.lookupMuscles(n) } : n)
  }));
  else workouts = app.copy(app.DEFAULT_WORKOUTS);
  const v2 = d.version === 2;
  const sessions = d.sessions.map((s) => {
    const entries = (s.entries || []).map((e) => ({ exercise: e.exercise, muscles: e.muscles || app.lookupMuscles(e.exercise, workouts), sets: e.sets || [] }));
    const lastAt = entries.flatMap((e) => e.sets.map((x) => x.at)).filter(Boolean).sort().pop();
    return {
      ...(v2 ? s : {}),
      id: v2 ? s.id : app.uid() + Math.random().toString(36).slice(2, 4),
      date: s.date,
      workoutId: s.workoutId || String(s.day || "").toLowerCase(),
      name: s.name || s.day || "Workout",
      startedAt: s.startedAt || entries.flatMap((e) => e.sets.map((x) => x.at)).filter(Boolean).sort()[0] || null,
      finishedAt: v2 ? (s.finishedAt || null) : (lastAt || s.date + "T12:00:00"),
      entries
    };
  });
  return { version: 2, workouts, sessions, plan: d.plan || {}, restSeconds: d.restSeconds || 120, lastExport: d.lastExport || null,
    oura: d.oura || { connected: false, lastSync: null, days: {} }, demo: !!d.demo,
    deleted: d.deleted || [], updatedAt: d.updatedAt || 0, lastCloud: d.lastCloud || null,
    profile: d.profile || null, ownerId: d.ownerId || null,
    theme: d.theme || { mode: "dark", accent: "citrus" },
    goals: d.goals || { sessionsPerWeek: null, lifts: {}, weightDir: null, updatedAt: 0 },
    food: d.food || { days: {}, saved: [], targets: { auto: true }, deleted: [], updatedAt: 0 },
    muscleMode: d.muscleMode === "advanced" ? "advanced" : "basic", settingsAt: d.settingsAt || 0, layout: d.layout || {}, uniEx: d.uniEx || {}, machineNotes: d.machineNotes || {}, measurements: d.measurements || {},
    cardio: d.cardio || { sessions: [], saved: [], goalMin: 150, deleted: [], live: null, updatedAt: 0 } };
}
app.migrate = migrate;

function load() {
  try {
    const raw = localStorage.getItem(app.KEY);
    if (raw) { const m = app.migrate(JSON.parse(raw)); if (m) return m; }
  } catch (e) { /* start fresh */ }
  return { version: 2, workouts: app.copy(app.DEFAULT_WORKOUTS), sessions: [], plan: {}, restSeconds: 120, lastExport: null,
    oura: { connected: false, lastSync: null, days: {} }, demo: false };
}
app.load = load;

function save() {
  app.state.updatedAt = Date.now();
  try { app.schedulePush(); } catch (e) { /* cloud not ready yet */ }
  try { localStorage.setItem(app.KEY, JSON.stringify(app.state)); }
  catch (e) { app.toast("Couldn't save on this phone. Export a backup from Settings now."); }
}
app.save = save;

let state = app.load();
app.state = state;

// A workout left open from a previous day gets closed automatically
app.state.sessions.forEach((s) => { if (!s.finishedAt && s.date < app.today()) s.finishedAt = s.date + "T23:59:00"; });

app.save();

const ui = { edit: null, cardioOpen: false, fseg: "day", qMeal: null, rq: "", fcMonth: null, iseg: "trends", prevTab: "home", foodDay: null, onboard: false, pf: {}, tab: "home", wseg: "routines", range: 14, detail: null, weekOffset: 0, open: null, drafts: {}, sheet: null, sd: {}, workoutOpen: false };
app.ui = ui;

const workoutById = (id) => app.state.workouts.find((w) => w.id === id);
app.workoutById = workoutById;

const activeSession = () => app.state.sessions.find((s) => !s.finishedAt);
app.activeSession = activeSession;

const finished = () => app.state.sessions.filter((s) => s.finishedAt)
  .sort((a, b) => (a.date === b.date ? String(b.startedAt).localeCompare(String(a.startedAt)) : a.date < b.date ? 1 : -1));
app.finished = finished;

const sessionsOn = (d) => app.state.sessions.filter((s) => s.date === d && app.setCount(s) > 0);
app.sessionsOn = sessionsOn;

function musclesBetween(from, to) {
  const m = new Map();
  app.state.sessions.forEach((s) => {
    if (s.date < from || s.date > to) return;
    s.entries.forEach((e) => { const n = e.sets.filter((x) => x.tag !== "warmup").length; if (n) e.muscles.forEach((k) => m.set(k, (m.get(k) || 0) + n)); });
  });
  return m;
}
app.musclesBetween = musclesBetween;

/* Exercises shown in a live workout: the template, plus anything logged that isn't in it */
function liveExercises(s) {
  const w = app.workoutById(s.workoutId);
  const sw = s.swaps || {};
  const list = w ? w.exercises.map((e) => sw[e.name] ? { name: sw[e.name].name, muscles: sw[e.name].muscles, adv: sw[e.name].adv, original: e.name } : { name: e.name, muscles: e.muscles, adv: e.adv }) : [];
  (s.extra || []).forEach((x) => { if (!list.some((y) => y.name === x.name)) list.push({ ...x, extra: true }); });
  s.entries.forEach((e) => { if (!list.some((x) => x.name === e.exercise)) list.push({ name: e.exercise, muscles: e.muscles, adv: e.adv }); });
  return list;
}
app.liveExercises = liveExercises;

function setsFor(s, name) { const e = s.entries.find((x) => x.exercise === name); return e ? e.sets : []; }
app.setsFor = setsFor;

function lastSets(name, excludeId) {
  for (const s of app.finished()) {
    if (s.id === excludeId) continue;
    const e = s.entries.find((x) => x.exercise === name);
    if (e && e.sets.length) return e.sets;
  }
  return null;
}
app.lastSets = lastSets;

function draftFor(s, name) {
  if (app.ui.drafts[name]) return app.ui.drafts[name];
  const done = app.setsFor(s, name);
  let src = done.filter((x) => x.tag !== "warmup").pop();
  if (!src) {
    const sg = app.suggestion(name, s.id);
    if (sg) src = { w: sg.w, r: sg.r };
    else { const prev = (app.lastSets(name, s.id) || []).filter((x) => x.tag !== "warmup"); src = prev[0]; }
  }
  const fw = (v) => v != null ? app.fmtNum(v) : "";
  const L = src && src.uni ? src.uni.l : src, Rt = src && src.uni ? src.uni.r : src;
  app.ui.drafts[name] = { w: L ? fw(L.w) : "", r: L ? String(L.r) : "", wR: Rt ? fw(Rt.w) : "", rR: Rt ? String(Rt.r) : "", note: "", tag: null };
  return app.ui.drafts[name];
}
app.draftFor = draftFor;
