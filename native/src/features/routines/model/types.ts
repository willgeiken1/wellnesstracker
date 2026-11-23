/* Item types and their tabs inside Routines.

   Every item can carry one type: supplement, medication, peptide, enhancer,
   other, or a type the user made (prefs.customTypes). A type's tab shows
   once an item has that type, or once setup or settings turned it on
   (prefs.typeTabs). Routines itself only lists real routines.

   Ported from the web app's shared/routine-types.js. The web also moves
   items out of old blocks that held supplements, enhancers and medications.
   The phone never had those blocks, so that step is not here. */

import { routineItemType } from "./day";
import { routineBlockDays, routineBlockStartMin, routineBlockWindow, routineMinuteOfDay, routineWeekday } from "./dose";
import { customTypeId, isRoutineRowId } from "./ids";
import {
  isCustomRoutineType, isLive, liveOf, normalizeRoutineStore, ROUTINE_ITEM_TYPES,
  type BlockLike, type ItemLike, type LogLike, type PrefsLike, type RoutineCustomType, type RoutineStore, type ViewLike,
} from "./shape";
import { clean, prefStamp, start, type RoutineClock } from "./write";

export { routineItemType } from "./day";

export const ROUTINE_TYPE_ORDER = Object.freeze(["supplement", "peptide", "medication", "enhancer", "other"] as const);

const NAMES: Readonly<Record<string, { one: string; many: string }>> = Object.freeze({
  supplement: Object.freeze({ one: "Supplement", many: "Supplements" }),
  medication: Object.freeze({ one: "Medication", many: "Medications" }),
  peptide: Object.freeze({ one: "Peptide", many: "Peptides" }),
  enhancer: Object.freeze({ one: "Enhancer", many: "Enhancers" }),
  other: Object.freeze({ one: "Other", many: "Other" }),
});

export const CUSTOM_TYPE_MAX = 12;

/* The types the user made, oldest first. Bad rows and repeats drop out.
   The limit is on making a type, so a list that is already longer keeps
   every tab it has. */
export function routineCustomTypes(prefs: PrefsLike | null | undefined): RoutineCustomType[] {
  const raw: unknown[] = prefs && Array.isArray(prefs.customTypes) ? prefs.customTypes : [];
  const seen = new Set<string>();
  const out: RoutineCustomType[] = [];
  for (const entry of raw) {
    const row = entry && typeof entry === "object" ? (entry as Partial<RoutineCustomType>) : null;
    if (!row || !isCustomRoutineType(row.id) || seen.has(row.id)) continue;
    const name = typeof row.name === "string" ? row.name.trim().slice(0, 40) : "";
    if (!name) continue;
    seen.add(row.id);
    out.push({ id: row.id, name });
  }
  return out;
}

export function routineTypeName(type: unknown, prefs: PrefsLike | null | undefined, many = true): string {
  if (typeof type === "string" && Object.prototype.hasOwnProperty.call(NAMES, type)) return many ? NAMES[type].many : NAMES[type].one;
  const custom = routineCustomTypes(prefs).find((row) => row.id === type);
  return custom ? custom.name : "";
}

export interface RoutineTypeChoice { id: string; name: string; custom: boolean }

/* Every type an item can take here, built in first. */
export function routineTypeChoices(prefs: PrefsLike | null | undefined): RoutineTypeChoice[] {
  return [
    ...ROUTINE_ITEM_TYPES.map((id) => ({ id: id as string, name: routineTypeName(id, prefs, false), custom: false })),
    ...routineCustomTypes(prefs).map((row) => ({ id: row.id, name: row.name, custom: true })),
  ];
}

/* The tabs Routines shows, in a fixed order. Empty means no tab row. */
export function routineTypeTabs(projected: ViewLike | null | undefined): string[] {
  const prefs = projected && projected.prefs;
  const on = new Set<string>(prefs && Array.isArray(prefs.typeTabs) ? prefs.typeTabs.filter((id) => typeof id === "string") : []);
  for (const item of liveOf(projected && projected.items)) {
    const type = routineItemType(item, prefs);
    if (type) on.add(type);
  }
  const order = [...ROUTINE_TYPE_ORDER, ...routineCustomTypes(prefs).map((row) => row.id)];
  return order.filter((id) => on.has(id));
}

