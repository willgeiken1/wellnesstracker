// food-photo: estimates foods + macros from a meal photo using Claude.
// Body: { image: <base64 JPEG, no data: prefix>, hint?: string }
// Secrets: ANTHROPIC_API_KEY (required), FOOD_MODEL (optional, default claude-sonnet-5-5), FOOD_DAILY_LIMIT (optional, default 15)
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
const admin = createClient(Deno.env.get("SUPABASE_URL")!, serverKey(), { auth: { persistSession: false } });
const MODEL = Deno.env.get("FOOD_MODEL") ?? "claude-sonnet-5-5";
const DAILY_LIMIT = Number(Deno.env.get("FOOD_DAILY_LIMIT") ?? 15);

const PROMPT = `You estimate nutrition from meal photos for a fitness app.
Identify each distinct food or drink you can see and estimate its portion and nutrition.
Respond with ONLY a JSON object and no other text, in exactly this shape:
{"items":[{"name":"Grilled chicken breast","portion":"about 6 oz","grams":170,"calories":280,"protein":52,"carbs":0,"fat":6}],"notes":"Short note about anything uncertain"}
Rules: protein, carbs and fat are grams. Use typical cooked values. If a portion is unclear, give your best typical estimate and say so in notes.
Assume a normal amount of cooking oil only if the food is visibly fried or glossy. If no food is visible, return {"items":[],"notes":"No food found in the photo"}.`;

const num = (v: unknown) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 0 ? Math.min(n, 5000) : 0; };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let userId: string | null = null, counted = false, day = "";
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ error: "Sign in to analyze food photos." }, 401);
    userId = user.id;

    const body = await req.json().catch(() => ({}));
    const image = typeof body.image === "string" ? body.image : "";
    if (!image || image.length > 2_000_000) return json({ error: "That photo is missing or too large." }, 400);
    const hint = typeof body.hint === "string" ? body.hint.slice(0, 300) : "";

    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) return json({ error: "Food photos aren't set up yet (missing API key)." }, 500);

    // Server-side daily limit, so a bug or a busy day can never run up a surprise bill.
    day = new Date().toISOString().slice(0, 10);
    const { data: u } = await admin.from("ai_usage").select("count").eq("user_id", userId).eq("day", day).maybeSingle();
    const used = u?.count ?? 0;
    if (used >= DAILY_LIMIT) return json({ error: `You've used all ${DAILY_LIMIT} food photos for today. Add the rest by barcode or manually.`, code: "limit" }, 429);
    await admin.from("ai_usage").upsert({ user_id: userId, day, count: used + 1 });
    counted = true;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
            { type: "text", text: PROMPT + (hint ? `\nThe user adds: ${hint}` : "") },
          ],
        }],
      }),
    });
    if (!res.ok) {
      console.error("Claude API error", res.status, await res.text());
      throw new Error("The food analysis service didn't respond. Try again in a moment.");
    }
    const data = await res.json();
    const text = (data.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Couldn't read the analysis. Try another photo.");
    const parsed = JSON.parse(match[0]);
    const items = (Array.isArray(parsed.items) ? parsed.items : []).slice(0, 12).map((it: any) => ({
      name: String(it.name ?? "Food").slice(0, 80),
      portion: String(it.portion ?? "").slice(0, 60),
      grams: num(it.grams),
      calories: num(it.calories), protein: num(it.protein), carbs: num(it.carbs), fat: num(it.fat),
    }));
    return json({ items, notes: String(parsed.notes ?? "").slice(0, 300) });
  } catch (e) {
    // Failed analyses don't count against the daily limit.
    if (counted && userId) {
      const { data: u } = await admin.from("ai_usage").select("count").eq("user_id", userId).eq("day", day).maybeSingle();
      if (u?.count) await admin.from("ai_usage").update({ count: u.count - 1 }).eq("user_id", userId).eq("day", day);
    }
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
