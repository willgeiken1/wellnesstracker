// delete-account: permanently deletes the signed-in user.
// Body: { "confirm": "DELETE" }
// Removes storage files, every public table row with their user_id
// (user_data, oura_days, oura_connections, oura_tokens, oura_oauth_states,
// progress_photos, ai_usage, and any later table that has user_id), then
// the auth user. Safe to retry: deleting something that is already gone succeeds.
// Deploy with JWT verification OFF. No extra secrets; uses the service key.
import { admin, cors, json, requireUser, userStillExists, wipeStoragePrefix } from "../_shared/http.ts";

const KNOWN = ["user_data", "oura_days", "oura_connections", "oura_tokens", "oura_oauth_states", "progress_photos", "ai_usage"];

async function deleteKnown(userId: string) {
  for (const table of KNOWN) {
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error && !/does not exist|schema cache|could not find the table/i.test(error.message || "")) {
      console.error("delete", table, error.message);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only." }, 405);
  try {
    const user = await requireUser(req);
    if (!user) return json({ error: "Sign in to delete your account." }, 401);

    const body = await req.json().catch(() => ({}));
    if (body.confirm !== "DELETE") return json({ error: "Type DELETE to confirm." }, 400);

    // Storage first so a retry can still find the folder if the auth user lingers.
    await wipeStoragePrefix(user.id);
    await deleteKnown(user.id);

    const { error: rpcErr } = await admin.rpc("delete_user_rows", { p_user: user.id });
    if (rpcErr && !/could not find the function|does not exist/i.test(rpcErr.message || "")) {
      console.error("delete_user_rows", rpcErr.message);
      return json({ error: "Couldn't finish deleting stored data. Try again." }, 500);
    }

    await wipeStoragePrefix(user.id);

    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr && !/not found/i.test(delErr.message || "")) {
      if (await userStillExists(user.id)) return json({ error: "Couldn't delete the sign-in. Try again." }, 500);
    }

    // One more pass in case a row was written between the deletes and the auth removal.
    await deleteKnown(user.id);
    await wipeStoragePrefix(user.id);
    if (await userStillExists(user.id)) return json({ error: "Account deletion didn't finish. Try again." }, 500);

    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: "Couldn't delete the account. Try again." }, 500);
  }
});
