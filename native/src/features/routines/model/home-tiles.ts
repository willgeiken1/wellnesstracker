/* Home tiles for Routines: Next up, one tile per routine and one per item.

   This file gives Home the data to draw a tile and nothing else: what the
   tile is called, the rows still open today, whether a row can be logged,
   and where a tap goes. A row reads "name · amount unit" from what the user
   saved. Nothing here works out or suggests an amount.

   Ported from the web app's shared/routine-home-tiles.js. Stacks and the
   long-press preview are not built there either. */

import { compoundFor, coveringLog, formatRoutineAmount, routineItemType } from "./day";
import { routineBlockRunsOn } from "./dose";
import { projectRoutineStore, validDay, type RoutineBlock, type RoutineItem, type RoutineStore, type RoutineView } from "./shape";
import { clean, prefStamp, start, type RoutineClock } from "./write";

export const NEXT_UP_TILE_ID = "routine-next";
export const ROUTINE_TILE_STACK_CAP = 5;
/* How many open rows a routine tile lists before "N more". */
export const ROUTINE_TILE_ROWS = 4;

const BLOCK_PREFIX = "routine-block:";
const ITEM_PREFIX = "routine-item:";

/* What the tiles say, word for word. */
export const ROUTINE_TILE_TEXT = Object.freeze({
  next: "Next up",
  routine: "Routine",
  item: "Item",
  allDone: "All done today",
  nothing: "Nothing to show yet",
  log: "Log",
  open: "Open",
  remove: "Remove from Home",
  search: "Search tiles",
  noMatch: "No tiles match that title.",
  allPlaced: "Every routine tile is on Home.",
  small: "Small",
  big: "Big",
});

export type RoutineTileSize = "small" | "medium";
export type RoutineTileTarget = { kind: "next" } | { kind: "block"; blockId: string } | { kind: "item"; itemId: string };
export interface TileGate { start: string; end: string }

export function isRoutineTileId(id: unknown): id is string {
  if (typeof id !== "string" || !id) return false;
  if (id === NEXT_UP_TILE_ID) return true;
  if (id.startsWith(BLOCK_PREFIX) && id.length > BLOCK_PREFIX.length) return true;
  if (id.startsWith(ITEM_PREFIX) && id.length > ITEM_PREFIX.length) return true;
  return false;
}

export function routineBlockTileId(blockId: unknown): string {
  if (typeof blockId !== "string" || !blockId || blockId.length > 80) return "";
  return BLOCK_PREFIX + blockId;
}

export function routineItemTileId(itemId: unknown): string {
  if (typeof itemId !== "string" || !itemId || itemId.length > 80) return "";
  return ITEM_PREFIX + itemId;
}

export function routineTileTarget(id: unknown): RoutineTileTarget | null {
  if (!isRoutineTileId(id)) return null;
  if (id === NEXT_UP_TILE_ID) return { kind: "next" };
  if (id.startsWith(BLOCK_PREFIX)) return { kind: "block", blockId: id.slice(BLOCK_PREFIX.length) };
  return { kind: "item", itemId: id.slice(ITEM_PREFIX.length) };
}

export function routineDefaultSize(id: unknown): RoutineTileSize {
  return typeof id === "string" && id.startsWith(ITEM_PREFIX) ? "small" : "medium";
}

/* Stacks wait. Callers that group tiles later must stop at five. */
export function clampRoutineTileStack(ids: unknown): string[] {
  const out: string[] = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    if (typeof id !== "string" || !id || out.includes(id)) continue;
    if (out.length >= ROUTINE_TILE_STACK_CAP) break;
    out.push(id);
  }
  return out;
}

/* ---------- A tile can show only inside a clock window ---------- */

