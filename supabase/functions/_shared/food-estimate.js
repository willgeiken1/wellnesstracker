/* Turn a Claude reply into the meal-item shape both photo and describe use. */

function num(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 5000) : 0;
}

export function parseFoodEstimate(text) {
  const match = String(text || "").match(/\{[\s\S]*\}/);
  if (!match) return null;
  let parsed;
  try { parsed = JSON.parse(match[0]); }
  catch (e) { return null; }
  const items = (Array.isArray(parsed.items) ? parsed.items : []).slice(0, 12).map((it) => ({
    name: String((it && it.name) || "Food").slice(0, 80),
    portion: String((it && it.portion) || "").slice(0, 60),
    grams: num(it && it.grams),
    calories: num(it && it.calories),
    protein: num(it && it.protein),
    carbs: num(it && it.carbs),
    fat: num(it && it.fat),
  }));
  return { items, notes: String(parsed.notes || "").slice(0, 300) };
}
