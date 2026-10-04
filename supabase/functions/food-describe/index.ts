// food-describe: estimates foods + macros from a written meal using Claude.
// Body: { text: string, localDate: "YYYY-MM-DD", timeZone: "America/Chicago" }
// Cap is 20 descriptions a day, on the phone's local date, via consume_ai_quota.
// A failed estimate is given back. The description is not stored.
// Secrets: ANTHROPIC_API_KEY (required), FOOD_MODEL (optional, default claude-sonnet-5-5)
// Deploy with JWT verification OFF; this function checks the user's sign-in itself.
import { cors, json, requireUser } from "../_shared/http.ts";
import { parseFoodEstimate } from "../_shared/food-estimate.js";
import { consumeQuota, DESCRIBE_KIND, releaseQuota, resolveQuotaDay } from "../_shared/quota.ts";

const MODEL = Deno.env.get("FOOD_MODEL") ?? "claude-sonnet-5-5";

const PROMPT = `You estimate nutrition from a written meal description for a fitness app.
Split it into each distinct food or drink and estimate its portion and nutrition.
Respond with ONLY a JSON object and no other text, in exactly this shape:
{"items":[{"name":"Eggs","portion":"2 large","grams":100,"calories":156,"protein":12,"carbs":1,"fat":11}],"notes":"Short note about anything uncertain"}
Rules: protein, carbs and fat are grams. Use typical cooked values. If a portion is unclear, give your best typical estimate and say so in notes.
Count each item the person names. If they give a count, such as two eggs, use that count.
If the text is not a meal, return {"items":[],"notes":"No food found in the description"}.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let userId: string | null = null, counted = false, day = "";
  try {
    const user = await requireUser(req);
    if (!user) return json({ error: "Sign in to describe a meal." }, 401);
    userId = user.id;

    const body = await req.json().catch(() => ({}));
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (text.length < 2) return json({ error: "Describe the meal in a few words." }, 400);
    if (text.length > 800) return json({ error: "That description is too long. Keep it to one meal." }, 400);

    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) return json({ error: "Meal descriptions aren't set up yet (missing API key)." }, 500);

    const when = resolveQuotaDay(body.localDate, body.timeZone);
    if ("error" in when) return json({ error: when.error }, 400);
    day = when.day;

    const quota = await consumeQuota(userId, day, DESCRIBE_KIND);
    if (!quota.allowed) {
      return json({
        error: `You've used all ${quota.limit} descriptions for today. Add the rest by barcode or manually.`,
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
        messages: [{ role: "user", content: [{ type: "text", text: PROMPT + "\nThe meal: " + text }] }],
      }),
    });
    if (!res.ok) {
      console.error("Claude API error", res.status, await res.text());
      throw new Error("The food analysis service didn't respond. Try again in a moment.");
    }
    const data = await res.json();
    const reply = (data.content ?? []).filter((b: { type?: string }) => b.type === "text").map((b: { text?: string }) => b.text || "").join("");
    const parsed = parseFoodEstimate(reply);
    if (!parsed) throw new Error("Couldn't read the estimate. Try describing the meal again.");
    return json({ items: parsed.items, notes: parsed.notes, remaining: quota.remaining, limit: quota.limit });
  } catch (e) {
    if (counted && userId && day) await releaseQuota(userId, day, DESCRIBE_KIND);
    const msg = e instanceof Error ? e.message : String(e);
    if (/consume_ai_quota|could not find the function/i.test(msg)) {
      return json({ error: "Meal descriptions aren't set up yet." }, 500);
    }
    return json({ error: msg }, 500);
  }
});
