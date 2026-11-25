import type { Repository } from '@/data/repository';
import { t } from '@/i18n/en';
import { addEntry, cleanLayout, customizeEntry, defaultLayout, moveEntry, removeEntry, restoreEntry, sameOptions, setEntrySize } from './model';
import { tilePage } from './registry';
import type { LayoutEntry, TileOptionValues, TilePageId, TileSize } from './types';

/**
 * Each page's tile layout (which tiles, order, size, style, options), saved on this phone with the owner's other
 * local settings under `tiles-<page>`. Layout only: tile ids and choices, never a health value.
 */
export const tileLayoutKey = (page: TilePageId) => `tiles-${page}`;
const LAYOUT_VERSION = 1;
export type TileStorage = Pick<Repository, 'owner' | 'localGet' | 'localSave'>;

/** Reads a saved layout. Unknown tiles are dropped; a missing, reset or damaged save gives the page's starting layout. */
export function loadTileLayout(storage: TileStorage | null | undefined, page: TilePageId): LayoutEntry[] {
  const cfg = tilePage(page);
  let saved: unknown;
  try { saved = storage?.localGet<unknown>(tileLayoutKey(page)); } catch { saved = undefined; }
  const list = saved && typeof saved === 'object' ? (saved as { tiles?: unknown }).tiles : undefined;
  return Array.isArray(list) ? cleanLayout(cfg, list) : defaultLayout(cfg);
}
/** Saves a layout (null clears it, so the page starts from its defaults again). Throws if the local write fails. */
export function saveTileLayout(storage: TileStorage | null | undefined, page: TilePageId, tiles: readonly LayoutEntry[] | null): void {
  storage?.localSave(tileLayoutKey(page), tiles ? { v: LAYOUT_VERSION, tiles: tiles.map(e => [e.id, e.size, e.style, e.options]) } : null);
}

/* ---------- the shell's toast, with Undo ---------- */
export interface TileToast { (message: string, action?: { label: string; onAction: () => void }): void }
let toast: TileToast = () => {};
/** The shell gives the grid its toast once (message plus an Undo action), like the rest of the app's notices. */
export function configureTileToast(fn: TileToast) { toast = fn; }
/** The toast the shell configured (a no-op until then). */
export const configuredTileToast = (): TileToast => toast;
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m);

/** A change the grid animates once: a tile that just arrived, one that changed size. */
export interface TileFlash { fresh?: string; resized?: string; seq: number }
export interface TileState { tiles: LayoutEntry[]; flash: TileFlash; unsaved: boolean }

