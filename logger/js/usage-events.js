/* Anonymous product events. Names and properties are an allowlist.
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

   PostHog's own $identify, $create_alias, $opt_in, and $opt_out may pass.
   $set and $set_once are removed so an email cannot ride along with identify.
   Every other event, including pageviews, heatmaps, and exceptions, is dropped. */

import { stripUrlQuery } from "./sentry-scrub.js";
import { usageSharingOn } from "./usage-pref.js";

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
  if (key.startsWith("$")) return true;
  return key === "distinct_id" || key === "token";
}

function scrubProperties(props) {
  const out = {};
  Object.keys(props).forEach((key) => {
    if (!keepAutoKey(key)) return;
    const value = props[key];
    if (typeof value === "string") out[key] = stripUrlQuery(value);
    else if (value == null || typeof value === "number" || typeof value === "boolean") out[key] = value;
  });
  return out;
}

/* Second line of defense for the PostHog before_send hook. */
export function sanitizePosthogEvent(event) {
  try {
    if (!usageSharingOn()) return null;
    if (!event || typeof event !== "object" || typeof event.event !== "string") return null;
    const incoming = event.properties && typeof event.properties === "object" ? event.properties : {};
    if (IDENTITY_EVENTS.has(event.event)) {
      return { ...event, properties: scrubProperties(incoming) };
    }
    const clean = sanitizeCapture(event.event, incoming);
    if (!clean) return null;
    return { ...event, properties: { ...scrubProperties(incoming), ...clean.properties } };
  } catch (e) {
    return null;
  }
}
