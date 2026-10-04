import { app } from "../runtime.js";
import { applyPurges, buildExportFiles, coveredBy, mergeCheckins, stripRange, unionPurges, validDay, zipStore } from "../shared/purge.js";

/* Privacy center: export, date-range delete, account delete, and app lock. */

app.stripRange = stripRange;
app.applyPurges = applyPurges;
app.unionPurges = unionPurges;
app.mergeCheckins = mergeCheckins;
app.datePurged = (day) => coveredBy(app.state && app.state.purges, day);

function needsLock() {
  const L = app.state && app.state.appLock;
  if (!L || !L.enabled) return false;
  try { if (sessionStorage.getItem("insight-unlocked") === "1") return false; } catch (e) {}
  return true;
}
app.needsLock = needsLock;

function markUnlocked() {
  try { sessionStorage.setItem("insight-unlocked", "1"); } catch (e) {}
  app.lockPrompted = false;
  app.ui.lockMode = "main";
  app.ui.lockMsg = "";
  document.documentElement.classList.remove("lock-first");
  if (app.checkProfileGate) app.checkProfileGate();
  app.render();
}
app.markUnlocked = markUnlocked;

function lockState() {
  if (!app.state.appLock || typeof app.state.appLock !== "object") app.state.appLock = { enabled: false, updatedAt: 0 };
  return app.state.appLock;
}
app.lockState = lockState;

function usageRow() {
  const on = app.usageSharingOn ? app.usageSharingOn() : true;
  return `<div class="set-row usage-row">
      <span class="usage-copy"><b>Share anonymous usage data</b><span class="sub">Crash reports and which features get used. No workouts, food, notes, photos, or email.</span></span>
      <button type="button" class="switch" role="switch" aria-checked="${on ? "true" : "false"}" data-action="usage-share" aria-label="Share anonymous usage data"><i></i></button>
    </div>`;
}

function privacySectionHTML() {
  const L = app.lockState();
  const how = !L.enabled ? "Off" : L.method === "passcode" ? "On · passcode" : "On · Face ID or device passcode";
  return `<div class="group-label">Privacy</div>
    <div class="card priv-intro">
      <h4>Your data stays yours</h4>
      <p class="sub">Insight doesn't sell it or show ads. Other people using the app can't see your logs. A meal photo, the note you add to it, or a written description of a meal is sent to Anthropic only to estimate nutrition.</p>
      <button class="link-inline" data-action="priv-summary">What we store and who sees it</button>
    </div>
    <div class="group">
      ${usageRow()}
      <button class="set-row" data-action="priv-export"><span>Export my data</span><span class="sub">CSV zip</span></button>
      <button class="set-row" data-action="priv-range"><span>Delete a date range</span>${app.I.chevR}</button>
      <button class="set-row" data-action="priv-lock"><span>App lock</span><span class="sub">${how}</span></button>
      <button class="set-row" data-action="priv-delete"><span class="danger-t">Delete account</span><span class="sub">Permanent</span></button>
    </div>
    <p class="hint">App lock asks for Face ID, Touch ID, or your device passcode when Insight opens. Signing in again still opens the app if that isn't available. Full policy: <a href="../privacy.md" target="_blank" rel="noopener">privacy.md</a>.</p>`;
}
app.privacySectionHTML = privacySectionHTML;

