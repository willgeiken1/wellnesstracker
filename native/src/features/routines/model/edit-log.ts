/* Editing one log after it was made: its amount, its day, the time on an
   earlier day, a note and an optional injection site.

   The amount is the one the user types. The unit is the one already on the
   log. Nothing here works out or proposes an amount, and the item's saved
   amount is never changed from here.

   Ported from the web app's pages/daily-routines.js (editRoutineLog) and
   pages/daily-routines-details.js. */

import { parseRoutineAmount, ROUTINE_DOSE_UNITS, shiftRoutineDay } from "./day";
import { routineDayRolloverHour } from "./dose";
import { routineLogId } from "./ids";
import { routineClockTime } from "./now";
import {
  clipText, isLive, LOG_NOTE_MAX, projectRoutineStore, routineSiteId, validDay,
  type CompoundLike, type LogLike, type RoutineLog, type RoutineStore,
} from "./shape";
import { clean, logStamp, parseRoutineTime, put, rowStampOf, stampAfter, start, type RoutineClock } from "./write";

const DOSE_UNIT_SET = new Set<string>(ROUTINE_DOSE_UNITS);
const MONTHS = Object.freeze(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);

/* What the sheets say. Copied from the web app word for word. */
export const LOG_EDIT_REFUSED = "Enter an amount and a day up to today. A day that already has a log stays as it is.";
export const LOG_DETAILS_REFUSED = "Enter an amount and a day up to today. A day that already has a log stays as it is. On an earlier day, leave the time blank or use hours and minutes.";
export const SAME_SITE_WARNING = "Same site as last time.";
export const SAME_SITE_HINT = "You can dismiss this and still save.";
export const SITE_OPTIONAL_HINT = "A site is optional. Saving does not require one.";
export const LOG_UNIT_HINT = "This is the unit already on the log.";
export const LOGGED_AMOUNTS_HINT = "Logged amounts. Changing the item amount does not change them.";
export const LOG_TIME_HINT = "Shown when the day is before today. Leave it blank to keep the logged time.";

function amountsEqual(left: unknown, right: unknown): boolean {
  if (typeof left !== "number" || typeof right !== "number" || !Number.isFinite(left) || !Number.isFinite(right)) return false;
  return Math.round(left * 1000) === Math.round(right * 1000);
}

function massMcg(amount: number, unit: string): number | null {
  if (unit === "mcg") return amount;
  if (unit === "mg") return amount * 1000;
  return null;
}

/* 500 mcg is not 500 mg. The typed amount matches the amount saved on the
   item only when the units match, or when both are a mass that converts as
   1 mg = 1000 mcg. The log keeps the unit it was saved with. */
function sameSavedAmount(amount: number, unit: string, compound: CompoundLike | null): boolean {
  if (!compound || typeof compound.amount !== "number" || !Number.isFinite(compound.amount)) return false;
  const savedUnit = typeof compound.unit === "string" ? compound.unit : "";
  if (unit === savedUnit) return amountsEqual(amount, compound.amount);
  const logged = massMcg(amount, unit);
  const saved = massMcg(compound.amount, savedUnit);
  if (logged == null || saved == null) return false;
  return amountsEqual(logged, saved);
}

function statusForEditedAmount(log: RoutineLog, compound: CompoundLike | null, amount: number, unit: string): string {
  if (sameSavedAmount(amount, unit, compound)) return "done";
  if (amountsEqual(amount, log.amount) && (log.status === "done" || log.status === "partial")) return log.status;
  return "partial";
}

function unitForEditedLog(log: LogLike, compound: CompoundLike | null): string {
  if (log.unit && DOSE_UNIT_SET.has(log.unit)) return log.unit;
  if (compound && compound.unit && DOSE_UNIT_SET.has(compound.unit)) return compound.unit;
  return "";
}

/* A saved dose log keeps its amount or unit. The item's current kind is
   not that record: switching the item to a check must not wipe the log,
   and switching a check to a dose must not demand an amount for an old check. */
function logHasSavedDose(log: LogLike | null | undefined): boolean {
  if (!log || log.rest === true) return false;
  if (typeof log.amount === "number" && Number.isFinite(log.amount)) return true;
  return typeof log.unit === "string" && DOSE_UNIT_SET.has(log.unit);
}

/* A local clock time on a local calendar day. Null when that time does not
   exist that day, as in the hour a daylight-saving change skips. */
