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
   Automatic $ properties are an allowlist of SDK keys. Unknown $ keys, including
   $hrv or $calories, are dropped. $ip, $geoip_*, city, and lat/long are dropped.
   $set and $set_once are not inside properties on the CaptureResult before_send
   sees: the SDK copies them onto the event, and returning `{...event}` used to
   send them unchanged. They are rebuilt from the same allowlist, so a health
   value cannot ride along into the stored event.
   Every other event, including pageviews, heatmaps, and exceptions, is dropped.
   Every event that passes carries $geoip_disable. */

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

/* SDK fields the product events actually use. Anything else, including a
   health metric someone prefixed with $, is dropped. */
const AUTO_KEYS = new Set([
  "$lib", "$lib_version",
  "$browser", "$browser_version", "$os", "$os_version", "$device", "$device_type",
  "$device_id", "$user_id", "$anon_distinct_id",
  "$current_url", "$host", "$pathname", "$referrer", "$referring_domain",
  "$screen_height", "$screen_width", "$viewport_height", "$viewport_width",
  "$browser_language", "$browser_language_prefix", "$timezone", "$timezone_offset",
  "$session_id", "$window_id", "$pageview_id", "$insert_id", "$time",
  "$session_entry_url", "$session_entry_host", "$session_entry_pathname",
  "$session_entry_referrer", "$session_entry_referring_domain",
  "$geoip_disable", "$process_person_profile", "$config_defaults", "$initialization_time",
  "$initial_browser", "$initial_browser_version", "$initial_os", "$initial_os_version",
  "$initial_device_type", "$initial_current_url", "$initial_pathname", "$initial_host",
  "$initial_referrer", "$initial_referring_domain",
  "$initial_utm_source", "$initial_utm_medium", "$initial_utm_campaign",
  "$initial_utm_content", "$initial_utm_term", "$initial_browser_language",
]);

function isGeoKey(lower) {
  if (lower === "$geoip_disable") return false;
  if (lower === "$ip" || lower.includes("geoip")) return true;
  if (lower === "$city" || lower === "city" || lower.endsWith("_city") || lower.includes("city_name")) return true;
  if (lower.includes("latitude") || lower.includes("longitude")) return true;
  if (lower === "$lat" || lower === "$lng" || lower === "$lon" || lower === "lat" || lower === "lng" || lower === "lon") return true;
  return false;
}

function isPersonNameKey(lower) {
  return lower === "name" || lower === "$name" || lower.endsWith("_name") || lower.endsWith(".name");
}

function keepAutoKey(key) {
  if (typeof key !== "string") return false;
  const lower = key.toLowerCase();
  if (isGeoKey(lower) || lower.includes("email") || isPersonNameKey(lower)) return false;
  if (lower === "distinct_id" || lower === "token") return true;
  return AUTO_KEYS.has(lower);
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
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "").split("%")[0];
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "::1" || host === "0.0.0.0" || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  const ip = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ip) {
    const o = [ip[1], ip[2], ip[3], ip[4]].map(Number);
    if (o.every((n) => n <= 255)) {
      if (o[0] === 10) return true;
      if (o[0] === 192 && o[1] === 168) return true;
      if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true;
      if (o[0] === 169 && o[1] === 254) return true;
      if (o[0] === 100 && o[1] >= 64 && o[1] <= 127) return true;
    }
  }
  if (host.includes(":")) {
    const first = host.split(":").find((part) => part.length > 0) || "";
    if (/^fe[89ab]/.test(first)) return true;
    if (/^f[cd]/.test(first)) return true;
  }
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

/* $set / $set_once are person-property bags. Keep the same SDK keys as events. */
function scrubPersonBag(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const clean = scrubProperties(value);
  return Object.keys(clean).length ? clean : undefined;
}

function finishEvent(event, properties) {
  const next = { event: event.event, properties: noGeo(properties) };
  if (event.uuid != null) next.uuid = event.uuid;
  if (event.timestamp != null) next.timestamp = event.timestamp;
  const set = scrubPersonBag(event.$set);
  const setOnce = scrubPersonBag(event.$set_once);
  if (set) next.$set = set;
  if (setOnce) next.$set_once = setOnce;
  return next;
}

/* Second line of defense for the PostHog before_send hook. */
export function sanitizePosthogEvent(event) {
  try {
    if (!analyticsOn() || onDevHost()) return null;
    if (!event || typeof event !== "object" || typeof event.event !== "string") return null;
    const incoming = event.properties && typeof event.properties === "object" ? event.properties : {};
    if (IDENTITY_EVENTS.has(event.event)) return finishEvent(event, scrubProperties(incoming));
    const clean = sanitizeCapture(event.event, incoming);
    if (!clean) return null;
    return finishEvent(event, { ...scrubProperties(incoming), ...clean.properties });
  } catch (e) {
    return null;
  }
}
