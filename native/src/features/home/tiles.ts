/**
 * Which tiles are on Home, in what order, and which small tiles are full width.
 * Layout only: tile ids, never a health value. Saved on this phone with the owner's other local settings.
 */
export const HOME_TILES_KEY = 'homeTiles';
/** Full-width sections first, then the small number tiles. This is also the starting order. */
export const TILE_IDS = ['map', 'score', 'week', 'next', 'calories', 'protein', 'volume', 'weight', 'steps', 'sleep', 'active', 'exercise'] as const;
export type TileId = typeof TILE_IDS[number];
/** Small tiles are half width unless made wide. The others are always full width. */
export const SMALL_TILES: readonly TileId[] = ['calories', 'protein', 'volume', 'weight', 'steps', 'sleep', 'active', 'exercise'];
export interface HomeTiles { order: TileId[]; wide: TileId[] }
/** Saved layouts carry this, so a tile added to the app later can be put on Home once for layouts saved before it. */
const LAYOUT_VERSION = 2;
export interface TileStorage { localGet<T>(key: string): T | undefined; localSave(key: string, value: unknown): void }

const isTile = (value: unknown): value is TileId => (TILE_IDS as readonly unknown[]).includes(value);
const clean = (value: unknown) => Array.isArray(value) ? [...new Set(value.filter(isTile))] : null;
export const isSmall = (id: TileId) => SMALL_TILES.includes(id);
/** Tiles fed by Apple Health. They start off Home and are added when the person connects it. */
export const HEALTH_TILES: readonly TileId[] = ['steps', 'sleep', 'active', 'exercise'];
export const defaultTiles = (): HomeTiles => ({ order: TILE_IDS.filter(id => !HEALTH_TILES.includes(id)), wide: [] });
/** Puts the Apple Health tiles on Home, after whatever is there. Tile ids only: no health value is stored. */
export function addHealthTiles(storage: TileStorage | null | undefined): void {
  const next = HEALTH_TILES.reduce(addTile, loadTiles(storage));
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
export function addTile(tiles: HomeTiles, id: TileId): HomeTiles {
  // The Score always comes back under the map, from Edit and from the Settings switch alike.
  return tiles.order.includes(id) ? tiles : id === 'score' ? withScore(tiles) : { ...tiles, order: [...tiles.order, id] };
}
export function removeTile(tiles: HomeTiles, id: TileId): HomeTiles {
  return tiles.order.includes(id) ? { ...tiles, order: tiles.order.filter(item => item !== id) } : tiles;
}
/** Moves a tile one place up (-1) or down (1). The ends do nothing. */
export function moveTile(tiles: HomeTiles, id: TileId, by: -1 | 1): HomeTiles {
  const from = tiles.order.indexOf(id), to = from + by;
  if (from < 0 || to < 0 || to >= tiles.order.length) return tiles;
  const order = [...tiles.order];
  [order[from], order[to]] = [order[to], order[from]];
  return { ...tiles, order };
}
export function setWide(tiles: HomeTiles, id: TileId, wide: boolean): HomeTiles {
  if (!isSmall(id) || tiles.wide.includes(id) === wide) return tiles;
  return { ...tiles, wide: wide ? [...tiles.wide, id] : tiles.wide.filter(item => item !== id) };
}
