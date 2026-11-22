import {
  DEFAULT_BLOCK_STAMP,
  isLive,
  liveOf,
  normalizeDailyRoutines,
} from "./daily-routines-store.js";

/* Routines setup. Every account answers it once, the first time Routines
   opens. The answers live on dailyRoutines.prefs.setup, so they sync with the
   rest of the store and the account merge keeps them with prefs. Nothing here
   stores free text: every answer is a key from the lists below.

   The page reads the answers through routineSetupShows(). Hiding a part of
   the page never deletes a row. Without a finished setup every part shows, as
   before. Applying answers only adds blocks, renames or removes a default
   block nobody has touched yet, and never removes a row the user made. It
   adds no checks: nobody needs to tick off waking up or going to bed. */

export const SETUP_VERSION = 1;

const q = (id, title, choices, extra = {}) => Object.freeze({
  id,
  title,
  multi: extra.multi === true,
  hint: extra.hint || "",
  choices: Object.freeze(choices.map(([value, label]) => Object.freeze({ value, label }))),
});

export const SETUP_QUESTIONS = Object.freeze([
  q("goals", "What brings you to Routines?", [
    ["habits", "Build daily habits"],
    ["supplements", "Take supplements, vitamins or skin care"],
    ["enhancers", "Track enhancers or peptides"],
    ["meds", "Track medications"],
    ["recover", "Recover better"],
    ["looking", "Just looking"],
  ], { multi: true, hint: "Pick any." }),
  q("experience", "How much have you tracked before?", [
    ["new", "New to it"],
    ["some", "Some"],
    ["all", "I track everything"],
  ]),
  q("days", "What do your days look like?", [
    ["regular", "Regular days"],
    ["day", "Day shifts"],
    ["night", "Night shifts"],
    ["rotating", "Rotating shifts"],
  ]),
  q("wake", "When do you usually wake up?", [
    ["early", "Before 6 AM"],
    ["6-8", "6 to 8 AM"],
    ["8-10", "8 to 10 AM"],
    ["late", "After 10 AM"],
    ["afternoon", "Afternoon or evening"],
    ["varies", "It varies"],
  ]),
  q("sleep", "When do you usually go to sleep?", [
    ["early", "Before 10 PM"],
    ["10-12", "10 PM to midnight"],
    ["late", "After midnight"],
    ["morning", "In the morning, after a night shift"],
    ["varies", "It varies"],
  ]),
  q("train", "How many days a week do you train?", [
    ["none", "None"],
    ["1-2", "1 to 2"],
    ["3-4", "3 to 4"],
    ["5+", "5 or more"],
  ]),
  q("track", "What will you track here?", [
    ["supplements", "Supplements, vitamins or skin care"],
    ["meds", "Medications"],
    ["habits", "Habits and checks only"],
  ], { multi: true, hint: "Pick any." }),
  q("enhancers", "Do you take enhancers or peptides?", [
    ["yes", "Yes"],
    ["no", "No"],
  ]),
  q("inject", "Do you inject any of them?", [
    ["yes", "Yes"],
    ["no", "No"],
  ]),
  q("count", "How many things do you take a day?", [
    ["1-3", "1 to 3"],
    ["4-8", "4 to 8"],
    ["9+", "9 or more"],
  ]),
  q("supply", "Do you want to know when you're running low?", [
    ["yes", "Yes"],
    ["no", "No"],
  ]),
  q("timing", "When do you take them?", [
    ["waking", "On waking"],
    ["meals", "With meals"],
    ["bed", "Before bed"],
    ["workouts", "Around workouts"],
    ["spread", "Spread through the day"],
  ], { multi: true, hint: "Pick any." }),
  q("watch", "Which results do you want to watch?", [
    ["sleep", "Sleep"],
    ["hrv", "HRV"],
    ["weight", "Weight"],
    ["none", "None"],
  ], { multi: true, hint: "Pick any." }),
  q("home", "Do you want routines on your Home screen?", [
    ["next", "Next up only"],
    ["all", "All my blocks"],
    ["none", "No"],
  ]),
  q("feel", "How should the page feel?", [
    ["next", "Just what's next"],
    ["all", "Everything at once"],
  ]),
]);

const BY_ID = new Map(SETUP_QUESTIONS.map((question) => [question.id, question]));
/* Picking one of these clears the other picks, and the other way round. */
const EXCLUSIVE = Object.freeze({ goals: "looking", track: "habits", watch: "none" });

