import { app } from "../runtime.js";
import {
  applyStoredQuizStartTimes,
  canMutateRoutines,
  isLive,
  normalizeDailyRoutines,
  putDailyRoutines,
} from "../shared/daily-routines-store.js";
import { GENERIC_STARTER_ITEMS, STARTER_BLOCKS, STARTER_BLOCK_KEYS } from "../shared/routine-starter.js";
import {
  addRoutineItem,
  deleteRoutineBlock,
  ensureRoutineShell,
} from "./daily-routines.js";

/* One-time setup. Four taps cover what you track, wake, bed, and the
   blocks to keep. A fifth tap is only for turning a block off. Skipping
   keeps the generic starter. The sheet is not offered again. Wake and bed
   are stored on dailyRoutines.quiz. startTime is written only when a block
   already has that field. */

const TRACKS = new Set(["checks", "supplements", "both"]);
const TRACK_CHOICES = Object.freeze([
  Object.freeze({ value: "checks", label: "Daily checks" }),
  Object.freeze({ value: "supplements", label: "Supplements" }),
  Object.freeze({ value: "both", label: "Both" }),
]);
const WAKE_CHOICES = Object.freeze([
  Object.freeze({ value: "05:00", label: "5:00 AM" }),
  Object.freeze({ value: "06:00", label: "6:00 AM" }),
  Object.freeze({ value: "07:00", label: "7:00 AM" }),
  Object.freeze({ value: "08:00", label: "8:00 AM" }),
]);
const BED_CHOICES = Object.freeze([
  Object.freeze({ value: "21:00", label: "9:00 PM" }),
  Object.freeze({ value: "22:00", label: "10:00 PM" }),
  Object.freeze({ value: "23:00", label: "11:00 PM" }),
  Object.freeze({ value: "00:00", label: "12:00 AM" }),
]);
const WAKE_TIMES = new Set(WAKE_CHOICES.map((choice) => choice.value));
const BED_TIMES = new Set(BED_CHOICES.map((choice) => choice.value));

