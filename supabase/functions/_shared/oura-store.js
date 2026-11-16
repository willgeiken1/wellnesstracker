// Saving synced Oura days so a Disconnect always wins. A sync can be fetching from Oura while the person
// disconnects (on this phone or another device). Disconnect deletes the tokens first, then the days, then the
// connection. So a sync checks, after it writes, that the tokens are still there and the connection is the
// same one it started with; if not, it takes back the days it just wrote. Plain JS so node tests can run it.

/** The connection a sync starts from: when it was made, or null when Oura isn't connected. */
export async function connectionMark(admin, userId) {
  const { data, error } = await admin.from("oura_connections").select("connected_at").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Couldn't read the Oura connection.");
  return data ? String(data.connected_at) : null;
}

/** True while the tokens exist and the connection is still the one marked at the start. */
export async function stillConnected(admin, userId, mark) {
  const [{ data: token, error: tokenError }, current] = await Promise.all([
    admin.from("oura_tokens").select("user_id").eq("user_id", userId).maybeSingle(),
    connectionMark(admin, userId),
  ]);
  if (tokenError) throw new Error("Couldn't read the Oura connection.");
  return !!token && mark !== null && current === mark;
}

/** Upserts the days, then keeps them only if the same connection is still there. Returns how many were kept. */
export async function saveDays(admin, userId, mark, rows) {
  if (!rows.length) return 0;
  if (!(await stillConnected(admin, userId, mark))) return 0;
  const { error } = await admin.from("oura_days").upsert(rows, { onConflict: "user_id,day" });
  if (error) throw new Error(error.message);
  if (await stillConnected(admin, userId, mark)) return rows.length;
  // Disconnected (or reconnected) while writing: take back exactly what this sync wrote.
  const { error: undoError } = await admin.from("oura_days").delete().eq("user_id", userId).in("day", rows.map((r) => r.day));
  if (undoError) throw new Error("Oura was disconnected during a sync, and its days couldn't be removed. Try disconnecting again.");
  return 0;
}
