/* What a day of routines looks like: which items are due, what covers an
   item, the streak, the rest day. Counts only. Nothing here adds up amounts.
   Ported from the pure helpers in the web app's pages/daily-routines.js. */

import { routineBlockRunsOn } from "./dose";
import { isLive, isCustomRoutineType, routineItemTypeId } from "./shape";
import type { CompoundLike, ItemLike, LogLike, PlacementLike, PrefsLike, ViewLike } from "./shape";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const ROUTINE_DOSE_UNITS = Object.freeze(["mcg", "mg", "IU", "mL", "units"] as const);

function byId(a: { id?: string }, b: { id?: string }): number {
  const left = a.id || "";
  const right = b.id || "";
  return left < right ? -1 : left > right ? 1 : 0;
}

/* An item's type, when it is a built-in one or a custom one that still exists. */
export function routineItemType(item: ItemLike | null | undefined, prefs: PrefsLike | null | undefined): string {
  const type = item ? routineItemTypeId(item.type) : "";
  if (!type || !isCustomRoutineType(type)) return type;
  const custom = prefs && Array.isArray(prefs.customTypes) ? prefs.customTypes : [];
  return custom.some((row) => row && row.id === type) ? type : "";
}

export function loggedTodayCount(logs: unknown, day: unknown): number {
  if (!Array.isArray(logs) || typeof day !== "string") return 0;
  const seen = new Set<string>();
  for (const log of logs as LogLike[]) {
    if (!isLive(log) || log.day !== day || log.status === "skipped" || log.rest === true) continue;
    seen.add(log.itemId || log.id || "");
  }
  return seen.size;
}

/* Items due on a day: placed in a shown routine that runs that day, then
   typed items that sit in no shown routine, by name. */
export function placedItems(projected: ViewLike | null | undefined, day?: string): ItemLike[] {
  const shown = (projected && projected.blocks ? projected.blocks : []).filter((block) => isLive(block) && block.hidden !== true);
  const shownIds = new Set(shown.map((block) => block.id));
  const blocks = new Set(shown.filter((block) => !day || routineBlockRunsOn(block, day)).map((block) => block.id));
  const items = new Map((projected && projected.items ? projected.items : []).filter((item) => isLive(item)).map((item) => [item.id, item]));
  const seen = new Set<string | undefined>();
  const held = new Set<string | undefined>();
  const out: ItemLike[] = [];
  for (const place of projected && projected.placements ? projected.placements : []) {
    const item = items.get(place.itemId);
    if (!isLive(place) || !item) continue;
    if (shownIds.has(place.blockId)) held.add(place.itemId);
    if (!blocks.has(place.blockId) || seen.has(place.itemId)) continue;
    seen.add(place.itemId);
    out.push(item);
  }
  const prefs = projected && projected.prefs;
  const loose = [...items.values()]
    .filter((item) => !held.has(item.id) && routineItemType(item, prefs))
    .sort((a, b) => ((a.name || "") < (b.name || "") ? -1 : (a.name || "") > (b.name || "") ? 1 : byId(a, b)));
  return out.concat(loose);
}

export function coveringLog<T extends LogLike>(logs: readonly T[] | null | undefined, itemId: unknown, day: unknown): T | null {
  const rows = (Array.isArray(logs) ? (logs as T[]) : []).filter((log) => isLive(log) && log.itemId === itemId && log.day === day && log.rest !== true);
  rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || byId(a, b));
  return rows[0] || null;
}

/* Logged doses out of doses due today. A skip is due and not logged.
   The numbers are counts. They are never a sum of amounts. */
export function routineDoseProgress(projected: ViewLike | null | undefined, day: string): { logged: number; due: number } {
  const doses = placedItems(projected, day).filter((item) => item.kind === "dose");
  let logged = 0;
  for (const item of doses) {
    const log = coveringLog(projected && projected.logs, item.id, day);
    if (log && log.status !== "skipped") logged += 1;
  }
  return { logged, due: doses.length };
}

/* The day is done when every placed item is logged. A skip is handled and
   still not logged, so it does not finish the day. No items is not done. */
export function routineDayComplete(projected: ViewLike | null | undefined, day: unknown): boolean {
  if (typeof day !== "string") return false;
  const items = placedItems(projected, day);
  if (!items.length) return false;
  return items.every((item) => {
    const log = coveringLog(projected && projected.logs, item.id, day);
    return !!(log && log.status !== "skipped");
  });
}

