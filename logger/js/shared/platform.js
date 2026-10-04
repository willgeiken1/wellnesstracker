import { app } from "../runtime.js";

/* Install prompt and service worker registration. */
/* ================= Platform (iPhone / Android) ================= */
const IS_ANDROID = /Android/i.test(navigator.userAgent);
app.IS_ANDROID = IS_ANDROID;

const IS_IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
app.IS_IOS = IS_IOS;

let installPrompt = null;
app.installPrompt = installPrompt;

/* True when a service-worker reload would not lose anything the user is doing. */
function reloadSafeNow(doc, ui, state) {
  const el = doc && doc.activeElement;
  if (el) {
    const tag = String(el.tagName || "").toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable) return false;
  }
  if (ui && ui.sheet) return false;
  if (doc && typeof doc.querySelector === "function" && doc.querySelector(".sheet-card, dialog[open], #dialog .dlg")) return false;
  const sessions = state && state.sessions;
  if (Array.isArray(sessions) && sessions.some((s) => s && !s.finishedAt)) return false;
  return true;
}
app.reloadSafeNow = reloadSafeNow;

window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); app.installPrompt = e; if (app.ui.tab === "settings") app.render(); });

window.addEventListener("appinstalled", () => { app.installPrompt = null; app.toast("Insight is installed. Open it from your home screen."); if (app.ui.tab === "settings") app.render(); });

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  // Reload once when an already-controlling worker is replaced, so an open
  // home-screen install picks up a new shell instead of keeping the old page.
  try { sessionStorage.removeItem("insight-reloaded"); } catch (e) {}
  const hadWorker = !!navigator.serviceWorker.controller;
  let waiting = false;
  const reloadNow = () => {
    try {
      if (sessionStorage.getItem("insight-reloaded")) return;
      sessionStorage.setItem("insight-reloaded", "1");
    } catch (e) {}
    location.reload();
  };
  // Never reload under half-typed input, an open sheet or dialog, or a workout in progress.
  // Wait for the page to be hidden, or for focus to leave and everything to close.
  const reloadWhenSafe = () => {
    if (app.reloadSafeNow(document, app.ui, app.state)) { reloadNow(); return; }
    if (waiting) return;
    waiting = true;
    let timer = null;
    const recheck = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (app.reloadSafeNow(document, app.ui, app.state)) reloadNow(); }, 400);
    };
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") reloadNow(); });
    document.addEventListener("focusout", recheck);
    setInterval(recheck, 3000);
  };
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadWorker) return;
    reloadWhenSafe();
  });
  window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
}

function cameraBlockedText() {
  return app.IS_ANDROID
    ? "Camera access is turned off. In Chrome, tap the icon next to the web address (or open the app's settings) and allow Camera, or type the number under the barcode instead."
    : "Camera access is turned off for this app. Allow it in your iPhone's Settings → Safari → Camera, or type the number under the barcode instead.";
}
app.cameraBlockedText = cameraBlockedText;