export function setupQuestion(id) {
  return BY_ID.get(id) || null;
}

function cleanAnswer(question, value) {
  const allowed = new Set(question.choices.map((choice) => choice.value));
  if (question.multi) {
    if (!Array.isArray(value)) return null;
    const picked = question.choices.map((choice) => choice.value).filter((key) => value.includes(key) && allowed.has(key));
    const only = EXCLUSIVE[question.id];
    if (only && picked.includes(only) && picked.length > 1) return [only];
    return picked.length ? picked : null;
  }
  return typeof value === "string" && allowed.has(value) ? value : null;
}

/* Unknown keys and values are dropped, so a synced copy from a newer build
   or a hand-edited backup cannot put anything else on the page. */
export function normalizeSetupAnswers(raw) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const question of SETUP_QUESTIONS) {
    const value = cleanAnswer(question, raw[question.id]);
    if (value !== null) out[question.id] = value;
  }
  return out;
}

export function readSetup(prefs) {
  const raw = prefs && typeof prefs === "object" ? prefs.setup : null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const status = raw.status === "done" || raw.status === "skipped" ? raw.status : null;
  if (!status) return null;
  return { status, answers: status === "done" ? normalizeSetupAnswers(raw.answers) : {} };
}

export function setupSettled(prefs) {
  return readSetup(prefs) !== null;
}

function has(answers, id, value) {
  const answer = answers[id];
  return Array.isArray(answer) ? answer.includes(value) : answer === value;
}

function justLooking(answers) {
  return has(answers, "goals", "looking");
}

export function takesEnhancers(answers) {
  return has(answers, "goals", "enhancers") || answers.enhancers === "yes";
}

function takesSupplements(answers) {
  return has(answers, "track", "supplements") || (!answers.track && has(answers, "goals", "supplements"));
}

function takesMeds(answers) {
  return has(answers, "track", "meds") || (!answers.track && has(answers, "goals", "meds"));
}

export function takesAnything(answers) {
  return takesSupplements(answers) || takesMeds(answers) || takesEnhancers(answers);
}

/* Which questions this person sees, in order, given what they have answered
   so far. "Just looking" stops after the two clock questions. "Recover
   better" brings the results and Home questions forward. */
export function askedQuestions(rawAnswers) {
  const answers = normalizeSetupAnswers(rawAnswers);
  if (justLooking(answers)) return ["goals", "wake", "sleep"];
  const ids = ["goals", "experience", "days", "wake", "sleep", "train", "track"];
  if (!has(answers, "goals", "enhancers")) ids.push("enhancers");
  if (takesEnhancers(answers)) ids.push("inject");
  if (takesAnything(answers)) ids.push("count", "supply", "timing");
  const view = ["watch", "home"];
  if (has(answers, "goals", "recover")) ids.splice(1, 0, ...view);
  else ids.push(...view);
  ids.push("feel");
  return ids;
}

/* The choices a question offers. "Around workouts" needs a training day. */
export function setupChoices(id, rawAnswers) {
  const question = setupQuestion(id);
  if (!question) return [];
  const answers = normalizeSetupAnswers(rawAnswers);
  if (id === "timing" && answers.train === "none") return question.choices.filter((choice) => choice.value !== "workouts");
  return question.choices.slice();
}

export function setupAnswerText(id, rawAnswers) {
  const question = setupQuestion(id);
  const answers = normalizeSetupAnswers(rawAnswers);
  if (!question || !(id in answers)) return "Not answered";
  const value = answers[id];
  const labels = question.choices.filter((choice) => (Array.isArray(value) ? value.includes(choice.value) : value === choice.value)).map((choice) => choice.label);
  return labels.join(", ") || "Not answered";
}

const COLORS = ["citrus", "lavender", "pink"];
/* Where a new setup block sits, so both phones place it the same way. */
const SETUP_ORDER = Object.freeze({ morning: 0, supplements: 1, night: 2, enhancers: 3, meds: 4 });

export const SETUP_BLOCK_IDS = Object.freeze({
  morning: "block_default_morning",
  supplements: "block_default_stack",
  night: "block_default_night",
  enhancers: "block_setup_enhancers",
  meds: "block_setup_meds",
});
function nightShift(answers) {
  return answers.days === "night" || answers.days === "rotating";
}

