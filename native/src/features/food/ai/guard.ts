import { t } from '../../../i18n/en';
// Phone mirror of supabase/functions/_shared/strip.ts food guard.
// Shared fixtures: native/fixtures/food-ai-guard.json; parity checked in tests.
// Fail-closed allowlist for food-describe and food-photo.
// The only outbound body is the fixed prompt plus the meal text, or that prompt
// plus the meal photo. Any other key, including a nested health or wearable key,
// throws before the model client runs. Image bytes are the photo itself and are
// not scanned as text. Allowed keys:
// model, max_tokens — which model and the fixed reply cap
// messages, role, content, type, text — the prompt and the meal text
// source, media_type, data — the meal photo
export const FOOD_AI_ALLOWED_KEYS = Object.freeze([
  "model", "max_tokens", "messages", "role", "content", "type", "text", "source", "media_type", "data",
]);

const FOOD_AI_ALLOWED = new Set<string>(FOOD_AI_ALLOWED_KEYS);

const FOOD_AI_FORBIDDEN = new Set([
  "oura", "readiness", "sleep", "hrv", "weight", "mood", "stress", "rhr", "steps",
  "sleepscore", "averagehrv", "totalsleepduration", "lowestheartrate", "temperaturedeviation",
  "userdata", "restinghr", "bodyweight",
]);

export class FoodAiPayloadError extends Error {
  constructor() {
    super(t('foodAiBlocked'));
    this.name = "FoodAiPayloadError";
  }
}

const FOOD_AI_IGNORABLE = /[\p{Default_Ignorable_Code_Point}\p{Cf}]/gu;

/* Line and paragraph separators are word breaks, never stripped. The second
   strip covers anything NFKC might map to an ignorable. Combining marks are
   dropped after NFD, so "weíght" and "we\u0300ight" read as weight. */
