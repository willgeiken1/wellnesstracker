import { HOME_WIDGETS } from "./home-widgets.js";
import { hasOura, ouraMembershipInactive } from "./oura-gate.js";

/* Pure logic for Home edit mode: reorder, remove, add from the gallery.
   A draft is { items, hidden, sizes }, the same shape homeEditorDraft returns and
   commitHomeEditor saves. Nothing here touches the DOM, storage, or the clock, so
   the save path (and its updatedAt stamp) stays commitHomeEditor. */

/* Gallery copy: the iOS style title is the registry name, the subtitle says what the
   preview shows. Every registry id needs a line here. */
export const GALLERY_SUBTITLES = {
  readiness: "Today's score",
  "sleep-score": "Last night",
  "sleep-duration": "Time asleep",
  hrv: "Versus your average",
  "resting-hr": "Lowest heart rate",
  steps: "Daily count",
  "weekly-goal": "Sessions this week",
  "food-today": "Calories left",
  "food-yesterday": "Calories and protein",
  "weight-trend": "Change per week",
  "cardio-minutes": "This week's minutes",
  brief: "Your morning summary",
  today: "Start or resume a workout",
  "this-week": "Plan and history",
  pattern: "What affects you",
  headline: "The day in a line",
  muscles: "Muscles trained",
  cardio: "Weekly cardio ring",
  "last-night": "Sleep stages",
};

const SIZE_LABEL = { small: "Small", medium: "Medium" };

export function sizeLabel(size) {
  return SIZE_LABEL[size] || "";
}

function known(id) {
  return typeof id === "string" && !!HOME_WIDGETS[id];
}

function cleanDraft(draft) {
  const items = [];
  ((draft && draft.items) || []).forEach((id) => { if (known(id) && !items.includes(id)) items.push(id); });
  const hidden = [];
  ((draft && draft.hidden) || []).forEach((id) => { if (known(id) && !items.includes(id) && !hidden.includes(id)) hidden.push(id); });
  const sizes = draft && draft.sizes && typeof draft.sizes === "object" && !Array.isArray(draft.sizes) ? { ...draft.sizes } : {};
  return { items, hidden, sizes };
}

/* Move the entry at index from so it lands at index to. Out of range is a no-op. */
export function moveItem(list, from, to) {
  const out = Array.isArray(list) ? list.slice() : [];
  if (!Number.isInteger(from) || !Number.isInteger(to)) return out;
  if (from < 0 || from >= out.length || to < 0 || to >= out.length || from === to) return out;
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}

/* Drag or key move: put id at index to in the draft. */
export function reorderDraft(draft, id, to) {
  const next = cleanDraft(draft);
  next.items = moveItem(next.items, next.items.indexOf(id), to);
  return next;
}

/* Hide a card using the same shape the old editor's Remove button made. */
export function removeFromDraft(draft, id) {
  const next = cleanDraft(draft);
  if (!known(id) || !next.items.includes(id)) return next;
  next.items = next.items.filter((x) => x !== id);
  if (!next.hidden.includes(id)) next.hidden.push(id);
  return next;
}

export function sizeChoices(id) {
  const entry = HOME_WIDGETS[id];
  if (!entry) return [];
  return (entry.sizes || [entry.size]).slice();
}

/* Does a tap on this gallery card need a size step. */
export function needsSizeChoice(id) {
  return sizeChoices(id).length > 1;
}

/* Add a card at the end at the given size. A card already on Home is never added
   twice, an unknown id or an unsupported size changes nothing. Omitting size takes
   the registry default. A default size is stored as no entry, like the old editor. */
export function addToDraft(draft, id, size) {
  const next = cleanDraft(draft);
  const entry = HOME_WIDGETS[id];
  if (!entry || next.items.includes(id)) return next;
  const allowed = sizeChoices(id);
  const pick = size == null ? entry.size : size;
  if (!allowed.includes(pick)) return next;
  next.items.push(id);
  next.hidden = next.hidden.filter((x) => x !== id);
  if (pick === entry.size) delete next.sizes[id];
  else next.sizes[id] = pick;
  return next;
}

function norm(s) {
  return String(s == null ? "" : s).trim().toLowerCase();
}

/* Gallery rows in registry order. Left out: cards already on Home, and Oura cards
   without a ring or sample data. The query matches title or subtitle, any case. */
export function galleryEntries(draft, state, query) {
  const have = new Set(cleanDraft(draft).items);
  const oura = hasOura(state) && !ouraMembershipInactive(state);
  const q = norm(query);
  const out = [];
  Object.keys(HOME_WIDGETS).forEach((id) => {
    const entry = HOME_WIDGETS[id];
    if (have.has(id)) return;
    if (entry.needsOura && !oura) return;
    const title = entry.name;
    const subtitle = GALLERY_SUBTITLES[id] || "";
    if (q && !norm(title).includes(q) && !norm(subtitle).includes(q)) return;
    out.push({ id, title, subtitle, size: entry.size, sizes: sizeChoices(id) });
  });
  return out;
}
