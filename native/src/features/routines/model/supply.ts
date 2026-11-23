/* Optional supply on a routine item. The count is what the user typed.
   Days left is that count times the average gap between days they logged
   a done or partial dose. A skip, a rest, and a tombstone do not count.
   One logged day, or none, uses a one-day gap, which is today's daily
   schedule. The estimate does not add up amounts and does not change the
   count when a dose is logged. A heads-up shows when the estimate is
   LOW_SUPPLY_DAYS or fewer. Mixed-on is a date the user typed for a dose.
   Nothing here links out or names a seller.
   Ported from the web app's shared/routine-supply.js. */

import type { ItemLike, LogLike } from "./shape";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const COUNT_TEXT = /^\d{1,4}$/;

export const SUPPLY_COUNT_MAX = 9999;
export const LOW_SUPPLY_DAYS = 7;

export function parseSupplyDay(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const day = value.trim();
  if (!DAY.test(day)) return null;
  const time = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== day) return null;
  return day;
}

export function parseSupplyCount(value: unknown): number | null {
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
export function readSupplyCount(value: unknown): { ok: boolean; count: number | null } {
  if (value == null) return { ok: true, count: null };
  if (typeof value === "string" && value.trim() === "") return { ok: true, count: null };
  const count = parseSupplyCount(value);
  if (count == null) return { ok: false, count: null };
  return { ok: true, count };
}

/* A blank field clears the date. A day after today is refused. */
export function readSupplyDay(value: unknown, today: unknown): { ok: boolean; day: string | null } {
  if (value == null) return { ok: true, day: null };
  if (typeof value === "string" && value.trim() === "") return { ok: true, day: null };
  const day = parseSupplyDay(value);
  const max = parseSupplyDay(today);
  if (!day || !max || day > max) return { ok: false, day: null };
  return { ok: true, day };
}

export interface SupplyDraft { kind?: unknown; onHand?: unknown; mixedOn?: unknown }

export function supplyDraftError(draft: SupplyDraft | null | undefined, today: unknown): string {
  if (!draft || typeof draft !== "object") return "";
  if (Object.prototype.hasOwnProperty.call(draft, "onHand") && !readSupplyCount(draft.onHand).ok) {
    return "On hand is a whole number, or leave it blank.";
  }
  if (draft.kind === "dose" && Object.prototype.hasOwnProperty.call(draft, "mixedOn") && !readSupplyDay(draft.mixedOn, today).ok) {
    return "Mixed on is a day up to today, or leave it blank.";
  }
  return "";
}

export interface SupplyPatch { onHand?: number | null; onHandDay?: string | null; mixedOn?: string | null }

/* Keys the draft omits stay as they are. A check item cannot keep a mix date. */
export function supplyFromDraft(draft: SupplyDraft | null | undefined, kind: unknown, today: string, existing?: ItemLike | null): SupplyPatch | null {
  const patch: SupplyPatch = {};
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

/* The supply fields an item may keep. A count needs to be a count, the day it
   was typed only stands beside a count, and only a dose keeps a mix date.
   The web app also drops seller and price keys here; a row has no column
   that could hold one. */
export function attachSupply<T extends ItemLike>(item: T): T {
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
  return item;
}

function dayIndex(day: string): number {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  const date = Number(day.slice(8, 10));
  return Math.round(Date.UTC(year, month - 1, date) / 86400000);
}

function liveDose(log: LogLike | null | undefined, itemId: string): boolean {
  if (!log || log.rest === true) return false;
  if (typeof log.deletedAt === "number" && log.deletedAt > 0) return false;
  if (log.itemId !== itemId) return false;
  if (log.status !== "done" && log.status !== "partial") return false;
  return parseSupplyDay(log.day) != null;
}

/* Distinct calendar days, oldest first. Two logs on one day are one day. */
function doseDays(logs: unknown, itemId: unknown): string[] {
  if (typeof itemId !== "string" || !itemId) return [];
  const days = new Set<string>();
  for (const log of (Array.isArray(logs) ? logs : []) as LogLike[]) {
    if (liveDose(log, itemId)) days.add(log.day as string);
  }
  return [...days].sort();
}

function doseSpan(logs: unknown, itemId: unknown): { span: number; gaps: number } | null {
  const days = doseDays(logs, itemId);
  if (days.length < 2) return null;
  const span = dayIndex(days[days.length - 1]) - dayIndex(days[0]);
  const gaps = days.length - 1;
  if (span < gaps) return null;
  return { span, gaps };
}

/* Null when supply is off. Otherwise the count times the average gap,
   rounded to the nearest day. Half a day rounds away from zero. */
export function routineDaysLeft(onHand: unknown, logs: unknown, itemId: unknown, today?: unknown, onHandDay?: unknown): number | null {
  const count = parseSupplyCount(onHand);
  if (count == null) return null;
  const span = doseSpan(logs, itemId);
  const base = span ? Math.round((count * span.span) / span.gaps) : count;
  const started = parseSupplyDay(onHandDay);
  const now = parseSupplyDay(today);
  if (!started || !now || now <= started) return base;
  return Math.max(0, base - (dayIndex(now) - dayIndex(started)));
}

export function mixedAgoLabel(mixedOn: unknown, today: unknown): string {
  const day = parseSupplyDay(mixedOn);
  const now = parseSupplyDay(today);
  if (!day || !now || day > now) return "";
  const delta = dayIndex(now) - dayIndex(day);
  if (delta === 0) return "Mixed today";
  if (delta === 1) return "Mixed 1 day ago";
  return `Mixed ${delta} days ago`;
}

function handLabel(count: number): string {
  return count === 1 ? "1 on hand" : `${count} on hand`;
}

function leftLabel(days: number | null): string {
  return days === 1 ? "1 day left" : `${days} days left`;
}

export function routineSupplyView(spec: { item?: ItemLike | null; logs?: unknown; today?: unknown } | null | undefined): { text: string; state: "" | "low" | "set" | "mixed" } {
  const item = spec && spec.item;
  const logs = spec && spec.logs;
  const today = spec && spec.today;
  if (!item) return { text: "", state: "" };
  const parts: string[] = [];
  let state: "" | "low" | "set" | "mixed" = "";
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