function wantsHabitBlocks(answers) {
  if (justLooking(answers)) return true;
  if (!answers.goals && !answers.track) return true;
  return has(answers, "goals", "habits") || has(answers, "track", "habits");
}

/* The blocks a finished setup asks for, in page order. Morning, the middle
   block and Night come first so the Now card's morning, afternoon and night
   slots still land on them; Enhancers & peptides and Medications follow. */
export function setupBlocks(rawAnswers, status = "done") {
  const answers = status === "done" ? normalizeSetupAnswers(rawAnswers) : {};
  const habits = wantsHabitBlocks(answers);
  const generic = status !== "done" || justLooking(answers);
  const supplements = generic || takesSupplements(answers);
  const meds = !generic && takesMeds(answers);
  const combined = supplements && meds && answers.count === "1-3";
  const night = nightShift(answers);
  const out = [];
  if (habits) out.push({ key: "morning", name: night ? "Wake-up routine" : "Morning routine" });
  if (supplements) out.push({ key: "supplements", name: combined ? "Supplements & medications" : "Supplements" });
  if (habits) out.push({ key: "night", name: night ? "Wind-down routine" : "Night routine" });
  if (!generic && takesEnhancers(answers)) out.push({ key: "enhancers", name: "Enhancers & peptides" });
  if (meds && !combined) out.push({ key: "meds", name: "Medications" });
  if (!out.length) out.push({ key: "morning", name: night ? "Wake-up routine" : "Morning routine" });
  return out.map((block, index) => ({ ...block, id: SETUP_BLOCK_IDS[block.key], color: COLORS[index % COLORS.length] }));
}

/* What each part of the page does with these answers. true shows it. */
export function setupShape(prefs) {
  const setup = readSetup(prefs);
  const shape = {
    settled: !!setup,
    doses: true,
    calculator: true,
    injection: true,
    supply: true,
    rest: true,
    tips: false,
    upFront: false,
    home: "next",
    started: [],
  };
  if (!setup || setup.status !== "done") return shape;
  const answers = setup.answers;
  if (justLooking(answers)) return shape;
  const enhancers = takesEnhancers(answers);
  const injects = enhancers && answers.inject !== "no";
  const answeredTrack = !!answers.track || "enhancers" in answers || has(answers, "goals", "enhancers");
  if (answeredTrack) shape.doses = takesAnything(answers);
  shape.calculator = answeredTrack ? injects : true;
  shape.injection = shape.calculator;
  shape.supply = answeredTrack ? enhancers || (takesAnything(answers) && answers.supply !== "no") : true;
  shape.rest = answers.train !== "none";
  shape.tips = answers.experience === "new";
  shape.upFront = answers.experience === "all" || answers.count === "9+";
  if (answers.home) shape.home = answers.home;
  if (Array.isArray(answers.watch)) shape.started = answers.watch.filter((key) => key !== "none");
  return shape;
}

/* A part the person added from Routines settings. Adding only ever turns a
   part on; nothing in setup turns one back off. */
export const ADDED_FEATURES = Object.freeze(["doses", "calculator", "injection", "supply", "rest", "tips"]);

export function addedFeatures(prefs) {
  const list = prefs && Array.isArray(prefs.added) ? prefs.added : [];
  return ADDED_FEATURES.filter((key) => list.includes(key));
}

/* One check the page and later features call: "calculator", "doses",
   "injection", "supply", "rest", "tips" or "upFront". */
export function routineSetupShows(prefs, feature) {
  const shape = setupShape(prefs);
  return shape[feature] === true || addedFeatures(prefs).includes(feature);
}

/* What Routines settings can add. A block's name follows the setup answers,
   so a night-shift setup adds Wake-up and Wind-down. Each block brings the
   tools it needs. */
export const ADDABLE_PARTS = Object.freeze([
  Object.freeze({ key: "morning", kind: "block", tools: [] }),
  Object.freeze({ key: "supplements", kind: "block", tools: ["doses"] }),
  Object.freeze({ key: "night", kind: "block", tools: [] }),
  Object.freeze({ key: "enhancers", kind: "block", tools: ["doses", "calculator", "injection", "supply"] }),
  Object.freeze({ key: "meds", kind: "block", tools: ["doses"] }),
  Object.freeze({ key: "doses", kind: "tool", label: "Dose amounts", hint: "Log an amount and unit on an item.", tools: ["doses"] }),
  Object.freeze({ key: "calculator", kind: "tool", label: "Reconstitution calculator", hint: "Works out the arithmetic for a vial you mix.", tools: ["calculator", "injection"] }),
  Object.freeze({ key: "rest", kind: "tool", label: "Rest day button", hint: "Log a rest day on the Now card.", tools: ["rest"] }),
  Object.freeze({ key: "tips", kind: "tool", label: "Getting started tips", hint: "A short card on how the page works.", tools: ["tips"] }),
]);