function summarySheetHTML() {
  return `<h3>What we store</h3>
    <p class="sub">Plain version. The full policy is <a href="../privacy.md" target="_blank" rel="noopener">privacy.md</a>.</p>
    <div class="priv-block"><b>On this phone and in your account</b><p class="sub">Your email and password (the password isn't stored in a readable form). Profile, weigh-ins, workouts, sets, routines, food logs, cardio, measurements, goals, settings, and progress photos you choose to add.</p></div>
    <div class="priv-block"><b>Oura, if you connect it</b><p class="sub">Sleep, readiness, HRV, resting heart rate, temperature, and steps. The login that fetches this sits in a private table the app itself can't read.</p></div>
    <div class="priv-block"><b>Who else sees it</b><p class="sub">Supabase holds the account, backup, and photos. Anthropic receives a meal photo and any note you type with it, and a written meal description if you submit one for an estimate. Insight doesn't keep that photo. Open Food Facts receives a barcode number when you look one up. Oura sends ring data only after you connect. Sentry, hosted in the US, gets a crash report: what broke, the device and browser, and your anonymous account id if you're signed in. No health data, and IP addresses aren't stored. PostHog, hosted in the US, gets anonymous notes about which features get used, from a short fixed list, with no health values. It discards IP data and doesn't record the screen. Both follow Share anonymous usage data. That switch is on unless you turn it off, and the choice stays on this phone. Nobody else using Insight can open your logs. We don't sell data or show ads.</p></div>
    <div class="priv-block"><b>Your choices</b><p class="sub">Turn off Share anonymous usage data to stop crash reports and those feature notes. Export a zip of CSV files, delete the logs between two dates, or delete the whole account. App lock stays on this device. We never receive your face, fingerprint, or device passcode.</p></div>`;
}
app.summarySheetHTML = summarySheetHTML;

function rangeCounts(from, to) {
  if (!validDay(from) || !validDay(to) || from > to) return null;
  const sessions = (app.state.sessions || []).filter((s) => s.date >= from && s.date <= to && app.setCount(s) > 0).length;
  let meals = 0;
  const days = (app.food() && app.food().days) || {};
  Object.keys(days).forEach((d) => { if (d >= from && d <= to) meals += (days[d] || []).length; });
  const cardio = (app.cardio().sessions || []).filter((s) => s.date >= from && s.date <= to).length;
  const meas = Object.keys(app.meas()).filter((d) => d >= from && d <= to).length;
  const weighs = app.weighIns().filter((w) => w.date >= from && w.date <= to).length;
  let checks = 0;
  if (Array.isArray(app.state.checkins)) checks = app.state.checkins.filter((x) => x && (x.date || x.day) >= from && (x.date || x.day) <= to).length;
  else if (app.state.checkins && typeof app.state.checkins === "object") checks = Object.keys(app.state.checkins).filter((d) => d >= from && d <= to).length;
  const oura = Object.keys((app.state.oura && app.state.oura.days) || {}).filter((d) => d >= from && d <= to).length;
  const photos = (app.myPhotos ? app.myPhotos() : []).filter((p) => p.date >= from && p.date <= to).length;
  const plan = Object.keys(app.state.plan || {}).filter((d) => d >= from && d <= to).length;
  return { sessions, meals, cardio, meas, weighs, checks, oura, photos, plan };
}
app.rangeCounts = rangeCounts;

function rangePreviewText(from, to) {
  const c = app.rangeCounts(from, to);
  if (!c) return "Choose both dates. The end date can be today.";
  const bits = [];
  if (c.sessions) bits.push(app.pl(c.sessions, "workout"));
  if (c.meals) bits.push(app.pl(c.meals, "food log"));
  if (c.cardio) bits.push(app.pl(c.cardio, "cardio session"));
  if (c.meas) bits.push(app.pl(c.meas, "measurement day"));
  if (c.weighs) bits.push(app.pl(c.weighs, "weigh-in"));
  if (c.checks) bits.push(app.pl(c.checks, "check-in"));
  if (c.oura) bits.push(app.pl(c.oura, "Oura day"));
  if (c.photos) bits.push(app.pl(c.photos, "progress photo"));
  if (c.plan) bits.push(app.pl(c.plan, "planned day"));
  if (!bits.length) return "Nothing on this phone falls in that range. If you're signed in, the account copy is still checked.";
  return "On this phone: " + bits.join(", ") + ".";
}
app.rangePreviewText = rangePreviewText;

