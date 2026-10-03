import { app } from "../runtime.js";

/* Install prompt and service worker registration. */
/* ================= Platform (iPhone / Android) ================= */
const IS_ANDROID = /Android/i.test(navigator.userAgent);
app.IS_ANDROID = IS_ANDROID;

const IS_IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
app.IS_IOS = IS_IOS;

let installPrompt = null;
app.installPrompt = installPrompt;

window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); app.installPrompt = e; if (app.ui.tab === "settings") app.render(); });

window.addEventListener("appinstalled", () => { app.installPrompt = null; app.toast("Insight is installed. Open it from your home screen."); if (app.ui.tab === "settings") app.render(); });

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
}

function cameraBlockedText() {
  return app.IS_ANDROID
    ? "Camera access is turned off. In Chrome, tap the icon next to the web address (or open the app's settings) and allow Camera, or type the number under the barcode instead."
    : "Camera access is turned off for this app. Allow it in your iPhone's Settings → Safari → Camera, or type the number under the barcode instead.";
}
app.cameraBlockedText = cameraBlockedText;