export function createTileStore(storage: TileStorage | null | undefined, page: TilePageId) {
  let state: TileState = { tiles: loadTileLayout(storage, page), flash: { seq: 0 }, unsaved: false };
  const listeners = new Set<() => void>();
  const cfg = () => tilePage(page);
  const title = (id: string) => cfg().tiles.find(d => d.id === id)?.title ?? 'Tile';
  const commit = (tiles: LayoutEntry[] | null, flash: Partial<TileFlash> = {}) => {
    const next = tiles ?? defaultLayout(cfg());
    let unsaved = false;
    // The page still shows the change if the local write fails; it is saved again with the next change.
    try { saveTileLayout(storage, page, tiles); } catch { unsaved = true; }
    state = { tiles: next, flash: { ...flash, seq: state.flash.seq + 1 }, unsaved };
    listeners.forEach(l => l());
  };
  const undo = (label: string, run: () => void) => ({ label, onAction: run });
  const api = {
    page,
    getState: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    /** Replaces the order while a drag settles (reading order is kept by the caller). */
    setOrder(tiles: LayoutEntry[]) { commit(tiles); },
    /** Adds a tile from the tray, or updates it when it is already on the page. */
    add(id: string, size?: TileSize, style?: string, options?: TileOptionValues) {
      const was = state.tiles, cur = was.find(s => s.id === id);
      if (cur) {
        const next = addEntry(cfg(), was, id, size, style, options), now = next.find(s => s.id === id);
        if (now && now.size === cur.size && now.style === cur.style && sameOptions(now.options, cur.options)) return;
        commit(next, { resized: id });
        toast(fill(t('tilesUpdated'), { title: title(id) }), undo(t('tilesUndo'), () => commit(was)));
        return;
      }
      commit(addEntry(cfg(), was, id, size, style, options), { fresh: id });
      toast(fill(t('tilesAdded'), { title: title(id) }), undo(t('tilesUndo'), () => commit(removeEntry(state.tiles, id))));
    },
    remove(id: string) {
      const at = state.tiles.findIndex(s => s.id === id); if (at < 0) return;
      const item = state.tiles[at], was = state.tiles;
      commit(removeEntry(state.tiles, id));
      const after = state.tiles;
      // Undo brings back the exact layout when nothing changed since; otherwise the tile goes back to its old place.
      toast(fill(t(cfg().variant === 'home' ? 'tilesBackHome' : 'tilesBack'), { title: title(id) }),
        undo(t('tilesUndo'), () => commit(state.tiles === after ? was : restoreEntry(state.tiles, item, at), { fresh: id })));
    },
    setSize(id: string, size: TileSize) {
      const cur = state.tiles.find(s => s.id === id); if (!cur || cur.size === size) return;
      commit(setEntrySize(cfg(), state.tiles, id, size), { resized: id });
    },
    move(id: string, by: -1 | 1) { commit(moveEntry(state.tiles, id, by)); },
    /** The customize sheet: applied as the person picks, no toast. */
    customize(id: string, pick: { style: string; size: TileSize; options: TileOptionValues }) {
      const cur = state.tiles.find(s => s.id === id); if (!cur) return;
      const next = customizeEntry(cfg(), state.tiles, id, pick);
      commit(next, next.find(s => s.id === id)?.size !== cur.size ? { resized: id } : {});
    },
    reset(withToast = true) {
      const was = state.tiles;
      commit(null);
      if (withToast) toast(fill(t('tilesReset'), { page: cfg().label }), undo(t('tilesUndo'), () => commit(was)));
    },
  };
  return api;
}
export type TileStore = ReturnType<typeof createTileStore>;

const stores = new Map<string, TileStore>();
/** One store per owner and page, so the grid, tray and customize sheet share one state and one writer. */
export function tileStoreFor(storage: TileStorage | null | undefined, page: TilePageId): TileStore {
  const k = `${storage?.owner ?? ''}\u0000${page}`;
  let s = stores.get(k);
  if (!s) { s = createTileStore(storage, page); stores.set(k, s); }
  return s;
}
/** Drops cached stores (sign-out, tests) so the next caller reloads from storage. */
export function resetTileStores(owner?: string) {
  for (const k of [...stores.keys()]) if (owner === undefined || k.startsWith(`${owner}\u0000`)) stores.delete(k);
}

/* ---------- edit mode: one page at a time; the dock turns its plus into Done while a page is editing ---------- */
export interface TileEditState { page: TilePageId | null; customizing: string | null }
let edit: TileEditState = { page: null, customizing: null };
const editListeners = new Set<() => void>();
const setEdit = (next: TileEditState) => { if (next.page === edit.page && next.customizing === edit.customizing) return; edit = next; editListeners.forEach(l => l()); };
export const tileEdit = {
  get: () => edit,
  subscribe(l: () => void) { editListeners.add(l); return () => { editListeners.delete(l); }; },
  /** Turns a page's edit mode on or off. Turning one page on turns any other off (leaving a tab ends its edit mode). */
  set(page: TilePageId, on: boolean) { if (on) setEdit({ page, customizing: null }); else if (edit.page === page) setEdit({ page: null, customizing: null }); },
  /** Ends whichever page is editing (the dock's Done). */
  end() { setEdit({ page: null, customizing: null }); },
  /** The tile shown outlined above the customize sheet. */
  customize(page: TilePageId, id: string | null) { setEdit({ page: id ? page : edit.page, customizing: id }); },
};