export function shiftRoutineDay(day: unknown, delta: unknown): string {
  if (typeof day !== "string" || !DAY.test(day) || typeof delta !== "number" || !Number.isFinite(delta)) return "";
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  const date = Number(day.slice(8, 10));
  const utc = new Date(Date.UTC(year, month - 1, date + delta));
  return utc.toISOString().slice(0, 10);
}

function countedLog(log: LogLike): boolean {
  if (!isLive(log) || log.rest === true || typeof log.day !== "string" || !DAY.test(log.day)) return false;
  return log.status === "done" || log.status === "partial" || log.status === "skipped";
}

/* The live rest for that day, if one exists. One rest covers the whole day.
   A newer stamp wins. The same stamp keeps the smaller id. */
export function routineRestLog<T extends LogLike>(logs: readonly T[] | null | undefined, day: unknown): T | null {
  if (typeof day !== "string" || !DAY.test(day)) return null;
  let best: T | null = null;
  for (const log of Array.isArray(logs) ? (logs as T[]) : []) {
    if (!isLive(log) || log.rest !== true || log.day !== day) continue;
    if (!best) {
      best = log;
      continue;
    }
    const at = log.updatedAt || 0;
    const prev = best.updatedAt || 0;
    if (at > prev || (at === prev && (log.id || "") < (best.id || ""))) best = log;
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
export function routineStreak(logs: unknown, day: unknown): number {
  if (typeof day !== "string" || !DAY.test(day)) return 0;
  const paused = new Set<string>();
  const counted = new Set<string>();
  for (const log of (Array.isArray(logs) ? logs : []) as LogLike[]) {
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

export function formatRoutineAmount(amount: unknown): string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "";
  return String(Math.round(amount * 1000) / 1000);
}

export function compoundFor<T extends CompoundLike>(projected: { compounds?: readonly T[] } | null | undefined, item: ItemLike | null | undefined): T | null {
  if (!item || !item.compoundId || !projected) return null;
  return (projected.compounds || []).find((row) => row.id === item.compoundId) || null;
}

/* A check item records no amount, even if it used to be a dose. The old log
   stays as it was. A new log or a restore uses the item as it is now. The
   amount is the one the user saved on the item. Nothing here works one out. */
export function loggedDose(view: ViewLike, item: ItemLike | null | undefined): { compoundId: string | null; amount: number | null; unit: string } {
  if (!item || item.kind !== "dose") return { compoundId: null, amount: null, unit: "" };
  const compound = compoundFor(view, item);
  return {
    compoundId: item.compoundId || null,
    amount: compound && typeof compound.amount === "number" ? compound.amount : null,
    unit: compound && compound.unit ? compound.unit : "",
  };
}

export interface RoutineRow<I extends ItemLike = ItemLike, P extends PlacementLike = PlacementLike, C extends CompoundLike = CompoundLike, L extends LogLike = LogLike> {
  placement: P; item: I; compound: C | null; log: L | null; open: boolean;
}

/* The rows of one routine in their saved order, each with the log that covers it that day. */
export function routineBlockRows(projected: ViewLike | null | undefined, blockId: string, day: string): RoutineRow[] {
  const view = projected || {};
  const items = new Map((view.items || []).map((item) => [item.id, item]));
  return (view.placements || [])
    .filter((row) => row.blockId === blockId && items.has(row.itemId))
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0) || byId(a, b))
    .map((placement) => {
      const item = items.get(placement.itemId) as ItemLike;
      const log = coveringLog(view.logs, item.id, day);
      return { placement, item, compound: compoundFor(view, item), log, open: !log };
    });
}

/* Completed and history rows show the amount stored on the log.
   The compound amount can change later and must not rewrite that text. */
export function loggedAmountText(log: LogLike | null | undefined): string {
  if (!log || log.rest === true || log.status === "skipped") return "";
  if (typeof log.amount !== "number" || !Number.isFinite(log.amount)) return "";
  const amount = formatRoutineAmount(log.amount);
  if (amount === "") return "";
  const unit = typeof log.unit === "string" ? log.unit : "";
  return unit ? `${amount} ${unit}` : amount;
}

/* 1/4, ¼, and 0.25 all become the number 0.25. A blank or a negative is refused. */
export function parseRoutineAmount(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) && raw >= 0 ? raw : null;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(trimmed)) return null;
  const text = trimmed.replace(",", ".");
  const glyphs: Record<string, number> = { "¼": 0.25, "½": 0.5, "¾": 0.75, "1¼": 1.25, "1½": 1.5, "1¾": 1.75 };
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
