/* Routines setup. Every account answers it once, the first time Routines
   opens. The answers live on prefs.setup. Nothing here stores free text:
   every answer is a key from the lists below.

   The page reads the answers through routineSetupShows(). Hiding a part of
   the page never deletes a row. Without a finished setup every part shows.
   Applying answers adds the Morning and Night routines (with windows from
   the clock answers), turns on type tabs, renames a default routine nobody
   has touched yet, and never removes a row the user made. It adds no
   checks: nobody needs to tick off waking up or going to bed.

   Ported from the web app's shared/routine-setup.js and
   pages/daily-routines-setup.js. The questions, choices and labels are the
   web ones, word for word. */

import { restoreBlock, showBlock } from "./blocks";
import { DEFAULT_BLOCK_IDS } from "./ids";
import { routineNowNext } from "./now";
import { DEFAULT_BLOCK_STAMP, isLive, liveOf, type PrefsLike, type RoutineBlock, type RoutineStore, type SetupAnswers } from "./shape";
import { clean, prefStamp, start, type RoutineClock } from "./write";

export const SETUP_VERSION = 1;

export interface SetupChoice { value: string; label: string }
export interface SetupQuestion { id: string; title: string; multi: boolean; hint: string; choices: readonly SetupChoice[] }

const q = (id: string, title: string, choices: [string, string][], extra: { multi?: boolean; hint?: string } = {}): SetupQuestion => Object.freeze({
  id,
  title,
  multi: extra.multi === true,
  hint: extra.hint || "",
  choices: Object.freeze(choices.map(([value, label]) => Object.freeze({ value, label }))),
});

