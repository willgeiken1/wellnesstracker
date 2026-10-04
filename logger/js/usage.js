import { app } from "./runtime.js";
import { sentryUserId } from "./sentry-scrub.js";
import { setUsageSdkOptOut, setUsageSharing, usageSdkNeedsOptIn, usageSharingOn } from "./usage-pref.js";
import { sanitizeCapture, sanitizePosthogEvent } from "./usage-events.js";

/* PostHog is loaded only while sharing is on. A CDN failure leaves the stub
   in place and does not affect the rest of the app. */

const POSTHOG_KEY = "phc_mrhCyaL8ahxYYfzBgYFnr5U98Cb6zk67HRfkv52o6Uhm";
const POSTHOG_HOST = "https://us.i.posthog.com";

const STUB_METHODS = "capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_out_capturing has_opted_in_capturing clear_opt_in_out_capturing debug";

let pendingSession = null;
let hadUser = false;
let identifiedId = null;
let posthogQueued = false;

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
    script.onerror = function () {};
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
        target.push([method].concat(Array.prototype.slice.call(arguments, 0)));
      };
    });
    stub._i.push([key, config, name]);
  };
  stub.__SV = 1;
  return stub;
}

function applyIdentity() {
  const ph = window.posthog;
  if (!ph || !usageSharingOn()) return;
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
  if (!usageSharingOn()) return;
  const ph = installStub();
  if (!ph || typeof ph.init !== "function") return;
  if (!posthogQueued) {
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
  if (!usageSharingOn()) return;
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
  if (!usageSharingOn()) return;
  ensurePosthog();
  applyIdentity();
}
app.syncUsageUser = syncUsageUser;

function startServices() {
  if (!usageSharingOn()) return;
  if (app.startSentry) app.startSentry();
  ensurePosthog();
}

function stopServices() {
  setUsageSdkOptOut(true);
  const ph = window.posthog;
  if (ph && typeof ph.opt_out_capturing === "function") {
    try { ph.opt_out_capturing(); } catch (e) {}
  }
  if (app.stopSentry) app.stopSentry();
}

function applyUsageSharing(on) {
  setUsageSharing(!!on);
  if (on) startServices();
  else stopServices();
  if (typeof app.render === "function") app.render();
}
app.applyUsageSharing = applyUsageSharing;
app.usageSharingOn = () => usageSharingOn();

if (usageSharingOn()) startServices();
