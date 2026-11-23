/* Making and editing routines: new, rename, recolour, retime, pick days and
   items, move up or down, hide, restore, duplicate and delete. Each rule
   takes the stored shape and returns the next one, or null when the change
   is refused. A plan edit changes names, order and placements. It never
   writes or rewrites a log.

   Ported from the web app's pages/daily-routines.js and
   pages/daily-routines-plan.js. The web keeps a separate order stamp and a
   "removed with" mark so two phones can merge; the phone writes whole rows,
   last write wins, so a moved row simply takes a new stamp. */

import { routineItemType } from "./day";
import { routineBlockDays, routineBlockWindow, routineMinuteOfDay } from "./dose";
import { routinePlacementId } from "./ids";
import { isLive, projectRoutineStore, type RoutineBlock, type RoutinePlacement, type RoutineStore, type ViewLike } from "./shape";
import { clean, cleanName, put, rowStampOf, stampAfter, start, timeToMin, type RoutineClock } from "./write";

export const ROUTINE_BLOCK_COLORS = Object.freeze(["citrus", "lavender", "pink"] as const);
const TILE_COLORS = new Set<string>(ROUTINE_BLOCK_COLORS);
const EVERY_DAY = Object.freeze([0, 1, 2, 3, 4, 5, 6]);