export const SETUP_QUESTIONS: readonly SetupQuestion[] = Object.freeze([
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
const EXCLUSIVE: Readonly<Record<string, string>> = Object.freeze({ goals: "looking", track: "habits", watch: "none" });

export function setupQuestion(id: unknown): SetupQuestion | null {
  return (typeof id === "string" && BY_ID.get(id)) || null;
}

function cleanAnswer(question: SetupQuestion, value: unknown): string | string[] | null {
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

/* Unknown keys and values are dropped, so a copy from a newer build or a
   hand-edited backup cannot put anything else on the page. */
export function normalizeSetupAnswers(raw: unknown): SetupAnswers {
  const out: SetupAnswers = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const question of SETUP_QUESTIONS) {
    const value = cleanAnswer(question, (raw as Record<string, unknown>)[question.id]);
    if (value !== null) out[question.id] = value;
  }
  return out;
}

export function readSetup(prefs: PrefsLike | null | undefined): { status: "done" | "skipped"; answers: SetupAnswers } | null {
  const raw = prefs && typeof prefs === "object" ? prefs.setup : null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const status = raw.status === "done" || raw.status === "skipped" ? raw.status : null;
  if (!status) return null;
  return { status, answers: status === "done" ? normalizeSetupAnswers(raw.answers) : {} };
}

export function setupSettled(prefs: PrefsLike | null | undefined): boolean {
  return readSetup(prefs) !== null;
}

function has(answers: SetupAnswers, id: string, value: string): boolean {
  const answer = answers[id];
  return Array.isArray(answer) ? answer.includes(value) : answer === value;
}

function justLooking(answers: SetupAnswers): boolean {
  return has(answers, "goals", "looking");
}

export function takesEnhancers(answers: SetupAnswers): boolean {
  return has(answers, "goals", "enhancers") || answers.enhancers === "yes";
}

function takesSupplements(answers: SetupAnswers): boolean {
  return has(answers, "track", "supplements") || (!answers.track && has(answers, "goals", "supplements"));
}

function takesMeds(answers: SetupAnswers): boolean {
  return has(answers, "track", "meds") || (!answers.track && has(answers, "goals", "meds"));
}

export function takesAnything(answers: SetupAnswers): boolean {
  return takesSupplements(answers) || takesMeds(answers) || takesEnhancers(answers);
}

/* Which questions this person sees, in order, given what they have answered
   so far. "Just looking" stops after the two clock questions. "Recover
   better" brings the results and Home questions forward. */
export function askedQuestions(rawAnswers: unknown): string[] {
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
export function setupChoices(id: unknown, rawAnswers: unknown): SetupChoice[] {
  const question = setupQuestion(id);
  if (!question) return [];
  const answers = normalizeSetupAnswers(rawAnswers);
  if (id === "timing" && answers.train === "none") return question.choices.filter((choice) => choice.value !== "workouts");
  return question.choices.slice();
}

export function setupAnswerText(id: unknown, rawAnswers: unknown): string {
  const question = setupQuestion(id);
  const answers = normalizeSetupAnswers(rawAnswers);
  if (!question || !(question.id in answers)) return "Not answered";
  const value = answers[question.id];
  const labels = question.choices.filter((choice) => (Array.isArray(value) ? value.includes(choice.value) : value === choice.value)).map((choice) => choice.label);
  return labels.join(", ") || "Not answered";
}

/* Where a new setup routine sits, so both phones place it the same way. */
const SETUP_ORDER: Readonly<Record<string, number>> = Object.freeze({ morning: 0, night: 1 });

/* The web also has ids for old supplement, enhancer and medication blocks.
   Those are type tabs now, and the phone never had the blocks. */
export const SETUP_BLOCK_IDS: Readonly<Record<string, string>> = Object.freeze({
  morning: DEFAULT_BLOCK_IDS.morning,
  night: DEFAULT_BLOCK_IDS.night,
});

function nightShift(answers: SetupAnswers): boolean {
  return answers.days === "night" || answers.days === "rotating";
}

/* When a routine starts and ends, from the clock answers. Night and rotating
   shifts keep the default windows, since their day does not follow the
   clock. Times are minutes from midnight. */
const WAKE_START: Readonly<Record<string, number>> = Object.freeze({ early: 5 * 60, "6-8": 6 * 60, "8-10": 8 * 60, late: 10 * 60 });
const SLEEP_END: Readonly<Record<string, number>> = Object.freeze({ early: 22 * 60, "10-12": 23 * 60, late: 24 * 60 });

export function setupWindow(key: string, rawAnswers: unknown): { startMin: number; endMin: number } | null {
  const answers = normalizeSetupAnswers(rawAnswers);
  if (nightShift(answers)) return null;
  if (key === "morning") {
    const startMin = typeof answers.wake === "string" ? WAKE_START[answers.wake] : undefined;
    return typeof startMin === "number" ? { startMin, endMin: startMin + 6 * 60 } : null;
  }
  if (key === "night") {
    const endMin = typeof answers.sleep === "string" ? SLEEP_END[answers.sleep] : undefined;
    return typeof endMin === "number" ? { startMin: endMin - 2 * 60, endMin } : null;
  }
  return null;
}

export interface SetupBlock { key: string; id: string; name: string; color: string; window: { startMin: number; endMin: number } | null }

/* The routines a finished setup asks for, in page order: Morning and Night,
   or Wake-up and Wind-down on shifts. What a person takes becomes item types
   and their tabs (setupTypeTabs), not routines. */
export function setupBlocks(rawAnswers: unknown, status: string = "done"): SetupBlock[] {
  const answers = status === "done" ? normalizeSetupAnswers(rawAnswers) : {};
  const night = nightShift(answers);
  const out = [
    { key: "morning", name: night ? "Wake-up routine" : "Morning routine", color: "citrus" },
    { key: "night", name: night ? "Wind-down routine" : "Night routine", color: "pink" },
  ];
  return out.map((block) => ({ ...block, id: SETUP_BLOCK_IDS[block.key], window: status === "done" ? setupWindow(block.key, answers) : null }));
}

/* The type tabs a finished setup turns on, so they show before the first
   item is added. Tabs for types that have items show either way. */
export function setupTypeTabs(rawAnswers: unknown, status: string = "done"): string[] {
  if (status !== "done") return [];
  const answers = normalizeSetupAnswers(rawAnswers);
  if (justLooking(answers)) return [];
  const tabs: string[] = [];
  if (takesSupplements(answers)) tabs.push("supplement");
  if (takesEnhancers(answers)) {
    if (answers.inject !== "no") tabs.push("peptide");
    tabs.push("enhancer");
  }
  if (takesMeds(answers)) tabs.push("medication");
  return tabs;
}

export interface SetupShape {
  settled: boolean; doses: boolean; calculator: boolean; injection: boolean; supply: boolean; rest: boolean; tips: boolean; upFront: boolean; home: string; started: string[];
}
export type SetupFeature = "doses" | "calculator" | "injection" | "supply" | "rest" | "tips" | "upFront";

/* What each part of the page does with these answers. true shows it. */
export function setupShape(prefs: PrefsLike | null | undefined): SetupShape {
  const setup = readSetup(prefs);
  const shape: SetupShape = { settled: !!setup, doses: true, calculator: true, injection: true, supply: true, rest: true, tips: false, upFront: false, home: "next", started: [] };
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
  if (typeof answers.home === "string") shape.home = answers.home;
  if (Array.isArray(answers.watch)) shape.started = answers.watch.filter((key) => key !== "none");
  return shape;
}

/* A part the person added from Routines settings. Adding only ever turns a
   part on; nothing in setup turns one back off. */
export const ADDED_FEATURES = Object.freeze(["doses", "calculator", "injection", "supply", "rest", "tips"] as const);

export function addedFeatures(prefs: PrefsLike | null | undefined): string[] {
  const list: readonly string[] = prefs && Array.isArray(prefs.added) ? prefs.added : [];
  return ADDED_FEATURES.filter((key) => list.includes(key));
}

/* One check the page and later features call: "calculator", "doses",
   "injection", "supply", "rest", "tips" or "upFront". */
export function routineSetupShows(prefs: PrefsLike | null | undefined, feature: string): boolean {
  const shape = setupShape(prefs) as unknown as Record<string, unknown>;
  return shape[feature] === true || addedFeatures(prefs).includes(feature);
}

/* A tool the store already uses stays on screen whatever the answers say,
   so nobody loses something they rely on by answering the setup. */
function routineInUse(feature: string, store: Partial<RoutineStore> | null | undefined): boolean {
  if (!store || typeof store !== "object") return false;
  const doses = () => (store.items || []).some((item) => isLive(item) && item.kind === "dose");
  if (feature === "calculator" || feature === "injection") return (store.compounds || []).some(isLive) || doses();
  if (feature === "doses") return doses();
  if (feature === "rest") return (store.logs || []).some((log) => isLive(log) && log.rest === true);
  return false;
}

/* What the page shows: what the answers ask for, plus anything already in use. */
export function routineShows(feature: string, store: Partial<RoutineStore> | null | undefined): boolean {
  return routineSetupShows(store && store.prefs, feature) || routineInUse(feature, store);
}

/* What Routines settings can add. A routine's name follows the setup
   answers, so a night-shift setup adds Wake-up and Wind-down. Each part
   brings the tools it needs. */
export interface AddablePart { key: string; kind: "block" | "type" | "tool"; tools: readonly string[]; types?: readonly string[]; label?: string; hint?: string }
export const ADDABLE_PARTS: readonly AddablePart[] = Object.freeze([
  Object.freeze({ key: "morning", kind: "block", tools: [] }),
  Object.freeze({ key: "night", kind: "block", tools: [] }),
  Object.freeze({ key: "supplements", kind: "type", types: ["supplement"], tools: ["doses"] }),
  Object.freeze({ key: "enhancers", kind: "type", types: ["peptide", "enhancer"], tools: ["doses", "calculator", "injection", "supply"] }),
  Object.freeze({ key: "meds", kind: "type", types: ["medication"], tools: ["doses"] }),
  Object.freeze({ key: "doses", kind: "tool", label: "Dose amounts", hint: "Log an amount and unit on an item.", tools: ["doses"] }),
  Object.freeze({ key: "calculator", kind: "tool", label: "Reconstitution calculator", hint: "Works out the arithmetic for a vial you mix.", tools: ["calculator", "injection"] }),
  Object.freeze({ key: "rest", kind: "tool", label: "Rest day button", hint: "Log a rest day on the Now card.", tools: ["rest"] }),
  Object.freeze({ key: "tips", kind: "tool", label: "Getting started tips", hint: "A short card on how the page works.", tools: ["tips"] }),
] as const);

const BLOCK_HINTS: Readonly<Record<string, string>> = Object.freeze({
  morning: "Habits and checks for the start of the day.",
  supplements: "A Supplements tab for vitamins, minerals and skin care.",
  night: "Habits and checks for the end of the day.",
  enhancers: "Peptides and Enhancers tabs, with dose amounts, the calculator and supply.",
  meds: "A Medications tab, with dose amounts and countdown.",
});

const TYPE_PART_NAMES: Readonly<Record<string, string>> = Object.freeze({ supplements: "Supplements tab", enhancers: "Peptides and Enhancers tabs", meds: "Medications tab" });

export function setupTypeTabsOf(prefs: PrefsLike | null | undefined): string[] {
  const list: readonly unknown[] = prefs && Array.isArray(prefs.typeTabs) ? prefs.typeTabs : [];
  return list.filter((id): id is string => typeof id === "string" && !!id);
}

export function addableBlockName(key: string, prefs: PrefsLike | null | undefined): string {
  const setup = readSetup(prefs);
  const night = !!(setup && setup.status === "done" && nightShift(setup.answers));
  const names: Record<string, string> = {
    morning: night ? "Wake-up routine" : "Morning routine",
    night: night ? "Wind-down routine" : "Night routine",
  };
  return names[key] || TYPE_PART_NAMES[key] || "";
}

export interface RoutinePart { key: string; kind: "block" | "type" | "tool"; label: string; hint: string; present: boolean }

/* Each part with its label, and whether it is already on the page. shows
   answers whether a tool is visible now (the page passes routineShows, which
   also counts tools already in use). */
export function routineParts(input: unknown, shows: (feature: string) => boolean): RoutinePart[] {
  const store = clean(input as RoutineStore);
  const blocks = store ? store.blocks : [];
  const prefs = store ? store.prefs : null;
  const byId = new Map(blocks.map((block) => [block.id, block]));
  return ADDABLE_PARTS.map((part) => {
    if (part.kind === "block") {
      const row = byId.get(SETUP_BLOCK_IDS[part.key]);
      return { key: part.key, kind: "block", label: addableBlockName(part.key, prefs), hint: BLOCK_HINTS[part.key], present: !!(row && isLive(row) && row.hidden !== true) };
    }
    if (part.kind === "type") {
      const on = new Set(setupTypeTabsOf(prefs));
      return { key: part.key, kind: "type", label: addableBlockName(part.key, prefs), hint: BLOCK_HINTS[part.key], present: (part.types || []).every((type) => on.has(type)) };
    }
    const on = part.key === "tips" ? shows("tips") && !(prefs && prefs.tipsHidden === true) : shows(part.key);
    return { key: part.key, kind: "tool", label: part.label || "", hint: part.hint || "", present: !!on };
  });
}

function rowStamp(row: { updatedAt?: number; deletedAt?: number | null } | null | undefined): number {
  return Math.max(row && typeof row.updatedAt === "number" ? row.updatedAt : 0, row && typeof row.deletedAt === "number" ? row.deletedAt : 0);
}

function nextOrder(store: RoutineStore): number {
  return liveOf(store.blocks).reduce((max, block) => Math.max(max, typeof block.order === "number" ? block.order : 0), -1) + 1;
}

/* Adds one part and the tools it brings. A routine that is hidden is shown
   again with its items. One deleted on this screen comes back the same way.
   One deleted earlier keeps no values on the phone, so it comes back empty
   under its fixed id. */
export function addRoutinePart(input: unknown, key: unknown, clock: RoutineClock): RoutineStore | null {
  const part = ADDABLE_PARTS.find((entry) => entry.key === key);
  let store = start(input, clock, false);
  if (!part || !store) return null;
  if (part.kind === "block") {
    const id = SETUP_BLOCK_IDS[part.key];
    const stored = store.blocks.find((block) => block.id === id);
    if (stored && !isLive(stored)) {
      store = stored.name ? restoreBlock(store, id, clock) : { ...store, blocks: store.blocks.filter((block) => block.id !== id) };
    } else if (stored && stored.hidden === true) {
      store = showBlock(store, id, clock);
    }
    if (!store) return null;
    /* A row already there (live, or just restored) only gets its tools. */
    if (!store.blocks.some((block) => block.id === id)) {
      const order = Math.max(nextOrder(store), SETUP_ORDER[part.key] || 0);
      const block: RoutineBlock = { id, name: addableBlockName(part.key, store.prefs), color: part.key === "night" ? "pink" : "citrus", order, updatedAt: DEFAULT_BLOCK_STAMP, deletedAt: null };
      store = { ...store, blocks: [...store.blocks, block] };
    }
  }
  const prefs = { ...store.prefs };
  if (part.kind === "type") prefs.typeTabs = [...new Set([...setupTypeTabsOf(prefs), ...(part.types || [])])];
  prefs.added = [...new Set([...addedFeatures(prefs), ...part.tools])];
  if (part.key === "tips") delete prefs.tipsHidden;
  prefs.updatedAt = prefStamp(store, clock);
  return clean({ ...store, prefs });
}

/* Every name a setup or the first seed gives a routine. One still under one
   of these names with nothing placed in it is one the user has not made
   their own, so a setup may rename it. */
const SETUP_NAMES = new Set([
  "Morning routine", "Wake-up routine", "Supplement & enhancer stack", "Supplements",
  "Supplements & medications", "Night routine", "Wind-down routine", "Enhancers & peptides", "Medications",
]);
const SETUP_OWNED = new Set(Object.values(SETUP_BLOCK_IDS));

function pristine(store: RoutineStore, block: RoutineBlock | undefined): boolean {
  if (!block || !isLive(block) || !SETUP_OWNED.has(block.id)) return false;
  if (rowStamp(block) !== DEFAULT_BLOCK_STAMP && !SETUP_NAMES.has(block.name)) return false;
  return !liveOf(store.placements).some((place) => place.blockId === block.id);
}

export interface SetupSave {
  status: unknown; answers?: unknown; at: number;
  /** The questions whose one-time effects (Focus mode, folded routines) should run; null means all of them, as on a full pass. */
  touched?: readonly string[] | null;
  /** Returns the id of the routine that is current now, which stays open. */
  keepOpen?: ((store: RoutineStore) => string | null) | null;
  /** Ids of default routines the user deleted earlier. The phone keeps no values for them, so the store cannot tell on its own. */
  removed?: readonly string[] | null;
}

/* Writes a finished or skipped setup onto the store and returns the new
   copy. It only adds: no routine is removed, on a first pass or a retake. */
export function applySetup(input: unknown, { status, answers: rawAnswers, at, touched = null, keepOpen = null, removed = null }: SetupSave): RoutineStore | null {
  const base = clean(input as RoutineStore);
  if (!base || (status !== "done" && status !== "skipped") || typeof at !== "number" || !Number.isFinite(at)) return null;
  let store = base;
  const answers = status === "done" ? normalizeSetupAnswers(rawAnswers) : {};
  const stamp = Math.max(at, DEFAULT_BLOCK_STAMP + 1);
  const wanted = setupBlocks(answers, status);
  const byId = new Map(store.blocks.map((block) => [block.id, block]));
  const gone = new Set(removed || []);
  const resolved = new Map<string, string>();

  /* Skip records the choice and leaves every routine as it is. */
  for (const spec of status === "done" ? wanted : []) {
    const row = byId.get(spec.id);
    if (row && isLive(row)) {
      const ownWindow = typeof row.startMin === "number";
      const rename = pristine(store, row) && row.name !== spec.name;
      const timed = !!spec.window && !ownWindow && rowStamp(row) === DEFAULT_BLOCK_STAMP;
      if (rename || timed) {
        store = { ...store, blocks: store.blocks.map((block) => (block.id === row.id
          ? { ...block, ...(rename ? { name: spec.name } : {}), ...(timed ? spec.window : {}), updatedAt: Math.max(stamp, rowStamp(block) + 1) }
          : block)) };
      }
      resolved.set(spec.key, row.id);
      continue;
    }
    /* A routine the user deleted stays deleted, and nothing stands in for it. */
    if (row || gone.has(spec.id)) continue;
    /* A new setup routine takes the seed stamp, like the defaults,
       so two phones write the same row and any edit beats it. */
    const block: RoutineBlock = { id: spec.id, name: spec.name, color: spec.color, order: Math.max(nextOrder(store), SETUP_ORDER[spec.key] || 0), ...(spec.window || {}), updatedAt: DEFAULT_BLOCK_STAMP, deletedAt: null };
    store = { ...store, blocks: [...store.blocks, block] };
    byId.set(spec.id, block);
    resolved.set(spec.key, spec.id);
  }

  const liveIds = new Set(liveOf(store.blocks).map((block) => block.id));
  const placed = wanted.filter((spec) => liveIds.has(resolved.get(spec.key) || ""));
  const runs = (id: string) => touched === null || (Array.isArray(touched) && touched.includes(id));
  const prefs = { ...store.prefs };
  if (status === "done" && runs("feel") && answers.feel) {
    if (answers.feel === "next") prefs.focusMode = true;
    else delete prefs.focusMode;
  }
  if (status === "done" && runs("count") && answers.count === "9+") {
    const open = typeof keepOpen === "function" ? keepOpen(store) : null;
    const ids = placed.map((spec) => resolved.get(spec.key)).filter((id): id is string => !!id && id !== open);
    const current = Array.isArray(prefs.collapsedBlocks) ? prefs.collapsedBlocks.filter((id) => typeof id === "string" && id) : [];
    prefs.collapsedBlocks = [...new Set([...current, ...ids])];
  }
  const tabs = setupTypeTabs(answers, status);
  if (tabs.length) prefs.typeTabs = [...new Set([...setupTypeTabsOf(prefs), ...tabs])];
  prefs.setup = { v: SETUP_VERSION, status, answers, updatedAt: stamp };
  prefs.updatedAt = Math.max(stamp, typeof prefs.updatedAt === "number" ? prefs.updatedAt + 1 : 0);
  return clean({ ...store, prefs });
}

/* Saves a finished or skipped setup and shapes the page from it. date is
   the clock the page shows, so the routine that is current stays open. */
export function saveSetup(input: unknown, save: { status: unknown; answers?: unknown; touched?: readonly string[] | null; removed?: readonly string[] | null }, clock: RoutineClock, date: Date): RoutineStore | null {
  const store = start(input, clock, false);
  if (!store || !save || (save.status !== "done" && save.status !== "skipped")) return null;
  return applySetup(store, {
    ...save,
    at: prefStamp(store, clock),
    keepOpen: (next) => {
      const moment = routineNowNext(next.blocks, date);
      return moment.nowBlock && moment.nowBlock.id ? moment.nowBlock.id : null;
    },
  });
}

function flipPref(input: unknown, clock: RoutineClock, change: (prefs: RoutineStore["prefs"]) => RoutineStore["prefs"] | null): RoutineStore | null {
  const store = start(input, clock, false);
  const prefs = store && change({ ...store.prefs });
  return store && prefs ? clean({ ...store, prefs: { ...prefs, updatedAt: prefStamp(store, clock) } }) : null;
}

/* Focus mode shows only what is next. */
export function toggleFocus(input: unknown, clock: RoutineClock): RoutineStore | null {
  return flipPref(input, clock, (prefs) => {
    if (prefs.focusMode === true) delete prefs.focusMode;
    else prefs.focusMode = true;
    return prefs;
  });
}

/* The tips card, once hidden, stays hidden until it is added back from settings. */
export function hideTips(input: unknown, clock: RoutineClock): RoutineStore | null {
  return flipPref(input, clock, (prefs) => (prefs.tipsHidden === true ? null : { ...prefs, tipsHidden: true }));
}

/* ---------- The setup sheet, one question at a time ----------

   Closing the sheet saves nothing. Only Finish or Skip setup saves, through
   finishSetup and saveSetup. Routines settings can retake it. */

export interface SetupDraft { mode: "quiz" | "retake"; step: string; answers: SetupAnswers }

export const SETUP_MESSAGES = Object.freeze({
  failed: "Your setup couldn't be saved right now. Try again in a moment.",
  retaken: "Setup saved. Nothing was removed.",
  done: "Your Routines page is set up.",
  skipped: "Setup skipped. You can set up your page from Routines settings.",
});

/* Only the answers to questions this person is still asked are kept, so an
   answer left behind by an earlier pick cannot shape the page. */
export function pruneSetupAnswers(raw: unknown): SetupAnswers {
  const answers = normalizeSetupAnswers(raw);
  const asked = new Set(askedQuestions(answers));
  const out: SetupAnswers = {};
  for (const [id, value] of Object.entries(answers)) {
    if (!asked.has(id)) continue;
    const allowed = new Set(setupChoices(id, answers).map((choice) => choice.value));
    if (Array.isArray(value)) {
      const kept = value.filter((key) => allowed.has(key));
      if (kept.length) out[id] = kept;
    } else if (allowed.has(value)) {
      out[id] = value;
    }
  }
  return out;
}

/* A first pass starts empty, and keeps a draft that was closed part way. A
   retake starts from the saved answers. */
export function openSetupDraft(prefs: PrefsLike | null | undefined, mode: "quiz" | "retake" = "quiz", prior?: SetupDraft | null): SetupDraft {
  if (mode === "retake") {
    const setup = readSetup(prefs);
    return { mode: "retake", step: "goals", answers: { ...(setup && setup.status === "done" ? setup.answers : {}) } };
  }
  if (prior && prior.mode === "quiz") return prior;
  return { mode: "quiz", step: "goals", answers: {} };
}

/* The setup opens by itself only until it is finished or skipped. */
export function setupOffered(prefs: PrefsLike | null | undefined): boolean {
  return !readSetup(prefs);
}

export type SetupStep = { draft: SetupDraft; finished: boolean };

function advance(draft: SetupDraft): SetupStep {
  const list = askedQuestions(draft.answers);
  const index = list.indexOf(draft.step);
  const next = index >= 0 ? list[index + 1] : list[0];
  if (!next) return { draft, finished: true };
  return { draft: { ...draft, step: next }, finished: false };
}

/* A single-choice answer moves on. A pick-any answer toggles and waits for Next. */
export function pickSetupAnswer(draft: SetupDraft | null | undefined, questionId: unknown, value: unknown): SetupStep | null {
  const question = setupQuestion(questionId);
  if (!draft || !question || draft.step !== question.id || typeof value !== "string") return null;
  if (!setupChoices(question.id, draft.answers).some((choice) => choice.value === value)) return null;
  if (!question.multi) return advance({ ...draft, answers: { ...draft.answers, [question.id]: value } });
  const current = draft.answers[question.id];
  const picked = Array.isArray(current) ? current.slice() : [];
  const only = EXCLUSIVE[question.id];
  let next: string[];
  if (picked.includes(value)) next = picked.filter((key) => key !== value);
  else if (value === only) next = [value];
  else next = picked.filter((key) => key !== only).concat(value);
  const answers = { ...draft.answers };
  if (next.length) answers[question.id] = next;
  else delete answers[question.id];
  return { draft: { ...draft, answers }, finished: false };
}

/* Next on a pick-any question needs at least one pick. */
export function nextSetupStep(draft: SetupDraft | null | undefined): SetupStep | null {
  if (!draft) return null;
  const value = draft.answers[draft.step];
  if (!Array.isArray(value) || !value.length) return null;
  return advance(draft);
}

export function skipSetupQuestion(draft: SetupDraft | null | undefined): SetupStep | null {
  if (!draft) return null;
  const answers = { ...draft.answers };
  delete answers[draft.step];
  return advance({ ...draft, answers });
}

export function backSetupStep(draft: SetupDraft | null | undefined): SetupDraft | null {
  if (!draft) return null;
  const list = askedQuestions(draft.answers);
  const index = list.indexOf(draft.step);
  if (index <= 0) return null;
  return { ...draft, step: list[index - 1] };
}

/* What to hand saveSetup. A first pass runs every answer's one-time
   effects. A retake runs only the ones whose answer changed, so a Focus
   mode switched by hand since then is left alone. */
export function finishSetup(draft: SetupDraft | null | undefined, prefs: PrefsLike | null | undefined, status: "done" | "skipped"): { status: "done" | "skipped"; answers: SetupAnswers; touched: string[] | null } {
  const answers = status === "done" && draft ? pruneSetupAnswers(draft.answers) : {};
  if (!draft || draft.mode === "quiz") return { status, answers, touched: null };
  const setup = readSetup(prefs);
  const before = setup && setup.status === "done" ? setup.answers : {};
  const ids = new Set([...Object.keys(before), ...Object.keys(answers)]);
  return { status, answers, touched: [...ids].filter((id) => JSON.stringify(before[id]) !== JSON.stringify(answers[id])) };
}
