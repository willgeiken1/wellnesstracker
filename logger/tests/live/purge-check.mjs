// Fail-closed checks for the throwaway purge.
// Every table in PURGE_TABLES exists, and an empty storage folder lists as [].
// A count error or a storage list error is a failed check, including
// "does not exist", "schema cache", and "not found".

import { PROBE_NAME, throwawayEmailOk } from "./gate.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function throwawayUserIdOk(userId) {
  return typeof userId === "string" && UUID.test(userId);
}

export function deleteRefusal({ email, userId, loadedEmail } = {}) {
  if (!throwawayEmailOk(email)) return "email";
  if (!throwawayUserIdOk(userId)) return "uuid";
  if (loadedEmail === undefined) return "";
  if (typeof loadedEmail !== "string" || loadedEmail.toLowerCase() !== String(email).toLowerCase() || !throwawayEmailOk(loadedEmail)) {
    return "mismatch";
  }
  return "";
}

export function probeLanded(row) {
  const profile = row && row.data && row.data.profile;
  const weighIns = profile && profile.weighIns;
  return !!(profile && profile.name === PROBE_NAME && Array.isArray(weighIns) && weighIns.length > 0);
}

function statusOf(error) {
  if (!error || typeof error !== "object") return "unknown";
  return error.status || error.statusCode || "unknown";
}

export function requireCount(table, error, count) {
  if (error) throw new Error(`Could not count ${table} (status ${statusOf(error)}).`);
  if (typeof count !== "number" || Number.isNaN(count)) throw new Error(`Could not count ${table}.`);
  return count;
}

export function storageObjectNames(data) {
  if (!Array.isArray(data)) throw new Error("Could not list progress storage.");
  return data
    .map((item) => item && item.name)
    .filter((name) => typeof name === "string" && name && name !== ".emptyFolderPlaceholder");
}

export function requireStorageList(error, data) {
  if (error) throw new Error(`Could not list progress storage (status ${statusOf(error)}).`);
  return storageObjectNames(data);
}

export async function pollUntil(read, { timeoutMs, intervalMs, missing }) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await read()) return;
    if (Date.now() >= deadline) throw new Error(missing);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
