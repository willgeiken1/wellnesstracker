import {
  DEFAULT_BLOCK_STAMP,
  isCustomRoutineType,
  isLive,
  liveOf,
  normalizeDailyRoutines,
  ROUTINE_ITEM_TYPES,
  routineItemTypeId,
} from "./daily-routines-store.js";
import { routineBlockDays, routineBlockStartMin, routineBlockWindow, routineMinuteOfDay, routineWeekday } from "./routine-dose.js";

/* Item types and their tabs inside Routines.

   Every item can carry one type: supplement, medication, peptide, enhancer,
   other, or a type the user made (prefs.customTypes). A type's tab shows
   once an item has that type, or once setup or settings turned it on
   (prefs.typeTabs). Routines itself only lists real routines.

   Older stores kept supplements, enhancers and medications in blocks of
   their own. migrateRoutineTypes() gives those items a type, keeps every
   placement and log, and hides the old block so it can be restored. */

export const ROUTINE_TYPE_ORDER = Object.freeze(["supplement", "peptide", "medication", "enhancer", "other"]);

const NAMES = Object.freeze({
  supplement: Object.freeze({ one: "Supplement", many: "Supplements" }),
  medication: Object.freeze({ one: "Medication", many: "Medications" }),
  peptide: Object.freeze({ one: "Peptide", many: "Peptides" }),
  enhancer: Object.freeze({ one: "Enhancer", many: "Enhancers" }),
  other: Object.freeze({ one: "Other", many: "Other" }),
});

export const CUSTOM_TYPE_MAX = 12;

/* The types the user made, oldest first. Bad rows and repeats drop out.
   The limit is on making a type: two phones that each made some can sync
   to more than the limit, and every one of them keeps its tab. */
export function routineCustomTypes(prefs) {
  const raw = prefs && Array.isArray(prefs.customTypes) ? prefs.customTypes : [];
  const seen = new Set();
  const out = [];
  for (const row of raw) {
    if (!row || typeof row !== "object" || !isCustomRoutineType(row.id) || seen.has(row.id)) continue;
    const name = typeof row.name === "string" ? row.name.trim().slice(0, 40) : "";
    if (!name) continue;
    seen.add(row.id);
    out.push({ id: row.id, name });
  }
  return out;
}

export function routineTypeName(type, prefs, many = true) {
  if (Object.prototype.hasOwnProperty.call(NAMES, type)) return many ? NAMES[type].many : NAMES[type].one;
  const custom = routineCustomTypes(prefs).find((row) => row.id === type);
  return custom ? custom.name : "";
}

/* Every type an item can take here, built in first. */
export function routineTypeChoices(prefs) {
  return [
    ...ROUTINE_ITEM_TYPES.map((id) => ({ id, name: routineTypeName(id, prefs, false), custom: false })),
    ...routineCustomTypes(prefs).map((row) => ({ id: row.id, name: row.name, custom: true })),
  ];
}

function knownType(type, prefs) {
  const id = routineItemTypeId(type);
  if (!id) return "";
  if (!isCustomRoutineType(id)) return id;
  return routineCustomTypes(prefs).some((row) => row.id === id) ? id : "";
}

export function routineItemType(item, prefs) {
  return item ? knownType(item.type, prefs) : "";
}

/* The tabs Routines shows, in a fixed order. Empty means no tab row. */
export function routineTypeTabs(projected) {
  const prefs = projected && projected.prefs;
  const on = new Set(prefs && Array.isArray(prefs.typeTabs) ? prefs.typeTabs.filter((id) => typeof id === "string") : []);
  for (const item of liveOf(projected && projected.items)) {
    const type = routineItemType(item, prefs);
    if (type) on.add(type);
  }
  const order = [...ROUTINE_TYPE_ORDER, ...routineCustomTypes(prefs).map((row) => row.id)];
  return order.filter((id) => on.has(id));
}

