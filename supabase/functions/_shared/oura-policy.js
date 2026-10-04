/* Oura API Agreement rules shared by oura-sync.
   A revoked grant or a 401 that survives one refresh deletes stored Oura data.
   A 403 is an inactive membership: keep the rows and stop syncing.
   Retention of 0, null, or a missing setting means keep every oura_days row. */

export function oauthErrorCode(bodyText) {
  const raw = String(bodyText || "");
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.error) return String(parsed.error);
  } catch { /* body may be plain text */ }
  const match = raw.match(/"error"\s*:\s*"([^"]+)"/);
  return match ? match[1] : "";
}

/* ok | revoked | refresh_failed */
export function classifyRefresh(status, bodyText) {
  const code = oauthErrorCode(bodyText);
  if (code === "invalid_grant" || /invalid_grant/i.test(String(bodyText || ""))) return "revoked";
  if (status >= 200 && status < 300) return "ok";
  return "refresh_failed";
}

/* ok | unauthorized | membership_inactive | error */
export function classifyCollection(status) {
  if (status === 401) return "unauthorized";
  if (status === 403) return "membership_inactive";
  if (status >= 200 && status < 300) return "ok";
  return "error";
}

/* save | inactive | delete | retry | error
   refresh is "skipped" when the access token was still valid.
   retryRefresh / retryApi are set only after a 401. */
export function planSync({ refresh = "skipped", api, retryRefresh = null, retryApi = null } = {}) {
  if (refresh === "revoked") return "delete";
  if (api === "membership_inactive") return "inactive";
  if (api === "unauthorized") {
    if (retryRefresh == null) return "retry";
    if (retryRefresh === "revoked") return "delete";
    if (retryRefresh !== "ok") return "error";
    if (retryApi === "membership_inactive") return "inactive";
    if (retryApi === "unauthorized") return "delete";
    if (retryApi === "ok") return "save";
    return "error";
  }
  if (api === "ok") return "save";
  return "error";
}

/* null means the cleanup job deletes nothing. */
export function retentionDays(value) {
  if (value == null || value === "" || value === "null") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

/* Home renders an Oura tile only when a score is stored.
   Revoked access hides leftover scores. A lapsed membership still shows them. */
export function showOuraOnHome(status, hasScore) {
  if (status === "disconnected") return false;
  return !!hasScore;
}
