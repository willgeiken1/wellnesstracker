import { app } from "../runtime.js";
import {
  canMutateRoutines,
  isLive,
  normalizeDailyRoutines,
  projectDailyRoutines,
  putDailyRoutines,
  revisePlanEntity,
  routineId,
  seedDefaultBlocks,
  upsertEntity,
} from "../shared/daily-routines-store.js";
import { nextDoseCountdown } from "../shared/routine-dose.js";

/* Routines tab. The flag stays off in source. This module paints only when
   app.ROUTINES_ENABLED is true. A signed-out session gets a sign-in prompt
   and no dailyRoutines write.

   Check-off writes a log through upsertEntity and putDailyRoutines. Undo of
   that log is a newer tombstone (deletedAt > 0), which is what keeps the
   other phone's older copy from bringing the dose back. Bringing a tombstoned
   log back is a newer row with deletedAt null (restoreRoutineLog).

   The day key is app.today(). The clock face is app.routineNow(). Do not
   derive the day from the clock's UTC instant.

   Log all writes one done log per open item in that block. A skip already
   covers its item. A whole-day rest covers the day, so Log all writes
   nothing on a rest day and does not rewrite a rest row. A log tap shows
   "Logged · Undo" for 3 seconds. This file does not listen for the pointer,
   so a long press stays available for rename and details. */

const TILE_COLORS = new Set(["citrus", "lavender", "pink"]);
export const ROUTINE_BLOCK_COLORS = Object.freeze(["citrus", "lavender", "pink"]);
export const ROUTINE_DOSE_UNITS = Object.freeze(["mcg", "mg", "IU", "mL", "units"]);
const DOSE_UNIT_SET = new Set(ROUTINE_DOSE_UNITS);
const DEFAULT_START = new Map([
  ["Morning routine", 5],
  ["Supplement & enhancer stack", 12],
  ["Night routine", 17],
]);
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

