/* Split a describe-it estimate into foods the person named and foods the
   model added. This runs on the phone after the existing estimate returns.
   It does not call a model, and it keeps only the food name, portion, and macros. */

const STOP = new Set(["a", "an", "the", "with", "and", "of", "in", "on", "plus", "some", "my", "to", "for"]);

/* A describe-it name often adds a preparation, a color, a cut, or a grain
   the person did not type ("chicken and rice" comes back as grilled chicken
   breast and white rice; "toast and berries" comes back as whole wheat toast
   and mixed berries). Those words are not required. A different food that
   only shares one of them, such as chicken broth, still has to be named. */
const EXTRA = new Set([
  "grilled", "baked", "fried", "roasted", "roast", "steamed", "boiled", "sauteed", "saute",
  "poached", "scrambled", "broiled", "toasted", "smoked", "raw", "cooked", "fresh", "plain",
  "white", "brown", "black", "green", "red", "yellow",
  "breast", "thigh", "fillet", "filet", "wing", "drumstick", "chop",
  "large", "small", "extra", "whole", "sliced", "chopped", "diced", "boneless", "skinless",
  "wheat", "grain", "mixed",
]);

const NUM_WORDS = {
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  half: "0.5",
  couple: "2",
};

function norm(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/½/g, " 0.5 ")
    .replace(/\b1\s*\/\s*2\b/g, " 0.5 ")
    .replace(/[^a-z0-9.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stem(word) {
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/* "berries" drops the s and becomes "berrie", so it would miss "berry".
   Keep the y spelling and the ie spelling for the same word. "cookies" still
   lines up with "cookie", because that plural only drops the s. */
function formKeys(word) {
  const base = stem(word);
  const keys = [base];
  if (base.length > 4 && base.endsWith("ie")) keys.push(base.slice(0, -2) + "y");
  if (base.length > 3 && base.endsWith("y")) keys.push(base.slice(0, -1) + "ie");
  return keys;
}

function tokens(value) {
  const out = [];
  for (const word of norm(value).split(" ").filter(Boolean)) out.push(...formKeys(word));
  return out;
}

function nameTokens(name) {
  return tokens(name).filter((word) => word && !STOP.has(word));
}

function coreTokens(name) {
  const all = nameTokens(name);
  const core = all.filter((word) => !EXTRA.has(word));
  return core.length ? core : all;
}

function nameHeard(text, name) {
  const need = coreTokens(name);
  if (!need.length) return false;
  const have = new Set(tokens(text));
  return need.every((word) => have.has(word));
}

function clausesOf(text) {
  const raw = String(text || "").toLowerCase();
  const parts = raw.split(/\s*(?:,|;|\band\b|\bplus\b|\bwith\b)\s*/).map((part) => norm(part)).filter(Boolean);
  return parts.length ? parts : [norm(raw)];
}

function qtySet(value) {
  const found = new Set();
  const raw = norm(value);
  const digits = raw.match(/\d+(?:\.\d+)?/g) || [];
  digits.forEach((digit) => found.add(digit.replace(/\.0$/, "")));
  Object.keys(NUM_WORDS).forEach((word) => {
    if (new RegExp("\\b" + word + "\\b").test(raw)) found.add(NUM_WORDS[word]);
  });
  return found;
}

function portionQty(portion) {
  const found = [...qtySet(portion)];
  return found.length ? found[0] : "";
}

function matchingClause(text, name) {
  const need = new Set(nameTokens(name));
  if (!need.size) return "";
  const hit = clausesOf(text).filter((part) => tokens(part).some((word) => need.has(word)));
  return hit.join(" ");
}

function portionWasHeard(text, name, portion) {
  if (!nameHeard(text, name)) return false;
  const qty = portionQty(portion);
  if (!qty) return false;
  return qtySet(matchingClause(text, name)).has(qty);
}

function macro(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/* echo is "heard", "portion" (the food was named, the amount was not), or "guessed". */
export function echoMeal(text, items) {
  const heardText = String(text || "").trim();
  const rows = (Array.isArray(items) ? items : []).map((item) => {
    const name = String((item && item.name) || "");
    const portion = String((item && item.portion) || "");
    const heard = nameHeard(heardText, name);
    let echo = "guessed";
    if (heard && portion && !portionWasHeard(heardText, name, portion)) echo = "portion";
    else if (heard) echo = "heard";
    const base = (item && item.base) || {};
    return {
      name,
      portion,
      mult: item && item.mult ? item.mult : 1,
      base: {
        kcal: macro(base.kcal),
        p: macro(base.p),
        c: macro(base.c),
        f: macro(base.f),
      },
      echo,
    };
  });
  return {
    heardText,
    rows,
    heard: rows.filter((row) => row.echo !== "guessed"),
    guessed: rows.filter((row) => row.echo === "guessed"),
  };
}
