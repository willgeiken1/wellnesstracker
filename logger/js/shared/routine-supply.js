/* Optional supply on a routine item. The count is what the user typed.
   Days left is that count times the average gap between days they logged
   a done or partial dose. A skip, a rest, and a tombstone do not count.
   One logged day, or none, uses a one-day gap, which is today's daily
   schedule. The estimate does not add up amounts and does not change the
   count when a dose is logged. A heads-up shows when the estimate is
   LOW_SUPPLY_DAYS or fewer. Mixed-on is a date the user typed for a dose.
   Nothing here links out or names a seller. */

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const COUNT_TEXT = /^\d{1,4}$/;

export const SUPPLY_COUNT_MAX = 9999;
export const LOW_SUPPLY_DAYS = 7;

const COMMERCE = new Set([
  "vendor",
  "vendors",
  "buy",
  "buyurl",
  "buylink",
  "price",
  "pricing",
  "shop",
  "shopurl",
  "storeurl",
  "reorder",
  "pharmacy",
  "href",
]);

function commerceKey(key) {
  return COMMERCE.has(String(key).toLowerCase().replace(/[_-]+/g, ""));
}

export function parseSupplyDay(value) {
  if (typeof value !== "string") return null;
  const day = value.trim();
  if (!DAY.test(day)) return null;
  const time = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== day) return null;
  return day;
}

export function parseSupplyCount(value) {
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0 || value > SUPPLY_COUNT_MAX) return null;
    return value;
  }
  if (typeof value !== "string" || !COUNT_TEXT.test(value.trim())) return null;
  const count = Number(value.trim());
  if (!Number.isInteger(count) || count > SUPPLY_COUNT_MAX) return null;
  return count;
}

/* A blank field clears the value. Anything else that is not a count is refused. */
export function readSupplyCount(value) {
  if (value == null) return { ok: true, count: null };
  if (typeof value === "string" && value.trim() === "") return { ok: true, count: null };
  const count = parseSupplyCount(value);
  if (count == null) return { ok: false, count: null };
  return { ok: true, count };
}

/* A blank field clears the date. A day after today is refused. */
export function readSupplyDay(value, today) {
  if (value == null) return { ok: true, day: null };
  if (typeof value === "string" && value.trim() === "") return { ok: true, day: null };
  const day = parseSupplyDay(value);
  const max = parseSupplyDay(today);
  if (!day || !max || day > max) return { ok: false, day: null };
  return { ok: true, day };
}

export function supplyDraftError(draft, today) {
  if (!draft || typeof draft !== "object") return "";
  if (Object.prototype.hasOwnProperty.call(draft, "onHand") && !readSupplyCount(draft.onHand).ok) {
    return "On hand is a whole number, or leave it blank.";
  }
  if (draft.kind === "dose" && Object.prototype.hasOwnProperty.call(draft, "mixedOn") && !readSupplyDay(draft.mixedOn, today).ok) {
    return "Mixed on is a day up to today, or leave it blank.";
  }
  return "";
}

/* Keys the draft omits stay as they are. A check item cannot keep a mix date. */
export function supplyFromDraft(draft, kind, today, existing) {
  const patch = {};
  if (draft && Object.prototype.hasOwnProperty.call(draft, "onHand")) {
    const read = readSupplyCount(draft.onHand);
    if (!read.ok) return null;
    patch.onHand = read.count;
    if (read.count == null) patch.onHandDay = null;
    else if (!existing || existing.onHand !== read.count || parseSupplyDay(existing.onHandDay) == null) patch.onHandDay = today;
  }
  if (kind !== "dose") patch.mixedOn = null;
  else if (draft && Object.prototype.hasOwnProperty.call(draft, "mixedOn")) {
    const read = readSupplyDay(draft.mixedOn, today);
    if (!read.ok) return null;
    patch.mixedOn = read.day;
  }
  return patch;
}