function rangeSheetHTML() {
  const from = (app.ui.sd && app.ui.sd.from) || "";
  const to = (app.ui.sd && app.ui.sd.to) || "";
  return `<h3>Delete a date range</h3>
    <p class="sub" style="margin:-6px 0 14px">Erases logs between these dates and keeps your account. Workouts, food, cardio, measurements, weigh-ins, check-ins, planned days, progress photos, and Oura days stored in Insight. Routines and favorites stay. A later Oura sync won't bring those days back. Oura's own copy is not deleted.</p>
    <label class="field-label" for="purge-from">From</label>
    <input class="text-in" id="purge-from" type="date" max="${app.today()}" value="${app.esc(from)}">
    <label class="field-label" for="purge-to">To</label>
    <input class="text-in" id="purge-to" type="date" max="${app.today()}" value="${app.esc(to)}">
    <p class="sub" id="purge-preview">${app.esc(app.rangePreviewText(from, to))}</p>
    <button class="btn danger-fill block" id="purge-go" data-action="priv-range-go" style="margin-top:14px" ${from && to ? "" : "disabled"}>Delete this range</button>`;
}
app.rangeSheetHTML = rangeSheetHTML;

function deleteSheetHTML() {
  const signed = !!(app.session && app.sb);
  return `<h3>${signed ? "Delete account" : "Erase this phone"}</h3>
    <p class="sub" style="margin:-6px 0 12px">${signed
      ? "This permanently deletes your Insight sign-in and everything stored with it: workouts, food, cardio, measurements, weigh-ins, check-ins, progress photos, Oura data, and settings. The copy on this phone is erased too. This can't be undone."
      : "You aren't signed in, so this only erases what's saved on this phone. It can't delete a cloud account from here. Sign in first if you need the account itself removed."}</p>
    <ul class="priv-list">
      <li>There is no undo.</li>
      <li>${signed ? "Your email won't be able to sign in again." : "Routines on this phone go back to the defaults."}</li>
      <li>Photos in Insight's storage are removed. Photos you still have in the camera roll stay there.</li>
    </ul>
    <label class="field-label" for="del-confirm">Type DELETE to confirm</label>
    <input class="text-in confirm-in" id="del-confirm" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="DELETE" aria-label="Type DELETE to confirm">
    <button class="btn danger-fill block" id="del-go" data-action="priv-delete-go" disabled>${signed ? "Delete my account" : "Erase this phone"}</button>`;
}
app.deleteSheetHTML = deleteSheetHTML;

function passcodeSheetHTML() {
  return `<h3>Set a passcode</h3>
    <p class="sub" style="margin:-6px 0 14px">This device can't use Face ID or a device passcode for apps, so Insight will ask for a 6-digit code instead. You can always sign in with your password if you forget it.</p>
    <label class="field-label" for="pass-a">Passcode</label>
    <input class="text-in" id="pass-a" inputmode="numeric" autocomplete="off" maxlength="6" placeholder="6 digits" aria-label="Passcode">
    <label class="field-label" for="pass-b">Repeat it</label>
    <input class="text-in" id="pass-b" inputmode="numeric" autocomplete="off" maxlength="6" placeholder="6 digits" aria-label="Repeat passcode">
    <button class="btn primary block" data-action="priv-pass-save">Turn on app lock</button>`;
}
app.passcodeSheetHTML = passcodeSheetHTML;

function fnError(error, fallback) {
  return error.context && error.context.json ? error.context.json().then((j) => (j && j.error) || fallback).catch(() => fallback) : Promise.resolve(fallback);
}
app.fnError = fnError;

async function exportAllData() {
  const photos = (app.myPhotos ? app.myPhotos() : []).map((p) => ({ id: p.id, date: p.date, pose: p.pose, at: p.at }));
  const email = app.session && app.session.user && app.session.user.email;
  const files = buildExportFiles(app.state, { photos, email });
  const blob = zipStore(files);
  const name = `insight-${app.today()}.zip`;
  const file = new File([blob], name, { type: "application/zip" });
  let shared = false;
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "Insight data" }); shared = true; }
    catch (e) { if (e && e.name === "AbortError") return; }
  }
  if (!shared) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  if (app.capture) app.capture("privacy_export");
  app.toast("Data export downloaded.");
}
app.exportAllData = exportAllData;