function byOrder(a: { order: number; id: string }, b: { order: number; id: string }): number {
  return a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/* Live routines on the page. A hidden routine keeps its rows but is not
   offered anywhere until it is restored. */
function shownBlocks(store: RoutineStore): RoutineBlock[] {
  return store.blocks.filter((block) => isLive(block) && block.hidden !== true);
}

function nextBlockColor(store: RoutineStore): string {
  return ROUTINE_BLOCK_COLORS[shownBlocks(store).length % ROUTINE_BLOCK_COLORS.length];
}

function nextShownOrder(store: RoutineStore): number {
  return shownBlocks(store).reduce((max, block) => Math.max(max, block.order || 0), -1) + 1;
}

function nextLiveOrder(store: RoutineStore): number {
  return store.blocks.filter(isLive).reduce((max, block) => Math.max(max, block.order || 0), -1) + 1;
}

function nextPlacementOrder(store: RoutineStore, blockId: string): number {
  return store.placements.filter((row) => isLive(row) && row.blockId === blockId).reduce((max, row) => Math.max(max, row.order || 0), -1) + 1;
}

/* The routine the page last touched. A routine that is gone or hidden is
   not remembered: the one before it stays, or the first one shown. */
function remember(store: RoutineStore, blockId: string | null, at: number): RoutineStore {
  const shown = shownBlocks(store);
  const live = typeof blockId === "string" && shown.some((block) => block.id === blockId);
  const previous = store.prefs.lastBlockId;
  const lastBlockId = live ? blockId : previous && shown.some((block) => block.id === previous) ? previous : shown.length ? shown.slice().sort(byOrder)[0].id : null;
  return { ...store, prefs: { ...store.prefs, lastBlockId, updatedAt: Math.max(at, store.prefs.updatedAt || 0) } };
}

function liveBlock(store: RoutineStore | null, blockId: unknown): RoutineBlock | undefined {
  return store && typeof blockId === "string" && blockId ? store.blocks.find((row) => row.id === blockId && isLive(row)) : undefined;
}

export function addBlock(input: unknown, name: unknown, clock: RoutineClock, newId: () => string): { store: RoutineStore; blockId: string } | null {
  const trimmed = cleanName(name);
  const store = start(input, clock, false);
  if (!trimmed || !store) return null;
  const blockId = newId();
  if (!blockId || store.blocks.some((row) => row.id === blockId)) return null;
  const block: RoutineBlock = { id: blockId, name: trimmed, color: nextBlockColor(store), order: nextShownOrder(store), updatedAt: 0, deletedAt: null };
  const next = clean(remember(put(store, "blocks", block, stampAfter(clock.now, 0)), blockId, clock.now));
  return next ? { store: next, blockId } : null;
}

export function renameBlock(input: unknown, blockId: unknown, name: unknown, clock: RoutineClock): RoutineStore | null {
  const trimmed = cleanName(name);
  const store = start(input, clock, false);
  const block = liveBlock(store, blockId);
  if (!trimmed || !store || !block) return null;
  const at = stampAfter(clock.now, rowStampOf(block));
  return clean(remember(put(store, "blocks", { ...block, name: trimmed }, at), block.id, at));
}

export function setBlockColor(input: unknown, blockId: unknown, color: unknown, clock: RoutineClock): RoutineStore | null {
  if (typeof color !== "string" || !TILE_COLORS.has(color)) return null;
  const store = start(input, clock, false);
  const block = liveBlock(store, blockId);
  if (!store || !block) return null;
  const at = stampAfter(clock.now, rowStampOf(block));
  return clean(remember(put(store, "blocks", { ...block, color }, at), block.id, at));
}

/* The routine and its placements go together. Items and logs stay. The
   returned shape still holds the removed rows, marked deleted, so the same
   screen can put them back; once saved, a deleted row keeps no values on
   the phone. */
export function deleteBlock(input: unknown, blockId: unknown, clock: RoutineClock): RoutineStore | null {
  const store = start(input, clock, false);
  const block = liveBlock(store, blockId);
  if (!store || !block) return null;
  const at = stampAfter(clock.now, Math.max(rowStampOf(block), ...store.placements.filter((row) => row.blockId === block.id).map(rowStampOf)));
  const next: RoutineStore = {
    ...store,
    blocks: store.blocks.map((row) => (row.id === block.id ? { ...row, updatedAt: at, deletedAt: at } : row)),
    placements: store.placements.map((row) => (isLive(row) && row.blockId === block.id ? { ...row, updatedAt: at, deletedAt: at } : row)),
    prefs: store.prefs.lastBlockId === block.id ? { ...store.prefs, lastBlockId: null } : store.prefs,
  };
  return clean(remember(next, null, at));
}

/* Puts back a routine deleteBlock removed, at the end of the page, with the
   placements that went with it. It needs the shape deleteBlock returned:
   the values are not kept anywhere else. */
export function restoreBlock(input: unknown, blockId: unknown, clock: RoutineClock): RoutineStore | null {
  if (typeof blockId !== "string" || !blockId) return null;
  const store = start(input, clock, false);
  const block = store && store.blocks.find((row) => row.id === blockId);
  if (!store || !block || isLive(block) || !block.name) return null;
  const gone = block.deletedAt || 0;
  const at = stampAfter(clock.now, rowStampOf(block));
  const liveItems = new Set(store.items.filter(isLive).map((item) => item.id));
  const next: RoutineStore = {
    ...store,
    blocks: store.blocks.map((row) => (row.id === blockId ? { ...row, order: nextLiveOrder(store), updatedAt: at, deletedAt: null } : row)),
    placements: store.placements.map((row) => (row.blockId === blockId && row.deletedAt === gone && liveItems.has(row.itemId) ? { ...row, updatedAt: at, deletedAt: null } : row)),
  };
  return clean(remember(next, blockId, at));
}

/* The copy keeps the routine's window and days, so its items stay due on
   the same days and not every day. The items are shared with the first
   routine, so a log covers both. */
export function duplicateBlock(input: unknown, blockId: unknown, clock: RoutineClock, newId: () => string): { store: RoutineStore; blockId: string } | null {
  const store = start(input, clock, false);
  const block = liveBlock(store, blockId);
  if (!store || !block) return null;
  const id = newId();
  if (!id || store.blocks.some((row) => row.id === id)) return null;
  const liveItems = new Set(store.items.filter(isLive).map((item) => item.id));
  const copies = store.placements.filter((row) => isLive(row) && row.blockId === block.id && liveItems.has(row.itemId)).slice().sort(byOrder);
  const suffix = " copy";
  const copy: RoutineBlock = {
    id, name: `${block.name.slice(0, 80 - suffix.length).trimEnd()}${suffix}`, color: TILE_COLORS.has(block.color) ? block.color : "citrus",
    order: nextShownOrder(store), updatedAt: 0, deletedAt: null,
  };
  if (typeof block.startMin === "number") {
    copy.startMin = block.startMin;
    if (typeof block.endMin === "number") copy.endMin = block.endMin;
  }
  if (Array.isArray(block.days)) copy.days = block.days.slice();
  const at = stampAfter(clock.now, 0);
  let next = put(store, "blocks", copy, at);
  for (const place of copies) {
    const placement: RoutinePlacement = { id: routinePlacementId(id, place.itemId), blockId: id, itemId: place.itemId, order: place.order, updatedAt: 0, deletedAt: null };
    next = put(next, "placements", placement, at);
  }
  const saved = clean(remember(next, id, at));
  return saved ? { store: saved, blockId: id } : null;
}

function sameIdList(liveIds: readonly string[], orderedIds: unknown): orderedIds is string[] {
  if (!Array.isArray(orderedIds) || orderedIds.length !== liveIds.length) return false;
  const want = new Set(liveIds);
  if (want.size !== liveIds.length) return false;
  const seen = new Set<string>();
  for (const id of orderedIds) {
    if (typeof id !== "string" || !want.has(id) || seen.has(id)) return false;
    seen.add(id);
  }
  return seen.size === want.size;
}

/* Rows whose place did not change are left alone. */
function applyOrders(store: RoutineStore, collection: "blocks" | "placements", ids: readonly string[], clock: RoutineClock): RoutineStore {
  return ids.reduce((next, id, index) => {
    const row = next[collection].find((entity) => entity.id === id);
    if (!row || row.order === index) return next;
    return put(next, collection, { ...row, order: index }, stampAfter(clock.now, rowStampOf(row)));
  }, store);
}

function shownBlockIds(store: RoutineStore): string[] {
  return shownBlocks(store).slice().sort(byOrder).map((block) => block.id);
}

/* The new order has to name every routine on the page once. The same order is refused. */
export function reorderBlocks(input: unknown, orderedIds: unknown, clock: RoutineClock, movedId?: string): RoutineStore | null {
  const store = start(input, clock, false);
  if (!store) return null;
  const ids = shownBlockIds(store);
  if (!sameIdList(ids, orderedIds) || ids.join("\0") === orderedIds.join("\0")) return null;
  const moved = typeof movedId === "string" && orderedIds.includes(movedId) ? movedId : orderedIds[0];
  return clean(remember(applyOrders(store, "blocks", orderedIds, clock), moved, clock.now));
}

function moved(ids: readonly string[], id: unknown, delta: unknown): string[] | null {
  if (delta !== -1 && delta !== 1) return null;
  const from = ids.indexOf(id as string);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return null;
  const ordered = ids.slice();
  ordered.splice(to, 0, ordered.splice(from, 1)[0]);
  return ordered;
}

/* Up or down one place among the routines on the page. The first cannot go up and the last cannot go down. */
export function moveBlock(input: unknown, blockId: unknown, delta: unknown, clock: RoutineClock): RoutineStore | null {
  const store = start(input, clock, false);
  const ordered = store && moved(shownBlockIds(store), blockId, delta);
  return ordered ? reorderBlocks(store, ordered, clock, blockId as string) : null;
}

/* Whether Move up and Move down can do anything for this routine. */
export function blockMoves(view: ViewLike | null | undefined, blockId: unknown): { up: boolean; down: boolean } {
  const ids = (view && view.blocks ? view.blocks : []).filter((block) => isLive(block) && block.hidden !== true)
    .slice().sort((a, b) => (a.order || 0) - (b.order || 0) || ((a.id || "") < (b.id || "") ? -1 : 1)).map((block) => block.id);
  const index = ids.indexOf(blockId as string);
  return { up: index > 0, down: index >= 0 && index < ids.length - 1 };
}

function placementIds(store: RoutineStore, blockId: string): string[] {
  const view = projectRoutineStore(store);
  if (!view) return [];
  const items = new Set(view.items.map((item) => item.id));
  return view.placements.filter((row) => row.blockId === blockId && items.has(row.itemId)).slice().sort(byOrder).map((row) => row.id);
}

/* The order of the items inside one routine. */
export function reorderPlacements(input: unknown, blockId: unknown, orderedIds: unknown, clock: RoutineClock): RoutineStore | null {
  const store = start(input, clock, false);
  const block = liveBlock(store, blockId);
  if (!store || !block || block.hidden === true) return null;
  const ids = placementIds(store, block.id);
  if (!sameIdList(ids, orderedIds) || ids.join("\0") === orderedIds.join("\0")) return null;
  return clean(remember(applyOrders(store, "placements", orderedIds, clock), block.id, clock.now));
}

/* Up or down one place inside its routine. */
export function movePlacement(input: unknown, blockId: unknown, placementId: unknown, delta: unknown, clock: RoutineClock): RoutineStore | null {
  const store = start(input, clock, false);
  const block = liveBlock(store, blockId);
  const ordered = store && block ? moved(placementIds(store, block.id), placementId, delta) : null;
  return ordered ? reorderPlacements(store, blockId, ordered, clock) : null;
}

function cleanDays(days: unknown): number[] {
  const list = Array.isArray(days) ? [...new Set(days.filter((day): day is number => typeof day === "number" && Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b) : [];
  return list.length ? list : EVERY_DAY.slice();
}

/* The window of a routine draft, from minutes or from "HH:MM". An end at or
   before the start runs past midnight. Null when either time is missing. */
export function routineDraftWindow(startRaw: unknown, endRaw: unknown): { startMin: number; endMin: number } | null {
  const startMin = typeof startRaw === "number" ? routineMinuteOfDay(startRaw) : routineMinuteOfDay(timeToMin(startRaw));
  const endDay = typeof endRaw === "number" ? routineMinuteOfDay(endRaw % 1440) : routineMinuteOfDay(timeToMin(endRaw));
  if (startMin == null || endDay == null) return null;
  return { startMin, endMin: endDay > startMin ? endDay : endDay + 1440 };
}

export interface BlockDraftValues { blockId: string | null; name: string; startMin: number; endMin: number; days: number[]; color: string; itemIds: string[] }
export interface BlockDraft { blockId?: string | null; name?: unknown; startMin?: unknown; endMin?: unknown; days?: unknown; color?: unknown; itemIds?: readonly string[] }

/* What the New routine and Edit routine sheets open with. A new routine
   starts at noon for two hours, every day, in a colour no routine uses yet. */
export function blockDraft(view: ViewLike | null | undefined, blockId?: string | null): BlockDraftValues | null {
  const blocks = (view && view.blocks ? view.blocks : []).filter((block) => isLive(block) && block.hidden !== true);
  const block = blockId ? blocks.find((row) => row.id === blockId) : null;
  if (blockId && !block) return null;
  const window = block ? routineBlockWindow(block) : null;
  const liveItems = new Set((view && view.items ? view.items : []).filter(isLive).map((item) => item.id));
  const placed = block
    ? (view && view.placements ? view.placements : []).filter((place) => isLive(place) && place.blockId === block.id && liveItems.has(place.itemId))
      .slice().sort((a, b) => (a.order || 0) - (b.order || 0)).map((place) => place.itemId as string)
    : [];
  const used = new Set(blocks.map((row) => row.color));
  const color = block ? (typeof block.color === "string" && TILE_COLORS.has(block.color) ? block.color : "citrus") : ROUTINE_BLOCK_COLORS.find((token) => !used.has(token)) || "lavender";
  return {
    blockId: block && block.id ? block.id : null,
    name: block && block.name ? block.name : "",
    startMin: window ? window.startMin : 12 * 60,
    endMin: window ? window.endMin % 1440 : 14 * 60,
    days: block ? routineBlockDays(block) : EVERY_DAY.slice(),
    color,
    itemIds: [...new Set(placed)],
  };
}

/* A routine runs at least one day, so the last day cannot be turned off. */
export function toggleDraftDay(days: unknown, index: unknown): number[] | null {
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index > 6) return null;
  const picked = new Set(Array.isArray(days) ? cleanDays(days) : []);
  if (picked.has(index) && picked.size === 1) return null;
  if (picked.has(index)) picked.delete(index);
  else picked.add(index);
  return [...picked].sort((a, b) => a - b);
}

export function toggleDraftItem(itemIds: readonly string[] | null | undefined, itemId: unknown): string[] | null {
  if (typeof itemId !== "string" || !itemId) return null;
  const ids = Array.isArray(itemIds) ? itemIds.slice() : [];
  return ids.includes(itemId) ? ids.filter((id) => id !== itemId) : ids.concat(itemId);
}

/* New routine and Edit routine both save here: name, window, days, colour
   and which items sit in it. Items left out lose their place in this
   routine only; their logs stay. newId gives the id of a new routine. */
export function saveBlock(input: unknown, draft: BlockDraft | null | undefined, clock: RoutineClock, newId: () => string): { store: RoutineStore; blockId: string } | null {
  const name = cleanName(draft && draft.name);
  const window = draft ? routineDraftWindow(draft.startMin, draft.endMin) : null;
  const store = start(input, clock, false);
  if (!draft || !name || !window || !store) return null;
  const wantedId = typeof draft.blockId === "string" && draft.blockId ? draft.blockId : "";
  const existing = wantedId ? shownBlocks(store).find((block) => block.id === wantedId) : undefined;
  if (wantedId && !existing) return null;
  const id = existing ? existing.id : newId();
  if (!id || (!existing && store.blocks.some((row) => row.id === id))) return null;
  const color = typeof draft.color === "string" && TILE_COLORS.has(draft.color) ? draft.color : existing && TILE_COLORS.has(existing.color) ? existing.color : nextBlockColor(store);
  const at = stampAfter(clock.now, rowStampOf(existing));
  const block: RoutineBlock = { ...(existing || { id, order: nextLiveOrder(store), updatedAt: 0, deletedAt: null }), name, color, startMin: window.startMin, endMin: window.endMin, days: cleanDays(draft.days) };
  let next = put(store, "blocks", block, at);
  if (Array.isArray(draft.itemIds)) {
    const liveItems = new Set(next.items.filter(isLive).map((item) => item.id));
    const wanted = [...new Set(draft.itemIds.filter((itemId) => typeof itemId === "string" && liveItems.has(itemId)))];
    for (const itemId of wanted) {
      if (next.placements.some((row) => isLive(row) && row.blockId === id && row.itemId === itemId)) continue;
      const placementId = routinePlacementId(id, itemId);
      const placement: RoutinePlacement = { id: placementId, blockId: id, itemId, order: nextPlacementOrder(next, id), updatedAt: 0, deletedAt: null };
      next = put(next, "placements", placement, stampAfter(clock.now, rowStampOf(next.placements.find((row) => row.id === placementId))));
    }
    const keep = new Set(wanted);
    for (const place of next.placements.filter((row) => isLive(row) && row.blockId === id && !keep.has(row.itemId))) {
      /* An untyped item shows only in its shown routines. Taken out of its
         last one, it moves to the Other tab rather than out of sight; a
         hidden routine does not count as somewhere to show. */
      const item = next.items.find((row) => isLive(row) && row.id === place.itemId);
      const shown = new Set(shownBlocks(next).map((row) => row.id));
      const elsewhere = next.placements.some((row) => isLive(row) && row.itemId === place.itemId && row.blockId !== id && shown.has(row.blockId));
      if (item && !elsewhere && !routineItemType(item, next.prefs)) next = put(next, "items", { ...item, type: "other" }, stampAfter(clock.now, rowStampOf(item)));
      const gone = stampAfter(clock.now, rowStampOf(place));
      next = { ...next, placements: next.placements.map((row) => (row.id === place.id ? { ...row, updatedAt: gone, deletedAt: gone } : row)) };
    }
  }
  const saved = clean(remember(next, id, at));
  return saved ? { store: saved, blockId: id } : null;
}

/* Hide keeps every placement and log, so the routine can come back whole. */
export function hideBlock(input: unknown, blockId: unknown, clock: RoutineClock): RoutineStore | null {
  const store = start(input, clock, false);
  const block = liveBlock(store, blockId);
  if (!store || !block || block.hidden === true) return null;
  const at = stampAfter(clock.now, rowStampOf(block));
  return clean(remember(put(store, "blocks", { ...block, hidden: true }, at), null, at));
}

/* A restored routine goes to the end of the page. */
export function showBlock(input: unknown, blockId: unknown, clock: RoutineClock): RoutineStore | null {
  const store = start(input, clock, false);
  const block = liveBlock(store, blockId);
  if (!store || !block || block.hidden !== true) return null;
  const at = stampAfter(clock.now, rowStampOf(block));
  const shown: RoutineBlock = { ...block, order: nextLiveOrder(store) };
  delete shown.hidden;
  return clean(remember(put(store, "blocks", shown, at), block.id, at));
}

/* The routine the Add item sheet opens on next time. */
export function rememberBlock(input: unknown, blockId: unknown, clock: RoutineClock): RoutineStore | null {
  const store = start(input, clock, false);
  const block = liveBlock(store, blockId);
  if (!store || !block || block.hidden === true || store.prefs.lastBlockId === block.id) return null;
  return clean(remember(store, block.id, stampAfter(clock.now, store.prefs.updatedAt)));
}

function toggleListed(input: unknown, blockId: unknown, clock: RoutineClock, key: "collapsedBlocks" | "revealBlocks"): RoutineStore | null {
  const store = start(input, clock, false);
  const block = liveBlock(store, blockId);
  if (!store || !block) return null;
  const current = (store.prefs[key] || []).filter((id) => typeof id === "string" && id);
  const list = current.includes(block.id) ? current.filter((id) => id !== block.id) : current.concat(block.id);
  return clean({ ...store, prefs: { ...store.prefs, [key]: list, updatedAt: stampAfter(clock.now, store.prefs.updatedAt) } });
}

/* Folds a routine to its bar, or opens it again. The web also opens and
   shuts a routine for one visit only; that is screen state, not stored. */
export function toggleCollapsed(input: unknown, blockId: unknown, clock: RoutineClock): RoutineStore | null {
  return toggleListed(input, blockId, clock, "collapsedBlocks");
}

/* Shows or hides the finished rows of one routine. */
export function toggleReveal(input: unknown, blockId: unknown, clock: RoutineClock): RoutineStore | null {
  return toggleListed(input, blockId, clock, "revealBlocks");
}