function esc(value) {
  if (typeof app.esc === "function") return app.esc(value);
  return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function writesOpen() {
  return app.ROUTINES_ENABLED === true && canMutateRoutines() && !(app.sb && app.cloudPullOk !== true);
}

function quizStamp(previous) {
  let at = 0;
  if (typeof app.routineNow === "function") {
    const date = app.routineNow();
    if (date instanceof Date && !Number.isNaN(date.getTime())) at = date.getTime();
  }
  if (!at) at = Date.now();
  const prev = typeof previous === "number" && Number.isFinite(previous) ? previous : 0;
  const next = at > prev ? at : prev + 1;
  return next > 0 ? next : 1;
}

export function routineQuizSettled(store) {
  const quiz = store && store.quiz;
  return !!(quiz && (quiz.status === "skipped" || quiz.status === "done"));
}

function freshDraft() {
  return { step: "tracks", tracks: null, wake: null, bed: null, kept: STARTER_BLOCK_KEYS.slice() };
}

function draftOf() {
  const current = app.ui && app.ui.routineQuiz;
  if (!current || typeof current !== "object") return freshDraft();
  const kept = STARTER_BLOCK_KEYS.filter((key) => Array.isArray(current.kept) && current.kept.includes(key));
  return {
    step: current.step === "wake" || current.step === "bed" || current.step === "blocks" ? current.step : "tracks",
    tracks: TRACKS.has(current.tracks) ? current.tracks : null,
    wake: WAKE_TIMES.has(current.wake) ? current.wake : null,
    bed: BED_TIMES.has(current.bed) ? current.bed : null,
    kept: kept.length ? kept : STARTER_BLOCK_KEYS.slice(),
  };
}

function saveDraft(draft) {
  if (!app.ui) return;
  app.ui.routineQuiz = draft;
}

export function maybeOfferRoutineQuiz() {
  if (!writesOpen() || !app.ui || app.ui.sheet) return false;
  const store = normalizeDailyRoutines(app.state && app.state.dailyRoutines);
  if (!store || !(store.blocks || []).some((block) => isLive(block))) return false;
  if (routineQuizSettled(store)) return false;
  app.ui.sheet = "routines-quiz";
  if (!app.ui.routineQuiz) app.ui.routineQuiz = freshDraft();
  return true;
}

function liveBlock(store, key) {
  const spec = STARTER_BLOCKS.find((block) => block.key === key);
  if (!spec) return null;
  return (store.blocks || []).find((block) => block && isLive(block) && block.name === spec.name) || null;
}

function alreadyPlaced(store, blockId, name) {
  const items = new Map((store.items || []).filter((item) => isLive(item)).map((item) => [item.id, item]));
  return (store.placements || []).some((row) => isLive(row) && row.blockId === blockId && items.get(row.itemId) && items.get(row.itemId).name === name);
}

function seedStarter(state, keys) {
  const wanted = new Set(keys);
  for (const [index, row] of GENERIC_STARTER_ITEMS.entries()) {
    if (!wanted.has(row.block)) continue;
    const store = normalizeDailyRoutines(state.dailyRoutines);
    if (!store) return false;
    const block = liveBlock(store, row.block);
    if (!block) continue;
    if (alreadyPlaced(store, block.id, row.name)) continue;
    /* Fixed ids, so two phones that both seed the same store converge on one
       copy at merge. A row that exists at all, even deleted, is left alone so
       a removed starter stays removed. */
    const itemId = `item_starter_${block.id}_${index}`;
    if ((store.items || []).some((item) => item && item.id === itemId)) continue;
    const added = addRoutineItem(state, block.id, {
      name: row.name,
      kind: "check",
      blockIds: [block.id],
      newItemId: itemId,
      newPlacementId: `place_starter_${block.id}_${index}`,
    });
    if (!added) return false;
  }
  return true;
}

function dropUnkept(state, keys) {
  const wanted = new Set(keys);
  const store = normalizeDailyRoutines(state.dailyRoutines);
  if (!store) return false;
  for (const spec of STARTER_BLOCKS) {
    if (wanted.has(spec.key)) continue;
    const block = (store.blocks || []).find((row) => row && isLive(row) && row.name === spec.name);
    if (!block) continue;
    if (!deleteRoutineBlock(state, block.id)) return false;
  }
  return true;
}

function writeQuiz(state, quiz) {
  const current = normalizeDailyRoutines(state.dailyRoutines);
  if (!current || routineQuizSettled(current)) return false;
  const at = quizStamp(current.updatedAt);
  let next = { ...current, updatedAt: at, quiz: { ...quiz, updatedAt: at } };
  const applied = applyStoredQuizStartTimes(next);
  if (applied && applied.applied && applied.store) next = applied.store;
  return putDailyRoutines(state, next);
}

export function skipRoutineQuiz(state) {
  if (!writesOpen() || !state || typeof state !== "object") return false;
  ensureRoutineShell(state);
  const current = normalizeDailyRoutines(state.dailyRoutines);
  if (!current || routineQuizSettled(current)) return false;
  if (!seedStarter(state, STARTER_BLOCK_KEYS)) return false;
  return writeQuiz(state, { status: "skipped", wake: null, bed: null, tracks: null, kept: null });
}

export function finishRoutineQuiz(state) {
  if (!writesOpen() || !state || typeof state !== "object") return false;
  const draft = draftOf();
  const kept = STARTER_BLOCK_KEYS.filter((key) => draft.kept.includes(key));
  if (!TRACKS.has(draft.tracks) || !WAKE_TIMES.has(draft.wake) || !BED_TIMES.has(draft.bed) || !kept.length) return false;
  ensureRoutineShell(state);
  const current = normalizeDailyRoutines(state.dailyRoutines);
  if (!current || routineQuizSettled(current)) return false;
  if (!dropUnkept(state, kept)) return false;
  if (!seedStarter(state, kept)) return false;
  return writeQuiz(state, { status: "done", wake: draft.wake, bed: draft.bed, tracks: draft.tracks, kept });
}

export function chooseRoutineQuiz(step, value) {
  if (!writesOpen() || !app.ui) return false;
  const draft = draftOf();
  switch (step) {
    case "tracks":
      if (draft.step !== "tracks" || !TRACKS.has(value)) return false;
      draft.tracks = value;
      draft.step = "wake";
      saveDraft(draft);
      return true;
    case "wake":
      if (draft.step !== "wake" || !WAKE_TIMES.has(value)) return false;
      draft.wake = value;
      draft.step = "bed";
      saveDraft(draft);
      return true;
    case "bed":
      if (draft.step !== "bed" || !BED_TIMES.has(value)) return false;
      draft.bed = value;
      draft.step = "blocks";
      saveDraft(draft);
      return true;
    default: {
      const unexpected = step;
      void unexpected;
      return false;
    }
  }
}

export function toggleRoutineQuizBlock(key) {
  if (!writesOpen() || !app.ui || !STARTER_BLOCK_KEYS.includes(key)) return false;
  const draft = draftOf();
  if (draft.step !== "blocks") return false;
  const has = draft.kept.includes(key);
  if (has && draft.kept.length === 1) return false;
  draft.kept = STARTER_BLOCK_KEYS.filter((row) => (row === key ? !has : draft.kept.includes(row)));
  saveDraft(draft);
  return true;
}

function choiceButtons(choices, action, field) {
  return `<div class="dr-quiz-choices">${choices.map((choice) =>
    `<button type="button" class="btn block" data-action="${action}" data-${field}="${esc(choice.value)}">${esc(choice.label)}</button>`
  ).join("")}</div>`;
}

function blockButtons(draft) {
  const toggles = STARTER_BLOCKS.map((block) => {
    const on = draft.kept.includes(block.key);
    return `<button type="button" class="btn block" data-action="routines-quiz-block" data-block="${esc(block.key)}" aria-pressed="${on ? "true" : "false"}">${esc(block.name)}</button>`;
  }).join("");
  return `<div class="dr-quiz-choices">${toggles}</div>
    <button type="button" class="btn primary block" data-action="routines-quiz-finish">Keep these</button>`;
}

function stepBody(draft) {
  switch (draft.step) {
    case "tracks":
      return {
        count: "1 of 4",
        title: "What do you want to track?",
        body: "Skip keeps the three starter blocks.",
        choices: choiceButtons(TRACK_CHOICES, "routines-quiz-tracks", "tracks"),
      };
    case "wake":
      return {
        count: "2 of 4",
        title: "What time do you wake?",
        body: "Saved with your routines.",
        choices: choiceButtons(WAKE_CHOICES, "routines-quiz-wake", "time"),
      };
    case "bed":
      return {
        count: "3 of 4",
        title: "What time do you go to bed?",
        body: "Saved with your routines.",
        choices: choiceButtons(BED_CHOICES, "routines-quiz-bed", "time"),
      };
    case "blocks":
      return {
        count: "4 of 4",
        title: "Which blocks should stay?",
        body: "Each block you keep gets a couple of generic checks.",
        choices: blockButtons(draft),
      };
    default: {
      const unexpected = draft.step;
      void unexpected;
      return { count: "1 of 4", title: "What do you want to track?", body: "Skip keeps the three starter blocks.", choices: choiceButtons(TRACK_CHOICES, "routines-quiz-tracks", "tracks") };
    }
  }
}

export function routineQuizSheetHTML() {
  const draft = draftOf();
  saveDraft(draft);
  const step = stepBody(draft);
  return `<div class="dr-quiz" data-quiz-step="${esc(draft.step)}">
    <p class="dr-quiz-count">${esc(step.count)}</p>
    <h3>${esc(step.title)}</h3>
    <p class="sub">${esc(step.body)}</p>
    ${step.choices}
    <button type="button" class="btn block dr-quiz-skip" data-action="routines-quiz-skip">Skip</button>
  </div>`;
}

app.maybeOfferRoutineQuiz = maybeOfferRoutineQuiz;
app.skipRoutineQuiz = skipRoutineQuiz;
app.finishRoutineQuiz = finishRoutineQuiz;
app.chooseRoutineQuiz = chooseRoutineQuiz;
app.toggleRoutineQuizBlock = toggleRoutineQuizBlock;
app.routineQuizSheetHTML = routineQuizSheetHTML;
app.routineQuizSettled = routineQuizSettled;
