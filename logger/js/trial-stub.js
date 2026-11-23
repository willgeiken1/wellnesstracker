import { app } from "./runtime.js";

/* Local fixture backend for INSIGHT_TRIAL_STUB=1. @example.com accounts only.
   Records stay empty. Nothing here calls a hosted project. */

const ACCOUNT_KEY = "insight-trial-account";
const BLOCKED_HOST = /(^|\.)supabase\.co$|(^|\.)sentry\.io$|(^|\.)posthog\.com$|(^|\.)ouraring\.com$|^willgeiken1\.github\.io$/i;

function exampleEmail(value) {
  return typeof value === "string" && /^[^\s@]+@example\.com$/i.test(value.trim());
}

function accountId(email) {
  let hash = 2166136261;
  const text = email.trim().toLowerCase();
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `trial-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function trialStubOn() {
  return app.trialStub === true;
}

function requested() {
  try {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    if (params.get("INSIGHT_TRIAL_STUB") === "1") {
      params.delete("INSIGHT_TRIAL_STUB");
      const next = params.toString();
      const path = window.location.pathname + (next ? `?${next}` : "") + window.location.hash;
      window.history.replaceState(null, "", path);
      window.sessionStorage.setItem("INSIGHT_TRIAL_STUB", "1");
    }
    if (window.sessionStorage.getItem("INSIGHT_TRIAL_STUB") === "1") return true;
    if (window.localStorage.getItem("INSIGHT_TRIAL_STUB") === "1") return true;
    if (window.INSIGHT_TRIAL_STUB === "1" || window.INSIGHT_TRIAL_STUB === 1) return true;
  } catch (e) { /* keep the hosted app */ }
  return false;
}

function readAccount() {
  try {
    const raw = window.sessionStorage.getItem(ACCOUNT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !exampleEmail(parsed.email) || typeof parsed.id !== "string") return null;
    return { id: parsed.id, email: parsed.email.trim().toLowerCase() };
  } catch (e) { return null; }
}

function writeAccount(user) {
  try {
    if (!user) window.sessionStorage.removeItem(ACCOUNT_KEY);
    else window.sessionStorage.setItem(ACCOUNT_KEY, JSON.stringify({ id: user.id, email: user.email }));
  } catch (e) { /* session stays in memory */ }
}

function sessionFor(user) {
  if (!user) return null;
  return {
    access_token: "local",
    refresh_token: "local",
    token_type: "bearer",
    expires_in: 3600,
    user: { id: user.id, email: user.email, aud: "authenticated", app_metadata: {}, user_metadata: {} },
  };
}

function blockedUrl(value) {
  try {
    const raw = typeof value === "string" ? value : value && value.url;
    if (!raw) return false;
    return BLOCKED_HOST.test(new URL(String(raw), window.location.origin).hostname);
  } catch (e) { return false; }
}

function installGuard() {
  const fetchImpl = window.fetch;
  if (typeof fetchImpl === "function" && !fetchImpl.__trialGuard) {
    const guarded = function trialFetch(input, init) {
      if (blockedUrl(input)) return Promise.resolve(new Response("{}", { status: 404, headers: { "content-type": "application/json" } }));
      return fetchImpl.apply(this, arguments);
    };
    guarded.__trialGuard = true;
    window.fetch = guarded;
  }
  if (navigator && typeof navigator.sendBeacon === "function" && !navigator.sendBeacon.__trialGuard) {
    const beacon = navigator.sendBeacon.bind(navigator);
    const guardedBeacon = function trialBeacon(url, data) {
      if (blockedUrl(url)) return true;
      return beacon(url, data);
    };
    guardedBeacon.__trialGuard = true;
    navigator.sendBeacon = guardedBeacon;
  }
}

function query() {
  const builder = {
    select() { return builder; },
    eq() { return builder; },
    gte() { return builder; },
    lte() { return builder; },
    gt() { return builder; },
    order() { return builder; },
    limit() { return builder; },
    update() { return builder; },
    delete() { return builder; },
    maybeSingle() { return Promise.resolve({ data: null, error: null }); },
    single() { return Promise.resolve({ data: null, error: { message: "none" } }); },
    upsert() { return Promise.resolve({ data: null, error: null }); },
    insert() { return Promise.resolve({ data: null, error: null }); },
    then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject); },
  };
  return builder;
}

function storageBucket() {
  return {
    upload() { return Promise.resolve({ data: null, error: { message: "unavailable" } }); },
    download() { return Promise.resolve({ data: null, error: { message: "unavailable" } }); },
    remove() { return Promise.resolve({ data: null, error: null }); },
    list() { return Promise.resolve({ data: [], error: null }); },
  };
}

function makeClient() {
  let user = readAccount();
  const listeners = new Set();
  const emit = (event) => {
    const session = sessionFor(user);
    listeners.forEach((fn) => { try { fn(event, session); } catch (e) { /* listener */ } });
  };
  const accept = (email, password) => {
    if (!exampleEmail(email) || typeof password !== "string" || password.length < 6) {
      return { data: { user: null, session: null }, error: { message: "invalid login credentials", status: 400 } };
    }
    user = { id: accountId(email), email: email.trim().toLowerCase() };
    writeAccount(user);
    const session = sessionFor(user);
    emit("SIGNED_IN");
    return { data: { user: session.user, session }, error: null };
  };
  return {
    auth: {
      async getSession() { return { data: { session: sessionFor(user) }, error: null }; },
      async getUser() { return { data: { user: sessionFor(user) && sessionFor(user).user }, error: null }; },
      onAuthStateChange(callback) {
        listeners.add(callback);
        try { callback("INITIAL_SESSION", sessionFor(user)); } catch (e) { /* listener */ }
        return { data: { subscription: { unsubscribe() { listeners.delete(callback); } } } };
      },
      signUp(body) { return Promise.resolve(accept(body && body.email, body && body.password)); },
      signInWithPassword(body) { return Promise.resolve(accept(body && body.email, body && body.password)); },
      async signOut() { user = null; writeAccount(null); emit("SIGNED_OUT"); return { error: null }; },
      startAutoRefresh() {},
      stopAutoRefresh() {},
    },
    from() { return query(); },
    rpc() {
      return Promise.resolve({ data: null, error: null });
    },
    functions: {
      invoke() { return Promise.resolve({ data: null, error: { message: "unavailable" } }); },
    },
    storage: { from: storageBucket },
  };
}

function install() {
  if (!requested()) return;
  app.trialStub = true;
  try { document.documentElement.dataset.trial = "1"; } catch (e) { /* no document */ }
  installGuard();
  const client = makeClient();
  window.supabase = { createClient() { return client; } };
}

install();
