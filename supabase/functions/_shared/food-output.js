/* Strict shape for a describe-it reply.
   Same object the food prompt asks for. zod safeParse checks it.
   The AI SDK and provider keys are not used. A failed check returns
   null so the caller can send a safe error and skip the write. */
import { z } from "zod";

const macro = z.number().finite().min(0).max(5000);

export const describeEstimateSchema = z.object({
  items: z.array(z.object({
    name: z.string().trim().min(1).max(80),
    portion: z.string().trim().max(60),
    grams: macro,
    calories: macro,
    protein: macro,
    carbs: macro,
    fat: macro,
  }).strict()).max(12),
  notes: z.string().trim().max(300),
}).strict();

function roundMacro(n) {
  const rounded = Math.round(n);
  if (!Number.isFinite(rounded) || rounded < 0 || rounded > 5000) return null;
  return rounded;
}

export function readDescribeEstimate(text) {
  const match = String(text ?? "").match(/\{[\s\S]*\}/);
  if (!match) return null;
  let raw;
  try { raw = JSON.parse(match[0]); }
  catch { return null; }
  const parsed = describeEstimateSchema.safeParse(raw);
  if (!parsed.success) return null;
  const items = [];
  for (const it of parsed.data.items) {
    const grams = roundMacro(it.grams);
    const calories = roundMacro(it.calories);
    const protein = roundMacro(it.protein);
    const carbs = roundMacro(it.carbs);
    const fat = roundMacro(it.fat);
    if (grams == null || calories == null || protein == null || carbs == null || fat == null) return null;
    items.push({
      name: it.name,
      portion: it.portion,
      grams,
      calories,
      protein,
      carbs,
      fat,
    });
  }
  return { items, notes: parsed.data.notes };
}
