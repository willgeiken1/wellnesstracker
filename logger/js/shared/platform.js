import { app } from "../runtime.js";

/* Install prompt and service worker registration. */
/* ================= Platform (iPhone / Android) ================= */
const IS_ANDROID = /Android/i.test(navigator.userAgent);
app.IS_ANDROID = IS_ANDROID;

const IS_IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
app.IS_IOS = IS_IOS;

let installPrompt = null;
app.installPrompt = installPrompt;

const SHELL_UPDATE_LABEL = "Update available, tap to refresh";
const SHELL_RELOAD_KEY = "insight-reloaded";
const SHELL_WORKOUT_KEY = "insight-workout-reload";
app.SHELL_UPDATE_LABEL = SHELL_UPDATE_LABEL;

let waitingWorker = null;
let reloadArmed = false;
let reloaded = false;

const DRAFT_TEXT = ["w", "r", "wR", "rR", "note"];

function draftNameOk(name) {
  return typeof name === "string" && name.length > 0 && name.length <= 80
    && name !== "__proto__" && name !== "constructor" && name !== "prototype";
}

function cleanDraft(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const key of DRAFT_TEXT) {
    if (raw[key] == null) continue;
    const value = String(raw[key]).slice(0, 200);
    if (value) out[key] = value;
  }
  if (raw.tag === "warmup" || raw.tag === "failure") out.tag = raw.tag;
  if (Number.isInteger(raw.rpe) && raw.rpe >= 6 && raw.rpe <= 10) out.rpe = raw.rpe;
  return out;
}

/* The open workout, including a routine and whatever is sitting in the set fields. */
function workoutReloadRecord(ui, session, fields) {
  if (!ui || !ui.workoutOpen || !session || session.finishedAt || !session.id) return null;
  const drafts = {};
  const src = ui.drafts && typeof ui.drafts === "object" ? ui.drafts : {};
  for (const name of Object.keys(src)) {
    if (!draftNameOk(name)) continue;
    const cleaned = cleanDraft(src[name]);
    if (Object.keys(cleaned).length) drafts[name] = cleaned;
  }
  for (const field of Array.isArray(fields) ? fields : []) {
    if (!field || !draftNameOk(field.name) || typeof field.field !== "string") continue;
    const cleaned = cleanDraft({ [field.field]: field.value });
    const current = { ...(drafts[field.name] || {}) };
    if (cleaned[field.field] == null) delete current[field.field];
    else current[field.field] = cleaned[field.field];
    if (Object.keys(current).length) drafts[field.name] = current;
    else delete drafts[field.name];
  }
  return {
    sessionId: String(session.id),
    workoutOpen: true,
    open: Number.isInteger(ui.open) && ui.open >= 0 ? ui.open : null,
    drafts,
  };
}
app.workoutReloadRecord = workoutReloadRecord;

function applyWorkoutReload(ui, session, record) {
  if (!ui || !record || record.workoutOpen !== true || !session || session.finishedAt) return false;
  if (!record.sessionId || record.sessionId !== session.id) return false;
  ui.workoutOpen = true;
  if (Number.isInteger(record.open) && record.open >= 0) ui.open = record.open;
  const incoming = record.drafts && typeof record.drafts === "object" ? record.drafts : {};
  ui.drafts = ui.drafts && typeof ui.drafts === "object" ? ui.drafts : {};
  for (const name of Object.keys(incoming)) {
    if (!draftNameOk(name)) continue;
    const cleaned = cleanDraft(incoming[name]);
    if (Object.keys(cleaned).length) ui.drafts[name] = { ...(ui.drafts[name] || {}), ...cleaned };
  }
  return true;
}
app.applyWorkoutReload = applyWorkoutReload;

function shellStorage() {
  try {
    if (typeof sessionStorage === "undefined" || !sessionStorage) return null;
    return sessionStorage;
  } catch (e) {
    return null;
  }
}

