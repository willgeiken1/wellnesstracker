import { app } from "../runtime.js";

/* Supabase account, backup, and Oura sync. */
/* ================= Cloud: account, backup, Oura ================= */
const SB_URL = "https://pvodxxmfgflvgvbdotlv.supabase.co";
app.SB_URL = SB_URL;

const SB_KEY = "sb_publishable_V8kPahG0KFWgaRVhEHuHrA_iQmEGOpZ";
app.SB_KEY = SB_KEY;

   // publishable key: designed to be public
let sb = null, session = null, pushTimer = null, ouraBusy = false;
app.sb = sb;
app.session = session;
app.pushTimer = pushTimer;
app.ouraBusy = ouraBusy;

try {
  if (window.supabase && window.supabase.createClient) {
    app.sb = window.supabase.createClient(app.SB_URL, app.SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "liftlog-auth" } });
  }
} catch (e) { app.sb = null; }

   // offline or blocked: the app keeps working locally

function schedulePush() {
  if (!app.sb || !app.session) return;
  clearTimeout(app.pushTimer);
  app.pushTimer = setTimeout(app.cloudPush, 1500);
}
app.schedulePush = schedulePush;

async function cloudPush() {
  if (!app.sb || !app.session) return;
  try {
    const { data, error } = await app.sb.from("user_data").select("data").eq("user_id", app.session.user.id).maybeSingle();
    if (!error && data && data.data) app.state.machineNotes = app.mergeMachineNotes(app.state.machineNotes, data.data.machineNotes);
  } catch (e) { /* offline: send this phone's copy; the next pull merges */ }
  const blob = { machineNotes: app.state.machineNotes || {}, measurements: app.state.measurements || {}, uniEx: app.state.uniEx || {}, layout: app.state.layout || {}, brief: app.state.brief || null, muscleMode: app.state.muscleMode, settingsAt: app.state.settingsAt || 0, cardio: app.state.cardio ? { ...app.state.cardio, live: null } : null, food: app.state.food, goals: app.state.goals, theme: app.state.theme, profile: app.state.profile, workouts: app.state.workouts, sessions: app.state.sessions, plan: app.state.plan, restSeconds: app.state.restSeconds,
                 deleted: app.state.deleted || [], updatedAt: app.state.updatedAt || Date.now(),
                 appLock: app.state.appLock || { enabled: false, updatedAt: 0 }, purges: app.state.purges || [], checkins: app.state.checkins || null, checkinDeleted: app.state.checkinDeleted || [] };
  try {
    const { error } = await app.sb.from("user_data").upsert({ user_id: app.session.user.id, data: blob, updated_at: new Date().toISOString() });
    if (!error) { app.state.lastCloud = Date.now(); localStorage.setItem(app.KEY, JSON.stringify(app.state)); }
  } catch (e) { /* offline: the next save or app open retries */ }
}
app.cloudPush = cloudPush;

/* Combines the cloud copy with this phone's copy so nothing logged on either side is lost. */
function mergeRemote(r) {
  r = r || {};
  if (app.unionPurges) app.state.purges = app.unionPurges(app.state.purges, r.purges);
  if (app.mergeCheckins) {
    const c = app.mergeCheckins(app.state, r);
    app.state.checkins = c.checkins;
    app.state.checkinDeleted = c.checkinDeleted;
  }
  if (r.appLock && (r.appLock.updatedAt || 0) > ((app.state.appLock && app.state.appLock.updatedAt) || 0)) app.state.appLock = r.appLock;
  const deleted = new Set([...(app.state.deleted || []), ...(r.deleted || [])]);
  const byId = new Map();
  // This phone's copy goes first so it wins ties (e.g. right after converting units).
  [...app.state.sessions, ...(r.sessions || [])].forEach((s) => {
    if (!s || deleted.has(s.id)) return;
    const cur = byId.get(s.id);
    const better = (a, b) => (a.mod || 0) !== (b.mod || 0) ? (a.mod || 0) > (b.mod || 0)
      : app.setCount(a) > app.setCount(b) || (a.finishedAt && !b.finishedAt && app.setCount(a) >= app.setCount(b));
    if (!cur || better(s, cur)) byId.set(s.id, s);
  });
  app.state.sessions = [...byId.values()];
  if (r.goals && (!app.state.goals || (r.goals.updatedAt || 0) > (app.state.goals.updatedAt || 0))) app.state.goals = r.goals;
  if (r.brief && (r.brief.updatedAt || 0) > ((app.state.brief && app.state.brief.updatedAt) || 0)) app.state.brief = r.brief;
  if (r.food) app.mergeFood(r.food);
  if (r.cardio) app.mergeCardio(r.cardio);
  if (r.measurements) Object.entries(r.measurements).forEach(([d, m]) => { const l = app.meas()[d]; if (!l || (m.at || 0) > (l.at || 0)) app.meas()[d] = m; });
  app.state.machineNotes = app.mergeMachineNotes(app.state.machineNotes, r.machineNotes);
  if ((r.settingsAt || 0) > (app.state.settingsAt || 0)) { if (r.muscleMode) app.state.muscleMode = r.muscleMode; if (r.layout) app.state.layout = r.layout; if (r.uniEx) app.state.uniEx = r.uniEx; app.state.settingsAt = r.settingsAt; }
  if (r.profile) {
    const lp = app.state.profile;
    const wDel = new Set([...((lp && lp.wDel) || []), ...(r.profile.wDel || [])]);
    const byDate = new Map();
    const newerLocal = lp && (lp.updatedAt || 0) >= (r.profile.updatedAt || 0);
    const order = newerLocal ? [r.profile.weighIns || [], lp.weighIns || []] : [(lp && lp.weighIns) || [], r.profile.weighIns || []];
    order.forEach((list) => list.forEach((x) => { if (!wDel.has(x.date)) byDate.set(x.date, x); }));
    app.state.profile = { ...(newerLocal ? lp : r.profile), weighIns: [...byDate.values()], wDel: [...wDel] };
  }
  if ((r.updatedAt || 0) > (app.state.updatedAt || 0)) {
    if (Array.isArray(r.workouts) && r.workouts.length) app.state.workouts = r.workouts;
    if (r.plan) app.state.plan = r.plan;
    if (r.restSeconds) app.state.restSeconds = r.restSeconds;
    if (r.theme) { app.state.theme = r.theme; app.applyTheme(); }
  }
  app.state.deleted = [...deleted];
  if (app.applyPurges) app.applyPurges(app.state);
  if (app.state.oura && app.state.oura.days && app.datePurged) {
    Object.keys(app.state.oura.days).forEach((d) => { if (app.datePurged(d)) delete app.state.oura.days[d]; });
  }
}
app.mergeRemote = mergeRemote;

