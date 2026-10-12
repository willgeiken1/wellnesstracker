// Fail-closed checks for the throwaway purge.
// Every table in PURGE_TABLES exists, and an empty storage folder lists as [].
// A count error or a storage list error is a failed check, including
// "does not exist", "schema cache", and "not found".

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
