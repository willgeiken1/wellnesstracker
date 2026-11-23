/**
 * Which tiles are on Home, in what order, and which small tiles are full width.
 * Layout only: tile ids, never a health value. Saved on this phone with the owner's other local settings.
 * A routine tile's id names a routine or an item by its row id, never by its name or anything typed.
 */
import { NEXT_UP_TILE_ID, isRoutineTileId, routineDefaultSize } from '@/features/routines/model/home-tiles';

export const HOME_TILES_KEY = 'homeTiles';
/** Full-width sections first, then the small number tiles. This is also the starting order. */
export const TILE_IDS = ['map', 'score', 'week', 'next', 'calories', 'protein', 'volume', 'weight', 'steps', 'sleep', 'active', 'exercise', 'bodyFat', 'water', 'mindful'] as const;
export type TileId = typeof TILE_IDS[number];
/** Next up, one routine, or one item. There are as many of these as the person has routines and items. */
export type RoutineTileId = typeof NEXT_UP_TILE_ID | `routine-block:${string}` | `routine-item:${string}`;
export type HomeTileId = TileId | RoutineTileId;
export const isRoutineTile = (id: unknown): id is RoutineTileId => isRoutineTileId(id);
/** Small tiles are half width unless made wide. The others are always full width. */
export const SMALL_TILES: readonly TileId[] = ['calories', 'protein', 'volume', 'weight', 'steps', 'sleep', 'active', 'exercise', 'bodyFat', 'water', 'mindful'];
export interface HomeTiles { order: HomeTileId[]; wide: HomeTileId[] }
/** Saved layouts carry this, so a tile added to the app later can be put on Home once for layouts saved before it. */
const LAYOUT_VERSION = 2;
export interface TileStorage { localGet<T>(key: string): T | undefined; localSave(key: string, value: unknown): void }

const isTile = (value: unknown): value is HomeTileId => (TILE_IDS as readonly unknown[]).includes(value) || isRoutineTile(value);
const clean = (value: unknown) => Array.isArray(value) ? [...new Set(value.filter(isTile))] : null;
/** A tile that can be half width or full width. A routine tile is one: half width it is a single line, full
 * width it lists what is still open with a button to log each. */
export const isSmall = (id: HomeTileId) => isRoutineTile(id) || (SMALL_TILES as readonly HomeTileId[]).includes(id);
/** Tiles fed by Apple Health. They start off Home and are added when the person connects it. */
export const HEALTH_TILES: readonly TileId[] = ['steps', 'sleep', 'active', 'exercise', 'bodyFat', 'water', 'mindful'];
/** The health tiles an Oura ring can fill. On Android, where Apple Health does not exist, these are the only ones. */
export const RING_TILES: readonly TileId[] = ['steps', 'sleep'];
export const defaultTiles = (): HomeTiles => ({ order: TILE_IDS.filter(id => !HEALTH_TILES.includes(id)), wide: [] });
/** Next up at the top, full width: how Home shows it by itself, before the person has placed or removed it. */
export function withNextUp(tiles: HomeTiles): HomeTiles {
  if (tiles.order.includes(NEXT_UP_TILE_ID)) return tiles;
  return { order: [NEXT_UP_TILE_ID, ...tiles.order], wide: [NEXT_UP_TILE_ID, ...tiles.wide] };
}
/** Puts the health tiles on Home, after whatever is there (all of them unless told which). Tile ids only: no health value is stored. */
export function addHealthTiles(storage: TileStorage | null | undefined, ids: readonly TileId[] = HEALTH_TILES): void {
  const next = ids.reduce(addTile, loadTiles(storage));
  try { saveTiles(storage, next); } catch { /* the tiles can still be added from Edit */ }
}
/** Saves a layout. Throws if the local write fails, so the caller decides what that means. */
export function saveTiles(storage: TileStorage | null | undefined, tiles: HomeTiles): void {
  storage?.localSave(HOME_TILES_KEY, { order: tiles.order, wide: tiles.wide, v: LAYOUT_VERSION });
}
/** The Insight Score switch in Settings and the tile on Home are one state. */
export const scoreOn = (storage: TileStorage | null | undefined) => loadTiles(storage).order.includes('score');
export function setScoreOn(storage: TileStorage | null | undefined, on: boolean): void {
  const tiles = loadTiles(storage);
  saveTiles(storage, on ? withScore(tiles) : removeTile(tiles, 'score'));
}
/** Puts the Score under the map, or first when the map is off Home. */
function withScore(tiles: HomeTiles): HomeTiles {
  if (tiles.order.includes('score')) return tiles;
  const at = tiles.order.indexOf('map') + 1;
  return { ...tiles, order: [...tiles.order.slice(0, at), 'score', ...tiles.order.slice(at)] };
}

/** Reads a saved layout. Unknown ids are dropped and a missing or damaged save gives the starting layout, so Home never breaks. */
export function loadTiles(storage: TileStorage | null | undefined): HomeTiles {
  let saved: unknown;
  try { saved = storage?.localGet<unknown>(HOME_TILES_KEY); } catch { saved = undefined; }
  const order = saved && typeof saved === 'object' ? clean((saved as { order?: unknown }).order) : null;
  if (!order) return defaultTiles();
  const tiles = { order, wide: (clean((saved as { wide?: unknown }).wide) ?? []).filter(isSmall) };
  // A layout saved before the Score existed gets it once; after the next save, removing it sticks.
  return Number((saved as { v?: unknown }).v) >= LAYOUT_VERSION ? tiles : withScore(tiles);
}
export const offHome = (tiles: HomeTiles): TileId[] => TILE_IDS.filter(id => !tiles.order.includes(id));
export function addTile(tiles: HomeTiles, id: HomeTileId): HomeTiles {
  if (tiles.order.includes(id)) return tiles;
  // The Score always comes back under the map, from Edit and from the Settings switch alike.
  if (id === 'score') return withScore(tiles);
  // Next up and a routine start full width, with their rows; one item starts as a half-width line.
  const wide = isRoutineTile(id) && routineDefaultSize(id) === 'medium' ? [...tiles.wide, id] : tiles.wide;
  return { order: [...tiles.order, id], wide };
}
export function removeTile(tiles: HomeTiles, id: HomeTileId): HomeTiles {
  if (!tiles.order.includes(id)) return tiles;
  // A routine tile forgets its width with its place, so it comes back at its starting size.
  return { order: tiles.order.filter(item => item !== id), wide: isRoutineTile(id) ? tiles.wide.filter(item => item !== id) : tiles.wide };
}
/** Moves a tile one place up (-1) or down (1). The ends do nothing. */
export function moveTile(tiles: HomeTiles, id: HomeTileId, by: -1 | 1): HomeTiles {
  const from = tiles.order.indexOf(id), to = from + by;
  if (from < 0 || to < 0 || to >= tiles.order.length) return tiles;
  const order = [...tiles.order];
  [order[from], order[to]] = [order[to], order[from]];
  return { ...tiles, order };
}
export function setWide(tiles: HomeTiles, id: HomeTileId, wide: boolean): HomeTiles {
  if (!isSmall(id) || tiles.wide.includes(id) === wide) return tiles;
  return { ...tiles, wide: wide ? [...tiles.wide, id] : tiles.wide.filter(item => item !== id) };
}
