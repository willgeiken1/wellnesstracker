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
    if (app.audio.state === "suspended") app.audio.resume();
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
}
app.tick = tick;

setInterval(app.tick, 500);

let lastWake = 0;
app.lastWake = lastWake;

document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  app.render();
  if (Date.now() - app.lastWake > 60_000) { app.lastWake = Date.now(); try { app.cloudPull().then(() => app.ouraRefresh(false)).then(() => app.syncPhotos()); } catch (e) {} }
});
