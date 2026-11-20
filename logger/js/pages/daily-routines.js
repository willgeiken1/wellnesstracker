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
import { nextDoseCountdown } from "../shared/routine-dose.js";

/* Routines tab. The flag stays off in source. This module paints only when
   app.ROUTINES_ENABLED is true. A signed-out session gets a sign-in prompt
   and no dailyRoutines write.

   Check-off writes one log per item and day (routineLogId). A day change
   writes the destination id (checkOffId) and tombstones the old id, so a
   fresh check-off on the old day is a different row. Undo keeps the amount,
   unit, and note and marks that log undone, on every live log for that item
   (or rest) and day. Restore writes those fields back.

   The day key is app.today(). The clock face is app.routineNow(). Do not
   derive the day from the clock's UTC instant. */

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

function logTouchesDay(log) {
  if (!isLive(log) || typeof log.day !== "string" || !DAY.test(log.day)) return false;
  if (log.rest === true) return true;
  return log.status === "done" || log.status === "partial" || log.status === "skipped";
}

/* Consecutive days touched by a done, partial, skip, or rest log.
   Today counts only once something is logged. A day with no log, after
   the first touched day, is a full miss and stops the run. A skip touches
   the day, so it does not stop the run. */
export function routineStreak(logs, day) {
  if (typeof day !== "string" || !DAY.test(day)) return 0;
  const touched = new Set();
  for (const log of Array.isArray(logs) ? logs : []) {
    if (logTouchesDay(log)) touched.add(log.day);
  }
  let earliest = "";
  for (const key of touched) if (!earliest || key < earliest) earliest = key;
  if (!earliest) return 0;
  let streak = touched.has(day) ? 1 : 0;
  let cursor = shiftRoutineDay(day, -1);
  let guard = 0;
  while (cursor && cursor >= earliest && guard < 4000) {
    if (!touched.has(cursor)) break;
    streak += 1;
    cursor = shiftRoutineDay(cursor, -1);
    guard += 1;
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
    if (nextId !== log.id) next = tombstoneLog(next, log.id, stampAfter(at, log.updatedAt));
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

export function logRoutineRest(state) {
  return withStore(state, (store, clock) => {
    if (!DAY.test(clock.day)) return null;
    const view = projectDailyRoutines(store);
    if ((view.logs || []).some((log) => log.rest === true && log.day === clock.day)) return null;
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

export function toggleRoutineFocus(state) {
  return withStore(state, (store, clock) => {
    const at = prefStamp(store, clock);
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

/* A reorder records orderAt and does not move updatedAt. A tombstone from
   the other phone still beats the reorder. Rows whose order did not change
   are left alone. */
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
      compoundId: kind === "dose" ? compoundId : null,
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
    const current = collapsedIds(store.prefs);
    const collapsedBlocks = current.includes(blockId) ? current.filter((id) => id !== blockId) : current.concat(blockId);
    const at = stampAfter(clock.now, store.prefs && store.prefs.updatedAt);
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
    return `<div class="dr-rest"><button type="button" class="dr-rest-btn" data-action="routines-rest">Log rest</button></div>`;
  }
  return `<div class="dr-rest"><span>Rest logged</span><button type="button" class="dr-undo" data-action="routines-undo" data-log-id="${esc(log.id)}">Undo <span class="dr-vh">rest</span></button></div>`;
}

function nowFooter(projected, date) {
  const day = todayKey(date);
  const count = loggedTodayCount(projected.logs, day);
  const streak = routineStreak(projected.logs, day);
  const focusOn = !!(projected.prefs && projected.prefs.focusMode === true);
  const rest = (projected.logs || []).find((log) => log.rest === true && log.day === day) || null;
  return `<div class="dr-pills">
      <p class="dr-count" data-logged="${count}"><b>${count}</b> logged today</p>
      ${streakHTML(streak)}
    </div>
    ${focusSwitch(focusOn)}
    ${restHTML(rest)}`;
}

export function routineNowHTML(projected, date) {
  const moment = routineNowNext(projected.blocks, date);
  const clock = formatRoutineClock(date);
  const slot = SLOT_LABEL[moment.slot] || "Today";
  const day = todayKey(date);
  const footer = nowFooter(projected, date);
  if (!moment.nowBlock) {
    return `<section class="dr-now" data-color="lavender" aria-labelledby="dr-now-title">
      <p class="dr-k">Now · ${esc(clock)}</p>
      <h2 class="dr-now-title" id="dr-now-title">Nothing scheduled</h2>
      <p class="dr-next">${esc(slot)}. Add a routine to see what comes next.</p>
      ${footer}
    </section>`;
  }
  const wait = formatRoutineWait(moment.waitMin);
  const next = moment.nextBlock
    ? `Next · ${esc(moment.nextBlock.name)}${wait ? `<span class="dr-wait">${esc(wait)}</span>` : ""}`
    : "Nothing else today";
  const rows = routineBlockRows(projected, moment.nowBlock.id, day);
  const open = rows.filter((row) => row.open).length;
  const logged = rows.filter((row) => !row.open && rowState(row.log) !== "skipped").length;
  const skipped = rows.filter((row) => !row.open && rowState(row.log) === "skipped").length;
  const statusText = rows.length && !open ? tileMeta(open, logged, skipped) : "";
  const status = statusText ? `<p class="dr-status">${esc(statusText)}</p>` : "";
  const color = tileColor(moment.nowBlock.color);
  return `<section class="dr-now" data-color="${color}" aria-labelledby="dr-now-title">
    <p class="dr-k">Now · ${esc(slot)} · ${esc(clock)}</p>
    <h2 class="dr-now-title" id="dr-now-title">${esc(moment.nowBlock.name)}</h2>
    <p class="dr-next">${next}</p>
    ${status}
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
  const next = countdownMarkup(projected, row, date, day);
  return `<li class="dr-row" ${rowAttrs(row)} data-details="row" data-state="open">
    <button type="button" class="dr-log" data-action="routines-log" data-item-id="${esc(row.item.id)}">
      <span class="dr-mark" aria-hidden="true"></span>
      <span class="dr-copy"><span class="dr-vh">Log </span><span class="dr-name" data-rename="item" data-item-id="${esc(row.item.id)}">${esc(row.item.name)}</span>${doseHTML}${next}</span>
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
      <span class="dr-name" data-rename="item" data-item-id="${esc(row.item.id)}">${esc(row.item.name)}</span>${doseHTML}
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
  const next = countdownMarkup(projected, row, date, day);
  return `<li class="dr-row dr-row-done" data-details="row" data-item-id="${esc(row.item.id)}" data-log-id="${esc(row.log.id)}" data-state="${state}">
    <span class="${markClass}" aria-hidden="true">${mark}</span>
    <span class="dr-copy"><span class="dr-name">${esc(row.item.name)}</span>${doseHTML}${next}<span class="dr-state">${label}</span></span>
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
  const collapsed = new Set(collapsedIds(projected.prefs));
  const lastId = projected.prefs && typeof projected.prefs.lastBlockId === "string" ? projected.prefs.lastBlockId : "";
  const currentId = moment.nowBlock ? moment.nowBlock.id : "";
  const tiles = (projected.blocks || []).map((block) => routineBlockTileHTML(block, projected, {
    day,
    date: clock,
    current: block.id === currentId,
    focus,
    revealed: revealed.has(block.id),
    collapsed: collapsed.has(block.id),
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
app.routineStreak = routineStreak;
app.shiftRoutineDay = shiftRoutineDay;
app.logRoutineItem = logRoutineItem;
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
app.routinesDiscoverSheetHTML = routinesDiscoverSheetHTML;
