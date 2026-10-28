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
function foodAiNormalize(value: string, camel = true): string {
  return String(value)
    .replace(/[\u2028\u2029]/g, " ")
    .replace(FOOD_AI_IGNORABLE, "")
    .normalize("NFKC")
    .replace(FOOD_AI_IGNORABLE, "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(camel ? /([a-z])([A-Z])/g : /(?!)/g, "$1 $2")
    .toLowerCase()
    .replace(/ß/g, "ss").replace(/đ/g, "d").replace(/г/g, "r")
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

/* "weight" passes only when the whole item name is exactly one of these food
   names (after trim and lowercase). Any other text containing them blocks. */
const FOOD_TEXT_WEIGHT_FOODS = /\bweight (?:gainers?|watchers)\b/g;
const FOOD_TEXT_MEAL_MARKER = "The meal: ";
const FOOD_TEXT_WEIGHT_FOOD_EXACT = /^weight (?:gainer|watchers)$/;
/* A body unit after a food name reads as a body weight, attached (82kg, 13st)
   or not. Up to three words may sit between them, but not across a list
   separator or a joining word, so "weight gainer tub, brisket 20 lb" and
   "weight gainer tub, 2 st louis ribs" are two foods. */
const FOOD_TEXT_WEIGHT_FOOD_UNIT = new RegExp(
  "\\bweight[^a-z0-9]+(?:gainers?|watchers)" +
  "(?:[^a-z0-9,;.]*|(?: +(?!(?:and|with|plus|then|or)\\b)[a-z]+\\b){1,3} *)" +
  "(?:\\d+(?:[^a-z0-9]{1,2}\\d+)*)?[^a-z0-9]{0,3}(?:ish[^a-z0-9]{0,3})?" + BODY_UNIT + "\\b",
);
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

/* Literal stress/mood substrings always block. Across separators, also match
   whole terms plus known suffixes regardless of fragment lengths. Short
   fragments keep the broader prefix rule; "Moo Daeng" still passes. */
const FOOD_TEXT_STRESS_MOOD = /stress|mood/;
const FOOD_TEXT_STRESS_MOOD_TERMS = ["stress", "mood"];
const FOOD_TEXT_STRESS_MOOD_SUFFIXES = [
  "", "y", "ier", "iest", "ily", "iness", "ish", "s", "ed", "es", "ful", "less",
  "ing", "or", "ors", "boost", "swing", "swings", "ball", "free",
];

// Only these substitutions are letters; all other digits remain separators.
function foldStressMood(text: string): string {
  return text.replace(/0/g, "o").replace(/3/g, "e").replace(/[5$]/g, "s").replace(/[7+]/g, "t");
}

function separatedStressMood(text: string): boolean {
  const words = text.split(/[^a-z]+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    for (const term of FOOD_TEXT_STRESS_MOOD_TERMS) {
      let joined = "";
      let shortRun = true;
      for (let j = i; j < words.length; j++) {
        joined += words[j];
        if (joined.length < term.length) {
          if (!term.startsWith(joined)) break;
          if (words[j].length > 2) shortRun = false;
          continue;
        }
        if (j > i && joined.startsWith(term) && (joined.length === term.length || shortRun)) return true;
        if (j > i && FOOD_TEXT_STRESS_MOOD_SUFFIXES.some((suffix) => joined === term + suffix)) return true;
        if (!FOOD_TEXT_STRESS_MOOD_SUFFIXES.some((suffix) => (term + suffix).startsWith(joined))) break;
      }
    }
  }
  return false;
}

function foodAiTextForbidden(value: string): boolean {
  // The item name is whatever follows the first "The meal: " marker, or the whole text.
  const markerAt = value.indexOf(FOOD_TEXT_MEAL_MARKER);
  const itemName = markerAt < 0 ? value : value.slice(markerAt + FOOD_TEXT_MEAL_MARKER.length);
  const exactWeightFood = FOOD_TEXT_WEIGHT_FOOD_EXACT.test(itemName.trim().toLowerCase());
  const dropWeightFoods = (text: string) => exactWeightFood ? text.replace(FOOD_TEXT_WEIGHT_FOODS, " ") : text;
  const normalized = foodAiNormalize(value);
  // Preserve quantities for mass checks. Stress/mood use a restricted fold;
  // weight retains both readings of 1 and its exact food-name exceptions.
  // The stress/mood check also runs on a lowercase copy with no camelCase
  // split, so "MoOdy" is not cut into "mo ody".
  const lowered = foodAiNormalize(value, false);
  for (const text of [normalized, lowered]) {
    // Keep separator readings, then fold symbols while digits stay separated
    // (st1ress, m0ood, $tre0ss), then apply the full restricted fold.
    const symbolsFolded = text.replace(/\$/g, "s").replace(/\+/g, "t");
    if (separatedStressMood(text) || separatedStressMood(symbolsFolded)) return true;
    const folded = foldStressMood(text);
    if (FOOD_TEXT_STRESS_MOOD.test(folded) || separatedStressMood(folded)) return true;
  }
  for (const one of ["i", "l"]) {
    const fold = (text: string) => text.replace(/3/g, "e").replace(/0/g, "o")
      .replace(/1/g, one).replace(/5/g, "s");
    const folded = fold(normalized);
    // "weigh7" and "weigh+" are weight; "weigh 7oz" and "steak 7oz" stay separate.
    if (/weigh[7+]/.test(lowered)) return true;
    const withoutWeightFoods = dropWeightFoods(foodAiSplit(folded).join(" "));
    // Keep weight substrings blocked, but do not join the tail of "raw" to "eight".
    if (/weight|\bw *e *i *g *h *t/.test(withoutWeightFoods)) return true;
  }
  if (foodAiForbiddenTokens(foodAiSplit(normalized), false)) return true;
  if (bodyMass(normalized)) return true;
  if (FOOD_TEXT_WEIGHT_FOOD_UNIT.test(normalized)) return true;
  const words = foodAiSplit(normalized).join(" ");
  const tokens = dropWeightFoods(words).split(" ").filter(Boolean);
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
