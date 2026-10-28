// Date-range delete for one account. purge-range/index.ts serves this.
// Photos are chosen by taken_at, then removed from storage before any SQL.
// A storage error returns 500 so the client leaves the purge unsynced and retries.
// progress_photos is not deleted by purge_user_range_rows; this deletes by id.
// The service role bypasses the bucket policy, so a path is removed only when it
// is exactly "{userId}/{file}" for this caller. Any other path is skipped.
// The caller's progress_photos rows are still deleted.
import { addPurge, photoDue, resolveCutoff, stripRange } from "./strip.ts";
import { rowSyncNotSetUp } from "./row-sync.ts";

type Bag = Record<string, any>;

function ownPhotoPath(userId: string, path: unknown): path is string {
  if (typeof userId !== "string" || userId.length === 0) return false;
  if (userId === "." || userId === ".." || userId.includes("/") || userId.includes("\\")) return false;
  if (typeof path !== "string" || path.length === 0) return false;
  if (path.includes("\\") || path.startsWith("/")) return false;
  const parts = path.split("/");
  if (parts.length !== 2) return false;
  const folder = parts[0];
  const name = parts[1];
  if (folder !== userId || folder === "." || folder === "..") return false;
  if (name.length === 0 || name === "." || name === "..") return false;
  return true;
}

// Deterministic compatibility ID for existing PWA callers without a UUID.
// Use the original request cutoff, never a timestamp generated on a retry.
async function legacyPurgeId(userId: string, from: string, to: string, cutoff: number, tz: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([userId, from, to, cutoff, tz])));
  const bytes = new Uint8Array(hash).slice(0, 16);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

export async function deleteRange(admin: Bag, userId: string, body: Bag, now = Date.now(), nativeClient?: Bag): Promise<{ status: number; body: Bag }> {
  const from = body.from;
  const to = body.to;
  const requestedCutoff = body.deletedAt !== undefined ? body.deletedAt : body.at !== undefined ? body.at : now;
  const tz = body.tz === undefined ? "UTC" : body.tz;
  const requestId = body.purgeRequestId;
  let validTimezone = typeof tz === "string" && !/^(posix\/|right\/|posixrules$|Factory$)/i.test(tz);
  try { if (validTimezone) new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(0); } catch { validTimezone = false; }
  if (!validTimezone || !Number.isSafeInteger(requestedCutoff) || requestedCutoff < 0 ||
    (requestId !== undefined && (typeof requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)))) {
    return { status: 400, body: { error: "Invalid purge request. Keep the original request ID and cutoff when retrying." } };
  }

  const { data: row, error: readErr } = await admin.from("user_data").select("data").eq("user_id", userId).maybeSingle();
  if (readErr) return { status: 500, body: { error: "Couldn't update the account copy. Try again." } };
  const raw = (row && row.data) || {};
  let cutoff = resolveCutoff(raw, from, to, requestedCutoff, now);
  let rowSync = nativeClient ? "complete" : "disabled";
  if (nativeClient) {
    const purgeId = requestId ?? await legacyPurgeId(userId, from, to, requestedCutoff, tz);
    const { error } = await nativeClient.rpc("sync_purge_range", {
      p_id: purgeId, p_from: from, p_to: to, p_cutoff_ms: requestedCutoff, p_tz: tz,
    });
    // Includes marker-version conflicts: retry a fresh transaction with the same ID/cutoff.
    if (rowSyncNotSetUp(error)) {
      rowSync = "not_set_up";
    } else if (error) {
      return { status: 500, body: { error: "Range deletion failed. Try again." } };
    } else {
      // The persisted marker is authoritative, including the server's now cap.
      // Reading it makes future-cutoff retries use the SAME cutoff on both paths.
      const { data: marker, error: markerError } = await nativeClient.from("purges")
        .select("from_day,to_day,cutoff_ms,tz").eq("id", purgeId).single();
      const storedCutoff = marker?.cutoff_ms;
      if (rowSyncNotSetUp(markerError)) {
        rowSync = "not_set_up";
      } else if (markerError || !marker || marker.from_day !== from || marker.to_day !== to || marker.tz !== tz ||
        (typeof storedCutoff !== "number" && typeof storedCutoff !== "string") ||
        !Number.isSafeInteger(Number(storedCutoff)) || Number(storedCutoff) < 0 || Number(storedCutoff) > requestedCutoff) {
        return { status: 500, body: { error: "Range deletion failed. Try again." } };
      } else {
        cutoff = Number(storedCutoff);
      }
    }
  }

  const { data: photos, error: photoErr } = await admin.from("progress_photos").select("id, path, taken_at").eq("user_id", userId).gte("day", from).lte("day", to);
  if (photoErr) return { status: 500, body: { error: "Couldn't delete that range from the account. Try again." } };

  const due = (photos || []).filter((p: Bag) => p && photoDue(p.taken_at, cutoff, now));
  const paths = due.map((p: Bag) => p.path).filter((p): p is string => ownPhotoPath(userId, p));
  if (paths.length) {
    const bucket = admin.storage.from("progress");
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await bucket.remove(paths.slice(i, i + 100));
      if (error) {
        return { status: 500, body: { error: "Couldn't delete that range from the account. Try again." } };
      }
    }
  }

  const ids = due.map((p: Bag) => p.id).filter((id: string) => !!id);
  if (ids.length) {
    const { error } = await admin.from("progress_photos").delete().in("id", ids).eq("user_id", userId);
    if (error) {
      return { status: 500, body: { error: "Couldn't delete that range from the account. Try again." } };
    }
  }

  const { error: rpcErr } = await admin.rpc("purge_user_range_rows", { p_user: userId, p_from: from, p_to: to });
  if (rpcErr && !/could not find the function|does not exist/i.test(rpcErr.message || "")) {
    return { status: 500, body: { error: "Couldn't delete that range from the account. Try again." } };
  }
  if (rpcErr) {
    const { error } = await admin.from("oura_days").delete().eq("user_id", userId).gte("day", from).lte("day", to);
    if (error) return { status: 500, body: { error: "Couldn't delete that range from the account. Try again." } };
  }

  const { data: again, error: againErr } = await admin.from("user_data").select("data").eq("user_id", userId).maybeSingle();
  if (againErr) return { status: 500, body: { error: "Couldn't update the account copy. Try again." } };
  const latest = (again && again.data) || {};
  const data = addPurge(stripRange(latest, from, to, cutoff, now), from, to, cutoff, now);
  const { error: writeErr } = await admin.from("user_data").upsert({
    user_id: userId,
    data,
    updated_at: new Date().toISOString(),
  });
  if (writeErr) return { status: 500, body: { error: "Couldn't update the account copy. Try again." } };

  return { status: 200, body: { ok: true, from, to, rowSync } };
}
