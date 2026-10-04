/* Product events, linked to a hashed account id when signed in. Names and properties are an allowlist.
   Nothing here may carry a health value, food text, a note, a photo,
   an email, or a token.

   tab_viewed                 { tab }     home, workouts, food, progress, insights, settings, cardio
   workout_logged                         a finished workout that had at least one set
   food_logged                { method }  photo, describe, or manual
                                          (a saved meal or a barcode counts as manual)
   morning_brief_customized               the brief was shown, hidden, resized, or reordered
   readiness_plan_toggled     { mode }    normal or readiness
   privacy_export                         a data export finished
   insights_opened                        the insights tab was opened
   weekly_report_opened                   a weekly report was opened

   PostHog's own $identify, $create_alias, $opt_in, and $opt_out may pass.
   $set and $set_once are removed so an email cannot ride along with identify.
   Every other event, including pageviews, heatmaps, and exceptions, is dropped.
   Every event that passes carries $geoip_disable, and $ip / $geoip_* are removed. */

import { stripUrlQuery } from "./sentry-scrub.js";
import { analyticsOn } from "./usage-pref.js";

export const USAGE_TABS = ["home", "workouts", "food", "progress", "insights", "settings", "cardio"];
export const FOOD_METHODS = ["photo", "describe", "manual"];
export const READINESS_MODES = ["normal", "readiness"];

const FEATURE = {
  tab_viewed: (props) => (USAGE_TABS.includes(props.tab) ? { tab: props.tab } : null),
  workout_logged: () => ({}),
  food_logged: (props) => {
    const method = foodMethod(props.method);
    return method ? { method } : null;
  },
  morning_brief_customized: () => ({}),
  readiness_plan_toggled: (props) => (READINESS_MODES.includes(props.mode) ? { mode: props.mode } : null),
  privacy_export: () => ({}),
  insights_opened: () => ({}),
  weekly_report_opened: () => ({}),
};

const IDENTITY_EVENTS = new Set(["$identify", "$create_alias", "$opt_in", "$opt_out"]);

export function foodMethod(src) {
  if (src === "photo" || src === "describe") return src;
  if (src === "manual" || src === "saved" || src === "barcode") return "manual";
  return null;
}

export function sanitizeCapture(name, props) {
  const build = FEATURE[name];
  if (!build) return null;
  const properties = build(props && typeof props === "object" ? props : {});
  if (!properties) return null;
  return { event: name, properties };
}

function keepAutoKey(key) {
  if (typeof key !== "string") return false;
  const lower = key.toLowerCase();
  if (lower.includes("email") || lower.includes("name") || lower === "$set" || lower === "$set_once") return false;
  if (lower === "$groups" || lower === "$initial_person_info") return false;
  if (lower === "$ip" || lower.startsWith("$geoip")) return false;
  if (key.startsWith("$")) return true;
  return key === "distinct_id" || key === "token";
}

const TOKEN_LIKE = /access_token|refresh_token|eyJ[A-Za-z0-9_-]{10,}\./;

/* Local helper: stripUrlQuery leaves the fragment, and magic-link redirects put tokens there. */
export function stripUrlQueryAndHash(value) {
  if (typeof value !== "string") return value;
  return stripUrlQuery(value.replace(/#[\s\S]*$/, ""));
}

export function scrubAutoString(value) {
  const clean = stripUrlQueryAndHash(value);
  return TOKEN_LIKE.test(clean) ? null : clean;
}

/* Stub queue before the SDK loads: keep the newest entries only. */
export const STUB_QUEUE_MAX = 100;
export function pushCapped(queue, entry, max = STUB_QUEUE_MAX) {
  queue.push(entry);
  if (queue.length > max) queue.splice(0, queue.length - max);
  return queue;
}

function scrubProperties(props) {
  const out = {};
  Object.keys(props).forEach((key) => {
    if (!keepAutoKey(key)) return;
    const value = props[key];
    if (typeof value === "string") {
      const clean = scrubAutoString(value);
      if (clean !== null) out[key] = clean;
    }
    else if (value == null || typeof value === "number" || typeof value === "boolean") out[key] = value;
  });
  return out;
}

/* Local development must never reach the production project. */
export function isDevHost(hostname) {
  if (typeof hostname !== "string") return true;
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "::1" || host === "0.0.0.0" || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  return false;
}

/* No location (node tests) is not a dev host. A file: page is. */
export function onDevHost(loc = globalThis.location) {
  if (!loc) return false;
  if (loc.protocol === "file:") return true;
  return isDevHost(loc.hostname);
}

/* Location lookup from IP is off for every event. */
function noGeo(props) {
  return { ...props, $geoip_disable: true };
}

/* Second line of defense for the PostHog before_send hook. */
export function sanitizePosthogEvent(event) {
  try {
    if (!analyticsOn() || onDevHost()) return null;
    if (!event || typeof event !== "object" || typeof event.event !== "string") return null;
    const incoming = event.properties && typeof event.properties === "object" ? event.properties : {};
    if (IDENTITY_EVENTS.has(event.event)) {
      return { ...event, properties: noGeo(scrubProperties(incoming)) };
    }
    const clean = sanitizeCapture(event.event, incoming);
    if (!clean) return null;
    return { ...event, properties: noGeo({ ...scrubProperties(incoming), ...clean.properties }) };
  } catch (e) {
    return null;
  }
}