function todayKey(date) {
  if (typeof app.today === "function") {
    const day = app.today();
    if (typeof day === "string" && day) return day;
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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

/* Count of logs for the day. Skips and rest are not doses. Amounts are not summed. */
export function loggedTodayCount(logs, day) {
  if (!Array.isArray(logs) || typeof day !== "string") return 0;
  return logs.filter((log) => isLive(log) && log.day === day && log.status !== "skipped" && log.rest !== true).length;
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

export function doseCountdownText(projected, item, date, day) {
  if (!projected || !item) return "";
  const result = nextDoseCountdown({
    item,
    blocks: projected.blocks,
    placements: projected.placements,
    logs: projected.logs,
    date,
    day,
  });
  if (!result || typeof result.waitMin !== "number") return "";
  const wait = formatRoutineWait(result.waitMin);
  if (!wait) return "";
  return wait === "now" ? "Next dose now" : `Next dose ${wait}`;
}

function countdownMarkup(projected, row, date, day) {
  if (!row.item || row.item.kind !== "dose") return "";
  const result = nextDoseCountdown({
    item: row.item,
    blocks: projected.blocks,
    placements: projected.placements,
    logs: projected.logs,
    date,
    day,
  });
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
  if (!tag && !countdown && !lastHTML) return "";
  return `<span class="dr-meta">${tag}${countdown}${lastHTML}</span>`;
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
  const current = normalizeDailyRoutines(state.dailyRoutines);
  if (!current) return false;
  const next = mutate(current, clock);
  if (!next) return false;
  return putDailyRoutines(state, next);
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
    const compound = compoundFor(view, item);
    const at = stampAfter(clock.now, store.updatedAt);
    const id = routineId("log");
    const next = upsertEntity(store, "logs", {
      id,
      itemId: item.id,
      compoundId: item.compoundId || null,
      day: clock.day,
      status: "done",
      amount: compound && typeof compound.amount === "number" ? compound.amount : null,
      unit: compound && compound.unit ? compound.unit : "",
      at: clock.now,
      deletedAt: null,
    }, at);
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
    const at = stampAfter(clock.now, store.updatedAt);
    const id = routineId("log");
    const next = upsertEntity(store, "logs", {
      id,
      itemId: item.id,
      compoundId: item.compoundId || null,
      day: clock.day,
      status: "skipped",
      amount: null,
      unit: "",
      at: clock.now,
      deletedAt: null,
    }, at);
    return wrote(next, "logs", id, at);
  });
}

/* Removes a check-off, skip, or rest from today. The row stays in the list
   so a merge can see it. deletedAt is newer than the live copy. */
export function undoRoutineLog(state, logId) {
  if (typeof logId !== "string" || !logId) return false;
  return withStore(state, (store, clock) => {
    const log = (store.logs || []).find((row) => row && row.id === logId);
    if (!log || !isLive(log)) return null;
    const at = stampAfter(clock.now, log.updatedAt);
    const next = upsertEntity(store, "logs", { ...log, deletedAt: at }, at);
    const row = (next.logs || []).find((item) => item.id === logId);
    if (!row || row.updatedAt !== at || !(row.deletedAt > 0)) return null;
    return next;
  });
}

/* Store undo of a tombstone: a newer row with deletedAt null wins the merge
   and the log counts again. This is not the check-off Undo button. */
export function restoreRoutineLog(state, logId) {
  if (typeof logId !== "string" || !logId) return false;
  return withStore(state, (store, clock) => {
    const log = (store.logs || []).find((row) => row && row.id === logId);
    if (!log || isLive(log)) return null;
    const at = stampAfter(clock.now, Math.max(log.updatedAt || 0, log.deletedAt || 0));
    const next = upsertEntity(store, "logs", { ...log, deletedAt: null }, at);
    const row = (next.logs || []).find((item) => item.id === logId);
    if (!row || row.updatedAt !== at || row.deletedAt != null) return null;
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
    const compound = row.item.kind === "dose" ? compoundFor(view, row.item) : null;
    const id = routineId("log");
    ids.push(id);
    next = upsertEntity(next, "logs", {
      id,
      itemId: row.item.id,
      compoundId: row.item.compoundId || null,
      day: clock.day,
      status: "done",
      amount: compound && typeof compound.amount === "number" ? compound.amount : null,
      unit: compound && compound.unit ? compound.unit : "",
      at: clock.now,
      deletedAt: null,
    }, at);
    const saved = (next.logs || []).find((log) => log.id === id);
    if (!saved || saved.updatedAt !== at || saved.deletedAt != null || saved.rest === true) return false;
    at += 1;
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

function statusForEditedAmount(log, compound, amount) {
  const planned = compound && typeof compound.amount === "number" ? compound.amount : null;
  if (planned != null && amountsEqual(amount, planned)) return "done";
  if (amountsEqual(amount, log.amount) && (log.status === "done" || log.status === "partial")) return log.status;
  return "partial";
}

function unitForEditedLog(log, compound) {
  if (log.unit && DOSE_UNIT_SET.has(log.unit)) return log.unit;
  if (compound && DOSE_UNIT_SET.has(compound.unit)) return compound.unit;
  return "";
}

/* Changes the amount and the day on one log. The day is the string the
   user picked. It is not today's key and not the UTC day of the clock.
   The compound row is left alone, so later edits to the item do not
   rewrite this log. */
export function editRoutineLog(state, logId, draft) {
  if (typeof logId !== "string" || !logId) return false;
  return withStore(state, (store, clock) => {
    if (!DAY.test(clock.day)) return null;
    const log = (store.logs || []).find((row) => row && row.id === logId);
    if (!log || !isLive(log) || log.rest === true) return null;
    const amount = parseRoutineAmount(draft && draft.amount);
    const day = draft && typeof draft.day === "string" ? draft.day : "";
    if (amount == null || !validCalendarDay(day) || day > clock.day) return null;
    if (log.itemId) {
      const clash = (store.logs || []).some((row) => isLive(row) && row.id !== logId && row.itemId === log.itemId && row.day === day && row.rest !== true);
      if (clash) return null;
    }
    const view = projectDailyRoutines(store);
    const compound = (view.compounds || []).find((row) => row.id === log.compoundId) || null;
    const item = (view.items || []).find((row) => row.id === log.itemId) || null;
    const unit = unitForEditedLog(log, compound);
    if (item && item.kind === "dose" && !unit) return null;
    const at = stampAfter(clock.now, log.updatedAt);
    const next = upsertEntity(store, "logs", {
      ...log,
      day,
      amount,
      unit,
      status: statusForEditedAmount(log, compound, amount),
      deletedAt: null,
    }, at);
    return wrote(next, "logs", logId, at);
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
    amount: typeof log.amount === "number" ? formatAmount(log.amount) : "",
    unit,
    day: log.day,
    maxDay: routineClock().day,
    error: "",
  };
}

/* One rest for the day. It is not a per-item log and it is not a skip. */
export function logRoutineRest(state) {
  return withStore(state, (store, clock) => {
    if (!DAY.test(clock.day)) return null;
    const view = projectDailyRoutines(store);
    if (routineRestLog(view.logs, clock.day)) return null;
    const at = stampAfter(clock.now, store.updatedAt);
    const id = routineId("rest");
    const next = upsertEntity(store, "logs", {
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
    }, at);
    return wrote(next, "logs", id, at);
  });
}

export function toggleRoutineFocus(state) {
  return withStore(state, (store, clock) => {
    const at = stampAfter(clock.now, store.prefs && store.prefs.updatedAt);
    store.prefs = { ...store.prefs, focusMode: !(store.prefs && store.prefs.focusMode === true), updatedAt: at };
    store.updatedAt = at;
    return store;
  });
}

export function toggleRoutineReveal(state, blockId) {
  if (typeof blockId !== "string" || !blockId) return false;
  return withStore(state, (store, clock) => {
    if (!(store.blocks || []).some((block) => block.id === blockId && isLive(block))) return null;
    const current = Array.isArray(store.prefs && store.prefs.revealBlocks)
      ? store.prefs.revealBlocks.filter((id) => typeof id === "string" && id)
      : [];
    const revealBlocks = current.includes(blockId) ? current.filter((id) => id !== blockId) : current.concat(blockId);
    const at = stampAfter(clock.now, store.prefs && store.prefs.updatedAt);
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
  const text = raw.trim().replace(",", ".");
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

/* Open blocks on an all-done day. A different day does not reuse the list,
   so expanding today does not leave the block collapsed tomorrow. */
function allDoneOpenIds(prefs, day) {
  const raw = prefs && prefs.allDoneOpen;
  if (!raw || typeof raw !== "object" || raw.day !== day || !Array.isArray(raw.ids)) return [];
  return raw.ids.filter((id) => typeof id === "string" && id);
}

/* Plan edits change order, names, and placements. They never assign logs. */
function applyOrders(store, collection, ids, at) {
  return ids.reduce((next, id, index) => revisePlanEntity(next, collection, id, { order: index }, at), store);
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

export function renameRoutineBlock(state, blockId, name) {
  const trimmed = cleanName(name);
  if (!trimmed || typeof blockId !== "string" || !blockId) return false;
  return withStore(state, (store, clock) => {
    const block = (store.blocks || []).find((row) => row && row.id === blockId && isLive(row));
    if (!block) return null;
    const at = stampAfter(clock.now, Math.max(store.updatedAt || 0, block.updatedAt || 0));
    const next = revisePlanEntity(store, "blocks", blockId, { name: trimmed }, at);
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
    const next = revisePlanEntity(store, "blocks", blockId, { color }, at);
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
    let next = upsertEntity(store, "blocks", { ...block, deletedAt: null }, at);
    for (const place of store.placements || []) {
      if (!place || place.blockId !== blockId || place.removedWith !== blockId || isLive(place)) continue;
      next = upsertEntity(next, "placements", { ...place, deletedAt: null }, at);
    }
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
      const placementId = routineId("place");
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
    const ids = (store.placements || [])
      .filter((row) => isLive(row) && row.blockId === blockId && liveItems.has(row.itemId))
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

function writeCompound(store, item, name, dose, clock, at) {
  const previousId = item && typeof item.compoundId === "string" ? item.compoundId : "";
  const existing = previousId ? (store.compounds || []).find((row) => row && row.id === previousId) : null;
  const id = existing ? existing.id : routineId("compound");
  const next = upsertEntity(store, "compounds", {
    id,
    name,
    amount: dose.amount,
    unit: dose.unit,
    startDate: existing && existing.startDate ? existing.startDate : clock.day,
    archivedAt: null,
    deletedAt: null,
  }, at);
  return wrote(next, "compounds", id, at) ? { store: next, compoundId: id } : null;
}

function placeInBlock(store, blockId, itemId, at) {
  const rows = (store.placements || []).filter((row) => row && row.blockId === blockId && row.itemId === itemId);
  if (rows.some((row) => isLive(row))) return store;
  const dead = rows.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
  if (dead) return upsertEntity(store, "placements", { ...dead, order: nextPlacementOrder(store, blockId), deletedAt: null, removedWith: null }, at);
  const id = routineId("place");
  return upsertEntity(store, "placements", {
    id,
    blockId,
    itemId,
    order: nextPlacementOrder(store, blockId),
    deletedAt: null,
  }, at);
}

/* Custom items only. Evidence from the draft is ignored. A dose stores the
   amount and unit on its compound. Logs are not rewritten. */
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
    next = upsertEntity(next, "items", {
      ...kept,
      id: itemId,
      name,
      kind,
      compoundId: kind === "dose" ? compoundId : (existing && existing.compoundId ? existing.compoundId : null),
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
  const hasBlocks = !!(before && Array.isArray(before.blocks) && before.blocks.length);
  if (!hasBlocks) {
    const seeded = seedDefaultBlocks(before, now);
    if (!putDailyRoutines(state, seeded)) return null;
    if (typeof app.save === "function") app.save();
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

function signInHTML() {
  return `<div class="dr-page" data-routines-shell="signed-out">
    ${pageHeader("Routines", "Sign in required")}
    <section class="dr-signin">
      <h2>Sign in to use Routines</h2>
      <p>Routines stay on your Insight account. Nothing is saved on this phone until you sign in.</p>
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
    ${restHTML(rest)}`;
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

function tileKicker(block) {
  if (block.name === "Night routine") return "Night";
  if (block.name === "Supplement & enhancer stack") return "Stack";
  if (block.name === "Morning routine") return "Morning";
  return "Routine";
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
  const overdue = timing.overdue ? ` data-overdue="true"` : "";
  /* The row itself logs. Skip, history, and rename keep their own actions,
     and the click handler uses the inner one. No pointer listener here, so
     a long press still reaches rename and the later details page. */
  return `<li class="dr-row" ${rowAttrs(row)} data-state="open"${overdue} data-action="routines-log">
    <button type="button" class="dr-log" data-action="routines-log" data-item-id="${esc(row.item.id)}">
      <span class="dr-mark" aria-hidden="true"></span>
      <span class="dr-copy"><span class="dr-line"><span class="dr-vh">Log </span><span class="dr-name" data-rename="item" data-item-id="${esc(row.item.id)}">${esc(row.item.name)}</span>${doseHTML}</span>${detail}</span>
    </button>
    <button type="button" class="dr-rename dr-rename-quiet" data-action="routines-rename-item" data-item-id="${esc(row.item.id)}" aria-label="Rename ${esc(row.item.name)}">Rename</button>
    ${historyButton(row)}
    <button type="button" class="dr-skip" data-action="routines-skip" data-item-id="${esc(row.item.id)}">Skip <span class="dr-vh">${esc(row.item.name)}</span></button>
  </li>`;
}

function editRowHTML(row) {
  const dose = doseText(row);
  const doseHTML = dose ? `<span class="dr-dose"> · ${esc(dose)}</span>` : "";
  const id = placementId(row);
  const state = row.open ? "open" : rowState(row.log);
  return `<li class="dr-row" ${rowAttrs(row)} data-state="${state}">
    <button type="button" class="dr-handle" data-reorder="item" data-id="${esc(id)}" data-block-id="${esc(row.placement.blockId)}" aria-label="Reorder ${esc(row.item.name)}" aria-keyshortcuts="ArrowUp ArrowDown"><span class="dr-grip" aria-hidden="true"></span></button>
    <button type="button" class="dr-edit-name" data-action="routines-edit-item" data-item-id="${esc(row.item.id)}" data-block-id="${esc(row.placement.blockId)}">
      <span class="dr-line"><span class="dr-name" data-rename="item" data-item-id="${esc(row.item.id)}">${esc(row.item.name)}</span>${doseHTML}</span>
    </button>
    <button type="button" class="dr-minus" data-action="routines-delete-item" data-item-id="${esc(row.item.id)}" aria-label="Delete ${esc(row.item.name)}"><span aria-hidden="true">−</span></button>
  </li>`;
}

function doneRowHTML(row, projected, date, day) {
  const state = rowState(row.log);
  const label = state === "skipped" ? "Skipped" : state === "partial" ? "Partial" : "Logged";
  const markClass = state === "skipped" ? "dr-mark dr-mark-skip" : "dr-mark dr-mark-on";
  const mark = state === "skipped" ? "–" : "✓";
  const doseHTML = amountMarkup(loggedAmountText(row.log));
  const detail = rowDetailMarkup(projected, row, date, day);
  return `<li class="dr-row dr-row-done" data-item-id="${esc(row.item.id)}" data-state="${state}">
    <span class="${markClass}" aria-hidden="true">${mark}</span>
    <span class="dr-copy"><span class="dr-line"><span class="dr-name">${esc(row.item.name)}</span>${doseHTML}</span>${detail}<span class="dr-state">${label}</span></span>
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
    ? `<ul class="dr-rows"${editing ? ` data-routine-list="items" data-block-id="${esc(block.id)}"` : ""}>${shown.map((row) => editing ? editRowHTML(row) : openRowHTML(row, projected, date, day)).join("")}</ul>`
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

function emptyDiscoverHTML() {
  return `<section class="dr-empty">
    <h2>Add the first item</h2>
    <p>Discover will list entries from real studies. Nothing is added until you choose it.</p>
    <button type="button" class="btn primary block" data-action="routines-discover">Discover</button>
  </section>`;
}

function waitingHTML(date) {
  const sub = typeof app.fmtDate === "function"
    ? app.fmtDate(todayKey(date), { weekday: "long", month: "long", day: "numeric" })
    : todayKey(date);
  return `<div class="dr-page" data-routines-shell="syncing">
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

function paintShell(view, date) {
  const sub = typeof app.fmtDate === "function"
    ? app.fmtDate(todayKey(date), { weekday: "long", month: "long", day: "numeric" })
    : todayKey(date);
  const hasItems = (view.items || []).length > 0;
  const editing = layoutEditing();
  const announce = app.ui && app.ui.routineAnnounce ? app.ui.routineAnnounce : "";
  return `<div class="dr-page" data-routines-shell="signed-in" data-routines-edit="${editing ? "on" : "off"}">
    ${pageHeader("Routines", sub, headerTools())}
    <p class="dr-live" role="status" aria-live="polite">${esc(announce)}</p>
    ${routineNowHTML(view, date)}
    ${routineBlockTilesHTML(view, date)}
    <button type="button" class="dr-add dr-add-block" data-action="routines-add-block">Add routine</button>
    <button type="button" class="dr-calc-open" data-action="routines-calc">Reconstitution calculator</button>
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

export function routinesSettingsSheetHTML() {
  const prefs = app.state && app.state.dailyRoutines && app.state.dailyRoutines.prefs;
  const on = !!(prefs && prefs.focusMode === true);
  return `<h3>Routines settings</h3>
    <div class="dr-set-row">
      <span id="dr-set-focus">Focus mode</span>
      <button type="button" class="switch" role="switch" aria-checked="${on ? "true" : "false"}" aria-labelledby="dr-set-focus" data-action="routines-focus"><i></i></button>
    </div>
    <p class="sub">Focus mode dims every block except the current one. Reminders and the FAQ come later. Notifications stay off.</p>
    <button type="button" class="btn block" data-action="routines-calc">Reconstitution calculator</button>
    <p class="sub">The calculator shows the arithmetic of what you entered. It does not suggest an amount.</p>
    <button type="button" class="btn block" data-action="sheet-close">Done</button>`;
}

export function routinesDiscoverSheetHTML() {
  return `<h3>Discover</h3>
    <p class="sub">Study-backed entries are not in the app yet. This does not add an item, and it does not suggest a dose.</p>
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
app.toggleRoutineFocus = toggleRoutineFocus;
app.toggleRoutineReveal = toggleRoutineReveal;
app.addRoutineBlock = addRoutineBlock;
app.renameRoutineBlock = renameRoutineBlock;
app.setRoutineBlockColor = setRoutineBlockColor;
app.deleteRoutineBlock = deleteRoutineBlock;
app.restoreRoutineBlock = restoreRoutineBlock;
app.duplicateRoutineBlock = duplicateRoutineBlock;
app.reorderRoutineBlocks = reorderRoutineBlocks;
app.reorderRoutinePlacements = reorderRoutinePlacements;
app.renameRoutineItem = renameRoutineItem;
app.deleteRoutineItem = deleteRoutineItem;
app.restoreRoutineItem = restoreRoutineItem;
app.saveRoutineItem = saveRoutineItem;
app.addRoutineItem = addRoutineItem;
app.routineItemDraft = routineItemDraft;
app.parseRoutineAmount = parseRoutineAmount;
app.rememberRoutineBlock = rememberRoutineBlock;
app.toggleRoutineCollapsed = toggleRoutineCollapsed;
app.routineBlockRows = routineBlockRows;
app.dailyRoutinesHTML = dailyRoutinesHTML;
app.routineNowHTML = routineNowHTML;
app.routineBlockTileHTML = routineBlockTileHTML;
app.routineBlockTilesHTML = routineBlockTilesHTML;
app.routinesSettingsSheetHTML = routinesSettingsSheetHTML;
app.routinesDiscoverSheetHTML = routinesDiscoverSheetHTML;
