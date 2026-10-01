// oura-connect: starts the Oura login for the signed-in user, or disconnects Oura.
// Deploy with JWT verification OFF; this function checks the user's sign-in itself.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function serverKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (keys.default) return keys.default;
    const first = Object.values(keys)[0];
    if (typeof first === "string") return first;
  } catch { /* fall back to the legacy key */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
}
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, serverKey(), { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ error: "Not signed in" }, 401);

    const body = await req.json().catch(() => ({}));
    if (body.action === "disconnect") {
      await admin.from("oura_tokens").delete().eq("user_id", user.id);
      await admin.from("oura_days").delete().eq("user_id", user.id);
      await admin.from("oura_connections").delete().eq("user_id", user.id);
      return json({ ok: true });
    }

    const clientId = Deno.env.get("OURA_CLIENT_ID");
    if (!clientId) return json({ error: "OURA_CLIENT_ID secret is missing" }, 500);

    // Clear out abandoned logins older than an hour, then start a new one.
    await admin.from("oura_oauth_states").delete().lt("created_at", new Date(Date.now() - 3600_000).toISOString());
    const state = crypto.randomUUID();
    const { error } = await admin.from("oura_oauth_states").insert({ state, user_id: user.id });
    if (error) return json({ error: error.message }, 500);

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: `${SUPABASE_URL}/functions/v1/oura-callback`,
      scope: "daily personal heartrate workout",
      state,
    });
    return json({ url: `https://cloud.ouraring.com/oauth/authorize?${params}` });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