export function parseClockMinutes(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function formatClock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function normalizeTileGate(gate: unknown): TileGate | null {
  if (!gate || typeof gate !== "object" || Array.isArray(gate)) return null;
  const startMin = parseClockMinutes((gate as Record<string, unknown>).start);
  const endMin = parseClockMinutes((gate as Record<string, unknown>).end);
  if (startMin == null || endMin == null || startMin === endMin) return null;
  return { start: formatClock(startMin), end: formatClock(endMin) };
}

export function sanitizeRoutineGates(raw: unknown): Record<string, TileGate> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, TileGate> = {};
  for (const id of Object.keys(raw)) {
    if (!isRoutineTileId(id)) continue;
    const gate = normalizeTileGate((raw as Record<string, unknown>)[id]);
    if (gate) out[id] = gate;
  }
  return Object.keys(out).length ? out : null;
}

/* End is exclusive. A window that passes midnight wraps. A missing gate is always on. */
export function tileGateVisible(gate: unknown, date: Date): boolean {
  const window = normalizeTileGate(gate);
  if (!window) return true;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return true;
  const now = date.getHours() * 60 + date.getMinutes();
  const from = parseClockMinutes(window.start) as number;
  const to = parseClockMinutes(window.end) as number;
  if (from < to) return now >= from && now < to;
  return now >= from || now < to;
}

/* The part of a Home layout these rules read. */
export interface RoutineTileLayout {
  items?: readonly string[]; hidden?: readonly string[]; sizes?: Readonly<Record<string, string>>;
  routineGates?: Readonly<Record<string, unknown>> | null;
}

export function routineTileOnNow(id: unknown, layout: RoutineTileLayout | null | undefined, date: Date): boolean {
  if (!isRoutineTileId(id)) return false;
  const gates = layout && layout.routineGates;
  return tileGateVisible(gates && gates[id], date);
}

export function routineGateLabel(layout: RoutineTileLayout | null | undefined, id: string): string {
  const gate = normalizeTileGate(layout && layout.routineGates && layout.routineGates[id]);
  return gate ? `${gate.start}–${gate.end}` : "";
}

/* Ids whose clock window is open. Tiles without a window are left out, so
   the signature changes only when a window opens or closes. */
export function routineGateSignature(layout: RoutineTileLayout | null | undefined, date: Date): string {
  if (!layout || typeof layout !== "object") return "";
  const hidden = new Set(Array.isArray(layout.hidden) ? layout.hidden : []);
  const items: readonly unknown[] = Array.isArray(layout.items) ? layout.items : [];
  return items
    .filter((id): id is string => typeof id === "string" && !hidden.has(id) && isRoutineTileId(id) && !!normalizeTileGate(layout.routineGates && layout.routineGates[id]))
    .filter((id) => routineTileOnNow(id, layout, date))
    .join("\n");
}

/* Home asks while it is on screen. The first look only records the open
   windows. A later look says to redraw when one has opened or closed. */
export function routineGateRefresh(previous: string | null | undefined, layout: RoutineTileLayout | null | undefined, date: Date): { signature: string; changed: boolean } {
  const signature = routineGateSignature(layout, date);
  return { signature, changed: previous != null && previous !== signature };
}

/* ---------- What a tile shows ---------- */

type Entry = { block: RoutineBlock | null; item: RoutineItem };