function rememberPurge(from, to, synced) {
  const list = app.state.purges || [];
  const hit = list.find((p) => p.from === from && p.to === to);
  if (hit) { hit.at = Date.now(); hit.synced = !!synced; }
  else list.push({ from, to, at: Date.now(), synced: !!synced });
  app.state.purges = list;
}
app.rememberPurge = rememberPurge;

async function dropPhotosInRange(from, to) {
  if (!app.myPhotos || !app.deletePhoto) return;
  const list = app.myPhotos().filter((p) => p.date >= from && p.date <= to);
  for (const p of list) {
    try { await app.deletePhoto(p.id); } catch (e) { /* keep going */ }
  }
}
async function dropPurgedPhotos() {
  for (const p of app.state.purges || []) {
    if (p && p.from && p.to) await app.dropPhotosInRange(p.from, p.to);
  }
}
app.dropPurgedPhotos = dropPurgedPhotos;
app.dropPhotosInRange = dropPhotosInRange;

async function flushPurges() {
  if (!app.sb || !app.session) return;
  const pending = (app.state.purges || []).filter((p) => p && !p.synced);
  let any = false;
  for (const p of pending) {
    try {
      const { error } = await app.sb.functions.invoke("purge-range", { body: { from: p.from, to: p.to } });
      if (!error) { p.synced = true; any = true; }
    } catch (e) { /* next launch tries again */ }
  }
  if (any) app.save();
}
app.flushPurges = flushPurges;

async function purgeRange(from, to) {
  if (!validDay(from) || !validDay(to) || from > to) { app.toast("Choose a start date on or before the end date."); return; }
  if (from < "1970-01-01") { app.toast("That start date isn't valid."); return; }
  const label = `${app.fmtDate(from, { month: "short", day: "numeric", year: "numeric" })} – ${app.fmtDate(to, { month: "short", day: "numeric", year: "numeric" })}`;
  if (!(await app.ask({ title: "Delete this range?", body: `${label}. Logs, photos, and stored Oura days in those dates are removed. This can't be undone.`, ok: "Delete", danger: true }))) return;
  if (app.purgeBusy) return;
  app.purgeBusy = true;
  try {
    stripRange(app.state, from, to);
    rememberPurge(from, to, false);
    app.ui.workoutOpen = false;
    app.ui.sheet = null;
    app.save();
    await app.dropPhotosInRange(from, to);
    let cloud = !app.session;
    if (app.sb && app.session) {
      try { await app.cloudPush(); } catch (e) {}
      try {
        const { error } = await app.sb.functions.invoke("purge-range", { body: { from, to } });
        if (!error) { rememberPurge(from, to, true); cloud = true; app.save(); }
      } catch (e) { cloud = false; }
    }
    app.render();
    app.toast(cloud ? "That range was deleted." : "Removed on this phone. The account copy will finish deleting when you're back online.");
  } finally { app.purgeBusy = false; }
}
app.purgeRange = purgeRange;

async function clearPhotoStore() {
  try {
    const db = await app.idb();
    await new Promise((res, rej) => {
      const t = db.transaction("photos", "readwrite");
      t.objectStore("photos").clear();
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    });
  } catch (e) { /* no photo database yet */ }
  if (app.PH) {
    Object.keys(app.PH.urls || {}).forEach((k) => { try { URL.revokeObjectURL(app.PH.urls[k]); } catch (err) {} });
    app.PH.list = [];
    app.PH.urls = {};
  }
}
app.clearPhotoStore = clearPhotoStore;

async function eraseThisPhone() {
  clearTimeout(app.pushTimer);
  await app.clearPhotoStore();
  try { localStorage.removeItem(app.KEY); } catch (e) {}
  try { sessionStorage.removeItem("insight-unlocked"); } catch (e) {}
  app.state = app.load();
  app.applyTheme();
  app.ui.sheet = null;
  app.ui.drafts = {};
  app.ui.open = null;
  app.ui.detail = null;
  app.ui.workoutOpen = false;
  app.ui.cardioOpen = false;
  app.ui.onboard = false;
  app.lockPrompted = false;
  if (app.renderOnboard) app.renderOnboard();
}
app.eraseThisPhone = eraseThisPhone;