const BLOCK_HINTS = Object.freeze({
  morning: "Habits and checks for the start of the day.",
  supplements: "Vitamins, minerals, skin care and other supplements.",
  night: "Habits and checks for the end of the day.",
  enhancers: "Enhancers and peptides, with dose amounts, countdown, calculator and supply.",
  meds: "Medications, with dose amounts and countdown.",
});

export function addableBlockName(key, prefs) {
  const setup = readSetup(prefs);
  const night = !!(setup && setup.status === "done" && nightShift(setup.answers));
  const names = {
    morning: night ? "Wake-up routine" : "Morning routine",
    supplements: "Supplements",
    night: night ? "Wind-down routine" : "Night routine",
    enhancers: "Enhancers & peptides",
    meds: "Medications",
  };
  return names[key] || "";
}

/* Each part with its label, and whether it is already on the page. shows
   answers whether a tool is visible now (the page passes its own check, which
   also counts tools the account already uses). */
export function routineParts(rawStore, shows) {
  const store = normalizeDailyRoutines(rawStore) || { blocks: [], prefs: {} };
  const byId = new Map(store.blocks.map((block) => [block.id, block]));
  return ADDABLE_PARTS.map((part) => {
    if (part.kind === "block") {
      const row = byId.get(SETUP_BLOCK_IDS[part.key]);
      return { key: part.key, kind: "block", label: addableBlockName(part.key, store.prefs), hint: BLOCK_HINTS[part.key], present: !!(row && isLive(row)) };
    }
    const on = part.key === "tips"
      ? shows("tips") && !(store.prefs && store.prefs.tipsHidden === true)
      : shows(part.key);
    return { key: part.key, kind: "tool", label: part.label, hint: part.hint, present: !!on };
  });
}

/* Adds one part and the tools it brings. A new block takes its fixed id at
   the seed stamp. A block the user deleted is brought back by the page's own
   restore first, so its items come with it. */
export function addRoutinePart(rawStore, key, at) {
  const part = ADDABLE_PARTS.find((entry) => entry.key === key);
  const store = normalizeDailyRoutines(rawStore);
  if (!part || !store) return null;
  const stamp = typeof at === "number" && at > DEFAULT_BLOCK_STAMP ? at : Date.now();
  if (part.kind === "block") {
    const id = SETUP_BLOCK_IDS[key];
    /* A row already there (live, or just restored) only gets its tools. */
    if (!store.blocks.some((block) => block.id === id)) {
      const order = Math.max(nextOrder(store), SETUP_ORDER[key] || 0);
      store.blocks.push({ id, name: addableBlockName(key, store.prefs), color: COLORS[(SETUP_ORDER[key] || 0) % COLORS.length], order, updatedAt: DEFAULT_BLOCK_STAMP, deletedAt: null });
    }
  }
  const prefs = { ...store.prefs };
  prefs.added = [...new Set([...addedFeatures(prefs), ...part.tools])];
  if (key === "tips") prefs.tipsHidden = false;
  prefs.updatedAt = Math.max(stamp, typeof prefs.updatedAt === "number" ? prefs.updatedAt + 1 : 0);
  store.prefs = prefs;
  store.updatedAt = Math.max(typeof store.updatedAt === "number" ? store.updatedAt : 0, prefs.updatedAt);
  return store;
}

function rowStamp(row) {
  return Math.max(row && typeof row.updatedAt === "number" ? row.updatedAt : 0, row && typeof row.deletedAt === "number" ? row.deletedAt : 0);
}

/* Every name a setup or the first seed gives a block. A block still under
   one of these names with nothing placed in it is one the user has not made
   their own, so a setup may rename or remove it. */