function stampOnDay(day: string, hour: number, minute: number): number | null {
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

export interface LogEdit { amount?: unknown; day?: unknown; time?: unknown; note?: unknown; site?: unknown }

/* A clock time on a routine day. The routine day rolls at the rollover
   hour, so a time before that hour sits on the next calendar morning:
   with a 04:00 rollover, 02:30 on routine day Nov 20 is Nov 21 02:30. */
function stampOnRoutineDay(day: string, hour: number, minute: number, rollover: unknown): number | null {
  const calendar = hour < routineDayRolloverHour(rollover) ? shiftRoutineDay(day, 1) : day;
  return calendar ? stampOnDay(calendar, hour, minute) : null;
}

/* A time is typed only when the chosen day is before today. A same-day
   edit never moves the logged clock. The sheet sends the logged clock back
   with every save, so a day and a time that both still read as the log
   does keep the moment it was logged, to the second. A new time is placed
   on that routine day. A log moved to another day with no time given keeps
   its clock time and takes it to the new routine day, so the moment and
   the day never disagree; moved to today, it is never later than now. */
function editedAt(log: RoutineLog, day: string, today: string, draft: LogEdit, rollover: unknown, now: number): { ok: boolean; at: number } {
  const current = typeof log.at === "number" && Number.isFinite(log.at) ? log.at : 0;
  if (day < today && draft.time != null) {
    if (typeof draft.time !== "string") return { ok: false, at: current };
    const text = draft.time.trim();
    if (text) {
      const parsed = parseRoutineTime(text);
      if (!parsed) return { ok: false, at: current };
      const typed = `${String(parsed.hour).padStart(2, "0")}:${String(parsed.minute).padStart(2, "0")}`;
      if (day === log.day && current > 0 && typed === routineClockTime(current)) return { ok: true, at: current };
      const stamped = stampOnRoutineDay(day, parsed.hour, parsed.minute, rollover);
      if (stamped == null) return { ok: false, at: current };
      return { ok: true, at: stamped };
    }
  }
  if (day === log.day || current <= 0) return { ok: true, at: current };
  const was = new Date(current);
  const stamped = stampOnRoutineDay(day, was.getHours(), was.getMinutes(), rollover);
  if (stamped == null) return { ok: false, at: current };
  const exact = stamped + was.getSeconds() * 1000 + was.getMilliseconds();
  return { ok: true, at: day < today ? exact : Math.min(exact, now) };
}

const has = (draft: LogEdit, key: keyof LogEdit) => Object.prototype.hasOwnProperty.call(draft, key);

/* Changes the amount and the day on one log. The day is the string the
   user picked. It is not today's key and not the UTC day of the clock.
   A log moved to another day takes that day's row id, and the old row is
   removed, so one row still stands for one item and day. A day that
   already has a log for the item is refused. A time is applied only when
   that day is before today, and it is a time on that routine day: before
   the rollover hour it lands on the next calendar morning. A moved log
   with no time given keeps its clock time on the new routine day. A note is stored only when the draft includes
   one. A site is stored only when the draft includes one: a blank site
   removes it, a missing site key leaves the old site, an unknown site is
   refused, and a check cannot store a site. The item and its saved amount
   are left alone, so later edits to the item do not rewrite this log. */
export function editLog(input: unknown, logId: unknown, draft: LogEdit | null | undefined, clock: RoutineClock): { store: RoutineStore; logId: string } | null {
  if (typeof logId !== "string" || !logId || !draft || typeof draft !== "object") return null;
  const store = start(input, clock);
  const view = store && projectRoutineStore(store);
  const log = store && store.logs.find((row) => row.id === logId);
  if (!store || !view || !log || !isLive(log) || log.rest === true) return null;
  const day = typeof draft.day === "string" ? draft.day : "";
  if (!validDay(day) || day > clock.day) return null;
  const moved = day !== log.day && !!log.itemId;
  const nextId = moved ? routineLogId(log.itemId, day) : logId;
  if (moved && store.logs.some((row) => isLive(row) && row.id !== logId && row.itemId === log.itemId && row.day === day && row.rest !== true)) return null;
  if (nextId !== logId && store.logs.some((row) => isLive(row) && row.id === nextId)) return null;
  const compound = view.compounds.find((row) => row.id === log.compoundId) || null;
  const skipped = log.status === "skipped";
  const dose = logHasSavedDose(log) && !skipped;
  const time = editedAt(log, day, clock.day, draft, store.settings.dayRolloverHour, clock.now);
  if (!time.ok) return null;
  let next: RoutineLog;
  if (dose) {
    const amount = parseRoutineAmount(has(draft, "amount") ? draft.amount : log.amount);
    const unit = unitForEditedLog(log, compound);
    if (amount == null || amount <= 0 || !unit) return null;
    next = { ...log, id: nextId, day, amount, unit, status: statusForEditedAmount(log, compound, amount, unit), at: time.at, deletedAt: null };
  } else {
    next = { ...log, id: nextId, day, amount: null, unit: "", status: skipped ? "skipped" : log.status || "done", at: time.at, deletedAt: null };
  }
  delete next.undone;
  if (has(draft, "note")) {
    if (draft.note != null && typeof draft.note !== "string") return null;
    const note = clipText(typeof draft.note === "string" ? draft.note : "", LOG_NOTE_MAX);
    if (note) next.note = note;
    else delete next.note;
  }
  if (has(draft, "site")) {
    if (!dose) {
      if (draft.site != null && draft.site !== "") return null;
      delete next.site;
    } else {
      if (draft.site != null && typeof draft.site !== "string") return null;
      const raw = typeof draft.site === "string" ? draft.site.trim() : "";
      const site = routineSiteId(raw);
      if (raw && !site) return null;
      if (site) next.site = site;
      else delete next.site;
    }
  }
  const at = logStamp(store, clock, nextId);
  let out = put(store, "logs", next, at);
  if (nextId !== logId) {
    const gone = stampAfter(at, rowStampOf(log));
    out = { ...out, logs: out.logs.map((row) => (row.id === logId ? { ...row, updatedAt: gone, deletedAt: gone, undone: false } : row)) };
  }
  const saved = clean(out);
  return saved ? { store: saved, logId: nextId } : null;
}

/* Every log that names this compound, newest day first. Each row shows the
   amount stored on it, so changing the item later does not change the list. */
export function compoundDoseHistory(store: unknown, compoundId: unknown): RoutineLog[] {
  const view = projectRoutineStore(store);
  if (!view || typeof compoundId !== "string" || !compoundId) return [];
  return view.logs
    .filter((log) => log.compoundId === compoundId && log.rest !== true)
    .slice()
    .sort((a, b) => {
      if (a.day !== b.day) return a.day < b.day ? 1 : -1;
      const at = (b.at || 0) - (a.at || 0);
      if (at) return at;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

/* Today's taken log for an item, if there is one. */
export function latestLogId(store: unknown, itemId: unknown, day: unknown): string {
  const view = projectRoutineStore(store);
  if (!view || typeof itemId !== "string" || !itemId || typeof day !== "string") return "";
  const logs = view.logs.filter((log) => log.itemId === itemId && log.day === day && log.rest !== true && (log.status === "done" || log.status === "partial"));
  logs.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  return logs[0] ? logs[0].id : "";
}

export interface LogDraft {
  logId: string; itemId: string | null; itemName: string; compoundId: string | null; amount: string; unit: string; kind: "dose" | "check"; skipped: boolean;
  day: string; maxDay: string; time: string; note: string; site: string; error: string;
}

/* What the edit sheet opens with: the log as it was saved. today is the
   latest day the log can be moved to. */
export function logDraft(input: unknown, logId: unknown, today: string): LogDraft | null {
  const view = projectRoutineStore(input);
  if (!view || typeof logId !== "string" || !logId) return null;
  const log = view.logs.find((row) => row.id === logId && row.rest !== true);
  if (!log) return null;
  const item = view.items.find((row) => row.id === log.itemId) || null;
  const compound = view.compounds.find((row) => row.id === log.compoundId) || null;
  return {
    logId: log.id,
    itemId: log.itemId,
    itemName: item ? item.name : compound && compound.name ? compound.name : "Item",
    compoundId: log.compoundId || null,
    amount: typeof log.amount === "number" ? String(log.amount) : "",
    unit: unitForEditedLog(log, compound),
    kind: logHasSavedDose(log) ? "dose" : "check",
    skipped: log.status === "skipped",
    day: log.day,
    maxDay: today,
    time: routineClockTime(log.at),
    note: typeof log.note === "string" ? log.note : "",
    site: routineSiteId(log.site),
    error: "",
  };
}

/* The time field shows only for a day before today. */
export function logTimeEditable(day: unknown, maxDay: unknown): boolean {
  return typeof day === "string" && typeof maxDay === "string" && day < maxDay;
}

/* The picked site is the one the last log used, and the warning for that
   site has not been dismissed. The warning never blocks a save for good:
   dismissing it lets the same save go through. */
export function sameSiteWarning(draft: { site?: unknown; lastSite?: unknown; siteDismissed?: unknown } | null | undefined): boolean {
  return !!(draft && draft.site && draft.lastSite && draft.site === draft.lastSite && draft.siteDismissed !== draft.site);
}

/* "Nov 19, 2026" on a dose history row. */
export function formatHistoryDay(day: unknown): string {
  if (typeof day !== "string" || day.length < 10) return "";
  const month = Number(day.slice(5, 7));
  const date = Number(day.slice(8, 10));
  if (month < 1 || month > 12 || !date) return day;
  return `${MONTHS[month - 1]} ${date}, ${day.slice(0, 4)}`;
}

export function historyStatus(log: LogLike | null | undefined): string {
  if (!log) return "";
  if (log.status === "skipped") return "Skipped";
  if (log.status === "partial") return "Partial";
  return "Logged";
}