async function deleteAccount() {
  const typed = ((app.$("#del-confirm") || {}).value || "");
  if (typed !== "DELETE") { app.toast("Type DELETE in capital letters to confirm."); return; }
  if (app.deleteBusy) return;
  app.deleteBusy = true;
  const btn = app.$("#del-go");
  if (btn) { btn.disabled = true; btn.textContent = "Deleting…"; }
  try {
    if (app.sb && app.session) {
      const { error } = await app.sb.functions.invoke("delete-account", { body: { confirm: "DELETE" } });
      if (error) {
        let gone = false;
        try {
          const { data } = await app.sb.auth.getUser();
          gone = !data || !data.user;
        } catch (e) { gone = false; }
        if (!gone) {
          const msg = await app.fnError(error, "Couldn't delete the account. Check your connection and try again.");
          app.toast(msg);
          if (btn) { btn.disabled = false; btn.textContent = "Delete my account"; }
          return;
        }
      }
    }
    const hadAccount = !!(app.session && app.sb);
    await app.eraseThisPhone();
    if (app.signOut) await app.signOut({ skipPush: true, quiet: true });
    else app.render();
    app.toast(hadAccount ? "Your account was deleted." : "Everything on this phone was erased.");
  } finally { app.deleteBusy = false; }
}
app.deleteAccount = deleteAccount;

function b64url(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
app.b64url = b64url;

function b64urlToBuf(s) {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(String(s).replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
app.b64urlToBuf = b64urlToBuf;

async function hashPasscode(code) {
  const salt = new TextEncoder().encode("insight-lock-v1:" + (app.state.ownerId || "local"));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(code)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 120000, hash: "SHA-256" }, key, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
app.hashPasscode = hashPasscode;

async function platformAvailable() {
  try {
    return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch (e) { return false; }
}
app.platformAvailable = platformAvailable;

async function registerPlatformKey() {
  const user = app.session.user;
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: "Insight" },
      user: {
        id: new TextEncoder().encode(user.id),
        name: user.email || "Insight",
        displayName: app.firstName() || "Insight",
      },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
      timeout: 60000,
      attestation: "none",
    },
  });
  if (!cred || !cred.rawId) throw new Error("no credential");
  return app.b64url(cred.rawId);
}
app.registerPlatformKey = registerPlatformKey;

function turnLockOn(patch) {
  app.state.appLock = { enabled: true, method: "platform", credentialId: null, passcodeHash: null, updatedAt: Date.now(), ...patch };
  try { sessionStorage.setItem("insight-unlocked", "1"); } catch (e) {}
  app.save();
  app.ui.sheet = null;
  app.render();
}
app.turnLockOn = turnLockOn;

async function enableAppLock() {
  if (!app.session) {
    app.toast("Sign in first, so you can always get back in with your password.");
    app.ui.sheet = "auth";
    app.ui.sd = { mode: "signin", email: "" };
    app.renderSheet();
    return;
  }
  // Start the platform prompt in this tap. A passcode is the fallback when the device has no Face ID / device passcode for the web.
  if (window.PublicKeyCredential && navigator.credentials && navigator.credentials.create) {
    try {
      const credentialId = await app.registerPlatformKey();
      app.turnLockOn({ method: "platform", credentialId });
      app.toast("App lock is on. Next time you open Insight it will ask for Face ID or your device passcode.");
      return;
    } catch (e) {
      const name = e && e.name;
      // A dismissed prompt stays a dismiss. A domain that cannot use WebAuthn (an IP address, for example) falls through to the passcode.
      if (name === "AbortError" || name === "NotAllowedError") { app.toast("App lock wasn't turned on."); return; }
      const avail = await app.platformAvailable();
      if (avail && name !== "SecurityError" && name !== "NotSupportedError") { app.toast("App lock wasn't turned on."); return; }
    }
  }
  app.ui.sheet = "priv-passcode";
  app.ui.sd = {};
  app.renderSheet();
}
app.enableAppLock = enableAppLock;

