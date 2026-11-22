import { app } from "../runtime.js";
import {
  canMutateRoutines,
  followParentEdits,
  isLive,
  normalizeDailyRoutines,
  projectDailyRoutines,
  putDailyRoutines,
  revisePlanEntity,
  routineId,
  markLogUndone,
  futureCarry,
  routineLogId,
  routineSiteId,
  tombstoneLog,
  routinePlacementId,
  dedupePlacementPairs,
  seedDefaultBlocks,
  upsertEntity,
} from "../shared/daily-routines-store.js";
import { MAX_DAY_ROLLOVER_HOUR, nextDoseCountdown, ROUTINE_BLOCK_START_MIN, routineDayKey, routineDayRolloverHour } from "../shared/routine-dose.js";
import { routineSupplyView, supplyFromDraft } from "../shared/routine-supply.js";
import { reconstitutionNoteText, reconstitutionResult } from "./reconstitution.js";
import { addRoutinePart, applySetup, readSetup, routineParts, routineSetupShows, SETUP_BLOCK_IDS } from "../shared/routine-setup.js";

/* Routines tab. The flag stays off in source. This module paints only when
   app.ROUTINES_ENABLED is true. A signed-out session gets a sign-in prompt
   and no dailyRoutines write.

   Check-off writes one log per item and day (routineLogId). A day change
   writes the destination id (checkOffId) and tombstones the old id, so a
   fresh check-off on the old day is a different row. Undo keeps the amount,
   unit, and note and marks that log undone, on every live log for that item
   (or rest) and day. Restore writes those fields back.

   The day key is the local clock plus the rollover hour (4 AM unless the
   user picked another hour). The clock face is app.routineNow(). Do not
   derive the day from the clock's UTC instant, and do not use app.today(),
   which rolls at midnight.

   Log all writes one done log per open item in that block. A skip already
   covers its item. A whole-day rest covers the day, so Log all writes
   nothing on a rest day and does not rewrite a rest row. A log tap shows
   "Logged · Undo" for 3 seconds. This file does not listen for the pointer,
   so a long press stays available for rename and details. */

const TILE_COLORS = new Set(["citrus", "lavender", "pink"]);
export const ROUTINE_BLOCK_COLORS = Object.freeze(["citrus", "lavender", "pink"]);
export const ROUTINE_DOSE_UNITS = Object.freeze(["mcg", "mg", "IU", "mL", "units"]);
const DOSE_UNIT_SET = new Set(ROUTINE_DOSE_UNITS);
const DEFAULT_START = new Map(Object.entries(ROUTINE_BLOCK_START_MIN).map(([name, minutes]) => [name, minutes / 60]));
const SLOT_LABEL = ["Morning", "Afternoon", "Night"];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const ROUTINE_LOG_TOAST_MS = 3000;
let logToast = null;
let logToastTimer = 0;
function esc(value) {
  if (typeof app.esc === "function") return app.esc(value);
  return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function shellDate() {
  if (typeof app.routineNow === "function") {
    const value = app.routineNow();
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  }
  return new Date();
}

function rolloverHour(store) {
  return routineDayRolloverHour(store && store.settings && store.settings.dayRolloverHour);
}

function todayKey(date) {
  const clock = date instanceof Date && !Number.isNaN(date.getTime()) ? date : shellDate();
  const store = app.state && app.state.dailyRoutines;
  return routineDayKey(clock, rolloverHour(store));
}

export function routineClock() {
  const date = shellDate();
  const stamp = date.getTime();
  const day = todayKey(date);
  return {
    date,
    day: typeof day === "string" ? day : "",
    now: Number.isFinite(stamp) ? stamp : 0,
  };
}

function toastNow() {
  const clock = routineClock();
  return clock.now > 0 ? clock.now : Date.now();
}

function stampAfter(now, previous) {
  const at = typeof now === "number" && Number.isFinite(now) ? now : 0;
  const prev = typeof previous === "number" && Number.isFinite(previous) ? previous : 0;
  const next = at > prev ? at : prev + 1;
  return next > 0 ? next : 1;
}

function maxStamp(...values) {
  let best = 0;
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value > best) best = value;
  }
  return best;
}

function existingLogStamp(store, id) {
  const log = (store.logs || []).find((row) => row && row.id === id);
  if (!log) return 0;
  return maxStamp(log.updatedAt, log.deletedAt);
}

/* The id a new check-off for this item and day writes. A log moved to
   another day keeps its id, and that id is not reused for the old day. The
   next suffix is taken instead, so two phones with the same rows still pick
   the same id. */
function checkOffId(store, itemId, day) {
  const base = routineLogId(itemId, day);
  for (let n = 1; n < 100; n += 1) {
    const id = n === 1 ? base : `${base}_${n}`;
    const row = (store.logs || []).find((log) => log && log.id === id);
    if (!row || row.day === day) return id;
  }
  return null;
}

/* A replacement has to beat the row it replaces, including a tombstone,
   and the store clock. A preference edit must not rewind that clock. */
function writeStamp(store, clock, id) {
  const at = stampAfter(clock.now, maxStamp(store.updatedAt, existingLogStamp(store, id)));
  const cap = Date.now() + 24 * 60 * 60 * 1000;
  return at > cap ? cap : at;
}

function carryFuture(payload, store, id) {
  const log = (store.logs || []).find((row) => row && row.id === id);
  const stored = log ? maxStamp(log.updatedAt, log.deletedAt) : 0;
  const carried = futureCarry(log, stored);
  if (!carried) return payload;
  return { ...payload, ...carried };
}

function prefStamp(store, clock) {
  return stampAfter(clock.now, maxStamp(store.updatedAt, store.prefs && store.prefs.updatedAt));
}

export function routineSlotIndex(date) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 0;
  if (hour >= 12 && hour < 17) return 1;
  return 2;
}

export function formatRoutineClock(date) {
  let hour = date.getHours();
  const min = String(date.getMinutes()).padStart(2, "0");
  const suffix = hour >= 12 ? "PM" : "AM";
  hour %= 12;
  if (hour === 0) hour = 12;
  return `${hour}:${min} ${suffix}`;
}

/* The dose clock on a log is `at`, read in the phone's local zone. */
export function routineClockTime(stamp) {
  if (typeof stamp !== "number" || !Number.isFinite(stamp) || stamp <= 0) return "";
  const date = new Date(stamp);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

const NOTE_MAX = 280;
const TIME_RE = /^(\d{1,2}):([0-5]\d)$/;
const FEELING_KEYS = ["mood", "energy", "stress", "feeling", "felt"];

function clipNote(value) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  return text.length > NOTE_MAX ? text.slice(0, NOTE_MAX) : text;
}

export function parseRoutineTime(raw) {
  if (typeof raw !== "string") return null;
  const match = TIME_RE.exec(raw.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour > 23 || !Number.isInteger(minute)) return null;
  return { hour, minute };
}

function stampOnDay(day, hour, minute) {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  const date = Number(day.slice(8, 10));
  const stamp = new Date(year, month - 1, date, hour, minute, 0, 0).getTime();
  if (!Number.isFinite(stamp)) return null;
  const back = new Date(stamp);
  const local = `${back.getFullYear()}-${String(back.getMonth() + 1).padStart(2, "0")}-${String(back.getDate()).padStart(2, "0")}`;
  if (local !== day || back.getHours() !== hour || back.getMinutes() !== minute) return null;
  return stamp;
}

/* Time is written only when the chosen day is before today. A blank time
   leaves the logged clock. A same-day edit never moves it. */
function editedDoseAt(log, day, today, draft) {
  const current = typeof log.at === "number" && Number.isFinite(log.at) ? log.at : 0;
  if (!(day < today) || !draft || draft.time == null) return { ok: true, at: current };
  if (typeof draft.time !== "string") return { ok: false, at: current };
  const text = draft.time.trim();
  if (!text) return { ok: true, at: current };
  const parsed = parseRoutineTime(text);
  const stamped = parsed && stampOnDay(day, parsed.hour, parsed.minute);
  if (stamped == null) return { ok: false, at: current };
  return { ok: true, at: stamped };
}

function withDetailsFields(payload, draft, doseAt) {
  const next = { ...payload, at: doseAt };
  for (const key of FEELING_KEYS) delete next[key];
  if (!draft || !Object.prototype.hasOwnProperty.call(draft, "note")) return next;
  if (draft.note != null && typeof draft.note !== "string") return null;
  const note = clipNote(typeof draft.note === "string" ? draft.note : "");
  if (note) next.note = note;
  else delete next.note;
  return next;
}

export function formatRoutineWait(waitMin) {
  if (typeof waitMin !== "number" || !Number.isFinite(waitMin) || waitMin < 0) return "";
  if (waitMin < 1) return "now";
  const hours = Math.floor(waitMin / 60);
  const mins = waitMin % 60;
  if (hours && mins) return `in ${hours} hr ${mins} min`;
  if (hours) return hours === 1 ? "in 1 hr" : `in ${hours} hr`;
  return mins === 1 ? "in 1 min" : `in ${mins} min`;
}

/* Which block is current follows block order and the time of day.
   Slot 0 is morning (05:00), slot 1 afternoon (12:00), slot 2 night (17:00).
   The countdown uses the default block name. A renamed block has no countdown. */
