import { app } from "./runtime.js";
import { sentryUserId } from "./sentry-scrub.js";
import { analyticsOn, crashReportsOn, resolveAnalyticsPref, setAnalytics, setCrashReports, setUsageSdkOptOut, usageSdkNeedsOptIn } from "./usage-pref.js";
import { onDevHost, pushCapped, sanitizeCapture, sanitizePosthogEvent } from "./usage-events.js";

/* main.js imports this before data/state.js, so app data has not been written
   yet. This settles the analytics default once for the device. */
resolveAnalyticsPref();

/* PostHog is loaded only while analytics is on and never on a dev host.
   A CDN failure leaves the stub in place and does not affect the rest of the app. */

const POSTHOG_KEY = "phc_mrhCyaL8ahxYYfzBgYFnr5U98Cb6zk67HRfkv52o6Uhm";
const POSTHOG_HOST = "https://us.i.posthog.com";

const STUB_METHODS = "capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_out_capturing has_opted_in_capturing clear_opt_in_out_capturing debug";

let pendingSession = null;
let hadUser = false;
let identifiedId = null;
let posthogQueued = false;
let posthogUnavailable = false;

function posthogAllowed() {
  return !posthogUnavailable && analyticsOn() && !onDevHost();
}

function posthogOptions() {
  return {
    api_host: POSTHOG_HOST,
    person_profiles: "identified_only",
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_dead_clicks: false,
    capture_heatmaps: false,
    capture_performance: false,
    capture_exceptions: false,
    disable_session_recording: true,
    disable_surveys: true,
    rageclick: false,
    advanced_disable_flags: true,
    persistence: "localStorage",
    before_send: sanitizePosthogEvent,
  };
}

function installStub() {
  if (typeof document === "undefined") return null;
  const existing = window.posthog;
  if (existing && existing.__SV) return existing;
  const stub = existing || [];
  window.posthog = stub;
  stub._i = [];
  stub.init = function (key, config, name) {
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.dataset.usage = "1";
    script.src = String(config.api_host || POSTHOG_HOST).replace(".i.posthog.com", "-assets.i.posthog.com") + "/static/array.js";
    script.onerror = function () {
      // Ad blocker or offline: stop queueing for the rest of this page load.
      posthogUnavailable = true;
      stub.length = 0;
      if (target !== stub) target.length = 0;
    };
    const first = document.getElementsByTagName("script")[0];
    if (first && first.parentNode) first.parentNode.insertBefore(script, first);
    else (document.head || document.documentElement).appendChild(script);
    let target = stub;
    if (name !== undefined) target = stub[name] = [];
    else name = "posthog";
    target.people = target.people || [];
    target.toString = function (full) {
      let label = "posthog";
      if (name !== "posthog") label += "." + name;
      if (!full) label += " (stub)";
      return label;
    };
    target.people.toString = function () { return target.toString(1) + ".people (stub)"; };
    STUB_METHODS.split(" ").forEach((method) => {
      target[method] = function () {
        if (posthogUnavailable) return;
        pushCapped(target, [method].concat(Array.prototype.slice.call(arguments, 0)));
      };
    });
    stub._i.push([key, config, name]);
  };
  stub.__SV = 1;
  return stub;
}

function applyIdentity() {
  const ph = window.posthog;
  if (!ph || !posthogAllowed()) return;
  const id = sentryUserId(pendingSession && pendingSession.user && pendingSession.user.id);
  if (id && typeof ph.identify === "function") {
    if (id !== identifiedId) ph.identify(id);
    identifiedId = id;
    hadUser = true;
  } else if (!id && hadUser && typeof ph.reset === "function") {
    ph.reset();
    hadUser = false;
    identifiedId = null;
  }
}

function ensurePosthog() {
  if (!posthogAllowed()) return;
  const ph = installStub();
  if (!ph || typeof ph.init !== "function") return;
  if (!posthogQueued && !ph.__loaded) {
    posthogQueued = true;
    ph.init(POSTHOG_KEY, posthogOptions());
  }
  if (usageSdkNeedsOptIn() && typeof ph.opt_in_capturing === "function") {
    try { ph.opt_in_capturing(); } catch (e) {}
    setUsageSdkOptOut(false);
  }
  applyIdentity();
}

function capture(name, props) {
  if (!posthogAllowed()) return;
  const clean = sanitizeCapture(name, props);
  if (!clean) return;
  ensurePosthog();
  const ph = window.posthog;
  if (!ph || typeof ph.capture !== "function") return;
  ph.capture(clean.event, clean.properties);
}
app.capture = capture;

function noteTab(tab) {
  capture("tab_viewed", { tab });
  if (tab === "insights") capture("insights_opened");
}
app.noteTab = noteTab;

function syncUsageUser(session) {
  pendingSession = session || null;
  if (!posthogAllowed()) return;
  ensurePosthog();
  applyIdentity();
}
app.syncUsageUser = syncUsageUser;

function stopAnalytics() {
  setUsageSdkOptOut(true);
  const ph = window.posthog;
  if (ph && typeof ph.opt_out_capturing === "function") {
    try { ph.opt_out_capturing(); } catch (e) {}
  }
}

/* Share usage analytics (PostHog). */
function applyAnalyticsSharing(on) {
  setAnalytics(!!on);
  if (on) ensurePosthog();
  else stopAnalytics();
  if (typeof app.render === "function") app.render();
}
app.applyAnalyticsSharing = applyAnalyticsSharing;
app.analyticsOn = () => analyticsOn();

/* Send crash reports (Sentry). */
function applyCrashSharing(on) {
  setCrashReports(!!on);
  if (on) { if (app.startSentry) app.startSentry(); }
  else if (app.stopSentry) app.stopSentry();
  if (typeof app.render === "function") app.render();
}
app.applyCrashSharing = applyCrashSharing;
app.crashReportsOn = () => crashReportsOn();

if (crashReportsOn() && app.startSentry) app.startSentry();
if (analyticsOn()) ensurePosthog();
