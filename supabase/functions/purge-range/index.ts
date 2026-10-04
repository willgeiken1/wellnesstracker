// purge-range: deletes one person's data between two dates, keeps the account.
// Body: { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" } inclusive.
// Strips logs in user_data (workouts, food, cardio, measurements, weigh-ins,
// plan, check-ins), deletes Oura days, progress photo rows and files, and any
// later dated table the migration knows about. Safe to retry.
// Deploy with JWT verification OFF. No extra secrets.
import { admin, cors, json, requireUser, validDay } from "../_shared/http.ts";
import { addPurge, stripRange } from "../_shared/strip.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only." }, 405);
  try {
    const user = await requireUser(req);
    if (!user) return json({ error: "Sign in to delete a date range from your account." }, 401);

    const body = await req.json().catch(() => ({}));
    const from = body.from;
    const to = body.to;
    if (!validDay(from) || !validDay(to) || from > to) return json({ error: "Choose a start date and an end date." }, 400);
    if (from < "1970-01-01" || to > "2100-01-01") return json({ error: "That date range isn't valid." }, 400);

    const { data: photos } = await admin.from("progress_photos").select("id, path").eq("user_id", user.id).gte("day", from).lte("day", to);
    const paths = (photos || []).map((p) => p.path).filter((p): p is string => !!p);
    if (paths.length) {
      const bucket = admin.storage.from("progress");
      for (let i = 0; i < paths.length; i += 100) {
        const { error } = await bucket.remove(paths.slice(i, i + 100));
        if (error) console.error("photo remove", error.message);
      }
    }

    const { error: rpcErr } = await admin.rpc("purge_user_range_rows", { p_user: user.id, p_from: from, p_to: to });
    if (rpcErr && !/could not find the function|does not exist/i.test(rpcErr.message || "")) {
      console.error("purge_user_range_rows", rpcErr.message);
      return json({ error: "Couldn't delete that range from the account. Try again." }, 500);
    }
    if (rpcErr) {
      // Migration not applied yet: still delete the tables this app knows about.
      await admin.from("oura_days").delete().eq("user_id", user.id).gte("day", from).lte("day", to);
      await admin.from("progress_photos").delete().eq("user_id", user.id).gte("day", from).lte("day", to);
    }

    const { data: row, error: readErr } = await admin.from("user_data").select("data").eq("user_id", user.id).maybeSingle();
    if (readErr) return json({ error: "Couldn't update the account copy. Try again." }, 500);
    const data = addPurge(stripRange((row && row.data) || {}, from, to), from, to);
    const { error: writeErr } = await admin.from("user_data").upsert({
      user_id: user.id,
      data,
      updated_at: new Date().toISOString(),
    });
    if (writeErr) return json({ error: "Couldn't update the account copy. Try again." }, 500);

    return json({ ok: true, from, to });
  } catch (e) {
    console.error(e);
    return json({ error: "Couldn't delete that range. Try again." }, 500);
  }
});
