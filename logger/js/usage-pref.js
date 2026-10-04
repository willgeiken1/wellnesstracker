/* Per-device choice for anonymous usage data.
   Stored in localStorage only. It is not part of app.state, so it never syncs
   to the account. A missing value means sharing is on. */

export const USAGE_SHARE_KEY = "insight-share-usage";
export const USAGE_SDK_OPT_OUT_KEY = "insight-usage-sdk-opt-out";

function storeOf(storage) {
  if (storage) return storage;
  try { return globalThis.localStorage; } catch (e) { return null; }
}

export function usageSharingOn(storage) {
  const store = storeOf(storage);
  if (!store) return true;
  try {
    return store.getItem(USAGE_SHARE_KEY) !== "0";
  } catch (e) {
    return true;
  }
}

export function setUsageSharing(on, storage) {
  const store = storeOf(storage);
  if (!store) return;
  try { store.setItem(USAGE_SHARE_KEY, on ? "1" : "0"); } catch (e) {}
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
