/* Local calendar day and the next-dose countdown.
   The routine day rolls at a user-set hour, 4 by default. A time before that
   hour still belongs to the previous local calendar day. The fields are the
   clock's local year, month, day, and hour. toISOString() is the UTC day, so
   a US evening would already be tomorrow. Block times belong to the three
   default names. A renamed block has no time, matching the now/next line. */

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const DEFAULT_DAY_ROLLOVER_HOUR = 4;

/* 0 is midnight. Anything else that is not a whole hour from 0 through 23
   reads as the default, so a bad stored value cannot move the day. */
export function routineDayRolloverHour(value) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 23) return value;
  return DEFAULT_DAY_ROLLOVER_HOUR;
}

/* Previous local calendar day when the clock is still before the rollover
   hour. 4:00 is the new day. 3:59 is the previous day. The step uses the
   calendar date, not a four-hour subtraction, so a daylight-saving jump
   does not skip a day. */
export function routineDayKey(date, hour = DEFAULT_DAY_ROLLOVER_HOUR) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const boundary = routineDayRolloverHour(hour);
  if (date.getHours() >= boundary) return localCalendarDay(date);
  const previous = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
  return localCalendarDay(previous);
}

export const ROUTINE_BLOCK_START_MIN = Object.freeze({
  "Morning routine": 5 * 60,
  "Supplement & enhancer stack": 12 * 60,
  "Night routine": 17 * 60,
});

export function localCalendarDay(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function live(row) {
  return !!(row && !(typeof row.deletedAt === "number" && row.deletedAt > 0));
}

function coversDay(log, itemId, day) {
  if (!live(log) || log.itemId !== itemId || log.day !== day || log.rest === true) return false;
  return log.status === "done" || log.status === "partial" || log.status === "skipped";
}

/* Minutes until the next block time for this item.
   A log today, including a skip, uses tomorrow's earliest time.
   Hours come from the Date's local clock, not its UTC fields. */
export function nextDoseCountdown({ item, blocks, placements, logs, date, day }) {
  if (!item || item.kind !== "dose" || typeof item.id !== "string" || !item.id) return null;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  if (typeof day !== "string" || !DAY.test(day)) return null;
  const placed = new Set();
  for (const place of Array.isArray(placements) ? placements : []) {
    if (live(place) && place.itemId === item.id && typeof place.blockId === "string") placed.add(place.blockId);
  }
  const starts = [];
  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (!live(block) || !placed.has(block.id)) continue;
    const start = Object.prototype.hasOwnProperty.call(ROUTINE_BLOCK_START_MIN, block.name)
      ? ROUTINE_BLOCK_START_MIN[block.name]
      : null;
    if (typeof start === "number") starts.push(start);
  }
  if (!starts.length) return null;
  starts.sort((a, b) => a - b);
  const nowMin = date.getHours() * 60 + date.getMinutes();
  const logged = (Array.isArray(logs) ? logs : []).some((log) => coversDay(log, item.id, day));
  let target = null;
  if (!logged) {
    for (const start of starts) {
      if (start >= nowMin) {
        target = start;
        break;
      }
    }
  }
  if (target == null) target = starts[0] + 24 * 60;
  return { waitMin: target - nowMin, tomorrow: target >= 24 * 60 };
}