export function routineNowNext(blocks, date) {
  const live = (Array.isArray(blocks) ? blocks : []).filter((block) => isLive(block));
  const sorted = live.slice().sort((a, b) => (a.order || 0) - (b.order || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (!sorted.length) return { nowBlock: null, nextBlock: null, waitMin: null, slot: routineSlotIndex(date) };
  const slot = routineSlotIndex(date);
  const index = Math.min(slot, sorted.length - 1);
  const nowBlock = sorted[index];
  const nextBlock = sorted[(index + 1) % sorted.length];
  const same = nextBlock.id === nowBlock.id;
  const start = same ? null : DEFAULT_START.get(nextBlock.name);
  let waitMin = null;
  if (typeof start === "number") {
    const nowMin = date.getHours() * 60 + date.getMinutes();
    let target = start * 60;
    if (target <= nowMin) target += 24 * 60;
    waitMin = target - nowMin;
  }
  return { nowBlock, nextBlock: same ? null : nextBlock, waitMin, slot };
}

/* Count of doses logged today. One item counts once. Skips and rest are not doses. Amounts are not summed. */
export function loggedTodayCount(logs, day) {
  if (!Array.isArray(logs) || typeof day !== "string") return 0;
  const seen = new Set();
  for (const log of logs) {
    if (!isLive(log) || log.day !== day || log.status === "skipped" || log.rest === true) continue;
    seen.add(log.itemId || log.id);
  }
  return seen.size;
}

function parseRoutineLogId(id) {
  if (typeof id !== "string") return null;
  if (id.startsWith("rest_")) {
    const day = id.slice(5);
    return DAY.test(day) ? { rest: true, day } : null;
  }
  const match = /^log_(.+)_(\d{4}-\d{2}-\d{2})(?:_(\d+))?$/.exec(id);
  return match ? { itemId: match[1], day: match[2] } : null;
}

/* One row per placed item. Two blocks that share an item are still one dose. */
function placedItems(projected) {
  const blocks = new Set((projected && projected.blocks ? projected.blocks : []).filter((block) => isLive(block)).map((block) => block.id));
  const items = new Map((projected && projected.items ? projected.items : []).filter((item) => isLive(item)).map((item) => [item.id, item]));
  const seen = new Set();
  const out = [];
  for (const place of projected && projected.placements ? projected.placements : []) {
    if (!isLive(place) || !blocks.has(place.blockId) || !items.has(place.itemId) || seen.has(place.itemId)) continue;
    seen.add(place.itemId);
    out.push(items.get(place.itemId));
  }
  return out;
}

/* Logged doses out of doses due today. A skip is due and not logged.
   The numbers are counts. They are never a sum of amounts. */
export function routineDoseProgress(projected, day) {
  const doses = placedItems(projected).filter((item) => item.kind === "dose");
  let logged = 0;
  for (const item of doses) {
    const log = coveringLog(projected && projected.logs, item.id, day);
    if (log && log.status !== "skipped") logged += 1;
  }
  return { logged, due: doses.length };
}

/* The day is done when every placed item is logged. A skip is handled and
   still not logged, so it does not finish the day. No items is not done. */
export function routineDayComplete(projected, day) {
  const items = placedItems(projected);
  if (!items.length || typeof day !== "string") return false;
  return items.every((item) => {
    const log = coveringLog(projected && projected.logs, item.id, day);
    return !!(log && log.status !== "skipped");
  });
}

function blockStartsFor(projected, item) {
  const placed = new Set();
  for (const place of projected && projected.placements ? projected.placements : []) {
    if (isLive(place) && place.itemId === item.id && typeof place.blockId === "string") placed.add(place.blockId);
  }
  const starts = [];
  for (const block of projected && projected.blocks ? projected.blocks : []) {
    if (!isLive(block) || !placed.has(block.id)) continue;
    const hour = DEFAULT_START.get(block.name);
    if (typeof hour === "number") starts.push(hour * 60);
  }
  starts.sort((a, b) => a - b);
  return starts;
}

/* Overdue means every start named on this item has passed today.
   A later block the same day is still upcoming, so the row is not overdue.
   A renamed block has no start, so it is not overdue and has no countdown. */
function itemTiming(projected, item, date, day) {
  if (!item || !(date instanceof Date) || Number.isNaN(date.getTime())) return { waitMin: null, overdue: false };
  if (item.kind === "dose") {
    const result = nextDoseCountdown({
      item,
      blocks: projected && projected.blocks,
      placements: projected && projected.placements,
      logs: [],
      date,
      day,
    });
    if (!result || typeof result.waitMin !== "number") return { waitMin: null, overdue: false };
    return { waitMin: result.waitMin, overdue: result.tomorrow === true };
  }
  const starts = blockStartsFor(projected, item);
  if (!starts.length) return { waitMin: null, overdue: false };
  const nowMin = date.getHours() * 60 + date.getMinutes();
  let target = null;
  for (const start of starts) {
    if (start >= nowMin) {
      target = start;
      break;
    }
  }
  const overdue = target == null;
  if (target == null) target = starts[0] + 24 * 60;
  return { waitMin: target - nowMin, overdue };
}

function placementOrder(projected, itemId) {
  let best = Number.POSITIVE_INFINITY;
  for (const place of projected && projected.placements ? projected.placements : []) {
    if (isLive(place) && place.itemId === itemId && typeof place.order === "number" && place.order < best) best = place.order;
  }
  return best;
}

/* The next line names an item, not a block. Upcoming items come before
   overdue ones. The wait is the same block clock the row countdown uses. */
export function routineNextItem(projected, date, day) {
  if (!projected || !(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const open = placedItems(projected).filter((item) => !coveringLog(projected.logs, item.id, day));
  if (!open.length) return null;
  const ranked = open.map((item) => ({ item, ...itemTiming(projected, item, date, day), order: placementOrder(projected, item.id) }));
  ranked.sort((a, b) => {
    const group = (row) => (row.overdue ? 1 : row.waitMin == null ? 2 : 0);
    const ag = group(a);
    const bg = group(b);
    if (ag !== bg) return ag - bg;
    const aw = a.waitMin == null ? Number.POSITIVE_INFINITY : a.waitMin;
    const bw = b.waitMin == null ? Number.POSITIVE_INFINITY : b.waitMin;
    if (aw !== bw) return aw - bw;
    if (a.order !== b.order) return a.order - b.order;
    if (a.item.id === b.item.id) return 0;
    return a.item.id < b.item.id ? -1 : 1;
  });
  return ranked[0];
}

export function lastDoseLabel(log) {
  if (!log || log.rest === true || log.status === "skipped") return "";
  if (log.status !== "done" && log.status !== "partial") return "";
  if (typeof log.at !== "number" || !Number.isFinite(log.at) || log.at <= 0) return "";
  const date = new Date(log.at);
  if (Number.isNaN(date.getTime())) return "";
  return `last: ${formatRoutineClock(date)}`;
}

/* Calendar steps stay on the year-month-day fields. The UTC date is only
   the calculator, so a US evening that is already the next UTC day does
   not skip a local day. */
export function shiftRoutineDay(day, delta) {
  if (typeof day !== "string" || !DAY.test(day) || typeof delta !== "number" || !Number.isFinite(delta)) return "";
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  const date = Number(day.slice(8, 10));
  const utc = new Date(Date.UTC(year, month - 1, date + delta));
  return utc.toISOString().slice(0, 10);
}

function countedLog(log) {
  if (!isLive(log) || log.rest === true || typeof log.day !== "string" || !DAY.test(log.day)) return false;
  return log.status === "done" || log.status === "partial" || log.status === "skipped";
}

/* The live rest for that day, if one exists. One rest covers the whole day.
   A newer stamp wins. The same stamp keeps the smaller id. */
export function routineRestLog(logs, day) {
  if (typeof day !== "string" || !DAY.test(day)) return null;
  let best = null;
  for (const log of Array.isArray(logs) ? logs : []) {
    if (!isLive(log) || log.rest !== true || log.day !== day) continue;
    if (!best) {
      best = log;
      continue;
    }
    const at = log.updatedAt || 0;
    const prev = best.updatedAt || 0;
    if (at > prev || (at === prev && log.id < best.id)) best = log;
  }
  return best;
}

/* Done, partial, and skip days add one. A skip adds one, so it does not
   stop the run. A rest day with no item log pauses: it does not add a day
   and it does not stop the run. An item log on that same day still counts,
   and the rest does not add a second day. Today adds one only when a
   non-rest log is there. A day with no log, after the first counted or
   paused day, is a full miss and stops the run. An open today does not
   stop it. */
export function routineStreak(logs, day) {
  if (typeof day !== "string" || !DAY.test(day)) return 0;
  const paused = new Set();
  const counted = new Set();
  for (const log of Array.isArray(logs) ? logs : []) {
    if (!isLive(log) || typeof log.day !== "string" || !DAY.test(log.day)) continue;
    if (log.rest === true) paused.add(log.day);
    else if (countedLog(log)) counted.add(log.day);
  }
  for (const key of counted) paused.delete(key);
  let earliest = "";
  for (const key of paused) if (!earliest || key < earliest) earliest = key;
  for (const key of counted) if (!earliest || key < earliest) earliest = key;
  if (!earliest) return 0;
  let streak = 0;
  let cursor = day;
  let guard = 0;
  while (cursor && cursor >= earliest && guard < 4000) {
    if (paused.has(cursor)) {
      cursor = shiftRoutineDay(cursor, -1);
      guard += 1;
      continue;
    }
    if (counted.has(cursor)) {
      streak += 1;
      cursor = shiftRoutineDay(cursor, -1);
      guard += 1;
      continue;
    }
    if (cursor === day) {
      cursor = shiftRoutineDay(cursor, -1);
      guard += 1;
      continue;
    }
    break;
  }
  return streak;
}

function tileColor(color) {
  return TILE_COLORS.has(color) ? color : "citrus";
}

function formatAmount(amount) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "";
  return String(Math.round(amount * 1000) / 1000);
}

function compoundFor(projected, item) {
  if (!item || !item.compoundId) return null;
  return (projected.compounds || []).find((row) => row.id === item.compoundId) || null;
}

/* A check item records no amount, even if it used to be a dose. The old log
   stays as it was. A new log or a restore uses the item as it is now. */
function loggedDose(view, item) {
  if (!item || item.kind !== "dose") return { compoundId: null, amount: null, unit: "" };
  const compound = compoundFor(view, item);
  return {
    compoundId: item.compoundId || null,
    amount: compound && typeof compound.amount === "number" ? compound.amount : null,
    unit: compound && compound.unit ? compound.unit : "",
  };
}

function blockItems(projected, blockId) {
  const items = new Map((projected.items || []).map((item) => [item.id, item]));
  return (projected.placements || [])
    .filter((row) => row.blockId === blockId && items.has(row.itemId))
    .slice()
    .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((placement) => {
      const item = items.get(placement.itemId);
      return { placement, item, compound: compoundFor(projected, item) };
    });
}

function coveringLog(logs, itemId, day) {
  const rows = (Array.isArray(logs) ? logs : []).filter((log) => isLive(log) && log.itemId === itemId && log.day === day && log.rest !== true);
  rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return rows[0] || null;
}

export function routineBlockRows(projected, blockId, day) {
  return blockItems(projected, blockId).map((row) => {
    const log = coveringLog(projected && projected.logs, row.item.id, day);
    return { ...row, log, open: !log };
  });
}

function doseText(row) {
  if (!row.item || row.item.kind !== "dose" || !row.compound) return "";
  const amount = formatAmount(row.compound.amount);
  const unit = row.compound.unit ? row.compound.unit : "";
  if (!amount) return "";
  return unit ? `${amount} ${unit}` : amount;
}

/* Completed and history rows show the amount stored on the log.
   The compound amount can change later and must not rewrite that text. */
export function loggedAmountText(log) {
  if (!log || log.rest === true || log.status === "skipped") return "";
  if (typeof log.amount !== "number" || !Number.isFinite(log.amount)) return "";
  const amount = formatAmount(log.amount);
  if (amount === "") return "";
  const unit = typeof log.unit === "string" ? log.unit : "";
  return unit ? `${amount} ${unit}` : amount;
}

function amountMarkup(text) {
  return text ? `<span class="dr-dose"> · ${esc(text)}</span>` : "";
}

/* The saved inputs are redrawn with the item's current dose, so a later
   amount change does not leave the old U-100 units on the row. */
function freshCalculatorNote(item, compound) {
  if (!item || typeof item.calcVial !== "number" || typeof item.calcWater !== "number") return "";
  const doseAmount = compound && typeof compound.amount === "number" ? compound.amount : item.calcDose;
  const doseUnit = compound && typeof compound.unit === "string" && compound.unit ? compound.unit : item.calcDoseUnit;
  return reconstitutionNoteText(reconstitutionResult({
    vialAmount: item.calcVial,
    waterMl: item.calcWater,
    doseAmount,
    vialUnit: item.calcVialUnit,
    doseUnit,
  }));
}

/* Calculator note on the item. A per-dose log note stays off this row. */
function itemNoteMarkup(item, compound) {
  if (!item || item.kind !== "dose") return "";
  const fresh = freshCalculatorNote(item, compound);
  const note = fresh || (typeof item.note === "string" ? item.note.trim() : "");
  if (!note) return "";
  return `<span class="dr-item-note">${esc(note)}</span>`;
}

function countdownQuery(projected, item, date, day) {
  return {
    item,
    blocks: projected.blocks,
    placements: projected.placements,
    logs: projected.logs,
    date,
    day,
    hour: projected.settings && projected.settings.dayRolloverHour,
  };
}

export function doseCountdownText(projected, item, date, day) {
  if (!projected || !item) return "";
  const result = nextDoseCountdown(countdownQuery(projected, item, date, day));
  if (!result || typeof result.waitMin !== "number") return "";
  const wait = formatRoutineWait(result.waitMin);
  if (!wait) return "";
  return wait === "now" ? "Next dose now" : `Next dose ${wait}`;
}

function countdownMarkup(projected, row, date, day) {
  if (!row.item || row.item.kind !== "dose") return "";
  const result = nextDoseCountdown(countdownQuery(projected, row.item, date, day));
  if (!result || typeof result.waitMin !== "number") return "";
  const text = doseCountdownText(projected, row.item, date, day);
  if (!text) return "";
  return `<span class="dr-next-dose" data-next-dose="${result.waitMin}">${esc(text)}</span>`;
}

const OVERDUE_ICON = `<svg class="dr-overdue-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v4.5"/><path d="M12 16.2h.01"/></svg>`;
const DONE_MARK = `<svg class="dr-all-done-mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 9.2 16.7 19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function overdueMarkup() {
  return `<span class="dr-overdue">${OVERDUE_ICON}<span class="dr-overdue-text">overdue</span></span>`;
}

function latestTakenLog(logs, itemId) {
  const rows = (Array.isArray(logs) ? logs : []).filter((log) => {
    if (!isLive(log) || log.itemId !== itemId || log.rest === true) return false;
    if (log.status !== "done" && log.status !== "partial") return false;
    return typeof log.at === "number" && log.at > 0;
  });
  rows.sort((a, b) => {
    if (a.day !== b.day) return a.day < b.day ? 1 : -1;
    if (a.at !== b.at) return b.at - a.at;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return rows[0] || null;
}

/* An open row that is still upcoming shows the countdown. A taken row shows
   the clock time stored on that log. Overdue replaces the countdown and
   keeps a previous clock time when one exists. */
function rowDetailMarkup(projected, row, date, day) {
  const open = !!row.open;
  const timing = open && row.item ? itemTiming(projected, row.item, date, day) : { overdue: false };
  const state = open ? "open" : rowState(row.log);
  const overdue = open && timing.overdue;
  const countdown = !overdue && state !== "done" && state !== "partial" ? countdownMarkup(projected, row, date, day) : "";
  const taken = state === "done" || state === "partial" ? row.log : (!countdown && row.item ? latestTakenLog(projected && projected.logs, row.item.id) : null);
  const last = !countdown ? lastDoseLabel(taken) : "";
  const lastHTML = last ? `<span class="dr-last">${esc(last)}</span>` : "";
  const tag = overdue ? overdueMarkup() : "";
  const supply = supplyMarkup(projected, row, day);
  if (!tag && !countdown && !lastHTML && !supply) return "";
  return `<span class="dr-meta">${tag}${countdown}${lastHTML}${supply}</span>`;
}

function supplyMarkup(projected, row, day) {
  if (!row || !row.item) return "";
  const supply = routineSupplyView({ item: row.item, logs: projected && projected.logs, today: day });
  if (!supply.text) return "";
  return `<span class="dr-supply" data-supply="${esc(supply.state)}">${esc(supply.text)}</span>`;
}

function rowState(log) {
  if (!log) return "open";
  if (log.status === "skipped") return "skipped";
  if (log.status === "partial") return "partial";
  return "done";
}

/* A signed-in client that has not finished its account pull must not write.
   save() would schedule a push, and that push can replace the cloud blob
   before the phone has seen it. */
function accountPullPending() {
  return !!(app.sb && app.cloudPullOk !== true);
}

function refuseWrite() {
  return !canMutateRoutines() || accountPullPending();
}

function withStore(state, mutate) {
  if (refuseWrite() || !state || typeof state !== "object") return false;
  const clock = routineClock();
  const normalized = normalizeDailyRoutines(state.dailyRoutines);
  if (!normalized) return false;
  const current = followParentEdits(normalized);
  const next = mutate(current, clock);
  if (!next) return false;
  return putDailyRoutines(state, keepInferredRevivalsInView(normalized, current, next));
}

/* followParentEdits can bring a placement back for the view. A write only
   keeps that revival when it changed the placement itself. Otherwise the
   stored row stays as it was, so an unrelated write (a focus toggle) cannot
   save an inferred revival that a later removal from another phone should
   still beat. */
function keepInferredRevivalsInView(stored, current, next) {
  if (!next || !Array.isArray(next.placements)) return next;
  const before = new Map();
  for (const row of stored.placements || []) if (row && typeof row.id === "string") before.set(row.id, row);
  const inferred = new Map();
  for (const row of current.placements || []) {
    if (!row || typeof row.id !== "string") continue;
    const raw = before.get(row.id);
    if (raw && raw !== row && !isLive(raw) && isLive(row)) inferred.set(row.id, { raw, revived: JSON.stringify(row) });
  }
  if (!inferred.size) return next;
  return {
    ...next,
    placements: next.placements.map((row) => {
      const seen = row && inferred.get(row.id);
      return seen && JSON.stringify(row) === seen.revived ? seen.raw : row;
    }),
  };
}

function wrote(next, collection, id, at) {
  const row = (next[collection] || []).find((item) => item && item.id === id);
  return row && row.updatedAt === at ? next : null;
}

export function logRoutineItem(state, itemId) {
  if (typeof itemId !== "string" || !itemId) return false;
  return withStore(state, (store, clock) => {
    if (!DAY.test(clock.day)) return null;
    const view = projectDailyRoutines(store);
    const item = (view.items || []).find((row) => row.id === itemId);
    if (!item || coveringLog(view.logs, item.id, clock.day)) return null;
    const dose = loggedDose(view, item);
    const id = checkOffId(store, item.id, clock.day);
    if (!id) return null;
    const at = writeStamp(store, clock, id);
    const next = upsertEntity(store, "logs", carryFuture({
      id,
      itemId: item.id,
      compoundId: dose.compoundId,
      day: clock.day,
      status: "done",
      amount: dose.amount,
      unit: dose.unit,
      at: clock.now,
      deletedAt: null,
    }, store, id), at);
    return wrote(next, "logs", id, at);
  });
}

export function skipRoutineItem(state, itemId) {
  if (typeof itemId !== "string" || !itemId) return false;
  return withStore(state, (store, clock) => {
    if (!DAY.test(clock.day)) return null;
    const view = projectDailyRoutines(store);
    const item = (view.items || []).find((row) => row.id === itemId);
    if (!item || coveringLog(view.logs, item.id, clock.day)) return null;
    const id = checkOffId(store, item.id, clock.day);
    if (!id) return null;
    const at = writeStamp(store, clock, id);
    const next = upsertEntity(store, "logs", carryFuture({
      id,
      itemId: item.id,
      compoundId: item.kind === "dose" ? (item.compoundId || null) : null,
      day: clock.day,
      status: "skipped",
      amount: null,
      unit: "",
      at: clock.now,
      deletedAt: null,
    }, store, id), at);
    return wrote(next, "logs", id, at);
  });
}

function sameCheckOff(a, b) {
  if (!a || !b || a.day !== b.day) return false;
  if (a.rest === true || b.rest === true) return a.rest === true && b.rest === true;
  return !!a.itemId && a.itemId === b.itemId;
}

/* Removes a check-off, skip, or rest from today. The log keeps its amount,
   unit, and note, and is marked undone, newer than the live copy.
   Every live log for the same item (or rest) and day goes, so an older
   random-id copy from the other phone does not leave the row done. */
export function undoRoutineLog(state, logId) {
  if (typeof logId !== "string" || !logId) return false;
  return withStore(state, (store, clock) => {
    const log = (store.logs || []).find((row) => row && row.id === logId);
    if (!log || !isLive(log)) return null;
    const ids = (store.logs || []).filter((row) => isLive(row) && (row.id === logId || sameCheckOff(row, log))).map((row) => row.id);
    const latest = Math.max(store.updatedAt || 0, ...store.logs.filter((row) => ids.includes(row.id)).map((row) => row.updatedAt || 0));
    const at = stampAfter(clock.now, latest);
    let next = store;
    for (const id of ids) next = next && markLogUndone(next, id, at);
    const rows = (next && next.logs || []).filter((item) => ids.includes(item.id));
    if (rows.length !== ids.length || rows.some((row) => !(row.deletedAt > 0))) return null;
    const row = rows.find((item) => item.id === logId);
    if (!row || row.updatedAt !== at) return null;
    return next;
  });
}

/* Restore brings back the amount, unit, and note the undo kept. A rest
   comes back as a rest. An old five-key marker still restores from the item. */
export function restoreRoutineLog(state, logId) {
  if (typeof logId !== "string" || !logId) return false;
  return withStore(state, (store, clock) => {
    const log = (store.logs || []).find((row) => row && row.id === logId);
    const parsed = parseRoutineLogId(logId);
    if (!log || isLive(log) || !parsed) return null;
    const at = stampAfter(clock.now, Math.max(log.updatedAt || 0, log.deletedAt || 0, store.updatedAt || 0));
    if (parsed.rest) {
      const next = upsertEntity(store, "logs", carryFuture({
        id: logId, itemId: null, compoundId: null, day: parsed.day, status: "done",
        amount: null, unit: "", at: clock.now, rest: true, deletedAt: null,
      }, store, logId), at);
      const row = (next.logs || []).find((item) => item.id === logId);
      if (!row || !isLive(row) || row.rest !== true) return null;
      return next;
    }
    const view = projectDailyRoutines(store);
    const item = (view.items || []).find((row) => row.id === parsed.itemId);
    const day = validCalendarDay(log.day) ? log.day : parsed.day;
    if (!item || coveringLog(view.logs, item.id, day)) return null;
    const dose = loggedDose(view, item);
    const skipped = log.status === "skipped";
    const storedAmount = typeof log.amount === "number" && Number.isFinite(log.amount) ? log.amount : null;
    const storedUnit = typeof log.unit === "string" && log.unit ? log.unit : "";
    const storedNote = typeof log.note === "string" ? log.note : "";
    const payload = {
      id: logId,
      itemId: item.id,
      compoundId: skipped ? null : dose.compoundId,
      day,
      status: skipped ? "skipped" : "done",
      amount: skipped ? null : (storedAmount != null ? storedAmount : dose.amount),
      unit: skipped ? "" : (storedUnit || dose.unit),
      at: typeof log.at === "number" && Number.isFinite(log.at) ? log.at : clock.now,
      deletedAt: null,
    };
    if (storedNote) payload.note = storedNote;
    const next = upsertEntity(store, "logs", carryFuture(payload, store, logId), at);
    const row = (next.logs || []).find((itemRow) => itemRow.id === logId);
    if (!row || !isLive(row) || row.itemId !== item.id) return null;
    return next;
  });
}

/* One done log per open item in the block. Skipped and already logged items
   are not open. A rest day covers every block, so nothing is written. A rest
   row is not an item row. Edit mode does not log. */
export function logAllRoutineBlock(state, blockId) {
  if (layoutEditing()) return false;
  if (typeof blockId !== "string" || !blockId) return false;
  if (refuseWrite() || !state || typeof state !== "object") return false;
  const clock = routineClock();
  if (!DAY.test(clock.day)) return false;
  const current = normalizeDailyRoutines(state.dailyRoutines);
  if (!current) return false;
  const view = projectDailyRoutines(current);
  if (!view || !(view.blocks || []).some((block) => block.id === blockId)) return false;
  if (routineRestLog(view.logs, clock.day)) return false;
  const seen = new Set();
  const rows = [];
  for (const row of routineBlockRows(view, blockId, clock.day)) {
    if (!row.open || !row.item || seen.has(row.item.id)) continue;
    seen.add(row.item.id);
    rows.push(row);
  }
  if (!rows.length) return false;
  let next = current;
  let at = stampAfter(clock.now, current.updatedAt);
  const ids = [];
  for (const row of rows) {
    const id = checkOffId(next, row.item.id, clock.day);
    if (!id) return false;
    const dose = loggedDose(view, row.item);
    ids.push(id);
    const stamped = writeStamp(next, clock, id);
    const atWrite = stamped > at ? stamped : at;
    next = upsertEntity(next, "logs", carryFuture({
      id,
      itemId: row.item.id,
      compoundId: dose.compoundId,
      day: clock.day,
      status: "done",
      amount: dose.amount,
      unit: dose.unit,
      at: clock.now,
      deletedAt: null,
    }, next, id), atWrite);
    at = atWrite;
    const saved = (next.logs || []).find((log) => log.id === id);
    if (!saved || saved.updatedAt !== atWrite || saved.deletedAt != null || saved.rest === true) return false;
    at = atWrite + 1;
  }
  if (!putDailyRoutines(state, next)) return false;
  return ids;
}

export function undoRoutineLogs(state, logIds) {
  if (!Array.isArray(logIds) || !logIds.length) return false;
  const seen = new Set();
  let any = false;
  for (const id of logIds) {
    if (typeof id !== "string" || !id || seen.has(id)) continue;
    seen.add(id);
    if (undoRoutineLog(state, id)) any = true;
  }
  return any;
}

export function clearRoutineLogToast() {
  if (logToastTimer) clearTimeout(logToastTimer);
  logToastTimer = 0;
  logToast = null;
}

/* Visible while the pinned clock is still inside the 3 second window.
   The timer hides it in the live app. Reduce Motion skips the fade only. */
export function routineLogToast(now) {
  if (!logToast) return null;
  const at = typeof now === "number" && Number.isFinite(now) ? now : toastNow();
  if (at >= logToast.until) return null;
  return { ids: logToast.ids.slice(), until: logToast.until };
}

export function showRoutineLogToast(ids) {
  const seen = new Set();
  const list = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    if (typeof id !== "string" || !id || seen.has(id)) continue;
    seen.add(id);
    list.push(id);
  }
  clearRoutineLogToast();
  if (!list.length) return false;
  const token = {};
  const now = toastNow();
  logToast = { ids: list, until: now + ROUTINE_LOG_TOAST_MS, token };
  const timer = setTimeout(() => {
    if (!logToast || logToast.token !== token) return;
    logToast = null;
    logToastTimer = 0;
    const node = typeof document !== "undefined" && document.querySelector ? document.querySelector("[data-log-toast]") : null;
    if (node && typeof node.remove === "function") node.remove();
  }, ROUTINE_LOG_TOAST_MS);
  if (timer && typeof timer.unref === "function") timer.unref();
  logToastTimer = timer;
  return true;
}

export function undoRoutineLogToast(state) {
  const toast = routineLogToast();
  clearRoutineLogToast();
  if (!toast) return false;
  return undoRoutineLogs(state, toast.ids);
}

export function latestRoutineLogId(state, itemId) {
  const store = state && state.dailyRoutines;
  if (!store || typeof itemId !== "string" || !itemId) return "";
  const day = routineClock().day;
  const logs = (store.logs || []).filter((log) => isLive(log) && log.itemId === itemId && log.day === day && log.rest !== true && (log.status === "done" || log.status === "partial"));
  logs.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  return logs[0] ? logs[0].id : "";
}

function validCalendarDay(value) {
  if (typeof value !== "string" || !DAY.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function amountsEqual(left, right) {
  if (typeof left !== "number" || typeof right !== "number" || !Number.isFinite(left) || !Number.isFinite(right)) return false;
  return Math.round(left * 1000) === Math.round(right * 1000);
}

function massMcg(amount, unit) {
  if (unit === "mcg") return amount;
  if (unit === "mg") return amount * 1000;
  return null;
}

/* 500 mcg is not 500 mg. Same numbers count as the planned dose only when
   the units match, or when both are a mass that converts as 1 mg = 1000 mcg.
   The log keeps the unit it was saved with. */
function samePlannedDose(amount, unit, compound) {
  if (!compound || typeof compound.amount !== "number" || !Number.isFinite(compound.amount)) return false;
  const plannedUnit = typeof compound.unit === "string" ? compound.unit : "";
  if (unit === plannedUnit) return amountsEqual(amount, compound.amount);
  const logged = massMcg(amount, unit);
  const planned = massMcg(compound.amount, plannedUnit);
  if (logged == null || planned == null) return false;
  return amountsEqual(logged, planned);
}

function statusForEditedAmount(log, compound, amount, unit) {
  if (samePlannedDose(amount, unit, compound)) return "done";
  if (amountsEqual(amount, log.amount) && (log.status === "done" || log.status === "partial")) return log.status;
  return "partial";
}

function unitForEditedLog(log, compound) {
  if (log.unit && DOSE_UNIT_SET.has(log.unit)) return log.unit;
  if (compound && DOSE_UNIT_SET.has(compound.unit)) return compound.unit;
  return "";
}

/* A saved dose log keeps its amount or unit. The item's current kind is
   not that record: switching the item to a check must not wipe the log,
   and switching a check to a dose must not demand an amount for an old check. */
function logHasSavedDose(log) {
  if (!log || log.rest === true) return false;
  if (typeof log.amount === "number" && Number.isFinite(log.amount)) return true;
  return typeof log.unit === "string" && DOSE_UNIT_SET.has(log.unit);
}

/* Changes the amount and the day on one log. The day is the string the
   user picked. It is not today's key and not the UTC day of the clock.
   A day change writes the destination id and tombstones this one, so the
   other phone's fresh check-off of the old day stays. A time is applied
   only when that day is before today. A note is stored only when the draft
   includes one. A site is stored only when the draft includes one. A blank
   site removes it. A missing site key leaves the old site. An unknown site
   is refused. A check cannot store a site. The compound row is
   left alone, so later edits to the item do not rewrite this log. */
export function editRoutineLog(state, logId, draft) {
  if (typeof logId !== "string" || !logId) return false;
  return withStore(state, (store, clock) => {
    if (!DAY.test(clock.day)) return null;
    const log = (store.logs || []).find((row) => row && row.id === logId);
    if (!log || !isLive(log) || log.rest === true) return null;
    const day = draft && typeof draft.day === "string" ? draft.day : "";
    if (!validCalendarDay(day) || day > clock.day) return null;
    const nextId = day !== log.day && log.itemId ? checkOffId(store, log.itemId, day) : logId;
    if (!nextId) return null;
    if (log.itemId && day !== log.day) {
      const clash = (store.logs || []).some((row) => isLive(row) && row.id !== logId && row.itemId === log.itemId && row.day === day && row.rest !== true);
      if (clash) return null;
    }
    if (nextId !== log.id && (store.logs || []).some((row) => isLive(row) && row.id === nextId)) return null;
    const view = projectDailyRoutines(store);
    const compound = (view.compounds || []).find((row) => row.id === log.compoundId) || null;
    const skipped = log.status === "skipped";
    const doseItem = logHasSavedDose(log) && !skipped;
    const clockEdit = editedDoseAt(log, day, clock.day, draft);
    if (!clockEdit.ok) return null;
    const at = writeStamp(store, clock, nextId);
    const fields = doseItem ? null : {
      ...log,
      id: nextId,
      day,
      amount: null,
      unit: "",
      status: skipped ? "skipped" : (log.status || "done"),
      deletedAt: null,
    };
    let payload = fields;
    if (doseItem) {
      const rawAmount = draft && Object.prototype.hasOwnProperty.call(draft, "amount") ? draft.amount : log.amount;
      const amount = parseRoutineAmount(rawAmount);
      if (amount == null || amount <= 0) return null;
      const unit = unitForEditedLog(log, compound);
      if (!unit) return null;
      payload = {
        ...log,
        id: nextId,
        day,
        amount,
        unit,
        status: statusForEditedAmount(log, compound, amount, unit),
        deletedAt: null,
      };
    }
    payload = withDetailsFields(payload, draft, clockEdit.at);
    if (!payload) return null;
    if (draft && Object.prototype.hasOwnProperty.call(draft, "site")) {
      if (!doseItem) {
        if (draft.site != null && draft.site !== "") return null;
        delete payload.site;
      } else {
        if (draft.site != null && typeof draft.site !== "string") return null;
        const raw = typeof draft.site === "string" ? draft.site.trim() : "";
        const site = routineSiteId(raw);
        if (raw && !site) return null;
        if (site) payload.site = site;
        else delete payload.site;
      }
    }
    let next = upsertEntity(store, "logs", carryFuture(payload, store, nextId), at);
    if (!wrote(next, "logs", nextId, at)) return null;
    if (nextId !== log.id) {
      next = tombstoneLog(next, log.id, stampAfter(at, log.updatedAt));
      next = {
        ...next,
        logs: (next.logs || []).map((row) => (row && row.id === log.id ? { ...row, movedDay: day, movedAt: typeof log.at === "number" ? log.at : 0 } : row)),
      };
    }
    return next;
  });
}

export function compoundDoseHistory(store, compoundId) {
  const view = projectDailyRoutines(store);
  if (!view || typeof compoundId !== "string" || !compoundId) return [];
  return (view.logs || [])
    .filter((log) => log.compoundId === compoundId && log.rest !== true)
    .slice()
    .sort((a, b) => {
      if (a.day !== b.day) return a.day < b.day ? 1 : -1;
      const at = (b.at || 0) - (a.at || 0);
      if (at) return at;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

export function routineLogDraft(state, logId) {
  const store = state && normalizeDailyRoutines(state.dailyRoutines);
  if (!store || typeof logId !== "string" || !logId) return null;
  const log = (store.logs || []).find((row) => row && row.id === logId && isLive(row) && row.rest !== true);
  if (!log) return null;
  const view = projectDailyRoutines(store);
  const item = (view.items || []).find((row) => row.id === log.itemId) || null;
  const compound = (view.compounds || []).find((row) => row.id === log.compoundId) || null;
  const unit = unitForEditedLog(log, compound);
  return {
    logId: log.id,
    itemId: log.itemId,
    itemName: item ? item.name : (compound && compound.name ? compound.name : "Item"),
    compoundId: log.compoundId || null,
    amount: typeof log.amount === "number" ? String(log.amount) : "",
    unit,
    kind: logHasSavedDose(log) ? "dose" : "check",
    skipped: log.status === "skipped",
    day: log.day,
    maxDay: routineClock().day,
    time: routineClockTime(log.at),
    note: typeof log.note === "string" ? log.note : "",
    site: routineSiteId(log.site),
    error: "",
  };
}

/* One rest for the day. It is not a per-item log and it is not a skip. */
export function logRoutineRest(state) {
  return withStore(state, (store, clock) => {
    if (!DAY.test(clock.day)) return null;
    const view = projectDailyRoutines(store);
    if (routineRestLog(view.logs, clock.day)) return null;
    const id = routineLogId(null, clock.day);
    const at = writeStamp(store, clock, id);
    const next = upsertEntity(store, "logs", carryFuture({
      id,
      itemId: null,
      compoundId: null,
      day: clock.day,
      status: "done",
      amount: null,
      unit: "",
      at: clock.now,
      rest: true,
      deletedAt: null,
    }, store, id), at);
    return wrote(next, "logs", id, at);
  });
}

/* Changes which local clock hour starts the routine day. Logs keep the
   day they were stored with. */
export function setRoutineDayRollover(state, hour) {
  if (typeof hour !== "number" || !Number.isInteger(hour) || hour < 0 || hour > MAX_DAY_ROLLOVER_HOUR) return false;
  return withStore(state, (store, clock) => {
    const at = stampAfter(clock.now, store.settings && store.settings.updatedAt);
    store.settings = { ...store.settings, dayRolloverHour: hour, updatedAt: at };
    store.updatedAt = at;
    return store;
  });
}

export function toggleRoutineFocus(state) {
  return withStore(state, (store, clock) => {
    const at = prefStamp(store, clock);
    store.prefs = { ...store.prefs, focusMode: !(store.prefs && store.prefs.focusMode === true), updatedAt: at };
    store.updatedAt = at;
    return store;
  });
}

/* Saves a finished or skipped setup and shapes the page from it. touched
   names the answers whose one-time effects run (Focus mode, collapsed
   blocks); null runs all of them, as at the end of a full pass. */
export function saveRoutineSetup(state, { status, answers, touched = null, addOnly = false } = {}) {
  if (status !== "done" && status !== "skipped") return false;
  return withStore(state, (store, clock) => {
    const at = prefStamp(store, clock);
    return applySetup(store, {
      status,
      answers,
      at,
      touched,
      addOnly,
      keepOpen: (next) => {
        const moment = routineNowNext(next.blocks, clock.date);
        return moment.nowBlock ? moment.nowBlock.id : null;
      },
    });
  });
}

/* Adds a block or tool from Routines settings. A block the user deleted
   comes back through the normal restore, with its items. */
export function addRoutinePartToPage(state, key) {
  if (typeof key !== "string" || !key) return false;
  const id = SETUP_BLOCK_IDS[key];
  const stored = id && state && state.dailyRoutines && (state.dailyRoutines.blocks || []).find((block) => block && block.id === id);
  if (stored && !isLive(stored)) {
    if (!restoreRoutineBlock(state, id)) return false;
  }
  return withStore(state, (store, clock) => addRoutinePart(store, key, prefStamp(store, clock)));
}

export function hideRoutineTips(state) {
  return withStore(state, (store, clock) => {
    if (store.prefs && store.prefs.tipsHidden === true) return null;
    const at = prefStamp(store, clock);
    store.prefs = { ...store.prefs, tipsHidden: true, updatedAt: at };
    store.updatedAt = Math.max(store.updatedAt || 0, at);
    return store;
  });
}

/* A tool the store already uses stays on screen whatever the answers say,
   so nobody loses something they rely on by answering the setup. */
function routineInUse(feature, store) {
  if (!store || typeof store !== "object") return false;
  const doses = () => (store.items || []).some((item) => isLive(item) && item.kind === "dose");
  if (feature === "calculator" || feature === "injection") return (store.compounds || []).some(isLive) || doses();
  if (feature === "doses") return doses();
  if (feature === "rest") return (store.logs || []).some((log) => isLive(log) && log.rest === true);
  return false;
}

/* What the setup answers show. With no finished setup every part shows. */
export function routineShows(feature, store) {
  const source = store !== undefined ? store : app.state && app.state.dailyRoutines;
  return routineSetupShows(source && source.prefs, feature) || routineInUse(feature, source);
}

export function toggleRoutineReveal(state, blockId) {
  if (typeof blockId !== "string" || !blockId) return false;
  return withStore(state, (store, clock) => {
    if (!(store.blocks || []).some((block) => block.id === blockId && isLive(block))) return null;
    const current = Array.isArray(store.prefs && store.prefs.revealBlocks)
      ? store.prefs.revealBlocks.filter((id) => typeof id === "string" && id)
      : [];
    const revealBlocks = current.includes(blockId) ? current.filter((id) => id !== blockId) : current.concat(blockId);
    const at = prefStamp(store, clock);
    store.prefs = { ...store.prefs, revealBlocks, updatedAt: at };
    store.updatedAt = at;
    return store;
  });
}

function cleanName(name) {
  if (typeof name !== "string") return "";
  const text = name.trim();
  return text ? text.slice(0, 80) : "";
}

/* 1/4, ¼, and 0.25 all become the number 0.25. A blank or a negative is refused. */
export function parseRoutineAmount(raw) {
  if (typeof raw === "number") return Number.isFinite(raw) && raw >= 0 ? raw : null;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(trimmed)) return null;
  const text = trimmed.replace(",", ".");
  const glyphs = { "¼": 0.25, "½": 0.5, "¾": 0.75, "1¼": 1.25, "1½": 1.5, "1¾": 1.75 };
  if (Object.prototype.hasOwnProperty.call(glyphs, text)) return glyphs[text];
  const slash = text.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (slash) {
    const numerator = Number(slash[1]);
    const denominator = Number(slash[2]);
    if (!denominator || !Number.isFinite(numerator / denominator) || numerator / denominator < 0) return null;
    return numerator / denominator;
  }
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function liveBlocks(store) {
  return (store.blocks || []).filter((block) => isLive(block));
}

function nextBlockColor(store) {
  return ROUTINE_BLOCK_COLORS[liveBlocks(store).length % ROUTINE_BLOCK_COLORS.length];
}

function nextPlacementOrder(store, blockId) {
  return (store.placements || [])
    .filter((row) => isLive(row) && row.blockId === blockId)
    .reduce((max, row) => Math.max(max, row.order || 0), -1) + 1;
}

function sameIdList(liveIds, orderedIds) {
  if (!Array.isArray(orderedIds) || orderedIds.length !== liveIds.length) return false;
  const want = new Set(liveIds);
  if (want.size !== liveIds.length) return false;
  const seen = new Set();
  for (const id of orderedIds) {
    if (typeof id !== "string" || !want.has(id) || seen.has(id)) return false;
    seen.add(id);
  }
  return seen.size === want.size;
}

function rememberBlock(store, blockId, at) {
  const live = typeof blockId === "string" && liveBlocks(store).some((block) => block.id === blockId);
  const previous = store.prefs && typeof store.prefs.lastBlockId === "string" ? store.prefs.lastBlockId : null;
  const lastBlockId = live ? blockId : (previous && liveBlocks(store).some((block) => block.id === previous) ? previous : (liveBlocks(store)[0] || {}).id || null);
  store.prefs = { ...store.prefs, lastBlockId, updatedAt: at };
  store.updatedAt = Math.max(store.updatedAt || 0, at);
  return store;
}

function blockIdForItem(store, itemId) {
  const place = (store.placements || []).find((row) => isLive(row) && row.itemId === itemId && liveBlocks(store).some((block) => block.id === row.blockId));
  return place ? place.blockId : null;
}

function collapsedIds(prefs) {
  const list = Array.isArray(prefs && prefs.collapsedBlocks) ? prefs.collapsedBlocks : [];
  return list.filter((id) => typeof id === "string" && id);
}

/* A reorder records orderAt and does not move updatedAt. A tombstone from
   the other phone still beats the reorder. Rows whose order did not change
   are left alone. */
/* Open blocks on an all-done day. A different day does not reuse the list,
   so expanding today does not leave the block collapsed tomorrow. */
function allDoneOpenIds(prefs, day) {
  const raw = prefs && prefs.allDoneOpen;
  if (!raw || typeof raw !== "object" || raw.day !== day || !Array.isArray(raw.ids)) return [];
  return raw.ids.filter((id) => typeof id === "string" && id);
}

/* Plan edits change order, names, and placements. They never assign logs. */
function applyOrders(store, collection, ids, at) {
  return ids.reduce((next, id, index) => {
    const row = (next[collection] || []).find((entity) => entity && entity.id === id);
    if (!row || row.order === index) return next;
    return revisePlanEntity(next, collection, id, { order: index, orderAt: at }, row.updatedAt || at);
  }, store);
}

export function addRoutineBlock(state, name) {
  const trimmed = cleanName(name);
  if (!trimmed) return false;
  return withStore(state, (store, clock) => {
    const at = stampAfter(clock.now, store.updatedAt);
    const id = routineId("block");
    const order = liveBlocks(store).reduce((max, block) => Math.max(max, block.order || 0), -1) + 1;
    let next = upsertEntity(store, "blocks", {
      id,
      name: trimmed,
      color: nextBlockColor(store),
      order,
      deletedAt: null,
    }, at);
    if (!wrote(next, "blocks", id, at)) return null;
    return rememberBlock(next, id, at);
  });
}

function nextLiveBlockOrder(store) {
  return (store.blocks || []).filter(isLive).reduce((max, block) => Math.max(max, block.order || 0), -1) + 1;
}

/* Placements removed with the block come back when the block is edited or restored.
   A placement removed on its own keeps removedWith set to its own id. */
function reviveBlockPlacements(store, blockId, at) {
  let next = store;
  for (const place of store.placements || []) {
    if (!place || place.blockId !== blockId || place.removedWith !== blockId || isLive(place)) continue;
    next = upsertEntity(next, "placements", { ...place, deletedAt: null, removedWith: null }, at);
  }
  return next;
}

export function renameRoutineBlock(state, blockId, name) {
  const trimmed = cleanName(name);
  if (!trimmed || typeof blockId !== "string" || !blockId) return false;
  return withStore(state, (store, clock) => {
    const block = (store.blocks || []).find((row) => row && row.id === blockId && isLive(row));
    if (!block) return null;
    const at = stampAfter(clock.now, Math.max(store.updatedAt || 0, block.updatedAt || 0));
    const revised = revisePlanEntity(store, "blocks", blockId, { name: trimmed }, at);
    const next = reviveBlockPlacements(revised, blockId, at);
    const row = (next.blocks || []).find((item) => item.id === blockId);
    if (!row || row.name !== trimmed || row.updatedAt !== at) return null;
    return rememberBlock(next, blockId, at);
  });
}

export function setRoutineBlockColor(state, blockId, color) {
  if (typeof blockId !== "string" || !blockId || !TILE_COLORS.has(color)) return false;
  return withStore(state, (store, clock) => {
    const block = (store.blocks || []).find((row) => row && row.id === blockId && isLive(row));
    if (!block) return null;
    const at = stampAfter(clock.now, Math.max(store.updatedAt || 0, block.updatedAt || 0));
    const revised = revisePlanEntity(store, "blocks", blockId, { color }, at);
    const next = reviveBlockPlacements(revised, blockId, at);
    const row = (next.blocks || []).find((item) => item.id === blockId);
    if (!row || row.color !== color) return null;
    return rememberBlock(next, blockId, at);
  });
}

export function deleteRoutineBlock(state, blockId) {
  if (typeof blockId !== "string" || !blockId) return false;
  return withStore(state, (store, clock) => {
    const block = (store.blocks || []).find((row) => row && row.id === blockId && isLive(row));
    if (!block) return null;
    const at = stampAfter(clock.now, Math.max(store.updatedAt || 0, block.updatedAt || 0));
    let next = upsertEntity(store, "blocks", { ...block, deletedAt: at }, at);
    for (const place of store.placements || []) {
      if (!place || !isLive(place) || place.blockId !== blockId) continue;
      next = upsertEntity(next, "placements", { ...place, deletedAt: at, removedWith: blockId }, at);
    }
    const row = (next.blocks || []).find((item) => item.id === blockId);
    if (!row || !(row.deletedAt > 0)) return null;
    if (next.prefs && next.prefs.lastBlockId === blockId) next.prefs = { ...next.prefs, lastBlockId: null };
    return rememberBlock(next, null, at);
  });
}

export function restoreRoutineBlock(state, blockId) {
  if (typeof blockId !== "string" || !blockId) return false;
  return withStore(state, (store, clock) => {
    const block = (store.blocks || []).find((row) => row && row.id === blockId);
    if (!block || isLive(block)) return null;
    const at = stampAfter(clock.now, Math.max(block.updatedAt || 0, block.deletedAt || 0, store.updatedAt || 0));
    let next = upsertEntity(store, "blocks", { ...block, deletedAt: null, order: nextLiveBlockOrder(store) }, at);
    next = reviveBlockPlacements(next, blockId, at);
    next.placements = dedupePlacementPairs(next.placements);
    const row = (next.blocks || []).find((item) => item.id === blockId);
    if (!row || row.deletedAt != null || row.updatedAt !== at) return null;
    return rememberBlock(next, blockId, at);
  });
}

export function duplicateRoutineBlock(state, blockId) {
  if (typeof blockId !== "string" || !blockId) return false;
  return withStore(state, (store, clock) => {
    const block = (store.blocks || []).find((row) => row && row.id === blockId && isLive(row));
    if (!block) return null;
    const copies = (store.placements || [])
      .filter((row) => isLive(row) && row.blockId === blockId)
      .slice()
      .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const at = stampAfter(clock.now, store.updatedAt);
    const id = routineId("block");
    const order = liveBlocks(store).reduce((max, row) => Math.max(max, row.order || 0), -1) + 1;
    const suffix = " copy";
    const name = `${block.name.slice(0, 80 - suffix.length).trimEnd()}${suffix}`;
    let next = upsertEntity(store, "blocks", {
      id,
      name,
      color: TILE_COLORS.has(block.color) ? block.color : "citrus",
      order,
      deletedAt: null,
    }, at);
    if (!wrote(next, "blocks", id, at)) return null;
    for (const place of copies) {
      const placementId = routinePlacementId(id, place.itemId);
      next = upsertEntity(next, "placements", {
        id: placementId,
        blockId: id,
        itemId: place.itemId,
        order: place.order,
        deletedAt: null,
      }, at);
      if (!wrote(next, "placements", placementId, at)) return null;
    }
    return rememberBlock(next, id, at);
  });
}

export function reorderRoutineBlocks(state, orderedIds, movedId) {
  return withStore(state, (store, clock) => {
    const ids = liveBlocks(store).slice().sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map((block) => block.id);
    if (!sameIdList(ids, orderedIds)) return null;
    if (ids.join("\0") === orderedIds.join("\0")) return null;
    const at = stampAfter(clock.now, store.updatedAt);
    const next = applyOrders(store, "blocks", orderedIds, at);
    const moved = typeof movedId === "string" && orderedIds.includes(movedId) ? movedId : orderedIds[0];
    return rememberBlock(next, moved, at);
  });
}

export function reorderRoutinePlacements(state, blockId, orderedIds) {
  if (typeof blockId !== "string" || !blockId) return false;
  return withStore(state, (store, clock) => {
    if (!liveBlocks(store).some((block) => block.id === blockId)) return null;
    const liveItems = new Set((store.items || []).filter((row) => isLive(row)).map((row) => row.id));
    const ids = (projectDailyRoutines(store).placements || [])
      .filter((row) => row.blockId === blockId && liveItems.has(row.itemId))
      .slice()
      .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((row) => row.id);
    if (!sameIdList(ids, orderedIds)) return null;
    if (ids.join("\0") === orderedIds.join("\0")) return null;
    const at = stampAfter(clock.now, store.updatedAt);
    const next = applyOrders(store, "placements", orderedIds, at);
    return rememberBlock(next, blockId, at);
  });
}

/* The calculator note is on the item. It does not add or rewrite a log. */
export function saveRoutineItemNote(state, itemId, note, calc) {
  if (typeof itemId !== "string" || !itemId || typeof note !== "string") return false;
  return withStore(state, (store, clock) => {
    const item = (store.items || []).find((row) => row && row.id === itemId && isLive(row));
    if (!item || item.kind !== "dose") return null;
    const at = stampAfter(clock.now, Math.max(store.updatedAt || 0, item.updatedAt || 0));
    const logs = JSON.stringify(store.logs);
    const patch = { note };
    if (calc && typeof calc.vialAmount === "number" && typeof calc.waterMl === "number") {
      patch.calcVial = calc.vialAmount;
      patch.calcWater = calc.waterMl;
      patch.calcVialUnit = calc.vialUnit;
      patch.calcDoseUnit = calc.doseUnit;
      patch.calcDose = calc.doseAmount;
    } else {
      patch.calcVial = null;
      patch.calcWater = null;
      patch.calcVialUnit = null;
      patch.calcDoseUnit = null;
      patch.calcDose = null;
    }
    const next = revisePlanEntity(store, "items", itemId, patch, at);
    const row = (next.items || []).find((entry) => entry.id === itemId);
    const expected = note.trim().slice(0, 500);
    if (!row || (row.note || "") !== expected) return null;
    if (JSON.stringify(next.logs) !== logs) return null;
    return next;
  });
}

export function renameRoutineItem(state, itemId, name) {
  const trimmed = cleanName(name);
  if (!trimmed || typeof itemId !== "string" || !itemId) return false;
  return withStore(state, (store, clock) => {
    const item = (store.items || []).find((row) => row && row.id === itemId && isLive(row));
    if (!item) return null;
    const at = stampAfter(clock.now, Math.max(store.updatedAt || 0, item.updatedAt || 0));
    let next = revisePlanEntity(store, "items", itemId, { name: trimmed }, at);
    const row = (next.items || []).find((entry) => entry.id === itemId);
    if (!row || row.name !== trimmed) return null;
    if (item.compoundId) {
      const compound = (next.compounds || []).find((entry) => entry && entry.id === item.compoundId && isLive(entry));
      if (compound) next = revisePlanEntity(next, "compounds", compound.id, { name: trimmed }, at);
    }
    return rememberBlock(next, blockIdForItem(next, itemId), at);
  });
}

export function deleteRoutineItem(state, itemId) {
  if (typeof itemId !== "string" || !itemId) return false;
  return withStore(state, (store, clock) => {
    const item = (store.items || []).find((row) => row && row.id === itemId && isLive(row));
    if (!item) return null;
    const at = stampAfter(clock.now, Math.max(store.updatedAt || 0, item.updatedAt || 0));
    let next = upsertEntity(store, "items", { ...item, deletedAt: at }, at);
    for (const place of store.placements || []) {
      if (!place || !isLive(place) || place.itemId !== itemId) continue;
      next = upsertEntity(next, "placements", { ...place, deletedAt: at, removedWith: itemId }, at);
    }
    const row = (next.items || []).find((entry) => entry.id === itemId);
    if (!row || !(row.deletedAt > 0)) return null;
    return next;
  });
}

export function restoreRoutineItem(state, itemId) {
  if (typeof itemId !== "string" || !itemId) return false;
  return withStore(state, (store, clock) => {
    const item = (store.items || []).find((row) => row && row.id === itemId);
    if (!item || isLive(item)) return null;
    const at = stampAfter(clock.now, Math.max(item.updatedAt || 0, item.deletedAt || 0, store.updatedAt || 0));
    let next = upsertEntity(store, "items", { ...item, deletedAt: null }, at);
    for (const place of store.placements || []) {
      if (!place || place.itemId !== itemId || place.removedWith !== itemId || isLive(place)) continue;
      next = upsertEntity(next, "placements", { ...place, deletedAt: null }, at);
    }
    next.placements = dedupePlacementPairs(next.placements);
    const row = (next.items || []).find((entry) => entry.id === itemId);
    if (!row || row.deletedAt != null) return null;
    return rememberBlock(next, blockIdForItem(next, itemId), at);
  });
}

function selectedBlockIds(store, draft) {
  const live = new Set(liveBlocks(store).map((block) => block.id));
  const raw = Array.isArray(draft && draft.blockIds) ? draft.blockIds : [];
  const ids = [];
  for (const id of raw) {
    if (typeof id !== "string" || !live.has(id) || ids.includes(id)) continue;
    ids.push(id);
  }
  return ids;
}

function doseDraft(kind, draft) {
  switch (kind) {
    case "check":
      return { amount: null, unit: "" };
    case "dose": {
      const amount = parseRoutineAmount(draft && draft.amount);
      const unit = draft && typeof draft.unit === "string" ? draft.unit : "";
      if (amount == null || !DOSE_UNIT_SET.has(unit)) return null;
      return { amount, unit };
    }
    default: {
      const unexpected = kind;
      void unexpected;
      return null;
    }
  }
}

/* An item turned from a dose into a check drops its compoundId. Its logs
   keep theirs, so turning it back into a dose reuses the newest live
   compound those logs name, and the dose history stays whole. */
function loggedCompoundId(store, itemId) {
  if (typeof itemId !== "string" || !itemId) return "";
  const logs = (store.logs || [])
    .filter((log) => log && log.itemId === itemId && typeof log.compoundId === "string" && log.compoundId)
    .sort((a, b) => ((b.at || 0) - (a.at || 0)) || ((b.updatedAt || 0) - (a.updatedAt || 0)));
  for (const log of logs) {
    const compound = (store.compounds || []).find((row) => row && row.id === log.compoundId);
    if (compound && isLive(compound)) return compound.id;
  }
  return "";
}

function writeCompound(store, item, name, dose, clock, at) {
  const previousId = item && typeof item.compoundId === "string" && item.compoundId
    ? item.compoundId
    : loggedCompoundId(store, item && item.id);
  const existing = previousId ? (store.compounds || []).find((row) => row && row.id === previousId) : null;
  const id = existing ? existing.id : routineId("compound");
  const next = upsertEntity(store, "compounds", {
    id,
    name,
    amount: dose.amount,
    unit: dose.unit,
    startDate: existing && existing.startDate ? existing.startDate : clock.day,
    chartLine: !!(existing && existing.chartLine === true),
    archivedAt: null,
    deletedAt: null,
  }, at);
  return wrote(next, "compounds", id, at) ? { store: next, compoundId: id } : null;
}

function placeInBlock(store, blockId, itemId, at) {
  const rows = (store.placements || []).filter((row) => row && row.blockId === blockId && row.itemId === itemId);
  const live = rows.find((row) => isLive(row));
  /* A kept block is part of this save. Stamp it at the save revision so the
     other phone's older removal cannot beat a membership this edit kept. */
  if (live) {
    if ((live.updatedAt || 0) >= at && live.deletedAt == null) return store;
    return upsertEntity(store, "placements", { ...live, deletedAt: null }, at);
  }
  const dead = rows.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
  if (dead) return upsertEntity(store, "placements", { ...dead, order: nextPlacementOrder(store, blockId), deletedAt: null, removedWith: null }, at);
  const id = routinePlacementId(blockId, itemId);
  return upsertEntity(store, "placements", {
    id,
    blockId,
    itemId,
    order: nextPlacementOrder(store, blockId),
    deletedAt: null,
  }, at);
}

/* Custom items only. Evidence from the draft is ignored. A dose stores the
   amount and unit on its compound. Optional on-hand count and mixed-on date
   live on the item. A blank value clears that field. Logs are not rewritten. */
export function saveRoutineItem(state, draft) {
  const name = cleanName(draft && draft.name);
  const kind = draft && (draft.kind === "dose" || draft.kind === "check") ? draft.kind : "";
  const dose = doseDraft(kind, draft);
  if (!name || !dose) return false;
  return withStore(state, (store, clock) => {
    if (!DAY.test(clock.day)) return null;
    const blockIds = selectedBlockIds(store, draft);
    if (!blockIds.length) return null;
    const itemId = draft && typeof draft.itemId === "string" && draft.itemId ? draft.itemId : routineId("item");
    const existing = (store.items || []).find((row) => row && row.id === itemId);
    if (draft && draft.itemId && (!existing || !isLive(existing))) return null;
    const at = stampAfter(clock.now, store.updatedAt);
    let next = store;
    let compoundId = existing && existing.compoundId ? existing.compoundId : null;
    if (kind === "dose") {
      const written = writeCompound(next, existing, name, dose, clock, at);
      if (!written) return null;
      next = written.store;
      compoundId = written.compoundId;
    }
    const kept = { ...(existing || {}) };
    delete kept.evidence;
    const supply = supplyFromDraft(draft, kind, clock.day, existing);
    if (!supply) return null;
    next = upsertEntity(next, "items", {
      ...kept,
      ...supply,
      id: itemId,
      name,
      kind,
      compoundId: kind === "dose" ? compoundId : null,
      /* A new check has no compound start day. Keep the day it was added
         so a later miss is still a miss. Edits do not move that day. */
      ...(existing ? {} : { startDate: clock.day }),
      deletedAt: null,
    }, at);
    if (!wrote(next, "items", itemId, at)) return null;
    const chosen = new Set(blockIds);
    for (const blockId of blockIds) next = placeInBlock(next, blockId, itemId, at);
    for (const place of (store.placements || []).filter((row) => isLive(row) && row.itemId === itemId && !chosen.has(row.blockId))) {
      next = upsertEntity(next, "placements", { ...place, deletedAt: at, removedWith: place.id }, at);
    }
    const primary = chosen.has(draft.blockId) ? draft.blockId : blockIds[0];
    return rememberBlock(next, primary, at);
  });
}

export function addRoutineItem(state, blockId, draft) {
  const blockIds = draft && Array.isArray(draft.blockIds) && draft.blockIds.length ? draft.blockIds : [blockId];
  return saveRoutineItem(state, { ...(draft || {}), itemId: null, blockId, blockIds });
}

export function routineItemDraft(state, source) {
  const store = state && normalizeDailyRoutines(state.dailyRoutines);
  const view = projectDailyRoutines(store) || { blocks: [], items: [], placements: [], compounds: [] };
  const itemId = source && typeof source.itemId === "string" ? source.itemId : "";
  const item = itemId ? (view.items || []).find((row) => row.id === itemId) : null;
  const compound = item && item.compoundId ? (view.compounds || []).find((row) => row.id === item.compoundId) : null;
  const placed = item
    ? (view.placements || []).filter((row) => row.itemId === item.id).map((row) => row.blockId)
    : [];
  const blockId = source && typeof source.blockId === "string" ? source.blockId : "";
  const blockIds = placed.length ? placed : (blockId ? [blockId] : []);
  const kind = item && item.kind === "dose" ? "dose" : "check";
  return {
    itemId: item ? item.id : null,
    blockId: blockIds.includes(blockId) ? blockId : (blockIds[0] || blockId || null),
    name: item ? item.name : "",
    kind,
    amount: kind === "dose" && compound && typeof compound.amount === "number" ? String(compound.amount) : "",
    unit: compound && DOSE_UNIT_SET.has(compound.unit) ? compound.unit : "mcg",
    onHand: item && Number.isInteger(item.onHand) ? String(item.onHand) : "",
    mixedOn: item && typeof item.mixedOn === "string" ? item.mixedOn : "",
    blockIds,
  };
}

export function rememberRoutineBlock(state, blockId) {
  if (typeof blockId !== "string" || !blockId) return false;
  return withStore(state, (store, clock) => {
    if (!liveBlocks(store).some((block) => block.id === blockId)) return null;
    const at = stampAfter(clock.now, store.prefs && store.prefs.updatedAt);
    return rememberBlock(store, blockId, at);
  });
}

export function toggleRoutineCollapsed(state, blockId) {
  if (typeof blockId !== "string" || !blockId) return false;
  return withStore(state, (store, clock) => {
    if (!liveBlocks(store).some((block) => block.id === blockId)) return null;
    const at = stampAfter(clock.now, store.prefs && store.prefs.updatedAt);
    const view = projectDailyRoutines(store);
    if (view && routineDayComplete(view, clock.day) && !layoutEditing()) {
      const current = allDoneOpenIds(store.prefs, clock.day);
      const ids = current.includes(blockId) ? current.filter((id) => id !== blockId) : current.concat(blockId);
      store.prefs = { ...store.prefs, allDoneOpen: { day: clock.day, ids }, updatedAt: at };
      store.updatedAt = Math.max(store.updatedAt || 0, at);
      return rememberBlock(store, blockId, at);
    }
    const current = collapsedIds(store.prefs);
    const collapsedBlocks = current.includes(blockId) ? current.filter((id) => id !== blockId) : current.concat(blockId);
    store.prefs = { ...store.prefs, collapsedBlocks, updatedAt: at };
    store.updatedAt = Math.max(store.updatedAt || 0, at);
    return rememberBlock(store, blockId, at);
  });
}

/* Writes the three default blocks once, only for a signed-in flag-on session.
   A store that already has a block row, including a deleted one, is left
   alone so restoring that block still finds its placements. Logs stay put. */
export function ensureRoutineShell(state, now = Date.now()) {
  if (!canMutateRoutines() || !state || typeof state !== "object" || accountPullPending()) return null;
  const before = state.dailyRoutines;
  const hadLive = !!(before && Array.isArray(before.blocks) && before.blocks.some((block) => isLive(block)));
  if (!hadLive) {
    const prior = normalizeDailyRoutines(before);
    const seeded = seedDefaultBlocks(before, now);
    /* Every default already has a row (a deleted one keeps its tombstone):
       nothing to write, so no save and no push on each paint. */
    if (!prior || seeded.blocks.length > prior.blocks.length) {
      if (!putDailyRoutines(state, seeded)) return null;
      if (typeof app.save === "function") app.save();
    }
  }
  return projectDailyRoutines(state.dailyRoutines);
}

function pageHeader(title, sub, gear) {
  if (typeof app.pageHead === "function") return app.pageHead(title, sub, gear ? { left: gear } : {});
  return `<div class="page-head"><div class="ph-text"><h1 class="page-title">${esc(title)}</h1>${sub ? `<div class="page-sub">${esc(sub)}</div>` : ""}</div>${gear || ""}</div>`;
}

const GEAR = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3V20.5M3.5 12h2.2M18.3 12h2.2M6.1 6.1l1.6 1.6M16.3 16.3l1.6 1.6M17.9 6.1l-1.6 1.6M7.7 16.3l-1.6 1.6"/></svg>`;
const CHECK = `<svg class="dr-streak-mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 9.2 16.7 19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function gearButton() {
  return `<button type="button" class="icon-btn dr-gear" data-action="routines-settings" aria-label="Routines settings">${GEAR}</button>`;
}

function pullHintHTML() {
  return `<p class="dr-pull" data-pull="idle" role="status" hidden>Pull to refresh</p>`;
}

function signInHTML() {
  return `<div class="dr-page" data-routines-shell="signed-out">
    ${pageHeader("Routines", "Sign in required")}
    <section class="dr-signin">
      <h2>Sign in to use Routines</h2>
      <p>Sign in to see and change your routines.</p>
      <button type="button" class="btn primary block" data-action="auth-open">Sign in</button>
    </section>
  </div>`;
}

function streakHTML(streak) {
  const mark = streak > 0 ? CHECK : "";
  const unit = streak === 1 ? "day" : "days";
  return `<p class="dr-streak" data-streak="${streak}"><span class="dr-vh">Streak </span>${mark}<b>${streak}</b><span class="dr-vh"> ${unit}</span></p>`;
}

function focusSwitch(on) {
  return `<div class="dr-focus">
    <span id="dr-focus-label">Focus mode</span>
    <button type="button" class="switch" role="switch" aria-checked="${on ? "true" : "false"}" aria-labelledby="dr-focus-label" data-action="routines-focus"><i></i></button>
  </div>`;
}

function restHTML(log) {
  if (!log) {
    return `<div class="dr-rest" data-rest-day="false"><button type="button" class="dr-rest-btn" data-action="routines-rest">Log rest</button></div>`;
  }
  return `<div class="dr-rest" data-rest-day="true"><span>Rest logged</span><button type="button" class="dr-undo" data-action="routines-undo" data-log-id="${esc(log.id)}">Undo <span class="dr-vh">rest</span></button></div>`;
}

function nowFooter(projected, date) {
  const day = todayKey(date);
  const progress = routineDoseProgress(projected, day);
  const streak = routineStreak(projected.logs, day);
  const focusOn = !!(projected.prefs && projected.prefs.focusMode === true);
  const rest = routineRestLog(projected.logs, day);
  return `<div class="dr-pills">
      <p class="dr-count" data-logged="${progress.logged}" data-due="${progress.due}"><span class="dr-vh">Doses </span><b>${progress.logged}</b> of ${progress.due} today</p>
      ${streakHTML(streak)}
    </div>
    ${focusSwitch(focusOn)}
    ${rest || routineShows("rest", projected) ? restHTML(rest) : ""}`;
}

function nextItemHTML(projected, date, day) {
  const next = routineNextItem(projected, date, day);
  if (!next) {
    const waiting = placedItems(projected).length > 0 ? "Nothing left to log" : "Nothing to log yet";
    return `<p class="dr-next">${waiting}</p>`;
  }
  const wait = next.overdue ? "overdue" : formatRoutineWait(next.waitMin);
  const tail = wait ? `<span class="dr-wait">${esc(wait)}</span>` : "";
  return `<p class="dr-next">Next: ${esc(next.item.name)}${tail}</p>`;
}

export function routineNowHTML(projected, date) {
  const day = todayKey(date);
  const footer = nowFooter(projected, date);
  if (routineDayComplete(projected, day)) {
    return `<section class="dr-all-done" data-all-done="true" aria-labelledby="dr-now-title">
      <h2 class="dr-now-title" id="dr-now-title">${DONE_MARK}All done today ✓</h2>
      ${footer}
    </section>`;
  }
  const moment = routineNowNext(projected.blocks, date);
  const clock = formatRoutineClock(date);
  const slot = SLOT_LABEL[moment.slot] || "Today";
  if (!moment.nowBlock) {
    return `<section class="dr-now" data-color="lavender" aria-labelledby="dr-now-title">
      <p class="dr-k">Now · ${esc(clock)}</p>
      <h2 class="dr-now-title" id="dr-now-title">Nothing scheduled</h2>
      <p class="dr-next">${esc(slot)}. Add a routine to see what comes next.</p>
      ${footer}
    </section>`;
  }
  const color = tileColor(moment.nowBlock.color);
  return `<section class="dr-now" data-color="${color}" aria-labelledby="dr-now-title">
    <p class="dr-k">Now · ${esc(slot)} · ${esc(clock)}</p>
    <h2 class="dr-now-title" id="dr-now-title">${esc(moment.nowBlock.name)}</h2>
    ${nextItemHTML(projected, date, day)}
    ${footer}
  </section>`;
}

const TILE_KICKERS = new Map([
  ["Morning routine", "Morning"],
  ["Wake-up routine", "Wake-up"],
  ["Supplement & enhancer stack", "Stack"],
  ["Supplements", "Supplements"],
  ["Supplements & medications", "Supplements"],
  ["Night routine", "Night"],
  ["Wind-down routine", "Wind-down"],
  ["Enhancers & peptides", "Enhancers"],
  ["Medications", "Medications"],
]);

function tileKicker(block) {
  return TILE_KICKERS.get(block.name) || "Routine";
}

function tileMeta(open, logged, skipped) {
  const total = open + logged + skipped;
  if (!total) return "No items yet";
  if (!open && skipped && !logged) return "All skipped";
  if (!open) return "All done";
  if (!logged && !skipped) return open === 1 ? "1 item" : `${open} items`;
  return open === 1 ? "1 to log" : `${open} to log`;
}

function layoutEditing() {
  return !!(app.ui && app.ui.dailyRoutineEdit === true);
}

function placementId(row) {
  return row.placement && row.placement.id ? row.placement.id : "";
}

function rowAttrs(row) {
  const id = placementId(row);
  return `data-item-id="${esc(row.item.id)}" data-placement-id="${esc(id)}" data-id="${esc(id)}"`;
}

function historyButton(row) {
  if (!row.item || row.item.kind !== "dose" || !row.compound) return "";
  return `<button type="button" class="dr-history" data-action="routines-history" data-compound-id="${esc(row.compound.id)}" data-item-id="${esc(row.item.id)}">History <span class="dr-vh">${esc(row.item.name)}</span></button>`;
}

function editLogButton(row) {
  if (!row.log || row.log.rest === true) return "";
  return `<button type="button" class="dr-edit-log" data-action="routines-log-edit" data-log-id="${esc(row.log.id)}">Edit <span class="dr-vh">${esc(row.item.name)}</span></button>`;
}

function openRowHTML(row, projected, date, day) {
  const doseHTML = amountMarkup(doseText(row));
  const timing = row.item ? itemTiming(projected, row.item, date, day) : { overdue: false };
  const detail = rowDetailMarkup(projected, row, date, day);
  const supply = supplyMarkup(projected, row, day);
  const overdue = timing.overdue ? ` data-overdue="true"` : "";
  /* Skip, history, and rename keep their own actions. The log button is the
     one the click handler uses, so a long press still reaches the details page. */
  return `<li class="dr-row" ${rowAttrs(row)} data-details="row" data-state="open"${overdue} data-action="routines-log">
    <button type="button" class="dr-log" data-action="routines-log" data-item-id="${esc(row.item.id)}">
      <span class="dr-mark" aria-hidden="true"></span>
      <span class="dr-copy"><span class="dr-line"><span class="dr-vh">Log </span><span class="dr-name" data-rename="item" data-item-id="${esc(row.item.id)}">${esc(row.item.name)}</span>${doseHTML}</span>${detail}${itemNoteMarkup(row.item, row.compound)}${supply}</span>
    </button>
    <button type="button" class="dr-rename dr-rename-quiet" data-action="routines-rename-item" data-item-id="${esc(row.item.id)}" aria-label="Rename ${esc(row.item.name)}">Rename</button>
    ${historyButton(row)}
    <button type="button" class="dr-skip" data-action="routines-skip" data-item-id="${esc(row.item.id)}">Skip <span class="dr-vh">${esc(row.item.name)}</span></button>
  </li>`;
}

function editRowHTML(row, projected, day) {
  const dose = doseText(row);
  const doseHTML = dose ? `<span class="dr-dose"> · ${esc(dose)}</span>` : "";
  const supply = supplyMarkup(projected, row, day);
  const id = placementId(row);
  const state = row.open ? "open" : rowState(row.log);
  return `<li class="dr-row" ${rowAttrs(row)} data-state="${state}">
    <button type="button" class="dr-handle" data-reorder="item" data-id="${esc(id)}" data-block-id="${esc(row.placement.blockId)}" aria-label="Reorder ${esc(row.item.name)}" aria-keyshortcuts="ArrowUp ArrowDown"><span class="dr-grip" aria-hidden="true"></span></button>
    <button type="button" class="dr-edit-name" data-action="routines-edit-item" data-item-id="${esc(row.item.id)}" data-block-id="${esc(row.placement.blockId)}">
      <span class="dr-line"><span class="dr-name" data-rename="item" data-item-id="${esc(row.item.id)}">${esc(row.item.name)}</span>${doseHTML}</span>${itemNoteMarkup(row.item, row.compound)}
      ${supply}
    </button>
    <button type="button" class="dr-minus" data-action="routines-delete-item" data-item-id="${esc(row.item.id)}" aria-label="Remove ${esc(row.item.name)} from all routines"><span aria-hidden="true">−</span></button>
  </li>`;
}

function doneRowHTML(row, projected, date, day) {
  const state = rowState(row.log);
  const label = state === "skipped" ? "Skipped" : state === "partial" ? "Partial" : "Logged";
  const markClass = state === "skipped" ? "dr-mark dr-mark-skip" : "dr-mark dr-mark-on";
  const mark = state === "skipped" ? "–" : "✓";
  const doseHTML = amountMarkup(loggedAmountText(row.log));
  const detail = rowDetailMarkup(projected, row, date, day);
  return `<li class="dr-row dr-row-done" data-details="row" data-item-id="${esc(row.item.id)}" data-log-id="${esc(row.log.id)}" data-state="${state}">
    <span class="${markClass}" aria-hidden="true">${mark}</span>
    <span class="dr-copy"><span class="dr-line"><span class="dr-name">${esc(row.item.name)}</span>${doseHTML}</span>${detail}${itemNoteMarkup(row.item, row.compound)}<span class="dr-state">${label}</span></span>
    <span class="dr-done-actions">${historyButton(row)}${editLogButton(row)}<button type="button" class="dr-undo" data-action="routines-undo" data-log-id="${esc(row.log.id)}">Undo <span class="dr-vh">${esc(row.item.name)}</span></button></span>
  </li>`;
}

export function routineBlockTileHTML(block, projected, view) {
  const day = view && view.day ? view.day : routineClock().day;
  const date = view && view.date instanceof Date && !Number.isNaN(view.date.getTime()) ? view.date : routineClock().date;
  const rows = routineBlockRows(projected, block.id, day);
  const open = rows.filter((row) => row.open);
  const done = rows.filter((row) => !row.open);
  const logged = done.filter((row) => rowState(row.log) !== "skipped").length;
  const skipped = done.length - logged;
  const revealed = !!(view && view.revealed);
  const current = !!(view && view.current);
  const collapsed = !!(view && view.collapsed);
  const last = !!(view && view.last);
  const editing = layoutEditing();
  const dim = !!(view && view.focus && !current);
  const color = tileColor(block.color);
  const shown = editing ? rows : open;
  const list = !collapsed && shown.length
    ? `<ul class="dr-rows"${editing ? ` data-routine-list="items" data-block-id="${esc(block.id)}"` : ""}>${shown.map((row) => editing ? editRowHTML(row, projected, day) : openRowHTML(row, projected, date, day)).join("")}</ul>`
    : "";
  const resting = !editing && routineRestLog(projected && projected.logs, day);
  const logAll = !editing && !collapsed && !resting && open.length
    ? `<button type="button" class="dr-log-all" data-action="routines-log-all" data-block-id="${esc(block.id)}">Log all <span class="dr-vh">in ${esc(block.name)}</span></button>`
    : "";
  const reveal = !editing && !collapsed && done.length
    ? `<button type="button" class="dr-reveal" data-action="routines-reveal" data-block-id="${esc(block.id)}" aria-expanded="${revealed ? "true" : "false"}">${revealed ? "Hide" : "Show"} ${done.length === 1 ? "1 completed" : `${done.length} completed`}</button>`
    : "";
  const doneList = !editing && !collapsed && revealed && done.length ? `<ul class="dr-done">${done.map((row) => doneRowHTML(row, projected, date, day)).join("")}</ul>` : "";
  const add = `<button type="button" class="dr-add" data-action="routines-add-item" data-block-id="${esc(block.id)}">Add item <span class="dr-vh">to ${esc(block.name)}</span></button>`;
  const swatches = editing
    ? `<div class="dr-colors" role="radiogroup" aria-label="Color for ${esc(block.name)}. Colors follow the accent.">${ROUTINE_BLOCK_COLORS.map((token) => `<button type="button" class="dr-swatch" data-color="${token}" data-action="routines-color" data-block-id="${esc(block.id)}" aria-pressed="${color === token ? "true" : "false"}" aria-label="${token}, follows the accent"></button>`).join("")}</div>`
    : "";
  const tools = editing
    ? `<div class="dr-tools">
        <button type="button" class="dr-handle" data-reorder="block" data-id="${esc(block.id)}" aria-label="Reorder ${esc(block.name)}" aria-keyshortcuts="ArrowUp ArrowDown"><span class="dr-grip" aria-hidden="true"></span></button>
        ${swatches}
        <button type="button" class="dr-rename" data-action="routines-rename-block" data-block-id="${esc(block.id)}" aria-label="Rename ${esc(block.name)}">Rename</button>
        <button type="button" class="dr-dup" data-action="routines-duplicate-block" data-block-id="${esc(block.id)}" aria-label="Duplicate ${esc(block.name)}">Duplicate</button>
        <button type="button" class="dr-minus" data-action="routines-delete-block" data-block-id="${esc(block.id)}" aria-label="Delete ${esc(block.name)}"><span aria-hidden="true">−</span></button>
      </div>`
    : `<button type="button" class="dr-rename dr-rename-quiet" data-action="routines-rename-block" data-block-id="${esc(block.id)}" aria-label="Rename ${esc(block.name)}">Rename</button>`;
  return `<article class="dr-tile${dim ? " dr-dim" : ""}" data-color="${color}" data-block-id="${esc(block.id)}" data-current="${current ? "true" : "false"}" data-collapsed="${collapsed ? "true" : "false"}" data-last="${last ? "true" : "false"}" data-id="${esc(block.id)}">
    ${tools}
    <button type="button" class="dr-block-toggle" data-action="routines-collapse" data-block-id="${esc(block.id)}" data-rename="block" aria-expanded="${collapsed ? "false" : "true"}">
      <span class="dr-k">${esc(tileKicker(block))}</span>
      <span class="dr-title-line"><h3>${esc(block.name)}</h3><span class="dr-chevron" aria-hidden="true"></span></span>
      <span class="dr-vh">Long press to rename.</span>
    </button>
    <p class="dr-tile-meta">${esc(tileMeta(open.length, logged, skipped))}</p>
    ${list}
    ${logAll}
    ${reveal}
    ${doneList}
    ${add}
  </article>`;
}

export function routineBlockTilesHTML(projected, date) {
  const clock = date instanceof Date && !Number.isNaN(date.getTime()) ? date : routineClock().date;
  const day = todayKey(clock);
  const moment = routineNowNext(projected.blocks, clock);
  const focus = !!(projected.prefs && projected.prefs.focusMode === true);
  const revealed = new Set(Array.isArray(projected.prefs && projected.prefs.revealBlocks) ? projected.prefs.revealBlocks.filter((id) => typeof id === "string") : []);
  const collapsedSet = new Set(collapsedIds(projected.prefs));
  const complete = !layoutEditing() && routineDayComplete(projected, day);
  const opened = new Set(complete ? allDoneOpenIds(projected.prefs, day) : []);
  const lastId = projected.prefs && typeof projected.prefs.lastBlockId === "string" ? projected.prefs.lastBlockId : "";
  const currentId = moment.nowBlock ? moment.nowBlock.id : "";
  const tiles = (projected.blocks || []).map((block) => routineBlockTileHTML(block, projected, {
    day,
    date: clock,
    current: block.id === currentId,
    focus,
    revealed: revealed.has(block.id),
    collapsed: complete ? !opened.has(block.id) : collapsedSet.has(block.id),
    last: block.id === lastId,
  })).join("");
  return `<div class="dr-tiles" data-focus="${focus ? "on" : "off"}" data-routine-list="blocks">${tiles}</div>`;
}

/* Discover stays closed. The top button and the empty state both open the
   coming-soon sheet. There is no library, no seed row, and no recommendation. */
function discoverEntryHTML() {
  return `<button type="button" class="dr-discover" data-action="routines-discover" data-routines-discover="entry">
    <span class="dr-discover-name">Discover</span>
    <span class="dr-discover-soon">Coming soon</span>
  </button>`;
}

function emptyDiscoverHTML() {
  return `<section class="dr-empty" data-routines-discover="empty">
    <h2>Coming soon</h2>
    <p>Discover stays closed until cited entries are ready. Nothing is listed here.</p>
    <button type="button" class="btn primary block" data-action="routines-discover">Discover</button>
  </section>`;
}

function waitingHTML(date) {
  const sub = typeof app.fmtDate === "function"
    ? app.fmtDate(todayKey(date), { weekday: "long", month: "long", day: "numeric" })
    : todayKey(date);
  return `<div class="dr-page" data-routines-shell="syncing">
    ${pullHintHTML()}
    ${pageHeader("Routines", sub, gearButton())}
    <section class="dr-signin" aria-labelledby="dr-sync-title">
      <h2 id="dr-sync-title">Syncing your account</h2>
      <p>Routines show up when that finishes. Nothing is saved until then.</p>
    </section>
  </div>`;
}

function headerTools() {
  const editing = layoutEditing();
  const label = editing ? "Done editing routines" : "Edit routines";
  const edit = `<button type="button" class="dr-edit-toggle" data-action="routines-edit" aria-pressed="${editing ? "true" : "false"}" aria-label="${label}">${editing ? "Done" : "Edit"}</button>`;
  return edit + gearButton();
}

function deletedHTML() {
  if (!layoutEditing()) return "";
  const raw = app.state && app.state.dailyRoutines;
  if (!raw) return "";
  const blocks = (raw.blocks || []).filter((row) => row && !isLive(row));
  const items = (raw.items || []).filter((row) => row && !isLive(row));
  if (!blocks.length && !items.length) return "";
  const blockRows = blocks.map((block) => `<li><span>${esc(block.name || "Routine")}</span><button type="button" data-action="routines-restore-block" data-block-id="${esc(block.id)}" aria-label="Restore ${esc(block.name || "routine")}">Restore</button></li>`).join("");
  const itemRows = items.map((item) => `<li><span>${esc(item.name || "Item")}</span><button type="button" data-action="routines-restore-item" data-item-id="${esc(item.id)}" aria-label="Restore ${esc(item.name || "item")}">Restore</button></li>`).join("");
  return `<section class="dr-deleted" aria-labelledby="dr-deleted-title">
    <h2 id="dr-deleted-title">Deleted</h2>
    ${blocks.length ? `<ul class="dr-deleted-list">${blockRows}</ul>` : ""}
    ${items.length ? `<ul class="dr-deleted-list">${itemRows}</ul>` : ""}
  </section>`;
}

function logToastHTML() {
  if (!routineLogToast()) return "";
  return `<div class="dr-log-toast" data-log-toast="true" role="status"><span class="dr-log-toast-line">Logged · <button type="button" data-action="routines-toast-undo">Undo</button></span></div>`;
}

function setupLaterHTML(view) {
  if (readSetup(view.prefs) || !(app.ui && app.ui.routineSetupLater === true)) return "";
  return `<section class="dr-setup-later" aria-labelledby="dr-setup-later-title">
    <h2 id="dr-setup-later-title">Finish setting up Routines</h2>
    <p>A few questions fit this page to what you track.</p>
    <button type="button" class="btn primary block" data-action="routines-setup-open">Continue setup</button>
  </section>`;
}

function tipsHTML(view) {
  if (!routineShows("tips", view) || (view.prefs && view.prefs.tipsHidden === true)) return "";
  return `<section class="dr-tips" aria-labelledby="dr-tips-title">
    <h2 id="dr-tips-title">Getting started</h2>
    <ul>
      <li>Tap an item when you've done it or taken it.</li>
      <li>Skip marks it skipped for today, so it stops waiting.</li>
      <li>Edit at the top adds, renames and moves routines.</li>
      <li>The gear opens settings, where you can change your setup answers.</li>
    </ul>
    <button type="button" class="dr-tips-hide" data-action="routines-tips-hide">Hide tips</button>
  </section>`;
}

function paintShell(view, date) {
  const sub = typeof app.fmtDate === "function"
    ? app.fmtDate(todayKey(date), { weekday: "long", month: "long", day: "numeric" })
    : todayKey(date);
  const hasItems = (view.items || []).length > 0;
  const editing = layoutEditing();
  const announce = app.ui && app.ui.routineAnnounce ? app.ui.routineAnnounce : "";
  return `<div class="dr-page" data-routines-shell="signed-in" data-routines-edit="${editing ? "on" : "off"}">
    ${pullHintHTML()}
    ${pageHeader("Routines", sub, headerTools())}
    ${discoverEntryHTML()}
    <p class="dr-live" role="status" aria-live="polite">${esc(announce)}</p>
    ${setupLaterHTML(view)}
    ${tipsHTML(view)}
    ${routineNowHTML(view, date)}
    ${routineBlockTilesHTML(view, date)}
    <button type="button" class="dr-add dr-add-block" data-action="routines-add-block">Add routine</button>
    ${routineShows("calculator", view) ? `<button type="button" class="dr-calc-open" data-action="routines-calc">Reconstitution calculator</button>` : ""}
    <button type="button" class="dr-history-open" data-action="routines-history-open">History <span class="dr-vh">calendar and graph</span></button>
    ${deletedHTML()}
    ${hasItems ? "" : emptyDiscoverHTML()}
    ${logToastHTML()}
  </div>`;
}

function shellHTML(date) {
  if (accountPullPending()) {
    const existing = projectDailyRoutines(app.state && app.state.dailyRoutines);
    if (!existing || !existing.blocks.length) return waitingHTML(date);
    return paintShell(existing, date);
  }
  const projected = ensureRoutineShell(app.state, date.getTime());
  const view = projected || { blocks: [], items: [], placements: [], logs: [], compounds: [], prefs: {} };
  return paintShell(view, date);
}

export function dailyRoutinesHTML() {
  if (app.ROUTINES_ENABLED !== true) return "";
  if (!canMutateRoutines()) return signInHTML();
  return shellHTML(shellDate());
}

/* The Now card is painted from the clock at render time. While this tab is
   the one on screen, paint again at the next minute so the clock, the
   countdown, and the current block follow the wall clock. Another tab, a
   hidden page, signing out, or the flag off clears that timer. */
let nowRefreshTimer = 0;
let nowVisibilityBound = false;

function routineTabVisible() {
  if (app.ROUTINES_ENABLED !== true) return false;
  if (!app.ui || app.ui.tab !== "daily-routines") return false;
  if (typeof document !== "undefined" && document.hidden) return false;
  if (!canMutateRoutines()) return false;
  return true;
}

/* A full paint rebuilds an open sheet and the page under the finger, so a
   minute that lands while a sheet is open, a field has focus, or the layout
   is being edited waits for the next minute instead. */
function routineRefreshWouldInterrupt() {
  if (app.ui && app.ui.sheet) return true;
  if (layoutEditing()) return true;
  const active = typeof document !== "undefined" ? document.activeElement : null;
  const tag = active && typeof active.tagName === "string" ? active.tagName.toUpperCase() : "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  // A keyboard user on a Routines button would lose their place. A tap leaves
  // focus on the button without :focus-visible, so it does not hold the clock.
  if (!active || typeof active.closest !== "function" || !active.closest("[data-routines-shell]")) return false;
  try {
    return typeof active.matches === "function" && active.matches(":focus-visible");
  } catch {
    return false;
  }
}

function msUntilNextMinute(date) {
  const seconds = date.getSeconds();
  const millis = date.getMilliseconds();
  const wait = (60 - seconds) * 1000 - millis;
  return wait > 0 ? wait : 60000;
}

export function stopRoutineNowRefresh() {
  if (!nowRefreshTimer) return;
  clearTimeout(nowRefreshTimer);
  nowRefreshTimer = 0;
}

export function syncRoutineNowRefresh() {
  if (!nowVisibilityBound && typeof document !== "undefined" && typeof document.addEventListener === "function") {
    nowVisibilityBound = true;
    document.addEventListener("visibilitychange", () => syncRoutineNowRefresh());
  }
  stopRoutineNowRefresh();
  if (!routineTabVisible()) return;
  const date = shellDate();
  nowRefreshTimer = setTimeout(() => {
    nowRefreshTimer = 0;
    if (!routineTabVisible()) return;
    if (routineRefreshWouldInterrupt()) { syncRoutineNowRefresh(); return; }
    if (typeof app.render === "function") app.render();
  }, msUntilNextMinute(date));
}

const ROUTINE_FAQ = [
  ["What is Routines?", "A list of items you check off each day. It does not replace Workouts, Food, sleep, or water."],
  ["Who can use it?", "Sign in with your Insight account. Routines are saved with that account."],
  ["How do I log an item?", "Tap the row. Skip marks it handled and does not count it as taken. Undo is on a finished row."],
  ["What does the number at the top count?", "How many items you logged today. It does not add amounts together, and a skip is left out."],
  ["When does a streak reset?", "Only when a whole day is missed. A skip does not reset it."],
  ["Can I change a logged amount or day?", "Use Edit on a finished row. You can enter a quarter or a partial amount, or move the log to an earlier day."],
  ["What does the calculator show?", "The arithmetic of the vial amount, water, and amount you type. The screen repeats what you entered. It is not a recommendation, and it does not save a log."],
  ["Does Routines send reminders?", "No. Nothing is scheduled, and Routines does not ask to alert you. A countdown on a row stays on this page."],
  ["How do I refresh?", "Pull down from the top of Routines. Opening the app also loads the latest copy from your account."],
  ["Where is Discover?", "Study-backed entries are not in the app yet. That button does not add an item and does not suggest an amount."],
];

export function routinesFaqHTML() {
  const rows = ROUTINE_FAQ.map(([question, answer]) => `<div><dt>${esc(question)}</dt><dd>${esc(answer)}</dd></div>`).join("");
  return `<section class="dr-faq" aria-labelledby="dr-faq-title"><h4 class="dr-faq-title" id="dr-faq-title">FAQ</h4><dl>${rows}</dl></section>`;
}

function rolloverHourLabel(hour) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const face = hour % 12 || 12;
  return `${face}:00 ${suffix}`;
}

/* PR 8 owns the settings sheet. Keep this control in that sheet. The hour
   is dailyRoutines.settings.dayRolloverHour, read through the store. */
export function routineDayRolloverControlHTML(hour) {
  const selected = routineDayRolloverHour(hour);
  const options = [];
  for (let value = 0; value <= MAX_DAY_ROLLOVER_HOUR; value += 1) {
    options.push(`<option value="${value}"${value === selected ? " selected" : ""}>${rolloverHourLabel(value)}</option>`);
  }
  return `<div class="dr-set-row">
      <label id="dr-rollover-label" for="dr-rollover-hour">New day starts</label>
      <select id="dr-rollover-hour" class="text-in" aria-labelledby="dr-rollover-label">${options.join("")}</select>
    </div>
    <p class="sub">A log before this hour counts for the previous day. The default is 4:00 AM.</p>`;
}

/* Everything Routines can show that this page does not have yet, each with
   Add. Adding never removes anything. */
function addListHTML() {
  const store = app.state && app.state.dailyRoutines;
  const setup = readSetup(store && store.prefs);
  const missing = routineParts(store, (feature) => routineShows(feature, store)).filter((part) => !part.present);
  const rows = missing.map((part) => `<li><span class="dr-add-copy"><span class="dr-add-name">${esc(part.label)}</span><span class="dr-add-hint">${esc(part.hint)}</span></span><button type="button" data-action="routines-part-add" data-part="${esc(part.key)}" aria-label="Add ${esc(part.label)}">Add</button></li>`).join("");
  const list = missing.length
    ? `<h4 class="dr-add-head">Add to your page</h4><ul class="dr-add-list">${rows}</ul>`
    : `<p class="sub">Everything Routines offers is already on your page.</p>`;
  const start = setup ? "" : `<button type="button" class="btn block" data-action="routines-setup-open">Set up your page</button>`;
  return `${list}${start}`;
}

/* The one place a finished setup can be taken again, kept quiet at the very
   bottom of Routines settings. */
function retakeHTML() {
  const store = app.state && app.state.dailyRoutines;
  if (!readSetup(store && store.prefs)) return "";
  return `<button type="button" class="dr-retake" data-action="routines-setup-retake">Retake setup quiz</button>`;
}

export function routinesSettingsSheetHTML() {
  const store = app.state && app.state.dailyRoutines;
  const prefs = store && store.prefs;
  const on = !!(prefs && prefs.focusMode === true);
  const hour = store && store.settings ? store.settings.dayRolloverHour : undefined;
  const calc = routineShows("calculator", store)
    ? `<button type="button" class="btn block" data-action="routines-calc">Reconstitution calculator</button>
    <p class="sub">The calculator shows the arithmetic of what you entered. It does not suggest an amount.</p>`
    : "";
  return `<h3>Routines settings</h3>
    <div class="dr-set-row">
      <span id="dr-set-focus">Focus mode</span>
      <button type="button" class="switch" role="switch" aria-checked="${on ? "true" : "false"}" aria-labelledby="dr-set-focus" data-action="routines-focus"><i></i></button>
    </div>
    <p class="sub">Focus mode dims every block except the current one. Countdowns stay on the row. Routines does not send reminders.</p>
    ${routineDayRolloverControlHTML(hour)}
    ${calc}
    ${routinesFaqHTML()}
    ${addListHTML()}
    <button type="button" class="btn block" data-action="sheet-close">Done</button>
    ${retakeHTML()}`;
}

export function routinesDiscoverSheetHTML() {
  return `<h3>Coming soon</h3>
    <p class="sub">Discover is not open yet. There is no library here. This does not add an item, and it does not suggest a dose.</p>
    <button type="button" class="btn primary block" data-action="sheet-close">Close</button>`;
}

app.ensureRoutineShell = ensureRoutineShell;
app.routineNowNext = routineNowNext;
app.routineClock = routineClock;
app.loggedTodayCount = loggedTodayCount;
app.routineDoseProgress = routineDoseProgress;
app.routineDayComplete = routineDayComplete;
app.routineNextItem = routineNextItem;
app.lastDoseLabel = lastDoseLabel;
app.routineStreak = routineStreak;
app.routineRestLog = routineRestLog;
app.shiftRoutineDay = shiftRoutineDay;
app.logRoutineItem = logRoutineItem;
app.logAllRoutineBlock = logAllRoutineBlock;
app.undoRoutineLogs = undoRoutineLogs;
app.showRoutineLogToast = showRoutineLogToast;
app.routineLogToast = routineLogToast;
app.clearRoutineLogToast = clearRoutineLogToast;
app.undoRoutineLogToast = undoRoutineLogToast;
app.latestRoutineLogId = latestRoutineLogId;
app.editRoutineLog = editRoutineLog;
app.compoundDoseHistory = compoundDoseHistory;
app.routineLogDraft = routineLogDraft;
app.loggedAmountText = loggedAmountText;
app.doseCountdownText = doseCountdownText;
app.skipRoutineItem = skipRoutineItem;
app.undoRoutineLog = undoRoutineLog;
app.restoreRoutineLog = restoreRoutineLog;
app.logRoutineRest = logRoutineRest;
app.setRoutineDayRollover = setRoutineDayRollover;
app.routineDayRolloverControlHTML = routineDayRolloverControlHTML;
app.toggleRoutineFocus = toggleRoutineFocus;
app.saveRoutineSetup = saveRoutineSetup;
app.hideRoutineTips = hideRoutineTips;
app.addRoutinePartToPage = addRoutinePartToPage;
app.routineShows = routineShows;
app.toggleRoutineReveal = toggleRoutineReveal;
app.addRoutineBlock = addRoutineBlock;
app.renameRoutineBlock = renameRoutineBlock;
app.setRoutineBlockColor = setRoutineBlockColor;
app.deleteRoutineBlock = deleteRoutineBlock;
app.restoreRoutineBlock = restoreRoutineBlock;
app.duplicateRoutineBlock = duplicateRoutineBlock;
app.reorderRoutineBlocks = reorderRoutineBlocks;
app.reorderRoutinePlacements = reorderRoutinePlacements;
app.saveRoutineItemNote = saveRoutineItemNote;
app.renameRoutineItem = renameRoutineItem;
app.deleteRoutineItem = deleteRoutineItem;
app.restoreRoutineItem = restoreRoutineItem;
app.saveRoutineItem = saveRoutineItem;
app.addRoutineItem = addRoutineItem;
app.routineItemDraft = routineItemDraft;
app.parseRoutineAmount = parseRoutineAmount;
app.parseRoutineTime = parseRoutineTime;
app.routineClockTime = routineClockTime;
app.rememberRoutineBlock = rememberRoutineBlock;
app.toggleRoutineCollapsed = toggleRoutineCollapsed;
app.routineBlockRows = routineBlockRows;
app.dailyRoutinesHTML = dailyRoutinesHTML;
app.syncRoutineNowRefresh = syncRoutineNowRefresh;
app.stopRoutineNowRefresh = stopRoutineNowRefresh;
app.routineNowHTML = routineNowHTML;
app.routineBlockTileHTML = routineBlockTileHTML;
app.routineBlockTilesHTML = routineBlockTilesHTML;
app.routinesSettingsSheetHTML = routinesSettingsSheetHTML;
app.routinesFaqHTML = routinesFaqHTML;
app.routinesDiscoverSheetHTML = routinesDiscoverSheetHTML;

/* Pull down on this tab only. The account copy reloads through cloudPull.
   A sideways move stays with the pager. Nothing here asks to alert the user. */
export const ROUTINE_PULL_PX = 64;
const PULL_ARM_PX = 12;
let routinePull = null;
let routineRefreshing = false;

function routinePane() {
  if (typeof document === "undefined" || typeof document.querySelector !== "function") return null;
  return document.querySelector('[data-pane="daily-routines"]');
}

function routinePullElement() {
  if (typeof document === "undefined" || typeof document.querySelector !== "function") return null;
  return document.querySelector(".dr-pull");
}

function pullBlocked() {
  if (app.ROUTINES_ENABLED !== true) return true;
  if (!app.ui || app.ui.tab !== "daily-routines") return true;
  if (app.ui.sheet || app.ui.dailyRoutineEdit === true) return true;
  if (app.ui.workoutOpen || app.ui.cardioOpen) return true;
  if (!app.session || !app.session.user || !app.sb) return true;
  return false;
}

function scrollAtTop() {
  const pane = routinePane();
  if (!pane) return false;
  return (Number(pane.scrollTop) || 0) <= 0;
}

function blockedPullTarget(target) {
  if (!target || typeof target.closest !== "function") return true;
  if (target.closest("#sheet, #dialog, #tabs, button, a, input, textarea, select, .switch")) return true;
  return !target.closest('[data-pane="daily-routines"]');
}

function pullPoint(ev) {
  if (!ev || (ev.touches && ev.touches.length !== 1)) return null;
  const touch = ev.touches ? ev.touches[0] : ev;
  if (!touch || typeof touch.clientY !== "number") return null;
  return { x: Number(touch.clientX) || 0, y: touch.clientY, target: ev.target || null };
}

function paintPull(phase, label) {
  const el = routinePullElement();
  if (!el) return;
  const idle = phase === "idle";
  el.hidden = idle;
  if (typeof el.setAttribute === "function") el.setAttribute("data-pull", phase);
  if (idle && typeof el.setAttribute === "function") el.setAttribute("hidden", "");
  else if (!idle && typeof el.removeAttribute === "function") el.removeAttribute("hidden");
  el.textContent = label;
}

export function onRoutinePullStart(ev) {
  routinePull = null;
  if (routineRefreshing || pullBlocked()) return;
  const point = pullPoint(ev);
  if (!point || blockedPullTarget(point.target) || !scrollAtTop()) return;
  routinePull = { x: point.x, y: point.y, dy: 0, phase: "wait" };
}

export function onRoutinePullMove(ev) {
  if (!routinePull || routineRefreshing) return;
  const point = pullPoint(ev);
  if (!point) return;
  const dy = point.y - routinePull.y;
  const dx = point.x - routinePull.x;
  if (routinePull.phase === "wait") {
    if (Math.abs(dy) < PULL_ARM_PX && Math.abs(dx) < PULL_ARM_PX) return;
    if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || pullBlocked() || !scrollAtTop()) {
      routinePull = null;
      paintPull("idle", "Pull to refresh");
      return;
    }
    routinePull.phase = "pulling";
  }
  routinePull.dy = Math.max(0, dy);
  const ready = routinePull.dy >= ROUTINE_PULL_PX;
  paintPull(ready ? "ready" : "pulling", ready ? "Release to refresh" : "Pull to refresh");
  if (ev && ev.cancelable && typeof ev.preventDefault === "function") ev.preventDefault();
}

async function finishRoutinePull() {
  if (routineRefreshing || typeof app.cloudPull !== "function" || pullBlocked()) {
    paintPull("idle", "Pull to refresh");
    return false;
  }
  routineRefreshing = true;
  paintPull("refreshing", "Refreshing");
  try {
    await app.cloudPull();
    return true;
  } catch (e) {
    return false;
  } finally {
    routineRefreshing = false;
    paintPull("idle", "Pull to refresh");
  }
}

export function onRoutinePullEnd() {
  if (!routinePull) return Promise.resolve(false);
  const fire = routinePull.phase === "pulling" && routinePull.dy >= ROUTINE_PULL_PX;
  routinePull = null;
  if (!fire) {
    paintPull("idle", "Pull to refresh");
    return Promise.resolve(false);
  }
  return finishRoutinePull();
}

export function onRoutinePullCancel() {
  routinePull = null;
  if (!routineRefreshing) paintPull("idle", "Pull to refresh");
}

if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  document.addEventListener("touchstart", onRoutinePullStart, { passive: true });
  document.addEventListener("touchmove", onRoutinePullMove, { passive: false });
  document.addEventListener("touchend", onRoutinePullEnd, { passive: true });
  document.addEventListener("touchcancel", onRoutinePullCancel, { passive: true });
  document.addEventListener("change", (ev) => {
    const el = ev.target;
    if (!el || el.id !== "dr-rollover-hour" || app.ROUTINES_ENABLED !== true) return;
    const hour = Number(el.value);
    if (!setRoutineDayRollover(app.state, hour)) return;
    if (typeof app.save === "function") app.save();
    if (typeof app.render === "function") app.render();
  });
}