async function savePasscodeLock() {
  const a = ((app.$("#pass-a") || {}).value || "").replace(/\D/g, "");
  const b = ((app.$("#pass-b") || {}).value || "").replace(/\D/g, "");
  if (a.length < 6 || b.length < 6) { app.toast("Use 6 digits."); return; }
  if (a !== b) { app.toast("Those codes don't match."); return; }
  const passcodeHash = await app.hashPasscode(a);
  app.turnLockOn({ method: "passcode", credentialId: null, passcodeHash });
  app.toast("App lock is on. Insight will ask for this code when you open it.");
}
app.savePasscodeLock = savePasscodeLock;

async function disableAppLock() {
  if (!(await app.ask({ title: "Turn off app lock?", body: "Insight will open without Face ID or a passcode on this phone.", ok: "Turn off" }))) return;
  app.state.appLock = { enabled: false, updatedAt: Date.now() };
  app.save();
  app.render();
  app.toast("App lock is off.");
}
app.disableAppLock = disableAppLock;

async function unlockWithBiometric() {
  const L = app.lockState();
  if (!L.credentialId || !navigator.credentials) {
    app.ui.lockMsg = "Face ID isn't available here. Sign in with your password to open Insight.";
    app.ui.lockMode = "relogin";
    app.renderLock(true);
    return;
  }
  try {
    const cred = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        timeout: 60000,
        userVerification: "required",
        allowCredentials: [{ type: "public-key", id: app.b64urlToBuf(L.credentialId), transports: ["internal"] }],
      },
    });
    if (!cred) throw new Error("cancelled");
    app.markUnlocked();
  } catch (e) {
    app.ui.lockMsg = "That didn't unlock. Try again, or sign in with your password. Your logs stay put either way.";
    app.renderLock(true);
  }
}
app.unlockWithBiometric = unlockWithBiometric;

async function unlockWithPasscode() {
  const L = app.lockState();
  const code = ((app.$("#lock-code") || {}).value || "").replace(/\D/g, "");
  if (code.length < 6) { app.ui.lockMsg = "Enter the 6-digit code."; app.renderLock(true); return; }
  const hash = await app.hashPasscode(code);
  if (!L.passcodeHash || hash !== L.passcodeHash) {
    app.ui.lockMisses = (app.ui.lockMisses || 0) + 1;
    app.ui.lockMsg = app.ui.lockMisses >= 3 ? "That code isn't right. You can sign in with your password instead." : "That code isn't right.";
    app.renderLock(true);
    return;
  }
  app.ui.lockMisses = 0;
  app.markUnlocked();
}
app.unlockWithPasscode = unlockWithPasscode;

async function unlockWithPassword() {
  if (!app.sb) { app.ui.lockMsg = "Can't reach the server. Check your connection and try again."; app.renderLock(true); return; }
  const email = ((app.$("#lock-email") || {}).value || "").trim();
  const password = (app.$("#lock-pw") || {}).value || "";
  if (!email || !email.includes("@") || password.length < 6) {
    app.ui.lockMsg = "Enter the email and password for this account.";
    app.renderLock(true);
    return;
  }
  const btn = app.$('[data-action="lock-signin"]');
  if (btn) { btn.disabled = true; btn.textContent = "Checking…"; }
  const res = await app.sb.auth.signInWithPassword({ email, password });
  if (res.error || !res.data || !res.data.session) {
    app.ui.lockMsg = res.error ? res.error.message : "That sign-in didn't work.";
    app.renderLock(true);
    return;
  }
  const uid = res.data.session.user.id;
  if (app.state.ownerId && uid !== app.state.ownerId) {
    try { await app.sb.auth.signOut(); } catch (e) {}
    app.ui.lockMsg = "That account is a different one from the data on this phone. Sign in with the same email to unlock it.";
    app.renderLock(true);
    return;
  }
  app.session = res.data.session;
  app.state.ownerId = app.state.ownerId || uid;
  app.markUnlocked();
  app.toast("Unlocked.");
}
app.unlockWithPassword = unlockWithPassword;