function fieldsInWorkout(doc, session) {
  if (!doc || typeof doc.querySelectorAll !== "function" || !session || typeof app.liveExercises !== "function") return [];
  let list = [];
  try { list = app.liveExercises(session) || []; } catch (e) { return []; }
  const nodes = doc.querySelectorAll("#workout [data-field]");
  if (!nodes || typeof nodes.forEach !== "function") return [];
  const out = [];
  nodes.forEach((el) => {
    const tag = String((el && el.tagName) || "").toUpperCase();
    if (tag !== "INPUT" && tag !== "TEXTAREA") return;
    const i = el && el.dataset ? +el.dataset.i : NaN;
    const name = list[i] && list[i].name;
    const field = el && el.dataset && el.dataset.field;
    if (!name || !field) return;
    out.push({ name, field, value: el.value == null ? "" : String(el.value) });
  });
  return out;
}

function rememberWorkoutReload(doc) {
  const session = typeof app.activeSession === "function" ? app.activeSession() : null;
  const record = workoutReloadRecord(app.ui, session, fieldsInWorkout(doc, session));
  const store = shellStorage();
  if (!store) return record;
  try {
    if (!record) store.removeItem(SHELL_WORKOUT_KEY);
    else store.setItem(SHELL_WORKOUT_KEY, JSON.stringify(record));
  } catch (e) {}
  return record;
}
app.rememberWorkoutReload = rememberWorkoutReload;

function restoreWorkoutReload() {
  const store = shellStorage();
  if (!store) return false;
  let raw = null;
  try {
    raw = store.getItem(SHELL_WORKOUT_KEY);
    store.removeItem(SHELL_WORKOUT_KEY);
  } catch (e) {
    return false;
  }
  if (!raw) return false;
  let record = null;
  try { record = JSON.parse(raw); } catch (e) { return false; }
  const session = typeof app.activeSession === "function" ? app.activeSession() : null;
  return applyWorkoutReload(app.ui, session, record);
}
app.restoreWorkoutReload = restoreWorkoutReload;

function sessionInProgress(state) {
  const sessions = state && state.sessions;
  return Array.isArray(sessions) && sessions.some((s) => s && !s.finishedAt);
}
app.sessionInProgress = sessionInProgress;

/* True when a service-worker reload would not lose anything the user is doing. */
function reloadSafeNow(doc, ui, state) {
  const el = doc && doc.activeElement;
  if (el) {
    const tag = String(el.tagName || "").toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable) return false;
  }
  if (ui && ui.sheet) return false;
  if (doc && typeof doc.querySelector === "function" && doc.querySelector(".sheet-card, dialog[open], #dialog .dlg")) return false;
  if (sessionInProgress(state)) return false;
  return true;
}
app.reloadSafeNow = reloadSafeNow;

function resetShellUpdate() {
  waitingWorker = null;
  reloadArmed = false;
  reloaded = false;
}
app.resetShellUpdate = resetShellUpdate;

function shellReloadArmed() {
  return reloadArmed;
}
app.shellReloadArmed = shellReloadArmed;

/* A first install has no controller, so it is not an update. The active worker is not waiting. */
function waitingShellWorker(reg, worker, controller) {
  const candidate = (reg && reg.waiting) || (worker && worker.state === "installed" ? worker : null);
  if (!candidate || !controller || candidate === controller) return null;
  if (reg && reg.active && candidate === reg.active) return null;
  return candidate;
}
app.waitingShellWorker = waitingShellWorker;

function shellUpdateBanner(doc) {
  const root = doc || document;
  if (!root || typeof root.getElementById !== "function") return null;
  let el = root.getElementById("sw-update");
  if (!el && typeof root.createElement === "function" && root.body) {
    el = root.createElement("button");
    el.id = "sw-update";
    el.type = "button";
    el.className = "shell-update";
    el.hidden = true;
    el.textContent = SHELL_UPDATE_LABEL;
    if (el.setAttribute) el.setAttribute("aria-live", "polite");
    root.body.appendChild(el);
  }
  if (el && el.dataset && !el.dataset.swBound && typeof el.addEventListener === "function") {
    el.dataset.swBound = "1";
    el.addEventListener("click", () => { applyShellUpdate(); });
  }
  return el;
}

function markShellUpdate(doc, on) {
  const body = doc && doc.body;
  if (!body || !body.classList || typeof body.classList.toggle !== "function") return;
  body.classList.toggle("shell-update", !!on);
}

