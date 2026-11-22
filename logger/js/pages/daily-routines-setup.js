import { app } from "../runtime.js";
import { canMutateRoutines } from "../shared/daily-routines-store.js";
import {
  askedQuestions,
  normalizeSetupAnswers,
  readSetup,
  setupChoices,
  setupQuestion,
} from "../shared/routine-setup.js";

/* The Routines setup sheet. It opens by itself the first time Routines is
   on screen for an account that has neither finished nor skipped setup.
   One question shows at a time. Closing the sheet leaves setup unsettled and
   puts a "Finish setting up" card on the page; only Finish or Skip setup
   saves anything. The settings sheet reopens it to change one answer or to
   take it again. */

const EXCLUSIVE = Object.freeze({ goals: "looking", track: "habits", watch: "none" });

function esc(value) {
  if (typeof app.esc === "function") return app.esc(value);
  return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function prefsNow() {
  return app.state && app.state.dailyRoutines && app.state.dailyRoutines.prefs;
}

function writesOpen() {
  return app.ROUTINES_ENABLED === true && canMutateRoutines() && !(app.sb && app.cloudPullOk !== true);
}

function draft() {
  const current = app.ui && app.ui.routineSetupDraft;
  return current && typeof current === "object" ? current : null;
}

/* Only the answers to questions this person is still asked are kept, so an
   answer left behind by an earlier pick cannot shape the page. */
export function pruneSetupAnswers(raw) {
  const answers = normalizeSetupAnswers(raw);
  const asked = new Set(askedQuestions(answers));
  const out = {};
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

export function openRoutineSetup(mode = "quiz", questionId = null) {
  if (!writesOpen() || !app.ui) return false;
  const setup = readSetup(prefsNow());
  const saved = setup && setup.status === "done" ? setup.answers : {};
  const prior = draft();
  if (mode === "edit") {
    if (!setup || setup.status !== "done" || !setupQuestion(questionId)) return false;
    app.ui.routineSetupDraft = { mode: "edit", step: questionId, answers: { ...saved } };
  } else if (mode === "retake") {
    app.ui.routineSetupDraft = { mode: "retake", step: "goals", answers: { ...saved } };
  } else if (!prior || prior.mode !== "quiz") {
    app.ui.routineSetupDraft = { mode: "quiz", step: "goals", answers: {} };
  }
  app.ui.routineSetupLater = false;
  app.ui.routineSetupError = false;
  app.ui.sheet = "routines-setup";
  app.ui.sd = {};
  return true;
}

/* Called on each real render, after the page is painted for the tab on
   screen. A neighbour pane painted during a swipe never reaches this. */
export function maybeOfferRoutineSetup() {
  if (!app.ui || app.ui.tab !== "daily-routines" || app.ui.sheet) return false;
  if (app.ui.routineSetupLater === true || app.ui.dailyRoutineEdit === true || app.ui.workoutOpen) return false;
  if (!writesOpen() || !app.state || !app.state.dailyRoutines) return false;
  if (readSetup(app.state.dailyRoutines.prefs)) return false;
  return openRoutineSetup("quiz");
}

function steps(answers) {
  return askedQuestions(answers);
}

/* A first pass runs every answer's one-time effects. A retake runs only the
   ones whose answer changed, so a Focus mode switched by hand since then is
   left alone. */
function touchedBy(current, answers) {
  if (!current || current.mode === "quiz") return null;
  if (current.mode === "edit") return [current.step];
  const setup = readSetup(prefsNow());
  const before = setup && setup.status === "done" ? setup.answers : {};
  const ids = new Set([...Object.keys(before), ...Object.keys(answers)]);
  return [...ids].filter((id) => JSON.stringify(before[id]) !== JSON.stringify(answers[id]));
}

function finish(status) {
  const current = draft();
  const answers = status === "done" && current ? pruneSetupAnswers(current.answers) : {};
  const touched = touchedBy(current, answers);
  const ok = typeof app.saveRoutineSetup === "function" && app.saveRoutineSetup(app.state, { status, answers, touched });
  if (!ok) {
    /* Nothing was saved. Say so, and step out of the sheet if writes have
       closed (signed out, or the account is syncing again). */
    app.ui.routineAnnounce = "Your setup couldn't be saved right now. Try again in a moment.";
    if (!writesOpen()) {
      app.ui.sheet = null;
      app.ui.sd = {};
      app.ui.routineSetupLater = true;
    }
    app.ui.routineSetupError = true;
    return true;
  }
  app.ui.routineSetupError = false;
  const back = current && current.mode === "edit";
  app.ui.routineSetupDraft = null;
  app.ui.routineSetupLater = false;
  app.ui.sheet = back ? "routines-settings" : null;
  app.ui.sd = {};
  app.ui.routineAnnounce = back ? "Setup answer saved."
    : status === "done" ? "Your Routines page is set up."
      : "Setup skipped. You can set up your page from Routines settings.";
  if (typeof app.save === "function") app.save();
  return true;
}

function advance() {
  const current = draft();
  if (!current) return false;
  if (current.mode === "edit") return finish("done");
  const list = steps(current.answers);
  const index = list.indexOf(current.step);
  const next = index >= 0 ? list[index + 1] : list[0];
  if (!next) return finish("done");
  current.step = next;
  return true;
}

export function pickRoutineSetup(questionId, value) {
  const current = draft();
  const question = setupQuestion(questionId);
  if (!current || !question || current.step !== questionId) return false;
  if (!setupChoices(questionId, current.answers).some((choice) => choice.value === value)) return false;
  if (!question.multi) {
    current.answers = { ...current.answers, [questionId]: value };
    return advance();
  }
  const picked = Array.isArray(current.answers[questionId]) ? current.answers[questionId].slice() : [];
  const only = EXCLUSIVE[questionId];
  let next;
  if (picked.includes(value)) next = picked.filter((key) => key !== value);
  else if (value === only) next = [value];
  else next = picked.filter((key) => key !== only).concat(value);
  const answers = { ...current.answers };
  if (next.length) answers[questionId] = next;
  else delete answers[questionId];
  current.answers = answers;
  return true;
}

export function nextRoutineSetup() {
  const current = draft();
  if (!current) return false;
  const value = current.answers[current.step];
  if (!Array.isArray(value) || !value.length) return false;
  return advance();
}

export function skipRoutineSetupQuestion() {
  const current = draft();
  if (!current) return false;
  const answers = { ...current.answers };
  delete answers[current.step];
  current.answers = answers;
  return advance();
}

export function backRoutineSetup() {
  const current = draft();
  if (!current || current.mode === "edit") return false;
  const list = steps(current.answers);
  const index = list.indexOf(current.step);
  if (index <= 0) return false;
  current.step = list[index - 1];
  return true;
}

export function skipRoutineSetup() {
  return finish("skipped");
}

/* × or a tap outside: nothing is saved and setup stays open for later. */
export function closeRoutineSetup() {
  const current = draft();
  const edit = current && current.mode === "edit";
  app.ui.sheet = edit ? "routines-settings" : null;
  app.ui.sd = {};
  if (current && current.mode !== "quiz") app.ui.routineSetupDraft = null;
  if (!edit && !readSetup(prefsNow())) app.ui.routineSetupLater = true;
  return true;
}

export function routineSetupSheetHTML() {
  const current = draft();
  if (!current) return `<h3>Set up Routines</h3><p class="sub">Open Routines to set up your page.</p>`;
  const question = setupQuestion(current.step) || setupQuestion("goals");
  const answers = current.answers || {};
  const list = steps(answers);
  const index = Math.max(0, list.indexOf(question.id));
  const value = answers[question.id];
  const pressed = (key) => (Array.isArray(value) ? value.includes(key) : value === key);
  const choices = setupChoices(question.id, answers).map((choice) => `<button type="button" class="dr-setup-choice" data-action="routines-setup-pick" data-q="${esc(question.id)}" data-value="${esc(choice.value)}" aria-pressed="${pressed(choice.value) ? "true" : "false"}">${esc(choice.label)}</button>`).join("");
  const edit = current.mode === "edit";
  const kicker = edit ? "Change answer" : `Question ${index + 1} of ${list.length}`;
  const picked = Array.isArray(value) && value.length > 0;
  const next = question.multi
    ? `<button type="button" class="btn primary block" data-action="routines-setup-next"${picked ? "" : " disabled"}>${edit ? "Save" : "Next"}</button>`
    : "";
  const back = !edit && index > 0 ? `<button type="button" class="btn" data-action="routines-setup-back">Back</button>` : "";
  const skipQ = edit ? "" : `<button type="button" class="btn" data-action="routines-setup-skip-q">Skip this question</button>`;
  const skipAll = current.mode === "quiz" && index === 0
    ? `<button type="button" class="dr-setup-skip" data-action="routines-setup-skip">Skip setup</button>`
    : "";
  const intro = current.mode === "quiz" && index === 0
    ? `<p class="sub">Your answers decide what this page shows. Nothing is hidden for good, and you can change any answer in Routines settings.</p>`
    : "";
  const error = app.ui && app.ui.routineSetupError === true
    ? `<p class="dr-setup-error" role="alert">Your setup couldn't be saved right now. Try again in a moment.</p>`
    : "";
  return `<p class="dr-setup-k">${esc(kicker)}</p>
    <h3 id="dr-setup-title" tabindex="-1">${esc(question.title)}</h3>
    ${error}
    ${intro}
    ${question.hint ? `<p class="sub">${esc(question.hint)}</p>` : ""}
    <div class="dr-setup-choices" role="group" aria-labelledby="dr-setup-title">${choices}</div>
    ${next}
    <div class="dr-setup-nav">${back}${skipQ}</div>
    ${skipAll}`;
}

app.openRoutineSetup = openRoutineSetup;
app.maybeOfferRoutineSetup = maybeOfferRoutineSetup;
app.pickRoutineSetup = pickRoutineSetup;
app.nextRoutineSetup = nextRoutineSetup;
app.skipRoutineSetupQuestion = skipRoutineSetupQuestion;
app.backRoutineSetup = backRoutineSetup;
app.skipRoutineSetup = skipRoutineSetup;
app.closeRoutineSetup = closeRoutineSetup;
app.routineSetupSheetHTML = routineSetupSheetHTML;
