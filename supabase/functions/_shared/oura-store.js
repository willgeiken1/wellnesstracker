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

// When Oura takes back Insight's access (the person removed Insight in their Oura account, or Oura revoked it),
// the Oura API agreement wants the stored Oura data gone. Insight deletes it, the same as Disconnect, but keeps the
// connection row so the app says the login expired and offers Reconnect Oura. Every message here starts with
// "Oura login expired" because that is what the app and the web logger read as "reconnect needed".
export const REVOKED = "Oura login expired: Oura no longer allows Insight access, so the Oura days Insight stored were deleted. Reconnect Oura in the app to sync again.";

/** Oura turned an access token down (HTTP 401). */
export class OuraUnauthorized extends Error {}

/** True only when Oura's token endpoint says the login itself is no good (OAuth `invalid_grant`). A wrong app key
 * (`invalid_client`), a rate limit or an outage is not a revoke, so it never deletes anyone's days. */
export function isRevokedGrant(status, body) {
  return (status === 400 || status === 401) && !!body && typeof body === "object" && body.error === "invalid_grant";
}

/** Shown while a revoked connection's days are still being deleted. Thrown by every failed step after the login is
 * gone, so the sync's own error handler writes it back and the next sync, which finds no login, finishes the job. */
export const DELETING = "Oura login expired: Oura no longer allows Insight access, and the Oura days Insight stored are still being deleted. Reconnect Oura in the app to sync again.";

/** Deletes what Oura no longer allows Insight to keep: the revoked login and the days this connection (or an
 * older one) stored. A reconnect that already saved a new login and new days keeps them: only the exact revoked
 * refresh token is deleted, and only days whose `data.conn` is this connection's mark or older (or unmarked).
 * The order is Disconnect's: the login goes first, so a sync still writing days sees it gone and takes its rows
 * back (`saveDays`), and only then are the days deleted. The connection is marked DELETING before the login goes,
 * so if the days delete fails, a later sync finishes it without a login (see `finishRevoked`). */
export async function forgetRevoked(admin, userId, mark, refreshToken) {
  const pending = await admin.from("oura_connections").update({ last_error: DELETING }).eq("user_id", userId).eq("connected_at", mark);
  if (pending.error) throw new Error("Oura access was removed, and its login couldn't be deleted yet. It will be tried again on the next sync.");
  const token = await admin.from("oura_tokens").delete().eq("user_id", userId).eq("refresh_token", refreshToken);
  if (token.error) throw new Error(DELETING);
  return deleteRevokedDays(admin, userId, mark);
}

async function deleteRevokedDays(admin, userId, mark) {
  const days = await admin.from("oura_days").delete().eq("user_id", userId).or(`data->>conn.is.null,data->>conn.lte.${JSON.stringify(mark)}`);
  if (days.error) throw new Error(DELETING);
  await admin.from("oura_connections").update({ last_error: REVOKED }).eq("user_id", userId).eq("connected_at", mark);
}

/** A sync that finds no Oura login. If this connection's revoke cleanup was cut short, it deletes the days now.
 * Always throws. */
export async function finishRevoked(admin, userId, mark) {
  const { data: conn } = await admin.from("oura_connections").select("connected_at, last_error").eq("user_id", userId).maybeSingle();
  if (!conn || String(conn.connected_at) !== mark || conn.last_error !== DELETING) throw new Error("Oura isn't connected");
  await deleteRevokedDays(admin, userId, mark);
  throw new Error(REVOKED);
}

/** A short, one-way tag for a refresh token, so two refusals can be matched without storing the token. */
export async function loginTag(refreshToken) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(refreshToken))));
  return Array.from(bytes.slice(0, 4), (b) => b.toString(16).padStart(2, "0")).join("");
}
const suspectMessage = (tag) => `Oura login expired. Reconnect Oura in the app. (check ${tag})`;

/** Oura refused this login. A single refusal can be a race: two syncs refreshing the same single-use token at once,
 * where the loser hears `invalid_grant` before the winner has saved the new login, or a fresh access token that a
 * parallel refresh has just replaced. So the first refusal only marks the connection (with a tag of the refused
 * login) and deletes nothing; a winner's save, or any later sync that works, clears the mark. Only when a later sync
 * is refused again the same way is the data deleted: `key` names the way (by default the refused refresh token).
 * Always throws. */
