/* Mood, energy, and stress check-in. Crisis wording is matched on the phone.
   Nothing here calls a model or opens a network request. */

export const CHECKIN_FIELDS = ["mood", "energy", "stress"];

export const CHECKIN_LABELS = {
  mood: ["Rough", "Low", "Okay", "Good", "Bright"],
  energy: ["Drained", "Low", "Okay", "Steady", "High"],
  stress: ["Calm", "Light", "Okay", "High", "Heavy"],
};

export const CHECKIN_TITLES = {
  mood: "Mood",
  energy: "Energy",
  stress: "Stress",
};

const CRISIS = [
  /\bkill myself\b/,
  /\bkms\b/,
  /\bsuicid/,
  /\bwant to die\b/,
  /\bwanna die\b/,
  /\bend my life\b/,
  /\bend it all\b/,
  /\bself[-\s]?harm/,
  /\bhurt myself\b/,
  /\bharm myself\b/,
  /\bcan(?:not|'t) go on\b/,
  /\bbetter off dead\b/,
  /\bno reason to live\b/,
  /\boverdose\b/,
  /\btake my own life\b/,
];

export function crisisLanguage(note) {
  const text = String(note || "").toLowerCase().replace(/’/g, "'");
  return CRISIS.some((pattern) => pattern.test(text));
}

export function scoreOrNull(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

/* Low mood, high stress, or crisis wording. Energy alone does not open the card. */
export function needsResource(entry) {
  const src = entry || {};
  if (crisisLanguage(src.note)) return true;
  const mood = scoreOrNull(src.mood);
  const stress = scoreOrNull(src.stress);
  if (mood != null && mood <= 2) return true;
  if (stress != null && stress >= 4) return true;
  return false;
}

export const RESOURCE_LINES = [
  "If you want someone to talk with, call or text 988 in the US. That is the 988 Suicide & Crisis Lifeline.",
  "If there is immediate danger, call 911.",
];

export const NOT_ADVICE = "This check-in is not medical advice and it is not a diagnosis.";

export function checkinRecord(input) {
  const src = input || {};
  const date = typeof src.date === "string" ? src.date : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const id = typeof src.id === "string" && src.id ? src.id : "";
  if (!id) return null;
  const rec = { id, date };
  if (typeof src.at === "string" && src.at) rec.at = src.at;
  CHECKIN_FIELDS.forEach((key) => {
    const n = scoreOrNull(src[key]);
    if (n != null) rec[key] = n;
  });
  const note = String(src.note || "").trim().slice(0, 500);
  if (note) rec.note = note;
  if (!CHECKIN_FIELDS.some((key) => rec[key] != null) && !rec.note) return null;
  return rec;
}

export function listCheckins(raw) {
  if (Array.isArray(raw)) return raw.filter((row) => row && typeof row === "object");
  if (raw && typeof raw === "object") {
    return Object.keys(raw).map((day) => {
      const row = raw[day];
      if (row && typeof row === "object") return { ...row, date: row.date || row.day || day };
      return { date: day, value: row };
    });
  }
  return [];
}

/* One row per day. The id stays so a second save updates the same check-in. */
export function upsertCheckin(state, record) {
  const src = state || {};
  const deleted = Array.isArray(src.checkinDeleted) ? src.checkinDeleted.slice() : [];
  const list = listCheckins(src.checkins).map((row) => ({ ...row }));
  const idx = list.findIndex((row) => row && (row.date === record.date || row.day === record.date));
  const next = { ...record };
  if (idx >= 0 && list[idx].id) next.id = list[idx].id;
  if (idx >= 0) list[idx] = next;
  else list.push(next);
  return { checkins: list, checkinDeleted: deleted };
}