/* The items on one type's tab, by the time they are taken, then by name. */
export function routineTypedItems<I extends ItemLike>(projected: (ViewLike & { items?: readonly I[] }) | null | undefined, type: string): I[] {
  const prefs = projected && projected.prefs;
  const name = (item: ItemLike) => item.name || "";
  return liveOf<I>(projected && projected.items)
    .filter((item) => routineItemType(item, prefs) === type)
    .sort((a, b) => (routineItemTimeMin(projected, a) ?? 9999) - (routineItemTimeMin(projected, b) ?? 9999) || (name(a) < name(b) ? -1 : name(a) > name(b) ? 1 : 0));
}

/* The routines an item sits in, in page order. Hidden routines are left out. */
export function routineItemBlocks<B extends BlockLike>(projected: (ViewLike & { blocks?: readonly B[] }) | null | undefined, item: ItemLike | null | undefined): B[] {
  if (!projected || !item) return [];
  const ids = new Set(liveOf(projected.placements).filter((place) => place.itemId === item.id).map((place) => place.blockId));
  return ((projected.blocks || []) as readonly B[]).filter((block) => isLive(block) && block.hidden !== true && ids.has(block.id));
}

/* When the item is taken: its own time, or the start of its first routine. */
export function routineItemTimeMin(projected: ViewLike | null | undefined, item: ItemLike | null | undefined): number | null {
  const own = item ? routineMinuteOfDay(item.timeMin) : null;
  if (own != null) return own;
  for (const block of routineItemBlocks(projected, item)) {
    const startMin = routineBlockStartMin(block);
    if (startMin != null) return startMin;
  }
  return null;
}

export function routineClock24(minutes: unknown): string {
  if (typeof minutes !== "number" || !Number.isFinite(minutes)) return "";
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/* "Daily", "Weekdays", "Weekends" or the short names, for a list of weekdays. */
export function routineDaysLabel(days: readonly number[] | null | undefined): string {
  const list = Array.isArray(days) ? [...new Set(days as number[])].sort((a, b) => a - b) : [0, 1, 2, 3, 4, 5, 6];
  if (list.length === 7) return "Daily";
  if (list.join() === "0,1,2,3,4") return "Weekdays";
  if (list.join() === "5,6") return "Weekends";
  return list.map((day) => DAY_SHORT[day] || "").filter(Boolean).join(" ");
}

export function routineDayLetters(): string[] {
  return DAY_LETTERS.slice();
}

const SHORT = new Map([
  ["Morning routine", "Morning"],
  ["Wake-up routine", "Wake-up"],
  ["Night routine", "Night"],
  ["Wind-down routine", "Wind-down"],
]);

export function routineShortName(block: BlockLike | null | undefined): string {
  if (!block || typeof block.name !== "string") return "";
  return SHORT.get(block.name) || block.name;
}

/* "Morning · Daily · 07:45" on a type card. */
export function routineItemLabel(projected: ViewLike | null | undefined, item: ItemLike | null | undefined): string {
  const blocks = routineItemBlocks(projected, item);
  const parts: string[] = [];
  if (blocks.length) parts.push(routineShortName(blocks[0]));
  parts.push(routineDaysLabel(blocks.length ? routineBlockDays(blocks[0]) : null));
  const time = routineItemTimeMin(projected, item);
  if (time != null) parts.push(routineClock24(time));
  return parts.join(" · ");
}

/* "05:00–11:00". Empty when the routine has no window. */
export function routineWindowLabel(block: BlockLike | null | undefined): string {
  const window = routineBlockWindow(block);
  if (!window) return "";
  return `${routineClock24(window.startMin)}–${routineClock24(window.endMin)}`;
}

/* Logs that count as taken: done or partial, not undone, not rest. */
function taken(log: LogLike | null | undefined, itemId: unknown): log is LogLike {
  return !!(log && isLive(log) && log.rest !== true && log.itemId === itemId && (log.status === "done" || log.status === "partial"));
}

/* What is left in the vial or bottle: the count typed on the item minus the
   days logged since it was typed. On the day it was typed, a log counts
   when it was made after the count. Without that time, the day's logs are
   taken to be in the count. Null when no count is set. A count of 0 is
   kept: it means the user ran out, not that no count was typed.
   This counts logged days. It never adds up amounts. */
export function routineDosesLeft(item: ItemLike | null | undefined, logs: unknown): { left: number; total: number } | null {
  if (!item || typeof item.onHand !== "number" || !Number.isInteger(item.onHand) || item.onHand < 0) return null;
  const since = typeof item.onHandDay === "string" ? item.onHandDay : "";
  const countedAt = since && typeof item.onHandAt === "number" && Number.isFinite(item.onHandAt) && item.onHandAt > 0 ? item.onHandAt : 0;
  const used = new Set<string>();
  for (const log of (Array.isArray(logs) ? logs : []) as LogLike[]) {
    if (!taken(log, item.id) || typeof log.day !== "string") continue;
    if (since && log.day < since) continue;
    if (since && log.day === since && !(countedAt && typeof log.at === "number" && log.at >= countedAt)) continue;
    used.add(log.day);
  }
  return { left: Math.max(0, item.onHand - used.size), total: item.onHand };
}

function shiftDay(day: string, delta: number): string {
  const date = new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)) + delta);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/* This week, Monday to Sunday: which days have a taken log. */