const SETUP_NAMES = new Set([
  "Morning routine", "Wake-up routine", "Supplement & enhancer stack", "Supplements",
  "Supplements & medications", "Night routine", "Wind-down routine", "Enhancers & peptides", "Medications",
]);
const SETUP_OWNED = new Set(Object.values(SETUP_BLOCK_IDS));

function pristine(store, block) {
  if (!block || !isLive(block) || !SETUP_OWNED.has(block.id)) return false;
  if (rowStamp(block) !== DEFAULT_BLOCK_STAMP && !SETUP_NAMES.has(block.name)) return false;
  return !liveOf(store.placements).some((place) => place.blockId === block.id);
}

function nextOrder(store) {
  return liveOf(store.blocks).reduce((max, block) => Math.max(max, typeof block.order === "number" ? block.order : 0), -1) + 1;
}

/* Writes a finished or skipped setup onto the store and returns the new copy.
   touched lists the questions whose one-time effects (Focus mode, collapsed
   blocks) should run; null means all of them, as on a full pass. keepOpen
   returns the id of the block that is current now, which stays open.
   addOnly (a retake) adds what the answers ask for and removes nothing. */
export function applySetup(rawStore, { status, answers: rawAnswers, at, touched = null, keepOpen = null, addOnly = false }) {
  const store = normalizeDailyRoutines(rawStore);
  if (!store || (status !== "done" && status !== "skipped")) return null;
  const answers = status === "done" ? normalizeSetupAnswers(rawAnswers) : {};
  const stamp = typeof at === "number" && at > DEFAULT_BLOCK_STAMP ? at : Date.now();
  const wanted = setupBlocks(answers, status);
  const byId = new Map(store.blocks.map((block) => [block.id, block]));
  const resolved = new Map();

  /* Skip records the choice and leaves every block as it is. */
  for (const spec of status === "done" ? wanted : []) {
    const row = byId.get(spec.id);
    if (row && isLive(row)) {
      if (pristine(store, row) && row.name !== spec.name) {
        store.blocks = store.blocks.map((block) => (block.id === row.id ? { ...block, name: spec.name, updatedAt: stamp } : block));
      }
      resolved.set(spec.key, row.id);
      continue;
    }
    /* A block the user deleted stays deleted, and nothing stands in for it. */
    if (row) continue;
    /* A new setup block takes the seed stamp, like the defaults,
       so two phones write the same row and any edit beats it. */
    const block = { id: spec.id, name: spec.name, color: spec.color, order: Math.max(nextOrder(store), SETUP_ORDER[spec.key] || 0), updatedAt: DEFAULT_BLOCK_STAMP, deletedAt: null };
    store.blocks.push(block);
    byId.set(spec.id, block);
    resolved.set(spec.key, spec.id);
  }

  const keep = new Set(resolved.values());
  for (const id of status === "done" && !addOnly ? SETUP_OWNED : []) {
    if (keep.has(id)) continue;
    const row = byId.get(id);
    if (!pristine(store, row)) continue;
    store.blocks = store.blocks.map((block) => (block.id === id ? { ...block, updatedAt: stamp, deletedAt: stamp } : block));
  }

  const liveIds = new Set(liveOf(store.blocks).map((block) => block.id));
  const placed = wanted.filter((spec) => resolved.has(spec.key) && liveIds.has(resolved.get(spec.key)));
  const runs = (id) => touched === null || (Array.isArray(touched) && touched.includes(id));
  const prefs = { ...store.prefs };
  if (status === "done" && runs("feel") && answers.feel) prefs.focusMode = answers.feel === "next";
  if (status === "done" && runs("count") && answers.count === "9+") {
    const open = typeof keepOpen === "function" ? keepOpen(store) : null;
    const ids = placed.map((spec) => resolved.get(spec.key)).filter((id) => id && id !== open);
    const current = Array.isArray(prefs.collapsedBlocks) ? prefs.collapsedBlocks.filter((id) => typeof id === "string" && id) : [];
    prefs.collapsedBlocks = [...new Set([...current, ...ids])];
  }
  prefs.setup = { v: SETUP_VERSION, status, answers, updatedAt: stamp };
  prefs.updatedAt = Math.max(stamp, typeof prefs.updatedAt === "number" ? prefs.updatedAt + 1 : 0);
  store.prefs = prefs;
  store.updatedAt = Math.max(typeof store.updatedAt === "number" ? store.updatedAt : 0, prefs.updatedAt);
  return store;
}