const byOrder = (a: { order?: number; id: string }, b: { order?: number; id: string }) => (a.order || 0) - (b.order || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/* An item in routines is due on a day one of them runs. One in no routine
   lives on its type tab and is due every day. */
function itemDue(view: RoutineView, itemId: string, day: string): boolean {
  const blocks = view.placements.filter((row) => row.itemId === itemId).map((row) => view.blocks.find((block) => block.id === row.blockId)).filter((block): block is RoutineBlock => !!block);
  return !blocks.length || blocks.some((block) => routineBlockRunsOn(block, day));
}

function blockOf(view: RoutineView, itemId: string, day = ""): RoutineBlock | null {
  const blocks = new Map(view.blocks.filter((block) => !day || routineBlockRunsOn(block, day)).map((block) => [block.id, block]));
  const places = view.placements.filter((row) => row.itemId === itemId && blocks.has(row.blockId));
  places.sort((a, b) => byOrder(blocks.get(a.blockId) as RoutineBlock, blocks.get(b.blockId) as RoutineBlock) || byOrder(a, b));
  return places.length ? (blocks.get(places[0].blockId) as RoutineBlock) : null;
}

/* Items in page order: each routine that runs that day, top to bottom,
   then typed items that sit in no shown routine, by name. Those live on
   their tab and are due every day. With no day, every routine counts. */
function itemsInOrder(view: RoutineView, day = ""): Entry[] {
  const known = new Map(view.items.map((item) => [item.id, item]));
  const out: Entry[] = [];
  const seen = new Set<string>();
  for (const block of view.blocks.filter((row) => !day || routineBlockRunsOn(row, day)).slice().sort(byOrder)) {
    for (const row of view.placements.filter((place) => place.blockId === block.id && known.has(place.itemId)).slice().sort(byOrder)) {
      if (seen.has(row.itemId)) continue;
      seen.add(row.itemId);
      out.push({ block, item: known.get(row.itemId) as RoutineItem });
    }
  }
  const shown = new Set(view.blocks.map((block) => block.id));
  const held = new Set(view.placements.filter((row) => shown.has(row.blockId)).map((row) => row.itemId));
  const loose = view.items
    .filter((item) => !held.has(item.id) && !seen.has(item.id) && routineItemType(item, view.prefs))
    .sort((a, b) => ((a.name || "") < (b.name || "") ? -1 : (a.name || "") > (b.name || "") ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const item of loose) out.push({ block: null, item });
  return out;
}

function amountText(view: RoutineView, item: RoutineItem): string {
  if (item.kind !== "dose") return "";
  const compound = compoundFor(view, item);
  const shown = compound ? formatRoutineAmount(compound.amount) : "";
  if (!shown) return "";
  return compound && compound.unit ? `${shown} ${compound.unit}` : shown;
}

/* "name · amount unit", from what the user saved on the item. */
export function routineTileRowLabel(view: RoutineView, item: RoutineItem | null | undefined): string {
  const name = item && item.name ? item.name : ROUTINE_TILE_TEXT.item;
  const amount = item ? amountText(view, item) : "";
  return amount ? `${name} · ${amount}` : name;
}

function nextEntry(view: RoutineView, day: string): Entry | null {
  return itemsInOrder(view, day).find((entry) => !coveringLog(view.logs, entry.item.id, day)) || null;
}

function blockEntries(view: RoutineView, blockId: string, day: string): RoutineItem[] {
  const block = view.blocks.find((row) => row.id === blockId);
  if (!block || !routineBlockRunsOn(block, day)) return [];
  const known = new Map(view.items.map((item) => [item.id, item]));
  return view.placements
    .filter((row) => row.blockId === blockId && known.has(row.itemId))
    .slice()
    .sort(byOrder)
    .map((row) => known.get(row.itemId) as RoutineItem)
    .filter((item) => !coveringLog(view.logs, item.id, day));
}

export interface RoutineTileRow { itemId: string; label: string; canLog: boolean }
export interface RoutineTile {
  id: string; size: RoutineTileSize; kicker: string;
  /** A small tile is one line under its kicker. */
  title: string;
  /** A big tile lists rows still open today; each can be logged from Home. */
  rows: RoutineTileRow[];
  /** "N more", when a routine has more open rows than fit. */
  more: string;
  /** Shown when a big tile has no row. */
  empty: string;
  /** "05:30–06:30" when the tile has a clock window. */
  when: string;
}

/* What one tile shows on a day. null for an id that is not a routine tile. */
export function routineTile(store: unknown, id: unknown, day: unknown, options?: { size?: unknown; layout?: RoutineTileLayout | null }): RoutineTile | null {
  const target = routineTileTarget(id);
  const view = projectRoutineStore(store);
  if (!target || typeof id !== "string" || !validDay(day)) return null;
  const size: RoutineTileSize = options && (options.size === "small" || options.size === "medium") ? options.size : routineDefaultSize(id);
  const tile: RoutineTile = { id, size, kicker: ROUTINE_TILE_TEXT.routine, title: "", rows: [], more: "", empty: ROUTINE_TILE_TEXT.allDone, when: routineGateLabel(options && options.layout, id) };
  const row = (item: RoutineItem): RoutineTileRow => ({ itemId: item.id, label: view ? routineTileRowLabel(view, item) : ROUTINE_TILE_TEXT.item, canLog: true });

  if (target.kind === "next") {
    const entry = view ? nextEntry(view, day) : null;
    tile.kicker = ROUTINE_TILE_TEXT.next;
    tile.title = entry && view ? routineTileRowLabel(view, entry.item) : ROUTINE_TILE_TEXT.allDone;
    if (entry) tile.rows = [row(entry.item)];
    return tile;
  }
  if (target.kind === "item") {
    const item = view ? view.items.find((entry) => entry.id === target.itemId) : undefined;
    tile.title = item && view ? routineTileRowLabel(view, item) : ROUTINE_TILE_TEXT.item;
    if (!item || !view) return { ...tile, empty: ROUTINE_TILE_TEXT.nothing };
    const open = !coveringLog(view.logs, item.id, day) && itemDue(view, item.id, day);
    tile.rows = [{ ...row(item), canLog: open }];
    return tile;
  }
  const block = view ? view.blocks.find((entry) => entry.id === target.blockId) : undefined;
  tile.title = block && block.name ? block.name : ROUTINE_TILE_TEXT.routine;
  if (size === "medium") tile.kicker = tile.title;
  const open = block && view ? blockEntries(view, block.id, day) : [];
  tile.rows = open.slice(0, ROUTINE_TILE_ROWS).map(row);
  if (open.length > ROUTINE_TILE_ROWS) tile.more = `${open.length - ROUTINE_TILE_ROWS} more`;
  return tile;
}

/* Whether Home shows Next up by itself: there is at least one item, and it was not removed. */
export function nextUpWanted(store: unknown, layout?: RoutineTileLayout | null): boolean {
  const view = projectRoutineStore(store);
  if (!view || !view.items.length || view.prefs.homeNextHidden === true) return false;
  if (layout && Array.isArray(layout.hidden) && layout.hidden.includes(NEXT_UP_TILE_ID)) return false;
  if (layout && Array.isArray(layout.items) && layout.items.includes(NEXT_UP_TILE_ID)) return false;
  return true;
}

/* Remove from Home, and putting it back. Only the pref is written. */
export function setNextUpHidden(input: unknown, hidden: unknown, clock: RoutineClock): RoutineStore | null {
  const store = start(input, clock, false);
  if (!store) return null;
  const want = hidden === true;
  if ((store.prefs.homeNextHidden === true) === want) return null;
  const prefs = { ...store.prefs, updatedAt: prefStamp(store, clock) };
  if (want) prefs.homeNextHidden = true;
  else delete prefs.homeNextHidden;
  return clean({ ...store, prefs });
}

/* ---------- The tile picker ---------- */

export interface RoutineTrayEntry { id: string; title: string }

/* Titles only. Amounts, units and notes are not searched. */
export function routineTrayEntries(store: unknown, placedIds: unknown, query?: unknown): RoutineTrayEntry[] {
  const view = projectRoutineStore(store);
  const placed = new Set(Array.isArray(placedIds) ? placedIds : []);
  const q = String(query == null ? "" : query).trim().toLowerCase();
  const rows: RoutineTrayEntry[] = [{ id: NEXT_UP_TILE_ID, title: ROUTINE_TILE_TEXT.next }];
  if (view) {
    for (const block of view.blocks) {
      const id = routineBlockTileId(block.id);
      if (id) rows.push({ id, title: block.name || ROUTINE_TILE_TEXT.routine });
    }
    for (const entry of itemsInOrder(view)) {
      const id = routineItemTileId(entry.item.id);
      if (id) rows.push({ id, title: entry.item.name || ROUTINE_TILE_TEXT.item });
    }
  }
  return rows.filter((row) => !placed.has(row.id) && (!q || row.title.toLowerCase().includes(q)));
}

export interface RoutineTileDraft { items: string[]; hidden: string[]; sizes: Record<string, string>; gates: Record<string, TileGate> }

/* Puts a routine tile on the Home draft. There is no stack and no cap on
   how many sit on Home. Removing one later deletes no routine. */
export function addRoutineTile(draft: Partial<RoutineTileDraft> | null | undefined, id: unknown, size?: unknown, gate?: unknown): RoutineTileDraft {
  const next: RoutineTileDraft = {
    items: Array.isArray(draft && draft.items) ? (draft as RoutineTileDraft).items.slice() : [],
    hidden: Array.isArray(draft && draft.hidden) ? (draft as RoutineTileDraft).hidden.slice() : [],
    sizes: draft && draft.sizes && typeof draft.sizes === "object" && !Array.isArray(draft.sizes) ? { ...draft.sizes } : {},
    gates: draft && draft.gates && typeof draft.gates === "object" && !Array.isArray(draft.gates) ? { ...draft.gates } : {},
  };
  if (!isRoutineTileId(id) || next.items.includes(id)) return next;
  const pick = size === "small" || size === "medium" ? size : routineDefaultSize(id);
  next.items.push(id);
  next.hidden = next.hidden.filter((item) => item !== id);
  if (pick === routineDefaultSize(id)) delete next.sizes[id];
  else next.sizes[id] = pick;
  const stored = normalizeTileGate(gate);
  if (stored) next.gates[id] = stored;
  else delete next.gates[id];
  return next;
}

/* ---------- Tapping a tile ---------- */

export interface RoutineJump {
  kind: "next" | "block" | "item"; blockId: string; itemId: string;
  /** The view that holds the target: "routines", or the item's type tab when it sits in no routine. */
  view: string;
}

/* Where a tap on a tile goes. Next up goes to the item that is next. */
export function routineTileJump(store: unknown, tileId: unknown, day: unknown): RoutineJump | null {
  const target = routineTileTarget(tileId);
  const view = projectRoutineStore(store);
  if (!target || !validDay(day)) return null;
  const jump: RoutineJump = { kind: target.kind, blockId: "", itemId: "", view: "routines" };
  if (!view) return jump;
  if (target.kind === "block") return { ...jump, blockId: view.blocks.some((block) => block.id === target.blockId) ? target.blockId : "" };
  const entry = target.kind === "next" ? nextEntry(view, day) : null;
  const itemId = target.kind === "item" ? target.itemId : entry ? entry.item.id : "";
  if (!itemId) return jump;
  const item = view.items.find((row) => row.id === itemId);
  const block = entry && entry.block ? entry.block : blockOf(view, itemId);
  const type = !block && item ? routineItemType(item, view.prefs) : "";
  return { kind: "item", itemId, blockId: block ? block.id : "", view: type || "routines" };
}

/* A folded routine does not draw its rows, and a finished item stays hidden
   until its routine is revealed. This opens the routine that holds the
   target, so the row is there when the tab draws. null when nothing changes. */
export function revealRoutineJump(input: unknown, jump: { blockId?: string; itemId?: string } | null | undefined, clock: RoutineClock): RoutineStore | null {
  const store = start(input, clock);
  const view = store && projectRoutineStore(store);
  if (!store || !view || !jump) return null;
  const held = jump.itemId ? blockOf(view, jump.itemId) : null;
  const blockId = jump.blockId || (held ? held.id : "");
  if (!blockId || !view.blocks.some((block) => block.id === blockId)) return null;
  const list = (value: unknown) => [...new Set((Array.isArray(value) ? value : []).filter((id): id is string => typeof id === "string" && !!id))];
  const collapsed = list(store.prefs.collapsedBlocks);
  const revealed = list(store.prefs.revealBlocks);
  const nextCollapsed = collapsed.filter((id) => id !== blockId);
  const needsReveal = !!(jump.itemId && coveringLog(view.logs, jump.itemId, clock.day));
  const nextRevealed = needsReveal && !revealed.includes(blockId) ? revealed.concat(blockId) : revealed;
  if (nextCollapsed.length === collapsed.length && nextRevealed.length === revealed.length) return null;
  return clean({ ...store, prefs: { ...store.prefs, collapsedBlocks: nextCollapsed, revealBlocks: nextRevealed, updatedAt: prefStamp(store, clock) } });
}