function foodAiNormalize(value: string): string {
  return String(value)
    .replace(/[\u2028\u2029]/g, " ")
    .replace(FOOD_AI_IGNORABLE, "")
    .normalize("NFKC")
    .replace(FOOD_AI_IGNORABLE, "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    // Common Cyrillic/Greek lookalikes and Latin small caps in sensitive labels.
    .replace(/[аα]/g, "a").replace(/[еεᴇ]/g, "e")
    .replace(/[оοøᴏ]/g, "o").replace(/[рρ]/g, "p")
    .replace(/[сϲ]/g, "c").replace(/[ѕꜱ]/g, "s")
    .replace(/[тτᴛ]/g, "t").replace(/[мμᴍ]/g, "m")
    .replace(/[ԁᴅ]/g, "d")
    .replace(/ʀ/g, "r").replace(/ɪ/g, "i")
    .replace(/ɢ/g, "g").replace(/ʜ/g, "h");
}

function foodAiSplit(normalized: string): string[] {
  return normalized.split(/[^a-z0-9]+/).filter(Boolean);
}

function foodAiTokens(value: string): string[] {
  return foodAiSplit(foodAiNormalize(value));
}

/* Joined terms such as "temperature deviation" are 2-3 words long and can sit
   anywhere in the text, including after the prompt. */
function foodAiForbiddenTokens(tokens: string[], singles = true): boolean {
  for (let i = 0; i < tokens.length; i++) {
    if (singles && FOOD_AI_FORBIDDEN.has(tokens[i])) return true;
    if (i + 1 < tokens.length && FOOD_AI_FORBIDDEN.has(tokens[i] + tokens[i + 1])) return true;
    if (i + 2 < tokens.length && FOOD_AI_FORBIDDEN.has(tokens[i] + tokens[i + 1] + tokens[i + 2])) return true;
  }
  return false;
}

function foodAiForbidden(value: string): boolean {
  const tokens = foodAiTokens(value);
  return FOOD_AI_FORBIDDEN.has(tokens.join("")) || foodAiForbiddenTokens(tokens);
}

const FILLER = "(?: (?:is|was|of|at|in|about|around|roughly|approx|approximately|like|maybe|now|today))*";
const BODY_UNIT = "(?:lbs?|pounds?|kgs?|kilos?|kilograms?|st|stones?)";

/* "weight" passes only inside these food names. Anywhere else it still blocks. */
const FOOD_TEXT_WEIGHT_FOODS = /\bweight (?:gainers?|watchers)\b/g;
/* A body unit after a food name reads as a body weight, attached (82kg, 13st)
   or not. Up to three words may sit between them, but not across a list
   separator or a joining word, so "weight gainer tub, brisket 20 lb" and
   "weight gainer tub, 2 st louis ribs" are two foods. */
const FOOD_TEXT_WEIGHT_FOOD_UNIT = new RegExp(
  "\\bweight[^a-z0-9]+(?:gainers?|watchers)" +
  "(?:[^a-z0-9,;.]*|(?: +(?!(?:and|with|plus|then|or)\\b)[a-z]+\\b){1,3} *)" +
  "(?:\\d+(?:[^a-z0-9]{1,2}\\d+)*)?[^a-z0-9]{0,3}(?:ish[^a-z0-9]{0,3})?" + BODY_UNIT + "\\b",
);
/* A tub, bag, jar, or scoop of up to 12 lb or 5 kg is a package size, not a
   body weight. This runs before tokens are split so a typed decimal point or
   comma is still there: "5 180 lb" is not 5.18, and 0.180 is not a size. */
const FOOD_TEXT_PACKAGE = /\bweight[^a-z0-9]+(gainers?|watchers)[^a-z0-9]+(\d+(?:[.,]\d{1,2})?)[^a-z0-9]{0,2}(lbs?|pounds?|kgs?|kilos?|kilograms?)[^a-z0-9]+(?:tubs?|bags?|jars?|scoops?)\b/g;

function dropPackageSizes(normalized: string): string {
  return normalized.replace(FOOD_TEXT_PACKAGE, (all, name, size, unit) => {
    const cap = unit.startsWith("k") ? 5 : 12;
    return Number(size.replace(",", ".")) <= cap ? `weight ${name}` : all;
  });
}

/* A body-sized mass anywhere (30 kg, 60 lb, 5 stone and up) is a body weight.
   A comma can be the decimal point (82,5 kg). A bare st is a street or
   St. Louis here, so only stone counts. */
const FOOD_TEXT_BODY_MASS = /(\d+(?:[.,]\d+)?)[^a-z0-9]{0,3}(?:ish[^a-z0-9]{0,3})?(kgs?|kilos?|kilograms?|lbs?|pounds?|stones?)\b/g;

function bodyMass(normalized: string): boolean {
  for (const [, size, unit] of normalized.matchAll(FOOD_TEXT_BODY_MASS)) {
    const cap = unit.startsWith("k") ? 30 : unit.startsWith("st") ? 5 : 60;
    if (Number(size.replace(",", ".")) >= cap) return true;
  }
  return false;
}

const FOOD_TEXT_HEALTH = [
  new RegExp(`\\b(?:weight|weigh|weighs|weighed|weighing)${FILLER} \\d+(?!\\d)(?! ?(?:g|grams?|oz|ounces?|ml)\\b)`),
  new RegExp(`\\bbw${FILLER} ?\\d|(?<!\\d )\\b(?:resting )?hr${FILLER} ?\\d`),
  /\bheart ?rate\b|\bbpm\b|\bpulse \d/,
  /\bblood ?pressure\b|\bmmhg\b|\bbp \d/,
  /\bblood ?(?:sugar|glucose)\b|\bglucose(?: (?:is|was|at|of|level|levels|reading))* \d|(?:\b|\d)mg ?d ?l\b|(?:\b|\d)mmol\b|\b(?:hb)?a1c\b|\bcgm\b|\b[lh]dl\b|\btriglycerides?\b/,
  /\bdiagnos\w*|\b(?:pre)?diabet\w*|\bhypertensi\w*|\bhypothyroid\w*|\bpcos\b/,
  /\b(?:medications?|meds|prescri\w*|metformin|insulin|ozempic|wegovy|mounjaro|zepbound|semaglutide|tirzepatide|statins?|atorvastatin|lisinopril|levothyroxine)\b/,
];

function foodAiTextForbidden(value: string): boolean {
  const normalized = foodAiNormalize(value);
  // Fold leetspeak only for guarded terms; preserve quantities for mass checks.
  // Try both readings of 1. Remove permitted food phrases before joining separators.
  for (const one of ["i", "l"]) {
    const folded = normalized.replace(/3/g, "e").replace(/0/g, "o")
      .replace(/1/g, one).replace(/5/g, "s");
    // Word boundaries keep food names intact; retain explicit blocked variants.
    if (/\bs[^a-z0-9]*t[^a-z0-9]*r[^a-z0-9]*e[^a-z0-9]*s[^a-z0-9]*s(?:ed|less)?\b|\bm[^a-z0-9]*o[^a-z0-9]*o[^a-z0-9]*d(?:boost)?\b/.test(folded)) return true;
    const withoutWeightFoods = foodAiSplit(folded).join(" ").replace(FOOD_TEXT_WEIGHT_FOODS, " ");
    // Keep weight substrings blocked, but do not join the tail of "raw" to "eight".
    if (/weight|\bw *e *i *g *h *t/.test(withoutWeightFoods)) return true;
  }
  if (foodAiForbiddenTokens(foodAiSplit(normalized), false)) return true;
  const packed = dropPackageSizes(normalized);
  if (bodyMass(packed)) return true;
  if (FOOD_TEXT_WEIGHT_FOOD_UNIT.test(packed)) return true;
  const words = foodAiSplit(packed).join(" ");
  const tokens = words.replace(FOOD_TEXT_WEIGHT_FOODS, " ").split(" ").filter(Boolean);
  if (FOOD_AI_FORBIDDEN.has(tokens.join("")) || foodAiForbiddenTokens(tokens)) return true;
  const stripped = tokens.join(" ");
  return FOOD_TEXT_HEALTH.some((re) => re.test(stripped));
}

function rejectFoodAi(): never {
  throw new FoodAiPayloadError();
}

function plainFoodAi(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function allowedFoodAiKeys(value: Record<string, unknown>, expected: string[]) {
  const keys = Object.keys(value);
  if (keys.length !== expected.length) rejectFoodAi();
  for (const key of expected) if (!Object.prototype.hasOwnProperty.call(value, key)) rejectFoodAi();
  for (const key of keys) {
    if (!FOOD_AI_ALLOWED.has(key) || foodAiForbidden(key)) rejectFoodAi();
  }
}

export function assertFoodAiPayload(payload: unknown): void {
  if (!plainFoodAi(payload)) rejectFoodAi();
  allowedFoodAiKeys(payload, ["model", "max_tokens", "messages"]);
  const model = payload.model;
  if (typeof model !== "string" || model.length < 1 || model.length > 80 || foodAiForbidden(model)) rejectFoodAi();
  if (payload.max_tokens !== 1500) rejectFoodAi();
  const messages = payload.messages;
  if (!Array.isArray(messages) || messages.length !== 1) rejectFoodAi();
  const message = messages[0];
  if (!plainFoodAi(message)) rejectFoodAi();
  allowedFoodAiKeys(message, ["role", "content"]);
  if (message.role !== "user") rejectFoodAi();
  const content = message.content;
  if (!Array.isArray(content) || (content.length !== 1 && content.length !== 2)) rejectFoodAi();
  let images = 0;
  let texts = 0;
  for (const block of content) {
    if (!plainFoodAi(block)) rejectFoodAi();
    if (block.type === "text") {
      texts += 1;
      allowedFoodAiKeys(block, ["type", "text"]);
      if (typeof block.text !== "string" || block.text.length < 1 || block.text.length > 8000) rejectFoodAi();
      if (foodAiTextForbidden(block.text)) rejectFoodAi();
    } else if (block.type === "image") {
      images += 1;
      allowedFoodAiKeys(block, ["type", "source"]);
      const source = block.source;
      if (!plainFoodAi(source)) rejectFoodAi();
      allowedFoodAiKeys(source, ["type", "media_type", "data"]);
      if (source.type !== "base64" || source.media_type !== "image/jpeg") rejectFoodAi();
      if (typeof source.data !== "string" || source.data.length < 1 || source.data.length > 2_000_000) rejectFoodAi();
    } else rejectFoodAi();
  }
  if (texts !== 1 || images > 1) rejectFoodAi();
  if (images === 0 && content[0].type !== "text") rejectFoodAi();
  if (images === 1 && (content[0].type !== "image" || content[1].type !== "text")) rejectFoodAi();
}

export async function callFoodModel<T>(payload: unknown, client: (body: unknown) => Promise<T> | T): Promise<T> {
  assertFoodAiPayload(payload);
  if (typeof client !== "function") rejectFoodAi();
  return await client(payload);
}
