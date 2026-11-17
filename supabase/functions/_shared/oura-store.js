// Saving synced Oura days so a Disconnect always wins. A sync can be fetching from Oura while the person
// disconnects (on this phone or another device). Disconnect deletes the tokens first, then the days, then the
// connection. So a sync checks, after it writes, that the tokens are still there and the connection is the
// same one it started with; if not, it takes back the days it just wrote. A sync for an older connection never
// replaces a newer connection's days. Plain JS so node tests can run it.

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

/** A stamp no other sync's write shares: the time to the microsecond, the last three digits random. */
export function writeStamp(now = new Date()) {
  return now.toISOString().replace("Z", `${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}Z`);
}

/** Saves the days, then keeps them only if the same connection is still there. Returns how many were kept.
 * Each row records the connection that wrote it (`data.conn`). A day not stored yet is added; a stored day is
 * rewritten only while it belongs to this connection or an older one, so an old sync can never replace a day a
 * newer connection's sync already saved, whenever that sync ran. */
export async function saveDays(admin, userId, mark, rows) {
  if (!rows.length) return 0;
  if (!(await stillConnected(admin, userId, mark))) return 0;
  // Every row this sync writes carries its own stamp, so taking them back can't touch a newer sync's rows.
  const stamp = writeStamp();
  const own = rows.map((r) => ({ ...r, data: { ...(r.data ?? {}), conn: mark }, updated_at: stamp }));
  // Rows saved before connections were recorded have no `conn`; they belong to whoever is syncing now.
  const ours = `data->>conn.is.null,data->>conn.lte.${JSON.stringify(mark)}`;
  // A day can vanish between the add and the rewrite (an older sync taking back its own rows), so a rewrite that
  // matches nothing tries the add again. A day a newer connection owns matches neither and is left alone.
  let pending = own;
  for (let round = 0; round < 3 && pending.length; round++) {
    const { data: added, error } = await admin.from("oura_days")
      .upsert(pending, { onConflict: "user_id,day", ignoreDuplicates: true }).select("day");
    if (error) throw new Error(error.message);
    const isNew = new Set((added ?? []).map((r) => String(r.day)));
    const stored = pending.filter((r) => !isNew.has(String(r.day)));
    const missed = [];
    for (let i = 0; i < stored.length; i += 10) {
      const batch = stored.slice(i, i + 10);
      const results = await Promise.all(batch.map((r) => admin.from("oura_days")
        .update({ data: r.data, updated_at: stamp }).eq("user_id", userId).eq("day", r.day).or(ours).select("day")));
      results.forEach((result, j) => {
        if (result.error) throw new Error(result.error.message);
        if (!result.data?.length) missed.push(batch[j]);
      });
    }
    pending = missed;
  }
  if (await stillConnected(admin, userId, mark)) {
    // Still this connection, yet some days never stuck: report it, so the sync isn't marked as done.
    if (pending.length) throw new Error("Some Oura days couldn't be saved. They'll be tried again on the next sync.");
    return rows.length;
  }
  // Disconnected (or reconnected) while writing: take back exactly the rows this sync wrote and nobody has
  // rewritten since. A sync for a new connection may already have saved the same days; those stay.
  const { error: undoError } = await admin.from("oura_days").delete().eq("user_id", userId).in("day", rows.map((r) => r.day)).eq("updated_at", stamp);
  if (undoError) throw new Error("Oura was disconnected during a sync, and its days couldn't be removed. Try disconnecting again.");
  return 0;
}