export function routineTypedItems(projected, type) {
  const prefs = projected && projected.prefs;
  return liveOf(projected && projected.items)
    .filter((item) => routineItemType(item, prefs) === type)
    .sort((a, b) => (routineItemTimeMin(projected, a) ?? 9999) - (routineItemTimeMin(projected, b) ?? 9999) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/* The routines an item sits in, in page order. Hidden routines are left out. */
export function routineItemBlocks(projected, item) {
  if (!projected || !item) return [];
  const ids = new Set(liveOf(projected.placements).filter((place) => place.itemId === item.id).map((place) => place.blockId));
  return (projected.blocks || []).filter((block) => ids.has(block.id));
}

/* When the item is taken: its own time, or the start of its first routine. */
export function routineItemTimeMin(projected, item) {
  const own = item ? routineMinuteOfDay(item.timeMin) : null;
  if (own != null) return own;
  for (const block of routineItemBlocks(projected, item)) {
    const start = routineBlockStartMin(block);
    if (start != null) return start;
  }
  return null;
}

export function routineClock24(minutes) {
  if (typeof minutes !== "number" || !Number.isFinite(minutes)) return "";
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/* "Daily", "Weekdays", "Weekends" or the letters, for a list of weekdays. */
export function routineDaysLabel(days) {
  const list = Array.isArray(days) ? [...new Set(days)].sort((a, b) => a - b) : [0, 1, 2, 3, 4, 5, 6];
  if (list.length === 7) return "Daily";
  if (list.join() === "0,1,2,3,4") return "Weekdays";
  if (list.join() === "5,6") return "Weekends";
  return list.map((day) => DAY_SHORT[day] || "").filter(Boolean).join(" ");
}

export function routineDayLetters() {
  return DAY_LETTERS.slice();
}

/* "MORNING · DAILY · 07:45" on a type card. */
export function routineItemLabel(projected, item) {
  const blocks = routineItemBlocks(projected, item);
  const parts = [];
  if (blocks.length) parts.push(routineShortName(blocks[0]));
  parts.push(routineDaysLabel(blocks.length ? routineBlockDays(blocks[0]) : null));
  const time = routineItemTimeMin(projected, item);
  if (time != null) parts.push(routineClock24(time));
  return parts.join(" · ");
}

const SHORT = new Map([
  ["Morning routine", "Morning"],
  ["Wake-up routine", "Wake-up"],
  ["Night routine", "Night"],
  ["Wind-down routine", "Wind-down"],
]);

export function routineShortName(block) {
  if (!block || typeof block.name !== "string") return "";
  return SHORT.get(block.name) || block.name;
}

/* "05:00–11:00", or "from 21:30" when the window is an hour or less or has
   no end of its own. */
export function routineWindowLabel(block) {
  const window = routineBlockWindow(block);
  if (!window) return "";
  return `${routineClock24(window.startMin)}–${routineClock24(window.endMin)}`;
}

/* Logs that count as a taken dose: done or partial, not undone, not rest. */
function taken(log, itemId) {
  return !!(log && isLive(log) && log.rest !== true && log.itemId === itemId && (log.status === "done" || log.status === "partial"));
}

/* Doses left in the vial or bottle: the count typed on the item minus the
   doses logged since it was typed. On the day it was typed, a dose counts
   when it was logged after the count. Without that time, the day's doses
   are taken to be in the count. Null when no count is set. */
export function routineDosesLeft(item, logs) {
  if (!item || !Number.isInteger(item.onHand) || item.onHand < 1) return null;
  const since = typeof item.onHandDay === "string" ? item.onHandDay : "";
  const countedAt = since && typeof item.onHandAt === "number" && Number.isFinite(item.onHandAt) && item.onHandAt > 0 ? item.onHandAt : 0;
  const used = new Set();
  for (const log of Array.isArray(logs) ? logs : []) {
    if (!taken(log, item.id) || typeof log.day !== "string") continue;
    if (since && log.day < since) continue;
    if (since && log.day === since && !(countedAt && typeof log.at === "number" && log.at >= countedAt)) continue;
    used.add(log.day);
  }
  return { left: Math.max(0, item.onHand - used.size), total: item.onHand };
}

function shiftDay(day, delta) {
  const date = new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)) + delta);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/* This week, Monday to Sunday: which days have a taken dose. */
export function routineWeekTaken(logs, itemId, day) {
  const weekday = routineWeekday(day);
  if (weekday < 0) return { days: [], today: -1 };
  const monday = shiftDay(day, -weekday);
  const week = Array.from({ length: 7 }, (_, index) => shiftDay(monday, index));
  const hit = new Set((Array.isArray(logs) ? logs : []).filter((log) => taken(log, itemId)).map((log) => log.day));
  return { days: week.map((key) => hit.has(key)), today: weekday };
}

/* The newest taken log for an item, for "Last site". */
export function routineLastTaken(logs, itemId) {
  let best = null;
  for (const log of Array.isArray(logs) ? logs : []) {
    if (!taken(log, itemId)) continue;
    if (!best || (log.at || 0) > (best.at || 0)) best = log;
  }
  return best;
}

/* Old blocks that held supplements, enhancers and medications, and the type
   each kind of item gets. The default stack's type follows the name setup
   gave it. */
const LEGACY = Object.freeze({
  block_default_stack: (block, item) => {
    if (block.name === "Supplements") return "supplement";
    if (block.name === "Supplements & medications") return item.kind === "dose" ? "medication" : "supplement";
    return item.kind === "dose" ? "enhancer" : "supplement";
  },
  block_setup_enhancers: (block, item) => (item.kind === "dose" ? "peptide" : "enhancer"),
  block_setup_meds: () => "medication",
});

export const ROUTINE_TYPES_VERSION = 1;

export function routineTypesMigrated(prefs) {
  return !!(prefs && typeof prefs.typesV === "number" && prefs.typesV >= ROUTINE_TYPES_VERSION);
}

/* The first run per store types the items in each old block and, when no
   other routine times them, gives them that block's start as their own
   time, so countdowns stay where they were. The block is hidden, never
   deleted, so Restore in Edit routines brings it back with its items. An
   old default nobody used is removed. Later runs only type items that sync
   in afterwards inside an old block that is hidden or removed, so they never
   vanish; a block the user restored is left alone.
   Every changed row moves just one past its own stamp, never to now, so a
   newer edit or delete from another phone still wins the merge and the next
   run types that copy again. Returns the new store, or null when there is
   nothing to do, so a paint with nothing old never saves. */
export function migrateRoutineTypes(rawStore, at) {
  const store = normalizeDailyRoutines(rawStore);
  if (!store) return null;
  const first = !routineTypesMigrated(store.prefs);
  const placements = liveOf(store.placements);
  const items = new Map(liveOf(store.items).map((item) => [item.id, item]));
  const isLegacy = (block) => Object.prototype.hasOwnProperty.call(LEGACY, block.id);
  const legacy = first
    ? liveOf(store.blocks).filter((block) => block.hidden !== true && isLegacy(block))
    : store.blocks.filter((block) => isLegacy(block) && (!isLive(block) || block.hidden === true));
  if (!legacy.length) return null;
  const legacyIds = new Set(legacy.map((block) => block.id));
  const otherTimed = (itemId) => placements.some((place) => place.itemId === itemId && !legacyIds.has(place.blockId)
    && store.blocks.some((block) => block.id === place.blockId && isLive(block) && block.hidden !== true && routineBlockStartMin(block) != null));
  const typed = new Map();
  const hide = new Set();
  const drop = new Set();
  for (const block of legacy) {
    const inside = placements.filter((place) => place.blockId === block.id && items.has(place.itemId));
    if (!first) {
      inside.filter((place) => !routineItemTypeId(items.get(place.itemId).type)).forEach((place) => {
        const item = items.get(place.itemId);
        if (typed.has(item.id)) return;
        const patch = { type: LEGACY[block.id](block, item) };
        const start = routineBlockStartMin(block);
        if (routineMinuteOfDay(item.timeMin) == null && start != null && !otherTimed(item.id)) patch.timeMin = start;
        typed.set(item.id, patch);
      });
      continue;
    }
    if (!inside.length) {
      const stampOf = Math.max(block.updatedAt || 0, block.deletedAt || 0);
      if (stampOf === DEFAULT_BLOCK_STAMP) drop.add(block.id);
      else hide.add(block.id);
      continue;
    }
    hide.add(block.id);
    const start = routineBlockStartMin(block);
    for (const place of inside) {
      const item = items.get(place.itemId);
      if (typed.has(item.id)) continue;
      const patch = {};
      if (!routineItemTypeId(item.type)) patch.type = LEGACY[block.id](block, item);
      if (routineMinuteOfDay(item.timeMin) == null && start != null && !otherTimed(item.id)) patch.timeMin = start;
      typed.set(item.id, patch);
    }
  }
  const nextStamp = (row) => Math.max(row.updatedAt || 0, row.deletedAt || 0) + 1;
  let changed = false;
  store.items = store.items.map((item) => {
    const patch = typed.get(item.id);
    if (!patch || !Object.keys(patch).length) return item;
    changed = true;
    return { ...item, ...patch, updatedAt: nextStamp(item) };
  });
  store.blocks = store.blocks.map((block) => {
    if (drop.has(block.id)) {
      changed = true;
      const gone = nextStamp(block);
      return { ...block, updatedAt: gone, deletedAt: gone };
    }
    if (hide.has(block.id)) {
      changed = true;
      return { ...block, hidden: true, updatedAt: nextStamp(block) };
    }
    return block;
  });
  if (first) {
    const prefs = { ...store.prefs, typesV: ROUTINE_TYPES_VERSION };
    prefs.updatedAt = (typeof prefs.updatedAt === "number" ? prefs.updatedAt : 0) + 1;
    store.prefs = prefs;
    changed = true;
  } else if (!changed) return null;
  const stamp = typeof at === "number" && at > 0 ? at : 0;
  store.updatedAt = Math.max(typeof store.updatedAt === "number" ? store.updatedAt : 0, stamp, store.prefs.updatedAt || 0);
  return store;
}

/* A short line for a hidden routine in Edit routines. */
export function routineHiddenNote(store, block) {
  const view = normalizeDailyRoutines(store);
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