async function cloudPull() {
  if (!app.sb || !app.session) return;
  try {
    const { data, error } = await app.sb.from("user_data").select("data").eq("user_id", app.session.user.id).maybeSingle();
    if (error) return;
    if (data && data.data) app.mergeRemote(data.data);
    app.save();
    app.render();
  } catch (e) { /* offline */ }
}
app.cloudPull = cloudPull;

async function ouraRefresh(force) {
  if (!app.sb || !app.session || app.ouraBusy) return;
  app.ouraBusy = true;
  try {
    const { data: c } = await app.sb.from("oura_connections").select("*").eq("user_id", app.session.user.id).maybeSingle();
    app.state.oura.connected = !!c;
    app.state.oura.lastError = c ? c.last_error : null;
    if (c) {
      const stale = !c.last_sync || Date.now() - new Date(c.last_sync).getTime() > 3 * 3600_000;
      if (force || stale) {
        app.ui.ouraSyncing = true; app.render();
        const { error } = await app.sb.functions.invoke("oura-sync", { body: { days: c.last_sync ? 14 : 120 } });
        app.ui.ouraSyncing = false;
        if (error) app.toast("Couldn't sync Oura right now. Try Sync now in Settings.");
      }
      const { data: rows } = await app.sb.from("oura_days").select("day, data").eq("user_id", app.session.user.id).gte("day", app.addDays(app.today(), -150));
      if (rows) {
        const days = {};
        rows.forEach((r) => { if (!(app.datePurged && app.datePurged(r.day))) days[r.day] = r.data; });
        app.state.oura.days = days;
        app.state.oura.lastSync = Date.now();
      }
    }
    app.save();
  } catch (e) { app.ui.ouraSyncing = false; }
  app.ouraBusy = false;
  app.render();
}
app.ouraRefresh = ouraRefresh;

/* Keeps two accounts on one phone from mixing: a different account starts from its own cloud copy. */
function claimLocalFor(uid) {
  if (app.state.ownerId && app.state.ownerId !== uid) {
    const fresh = app.migrate({ sessions: [] });
    fresh.ownerId = uid;
    app.state = fresh;
    app.applyTheme();
    app.ui.drafts = {}; app.ui.open = null; app.ui.detail = null; app.ui.workoutOpen = false;
  }
  app.state.ownerId = uid;
}
app.claimLocalFor = claimLocalFor;

async function initCloud() {
  if (!app.sb) { await app.loadPhotos(); app.render(); return; }
  try {
    const { data } = await app.sb.auth.getSession();
    app.session = data.session;
    if (app.syncSentryUser) app.syncSentryUser(app.session);
    if (app.syncUsageUser) app.syncUsageUser(app.session);
    app.sb.auth.onAuthStateChange((_event, s) => {
      app.session = s;
      if (app.syncSentryUser) app.syncSentryUser(s);
      if (app.syncUsageUser) app.syncUsageUser(s);
    });
    if (app.session) { app.claimLocalFor(app.session.user.id); await app.cloudPull(); app.checkProfileGate(); await app.loadPhotos(); await app.syncPhotos(); if (app.dropPurgedPhotos) await app.dropPurgedPhotos(); await app.ouraRefresh(false); if (app.flushPurges) await app.flushPurges(); }
    else { await app.loadPhotos(); app.render(); }
  } catch (e) { /* offline */ }
}
app.initCloud = initCloud;

