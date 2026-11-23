/* Things held in memory for whoever is using the app right now, and for no one else.

   A value is kept under the owner it was written for. It is handed back only to that same owner, and it is
   dropped when the owner signs out, deletes the account or leaves the demo, and when the app closes. Nothing
   here is saved, sent or logged. */

const held = new Map<string, { owner: string; value: unknown }>();

/** What `owner` kept under `key`, or null. A value another owner kept is never handed back. */
export function sessionMemory<T>(owner: string | null | undefined, key: string): T | null {
  const slot = held.get(key);
  return slot && !!owner && slot.owner === owner ? slot.value as T : null;
}

/** Keeps `value` under `key` for `owner` alone. Null, or no owner, clears the key. */
export function keepSessionMemory(owner: string | null | undefined, key: string, value: unknown): void {
  if (!owner || value == null) held.delete(key);
  else held.set(key, { owner, value });
}

/** Drops everything. Called when the owner leaves this phone. */
export function clearSessionMemory(): void {
  held.clear();
}
