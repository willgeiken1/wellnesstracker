// Date-range delete for one account. purge-range/index.ts serves this.
// Photos are chosen by taken_at, then removed from storage before any SQL.
// A storage error returns 500 so the client leaves the purge unsynced and retries.
// progress_photos is not deleted by purge_user_range_rows; this deletes by id.
import { addPurge, photoDue, resolveCutoff, stripRange } from "./strip.ts";

type Bag = Record<string, any>;

export async function deleteRange(admin: Bag, userId: string, body: Bag): Promise<{ status: number; body: Bag }> {
  const from = body.from;
  const to = body.to;

  const { data: row, error: readErr } = await admin.from("user_data").select("data").eq("user_id", userId).maybeSingle();
  if (readErr) return { status: 500, body: { error: "Couldn't update the account copy. Try again." } };
  const raw = (row && row.data) || {};
  const cutoff = resolveCutoff(raw, from, to, body.deletedAt ?? body.at);

  const { data: photos, error: photoErr } = await admin.from("progress_photos").select("id, path, taken_at").eq("user_id", userId).gte("day", from).lte("day", to);
  if (photoErr) return { status: 500, body: { error: "Couldn't delete that range from the account. Try again." } };

  const due = (photos || []).filter((p: Bag) => p && photoDue(p.taken_at, cutoff));
  const paths = due.map((p: Bag) => p.path).filter((p: string) => !!p);
  if (paths.length) {
    const bucket = admin.storage.from("progress");
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await bucket.remove(paths.slice(i, i + 100));
      if (error) {
        console.error("photo remove", error.message);
        return { status: 500, body: { error: "Couldn't delete that range from the account. Try again." } };
      }
    }
  }

  const ids = due.map((p: Bag) => p.id).filter((id: string) => !!id);
  if (ids.length) {
    const { error } = await admin.from("progress_photos").delete().in("id", ids).eq("user_id", userId);
    if (error) {
      console.error("photo rows", error.message);
      return { status: 500, body: { error: "Couldn't delete that range from the account. Try again." } };
    }
  }

  const { error: rpcErr } = await admin.rpc("purge_user_range_rows", { p_user: userId, p_from: from, p_to: to });
  if (rpcErr && !/could not find the function|does not exist/i.test(rpcErr.message || "")) {
    console.error("purge_user_range_rows", rpcErr.message);
    return { status: 500, body: { error: "Couldn't delete that range from the account. Try again." } };
  }
  if (rpcErr) {
    await admin.from("oura_days").delete().eq("user_id", userId).gte("day", from).lte("day", to);
  }

  const { data: again, error: againErr } = await admin.from("user_data").select("data").eq("user_id", userId).maybeSingle();
  if (againErr) return { status: 500, body: { error: "Couldn't update the account copy. Try again." } };
  const latest = (again && again.data) || {};
  const data = addPurge(stripRange(latest, from, to, cutoff), from, to, cutoff);
  const { error: writeErr } = await admin.from("user_data").upsert({
    user_id: userId,
    data,
    updated_at: new Date().toISOString(),
  });
  if (writeErr) return { status: 500, body: { error: "Couldn't update the account copy. Try again." } };

  return { status: 200, body: { ok: true, from, to } };
}
