import { app } from "../runtime.js";

/* Rest timer. */
/* ================= Rest timer ================= */
const timer = { end: 0, total: 0, done: false };
app.timer = timer;

let audio = null;
app.audio = audio;

function ensureAudio() {
  try {
    if (!app.audio) app.audio = new (window.AudioContext || window.webkitAudioContext)();
    if (app.audio.state === "suspended") {
      const pending = app.audio.resume();
      if (pending && typeof pending.catch === "function") pending.catch(() => { app.audio = null; });
    }
  } catch (e) { app.audio = null; }
}
app.ensureAudio = ensureAudio;

function beep() {
  try { if (navigator.vibrate) navigator.vibrate([220, 120, 220]); } catch (e) {}
  if (!app.audio) return;
  const t0 = app.audio.currentTime;
  [0, 0.25, 0.5].forEach((off) => {
    const o = app.audio.createOscillator(), g = app.audio.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, t0 + off);
    g.gain.exponentialRampToValueAtTime(0.3, t0 + off + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + off + 0.18);
    o.connect(g).connect(app.audio.destination);
    o.start(t0 + off); o.stop(t0 + off + 0.2);
  });
}
app.beep = beep;

function startTimer() { app.timer.total = app.state.restSeconds; app.timer.end = Date.now() + app.timer.total * 1000; app.timer.done = false; app.tick(); }
app.startTimer = startTimer;

function stopTimer() { app.timer.end = 0; app.timer.done = false; app.tick(); }
app.stopTimer = stopTimer;

function tick() {
  app.tickCardio();
  const s = app.activeSession();
  const el = app.$("#timer");
  document.body.classList.toggle("timer-on", !!(app.timer.end && s));
  if (!app.timer.end || !s) { el.hidden = true; }
  else {
    el.hidden = false;
    const left = Math.max(0, Math.ceil((app.timer.end - Date.now()) / 1000));
    if (left === 0 && !app.timer.done) { app.timer.done = true; app.beep(); }
    el.classList.toggle("done", app.timer.done);
    app.$("#timer-lbl").textContent = app.timer.done ? "Rest done" : "Rest";
    app.$("#timer-time").textContent = app.timer.done ? "Go" : app.fmtTime(left);
    app.$("#t-skip").textContent = app.timer.done ? "Dismiss" : "Skip";
    app.$("#timer-bar").style.transform = `scaleX(${app.timer.done ? 0 : Math.min(1, left / app.timer.total)})`;
  }
  const el2 = app.$("#elapsed");
  if (el2 && s && s.startedAt) {
    const sec = Math.floor((Date.now() - new Date(s.startedAt)) / 1000);
    el2.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")} elapsed · ${app.pl(app.setCount(s), "set")}`;
  }
  if (typeof app.refreshHomeRoutineGates === "function") app.refreshHomeRoutineGates();
}
app.tick = tick;

setInterval(app.tick, 500);

let lastWake = 0;
app.lastWake = lastWake;

/* Coming back to the app refreshes the page, but never under the user's hands: an open sheet,
   a focused field, or the live workout or cardio screen stays as it is, and only the clocks tick. */
function busyOnReturn() {
  if (app.ui && (app.ui.sheet || app.ui.workoutOpen || app.ui.cardioOpen)) return true;
  const a = document.activeElement;
  if (a && a !== document.body && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return true;
  const dlg = document.getElementById("dialog");
  return !!(dlg && !dlg.hidden);
}
app.busyOnReturn = busyOnReturn;

document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  if (busyOnReturn()) app.tick();
  else app.render();
  if (Date.now() - app.lastWake > 60_000) { app.lastWake = Date.now(); try { app.cloudPull().then(() => app.ouraRefresh(false)).then(() => app.syncPhotos()); } catch (e) {} }
});

/* The iPhone keyboard covers the page without shrinking it, so a sheet's fields sat behind it.
   Track the visible area and lift the sheet by the keyboard's height. Small changes (the
   address bar) are ignored. */
const KEYBOARD_MIN_PX = 80;
export function keyboardInset(innerHeight, vvHeight, vvOffsetTop) {
  const kb = Math.round(innerHeight - vvHeight - (vvOffsetTop || 0));
  return kb > KEYBOARD_MIN_PX ? kb : 0;
}
app.keyboardInset = keyboardInset;

function syncKeyboard() {
  const vv = window.visualViewport;
  if (!vv || !document.documentElement || !document.documentElement.style) return;
  const style = document.documentElement.style;
  style.setProperty("--kb", keyboardInset(window.innerHeight, vv.height, vv.offsetTop) + "px");
  style.setProperty("--vvh", Math.round(vv.height) + "px");
}
app.syncKeyboard = syncKeyboard;

if (typeof window !== "undefined" && window.visualViewport && typeof window.visualViewport.addEventListener === "function") {
  window.visualViewport.addEventListener("resize", syncKeyboard);
  window.visualViewport.addEventListener("scroll", syncKeyboard);
}

/* Once the keyboard is up, bring the focused field into view inside its sheet. */
document.addEventListener("focusin", (ev) => {
  const t = ev.target;
  if (!t || typeof t.closest !== "function" || !t.closest(".sheet-card")) return;
  if (!/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !t.isContentEditable) return;
  setTimeout(() => {
    if (document.activeElement === t && typeof t.scrollIntoView === "function") t.scrollIntoView({ block: "nearest" });
  }, 320);
});
