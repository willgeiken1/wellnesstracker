/* Local calendar day and the next-dose countdown.
   The routine day rolls at a user-set hour, 4 by default. A time before that
   hour still belongs to the previous local calendar day. The fields are the
   clock's local year, month, day, and hour. toISOString() is the UTC day, so
   a US evening would already be tomorrow. Block times belong to the default
   and setup names. A renamed block has no time, matching the now/next line. */

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const DEFAULT_DAY_ROLLOVER_HOUR = 4;
export const MAX_DAY_ROLLOVER_HOUR = 6;

/* 0 is midnight. 6 is the latest hour a user can pick. An older stored hour
   above 6 is clamped to 6. Anything else that is not a whole hour reads as
   the default, so a bad value cannot move the day. */
export function routineDayRolloverHour(value) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return DEFAULT_DAY_ROLLOVER_HOUR;
  if (value > MAX_DAY_ROLLOVER_HOUR) return MAX_DAY_ROLLOVER_HOUR;
  return value;
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
  "Supplements": 12 * 60,
  "Supplements & medications": 12 * 60,
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

function shiftCalendarDay(day, delta) {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  const date = Number(day.slice(8, 10));
  return localCalendarDay(new Date(year, month - 1, date + delta));
}

/* A start before the rollover hour falls on the next calendar morning and
   still belongs to the routine day that began the previous morning. */
function routineDayOfStart(calendarDay, startMin, boundaryMin) {
  if (startMin >= boundaryMin) return calendarDay;
  return shiftCalendarDay(calendarDay, -1);
}

/* Minutes until the next block time for this item.
   A log for this routine day, including a skip, moves the countdown to the
   next routine day's start. That start can be later this calendar morning
   when the clock is still before the rollover hour. Hours come from the
   Date's local clock, not its UTC fields. */
export function nextDoseCountdown({ item, blocks, placements, logs, date, day, hour }) {
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
  const boundaryMin = routineDayRolloverHour(hour) * 60;
  const calendarDay = localCalendarDay(date);
  const logged = (Array.isArray(logs) ? logs : []).some((log) => coversDay(log, item.id, day));
  const due = [];
  const later = [];
  for (const start of starts) {
    for (let ahead = 0; ahead <= 2; ahead += 1) {
      const target = new Date(date.getFullYear(), date.getMonth(), date.getDate() + ahead, Math.floor(start / 60), start % 60, 0, 0);
      if (target.getTime() < date.getTime()) continue;
      const instantDay = ahead === 0 ? calendarDay : shiftCalendarDay(calendarDay, ahead);
      const belongs = routineDayOfStart(instantDay, start, boundaryMin);
      const candidate = { waitMin: Math.round((target.getTime() - date.getTime()) / 60000), belongs };
      if (belongs === day) due.push(candidate);
      else if (belongs > day) later.push(candidate);
    }
  }
  const pool = !logged && due.length ? due : later;
  if (!pool.length) return null;
  pool.sort((a, b) => a.waitMin - b.waitMin);
  return { waitMin: pool[0].waitMin, tomorrow: pool[0].belongs !== day };
}