export function attachSupply(item) {
  if (!item || typeof item !== "object") return item;
  const count = parseSupplyCount(item.onHand);
  if (count == null) delete item.onHand;
  else item.onHand = count;
  const counted = count == null ? null : parseSupplyDay(item.onHandDay);
  if (counted == null) delete item.onHandDay;
  else item.onHandDay = counted;
  const mixed = item.kind === "dose" ? parseSupplyDay(item.mixedOn) : null;
  if (mixed == null) delete item.mixedOn;
  else item.mixedOn = mixed;
  for (const key of Object.keys(item)) {
    if (commerceKey(key)) delete item[key];
  }
  return item;
}

function dayIndex(day) {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  const date = Number(day.slice(8, 10));
  return Math.round(Date.UTC(year, month - 1, date) / 86400000);
}

function liveDose(log, itemId) {
  if (!log || log.rest === true) return false;
  if (typeof log.deletedAt === "number" && log.deletedAt > 0) return false;
  if (log.itemId !== itemId) return false;
  if (log.status !== "done" && log.status !== "partial") return false;
  return parseSupplyDay(log.day) != null;
}

/* Distinct calendar days, oldest first. Two logs on one day are one day. */
function doseDays(logs, itemId) {
  if (typeof itemId !== "string" || !itemId) return [];
  const days = new Set();
  for (const log of Array.isArray(logs) ? logs : []) {
    if (liveDose(log, itemId)) days.add(log.day);
  }
  return [...days].sort();
}

function doseSpan(logs, itemId) {
  const days = doseDays(logs, itemId);
  if (days.length < 2) return null;
  const span = dayIndex(days[days.length - 1]) - dayIndex(days[0]);
  const gaps = days.length - 1;
  if (span < gaps) return null;
  return { span, gaps };
}

/* Null when supply is off. Otherwise the count times the average gap,
   rounded to the nearest day. Half a day rounds away from zero. */
export function routineDaysLeft(onHand, logs, itemId, today, onHandDay) {
  const count = parseSupplyCount(onHand);
  if (count == null) return null;
  const span = doseSpan(logs, itemId);
  const base = span ? Math.round((count * span.span) / span.gaps) : count;
  const started = parseSupplyDay(onHandDay);
  const now = parseSupplyDay(today);
  if (!started || !now || now <= started) return base;
  const gap = span ? span.span / span.gaps : 1;
  const used = Math.floor((dayIndex(now) - dayIndex(started)) / gap);
  return Math.max(0, base - used);
}

export function mixedAgoLabel(mixedOn, today) {
  const day = parseSupplyDay(mixedOn);
  const now = parseSupplyDay(today);
  if (!day || !now || day > now) return "";
  const delta = dayIndex(now) - dayIndex(day);
  if (delta === 0) return "Mixed today";
  if (delta === 1) return "Mixed 1 day ago";
  return `Mixed ${delta} days ago`;
}

function handLabel(count) {
  return count === 1 ? "1 on hand" : `${count} on hand`;
}

function leftLabel(days) {
  return days === 1 ? "1 day left" : `${days} days left`;
}

export function routineSupplyView(spec) {
  const item = spec && spec.item;
  const logs = spec && spec.logs;
  const today = spec && spec.today;
  if (!item) return { text: "", state: "" };
  const parts = [];
  let state = "";
  const count = parseSupplyCount(item.onHand);
  if (count != null) {
    const left = routineDaysLeft(count, logs, item.id, today, item.onHandDay);
    const low = left != null && left <= LOW_SUPPLY_DAYS;
    const line = `${handLabel(count)} · ${leftLabel(left)}`;
    parts.push(low ? `Low supply · ${line}` : line);
    state = low ? "low" : "set";
  }
  const mixed = item.kind === "dose" ? mixedAgoLabel(item.mixedOn, today) : "";
  if (mixed) {
    parts.push(mixed);
    if (!state) state = "mixed";
  }
  return { text: parts.join(" · "), state };
}