export async function refused(admin, userId, mark, refreshToken, key = refreshToken) {
  const tag = await loginTag(key);
  const { data: conn } = await admin.from("oura_connections").select("connected_at, last_error").eq("user_id", userId).maybeSingle();
  if (!conn || String(conn.connected_at) !== mark) throw new Error("Oura isn't connected");
  // A cleanup already under way (its login delete failed) goes on straight away.
  if (conn.last_error === suspectMessage(tag) || conn.last_error === DELETING) {
    await forgetRevoked(admin, userId, mark, refreshToken);
    throw new Error(REVOKED);
  }
  await admin.from("oura_connections").update({ last_error: suspectMessage(tag) }).eq("user_id", userId).eq("connected_at", mark);
  throw new Error(suspectMessage(tag));
}

const usable = (t, now) => new Date(t.expires_at).getTime() > now + 120_000;
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

/** A valid access token, refreshed first if it is about to expire, or when `force` is set because Oura turned the
 * current one down. Oura refresh tokens are single-use, so the new one is always saved. `exchange(refreshToken)`
 * asks Oura's token endpoint and returns its Response. When Oura answers `invalid_grant`, another sync may have
 * just spent the token: its new login is waited for briefly and used. Otherwise see `refused`. */
export async function accessToken(admin, userId, mark, exchange, { force = false, now = Date.now(), wait = pause, waits = 6 } = {}) {
  const { data: t } = await admin.from("oura_tokens").select("*").eq("user_id", userId).maybeSingle();
  if (!t) return finishRevoked(admin, userId, mark);
  if (!force && usable(t, now)) return t.access_token;

  const res = await exchange(t.refresh_token);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    if (isRevokedGrant(res.status, body)) {
      for (let i = 0; i <= waits; i++) {
        const { data: latest } = await admin.from("oura_tokens").select("*").eq("user_id", userId).maybeSingle();
        if (latest && latest.refresh_token !== t.refresh_token) return latest.access_token;
        if (i < waits) await wait(500);
      }
      return refused(admin, userId, mark, t.refresh_token);
    }
    throw new Error(`Oura login expired. Reconnect Oura in the app. (${res.status})`);
  }
  const n = await res.json();
  // Oura has already used up the old refresh token, so the new one must be kept: try the save twice.
  const fresh = {
    access_token: n.access_token,
    refresh_token: n.refresh_token ?? t.refresh_token,
    expires_at: new Date(now + (n.expires_in ?? 86400) * 1000).toISOString(),
    updated_at: new Date(now).toISOString(),
  };
  let saved = await admin.from("oura_tokens").update(fresh).eq("user_id", userId);
  if (saved.error) saved = await admin.from("oura_tokens").update(fresh).eq("user_id", userId);
  if (saved.error) throw new Error("Couldn't save the new Oura login. Reconnect Oura in the app if this keeps happening.");
  return n.access_token;
}

/** Runs `read(token)` with a valid token. If Oura turns the token down (OuraUnauthorized), gets a new one once and
 * tries again. Turned down again with a login Oura has just issued counts as a refusal (see `refused`). */
export async function readWithAccess(admin, userId, mark, exchange, read, opts = {}) {
  try {
    return await read(await accessToken(admin, userId, mark, exchange, opts));
  } catch (e) {
    if (!(e instanceof OuraUnauthorized)) throw e;
  }
  try {
    return await read(await accessToken(admin, userId, mark, exchange, { ...opts, force: true }));
  } catch (e) {
    if (!(e instanceof OuraUnauthorized)) throw e;
    const { data: t } = await admin.from("oura_tokens").select("refresh_token").eq("user_id", userId).maybeSingle();
    if (!t) throw new Error("Oura isn't connected");
    // Each forced refresh issues a new refresh token, so this way of being refused is matched by connection instead.
    return refused(admin, userId, mark, t.refresh_token, `401 after a new login:${mark}`);
  }
}
