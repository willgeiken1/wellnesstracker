// food-photo: estimates foods + macros from a meal photo using Claude.
// Body: { image: <base64 JPEG, no data: prefix>, hint?: string, localDate: "YYYY-MM-DD", timeZone: "America/Chicago" }
// The daily cap is 10 photos, counted on the phone's local date. The limit is enforced
// atomically by consume_ai_quota (describe, at 20, uses the same function).
// Secrets: ANTHROPIC_API_KEY (required), FOOD_MODEL (optional, default claude-haiku-4-5-20251001)
// Deploy with JWT verification OFF; this function checks the user's sign-in itself.
import { cors, json, requireUser } from "../_shared/http.ts";
import { FOOD_MODEL_ID } from "../_shared/food-model.js";
import { consumeQuota, PHOTO_KIND, releaseQuota, resolveQuotaDay } from "../_shared/quota.ts";

const MODEL = (Deno.env.get("FOOD_MODEL") ?? "").trim() || FOOD_MODEL_ID;

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
    const user = await requireUser(req);
    if (!user) return json({ error: "Sign in to analyze food photos." }, 401);
    userId = user.id;

    const body = await req.json().catch(() => ({}));
    const image = typeof body.image === "string" ? body.image : "";
    if (!image || image.length > 2_000_000) return json({ error: "That photo is missing or too large." }, 400);
    const hint = typeof body.hint === "string" ? body.hint.slice(0, 300) : "";

    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) return json({ error: "Food photos aren't set up yet (missing API key)." }, 500);

    const when = resolveQuotaDay(body.localDate, body.timeZone);
    if ("error" in when) return json({ error: when.error }, 400);
    day = when.day;

    // One atomic increment. A failed estimate is given back below.
    const quota = await consumeQuota(userId, day, PHOTO_KIND);
    if (!quota.allowed) {
      return json({
        error: `You've used all ${quota.limit} food photos for today. Add the rest by barcode or manually.`,
        code: "limit",
        remaining: 0,
        limit: quota.limit,
      }, 429);
    }
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
    return json({
      items,
      notes: String(parsed.notes ?? "").slice(0, 300),
      remaining: quota.remaining,
      limit: quota.limit,
    });
  } catch (e) {
    // Failed analyses don't count against the daily limit.
    if (counted && userId && day) await releaseQuota(userId, day, PHOTO_KIND);
    const msg = e instanceof Error ? e.message : String(e);
    if (/consume_ai_quota|could not find the function/i.test(msg)) {
      return json({ error: "Food photo limits aren't set up yet." }, 500);
    }
    return json({ error: msg }, 500);
  }
});
