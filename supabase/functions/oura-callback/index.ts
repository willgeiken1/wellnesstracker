// oura-callback: Oura sends the browser here after you approve access.
// Swaps the one-time code for tokens, stores them privately, then sends you back to the app:
// the iPhone app (insight://oura) when the login was started there, otherwise the web logger.
// Deploy with JWT verification OFF (Oura can't sign in to Supabase).
import { createClient } from "npm:@supabase/supabase-js@2";

const APP_URL = Deno.env.get("APP_URL") ?? "https://willgeiken1.github.io/wellnesstracker/logger/";

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
// Must match oura-connect. Only picks one of two fixed places to return to, so it is safe to read before
// the state is checked; the state itself is still checked against the table below.
const APP_STATE_PREFIX = "app.";
const PHONE_RETURN = "insight://oura";
const backTo = (phone: boolean) => (status: string) =>
  new Response(null, { status: 302, headers: { Location: `${phone ? PHONE_RETURN : APP_URL}?oura=${status}` } });

Deno.serve(async (req) => {
  let back = backTo(false);
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    back = backTo(!!state?.startsWith(APP_STATE_PREFIX));
    if (url.searchParams.get("error") || !code || !state) return back("cancelled");

    // The state must match a login this server started in the last 15 minutes.
    const { data: st } = await admin.from("oura_oauth_states").select("user_id, created_at").eq("state", state).maybeSingle();
    await admin.from("oura_oauth_states").delete().eq("state", state);
    if (!st || Date.now() - new Date(st.created_at).getTime() > 15 * 60_000) return back("expired");

    const res = await fetch("https://api.ouraring.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${SUPABASE_URL}/functions/v1/oura-callback`,
        client_id: Deno.env.get("OURA_CLIENT_ID") ?? "",
        client_secret: Deno.env.get("OURA_CLIENT_SECRET") ?? "",
      }),
    });
    if (!res.ok) {
      console.error("Oura token exchange failed", res.status, await res.text());
      return back("error");
    }
    const t = await res.json();
    const now = new Date().toISOString();
    const { error: tokenError } = await admin.from("oura_tokens").upsert({
      user_id: st.user_id,
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      expires_at: new Date(Date.now() + (t.expires_in ?? 86400) * 1000).toISOString(),
      updated_at: now,
    });
    // Only say "connected" when both saves worked; otherwise the app would show Oura on with nothing to sync.
    if (tokenError) { console.error("Oura token save failed"); return back("error"); }
    // last_sync stays empty so the app runs a full first sync the next time it opens.
    const { error: connectionError } = await admin.from("oura_connections").upsert({ user_id: st.user_id, connected_at: now, last_sync: null, last_error: null });
    if (connectionError) {
      console.error("Oura connection save failed");
      await admin.from("oura_tokens").delete().eq("user_id", st.user_id);
      return back("error");
    }
    return back("connected");
  } catch (e) {
    console.error(e);
    return back("error");
  }
});