/* Keeps the chip below the sticky workout header, where Cancel and Finish sit. */
function placeShellUpdate(doc) {
  const root = doc || (typeof document !== "undefined" ? document : null);
  const style = root && root.documentElement && root.documentElement.style;
  if (!style || typeof style.setProperty !== "function" || typeof root.querySelector !== "function") return false;
  const body = root.body;
  const inWorkout = !!(body && body.classList && body.classList.contains("in-workout"));
  const inCardio = !!(body && body.classList && body.classList.contains("in-cardio"));
  const workout = root.querySelector("#workout");
  const cardio = root.querySelector("#cardio-live");
  let bar = null;
  if (inWorkout && workout && !workout.hidden) bar = root.querySelector("#workout .wo-top");
  else if (inCardio && cardio && !cardio.hidden) bar = root.querySelector("#cardio-live .wo-top");
  if (!bar || typeof bar.getBoundingClientRect !== "function") {
    if (typeof style.removeProperty === "function") style.removeProperty("--shell-update-clear");
    return false;
  }
  const bottom = bar.getBoundingClientRect().bottom;
  if (!(bottom > 0)) return false;
  style.setProperty("--shell-update-clear", `${Math.round(bottom + 8)}px`);
  return true;
}
app.placeShellUpdate = placeShellUpdate;

function presentShellUpdate(worker, controller, doc) {
  const banner = shellUpdateBanner(doc);
  if (!worker || !controller || worker === controller) {
    waitingWorker = null;
    if (banner) banner.hidden = true;
    markShellUpdate(doc, false);
    return false;
  }
  waitingWorker = worker;
  if (banner) {
    banner.hidden = false;
    banner.textContent = SHELL_UPDATE_LABEL;
  }
  markShellUpdate(doc, !!banner);
  placeShellUpdate(doc);
  return true;
}
app.presentShellUpdate = presentShellUpdate;

function applyShellUpdate(worker) {
  const target = worker || waitingWorker;
  if (!target || typeof target.postMessage !== "function") return false;
  reloadArmed = true;
  target.postMessage({ type: "SKIP_WAITING" });
  return true;
}
app.applyShellUpdate = applyShellUpdate;

function onShellControllerChange() {
  if (!reloadArmed || reloaded) return false;
  try {
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(SHELL_RELOAD_KEY) === "1") return false;
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(SHELL_RELOAD_KEY, "1");
  } catch (e) {}
  reloaded = true;
  try { rememberWorkoutReload(typeof document !== "undefined" ? document : null); } catch (e) {}
  location.reload();
  return true;
}
app.onShellControllerChange = onShellControllerChange;

window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); app.installPrompt = e; if (app.ui.tab === "settings") app.render(); });

window.addEventListener("appinstalled", () => { app.installPrompt = null; app.toast("Insight is installed. Open it from your home screen."); if (app.ui.tab === "settings") app.render(); });

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  // A previous tap may have set this before navigation. Clear it so the next
  // accepted update can reload once. The flag still blocks a second reload
  // on the page that requested it.
  try { sessionStorage.removeItem(SHELL_RELOAD_KEY); } catch (e) {}
  const consider = (reg, worker) => {
    const waiting = waitingShellWorker(reg, worker, navigator.serviceWorker.controller);
    // Showing the banner does not apply the update. A live session stays put until the tap.
    presentShellUpdate(waiting, waiting && navigator.serviceWorker.controller, document);
  };
  const followed = new WeakSet();
  const follow = (reg, worker) => {
    if (!worker || followed.has(worker)) return;
    followed.add(worker);
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed") consider(reg, worker);
      else if ((worker.state === "activated" || worker.state === "redundant") && !reg.waiting) consider(reg, null);
    });
  };
  const watch = (reg) => {
    consider(reg, reg.waiting);
    follow(reg, reg.installing);
    follow(reg, reg.waiting);
    reg.addEventListener("updatefound", () => follow(reg, reg.installing));
  };
  navigator.serviceWorker.addEventListener("controllerchange", () => { onShellControllerChange(); });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").then(watch).catch(() => {});
  });
}

restoreWorkoutReload();

function cameraBlockedText() {
  return app.IS_ANDROID
    ? "Camera access is turned off. In Chrome, tap the icon next to the web address (or open the app's settings) and allow Camera, or type the number under the barcode instead."
    : "Camera access is turned off for this app. Allow it in your iPhone's Settings → Safari → Camera, or type the number under the barcode instead.";
}
app.cameraBlockedText = cameraBlockedText;
