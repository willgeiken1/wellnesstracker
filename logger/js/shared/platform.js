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
app.SHELL_UPDATE_LABEL = SHELL_UPDATE_LABEL;

let waitingWorker = null;
let reloadArmed = false;
let reloaded = false;

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

function presentShellUpdate(worker, controller, doc) {
  const banner = shellUpdateBanner(doc);
  if (!worker || !controller || worker === controller) {
    waitingWorker = null;
    if (banner) banner.hidden = true;
    return false;
  }
  waitingWorker = worker;
  if (banner) {
    banner.hidden = false;
    banner.textContent = SHELL_UPDATE_LABEL;
  }
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

function cameraBlockedText() {
  return app.IS_ANDROID
    ? "Camera access is turned off. In Chrome, tap the icon next to the web address (or open the app's settings) and allow Camera, or type the number under the barcode instead."
    : "Camera access is turned off for this app. Allow it in your iPhone's Settings → Safari → Camera, or type the number under the barcode instead.";
}
app.cameraBlockedText = cameraBlockedText;