export function routineWeekTaken(logs: unknown, itemId: unknown, day: string): { days: boolean[]; today: number } {
  const weekday = routineWeekday(day);
  if (weekday < 0) return { days: [], today: -1 };
  const monday = shiftDay(day, -weekday);
  const week = Array.from({ length: 7 }, (_, index) => shiftDay(monday, index));
  const hit = new Set(((Array.isArray(logs) ? logs : []) as LogLike[]).filter((log) => taken(log, itemId)).map((log) => log.day));
  return { days: week.map((key) => hit.has(key)), today: weekday };
}

/* The newest taken log for an item, for "Last site". */
export function routineLastTaken<L extends LogLike>(logs: readonly L[] | null | undefined, itemId: unknown): L | null {
  let best: L | null = null;
  for (const log of Array.isArray(logs) ? (logs as L[]) : []) {
    if (!taken(log, itemId)) continue;
    if (!best || (log.at || 0) > (best.at || 0)) best = log;
  }
  return best;
}

/* A short line for a hidden routine in Edit routines. */
export function routineHiddenNote(store: unknown, block: BlockLike | null | undefined): string {
  const view = normalizeRoutineStore(store);
  if (!view || !block) return "";
  const live = new Map(liveOf(view.items).map((item) => [item.id, item]));
  const ids = [...new Set(liveOf(view.placements).filter((place) => place.blockId === block.id && live.has(place.itemId)).map((place) => place.itemId))];
  const count = ids.length;
  if (!count) return "Nothing in it";
  if (ids.every((id) => routineItemType(live.get(id), view.prefs))) {
    return count === 1 ? "Its item now lives on its tab" : `Its ${count} items now live on their tabs`;
  }
  return count === 1 ? "1 item" : `${count} items`;
}

/* A type the user makes, like "Skin care". The same name in any letter case
   is the type that is already there. A blank name or a full list is refused.
   newId gives the id of the new row. */
export function addCustomType(input: unknown, name: unknown, clock: RoutineClock, newId: () => string): { store: RoutineStore; typeId: string; added: boolean } | null {
  const trimmed = typeof name === "string" ? name.trim().replace(/\s+/g, " ").slice(0, 40) : "";
  const store = start(input, clock, false);
  if (!trimmed || !store) return null;
  const current = routineCustomTypes(store.prefs);
  const same = current.find((row) => row.name.toLowerCase() === trimmed.toLowerCase());
  if (same) return { store, typeId: same.id, added: false };
  if (current.length >= CUSTOM_TYPE_MAX) return null;
  const rowId = newId();
  if (!isRoutineRowId(rowId)) return null;
  const typeId = customTypeId(rowId);
  if (current.some((row) => row.id === typeId)) return null;
  const next = clean({ ...store, prefs: { ...store.prefs, customTypes: [...current, { id: typeId, name: trimmed }], updatedAt: prefStamp(store, clock) } });
  return next ? { store: next, typeId, added: true } : null;
}