function renderLock(force) {
  const el = app.$("#lock");
  if (!el) return;
  document.body.classList.add("locked");
  const mode = app.ui.lockMode || (app.lockState().method === "passcode" ? "passcode" : "main");
  if (!force && !el.hidden && el.dataset.mode === mode) return;
  el.hidden = false;
  el.dataset.mode = mode;
  const L = app.lockState();
  const msg = app.ui.lockMsg ? `<p class="lock-msg">${app.esc(app.ui.lockMsg)}</p>` : "";
  const email = app.esc((app.session && app.session.user && app.session.user.email) || app.ui.lockEmail || "");
  let body;
  if (mode === "relogin") {
    body = `<h1>Sign in to unlock</h1>
      <p class="sub">This opens Insight for the same account. It doesn't delete anything.</p>
      ${msg}
      <label class="field-label" for="lock-email">Email</label>
      <input class="text-in" id="lock-email" type="email" autocomplete="username" inputmode="email" value="${email}">
      <label class="field-label" for="lock-pw">Password</label>
      <input class="text-in" id="lock-pw" type="password" autocomplete="current-password">
      <button class="btn primary block" data-action="lock-signin">Sign in and unlock</button>
      <button class="link-btn lock-alt" data-action="lock-back">${L.method === "passcode" ? "Use passcode" : "Try Face ID again"}</button>`;
  } else if (mode === "passcode" || L.method === "passcode") {
    body = `<h1>Insight is locked</h1>
      <p class="sub">Enter your 6-digit code.</p>
      ${msg}
      <label class="field-label" for="lock-code">Passcode</label>
      <input class="text-in" id="lock-code" inputmode="numeric" autocomplete="off" maxlength="6" aria-label="Passcode">
      <button class="btn primary block" data-action="lock-code-go">Unlock</button>
      <button class="link-btn lock-alt" data-action="lock-relogin">Forgot it? Sign in again</button>`;
  } else {
    body = `<h1>Insight is locked</h1>
      <p class="sub">Unlock with Face ID, Touch ID, or your device passcode.</p>
      ${msg}
      <button class="btn primary block" data-action="lock-bio">Unlock</button>
      ${L.passcodeHash ? `<button class="btn block" data-action="lock-show-pass" style="margin-top:8px">Use app passcode</button>` : ""}
      <button class="link-btn lock-alt" data-action="lock-relogin">Sign in again instead</button>`;
  }
  el.innerHTML = `<div class="lock-card"><div class="lock-mark" aria-hidden="true"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></div>${body}
    <p class="sub small lock-foot">If biometrics aren't available, signing in with your password opens the app. You won't be locked out of your account.</p></div>`;
}
app.renderLock = renderLock;

document.addEventListener("change", (ev) => {
  const el = ev.target;
  if (el && (el.id === "purge-from" || el.id === "purge-to")) el.dispatchEvent(new Event("input", { bubbles: true }));
});

document.addEventListener("input", (ev) => {
  const el = ev.target;
  if (!el || !el.id) return;
  if (el.id === "del-confirm") {
    const btn = app.$("#del-go");
    if (btn) btn.disabled = el.value !== "DELETE";
  } else if (el.id === "purge-from" || el.id === "purge-to") {
    app.ui.sd = app.ui.sd || {};
    app.ui.sd[el.id === "purge-from" ? "from" : "to"] = el.value;
    const preview = app.$("#purge-preview");
    if (preview) preview.textContent = app.rangePreviewText(app.ui.sd.from, app.ui.sd.to);
    const go = app.$("#purge-go");
    if (go) go.disabled = !(app.ui.sd.from && app.ui.sd.to);
  } else if (el.id === "lock-email") app.ui.lockEmail = el.value;
});

document.addEventListener("keydown", (ev) => {
  if (ev.key !== "Enter" || !ev.target) return;
  if (ev.target.id === "del-confirm" && ev.target.value === "DELETE") { ev.preventDefault(); app.deleteAccount(); }
  if (ev.target.id === "lock-code") { ev.preventDefault(); app.unlockWithPasscode(); }
  if (ev.target.id === "lock-pw") { ev.preventDefault(); app.unlockWithPassword(); }
});