async function signIn(mode) {
  if (!app.sb) { app.toast("Can't reach the server. Check your connection."); return; }
  const email = (app.$("#authEmail") || {}).value?.trim();
  const password = (app.$("#authPw") || {}).value || "";
  if (!email || !email.includes("@")) { app.toast("Enter your email address."); return; }
  if (password.length < 6) { app.toast("Passwords need at least 6 characters."); return; }
  const btn = app.$('[data-action="auth-go"]');
  if (btn) { btn.disabled = true; btn.textContent = "One moment…"; }
  const res = mode === "signup" ? await app.sb.auth.signUp({ email, password }) : await app.sb.auth.signInWithPassword({ email, password });
  if (res.error) {
    if (btn) { btn.disabled = false; btn.textContent = mode === "signup" ? "Create account" : "Sign in"; }
    app.toast(res.error.message);
    return;
  }
  if (!res.data.session) { app.toast("Check your email to confirm your account, then sign in."); app.ui.sheet = null; app.render(); return; }
  app.session = res.data.session;
  if (app.syncSentryUser) app.syncSentryUser(app.session);
  if (app.syncUsageUser) app.syncUsageUser(app.session);
  app.ui.sheet = null;
  app.claimLocalFor(app.session.user.id);
  app.toast(mode === "signup" ? "Account created. Your workouts are backing up." : "Signed in.");
  await app.cloudPull();
  app.checkProfileGate();
  await app.loadPhotos(); await app.syncPhotos();
  if (app.dropPurgedPhotos) await app.dropPurgedPhotos();
  await app.ouraRefresh(false);
  if (app.flushPurges) await app.flushPurges();
}
app.signIn = signIn;

async function signOut(opts) {
  const skipPush = opts && opts.skipPush;
  clearTimeout(app.pushTimer);
  if (!skipPush) { try { await app.cloudPush(); } catch (e) {} }   // make sure the latest is backed up first
  if (app.sb) { try { await app.sb.auth.signOut(); } catch (e) {} }
  app.session = null;
  if (app.syncSentryUser) app.syncSentryUser(null);
  if (app.syncUsageUser) app.syncUsageUser(null);
  app.ui.onboard = false; app.renderOnboard();
  app.state.oura = { connected: false, lastSync: null, days: {} };
  app.save(); app.render();
  if (!(opts && opts.quiet)) app.toast("Signed out. Your workouts are still saved on this phone.");
}
app.signOut = signOut;

async function connectOura() {
  if (!app.sb) { app.toast("Can't reach the server. Check your connection."); return; }
  if (!app.session) { app.ui.sheet = "auth"; app.ui.sd = { mode: "signin", email: "" }; app.renderSheet(); app.toast("Sign in first, then connect Oura."); return; }
  const { data, error } = await app.sb.functions.invoke("oura-connect", { body: {} });
  if (error || !data || !data.url) { app.toast("Couldn't start the Oura connection. Check that the functions are deployed."); return; }
  app.state.demo = false; app.save();
  window.location.href = data.url;
}
app.connectOura = connectOura;

async function disconnectOura() {
  if (!(await app.ask({ title: "Disconnect Oura?", body: "Your Oura data will be removed from Insight. You can reconnect any time.", ok: "Disconnect", danger: true }))) return;
  const { error } = await app.sb.functions.invoke("oura-connect", { body: { action: "disconnect" } });
  if (error) { app.toast("Couldn't disconnect right now."); return; }
  app.state.oura = { connected: false, lastSync: null, days: {} };
  app.save(); app.render(); app.toast("Oura disconnected.");
}
app.disconnectOura = disconnectOura;

/* After Oura's login page sends you back here */
(function handleOuraReturn() {
  const p = new URLSearchParams(location.search).get("oura");
  if (!p) return;
  history.replaceState(null, "", location.pathname);
  const ok = p === "connected";
  setTimeout(() => app.ask({
    title: ok ? "Oura connected" : "Oura wasn't connected",
    body: ok ? "If there's a Done button in the corner, tap it to go back to Insight. Your Oura data loads there automatically."
             : p === "expired" ? "That login took too long. Open Recovery and tap Connect Oura again."
             : "The connection was cancelled or didn't finish. Open Recovery and tap Connect Oura to try again.",
    ok: "OK", cancel: "Close"
  }), 300);
})();

function syncedAgo() {
  if (!app.state.oura.lastSync) return "";
  const m = Math.round((Date.now() - app.state.oura.lastSync) / 60000);
  return m < 1 ? "Synced just now" : m < 60 ? `Synced ${m} min ago` : `Synced ${Math.round(m / 60)} h ago`;
}
app.syncedAgo = syncedAgo;
