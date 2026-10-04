/* Per-device choices for crash reports and product analytics.
   Stored in localStorage only. They are not part of app.state, so they never
   sync to the account.

   Crash reports (Sentry): "insight-share-usage". Missing means on.
   Product analytics (PostHog): "insight-share-analytics". Only "1" is on.
   resolveAnalyticsPref() writes it once, before app state loads. */

export const USAGE_SHARE_KEY = "insight-share-usage";
export const CRASH_SHARE_KEY = USAGE_SHARE_KEY;
export const ANALYTICS_SHARE_KEY = "insight-share-analytics";
export const USAGE_SDK_OPT_OUT_KEY = "insight-usage-sdk-opt-out";
/* Same as app.KEY in data/state.js. Its presence marks a device that used the app before. */
export const APP_DATA_KEY = "liftlog-v1";

function storeOf(storage) {
  if (storage) return storage;
  try { return globalThis.localStorage; } catch (e) { return null; }
}

export function crashReportsOn(storage) {
  const store = storeOf(storage);
  if (!store) return true;
  try {
    return store.getItem(CRASH_SHARE_KEY) !== "0";
  } catch (e) {
    return true;
  }
}

export function setCrashReports(on, storage) {
  const store = storeOf(storage);
  if (!store) return;
  try { store.setItem(CRASH_SHARE_KEY, on ? "1" : "0"); } catch (e) {}
}

/* Older names for the crash report switch. */
export const usageSharingOn = crashReportsOn;
export const setUsageSharing = setCrashReports;

/* Runs once per device. An existing analytics value is never changed.
   Otherwise: copy an explicit old choice, else existing app data means the
   user had sharing on, else this is a new user and analytics starts off. */
export function resolveAnalyticsPref(storage) {
  const store = storeOf(storage);
  if (!store) return false;
  let value;
  try {
    const current = store.getItem(ANALYTICS_SHARE_KEY);
    if (current !== null) return current === "1";
    const old = store.getItem(USAGE_SHARE_KEY);
    if (old !== null) value = old === "0" ? "0" : "1";
    else value = store.getItem(APP_DATA_KEY) !== null ? "1" : "0";
  } catch (e) {
    return false;
  }
  try { store.setItem(ANALYTICS_SHARE_KEY, value); } catch (e) { return false; }
  return value === "1";
}

/* Reads only. A missing value is off, so a read before resolution can't turn it on. */
export function analyticsOn(storage) {
  const store = storeOf(storage);
  if (!store) return false;
  try { return store.getItem(ANALYTICS_SHARE_KEY) === "1"; } catch (e) { return false; }
}

export function setAnalytics(on, storage) {
  const store = storeOf(storage);
  if (!store) return;
  try { store.setItem(ANALYTICS_SHARE_KEY, on ? "1" : "0"); } catch (e) {}
}

/* PostHog remembers its own opt-out. This flag tells the next opt-in to clear it. */
export function usageSdkNeedsOptIn(storage) {
  const store = storeOf(storage);
  if (!store) return false;
  try { return store.getItem(USAGE_SDK_OPT_OUT_KEY) === "1"; } catch (e) { return false; }
}

export function setUsageSdkOptOut(on, storage) {
  const store = storeOf(storage);
  if (!store) return;
  try {
    if (on) store.setItem(USAGE_SDK_OPT_OUT_KEY, "1");
    else store.removeItem(USAGE_SDK_OPT_OUT_KEY);
  } catch (e) {}
}
