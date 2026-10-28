// purge-range: deletes one person's data between two dates, keeps the account.
// Body: { from, to, deletedAt?: cutoff ms, purgeRequestId?: UUID v4, tz?: IANA zone } inclusive.
// Retries must retain the original cutoff and request ID. Legacy callers default to UTC and a server-generated cutoff.
// Strips logs in user_data (workouts, food, cardio, measurements, weigh-ins,
// plan, check-ins), deletes Oura days, and progress photos taken at or before
// the delete. A photo taken in the range after the delete stays.
// Safe to retry. Deploy with JWT verification OFF. No extra secrets.
import { admin, cors, json, requireUser, userClient, validDay } from "../_shared/http.ts";
import { deleteRange } from "../_shared/range.ts";

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

    // Native schema is optional until deployed; legacy deletion always runs.
    const result = await deleteRange(admin, user.id, body, Date.now(), Deno.env.get("ROW_SYNC_ENABLED") === "true" ? userClient(req) : undefined);
    return json(result.body, result.status);
  } catch {
    return json({ error: "Couldn't delete that range. Try again." }, 500);
  }
});
